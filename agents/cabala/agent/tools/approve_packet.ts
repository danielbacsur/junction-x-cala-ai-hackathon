import { defineTool } from "eve/tools";
import { z } from "zod";

import { getLedger } from "@/agent/lib/ledger";
import { NoOwnerError, ownerOf } from "@/agent/lib/owner";
import { mandateId } from "@/agent/lib/schemas";
import { line } from "@/agent/lib/worklog";

export default defineTool({
  description:
    "Approve exactly one packet version on the customer's word. The customer is shown an approval for that " +
    "version and decides; you never approve for them. An edit after approval makes a new version that needs its " +
    "own approval. Call this only when the customer has asked to approve.",

  inputSchema: z.object({
    mandateId,
    version: z.number().int().min(1).describe("The exact packet version the customer wants to approve."),
  }),

  availableInSubagents: false,

  label: { start: ({ version }) => `Approve packet version ${version}` },

  approval: {
    // The customer is asked on every call, and only about a version that exists and is current.
    async request({ session, toolInput }) {
      if (!toolInput) return { type: "denied", reason: "No packet version was named." };

      try {
        const packet = await getLedger().getPacket(toolInput.mandateId, ownerOf(session), toolInput.version);

        if (packet.status === "superseded") {
          return { type: "denied", reason: `Version ${packet.version} was superseded by a later edit. Approve the latest version.` };
        }

        return packet.status === "approved" ? "not-applicable" : "user-approval";
      } catch (error) {
        return { type: "denied", reason: error instanceof NoOwnerError ? error.message : `No packet version ${toolInput.version} in this mandate.` };
      }
    },

    prompt: ({ input }) =>
      `Approve packet version ${input.version}? Approval covers exactly this version; any later edit needs a new one.`,
  },

  async execute({ mandateId, version }, ctx) {
    const ownerId = ownerOf(ctx.session);
    const ledger = getLedger();
    const packet = await ledger.approvePacket(mandateId, ownerId, version);

    await ledger.setStage(mandateId, ownerId, "delivered");
    await ledger.logWork(mandateId, line("Delivered.", { kind: "stage" }));
    await ledger.logWork(
      mandateId,
      line(`Packet version ${packet.version} for ${packet.candidate.name} approved by the customer`, {
        entity: packet.candidate,
      }),
    );

    return {
      approved: true,
      version: packet.version,
      candidate: packet.candidate.name,
      approvedAt: packet.approvedAt,
      stage: "delivered",
    };
  },
});

import { defineTool } from "eve/tools";
import { z } from "zod";

import { compactPacket } from "@/agent/lib/compact";
import { getLedger } from "@/agent/lib/ledger";
import { ownerOf } from "@/agent/lib/owner";
import { mandateId } from "@/agent/lib/schemas";

export default defineTool({
  description:
    "Get one packet version as it is stored: its sections, including the owner's private notes, its status, and " +
    "the claims that were withheld from it. Read the version before you edit it or answer a question about it.",

  inputSchema: z.object({
    mandateId,
    version: z.number().int().min(1).describe("The packet version to read."),
  }),

  availableInSubagents: false,

  label: { start: ({ version }) => `Read packet version ${version}` },

  async execute({ mandateId, version }, ctx) {
    const ownerId = ownerOf(ctx.session);
    const ledger = getLedger();
    const [packet, mandate] = await Promise.all([
      ledger.getPacket(mandateId, ownerId, version),
      ledger.getMandate(mandateId, ownerId),
    ]);

    return { ...compactPacket(packet, mandate), sections: packet.sections };
  },
});

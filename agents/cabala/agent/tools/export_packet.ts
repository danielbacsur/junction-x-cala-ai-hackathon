import { defineTool } from "eve/tools";
import { z } from "zod";

import { getLedger } from "@/agent/lib/ledger";
import { ownerOf } from "@/agent/lib/owner";
import { mandateId } from "@/agent/lib/schemas";
import { line } from "@/agent/lib/worklog";

/** How much of the file the model is shown. The whole file is the app's to serve. */
const SHOWN = 4_000;

export default defineTool({
  description:
    "Export one packet version as Markdown, without the owner's private notes. The result says whether that " +
    "version is approved and shows the start of the file; a draft may be exported, and you say that it is a " +
    "draft. To read a packet's text in full, use get_packet.",

  inputSchema: z.object({
    mandateId,
    version: z.number().int().min(1).describe("The packet version to export."),
  }),

  availableInSubagents: false,

  label: { start: ({ version }) => `Export packet version ${version}` },

  async execute({ mandateId, version }, ctx) {
    const ownerId = ownerOf(ctx.session);
    const ledger = getLedger();
    const packet = await ledger.getPacket(mandateId, ownerId, version);
    const markdown = await ledger.exportPacket(mandateId, ownerId, version);

    await ledger.logWork(
      mandateId,
      line(`Packet version ${version} for ${packet.candidate.name} exported as Markdown`, { entity: packet.candidate }),
    );

    return {
      version,
      candidate: packet.candidate.name,
      status: packet.status,
      approvedAt: packet.approvedAt,
      characters: markdown.length,
      start: markdown.slice(0, SHOWN),
    };
  },
});

import { defineTool } from "eve/tools";
import { z } from "zod";

import { compactBook, compactPacket } from "@/agent/lib/compact";
import { getLedger } from "@/agent/lib/ledger";
import { ownerOf } from "@/agent/lib/owner";
import { mandateId } from "@/agent/lib/schemas";

export default defineTool({
  description:
    "Read the mandate's Book as the ledger holds it now: the ranked candidates with the reason to meet each, " +
    "their category, best trail, fit lines and unknowns; coverage; gaps; the packet versions; and the statement " +
    "of work with actual counts. Read it before you say anything about the list.",

  inputSchema: z.object({
    mandateId,
    limit: z.number().int().min(1).max(40).optional().describe("Rows to return from the top. Defaults to 12."),
  }),

  availableInSubagents: false,

  label: { start: () => "Read the list" },

  async execute({ mandateId, limit = 12 }, ctx) {
    const ownerId = ownerOf(ctx.session);
    const ledger = getLedger();
    const [book, packets, statement] = await Promise.all([
      ledger.readBook(mandateId, ownerId),
      ledger.listPackets(mandateId, ownerId),
      ledger.getStatement(mandateId, ownerId),
    ]);
    const { rows, ...rest } = compactBook(book);

    return {
      ...rest,
      rows: rows.slice(0, limit),
      rowsNotShown: Math.max(0, rows.length - limit),
      packets: packets.map((packet) => compactPacket(packet, book.mandate)),
      statement,
    };
  },
});

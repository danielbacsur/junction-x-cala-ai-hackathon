import { defineTool } from "eve/tools";
import { z } from "zod";

import { compactBook } from "@/agent/lib/compact";
import { getLedger } from "@/agent/lib/ledger";
import { ownerOf } from "@/agent/lib/owner";
import { constraints, mandateId } from "@/agent/lib/schemas";
import { line } from "@/agent/lib/worklog";

export default defineTool({
  description:
    "Change the mandate's constraints after the scope was confirmed, when the customer corrects or narrows it. " +
    "Pass the complete constraints, not only what changed. The ledger reranks the list from stored evidence " +
    "without new reads and raises the revision; packets built earlier then rest on older criteria.",

  inputSchema: z.object({ mandateId, constraints }),

  availableInSubagents: false,

  label: { start: () => "Rerank the list" },

  async execute({ mandateId, constraints }, ctx) {
    const ownerId = ownerOf(ctx.session);
    const ledger = getLedger();
    const book = await ledger.setConstraints(mandateId, ownerId, constraints);

    await ledger.logWork(
      mandateId,
      line(`Constraints changed by the customer; Book reranked for revision ${book.mandate.revision}`),
    );

    const { rows, ...rest } = compactBook(book);

    return {
      ...rest,
      rows: rows.slice(0, 12),
      rowsNotShown: Math.max(0, rows.length - 12),
      note: "Reranked from stored evidence; nothing new was read. Packets from earlier revisions need a new version and a new approval.",
    };
  },
});

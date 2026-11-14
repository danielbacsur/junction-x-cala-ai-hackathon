import { defineTool } from "eve/tools";
import { z } from "zod";

import { compactTrail } from "@/agent/lib/compact";
import { getLedger } from "@/agent/lib/ledger";
import { ownerOf } from "@/agent/lib/owner";
import { candidateId, mandateId } from "@/agent/lib/schemas";

export default defineTool({
  description:
    "Get the stored trails from the mandate's subject to one candidate. Each trail lists its hops in order, " +
    "says for each hop what may be said about it and from which sources, carries the dated signal at its end, " +
    "and shows your stored conclusion if there is one. Reading stored trails costs nothing. Set readMore only " +
    "when the customer asks to dig into this candidate: the ledger then spends up to five requests to Cala on " +
    "the candidate and its rounds, which can settle an undirected tie, and reranks the Book.",

  inputSchema: z.object({
    mandateId,
    candidateId,
    readMore: z.boolean().optional().describe("Spend up to five live reads around the candidate first."),
  }),

  availableInSubagents: false,

  label: { start: ({ readMore }) => (readMore ? "Read more around the candidate" : "Read the trails") },

  async execute({ mandateId, candidateId, readMore }, ctx) {
    const ownerId = ownerOf(ctx.session);
    const ledger = getLedger();
    const read = readMore ? await ledger.readAround(mandateId, ownerId, candidateId) : null;
    const trails = await ledger.getTrails(mandateId, ownerId, candidateId);

    return {
      candidateId,
      ...(read && {
        read: { requestsToCala: read.requestsUsed, partial: read.partial, gaps: read.gaps, bookRows: read.rows },
      }),
      trails: trails.map(compactTrail),
      ...(trails.length === 0 && {
        note: "No trail to this candidate is stored. It is a direct fit only, or the connection has not been read.",
      }),
    };
  },
});

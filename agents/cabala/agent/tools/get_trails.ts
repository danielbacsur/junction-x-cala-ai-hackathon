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
    "and shows your stored conclusion if there is one. The ledger may spend up to five live reads.",

  inputSchema: z.object({ mandateId, candidateId }),

  availableInSubagents: false,

  label: { start: () => "Read the trails" },

  async execute({ mandateId, candidateId }, ctx) {
    const trails = await getLedger().getTrails(mandateId, ownerOf(ctx.session), candidateId);

    return {
      candidateId,
      trails: trails.map(compactTrail),
      ...(trails.length === 0 && {
        note: "No trail to this candidate is stored. It is a direct fit only, or the connection has not been read.",
      }),
    };
  },
});

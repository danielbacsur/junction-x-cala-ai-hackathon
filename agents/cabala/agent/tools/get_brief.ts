import { defineTool } from "eve/tools";
import { z } from "zod";

import { compactBrief } from "@/agent/lib/compact";
import { getLedger } from "@/agent/lib/ledger";
import { ownerOf } from "@/agent/lib/owner";
import { candidateId, mandateId } from "@/agent/lib/schemas";

export default defineTool({
  description:
    "Get the full brief for one candidate: why meet and why hesitate, each line marked observed, inferred, " +
    "unknown or self_reported; the trails; the candidate's own signals; owners and parents already in a stored " +
    "read; questions; what is still unknown; and how much was read. Fails when the evidence carries no brief.",

  inputSchema: z.object({ mandateId, candidateId }),

  availableInSubagents: false,

  label: { start: () => "Read the brief" },

  async execute({ mandateId, candidateId }, ctx) {
    return compactBrief(await getLedger().getBrief(mandateId, ownerOf(ctx.session), candidateId));
  },
});

import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

import { ownerOf } from "@/agent/lib/owner";
import { checkAndSave, writeSections } from "@/agent/lib/packet";
import { candidateId, mandateId } from "@/agent/lib/schemas";
import { loadBundle } from "@/agent/lib/steps";

export default defineWorkflowTool({
  description:
    "Build the meeting packet for one candidate the customer selected. In one run it takes the candidate's " +
    "evidence bundle from the ledger, has you write the sections from that bundle alone, runs the ledger's " +
    "deterministic checks and then a second read, removes every sentence either one withheld, and saves the rest " +
    "as a new draft version. It returns the saved sections, what was withheld and why, and what the second read " +
    "still asks. It takes a minute or two. The draft is not approved; approval is the customer's.",

  inputSchema: z.object({
    mandateId,
    candidateId,
    guidance: z
      .string()
      .optional()
      .describe("What the customer asked for in this packet, such as an angle for the agenda. Wishes, not facts."),
  }),

  availableInSubagents: false,

  label: { start: () => "Build the packet" },

  async execute({ mandateId, candidateId, guidance }, ctx) {
    "use workflow";

    const ownerId = ownerOf(ctx.session);
    const bundle = await loadBundle(mandateId, ownerId, candidateId);
    const draft = await writeSections(ctx, bundle, guidance);

    return await checkAndSave(ctx, { mandateId, ownerId, bundle, sections: { ...draft, privateNotes: "" } });
  },
});

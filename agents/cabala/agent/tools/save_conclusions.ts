import { defineTool } from "eve/tools";
import { z } from "zod";

import { getLedger } from "@/agent/lib/ledger";
import { lintConclusion } from "@/agent/lib/lint";
import { ownerOf } from "@/agent/lib/owner";
import { candidateId, conclusion, mandateId } from "@/agent/lib/schemas";
import { line } from "@/agent/lib/worklog";

export default defineTool({
  description:
    "Store your conclusion for each trail to one candidate, so the Book shows it beside the trail. A conclusion " +
    "is always Inferred: one reading, the hops it rests on, what it does not prove, and what to ask. One that " +
    "promises an introduction, asserts appetite, claims causation, gives a programme ceiling as a contract value " +
    "or words an undirected tie as funding is sent back with the rule it broke; rewrite it and store it again.",

  inputSchema: z.object({
    mandateId,
    candidateId,
    conclusions: z.array(conclusion).min(1).describe("One conclusion per trail to this candidate."),
    bookReady: z
      .boolean()
      .optional()
      .describe("True on the last call, when every trail you will show has its conclusion. Marks the Book ready."),
  }),

  availableInSubagents: false,

  label: { start: ({ conclusions }) => `Store ${conclusions.length === 1 ? "a conclusion" : `${conclusions.length} conclusions`}` },

  async execute({ mandateId, candidateId, conclusions, bookReady }, ctx) {
    const ownerId = ownerOf(ctx.session);
    const ledger = getLedger();
    const trails = new Map((await ledger.getTrails(mandateId, ownerId, candidateId)).map((trail) => [trail.id, trail]));
    const unknownTrails = conclusions.filter((each) => !trails.has(each.trailId)).map((each) => each.trailId);
    const sentBack = conclusions.flatMap((each) => {
      const trail = trails.get(each.trailId);

      return trail ? lintConclusion(each, trail) : [];
    });
    const refused = new Set([...unknownTrails, ...sentBack.map((objection) => objection.trailId)]);
    const accepted = conclusions.filter((each) => !refused.has(each.trailId));

    if (accepted.length > 0) {
      await ledger.saveConclusions(mandateId, ownerId, accepted);
      await ledger.logWork(
        mandateId,
        line(accepted.length === 1 ? "Conclusion stored for one trail" : `Conclusions stored for ${accepted.length} trails`),
      );
    }

    const ready = bookReady === true && refused.size === 0;

    if (ready) {
      await ledger.setStage(mandateId, ownerId, "ready");
      await ledger.logWork(mandateId, line("Ready for your decision.", { kind: "stage" }));
    }

    return {
      stored: accepted.map((each) => each.trailId),
      sentBack,
      unknownTrails,
      ...(ready && { stage: "ready" }),
      ...(bookReady === true && !ready && { note: "The Book is not marked ready: fix what was sent back first." }),
    };
  },
});

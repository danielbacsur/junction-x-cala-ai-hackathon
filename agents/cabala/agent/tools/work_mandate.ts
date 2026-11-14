import { defineWorkflowTool } from "eve/tools";
import { sleep } from "eve/workflow";
import { z } from "zod";

import { ownerOf } from "@/agent/lib/owner";
import { mandateId } from "@/agent/lib/schemas";
import { endPass, latestWork, loadProposals, logChoices, runPass } from "@/agent/lib/steps";

/** A first pass may spend at most six of its requests on signal probes (consensus point 11). */
const PROBES = 6;

/** How often the work log is read for progress while the ledger works. */
const PROGRESS_EVERY_MS = 4_000;

export default defineWorkflowTool({
  description:
    "Work a confirmed mandate: one bounded research pass by the ledger, which reads Cala within the request " +
    "budget, finds the trails and ranks the Book. It runs as a task, so you can keep talking while it works. " +
    "Call it first with the mandate ID alone to get the neighbours the ledger proposes for a signal probe. Then " +
    "call it again with your choice of at most six, each with the reason it matters for this mandate, or with an " +
    "empty list to run without probes. The result is an account of what was reached and what was not.",

  inputSchema: z.object({
    mandateId,
    probes: z
      .array(
        z.object({
          entityId: z.string().min(1).describe("A Cala entity ID from the ledger's proposals."),
          reason: z.string().min(1).describe("Why this neighbour deserves a probe for this mandate. One sentence; it is logged."),
        }),
      )
      .max(PROBES)
      .optional()
      .describe("Your choice among the ledger's proposals. Omit it to see the proposals first."),
  }),

  availableInSubagents: false,

  label: { start: ({ probes }) => (probes ? "Work the mandate" : "Ask the ledger what to probe") },

  async *task({ mandateId, probes }, ctx) {
    "use workflow";

    const ownerId = ownerOf(ctx.session);
    const proposals = await loadProposals(mandateId, ownerId);

    if (!probes && proposals.length > 0) {
      return {
        status: "choose_probes",
        proposals: proposals.map(({ entity, reason, alreadyProbedAt }) => ({
          entityId: entity.id,
          name: entity.name,
          reason,
          alreadyProbedAt,
        })),
        next:
          `Choose at most ${PROBES} of these for a signal probe and call work_mandate again with them and your ` +
          "reason for each. One already probed is answered from the store. Pass an empty list to run without probes.",
      };
    }

    const chosen = (probes ?? []).flatMap(({ entityId, reason }) => {
      const proposal = proposals.find((each) => each.entity.id === entityId);

      return proposal ? [{ entity: proposal.entity, reason }] : [];
    });
    const notProposed = (probes ?? []).map((each) => each.entityId).filter((id) => !chosen.some((each) => each.entity.id === id));

    await logChoices(mandateId, chosen, ctx.callId);

    yield { status: "researching", latest: [] as string[] };

    const pass = runPass(
      mandateId,
      ownerId,
      chosen.map((each) => each.entity.id),
      ctx.abortSignal,
    );
    let cursor: string | null = null;

    // The ledger writes the work log as it goes; its newest lines are this call's progress.
    for (;;) {
      const finished = await Promise.race([pass.then(() => true), sleep(PROGRESS_EVERY_MS).then(() => false)]);
      const progress = await latestWork(mandateId, ownerId, cursor);

      cursor = progress.cursor;

      if (progress.count > 0) yield { status: "researching", latest: progress.lines };
      if (finished) break;
    }

    const result = await pass;
    const { hasTrails, ...closing } = await endPass(
      mandateId,
      ownerId,
      { chosen: chosen.map((each) => each.entity.id), unavailable: result.unavailable },
      ctx.callId,
    );

    return {
      status: result.unavailable ? "cala_unavailable" : result.partial ? "partial" : "finished",
      requestsToCala: result.requestsUsed,
      trailsFound: result.trailsFound,
      bookRows: result.rows,
      probesChosen: chosen.map((each) => each.entity.name),
      ...(notProposed.length > 0 && { ignoredBecauseNotProposed: notProposed }),
      gaps: result.unavailable ? [result.unavailable, ...result.gaps] : result.gaps,
      ...closing,
      next: hasTrails
        ? "Read the Book, read the trails of the candidates you will present, and store a conclusion for each trail."
        : "The Book holds no trail. Read it and tell the customer plainly what is missing; do not fill the gap.",
    };
  },
});

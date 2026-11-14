import { defineTool } from "eve/tools";
import { z } from "zod";

import { compactSignal } from "@/agent/lib/compact";
import { getLedger } from "@/agent/lib/ledger";
import { ownerOf } from "@/agent/lib/owner";
import { mandateId } from "@/agent/lib/schemas";

export default defineTool({
  description:
    "Check named entities for signals: dated, sourced grants, financings, agreements and filed events. The ledger " +
    "answers from the store and runs signal probes inside the mandate's probe budget; a probe takes up to a " +
    "minute. An entity with nothing found is reported as none found on a date, never as having none.",

  inputSchema: z.object({
    mandateId,
    entityIds: z.array(z.string().min(1)).min(1).max(6).describe("Cala entity IDs from the Book or a trail."),
  }),

  availableInSubagents: false,

  label: { start: ({ entityIds }) => `Ask Cala about ${entityIds.length === 1 ? "one entity" : `${entityIds.length} entities`}` },

  async execute({ mandateId, entityIds }, ctx) {
    const ownerId = ownerOf(ctx.session);
    const ledger = getLedger();
    const signals = await ledger.checkSignals(mandateId, ownerId, entityIds);
    const coverage = await ledger.getCoverage();
    const today = new Date().toISOString().slice(0, 10);
    const empty = entityIds.filter((id) => !signals.some((signal) => signal.entity.id === id));

    return {
      signals: signals.map(compactSignal),
      noneFound: empty.map((entityId) => ({
        entityId,
        say:
          coverage.cala === "answering"
            ? `None found by Cala on ${today}. That is not evidence that none exist.`
            : "Nothing is stored and Cala is not answering, so no probe ran. Unknown, not none.",
      })),
    };
  },
});

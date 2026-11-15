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
    "minute. The result holds the signals now stored for each entity and the ledger's own log lines about what " +
    "it asked. An entity with nothing found is reported as none found on a date, never as having none.",

  inputSchema: z.object({
    mandateId,
    entityIds: z.array(z.string().min(1)).min(1).max(6).describe("Cala entity IDs from the list or a trail."),
  }),

  availableInSubagents: false,

  label: { start: ({ entityIds }) => `Ask Cala about ${entityIds.length === 1 ? "one entity" : `${entityIds.length} entities`}` },

  async execute({ mandateId, entityIds }, ctx) {
    const ownerId = ownerOf(ctx.session);
    const ledger = getLedger();
    const before = (await ledger.listWorkEvents(mandateId, ownerId)).at(-1)?.id;
    const signals = await ledger.checkSignals(mandateId, ownerId, entityIds);

    // Whether Cala was asked, answered from the store or could not be reached is in the lines the
    // ledger logged during the call; the signals alone do not say.
    const logged = (await ledger.listWorkEvents(mandateId, ownerId, before))
      .filter((event) => ["probe", "queued", "outage", "gap"].includes(event.kind))
      .map((event) => event.message);

    return {
      signals: signals.map(compactSignal),
      withoutSignals: entityIds.filter((id) => !signals.some((signal) => signal.entity.id === id)),
      ledgerLog: logged,
      note:
        "For an entity without signals, say what the ledger's log says: none found by Cala on that date, or not " +
        "asked. Neither means that none exist.",
    };
  },
});

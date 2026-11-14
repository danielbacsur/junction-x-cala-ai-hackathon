import type { EntityRef, Statement, WithheldClaim, WorkEvent, WorkEventKind } from "../contract";
import type { Db } from "../db";
import { iso, lockMandate, ownedMandate, type Research } from "./mandates";

/** A line for the work log. */
export type WorkEventInput = Omit<WorkEvent, "id" | "mandateId" | "at"> & {
  /**
   * Names the step that writes the line, such as "stage:researching". A retry with the same key
   * returns the line already written. Without a key every call appends a line.
   */
  key?: string;
};

type WorkEventRow = {
  id: number | bigint | string;
  mandate_id: string;
  at: Date | string;
  kind: WorkEventKind;
  message: string;
  seconds: number | null;
  entity: EntityRef | null;
  from_store: boolean;
};

const KINDS: WorkEventKind[] = [
  "stage",
  "read",
  "probe",
  "trail",
  "book",
  "withheld",
  "queued",
  "outage",
  "gap",
  "note",
];

function toWorkEvent(row: WorkEventRow): WorkEvent {
  return {
    id: String(row.id),
    mandateId: row.mandate_id,
    at: iso(row.at),
    kind: row.kind,
    message: row.message,
    seconds: row.seconds,
    entity: row.entity,
    fromStore: row.from_store,
  };
}

/** Two withheld claims are the same claim when their sentences read the same. */
export function claimKey(claim: Pick<WithheldClaim, "sentence">) {
  return claim.sentence.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Writes one line. The caller holds the mandate's row, so IDs within a mandate go up in the order
 * the lines commit and a reader polling with afterId never skips one that commits late.
 */
export async function appendEvent(
  tx: Db,
  mandateId: string,
  event: WorkEventInput,
  packetVersion: number | null = null,
): Promise<WorkEvent> {
  if (!KINDS.includes(event.kind)) throw new Error(`Unknown work event kind "${event.kind}".`);

  const [row] = await tx.query<WorkEventRow>(
    `insert into work_events (mandate_id, kind, message, seconds, entity, from_store, key, packet_version)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
     returning *`,
    [
      mandateId,
      event.kind,
      event.message,
      typeof event.seconds === "number" && Number.isFinite(event.seconds) ? event.seconds : null,
      event.entity ? JSON.stringify(event.entity) : null,
      event.fromStore === true,
      event.key ?? null,
      packetVersion,
    ],
  );

  return toWorkEvent(row);
}

export function createWorkLog(db: Db, research: Research) {
  return {
    /** Written by trusted code, so there is no owner to check; an unknown mandate is refused. */
    logWork(mandateId: string, event: WorkEventInput): Promise<WorkEvent> {
      return db.transaction(async (tx) => {
        await lockMandate(tx, mandateId);

        if (event.key) {
          const [written] = await tx.query<WorkEventRow>(
            "select * from work_events where mandate_id = $1 and key = $2",
            [mandateId, event.key],
          );

          if (written) return toWorkEvent(written);
        }

        return appendEvent(tx, mandateId, event);
      });
    },

    /** The log in the order it was written. With afterId, only the lines written after that one. */
    async listWorkEvents(mandateId: string, ownerId: string, afterId?: string): Promise<WorkEvent[]> {
      await ownedMandate(db, mandateId, ownerId);

      const after = afterId && /^\d{1,18}$/.test(afterId) ? afterId : "0";

      const rows = await db.query<WorkEventRow>(
        "select * from work_events where mandate_id = $1 and id > $2::bigint order by id",
        [mandateId, after],
      );

      return rows.map(toWorkEvent);
    },

    /**
     * Counted, never estimated. Reads and probes are the log's lines that went to Cala, and
     * servedFromStore the ones the store answered instead. Withheld claims are the distinct
     * sentences withheld from the mandate's packet versions, plus one for each `withheld` line
     * that other trusted code logged.
     */
    async getStatement(mandateId: string, ownerId: string): Promise<Statement> {
      await ownedMandate(db, mandateId, ownerId);

      const [log] = await db.query<{ reads: number; probes: number; store: number; withheld: number }>(
        `select
           (count(*) filter (where kind = 'read' and not from_store))::int as reads,
           (count(*) filter (where kind = 'probe' and not from_store and seconds is not null))::int as probes,
           (count(*) filter (where kind in ('read', 'probe') and from_store))::int as store,
           (count(*) filter (where kind = 'withheld' and packet_version is null))::int as withheld
         from work_events
         where mandate_id = $1`,
        [mandateId],
      );

      const packets = await db.query<{ withheld: WithheldClaim[] }>(
        "select withheld from packets where mandate_id = $1",
        [mandateId],
      );

      const inPackets = new Set(packets.flatMap((packet) => packet.withheld.map(claimKey)));
      const evidence = await research.evidenceCounts(mandateId);

      return {
        reads: log.reads,
        probes: log.probes,
        sourcesCited: evidence.sources,
        trailsFound: evidence.trails,
        claimsWithheld: log.withheld + inPackets.size,
        servedFromStore: log.store,
      };
    },
  };
}

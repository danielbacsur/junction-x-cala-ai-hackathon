import type { RawResponse, RawStore } from "../cala/contract";
import type { Db } from "../db";
import { iso, json } from "./sql";

/** Where a stored response came from when it was not fetched by the live client. */
export type Provenance = {
  /** The fixture file, relative to the fixtures folder. */
  fixture: string;
  note?: string;
  /** True when the request was not saved with the response and is our reconstruction. */
  requestReconstructed?: boolean;
  /** True when the fetch time was not saved and is an estimate. */
  fetchedAtApproximate?: boolean;
};

type RawRow = {
  id: string;
  request: RawResponse["request"];
  status: number;
  fetched_at: unknown;
  seconds: number;
  body: unknown;
};

/** The first argument of the advisory lock that serializes reservations for one key. */
const QUOTA_LOCK = 20261114;

/** Stores a response once. The same request fetched again at another time adds a row. */
export async function putRaw(db: Db, response: RawResponse, provenance?: Provenance | null): Promise<void> {
  await db.query(
    `insert into raw_responses (id, fetched_at, request, kind, entity_id, status, seconds, body, provenance)
     values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
     on conflict (id, fetched_at) do nothing`,
    [
      response.id,
      response.fetchedAt,
      json(response.request),
      response.request.kind,
      response.request.kind === "entity" ? response.request.entityId : null,
      response.status,
      response.seconds,
      json(response.body),
      provenance ? json(provenance) : null,
    ],
  );
}

/** The newest stored answer to a request, marked as served from the store. */
export async function getRaw(db: Db, id: string): Promise<RawResponse | null> {
  const [row] = await db.query<RawRow>(
    `select id, request, status, fetched_at, seconds, body from raw_responses
     where id = $1 order by fetched_at desc limit 1`,
    [id],
  );

  if (!row) return null;

  return {
    id: row.id,
    request: row.request,
    status: row.status,
    fetchedAt: iso(row.fetched_at)!,
    seconds: row.seconds,
    body: row.body,
    fromStore: true,
  };
}

/** The Postgres RawStore the live Cala client uses, including atomic pacing reservations and the outage latch. */
export function createRawStore(db: Db): RawStore {
  return {
    get: (id) => getRaw(db, id),

    put: (response) => putRaw(db, response),

    async getLatch() {
      const [row] = await db.query<{ latched: boolean; since: unknown; reason: string | null }>(
        "select latched, since, reason from cala_latch",
      );

      return { latched: row?.latched ?? false, since: iso(row?.since), reason: row?.reason ?? null };
    },

    async setLatch(latch) {
      // `since` moves only when the state changes, so a repeated refusal keeps the first time.
      await db.query(
        `update cala_latch set
           since = case when latched is distinct from $1 or since is null then clock_timestamp() else since end,
           latched = $1,
           reason = $2,
           checked_at = clock_timestamp()`,
        [latch.latched, latch.reason],
      );
    },

    async reserve(keyIndex, minGapMs, perMinute) {
      return db.transaction(async (tx) => {
        // One reservation at a time per key, across processes, so two callers never get one slot.
        await tx.query("select pg_advisory_xact_lock($1::integer, $2::integer)", [QUOTA_LOCK, keyIndex]);

        const [row] = await tx.query<{ wait_ms: number }>(
          `with recent as (
             select start_at, row_number() over (order by start_at desc) as position
             from quota_ledger
             where key_index = $1 and start_at > clock_timestamp() - interval '10 minutes'
           ),
           next as (
             select greatest(
               clock_timestamp(),
               (select max(start_at) from recent) + $2::double precision * interval '1 millisecond',
               (select start_at from recent where position = $3) + interval '60001 milliseconds'
             ) as start_at
           ),
           reserved as (
             insert into quota_ledger (key_index, start_at) select $1, start_at from next returning start_at
           )
           select (extract(epoch from (start_at - clock_timestamp())) * 1000)::double precision as wait_ms
           from reserved`,
          [keyIndex, minGapMs, perMinute],
        );

        return Math.max(0, Math.ceil(row?.wait_ms ?? 0));
      });
    },

    async recentStarts() {
      const [row] = await db.query<{ starts: number }>(
        `select count(*)::integer as starts from quota_ledger
         where start_at > clock_timestamp() - interval '60 seconds' and start_at <= clock_timestamp()`,
      );

      return row?.starts ?? 0;
    },
  };
}

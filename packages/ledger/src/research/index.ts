import type { CalaClient, RawResponse } from "../cala/contract";
import {
  type AgreementExtractor,
  type Book,
  type EntityMatch,
  type EntityRef,
  type Ledger,
  type Mandate,
  NotFoundError,
  type WorkResult,
} from "../contract";
import type { Db } from "../db";
import { bookRows, rankMandate } from "./book";
import { type IngestInput, ingestResponse } from "./ingest";
import { readAgreements } from "./probes";
import { briefFor, coverage, dossier, entityRow, refOf, searchStore, trailsFor } from "./read";
import { starRequest } from "./requests";
import { ensureDerived } from "./rules";
import { json } from "./sql";
import { createWorker } from "./work";

export type { IngestInput } from "./ingest";
export type { Provenance } from "./raw";
export { createRawStore } from "./raw";
export { confirmIdentity, WINDOW_MONTHS } from "./rules";

export type Research = Pick<
  Ledger,
  | "findEntity"
  | "getDossier"
  | "getCoverage"
  | "workMandate"
  | "proposeProbes"
  | "checkSignals"
  | "readBook"
  | "getTrails"
  | "getBrief"
  | "saveConclusions"
> & {
  continueMandate(mandateId: string, ownerId: string, budget: number): Promise<WorkResult>;
  /** Reranks the mandate's stored candidates under its current constraints and revision. */
  rank(mandate: Mandate): Promise<void>;
  entityRef(entityId: string): Promise<EntityRef>;
  /** Stores one raw response and everything derived from it. Safe to repeat. */
  ingest(response: RawResponse): Promise<void>;
  /** For the statement of work: the trails logged for the mandate and the documents they cite. */
  evidenceCounts(mandateId: string): Promise<{ trails: number; sources: number }>;
  /**
   * A trail action: at most five new requests around one entity of the mandate, then a rerank
   * from the store. getTrails itself never fetches, so a page can call it freely; this is the
   * part of the `get_trails` tool that may spend requests.
   */
  readAround(mandateId: string, ownerId: string, entityId: string): Promise<WorkResult>;
};

export function createResearch(deps: {
  db: Db;
  cala: CalaClient;
  mandates: Pick<Ledger, "getMandate" | "logWork" | "setStage">;
  extractAgreements: AgreementExtractor;
  /** The clock, replaceable so tests keep the signal window where the fixtures are. */
  now?: () => Date;
}): Research {
  const { db, cala, mandates } = deps;
  const now = deps.now ?? (() => new Date());
  const worker = createWorker({ db, cala, mandates, extractAgreements: deps.extractAgreements, now });

  async function ingest(response: RawResponse): Promise<void> {
    const input = response as IngestInput;

    await ingestResponse(db, input);

    if (input.request.kind !== "knowledge_search") return;

    // The answer is stored as reported either way. Reading it for agreements is one model call,
    // made once; when that fails the claims stay as they are and the next ingest tries again.
    try {
      await readAgreements(db, input.id, deps.extractAgreements);
    } catch {
      // Nothing to undo: an unread probe is a valid state.
    }
  }

  return {
    ingest,

    async rank(mandate) {
      await rankMandate(db, mandate, now());
    },

    async entityRef(entityId) {
      const stored = await entityRow(db, entityId);

      if (stored) return refOf(stored);

      // An ID the store has never seen: one read, which the mandate's first pass then reuses.
      try {
        await ingest(await cala.request(starRequest(entityId), { priority: "customer" }));
      } catch {
        throw new NotFoundError("This entity is not in the store, and Cala did not return it.");
      }

      const read = await entityRow(db, entityId);

      if (!read) throw new NotFoundError("Cala has no entity with this ID.");

      return refOf(read);
    },

    async findEntity(name, options = {}) {
      const limit = options.limit ?? 10;
      const { matches, close } = await searchStore(db, name, { ...options, limit });

      if (close || matches.length >= limit) return matches;

      // Nothing in the store starts with these words, so Cala is asked, while it is answering.
      try {
        const response = await cala.request(
          { kind: "search_entities", name, ...(options.types?.length ? { types: options.types } : {}), limit },
          { priority: "customer" },
        );

        await ingest(response);

        const found = ((response.body as { entities?: { id: string }[] } | null)?.entities ?? []).map((one) => one.id);
        const known = new Set(matches.map((match) => match.id));
        const rows = await db.query<{
          id: string;
          name: string;
          entity_type: string;
          description: string | null;
          read_kind: string | null;
          attendee: boolean;
        }>(
          `select e.id, e.name, e.entity_type, e.description, e.read_kind,
                  exists (select 1 from roster where roster.entity_id = e.id and roster.role = 'ATTENDEE') as attendee
           from entities e where e.id in (select jsonb_array_elements_text($1::jsonb))`,
          [json(found.filter((id) => !known.has(id)))],
        );
        const byId = new Map(rows.map((row) => [row.id, row]));
        const fromCala: EntityMatch[] = [];

        // Cala's own order is kept: it ranks by how well the name matches.
        for (const id of found) {
          const row = byId.get(id);

          if (!row) continue;

          fromCala.push({
            ...refOf(row),
            stored: row.read_kind === "star" || row.read_kind === "person",
            slushAttendee: row.attendee,
          });
        }

        return [...matches, ...fromCala].slice(0, limit);
      } catch {
        // Latched, over budget or failed: the store's answer stands.
        return matches;
      }
    },

    async getDossier(entityId) {
      await ensureDerived(db, now());

      return dossier(db, entityId);
    },

    async getCoverage() {
      await ensureDerived(db, now());

      return coverage(db);
    },

    workMandate: worker.workMandate,
    continueMandate: worker.continueMandate,
    proposeProbes: worker.proposeProbes,
    checkSignals: worker.checkSignals,
    readAround: worker.readAround,

    async readBook(mandateId, ownerId): Promise<Book> {
      const mandate = await mandates.getMandate(mandateId, ownerId);
      const [run] = await db.query<{ gaps: string[] }>(
        "select gaps from book_runs where mandate_id = $1 and revision = $2",
        [mandateId, mandate.revision],
      );

      // A revision nobody has ranked yet, such as right after a constraint change, is ranked
      // from the store on first read. No request is made.
      const ranked = run ? null : await rankMandate(db, mandate, now());
      const [pass] = await db.query<{ gaps: string[] }>("select gaps from mandate_gaps where mandate_id = $1", [mandateId]);

      return {
        mandate,
        rows: await bookRows(db, mandate),
        coverage: await coverage(db),
        gaps: [...new Set([...(pass?.gaps ?? []), ...(run?.gaps ?? ranked?.gaps ?? [])])],
      };
    },

    async getTrails(mandateId, ownerId, candidateId) {
      return trailsFor(db, await mandates.getMandate(mandateId, ownerId), candidateId);
    },

    async getBrief(mandateId, ownerId, candidateId) {
      return briefFor(db, await mandates.getMandate(mandateId, ownerId), candidateId);
    },

    async saveConclusions(mandateId, ownerId, conclusions) {
      const mandate = await mandates.getMandate(mandateId, ownerId);
      const known = new Set(
        (
          await db.query<{ id: string }>("select id from trails where subject_id = $1 and mode = $2", [
            mandate.subject.id,
            mandate.role,
          ])
        ).map((row) => row.id),
      );

      for (const conclusion of conclusions) {
        // A conclusion is about one stored trail of this mandate, or it is about nothing.
        if (!known.has(conclusion.trailId)) throw new NotFoundError(`No trail ${conclusion.trailId} in this mandate.`);
      }

      for (const conclusion of conclusions) {
        await db.query(
          `insert into conclusions (mandate_id, trail_id, reading, because, does_not_prove, ask, saved_at)
           values ($1, $2, $3, $4, $5, $6, clock_timestamp())
           on conflict (mandate_id, trail_id) do update set
             reading = excluded.reading, because = excluded.because, does_not_prove = excluded.does_not_prove,
             ask = excluded.ask, saved_at = excluded.saved_at`,
          [mandateId, conclusion.trailId, conclusion.reading, conclusion.because, conclusion.doesNotProve, conclusion.ask],
        );
      }
    },

    async evidenceCounts(mandateId) {
      const [counts] = await db.query<{ trails: number; sources: number }>(
        `with shown as (
           select trails.id, trails.hops, trails.signal
           from mandate_trails join trails on trails.id = mandate_trails.trail_id
           where mandate_trails.mandate_id = $1
         ),
         cited as (
           select source from shown, jsonb_array_elements(shown.hops) as hop, jsonb_array_elements(hop -> 'sources') as source
           union all
           select source from shown, jsonb_array_elements(shown.signal -> 'sources') as source
           where jsonb_typeof(shown.signal) = 'object'
         )
         select (select count(*)::integer from shown) as trails,
                (select count(distinct coalesce(source ->> 'url', source ->> 'name'))::integer from cited) as sources`,
        [mandateId],
      );

      return { trails: counts?.trails ?? 0, sources: counts?.sources ?? 0 };
    },
  };
}

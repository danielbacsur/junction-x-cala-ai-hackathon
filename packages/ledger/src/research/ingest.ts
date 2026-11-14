import type { RawResponse } from "../cala/contract";
import type { SourceRef } from "../contract";
import type { Db } from "../db";
import { type Provenance, putRaw } from "./raw";
import { familyOf, roundTypes } from "./relations";
import { hashId, insertRows, json, mergeSources, nameKey, toSources, uniqueBy } from "./sql";

/** Raise it when the normalizer changes, and every stored response is read again on its next ingest. */
export const INGEST_VERSION = 1;

/**
 * A raw response with what only its caller knows: where a fixture came from, and which entity a
 * signal probe was asked about (the question names it, but a name is not an ID).
 */
export type IngestInput = RawResponse & {
  provenance?: Provenance | null;
  probeSubjectId?: string | null;
};

type CalaItem = {
  id: string;
  name: string;
  entity_type: string;
  description?: string | null;
  properties?: Record<string, unknown> | null;
};

type CalaEntity = CalaItem & {
  properties?: Record<string, { value: unknown; sources?: unknown }> | null;
  relationships?: Partial<Record<"outgoing" | "incoming", Record<string, CalaItem[]>>> | null;
};

type ListSpec = { limit?: number; offset?: number };

/**
 * Stores one raw response and normalizes it into entities, edges, rounds, participants, the
 * roster and probe claims. Safe to repeat: a response already read by this version is skipped.
 * Returns true when the store changed.
 */
export async function ingestResponse(db: Db, input: IngestInput): Promise<boolean> {
  await putRaw(db, input, input.provenance);

  const [stored] = await db.query<{ ingest_version: number | null }>(
    "select ingest_version from raw_responses where id = $1 and fetched_at = $2",
    [input.id, input.fetchedAt],
  );

  if (stored?.ingest_version === INGEST_VERSION && !(await probeLacksSubject(db, input))) return false;

  await db.transaction(async (tx) => {
    if (input.status >= 200 && input.status < 300 && input.body) await normalize(tx, input);

    await tx.query("update raw_responses set ingest_version = $3 where id = $1 and fetched_at = $2", [
      input.id,
      input.fetchedAt,
      INGEST_VERSION,
    ]);
    await markChanged(tx);
  });

  return true;
}

/** Counts store changes, so derived tables are rebuilt only when something new came in. */
export async function markChanged(db: Db): Promise<void> {
  await db.query(
    `insert into store_meta (key, value) values ('ingest_seq', '1'::jsonb)
     on conflict (key) do update set value = to_jsonb((store_meta.value #>> '{}')::bigint + 1)`,
  );
}

/** A probe stored before anyone said whom it was about is read again once the subject is known. */
async function probeLacksSubject(db: Db, input: IngestInput): Promise<boolean> {
  if (input.request.kind !== "knowledge_search" || !input.probeSubjectId) return false;

  const [probe] = await db.query<{ subject_id: string | null }>(
    "select subject_id from probes where response_id = $1",
    [input.id],
  );

  return !probe?.subject_id;
}

async function normalize(db: Db, input: IngestInput): Promise<void> {
  const body = input.body as Record<string, unknown>;

  switch (input.request.kind) {
    case "entity": {
      // Round 2 saved some reads as { introspection, entity }.
      const entity = (body.introspection && body.entity ? body.entity : body) as CalaEntity;

      if (entity?.id && entity.name) await normalizeEntityRead(db, input, entity);

      return;
    }

    case "search_entities":
    case "knowledge_query":
      return upsertStubs(db, input, (body.entities ?? []) as CalaItem[]);

    case "lookup":
      return upsertStubs(db, input, body.id ? [body as unknown as CalaItem] : []);

    case "knowledge_search":
      return normalizeProbe(db, input, body);
  }
}

/** Entities seen in a list or a search. An entity's own read is never overwritten by one. */
async function upsertStubs(db: Db, input: IngestInput, items: CalaItem[]): Promise<void> {
  const rows = uniqueBy(
    items
      .filter((item) => item?.id && item.name && !roundTypes.has(item.entity_type))
      .map((item) => ({
        id: item.id,
        name: item.name,
        entity_type: item.entity_type ?? "Unknown",
        description: typeof item.description === "string" ? item.description : null,
        name_key: nameKey(item.name),
      })),
    (row) => row.id,
  );

  await insertRows(
    db,
    rows,
    `insert into entities (id, name, entity_type, description, name_key, first_seen_in, first_seen_at)
     select x.id, x.name, x.entity_type, x.description, x.name_key, $2, $3
     from jsonb_to_recordset($1::jsonb) as x(id text, name text, entity_type text, description text, name_key text)
     on conflict (id) do update set description = coalesce(entities.description, excluded.description)`,
    [input.id, input.fetchedAt],
  );
}

/** star, person, round, roster or partial, from what was read and what the request asked for. */
function readKind(entity: CalaEntity, request: IngestInput["request"]): string {
  if (roundTypes.has(entity.entity_type)) return "round";
  if (entity.entity_type === "Event") return "roster";

  const body = (request.kind === "entity" ? request.body : null) as {
    _full?: boolean;
    relationships?: Partial<Record<"outgoing" | "incoming", Record<string, ListSpec>>>;
  } | null;
  const asked = { ...body?.relationships?.outgoing, ...body?.relationships?.incoming };

  // A read that never asked for investment ties says nothing about the entity's neighbourhood.
  if (!body?._full && !("INVESTED_IN" in asked)) return "partial";

  return entity.entity_type === "Person" ? "person" : "star";
}

async function normalizeEntityRead(db: Db, input: IngestInput, entity: CalaEntity): Promise<void> {
  const kind = readKind(entity, input.request);
  const self = entity.id;
  const properties = entity.properties ?? {};

  // A partial read fills a missing row and leaves a full read's values alone.
  await db.query(
    `insert into entities
       (id, name, entity_type, description, properties, name_key, read_kind, read_response_id, read_at, first_seen_in, first_seen_at)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $8, $9)
     on conflict (id) do update set
       name = case when $7 = 'partial' and entities.read_kind is not null then entities.name else excluded.name end,
       entity_type = excluded.entity_type,
       description = case
         when $7 = 'partial' and entities.read_kind is not null then coalesce(entities.description, excluded.description)
         else coalesce(excluded.description, entities.description) end,
       properties = case when $7 = 'partial' and entities.read_kind is not null then entities.properties else excluded.properties end,
       name_key = case when $7 = 'partial' and entities.read_kind is not null then entities.name_key else excluded.name_key end,
       read_kind = case when $7 = 'partial' and entities.read_kind is not null then entities.read_kind else excluded.read_kind end,
       read_response_id = case when $7 = 'partial' and entities.read_kind is not null then entities.read_response_id else excluded.read_response_id end,
       read_at = case when $7 = 'partial' and entities.read_kind is not null then entities.read_at else excluded.read_at end`,
    [
      self,
      entity.name,
      entity.entity_type,
      entity.description ?? null,
      json(properties),
      nameKey(entity.name),
      kind,
      input.id,
      input.fetchedAt,
    ],
  );

  if (kind === "round") await upsertRoundRead(db, input, entity);

  const stubs: CalaItem[] = [];
  const edges: Record<string, unknown>[] = [];
  const rounds: Record<string, unknown>[] = [];
  const participations: Record<string, unknown>[] = [];
  const roster: Record<string, unknown>[] = [];

  for (const direction of ["outgoing", "incoming"] as const) {
    for (const [relationship, items] of Object.entries(entity.relationships?.[direction] ?? {})) {
      for (const item of items ?? []) {
        if (!item?.id) continue;

        const { id: calaEdgeId, sources, role, valid_since, valid_until, ...rest } = (item.properties ?? {}) as Record<
          string,
          unknown
        >;
        const edgeSources = toSources(sources);

        if (relationship === "PARTICIPATES_IN_FUNDING_ROUND" || relationship === "PARTICIPATES_IN_CORPORATE_EVENT") {
          // Outgoing on a party's read, incoming on the round's own read.
          const round = direction === "outgoing" ? item : entity;
          const party = direction === "outgoing" ? entity : item;

          if (direction === "outgoing") {
            rounds.push({ id: round.id, entity_type: round.entity_type, name: round.name ?? null });
          } else {
            stubs.push(item);
          }

          participations.push({
            round_id: round.id,
            entity_id: party.id,
            role: typeof role === "string" ? role : "",
            observed_on: self,
            is_lead: typeof rest.is_lead === "boolean" ? rest.is_lead : null,
            event_date: typeof rest.event_date === "string" ? rest.event_date : null,
            cala_edge_id: typeof calaEdgeId === "string" ? calaEdgeId : null,
            sources: edgeSources,
          });

          continue;
        }

        if (relationship === "PARTICIPATES_IN_EVENT") {
          const event = direction === "outgoing" ? item : entity;
          const party = direction === "outgoing" ? entity : item;

          if (direction === "incoming") stubs.push(item);

          roster.push({
            event_id: event.id,
            entity_id: party.id,
            role: typeof role === "string" ? role : "",
            sources: edgeSources,
          });

          continue;
        }

        stubs.push(item);
        edges.push({
          id: hashId(self, direction, relationship, item.id, typeof calaEdgeId === "string" ? calaEdgeId : ""),
          cala_edge_id: typeof calaEdgeId === "string" ? calaEdgeId : null,
          source_id: direction === "outgoing" ? self : item.id,
          target_id: direction === "outgoing" ? item.id : self,
          relationship,
          family: familyOf(relationship),
          observed_on: self,
          observed_direction: direction,
          role: typeof role === "string" ? role : null,
          valid_since: typeof valid_since === "string" ? valid_since : null,
          valid_until: typeof valid_until === "string" ? valid_until : null,
          properties: rest,
          sources: edgeSources,
        });
      }
    }
  }

  await upsertStubs(db, input, stubs);

  await insertRows(
    db,
    uniqueBy(rounds, (row) => String(row.id)),
    `insert into rounds (id, entity_type, name, event_type)
     select x.id, x.entity_type, x.name, case when x.entity_type = 'FundingRound' then null else x.name end
     from jsonb_to_recordset($1::jsonb) as x(id text, entity_type text, name text)
     on conflict (id) do update set name = coalesce(rounds.name, excluded.name)`,
  );

  await insertRows(
    db,
    uniqueBy(participations, (row) => `${row.round_id}|${row.entity_id}|${row.role}`),
    `insert into participations
       (round_id, entity_id, role, observed_on, is_lead, event_date, cala_edge_id, sources, response_id, fetched_at)
     select x.round_id, x.entity_id, x.role, x.observed_on, x.is_lead, x.event_date, x.cala_edge_id, x.sources, $2, $3
     from jsonb_to_recordset($1::jsonb) as x(
       round_id text, entity_id text, role text, observed_on text, is_lead boolean, event_date text,
       cala_edge_id text, sources jsonb
     )
     on conflict (round_id, entity_id, role, observed_on) do update set
       is_lead = excluded.is_lead, event_date = excluded.event_date, cala_edge_id = excluded.cala_edge_id,
       sources = excluded.sources, response_id = excluded.response_id, fetched_at = excluded.fetched_at`,
    [input.id, input.fetchedAt],
  );

  await insertRows(
    db,
    uniqueBy(roster, (row) => `${row.event_id}|${row.entity_id}`),
    `insert into roster (event_id, entity_id, role, sources, response_id, fetched_at)
     select x.event_id, x.entity_id, x.role, x.sources, $2, $3
     from jsonb_to_recordset($1::jsonb) as x(event_id text, entity_id text, role text, sources jsonb)
     on conflict (event_id, entity_id) do update set
       role = excluded.role, sources = excluded.sources, response_id = excluded.response_id, fetched_at = excluded.fetched_at
     where $4::boolean`,
    // The event's own read is the roster's snapshot; a company's read of the same fact does not redate it.
    [input.id, input.fetchedAt, kind === "roster"],
  );

  await insertRows(
    db,
    uniqueBy(edges, (row) => String(row.id)),
    `insert into edges
       (id, cala_edge_id, source_id, target_id, relationship, family, observed_on, observed_direction, role,
        valid_since, valid_until, properties, sources, response_id, fetched_at)
     select x.id, x.cala_edge_id, x.source_id, x.target_id, x.relationship, x.family, x.observed_on,
            x.observed_direction, x.role, x.valid_since, x.valid_until, x.properties, x.sources, $2, $3
     from jsonb_to_recordset($1::jsonb) as x(
       id text, cala_edge_id text, source_id text, target_id text, relationship text, family text,
       observed_on text, observed_direction text, role text, valid_since text, valid_until text,
       properties jsonb, sources jsonb
     )
     on conflict (id) do update set
       role = excluded.role, valid_since = excluded.valid_since, valid_until = excluded.valid_until,
       properties = excluded.properties, sources = excluded.sources, response_id = excluded.response_id,
       fetched_at = excluded.fetched_at`,
    [input.id, input.fetchedAt],
  );

  await recordCoverage(db, input, entity);
}

/** The dated fields of a round, which only a read of the round itself carries. */
async function upsertRoundRead(db: Db, input: IngestInput, entity: CalaEntity): Promise<void> {
  const properties = entity.properties ?? {};
  const value = (name: string) => properties[name]?.value ?? null;
  const text = (name: string) => (typeof value(name) === "string" ? (value(name) as string) : null);
  const sources = mergeSources(...Object.values(properties).map((property) => toSources(property?.sources)));

  await db.query(
    `insert into rounds
       (id, entity_type, name, round_label, round_type, event_type, instrument, transaction_value,
        transaction_value_units, announcement_date, close_date, event_date, aliases, annotations, sources,
        read_response_id, read_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16, $17)
     on conflict (id) do update set
       entity_type = excluded.entity_type, name = excluded.name, round_label = excluded.round_label,
       round_type = excluded.round_type, event_type = coalesce(excluded.event_type, rounds.event_type),
       instrument = excluded.instrument, transaction_value = excluded.transaction_value,
       transaction_value_units = excluded.transaction_value_units, announcement_date = excluded.announcement_date,
       close_date = excluded.close_date, event_date = excluded.event_date, aliases = excluded.aliases,
       annotations = excluded.annotations, sources = excluded.sources,
       read_response_id = excluded.read_response_id, read_at = excluded.read_at`,
    [
      entity.id,
      entity.entity_type,
      entity.name,
      text("round_label"),
      text("round_type"),
      text("event_type") ?? (entity.entity_type === "FundingRound" ? null : entity.name),
      text("instrument"),
      typeof value("transaction_value") === "number" ? value("transaction_value") : null,
      text("transaction_value_units"),
      text("announcement_date"),
      text("close_date"),
      text("event_date"),
      json(Array.isArray(value("aliases")) ? value("aliases") : []),
      json(Array.isArray(value("annotations")) ? value("annotations") : []),
      json(sources),
      input.id,
      input.fetchedAt,
    ],
  );
}

/** What the request asked of each list and how much came back. Exactly the limit means truncated. */
async function recordCoverage(db: Db, input: IngestInput, entity: CalaEntity): Promise<void> {
  if (input.request.kind !== "entity") return;

  const asked = (input.request.body as { relationships?: Record<string, Record<string, ListSpec>> } | null)
    ?.relationships;
  const rows: Record<string, unknown>[] = [];

  for (const direction of ["outgoing", "incoming"] as const) {
    for (const [relationship, spec] of Object.entries(asked?.[direction] ?? {})) {
      const returned = entity.relationships?.[direction]?.[relationship]?.length ?? 0;
      const limit = typeof spec?.limit === "number" ? spec.limit : null;

      rows.push({
        entity_id: entity.id,
        relationship,
        direction,
        requested_offset: typeof spec?.offset === "number" ? spec.offset : 0,
        requested_limit: limit,
        returned,
        truncated: limit !== null && returned >= limit,
      });
    }
  }

  await insertRows(
    db,
    rows,
    `insert into coverage
       (entity_id, relationship, direction, requested_offset, requested_limit, returned, truncated, response_id, fetched_at)
     select x.entity_id, x.relationship, x.direction, x.requested_offset, x.requested_limit, x.returned, x.truncated, $2, $3
     from jsonb_to_recordset($1::jsonb) as x(
       entity_id text, relationship text, direction text, requested_offset integer, requested_limit integer,
       returned integer, truncated boolean
     )
     on conflict (entity_id, relationship, direction, requested_offset) do update set
       requested_limit = excluded.requested_limit, returned = excluded.returned, truncated = excluded.truncated,
       response_id = excluded.response_id, fetched_at = excluded.fetched_at`,
    [input.id, input.fetchedAt],
  );
}

type Passage = { id: string; text: string; title: string | null; source: SourceRef };

type ProbeBody = {
  explainability?: { content?: string; references?: string[] }[];
  context?: {
    id: string;
    content?: string;
    origins?: { source?: { name?: string; url?: string }; document?: { name?: string; url?: string } }[];
  }[];
  entities?: { id: string; name: string; entity_type: string; mentions?: string[] }[];
};

function publisher(url: string | null, fallback: string | null): string | null {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : fallback;
  } catch {
    return fallback;
  }
}

/**
 * A signal probe's answer: each explainability item is one claim, stored as Cala reported it
 * with the passages it cites. Reading agreements out of the claims is a separate step.
 */
async function normalizeProbe(db: Db, input: IngestInput, body: Record<string, unknown>): Promise<void> {
  if (input.request.kind !== "knowledge_search") return;

  const answer = body as ProbeBody;
  const context = new Map((answer.context ?? []).map((passage) => [passage.id, passage]));
  const entities = (answer.entities ?? []).filter((entity) => entity?.id && entity.name);

  const claims = (answer.explainability ?? []).map((item, index) => {
    const passages: Passage[] = [];

    for (const reference of item.references ?? []) {
      const passage = context.get(reference);
      const origin = passage?.origins?.[0];

      if (!passage) continue;

      const url = origin?.document?.url || origin?.source?.url || null;

      passages.push({
        id: passage.id,
        text: passage.content ?? "",
        title: origin?.document?.name || null,
        // Passages carry no date and no provenance label, so both stay null.
        source: { name: publisher(url, origin?.source?.name || null), url, date: null, rank: null },
      });
    }

    return {
      id: `${input.id}:${index}`,
      claim_index: index,
      text: item.content ?? "",
      passages,
    };
  });

  await db.query(
    `insert into probes (response_id, subject_id, question, asked_at, entities, claim_count)
     values ($1, $2, $3, $4, $5::jsonb, $6)
     on conflict (response_id) do update set
       subject_id = coalesce(probes.subject_id, excluded.subject_id),
       entities = excluded.entities,
       claim_count = excluded.claim_count`,
    [input.id, input.probeSubjectId ?? null, input.request.input, input.fetchedAt, json(entities), claims.length],
  );

  await insertRows(
    db,
    claims,
    `insert into probe_claims (id, response_id, subject_id, claim_index, text, passages)
     select x.id, $2, $3, x.claim_index, x.text, x.passages
     from jsonb_to_recordset($1::jsonb) as x(id text, claim_index integer, text text, passages jsonb)
     on conflict (id) do update set
       subject_id = coalesce(probe_claims.subject_id, excluded.subject_id),
       text = excluded.text,
       passages = excluded.passages`,
    [input.id, input.probeSubjectId ?? null],
  );

  await upsertStubs(db, input, entities);
}

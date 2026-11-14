import { type Budget, CalaBudgetError, type CalaClient, type CalaRequest } from "../cala/contract";
import { requestId } from "../cala/id";
import {
  type AgreementExtractor,
  CalaUnavailableError,
  type EntityRef,
  type Ledger,
  type Mandate,
  type ProbeProposal,
  type Signal,
  type WorkEvent,
  type WorkOptions,
  type WorkResult,
} from "../contract";
import type { Db } from "../db";
import { describeTrail, investorKind, rankMandate } from "./book";
import { type IngestInput, ingestResponse } from "./ingest";
import { readAgreements } from "./probes";
import { getRaw } from "./raw";
import { entityRow, refOf } from "./read";
import { financierRoles, recipientRoles } from "./relations";
import { narrowStarBody, probeQuestion, probeRequest, roundRequest, SLUSH_EVENT_ID, starRequest } from "./requests";
import { ensureDerived, windowStart } from "./rules";
import { insertRows, iso, json } from "./sql";
import { entityRefs, signalsOf, type StoredTrail, storedTrails } from "./trails";

/** Ceilings inside one pass (consensus points 11 and 16.8). They share the pass's total budget. */
const PASS_BUDGET = 25;
const HUB_READS = 8;
const ANCHOR_READS = 8;
const ROUND_READS = 6;
const SIBLING_READS = 4;
const PROBES = 6;
const TRAIL_ACTION = 5;

const idList = "select jsonb_array_elements_text($1::jsonb)";
const quoted = (values: string[]) => values.map((value) => `'${value}'`).join(", ");

export type WorkContext = {
  db: Db;
  cala: CalaClient;
  mandates: Pick<Ledger, "getMandate" | "logWork" | "setStage">;
  extractAgreements: AgreementExtractor;
  now: () => Date;
};

type Stop = "budget" | "outage" | "aborted" | null;

/** One research pass's shared state: what it may still spend and what it could not do. */
type Pass = {
  mandate: Mandate;
  budget: Budget;
  signal?: AbortSignal;
  stop: Stop;
  gaps: string[];
  /** Reads and probes that were wanted and not made. */
  unmade: string[];
  /** Requests held back for the probes that run at the end of the pass. */
  reserved: number;
  /** When each entity looked up so far was read, or null when it is not stored. */
  stored: Map<string, string | null>;
};

const newPass = (mandate: Mandate, limit: number, rest: Partial<Pass> = {}): Pass => ({
  mandate,
  budget: { limit, used: 0 },
  stop: null,
  gaps: [],
  unmade: [],
  reserved: 0,
  stored: new Map(),
  ...rest,
});

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function createWorker(context: WorkContext) {
  const { db, cala, mandates } = context;

  /** The last ranking of the mandates worked most recently, and the store state each was made from. */
  const rankings = new Map<string, { state: string; result: Awaited<ReturnType<typeof rankMandate>> }>();

  /** One line of the work log. With a key, a step that runs again finds its line already written. */
  const log = (
    mandateId: string,
    event: Partial<Omit<WorkEvent, "id" | "mandateId" | "at">> & Pick<WorkEvent, "kind" | "message"> & { key?: string },
  ) => mandates.logWork(mandateId, { seconds: null, entity: null, fromStore: false, ...event });

  /** Notes why live work stopped, once. After this the pass serves from the store only. */
  async function halt(pass: Pass, error: unknown): Promise<boolean> {
    if (error instanceof CalaBudgetError) {
      pass.stop = "budget";
    } else if (error instanceof CalaUnavailableError) {
      pass.stop = "outage";

      const [newest] = await db.query<{ at: unknown }>("select max(fetched_at) as at from raw_responses");
      const gap = `Cala is not answering; showing stored evidence from ${iso(newest?.at) ?? "earlier reads"}.`;

      pass.gaps.push(gap);
      await log(pass.mandate.id, { kind: "outage", message: gap });
    } else if (isAbort(error) || pass.signal?.aborted) {
      pass.stop = "aborted";
      pass.gaps.push("The pass was cancelled before it finished.");
    } else {
      return false;
    }

    return true;
  }

  async function send(pass: Pass, request: CalaRequest, extra: Partial<IngestInput> = {}) {
    const response = await cala.request(request, { priority: "mandate", budget: pass.budget, signal: pass.signal });

    await ingestResponse(db, { ...response, ...extra });

    // A stored error is still a failed read: nothing was normalized from it.
    if (response.status < 200 || response.status >= 300) throw new Error(`Cala answered HTTP ${response.status}`);

    return response;
  }

  /** Finds out in one query which of these records are stored, so a list is not checked row by row. */
  async function lookUp(pass: Pass, entityIds: string[], kind: "star" | "round"): Promise<void> {
    const rows = await db.query<{ id: string; at: unknown }>(
      kind === "star"
        ? `select id, read_at as at from entities where read_kind in ('star', 'person') and id in (${idList})`
        : `select id, read_at as at from rounds where read_at is not null and id in (${idList})`,
      [json(entityIds)],
    );
    const found = new Map(rows.map((row) => [row.id, iso(row.at)]));

    for (const id of entityIds) pass.stored.set(id, found.get(id) ?? null);
  }

  /**
   * Makes sure one entity's own record is in the store, reading it from Cala only when it is not
   * and the step's ceiling still allows a request. Returns true when the record is there afterwards.
   */
  async function read(pass: Pass, entity: EntityRef, kind: "star" | "round", mayAsk = true): Promise<boolean> {
    if (!pass.stored.has(entity.id)) await lookUp(pass, [entity.id], kind);

    const stored = pass.stored.get(entity.id);

    if (stored) {
      await log(pass.mandate.id, {
        kind: "read",
        message: `Read ${entity.name} from the store (fetched ${stored}).`,
        entity,
        fromStore: true,
      });

      return true;
    }

    if (pass.signal?.aborted && !pass.stop) await halt(pass, null);

    if (pass.stop || !mayAsk) {
      pass.unmade.push(entity.name);

      return false;
    }

    const requests =
      kind === "round"
        ? [roundRequest(entity.id)]
        : entity.entityType === "Person"
          ? [starRequest(entity.id, "Person")]
          : // The wide read first; the narrower one when it fails for a reason of its own.
            [starRequest(entity.id), { kind: "entity", entityId: entity.id, body: narrowStarBody } as CalaRequest];

    for (const request of requests) {
      try {
        const response = await send(pass, request);

        pass.stored.set(entity.id, response.fetchedAt);
        await log(pass.mandate.id, {
          kind: "read",
          message: `Read ${entity.name}${response.fromStore ? " from the store" : ""}.`,
          seconds: response.seconds,
          entity,
          fromStore: response.fromStore,
        });

        return true;
      } catch (error) {
        if (await halt(pass, error)) {
          pass.unmade.push(entity.name);

          return false;
        }

        if (request === requests[requests.length - 1]) {
          const gap = `${entity.name} could not be read: ${error instanceof Error ? error.message : "the request failed"}.`;

          pass.gaps.push(gap);
          await log(pass.mandate.id, { kind: "gap", message: gap, entity });
        }
      }
    }

    return false;
  }

  /** A short hint that tells Cala which entity of that name is meant. */
  async function hintFor(entityId: string): Promise<string | null> {
    const row = await entityRow(db, entityId);
    const website = row?.properties?.website?.value;
    const address = row?.properties?.headquarters_address?.value;
    const parts = [website, address].filter((part): part is string => typeof part === "string" && part.length > 0);

    if (parts.length > 0) return parts.join(", ");

    const sentence = row?.description?.split(/(?<=[.!?])\s/)[0]?.replace(/[.!?]$/, "") ?? null;

    return sentence ? (sentence.length > 90 ? `${sentence.slice(0, 87)}...` : sentence) : null;
  }

  /** True when a request made now would go out: the pass may still spend and Cala is not latched. */
  async function wouldSend(pass: Pass): Promise<boolean> {
    if (pass.stop || pass.budget.used >= pass.budget.limit) return false;

    try {
      return (await cala.status()).state !== "latched";
    } catch {
      return true;
    }
  }

  /**
   * One signal probe for one entity. An answer already in the store is reused; a new one counts
   * against the mandate's six. The claims are stored as reported and then read for agreements.
   *
   * A probe that goes to Cala is logged twice: when it is sent, without a duration, so a reader
   * of the work log can tell that Cabala is waiting and for how long, and when it ends, with
   * one, whether Cala answered or not.
   */
  async function probe(pass: Pass, entity: EntityRef): Promise<void> {
    const mandateId = pass.mandate.id;
    const [stored] = await db.query<{ response_id: string; asked_at: unknown }>(
      "select response_id, asked_at from probes where subject_id = $1 order by asked_at desc limit 1",
      [entity.id],
    );
    let responseId = stored?.response_id ?? null;
    let fromStore = true;
    let seconds: number | null = null;

    if (!responseId) {
      // The slot is taken before the request starts, so overlapped probes cannot overrun the six.
      // A slot left by a step that died mid-request keeps its time, which names the attempt.
      const [slot] = pass.stop
        ? []
        : await db.query<{ asked_at: unknown }>(
            `insert into mandate_probes (mandate_id, entity_id, from_store)
             select $1, $2, false
             where (select count(*) from mandate_probes where mandate_id = $1 and not from_store and entity_id <> $2) < $3
             on conflict (mandate_id, entity_id) do update set asked_at = mandate_probes.asked_at
             returning asked_at`,
            [mandateId, entity.id, PROBES],
          );

      if (!slot) {
        if (!pass.stop) pass.gaps.push(`This mandate has used its ${PROBES} signal probes; ${entity.name} was not asked about.`);

        pass.unmade.push(`signal probe for ${entity.name}`);

        return;
      }

      const request = probeRequest(probeQuestion(entity.name, await hintFor(entity.id), new Date(windowStart(context.now()))));
      // No start line for a question the store will answer, or one that cannot be sent at all.
      const sent = !(await getRaw(db, requestId(request))) && (await wouldSend(pass));
      const started = performance.now();

      if (sent) {
        // Keyed by the attempt, so a resumed step that asks again writes no second line.
        await log(mandateId, {
          kind: "probe",
          message: `Asking Cala about ${entity.name}.`,
          entity,
          key: `probe:${entity.id}:${iso(slot.asked_at)}:sent`,
        });
      }

      try {
        const response = await send(pass, request, { probeSubjectId: entity.id });

        responseId = response.id;
        fromStore = response.fromStore;
        seconds = response.seconds;
      } catch (error) {
        await db.query("delete from mandate_probes where mandate_id = $1 and entity_id = $2 and response_id is null", [
          mandateId,
          entity.id,
        ]);
        pass.unmade.push(`signal probe for ${entity.name}`);

        // The line that says the wait is over, so nothing reads the probe as still in flight.
        // It goes before an outage is noted, which stays the last word on what Cabala is doing.
        if (sent) {
          const why =
            error instanceof CalaUnavailableError
              ? "Cala is refusing requests"
              : error instanceof CalaBudgetError
                ? "the pass had no requests left"
                : isAbort(error) || pass.signal?.aborted
                  ? "the pass was cancelled"
                  : error instanceof Error
                    ? error.message
                    : "the request failed";

          await log(mandateId, {
            kind: "probe",
            message: `Cala gave no answer about ${entity.name}: ${why}.`,
            seconds: (performance.now() - started) / 1000,
            entity,
          });
        }

        if (!(await halt(pass, error))) {
          const gap = `The signal probe for ${entity.name} failed: ${error instanceof Error ? error.message : "the request failed"}.`;

          pass.gaps.push(gap);
          await log(mandateId, { kind: "gap", message: gap, entity });
        }

        return;
      }
    }

    await db.query(
      `insert into mandate_probes (mandate_id, entity_id, response_id, from_store) values ($1, $2, $3, $4)
       on conflict (mandate_id, entity_id) do update set response_id = excluded.response_id`,
      [mandateId, entity.id, responseId, fromStore],
    );

    try {
      await readAgreements(db, responseId, context.extractAgreements);
    } catch (error) {
      const gap = `Cala answered about ${entity.name}, but its claims could not be read for agreements (${error instanceof Error ? error.message : "extraction failed"}). They are stored as reported.`;

      pass.gaps.push(gap);
      await log(mandateId, { kind: "gap", message: gap, entity });
    }

    const [result] = await db.query<{ asked_at: unknown; agreements_found: number | null; edges: number }>(
      `select asked_at, agreements_found,
              (select count(*)::integer from probe_claims where response_id = probes.response_id and status = 'edge') as edges
       from probes where response_id = $1`,
      [responseId],
    );
    const day = iso(result?.asked_at)?.slice(0, 10);
    const outcome =
      result?.agreements_found === 0
        ? `none found by Cala on ${day}`
        : result?.agreements_found
          ? `${result.agreements_found} agreement${result.agreements_found === 1 ? "" : "s"} reported, ${result.edges} with both parties resolved`
          : "claims stored as reported";

    await log(mandateId, {
      kind: "probe",
      message: `Asked Cala about ${entity.name}${fromStore ? " (answer from the store)" : ""}: ${outcome}.`,
      seconds,
      entity,
      fromStore,
    });
  }

  /**
   * Ranks from the store and writes one work event per trail the mandate shows (those behind a
   * Book row, and counterparty and ownership trails) that was not logged for it before. A second
   * pass therefore never counts a trail twice.
   */
  async function rankAndLog(mandate: Mandate): Promise<{ trails: StoredTrail[]; rows: number; gaps: string[]; found: number }> {
    // Nothing ingested since this mandate was last ranked under these constraints: the Book stands.
    const [seq] = await db.query<{ value: string }>("select value #>> '{}' as value from store_meta where key = 'ingest_seq'");
    const state = `${seq?.value}|${mandate.revision}|${json(mandate.constraints)}|${windowStart(context.now())}`;
    const last = rankings.get(mandate.id);

    if (last?.state === state) return { ...last.result, found: 0 };

    const result = await rankMandate(db, mandate, context.now());
    const logged = new Set(
      (await db.query<{ trail_id: string }>("select trail_id from mandate_trails where mandate_id = $1", [mandate.id])).map(
        (row) => row.trail_id,
      ),
    );
    const fresh = result.shown.filter((trail) => !logged.has(trail.id));

    await insertRows(
      db,
      fresh.map((trail) => ({ trail_id: trail.id })),
      `insert into mandate_trails (mandate_id, trail_id)
       select $2, x.trail_id from jsonb_to_recordset($1::jsonb) as x(trail_id text)
       on conflict do nothing`,
      [mandate.id],
    );

    for (const trail of fresh) {
      await log(mandate.id, {
        kind: "trail",
        message: `Trail ${trail.pattern}: ${describeTrail(trail)}.`,
        entity: trail.end,
      });
    }

    rankings.delete(mandate.id);
    rankings.set(mandate.id, { state, result });

    // A handful is enough to spare one pass its repeats; the Book itself lives in the store.
    if (rankings.size > 16) rankings.delete(rankings.keys().next().value!);

    return { ...result, found: fresh.length };
  }

  /** The subject's backers as stored, institutions before individuals, then by stored ties. */
  async function backersOf(entityId: string, except: string[] = []): Promise<EntityRef[]> {
    const rows = await db.query<{ id: string; name: string; entity_type: string; description: string | null }>(
      `select e.id, e.name, e.entity_type, e.description
       from ties t join entities e on e.id = t.to_id
       where t.from_id = $1 and t.family = 'investment'
         and (t.direction = 'to_funds_from' or (t.direction = 'undirected' and t.stated in ('to_from', 'both')))
         and not (t.to_id in (${idList.replace("$1", "$2")}))
       order by (e.entity_type = 'Person'), (e.read_kind is null),
                (select count(*) from ties own where own.from_id = e.id and own.family = 'investment') desc, e.id`,
      [entityId, json(except)],
    );

    return rows.map(refOf);
  }

  /**
   * Unread rounds in which the entity is the issuer or borrower, newest first where a date is
   * known. With `grantsOnly`, those Cala names a grant and whose grantor no stored read shows.
   */
  async function ownRounds(entityId: string, grantsOnly = false): Promise<EntityRef[]> {
    const rows = await db.query<{ id: string; name: string | null; entity_type: string; issuer: string | null }>(
      `select rounds.id, rounds.name, rounds.entity_type, (select name from entities where id = $1) as issuer
       from rounds
       where rounds.read_at is null and exists (
         select 1 from participations p
         where p.round_id = rounds.id and p.entity_id = $1 and p.role in (${quoted(recipientRoles)})
       )
       and (not $2::boolean or (
         rounds.name ilike '%grant%' and not exists (
           select 1 from participations p where p.round_id = rounds.id and p.role in (${quoted(financierRoles)})
         )
       ))
       order by (rounds.entity_type = 'FundingRound') desc,
                (select max(coalesce(p.event_date, p.sources -> 0 ->> 'date')) from participations p where p.round_id = rounds.id) desc nulls last,
                rounds.id`,
      [entityId, grantsOnly],
    );

    return rows.map((row) => ({
      id: row.id,
      name: `${row.issuer ?? "an issuer"}'s ${row.name ?? "round"} (${row.id.slice(0, 8)})`,
      entityType: row.entity_type,
      description: null,
    }));
  }

  async function workFounder(pass: Pass): Promise<void> {
    const subject = pass.mandate.subject;

    await read(pass, subject, "star");
    await ensureDerived(db, context.now());

    // Hubs: the company's investors, whose portfolios hold its siblings.
    let live = pass.budget.used;

    const hubs = await backersOf(subject.id);

    await lookUp(pass, hubs.map((hub) => hub.id), "star");

    for (const hub of hubs) await read(pass, hub, "star", pass.budget.used - live < HUB_READS);

    await rankAndLog(pass.mandate);

    // The company's own rounds, for dates, amounts and the roles that settle direction.
    live = pass.budget.used;

    for (const round of await ownRounds(subject.id)) await read(pass, round, "round", pass.budget.used - live < ROUND_READS);

    // What the probes will not need goes to the siblings' own records, where their grants are:
    // Slush attendees first, then those reached over more trails.
    const siblings = await db.query<{ id: string; name: string; entity_type: string; description: string | null }>(
      `select e.id, e.name, e.entity_type, e.description
       from trails t join entities e on e.id = t.end_id
       where t.subject_id = $1 and t.mode = 'founder' and t.hop_count = 2 and t.pattern = 'T1'
         and e.read_kind is null and e.entity_type <> 'Person'
         and not exists (select 1 from public_funders where public_funders.entity_id = e.id)
       group by e.id, e.name, e.entity_type, e.description
       order by exists (
                  select 1 from roster where roster.entity_id = e.id and roster.event_id = $2 and roster.role = 'ATTENDEE'
                ) desc,
                max(t.independent_trails) desc, e.id
       limit 12`,
      [subject.id, SLUSH_EVENT_ID],
    );

    // Beyond these ceilings a sibling is simply not read; it was never promised, so it is no gap.
    const spare = () => !pass.stop && pass.budget.limit - pass.budget.used - pass.reserved > 0;

    live = pass.budget.used;

    for (const sibling of siblings) {
      if (!spare() || pass.budget.used - live >= SIBLING_READS) break;

      await read(pass, refOf(sibling), "star");
    }

    // A sibling's grant round names its grantor only on the round's own read.
    const stored = await db.query<{ id: string }>(
      `select distinct t.end_id as id from trails t join entities e on e.id = t.end_id
       where t.subject_id = $1 and t.mode = 'founder' and t.hop_count = 2 and e.read_kind = 'star'
       order by t.end_id`,
      [subject.id],
    );
    const grants = (await Promise.all(stored.map((sibling) => ownRounds(sibling.id, true)))).flat();

    live = pass.budget.used;

    for (const round of grants) {
      if (!spare() || pass.budget.used - live >= ROUND_READS) break;

      await read(pass, round, "round");
    }
  }

  async function workInvestor(pass: Pass): Promise<void> {
    const fund = pass.mandate.subject;

    await read(pass, fund, "star");
    await ensureDerived(db, context.now());

    // Anchors: the fund's portfolio, Slush attendees first, then the most recently evidenced.
    const anchors = await db.query<{ id: string; name: string; entity_type: string; description: string | null }>(
      `select e.id, e.name, e.entity_type, e.description
       from ties t join entities e on e.id = t.to_id
       where t.from_id = $1 and t.family = 'investment' and t.direction <> 'to_funds_from' and e.entity_type <> 'Person'
       order by exists (
                  select 1 from roster where roster.entity_id = e.id and roster.event_id = $2 and roster.role = 'ATTENDEE'
                ) desc,
                (select max(p.event_date) from participations p
                 join participations mine on mine.round_id = p.round_id and mine.entity_id = $1
                 where p.entity_id = e.id) desc nulls last,
                e.id`,
      [fund.id, SLUSH_EVENT_ID],
    );
    let live = pass.budget.used;
    const read_ = new Set<string>();

    await lookUp(pass, anchors.map((anchor) => anchor.id), "star");

    for (const anchor of anchors) {
      if (await read(pass, refOf(anchor), "star", pass.budget.used - live < ANCHOR_READS)) read_.add(anchor.id);
    }

    await ensureDerived(db, context.now());
    await rankAndLog(pass.mandate);

    // The anchors' other backers, those behind the most anchors first.
    const backers = await db.query<{ id: string; name: string; entity_type: string; description: string | null }>(
      `select e.id, e.name, e.entity_type, e.description
       from ties t join entities e on e.id = t.to_id
       where t.family = 'investment' and t.from_id in (${idList}) and t.to_id <> $2
         and (t.direction = 'to_funds_from' or (t.direction = 'undirected' and t.stated in ('to_from', 'both')))
       group by e.id, e.name, e.entity_type, e.description, e.read_kind
       order by (e.entity_type = 'Person'), count(*) desc, (e.read_kind is null), e.id`,
      [json([...read_]), fund.id],
    );

    live = pass.budget.used;
    await lookUp(pass, backers.map((backer) => backer.id), "star");

    for (const backer of backers) await read(pass, refOf(backer), "star", pass.budget.used - live < HUB_READS);
  }

  /** Round reads that could settle the direction of undirected hops on the trails found so far. */
  async function resolveRoles(pass: Pass, trails: StoredTrail[]): Promise<void> {
    const pairs = new Map<string, [string, string]>();

    for (const trail of trails) {
      for (const hop of trail.hops) {
        if (hop.family === "investment" && hop.direction === "undirected") pairs.set(`${hop.from.id}|${hop.to.id}`, [hop.from.id, hop.to.id]);
      }
    }

    const wanted = new Map<string, EntityRef>();

    for (const [a, b] of [...pairs.values()].slice(0, 12)) {
      // An unread round where one of the two is the issuer is the place their roles would show.
      for (const issuer of [a, b]) {
        for (const round of (await ownRounds(issuer)).slice(0, 2)) wanted.set(round.id, round);
      }
    }

    const live = pass.budget.used;

    for (const round of wanted.values()) await read(pass, round, "round", pass.budget.used - live < ROUND_READS);
  }

  async function workMandate(mandateId: string, ownerId: string, options: WorkOptions = {}): Promise<WorkResult> {
    let mandate = await mandates.getMandate(mandateId, ownerId);

    // A founder's own company is asked about by default; the rest are the neighbours Cabala picked.
    const probed = [
      ...new Set([...(mandate.role === "founder" ? [mandate.subject.id] : []), ...(options.probeEntityIds ?? [])]),
    ].slice(0, PROBES);
    const pass = newPass(mandate, options.budget ?? PASS_BUDGET, { signal: options.signal, reserved: probed.length });

    mandate = await mandates.setStage(mandateId, ownerId, "researching");
    pass.mandate = mandate;
    await log(mandateId, { kind: "stage", message: "Researching." });

    // What is already stored is shown first: trails and a Book before any request is made.
    let found = (await rankAndLog(mandate)).found;

    if (mandate.role === "founder") await workFounder(pass);
    else await workInvestor(pass);

    let ranked = await rankAndLog(mandate);

    found += ranked.found;

    if (!pass.stop) {
      await resolveRoles(pass, ranked.trails);
    }

    // Probes run overlapped and arrive last.
    const refs = await entityRefs(db, probed);

    await Promise.all(probed.map((id) => probe(pass, refs.get(id)!)));

    await ensureDerived(db, context.now());
    ranked = await rankAndLog(mandate);
    found += ranked.found;

    if (pass.stop === "budget") {
      pass.gaps.push(
        `The pass reached its ceiling of ${pass.budget.limit} Cala requests. Not read: ${pass.unmade.slice(0, 8).join(", ") || "nothing further"}${pass.unmade.length > 8 ? ` and ${pass.unmade.length - 8} more` : ""}.`,
      );
    }

    if (pass.unmade.length > 0) {
      await log(mandateId, {
        kind: "queued",
        message: `Not read in this pass: ${pass.unmade.slice(0, 8).join(", ")}${pass.unmade.length > 8 ? ` and ${pass.unmade.length - 8} more` : ""}.`,
      });
    }

    const partial = pass.stop !== null || pass.unmade.length > 0;
    const gaps = [...new Set([...pass.gaps, ...ranked.gaps])];

    await db.query(
      `insert into mandate_gaps (mandate_id, gaps, partial, noted_at) values ($1, $2::jsonb, $3, clock_timestamp())
       on conflict (mandate_id) do update set gaps = excluded.gaps, partial = excluded.partial, noted_at = excluded.noted_at`,
      [mandateId, json(pass.gaps), partial],
    );

    for (const gap of ranked.gaps) await log(mandateId, { kind: "gap", message: gap });

    await log(mandateId, {
      kind: "book",
      message: `Book ranked: ${ranked.rows} row${ranked.rows === 1 ? "" : "s"}; ${ranked.trails.length} trail${ranked.trails.length === 1 ? "" : "s"} in the store for ${mandate.subject.name}${partial ? "; the pass is partial" : ""}.`,
    });

    mandate = await mandates.setStage(mandateId, ownerId, "challenging");
    await log(mandateId, { kind: "stage", message: "Challenging." });

    return { mandate, requestsUsed: pass.budget.used, trailsFound: found, rows: ranked.rows, partial, gaps };
  }

  async function proposeProbes(mandateId: string, ownerId: string): Promise<ProbeProposal[]> {
    const mandate = await mandates.getMandate(mandateId, ownerId);
    let trails = await storedTrails(db, mandate.subject, mandate.role);

    if (trails.length === 0) trails = (await rankMandate(db, mandate, context.now())).trails;

    // Companies on the trails: ends and the entities between, but not the investors that link them.
    const counts = new Map<string, { ref: EntityRef; trails: Set<string>; through: Set<string> }>();

    for (const trail of trails) {
      const nodes = trail.hops.map((hop) => hop.to);
      const investments = trail.hops.every((hop) => hop.family === "investment");

      nodes.forEach((node, index) => {
        // On an investment trail the backers link the companies; the companies are the ones to ask about.
        const backer = investments && (mandate.role === "founder" ? index !== 1 : index === 1);

        if (node.entityType === "Person" || backer) return;

        const entry = counts.get(node.id) ?? { ref: node, trails: new Set<string>(), through: new Set<string>() };

        entry.trails.add(trail.pathKey);
        if (index > 0) entry.through.add(nodes[index - 1]!.name);
        counts.set(node.id, entry);
      });
    }

    const ids = [mandate.subject.id, ...counts.keys()];
    const probed = new Map(
      (
        await db.query<{ subject_id: string; asked_at: unknown }>(
          `select subject_id, max(asked_at) as asked_at from probes where subject_id in (${idList}) group by subject_id`,
          [json(ids)],
        )
      ).map((row) => [row.subject_id, iso(row.asked_at)]),
    );
    const financiers = new Map(
      (
        await db.query<{ entity_id: string; rounds: number }>(
          `select entity_id, count(distinct round_id)::integer as rounds from participations
           where entity_id in (${idList}) and role in (${quoted(financierRoles)}) group by entity_id`,
          [json(ids)],
        )
      ).map((row) => [row.entity_id, row.rounds]),
    );
    const registry = new Set(
      (await db.query<{ entity_id: string }>(`select entity_id from public_funders where entity_id in (${idList})`, [json(ids)])).map(
        (row) => row.entity_id,
      ),
    );

    const proposals: (ProbeProposal & { weight: number })[] = [
      {
        entity: mandate.subject,
        reason:
          mandate.role === "founder"
            ? "Your own company: an agreement it has announced can connect you to a counterparty's other partners."
            : "Your own fund: agreements it has announced, if any.",
        alreadyProbedAt: probed.get(mandate.subject.id) ?? null,
        weight: Number.MAX_SAFE_INTEGER,
      },
    ];

    for (const [id, entry] of counts) {
      // Funders are asked about through the companies they fund, not by name.
      if (id === mandate.subject.id || registry.has(id)) continue;
      if (investorKind({ registry: null, rounds: Array(financiers.get(id) ?? 0), investmentTies: 0, issuerRounds: 0 })) continue;

      proposals.push({
        entity: entry.ref,
        reason: `On ${entry.trails.size} trail${entry.trails.size === 1 ? "" : "s"} from ${mandate.subject.name}${entry.through.size > 0 ? ` through ${[...entry.through].slice(0, 3).join(", ")}` : ""}; an agreement of its own would add a dated signal or a shared counterparty.`,
        alreadyProbedAt: probed.get(id) ?? null,
        weight: entry.trails.size,
      });
    }

    return proposals
      .sort(
        (a, b) =>
          Number(Boolean(a.alreadyProbedAt)) - Number(Boolean(b.alreadyProbedAt)) ||
          b.weight - a.weight ||
          a.entity.id.localeCompare(b.entity.id),
      )
      .slice(0, 12)
      .map(({ weight: _weight, ...proposal }) => proposal);
  }

  async function checkSignals(mandateId: string, ownerId: string, entityIds: string[]): Promise<Signal[]> {
    const mandate = await mandates.getMandate(mandateId, ownerId);
    const ids = [...new Set(entityIds)].slice(0, PROBES);
    const refs = await entityRefs(db, ids);
    const pass = newPass(mandate, ids.length);

    await Promise.all(ids.map((id) => probe(pass, refs.get(id)!)));

    if (pass.unmade.length > 0) {
      await log(mandateId, { kind: "queued", message: `Not asked: ${pass.unmade.join(", ")}.` });
    }

    // New agreement edges can open trails, so the Book is ranked again from the store.
    await ensureDerived(db, context.now());
    await rankAndLog(mandate);

    return signalsOf(db, ids);
  }

  /**
   * One trail action (consensus point 11): at most five new requests around one entity of the
   * mandate. Its own record first, then its unread rounds, grants before the rest, since a round
   * is where a grantor is named and where roles settle a direction. The Book is ranked again.
   */
  async function readAround(mandateId: string, ownerId: string, entityId: string): Promise<WorkResult> {
    const mandate = await mandates.getMandate(mandateId, ownerId);
    const pass = newPass(mandate, TRAIL_ACTION);
    const entity = (await entityRefs(db, [entityId])).get(entityId)!;

    await read(pass, entity, "star");
    await ensureDerived(db, context.now());

    const rounds = new Map([...(await ownRounds(entityId, true)), ...(await ownRounds(entityId))].map((round) => [round.id, round]));

    for (const round of rounds.values()) {
      // Past the five, a round is left for another action; it was not promised.
      if (pass.stop || pass.budget.used >= pass.budget.limit) break;

      await read(pass, round, "round");
    }

    const ranked = await rankAndLog(mandate);

    return {
      mandate,
      requestsUsed: pass.budget.used,
      trailsFound: ranked.found,
      rows: ranked.rows,
      partial: pass.stop !== null || pass.unmade.length > 0,
      gaps: [...new Set([...pass.gaps, ...ranked.gaps])],
    };
  }

  return { workMandate, proposeProbes, checkSignals, readAround };
}

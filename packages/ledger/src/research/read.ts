import {
  type Brief,
  type Conclusion,
  type Coverage,
  type Dossier,
  type EntityMatch,
  type EntityRef,
  type FitLine,
  type Mandate,
  NotFoundError,
  type Signal,
  type SourceRef,
  type Trail,
} from "../contract";
import type { Db } from "../db";
import { bookRows, describeHop, describeSignal } from "./book";
import { financierRoles, recipientRoles, roundTypes } from "./relations";
import { SLUSH_EVENT_ID } from "./requests";
import { iso, json, mergeSources, nameKey, toSources, uniqueBy } from "./sql";
import { entityRefs, signalsOf, type StoredTrail, storedTrails } from "./trails";

const idList = "select jsonb_array_elements_text($1::jsonb)";
const quoted = (values: string[]) => values.map((value) => `'${value}'`).join(", ");

type EntityRow = {
  id: string;
  name: string;
  entity_type: string;
  description: string | null;
  properties: Record<string, { value: unknown; sources?: unknown }> | null;
  read_kind: string | null;
  read_at: unknown;
};

export async function entityRow(db: Db, entityId: string): Promise<EntityRow | null> {
  const [row] = await db.query<EntityRow>(
    "select id, name, entity_type, description, properties, read_kind, read_at from entities where id = $1",
    [entityId],
  );

  return row ?? null;
}

export const refOf = (row: Pick<EntityRow, "id" | "name" | "entity_type" | "description">): EntityRef => ({
  id: row.id,
  name: row.name,
  entityType: row.entity_type,
  description: row.description,
});

/** Parties by default: a search for a company should not return a round named after it. */
const partyTypes = ["Company", "Organization"];

/** Entities in the store whose name holds the words searched for, best match first. */
export async function searchStore(
  db: Db,
  name: string,
  options: { types?: string[]; limit?: number } = {},
): Promise<{ matches: EntityMatch[]; close: boolean }> {
  const key = nameKey(name);

  if (!key) return { matches: [], close: false };

  const types = (options.types?.length ? options.types : partyTypes).filter((type) => !roundTypes.has(type));
  const rows = await db.query<EntityRow & { attendee: boolean }>(
    `select e.id, e.name, e.entity_type, e.description, e.read_kind,
            exists (
              select 1 from roster where roster.entity_id = e.id and roster.event_id = $3 and roster.role = 'ATTENDEE'
            ) as attendee
     from entities e
     where e.entity_type in (${idList})
       and (e.name_key = $2 or e.name_key like $2 || ' %' or e.name_key like '% ' || $2 || '%' or e.name_key like $2 || '%')
     order by (e.name_key like $2 || '%') desc, (e.read_kind is not null) desc, attendee desc,
              (e.name_key = $2) desc, length(e.name), e.id
     limit $4`,
    [json(types), key, SLUSH_EVENT_ID, options.limit ?? 10],
  );

  return {
    matches: rows.map((row) => ({
      ...refOf(row),
      stored: row.read_kind === "star" || row.read_kind === "person",
      slushAttendee: row.attendee,
    })),
    close: rows.some((row) => nameKey(row.name).startsWith(key)),
  };
}

export async function coverage(db: Db): Promise<Coverage> {
  const [counts] = await db.query<{
    roster_size: number;
    roster_fetched_at: unknown;
    read_in_full: number;
    hubs: number;
    probes: number;
    newest: unknown;
  }>(
    `select
       (select count(*)::integer from roster where event_id = $1 and role = 'ATTENDEE') as roster_size,
       (select read_at from entities where id = $1) as roster_fetched_at,
       (select count(*)::integer from entities where read_kind in ('star', 'person')) as read_in_full,
       (select count(*)::integer from entities e where e.read_kind = 'star' and (
          exists (select 1 from public_funders f where f.entity_id = e.id)
          or (select count(distinct p.round_id) from participations p
              where p.entity_id = e.id and p.role in (${quoted(financierRoles)})) >= 3
          or ((select count(*) from ties t where t.from_id = e.id and t.family = 'investment') >= 10
              and not exists (select 1 from participations p
                              where p.entity_id = e.id and p.role in (${quoted(recipientRoles)})))
        )) as hubs,
       (select count(*)::integer from probes) as probes,
       (select max(fetched_at) from raw_responses) as newest`,
    [SLUSH_EVENT_ID],
  );
  const [latch] = await db.query<{ latched: boolean; checked_at: unknown; since: unknown }>(
    "select latched, checked_at, since from cala_latch",
  );

  return {
    rosterSize: counts?.roster_size ?? 0,
    rosterFetchedAt: iso(counts?.roster_fetched_at),
    entitiesReadInFull: counts?.read_in_full ?? 0,
    hubsRead: counts?.hubs ?? 0,
    probesStored: counts?.probes ?? 0,
    cala: latch?.latched ? "latched" : "answering",
    calaCheckedAt: iso(latch?.checked_at) ?? iso(latch?.since),
    newestFetchAt: iso(counts?.newest),
  };
}

const show = (value: unknown): string =>
  Array.isArray(value) ? value.map(show).join(", ") : typeof value === "object" && value ? JSON.stringify(value) : String(value);

/** Everything the store holds about one entity, for the source drawer. */
export async function dossier(db: Db, entityId: string): Promise<Dossier> {
  const row = await entityRow(db, entityId);

  if (!row) throw new NotFoundError("Nothing is stored about this entity.");

  const probes = await db.query<{ response_id: string; question: string; asked_at: unknown; agreements_found: number | null }>(
    "select response_id, question, asked_at, agreements_found from probes where subject_id = $1 order by asked_at desc",
    [entityId],
  );
  const claims = await db.query<{ response_id: string; text: string; passages: { source: SourceRef }[]; reason: string | null }>(
    `select response_id, text, passages, reason from probe_claims
     where subject_id = $1 and status <> 'edge' order by response_id, claim_index`,
    [entityId],
  );
  const unresolvedClaims: Dossier["unresolvedClaims"] = [];

  for (const probe of probes) {
    // A probe that found nothing says so with its date. It is not a statement that nothing exists.
    if (probe.agreements_found === 0) {
      unresolvedClaims.push({
        claim: `None found by Cala on ${iso(probe.asked_at)!.slice(0, 10)}, in answer to: ${probe.question}`,
        sources: [],
      });
    }

    for (const claim of claims.filter((one) => one.response_id === probe.response_id)) {
      unresolvedClaims.push({
        claim: claim.text,
        sources: mergeSources(claim.passages.map((passage) => passage.source)),
      });
    }
  }

  const groups = await db.query<{ entity_id: string; basis: string; key: string; status: string; decision_basis: string | null }>(
    `select other.entity_id, identity_groups.basis, identity_groups.key, identity_groups.status, identity_groups.decision_basis
     from identity_members mine
     join identity_groups on identity_groups.id = mine.group_id
     join identity_members other on other.group_id = mine.group_id and other.entity_id <> mine.entity_id
     where mine.entity_id = $1 and identity_groups.status <> 'rejected'
     order by other.entity_id`,
    [entityId],
  );
  const refs = await entityRefs(db, groups.map((group) => group.entity_id));

  return {
    entity: refOf(row),
    properties: Object.entries(row.properties ?? {})
      .filter(([name, property]) => name !== "id" && property?.value !== null && property?.value !== undefined)
      .map(([name, property]) => ({ name, value: show(property.value), sources: toSources(property.sources) })),
    signals: await signalsOf(db, [entityId]),
    unresolvedClaims,
    possibleDuplicates: groups.map((group) => ({
      entity: refs.get(group.entity_id)!,
      basis:
        group.status === "confirmed"
          ? `Recorded as the same entity (${group.basis.replaceAll("_", " ")}: ${group.decision_basis ?? "no basis noted"}); both IDs are kept.`
          : `${group.basis === "shared_domain" ? "Shares a domain" : "Same normalized name"}; a proposal, not a join.`,
    })),
    readInFull: row.read_kind === "star" || row.read_kind === "person",
    fetchedAt: iso(row.read_at),
  };
}

/** Stored trails with the mandate's conclusions attached. */
export async function withConclusions(db: Db, mandateId: string, trails: StoredTrail[]): Promise<Trail[]> {
  const rows = await db.query<{ trail_id: string; reading: string; because: string; does_not_prove: string; ask: string }>(
    "select trail_id, reading, because, does_not_prove, ask from conclusions where mandate_id = $1",
    [mandateId],
  );
  const conclusions = new Map<string, Conclusion>(
    rows.map((row) => [
      row.trail_id,
      { trailId: row.trail_id, reading: row.reading, because: row.because, doesNotProve: row.does_not_prove, ask: row.ask },
    ]),
  );

  return trails.map(({ weight: _weight, pathKey: _pathKey, ...trail }) => ({
    ...trail,
    conclusion: conclusions.get(trail.id) ?? null,
  }));
}

/**
 * The trails behind a candidate: those its Book row rests on, or for an entity without a row,
 * every stored trail that passes through it. For the subject itself, its ownership context.
 */
export async function trailsFor(db: Db, mandate: Mandate, candidateId: string): Promise<Trail[]> {
  const all = await storedTrails(db, mandate.subject, mandate.role);
  const [row] = await bookRows(db, mandate, candidateId);
  let trails: StoredTrail[];

  if (candidateId === mandate.subject.id) {
    trails = all.filter((trail) => trail.pattern === "T4");
  } else if (row) {
    const order = new Map(row.trailIds.map((id, index) => [id, index]));

    trails = all.filter((trail) => order.has(trail.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  } else {
    trails = all.filter(
      (trail) =>
        trail.hops.some((hop) => hop.to.id === candidateId) ||
        (trail.signal?.parties ?? []).some((party) => party.entity.id === candidateId),
    );
  }

  return withConclusions(db, mandate.id, trails);
}

/** Parents, subsidiaries and owners already in a stored read, each with its stored signals (T4 at one hop). */
async function ownershipOf(db: Db, entityId: string): Promise<Brief["ownership"]> {
  const ties = await db.query<{ to_id: string; relationship: string; sources: SourceRef[][] | null }>(
    `select ties.to_id, ties.relationship,
            (select jsonb_agg(edges.sources) from edges where edges.id in (select jsonb_array_elements_text(ties.edge_ids))) as sources
     from ties where ties.from_id = $1 and ties.family = 'ownership'
     order by ties.relationship, ties.to_id limit 12`,
    [entityId],
  );
  const owners = uniqueBy(ties, (tie) => tie.to_id);
  const refs = await entityRefs(db, owners.map((tie) => tie.to_id));
  const signals = await signalsOf(db, owners.map((tie) => tie.to_id));

  return owners.map((tie) => ({
    relation: tie.relationship,
    entity: refs.get(tie.to_id)!,
    signals: signals.filter((signal) => signal.entity.id === tie.to_id),
    sources: mergeSources(...(tie.sources ?? [])),
  }));
}

/** The reasons to hesitate that the evidence itself carries. Each is a limit, not a verdict. */
function hesitations(mandate: Mandate, category: string, trails: Trail[], signals: Signal[]): FitLine[] {
  const lines: FitLine[] = [];
  const hops = uniqueBy(trails.flatMap((trail) => trail.hops), (hop) => `${hop.from.id}|${hop.to.id}|${hop.family}`);

  for (const hop of hops) {
    if (hop.family === "investment" && hop.direction === "undirected") {
      lines.push({
        criterion: "Undirected tie",
        statement: `${describeHop(hop)}. No stored round's roles say who funded whom, so it is not evidence of funding.`,
        kind: "unknown",
        sources: hop.sources.slice(0, 6),
      });
    }

    if (hop.origin === "derived") {
      lines.push({
        criterion: "Reported by Cala",
        statement: `The link between ${hop.from.name} and ${hop.to.name} rests on a claim Cala reported from ${hop.sources.length} document${hop.sources.length === 1 ? "" : "s"}: "${hop.claim}" It is not an edge of Cala's graph and was not checked against other sources.`,
        kind: "observed",
        sources: hop.sources.slice(0, 6),
      });
    }
  }

  for (const signal of uniqueBy([...trails.flatMap((trail) => (trail.signal ? [trail.signal] : [])), ...signals], (one) => one.id)) {
    if (signal.flag) {
      lines.push({ criterion: "Dates disagree", statement: `${signal.label}: ${signal.flag}`, kind: "observed", sources: signal.sources.slice(0, 6) });
    }

    if (signal.valueIsProgrammeCeiling) {
      lines.push({
        criterion: "Programme ceiling",
        statement: `${signal.label}: the value is the ceiling of the whole programme, not ${signal.entity.name}'s amount.`,
        kind: "observed",
        sources: signal.sources.slice(0, 6),
      });
    }

    if (signal.publicBasis?.ours) {
      lines.push({
        criterion: "Our classification",
        statement: `Calling this public money is our classification, not Cala's (${signal.publicBasis.basis}).`,
        kind: "inferred",
        sources: [],
      });
    }
  }

  if (category === "follow_up") {
    lines.push({
      criterion: "Existing backer",
      statement: "Already tied to you. This is a follow-up target and does not count as a new investor lead.",
      kind: "observed",
      sources: [],
    });
  }

  lines.push({
    criterion: "What a trail shows",
    statement:
      mandate.role === "founder"
        ? "A trail shows a sourced connection. It does not show present appetite, a cheque size or a willingness to be introduced."
        : "A trail shows a sourced connection. It does not show that the company is raising, or that a reference will speak.",
    kind: "unknown",
    sources: [],
  });

  return uniqueBy(lines, (line) => `${line.criterion}|${line.statement}`);
}

function questionsFor(mandate: Mandate, trails: Trail[], candidate: EntityRef): string[] {
  const questions: string[] = trails.flatMap((trail) => (trail.conclusion?.ask ? [trail.conclusion.ask] : []));

  for (const trail of trails.slice(0, 3)) {
    const first = trail.hops[0]!;

    if (trail.pattern === "T2" && trail.signal) {
      questions.push(`Ask ${first.to.name} how ${trail.end.name} obtained it: ${describeSignal(trail.signal)}.`);
    } else if (trail.pattern === "T6" && trail.signal) {
      questions.push(`Ask what this covers and whether it is executed: ${describeSignal(trail.signal)}.`);
    } else if (trail.pattern === "T4" && trail.signal) {
      questions.push(`Ask how ${trail.end.name} bears on ${trail.subject.name}: ${describeSignal(trail.signal)}.`);
    } else if (mandate.role === "founder" && trail.hops.length === 3) {
      questions.push(`Ask ${first.to.name} what they know of ${candidate.name}'s work with ${trail.hops[1]!.to.name}.`);
    } else if (mandate.role === "investor" && trail.hops.length === 3) {
      questions.push(`Ask ${first.to.name} about ${trail.hops[1]!.to.name} as a co-investor, and what they have seen of ${candidate.name}.`);
    }
  }

  for (const hop of trails.flatMap((trail) => trail.hops)) {
    if (hop.family === "investment" && hop.direction === "undirected") {
      questions.push(`Confirm how ${hop.from.name} and ${hop.to.name} are tied: who invested in whom, and when.`);
    }
  }

  return [...new Set(questions)].slice(0, 8);
}

/** The brief of one Book row, assembled from stored evidence. Nothing is fetched and nothing is written. */
export async function briefFor(db: Db, mandate: Mandate, candidateId: string): Promise<Brief> {
  const [row] = await bookRows(db, mandate, candidateId);

  if (!row) throw new NotFoundError("This candidate is not in the mandate's Book.");

  const trails = await trailsFor(db, mandate, candidateId);
  const directSignals = await signalsOf(db, [candidateId]);
  const entity = await entityRow(db, candidateId);
  const onTrails = new Set(trails.flatMap((trail) => [...trail.readInFull, ...trail.seenInListOnly]));
  const readOnTrails = new Set(trails.flatMap((trail) => trail.readInFull));

  const truncated = await db.query<{ relationship: string; direction: string; requested_limit: number }>(
    "select relationship, direction, requested_limit from coverage where entity_id = $1 and truncated order by relationship",
    [candidateId],
  );
  const [probe] = await db.query<{ asked_at: unknown; agreements_found: number | null }>(
    "select asked_at, agreements_found from probes where subject_id = $1 order by asked_at desc limit 1",
    [candidateId],
  );

  const stillUnknown = [...row.unknowns];

  stillUnknown.push(
    mandate.role === "founder"
      ? `Whether ${row.candidate.name} will be at Slush is unknown; Cala's roster lists companies, not investors.`
      : `${row.candidate.name} is listed by Cala as a Slush attendee; presence and availability are not evidenced.`,
  );

  if (!probe) {
    stillUnknown.push("No signal probe has been asked about it, so its announced agreements are not in stored evidence.");
  } else if (probe.agreements_found === 0) {
    stillUnknown.push(`A signal probe found none on ${iso(probe.asked_at)!.slice(0, 10)}. That is what Cala found, not proof that nothing exists.`);
  }

  const coverageNote = [
    entity?.read_kind === "star" || entity?.read_kind === "person"
      ? `${row.candidate.name} was read in full on ${iso(entity.read_at)!.slice(0, 10)}.`
      : `${row.candidate.name} has not been read; it was seen in another entity's list.`,
    onTrails.size > 0 ? `${readOnTrails.size} of ${onTrails.size} entities on its trails were read in full.` : "",
    truncated.length > 0
      ? `These lists returned exactly their limit and may be longer: ${truncated.map((list) => `${list.relationship} ${list.direction} (${list.requested_limit})`).join(", ")}.`
      : "",
    mandate.role === "founder" ? "Round lists were read once and not reconciled, so no lead count is shown." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    mandateId: mandate.id,
    revision: mandate.revision,
    candidate: row.candidate,
    category: row.category,
    whyMeet: [{ criterion: "Reason to meet", statement: row.reason, kind: "inferred", sources: [] }, ...row.fit],
    whyHesitate: hesitations(mandate, row.category, trails, directSignals),
    trails,
    directSignals,
    ownership: await ownershipOf(db, candidateId),
    questions: questionsFor(mandate, trails, row.candidate),
    stillUnknown,
    coverageNote,
  };
}

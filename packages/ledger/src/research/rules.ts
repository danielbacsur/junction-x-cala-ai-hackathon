import type { SourceRef } from "../contract";
import type { Db } from "../db";
import { agreementLabel } from "./probes";
import { FINANCING_EVENT, filedEvents, financierRoles, recipientRoles, relations } from "./relations";
import { hashId, insertRows, mergeSources, uniqueBy } from "./sql";

/** Signals older than this many months are history, not news. Shown on screen with the Book. */
export const WINDOW_MONTHS = 24;

export function windowStart(now: Date, months = WINDOW_MONTHS): string {
  const start = new Date(now);

  start.setUTCMonth(start.getUTCMonth() - months);

  return start.toISOString().slice(0, 10);
}

const quoted = (values: string[]) => values.map((value) => `'${value}'`).join(", ");

/** The advisory lock that serializes rebuilds of the derived tables. */
const DERIVE_LOCK = 2026111401;

/**
 * Rebuilds everything computed from the stored graph, when something new was ingested since the
 * last time: the traversable ties with their direction, identity proposals, the review queue of
 * unclassified grantors, and signals. Returns true when it rebuilt.
 */
export async function ensureDerived(db: Db, now: Date): Promise<boolean> {
  const seq = async (key: string) =>
    (await db.query<{ value: string }>("select value #>> '{}' as value from store_meta where key = $1", [key]))[0]
      ?.value ?? "0";

  // The window moves with the day, so a new day is also a reason to rebuild.
  const target = `${await seq("ingest_seq")}@${windowStart(now)}`;

  if ((await seq("derived_seq")) === target) return false;

  return db.transaction(async (tx) => {
    // One rebuild at a time across processes; whoever waited here finds the work already done.
    await tx.query("select pg_advisory_xact_lock($1::bigint)", [DERIVE_LOCK]);

    const [done] = await tx.query<{ value: string }>("select value #>> '{}' as value from store_meta where key = 'derived_seq'");

    if (done?.value === target) return false;

    await rebuildTies(tx);
    await proposeIdentities(tx);
    await queueUnclassifiedFunders(tx);
    await rebuildSignals(tx, now);
    await tx.query(
      `insert into store_meta (key, value) values ('derived_seq', to_jsonb($1::text))
       on conflict (key) do update set value = excluded.value`,
      [target],
    );

    return true;
  });
}

/**
 * The traversable relation (consensus point 16.3). An investment tie is an INVESTED_IN edge in
 * either direction, or the financier and the issuer or borrower of one round. Its direction is
 * settled only by those roles in the same round; otherwise the tie is undirected, whatever
 * list it was seen in and however many ties either party has.
 */
async function rebuildTies(db: Db): Promise<void> {
  await db.query("delete from ties");

  const forward = `
    with invested as (
      select least(source_id, target_id) as a, greatest(source_id, target_id) as b,
             jsonb_agg(distinct id) as edge_ids,
             bool_or(source_id < target_id) as a_to_b, bool_or(source_id > target_id) as b_to_a
      from edges
      where relationship = 'INVESTED_IN' and source_id <> target_id
      group by 1, 2
    ),
    roles as (
      select financier.entity_id as financier, recipient.entity_id as recipient,
             jsonb_agg(distinct jsonb_build_object(
               'round_id', recipient.round_id, 'financier', financier.entity_id, 'financier_role', financier.role,
               'recipient', recipient.entity_id, 'recipient_role', recipient.role
             )) as basis
      from participations recipient
      join participations financier on financier.round_id = recipient.round_id
      where recipient.role in (${quoted(recipientRoles)}) and financier.role in (${quoted(financierRoles)})
        and financier.entity_id <> recipient.entity_id
      group by 1, 2
    ),
    pairs as (
      select a, b from invested
      union
      select least(financier, recipient), greatest(financier, recipient) from roles
    )
    select pairs.a, pairs.b,
           invested.a is not null as has_edge,
           coalesce(invested.edge_ids, '[]'::jsonb) as edge_ids,
           coalesce(invested.a_to_b, false) as a_to_b, coalesce(invested.b_to_a, false) as b_to_a,
           a_funds.basis as a_funds_b, b_funds.basis as b_funds_a
    from pairs
    left join invested on invested.a = pairs.a and invested.b = pairs.b
    left join roles a_funds on a_funds.financier = pairs.a and a_funds.recipient = pairs.b
    left join roles b_funds on b_funds.financier = pairs.b and b_funds.recipient = pairs.a`;

  // Each pair goes in twice, once from either end. Roles that point both ways settle nothing.
  for (const [from, to, funds, funded, stated, statedBack] of [
    ["a", "b", "a_funds_b", "b_funds_a", "a_to_b", "b_to_a"],
    ["b", "a", "b_funds_a", "a_funds_b", "b_to_a", "a_to_b"],
  ]) {
    await db.query(
      `insert into ties (from_id, to_id, family, relationship, direction, direction_basis, stated, origin, key, edge_ids)
       select ${from}, ${to}, 'investment',
              case when has_edge then 'INVESTED_IN' else 'ROUND_PARTICIPATION' end,
              case when ${funds} is not null and ${funded} is null then 'from_funds_to'
                   when ${funded} is not null and ${funds} is null then 'to_funds_from'
                   else 'undirected' end,
              coalesce(${funds}, '[]'::jsonb) || coalesce(${funded}, '[]'::jsonb),
              case when ${stated} and ${statedBack} then 'both' when ${stated} then 'from_to'
                   when ${statedBack} then 'to_from' else 'none' end,
              'native', 'investment:' || a || ':' || b, edge_ids
       from (${forward}) as resolved`,
    );
  }

  const named = relations.filter((relation) => relation.family === "ownership" || relation.family === "person");
  const inverses = named.map((relation) => `('${relation.type}', '${relation.inverse ?? relation.type}')`).join(", ");

  // Ownership and people keep Cala's orientation; walked backwards the hop takes the inverse name.
  await db.query(
    `insert into ties (from_id, to_id, family, relationship, direction, role, origin, key, edge_ids)
     select source_id, target_id, family, relationship, 'not_applicable', max(role), 'native',
            family || ':' || relationship || ':' || source_id || ':' || target_id, jsonb_agg(distinct id)
     from edges
     where family in ('ownership', 'person') and origin = 'native' and source_id <> target_id
     group by source_id, target_id, family, relationship`,
  );
  await db.query(
    `insert into ties (from_id, to_id, family, relationship, direction, role, origin, key, edge_ids)
     select target_id, source_id, family, inverse.name, 'not_applicable', max(role), 'native',
            family || ':' || relationship || ':' || source_id || ':' || target_id, jsonb_agg(distinct id)
     from edges
     join (values ${inverses}) as inverse(type, name) on inverse.type = edges.relationship
     where family in ('ownership', 'person') and origin = 'native' and source_id <> target_id
     group by source_id, target_id, family, relationship, inverse.name`,
  );

  // One agreement tie per pair, however many claims report agreements between the two.
  for (const [from, to] of [
    ["a", "b"],
    ["b", "a"],
  ]) {
    await db.query(
      `insert into ties (from_id, to_id, family, relationship, direction, origin, key, edge_ids)
       select ${from}, ${to}, 'agreement', 'AGREEMENT', 'not_applicable', 'derived', 'agreement:' || a || ':' || b, edge_ids
       from (
         select least(source_id, target_id) as a, greatest(source_id, target_id) as b, jsonb_agg(distinct id) as edge_ids
         from edges
         where family = 'agreement' and origin = 'derived' and source_id <> target_id
         group by 1, 2
       ) as agreed`,
    );
  }
}

/**
 * Entities that may be the same: an identical normalized name, or a shared domain. These are
 * proposals for a person to decide. People are never grouped by name, and no trail crosses IDs
 * on the strength of a proposal.
 */
async function proposeIdentities(db: Db): Promise<void> {
  const groups = await db.query<{ basis: string; key: string; members: string[] }>(
    `select 'same_normalized_name' as basis, name_key as key, jsonb_agg(id order by id) as members
     from entities
     where entity_type in ('Company', 'Organization') and name_key <> ''
     group by name_key having count(*) > 1
     union all
     select 'shared_domain', target_id, jsonb_agg(distinct source_id)
     from edges
     where relationship = 'HAS_DOMAIN_NAME'
     group by target_id having count(distinct source_id) > 1`,
  );

  const rows = groups.map((group) => ({ id: hashId("identity", group.basis, group.key), ...group }));

  await insertRows(
    db,
    rows,
    `insert into identity_groups (id, basis, key)
     select x.id, x.basis, x.key from jsonb_to_recordset($1::jsonb) as x(id text, basis text, key text)
     on conflict (id) do nothing`,
  );
  await insertRows(
    db,
    rows.flatMap((group) => group.members.map((entity_id) => ({ group_id: group.id, entity_id }))),
    `insert into identity_members (group_id, entity_id)
     select x.group_id, x.entity_id from jsonb_to_recordset($1::jsonb) as x(group_id text, entity_id text)
     on conflict do nothing`,
  );
}

/** Records that two or more IDs are one entity. Both IDs stay; nothing is merged. */
export async function confirmIdentity(
  db: Db,
  input: { entityIds: string[]; basis: "legal_identifier" | "source_supported"; evidence: string; reviewer: string },
): Promise<string> {
  const members = [...new Set(input.entityIds)].sort();
  const id = hashId("identity", "confirmed", members.join("|"));

  await db.transaction(async (tx) => {
    await tx.query(
      `insert into identity_groups (id, basis, key, status, reviewer, decision_basis, decided_at)
       values ($1, $2, $3, 'confirmed', $4, $5, clock_timestamp())
       on conflict (id) do update set
         status = 'confirmed', reviewer = excluded.reviewer, decision_basis = excluded.decision_basis,
         decided_at = excluded.decided_at`,
      [id, input.basis, members.join("|"), input.reviewer, input.evidence],
    );

    for (const entityId of members) {
      await tx.query("insert into identity_members (group_id, entity_id) values ($1, $2) on conflict do nothing", [
        id,
        entityId,
      ]);
    }
  });

  return id;
}

/** A grantor or lender outside the registry waits for review. It is never added by itself. */
async function queueUnclassifiedFunders(db: Db): Promise<void> {
  await db.query(
    `insert into public_funder_review (entity_id, name, roles, first_seen_in)
     select participations.entity_id, coalesce(max(entities.name), participations.entity_id),
            jsonb_agg(distinct participations.role), min(participations.response_id)
     from participations
     left join entities on entities.id = participations.entity_id
     where participations.role in ('GRANTOR', 'LENDER')
       and not exists (select 1 from public_funders where public_funders.entity_id = participations.entity_id)
     group by participations.entity_id
     on conflict (entity_id) do update set roles = excluded.roles`,
  );
}

type RoundRow = {
  id: string;
  entity_type: string;
  name: string | null;
  event_type: string | null;
  instrument: string | null;
  transaction_value: number | null;
  transaction_value_units: string | null;
  announcement_date: string | null;
  close_date: string | null;
  event_date: string | null;
  aliases: string[] | null;
  annotations: string[] | null;
  sources: SourceRef[];
  read_at: unknown;
  participants: {
    entity_id: string;
    name: string | null;
    role: string;
    event_date: string | null;
    sources: SourceRef[];
  }[];
};

type Funder = { entity_id: string; label: string; basis: string; ours: boolean };

const day = 24 * 60 * 60 * 1000;

function spanDays(dates: string[]): number {
  const times = dates.map((date) => Date.parse(date)).filter((time) => !Number.isNaN(time));

  return times.length < 2 ? 0 : (Math.max(...times) - Math.min(...times)) / day;
}

/**
 * Why a round's date cannot be taken as one dated fact (consensus point 12). The rules are
 * conservative detectors, not proof that an unflagged record is clean.
 */
export function dateFlag(round: Pick<RoundRow, "entity_type" | "aliases" | "annotations">, sources: SourceRef[]): string | null {
  const filings = uniqueBy(
    sources.filter((source) => source.rank === "FILING" && source.url),
    (source) => source.url!,
  );

  if (filings.length > 1) {
    const dates = filings.map((filing) => filing.date ?? "undated").sort();

    return `Cites ${filings.length} separate register entries (dated ${dates.join(" and ")}); the record may hold several awards, so it is not counted as one dated award.`;
  }

  if (round.entity_type !== "FundingRound") return null;

  const stated = (round.annotations ?? []).filter((note) => note.startsWith("round_label_stated:"));

  if ((round.aliases ?? []).length > 0 || stated.length > 1) {
    return `Cala lists more than one label for this round (${[...(round.aliases ?? [])].join(", ")}); it may combine several closings.`;
  }

  // Unlabelled and aggregator sources carry the day they were crawled, not the day of the news.
  const dated = sources
    .filter((source) => source.date && source.rank && source.rank !== "AGGREGATOR")
    .map((source) => source.date!);

  if (spanDays(dated) > 120) {
    const sorted = [...dated].sort();

    return `Its sources span ${sorted[0]} to ${sorted[sorted.length - 1]}; the record may combine more than one closing.`;
  }

  return null;
}

const eventLabels: Record<string, string> = {
  MATERIAL_AGREEMENT_ANNOUNCED: "Material agreement announced",
  MANAGEMENT_OR_BOARD_CHANGE: "Management or board change",
  LISTING_STATUS_CHANGE: "Listing status change",
};

function names(parties: { name: string | null; entity_id: string }[]): string {
  const listed = parties.slice(0, 3).map((party) => party.name ?? party.entity_id);

  return parties.length > 3 ? `${listed.join(", ")} and ${parties.length - 3} more` : listed.join(" and ");
}

/**
 * Signals (consensus point 16.4): dated, sourced facts on an entity. Public money needs a body
 * from the registry among the financiers; a grant or loan from anyone else stays a financing
 * with its instrument shown. A board appointment makes no signal here: it is a board change and
 * says nothing about control.
 */
async function rebuildSignals(db: Db, now: Date): Promise<void> {
  await db.query("delete from signals");

  const funders = new Map(
    (await db.query<Funder>("select entity_id, label, basis, ours from public_funders")).map((row) => [row.entity_id, row]),
  );
  const signals: Record<string, unknown>[] = [];

  const rounds = await db.query<RoundRow>(
    `select rounds.*, parties.participants
     from rounds
     join lateral (
       select jsonb_agg(jsonb_build_object(
         'entity_id', p.entity_id, 'name', e.name, 'role', p.role, 'event_date', p.event_date, 'sources', p.sources
       )) as participants
       from participations p left join entities e on e.id = p.entity_id
       where p.round_id = rounds.id
     ) as parties on true
     where exists (
       select 1 from participations p
       where p.round_id = rounds.id and p.role in (${quoted(recipientRoles)})
     )`,
  );

  // Which pairs already carry public money from a round, so a bare tie does not repeat it.
  const funded = new Set<string>();

  for (const round of rounds) {
    const kind = round.entity_type === "FundingRound" ? FINANCING_EVENT : (round.event_type ?? round.name ?? "");

    if (kind !== FINANCING_EVENT && !filedEvents.has(kind)) continue;

    // The same participation is often seen on two reads; one party per entity and role.
    const parties = uniqueBy(round.participants ?? [], (party) => `${party.entity_id}|${party.role}`);
    const recipients = parties.filter((party) => recipientRoles.includes(party.role));
    const financiers = parties.filter((party) => financierRoles.includes(party.role));
    const publicFunder = financiers.map((party) => funders.get(party.entity_id)).find(Boolean);

    for (const recipient of recipients) {
      const own = (round.participants ?? []).filter((party) => party.entity_id === recipient.entity_id);
      const sources = mergeSources(round.sources, ...own.map((party) => party.sources));
      const eventDate = round.event_date ?? own.find((party) => party.event_date)?.event_date ?? null;
      const reported = sources.map((source) => source.date).filter(Boolean).sort()[0] ?? null;

      const [date, dateKind] = eventDate
        ? [eventDate, "event_date"]
        : round.announcement_date
          ? [round.announcement_date, "announcement_date"]
          : round.close_date
            ? [round.close_date, "close_date"]
            : reported
              ? [reported, "reported_on"]
              : [null, null];

      let type = "financing";
      let label: string;

      if (filedEvents.has(kind)) {
        type = "filed_event";
        label = eventLabels[kind] ?? kind;
      } else {
        if (publicFunder) type = "public_money";

        const grantors = financiers.filter((party) => party.role === "GRANTOR");
        const lenders = financiers.filter((party) => party.role === "LENDER");
        const title = round.entity_type === "FundingRound" ? (round.name ?? "Funding round") : "Financing";

        label =
          grantors.length > 0
            ? `Grant from ${names(grantors)}`
            : lenders.length > 0
              ? `Loan from ${names(lenders)}`
              : financiers.length > 0
                ? `${title} with ${names(financiers)}`
                : `${title} (financiers not in stored reads)`;
      }

      if (type === "public_money") {
        for (const financier of financiers) {
          if (funders.has(financier.entity_id)) funded.add(`${recipient.entity_id}|${financier.entity_id}`);
        }
      }

      signals.push({
        id: hashId("round", round.id, recipient.entity_id),
        type,
        entity_id: recipient.entity_id,
        label,
        date,
        date_kind: dateKind,
        value: round.transaction_value,
        units: round.transaction_value_units,
        value_is_programme_ceiling: false,
        instrument: round.instrument,
        parties: [recipient, ...financiers].map((party) => ({ entity_id: party.entity_id, role: party.role })),
        origin: "native",
        claim: null,
        public_basis:
          type === "public_money" && publicFunder
            ? { basis: `${publicFunder.label}: ${publicFunder.basis}`, ours: publicFunder.ours }
            : null,
        flag: dateFlag(round, sources),
        sources: mergeSources(sources, ...financiers.map((party) => party.sources)),
        basis_id: round.id,
      });
    }
  }

  // An investment tie to a registry body with no roles to settle it: public money next to the
  // entity, worded as a tie and never as funding.
  const publicTies = await db.query<{
    from_id: string;
    to_id: string;
    key: string;
    name: string | null;
    edges: { valid_since: string | null; sources: SourceRef[] }[];
  }>(
    `select ties.from_id, ties.to_id, ties.key, entities.name,
            (select jsonb_agg(jsonb_build_object('valid_since', edges.valid_since, 'sources', edges.sources))
             from edges where edges.id in (select jsonb_array_elements_text(ties.edge_ids))) as edges
     from ties
     join public_funders on public_funders.entity_id = ties.to_id
     left join entities on entities.id = ties.to_id
     where ties.family = 'investment' and ties.direction = 'undirected'
       and not exists (select 1 from public_funders own where own.entity_id = ties.from_id)`,
  );

  for (const tie of publicTies) {
    if (funded.has(`${tie.from_id}|${tie.to_id}`)) continue;

    const funder = funders.get(tie.to_id)!;
    const sources = mergeSources(...(tie.edges ?? []).map((edge) => edge.sources));
    const since = (tie.edges ?? []).map((edge) => edge.valid_since).filter(Boolean).sort()[0] ?? null;
    const reported = sources.map((source) => source.date).filter(Boolean).sort()[0] ?? null;

    signals.push({
      id: hashId("tie", tie.key, tie.from_id),
      type: "public_money",
      entity_id: tie.from_id,
      label: `Investment tie with ${tie.name ?? funder.label} (direction not settled)`,
      date: since ?? reported,
      date_kind: since ? "event_date" : reported ? "reported_on" : null,
      value: null,
      units: null,
      value_is_programme_ceiling: false,
      instrument: null,
      parties: [
        { entity_id: tie.from_id, role: null },
        { entity_id: tie.to_id, role: null },
      ],
      origin: "native",
      claim: null,
      public_basis: { basis: `${funder.label}: ${funder.basis}`, ours: funder.ours },
      flag: null,
      sources,
      basis_id: tie.key,
    });
  }

  // Agreements Cala reported, one signal on each party, with the claim they rest on.
  const agreements = await db.query<{
    id: string;
    source_id: string;
    target_id: string;
    relationship: string;
    claim: string | null;
    properties: {
      date: string | null;
      status: string | null;
      value: number | null;
      units: string | null;
      value_is_programme_ceiling: boolean | null;
    };
    sources: SourceRef[];
    source_name: string | null;
    target_name: string | null;
  }>(
    `select edges.id, edges.source_id, edges.target_id, edges.relationship, edges.claim, edges.properties, edges.sources,
            source.name as source_name, target.name as target_name
     from edges
     left join entities source on source.id = edges.source_id
     left join entities target on target.id = edges.target_id
     where edges.family = 'agreement' and edges.origin = 'derived'`,
  );

  for (const edge of agreements) {
    for (const [entity, other, otherName] of [
      [edge.source_id, edge.target_id, edge.target_name],
      [edge.target_id, edge.source_id, edge.source_name],
    ] as const) {
      signals.push({
        id: hashId("agreement", edge.id, entity),
        type: "agreement",
        entity_id: entity,
        label: agreementLabel(edge.relationship, otherName ?? other, edge.properties.status),
        date: edge.properties.date,
        // A date in a claim is the day Cala reports for the agreement, executed or announced.
        date_kind: edge.properties.date
          ? edge.properties.status === "executed"
            ? "event_date"
            : "announcement_date"
          : null,
        value: edge.properties.value,
        units: edge.properties.units,
        value_is_programme_ceiling: edge.properties.value_is_programme_ceiling === true,
        instrument: null,
        parties: [
          { entity_id: entity, role: null },
          { entity_id: other, role: null },
        ],
        origin: "derived",
        claim: edge.claim,
        public_basis: null,
        flag: null,
        sources: edge.sources,
        basis_id: edge.id,
      });
    }
  }

  // An ownership edge that began inside the window. Board seats are left out on purpose.
  const owned = await db.query<{
    id: string;
    source_id: string;
    target_id: string;
    relationship: string;
    valid_since: string;
    sources: SourceRef[];
    source_name: string | null;
    target_name: string | null;
  }>(
    `select edges.id, edges.source_id, edges.target_id, edges.relationship, edges.valid_since, edges.sources,
            source.name as source_name, target.name as target_name
     from edges
     left join entities source on source.id = edges.source_id
     left join entities target on target.id = edges.target_id
     where edges.family = 'ownership' and edges.valid_since >= $1`,
    [windowStart(now)],
  );

  for (const edge of owned) {
    for (const entity of [edge.source_id, edge.target_id]) {
      signals.push({
        id: hashId("ownership", edge.id, entity),
        type: "control_change",
        entity_id: entity,
        label: `Ownership record since ${edge.valid_since}: ${edge.source_name ?? edge.source_id} ${edge.relationship} ${edge.target_name ?? edge.target_id}`,
        date: edge.valid_since,
        date_kind: "event_date",
        value: null,
        units: null,
        value_is_programme_ceiling: false,
        instrument: null,
        parties: [
          { entity_id: edge.source_id, role: null },
          { entity_id: edge.target_id, role: null },
        ],
        origin: "native",
        claim: null,
        public_basis: null,
        flag: null,
        sources: edge.sources,
        basis_id: edge.id,
      });
    }
  }

  await insertRows(
    db,
    uniqueBy(signals, (signal) => String(signal.id)),
    `insert into signals
       (id, type, entity_id, label, date, date_kind, value, units, value_is_programme_ceiling, instrument, parties,
        origin, claim, public_basis, flag, sources, basis_id)
     select x.id, x.type, x.entity_id, x.label, x.date, x.date_kind, x.value, x.units, x.value_is_programme_ceiling,
            x.instrument, x.parties, x.origin, x.claim, x.public_basis, x.flag, x.sources, x.basis_id
     from jsonb_to_recordset($1::jsonb) as x(
       id text, type text, entity_id text, label text, date text, date_kind text, value double precision, units text,
       value_is_programme_ceiling boolean, instrument text, parties jsonb, origin text, claim text,
       public_basis jsonb, flag text, sources jsonb, basis_id text
     )`,
  );
}

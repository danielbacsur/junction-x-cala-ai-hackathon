import type { EntityRef, Hop, RelationFamily, Role, Signal, SourceRef, Trail, TrailPattern } from "../contract";
import type { Db } from "../db";
import { SLUSH_EVENT_ID } from "./requests";
import { windowStart } from "./rules";
import { bestRank, hashId, insertRows, json, mergeSources, rankValue, uniqueBy } from "./sql";

/** A trail as stored: everything in the contract but the mandate's conclusion, plus what ranks it. */
export type StoredTrail = Omit<Trail, "conclusion"> & { weight: number; pathKey: string };

/** At most this many trails are kept per end, and per subject, strongest first. */
const PER_END = 6;
const PER_SUBJECT = 400;

/** One typed path: its nodes from the subject outwards and the family of each hop. */
type Path = { nodes: string[]; families: RelationFamily[]; shape: Shape };

type Shape = "shared_backer" | "backer_of_sibling" | "shared_counterparty" | "ownership" | "anchor_backer" | "anchor_counterparty";

type TieRow = {
  from_id: string;
  to_id: string;
  family: RelationFamily;
  relationship: string;
  direction: Hop["direction"];
  direction_basis: { round_id: string; financier: string; financier_role: string; recipient: string }[];
  role: string | null;
  origin: Hop["origin"];
  key: string;
  edge_ids: string[];
};

type EdgeRow = {
  id: string;
  relationship: string;
  valid_since: string | null;
  valid_until: string | null;
  claim: string | null;
  properties: { date?: string | null; status?: string | null };
  sources: SourceRef[];
};

export type SignalRow = {
  id: string;
  type: Signal["type"];
  entity_id: string;
  label: string;
  date: string | null;
  date_kind: Signal["dateKind"];
  value: number | null;
  units: string | null;
  value_is_programme_ceiling: boolean;
  instrument: string | null;
  parties: { entity_id: string; role: string | null }[];
  origin: Signal["origin"];
  claim: string | null;
  public_basis: Signal["publicBasis"];
  flag: string | null;
  sources: SourceRef[];
};

const idList = "select jsonb_array_elements_text($1::jsonb)";

/** I is taken as a backer of X when roles say so, or when Cala's own edge runs from I to X. */
const backs = (tie: string) =>
  `(${tie}.direction = 'to_funds_from' or (${tie}.direction = 'undirected' and ${tie}.stated in ('to_from', 'both')))`;
const backedBy = (tie: string) =>
  `(${tie}.direction = 'from_funds_to' or (${tie}.direction = 'undirected' and ${tie}.stated in ('from_to', 'both')))`;

/**
 * The typed patterns of consensus point 16.5, each a join over the ties table. There is no
 * free search: a path exists only in one of these shapes, never repeats a node, and has at most
 * three hops. The stated orientation of an INVESTED_IN edge chooses candidates here; it never
 * settles which way the money went.
 */
async function findPaths(db: Db, subjectId: string, mode: Role): Promise<Path[]> {
  const paths: Path[] = [];
  const rows = (sql: string, params: unknown[] = [subjectId]) => db.query<Record<string, string>>(sql, params);

  if (mode === "founder") {
    // T1 and T2: S – I – C, where I backs both.
    for (const row of await rows(
      `select t1.to_id as i, t2.to_id as c
       from ties t1
       join ties t2 on t2.from_id = t1.to_id and t2.family = 'investment'
       where t1.from_id = $1 and t1.family = 'investment' and ${backs("t1")} and ${backedBy("t2")}
         and t2.to_id <> $1
       limit 5000`,
    )) {
      paths.push({ nodes: [subjectId, row.i!, row.c!], families: ["investment", "investment"], shape: "shared_backer" });
    }

    // T1 continued to the sibling's other backers, who are the founder's candidates.
    for (const row of await rows(
      `select t1.to_id as i, t2.to_id as c, t3.to_id as k
       from ties t1
       join ties t2 on t2.from_id = t1.to_id and t2.family = 'investment'
       join ties t3 on t3.from_id = t2.to_id and t3.family = 'investment'
       where t1.from_id = $1 and t1.family = 'investment' and ${backs("t1")} and ${backedBy("t2")} and ${backs("t3")}
         and t2.to_id <> $1 and t3.to_id <> $1 and t3.to_id <> t1.to_id
         and not exists (
           select 1 from ties own where own.from_id = $1 and own.to_id = t3.to_id and own.family = 'investment'
         )
       limit 5000`,
    )) {
      paths.push({
        nodes: [subjectId, row.i!, row.c!, row.k!],
        families: ["investment", "investment", "investment"],
        shape: "backer_of_sibling",
      });
    }
  } else {
    const cohort = "join roster on roster.entity_id = t2.to_id and roster.event_id = $2 and roster.role = 'ATTENDEE'";
    const fresh = `not exists (
      select 1 from ties own where own.from_id = $1 and own.to_id = t2.to_id and own.family = 'investment'
    )`;

    // T1 and T2 from each portfolio anchor: F – A – I – C. The fund-to-anchor hop stays in the path.
    for (const row of await rows(
      `select t0.to_id as a, t1.to_id as i, t2.to_id as c
       from ties t0
       join ties t1 on t1.from_id = t0.to_id and t1.family = 'investment'
       join ties t2 on t2.from_id = t1.to_id and t2.family = 'investment'
       ${cohort}
       where t0.from_id = $1 and t0.family = 'investment' and t0.direction <> 'to_funds_from'
         and ${backs("t1")} and ${backedBy("t2")}
         and t1.to_id <> $1 and t2.to_id <> $1 and t2.to_id <> t0.to_id and ${fresh}
       limit 5000`,
      [subjectId, SLUSH_EVENT_ID],
    )) {
      paths.push({
        nodes: [subjectId, row.a!, row.i!, row.c!],
        families: ["investment", "investment", "investment"],
        shape: "anchor_backer",
      });
    }

    // T6 from each anchor: F – A – X – C over agreement edges.
    for (const row of await rows(
      `select t0.to_id as a, t1.to_id as x, t2.to_id as c
       from ties t0
       join ties t1 on t1.from_id = t0.to_id and t1.family = 'agreement'
       join ties t2 on t2.from_id = t1.to_id and t2.family = 'agreement'
       ${cohort}
       where t0.from_id = $1 and t0.family = 'investment' and t0.direction <> 'to_funds_from'
         and t1.to_id <> $1 and t2.to_id <> $1 and t2.to_id <> t0.to_id and ${fresh}
       limit 5000`,
      [subjectId, SLUSH_EVENT_ID],
    )) {
      paths.push({
        nodes: [subjectId, row.a!, row.x!, row.c!],
        families: ["investment", "agreement", "agreement"],
        shape: "anchor_counterparty",
      });
    }
  }

  // T6: S – X – C over agreement edges.
  for (const row of await rows(
    `select t1.to_id as x, t2.to_id as c
     from ties t1
     join ties t2 on t2.from_id = t1.to_id and t2.family = 'agreement'
     where t1.from_id = $1 and t1.family = 'agreement' and t2.to_id <> $1
     limit 5000`,
  )) {
    paths.push({ nodes: [subjectId, row.x!, row.c!], families: ["agreement", "agreement"], shape: "shared_counterparty" });
  }

  // T4 at one hop: a parent, subsidiary or owner already in a stored read.
  for (const row of await rows(
    `select distinct to_id as o from ties where from_id = $1 and family = 'ownership' order by to_id limit 50`,
  )) {
    paths.push({ nodes: [subjectId, row.o!], families: ["ownership"], shape: "ownership" });
  }

  return paths;
}

/** Entity references for a set of IDs. An ID the store has never named keeps its ID as its name. */
export async function entityRefs(db: Db, ids: Iterable<string>): Promise<Map<string, EntityRef>> {
  const wanted = [...new Set(ids)];
  const refs = new Map<string, EntityRef>();

  if (wanted.length > 0) {
    for (const row of await db.query<{ id: string; name: string; entity_type: string; description: string | null }>(
      `select id, name, entity_type, description from entities where id in (${idList})`,
      [json(wanted)],
    )) {
      refs.set(row.id, { id: row.id, name: row.name, entityType: row.entity_type, description: row.description });
    }
  }

  for (const id of wanted) {
    if (!refs.has(id)) refs.set(id, { id, name: id, entityType: "Unknown", description: null });
  }

  return refs;
}

export function toSignal(row: SignalRow, refs: Map<string, EntityRef>): Signal {
  const ref = (id: string) => refs.get(id) ?? { id, name: id, entityType: "Unknown", description: null };

  return {
    id: row.id,
    type: row.type,
    entity: ref(row.entity_id),
    label: row.label,
    date: row.date,
    dateKind: row.date_kind,
    value: row.value,
    units: row.units,
    valueIsProgrammeCeiling: row.value_is_programme_ceiling,
    instrument: row.instrument,
    parties: (row.parties ?? []).map((party) => ({ entity: ref(party.entity_id), role: party.role })),
    origin: row.origin,
    claim: row.claim,
    publicBasis: row.public_basis,
    flag: row.flag,
    sources: row.sources ?? [],
  };
}

/** Stored signals of the given entities, newest first, as contract Signals. */
export async function signalsOf(db: Db, entityIds: string[]): Promise<Signal[]> {
  if (entityIds.length === 0) return [];

  const rows = await db.query<SignalRow>(
    `select * from signals where entity_id in (${idList}) order by date desc nulls last, id`,
    [json(entityIds)],
  );
  const refs = await entityRefs(db, rows.flatMap((row) => [row.entity_id, ...row.parties.map((party) => party.entity_id)]));

  return rows.map((row) => toSignal(row, refs));
}

/** A signal counts as dated when its date is the event's own and nothing flags the record. */
export function isDated(signal: Pick<Signal, "date" | "dateKind" | "flag"> | null): boolean {
  return Boolean(signal?.date) && signal?.dateKind !== "reported_on" && !signal?.flag;
}

/**
 * A signal is attached to a trail unless it is cleanly dated before the window. Flagged and
 * undated records stay as context: they are shown and never compared for recency.
 */
function inWindow(signal: Signal, start: string): boolean {
  return !(signal.date && !signal.flag && signal.date < start);
}

const undirected = (trail: StoredTrail) =>
  trail.hops.filter((hop) => hop.family === "investment" && hop.direction === "undirected").length;

/**
 * Strongest first: fewer hops, a dated signal, a more recent one, better sources. Between equals,
 * the trail with more settled directions and more entities read in full, then the less damped.
 */
export function compareTrails(a: StoredTrail, b: StoredTrail): number {
  return (
    a.hopCount - b.hopCount ||
    Number(isDated(b.signal)) - Number(isDated(a.signal)) ||
    (isDated(a.signal) && isDated(b.signal) ? b.signal!.date!.localeCompare(a.signal!.date!) : 0) ||
    Number(Boolean(b.signal)) - Number(Boolean(a.signal)) ||
    rankValue(b.weakestSourceRank) - rankValue(a.weakestSourceRank) ||
    undirected(a) - undirected(b) ||
    a.seenInListOnly.length - b.seenInListOnly.length ||
    b.weight - a.weight ||
    a.id.localeCompare(b.id)
  );
}

/**
 * How many trails reach one end over different relationships. The same path with another signal
 * is the same trail, and six paths that all enter the end over one edge are one trail too: at
 * each step the trails can share no relationship, so the narrowest step sets the count.
 */
function independentTrails(group: StoredTrail[]): number {
  const byLength = new Map<number, string[][]>();

  for (const key of new Set(group.map((trail) => trail.pathKey))) {
    const steps = key.split("+");

    byLength.set(steps.length, [...(byLength.get(steps.length) ?? []), steps]);
  }

  let most = 1;

  for (const [length, paths] of byLength) {
    const narrowest = Math.min(
      ...Array.from({ length }, (_, step) => new Set(paths.map((path) => path[step])).size),
    );

    most = Math.max(most, narrowest);
  }

  return most;
}

/**
 * Finds the subject's trails in the store and replaces its stored set. Every hop carries its own
 * sources; a hop whose direction no round's roles settle is stored as undirected. The cap is a
 * parameter so a test can reach it with a handful of records.
 */
export async function computeTrails(
  db: Db,
  subject: EntityRef,
  mode: Role,
  now: Date,
  cap = PER_SUBJECT,
): Promise<StoredTrail[]> {
  const paths = uniqueBy(await findPaths(db, subject.id, mode), (path) => `${path.shape}|${path.nodes.join(">")}`).filter(
    (path) => new Set(path.nodes).size === path.nodes.length,
  );

  const hopKey = (from: string, to: string, family: string) => `${from}|${to}|${family}`;
  const wantedHops = uniqueBy(
    paths.flatMap((path) =>
      path.families.map((family, index) => ({ f: path.nodes[index]!, t: path.nodes[index + 1]!, fam: family })),
    ),
    (hop) => hopKey(hop.f, hop.t, hop.fam),
  );

  const ties = new Map<string, TieRow>();

  for (let start = 0; start < wantedHops.length; start += 500) {
    for (const tie of await db.query<TieRow>(
      `select ties.* from ties
       join jsonb_to_recordset($1::jsonb) as x(f text, t text, fam text)
         on x.f = ties.from_id and x.t = ties.to_id and x.fam = ties.family
       order by ties.relationship`,
      [json(wantedHops.slice(start, start + 500))],
    )) {
      // Two ownership edges between one pair make one hop; the first by name stands for both.
      const key = hopKey(tie.from_id, tie.to_id, tie.family);

      if (!ties.has(key)) ties.set(key, tie);
    }
  }

  const edgeIds = [...new Set([...ties.values()].flatMap((tie) => tie.edge_ids))];
  const edges = new Map<string, EdgeRow>();

  for (let start = 0; start < edgeIds.length; start += 2000) {
    for (const edge of await db.query<EdgeRow>(
      `select id, relationship, valid_since, valid_until, claim, properties, sources from edges where id in (${idList})`,
      [json(edgeIds.slice(start, start + 2000))],
    )) {
      edges.set(edge.id, edge);
    }
  }

  // The participations that settle a direction, for the hop's sources and its relationship name.
  const basis = uniqueBy(
    [...ties.values()].flatMap((tie) => tie.direction_basis ?? []),
    (entry) => `${entry.round_id}|${entry.financier}|${entry.recipient}`,
  );
  const roleSources = new Map<string, SourceRef[]>();
  const roundTypes = new Map<string, string>();

  if (basis.length > 0) {
    for (const row of await db.query<{ round_id: string; entity_id: string; sources: SourceRef[]; entity_type: string }>(
      `select p.round_id, p.entity_id, p.sources, rounds.entity_type
       from participations p join rounds on rounds.id = p.round_id
       where p.round_id in (${idList})`,
      [json([...new Set(basis.map((entry) => entry.round_id))])],
    )) {
      const key = `${row.round_id}|${row.entity_id}`;

      roleSources.set(key, mergeSources(roleSources.get(key), row.sources));
      roundTypes.set(row.round_id, row.entity_type);
    }
  }

  const ends = [...new Set(paths.map((path) => path.nodes[path.nodes.length - 1]!))];
  const endSignals = new Map<string, SignalRow[]>();

  for (let start = 0; start < ends.length; start += 2000) {
    for (const row of await db.query<SignalRow>(
      `select * from signals where entity_id in (${idList}) order by date desc nulls last, id`,
      [json(ends.slice(start, start + 2000))],
    )) {
      endSignals.set(row.entity_id, [...(endSignals.get(row.entity_id) ?? []), row]);
    }
  }

  const nodeIds = new Set(paths.flatMap((path) => path.nodes));

  for (const rows of endSignals.values()) {
    for (const row of rows) for (const party of row.parties) nodeIds.add(party.entity_id);
  }

  const refs = await entityRefs(db, nodeIds);
  const read = new Set(
    (
      await db.query<{ id: string }>(
        `select id from entities where read_kind in ('star', 'person') and id in (${idList})`,
        [json([...nodeIds])],
      )
    ).map((row) => row.id),
  );
  const portfolio = new Map(
    (
      await db.query<{ from_id: string; size: number }>(
        `select from_id, count(*)::integer as size from ties
         where family = 'investment' and from_id in (${idList}) group by from_id`,
        [json([...nodeIds])],
      )
    ).map((row) => [row.from_id, row.size]),
  );

  const hop = (from: string, to: string, family: RelationFamily): Hop | null => {
    const tie = ties.get(hopKey(from, to, family));

    if (!tie) return null;

    const own = tie.edge_ids.map((id) => edges.get(id)).filter((edge): edge is EdgeRow => Boolean(edge));
    const base = { from: refs.get(from)!, to: refs.get(to)!, family, origin: tie.origin };

    if (family === "agreement") {
      // Several claims may report agreements between the two; the hop quotes the most recent one.
      const [edge] = [...own].sort((a, b) => (b.properties.date ?? "").localeCompare(a.properties.date ?? ""));

      return {
        ...base,
        relationship: edge?.relationship ?? "other",
        direction: "not_applicable",
        role: null,
        claim: edge?.claim ?? null,
        validSince: null,
        validUntil: null,
        sources: edge?.sources ?? [],
      };
    }

    const settled = (tie.direction_basis ?? []).filter(() => tie.direction !== "undirected");
    const since = own.map((edge) => edge.valid_since).filter(Boolean).sort()[0] ?? null;
    const until = own.map((edge) => edge.valid_until).filter(Boolean).sort().pop() ?? null;

    return {
      ...base,
      relationship:
        tie.relationship !== "ROUND_PARTICIPATION"
          ? tie.relationship
          : settled.some((entry) => roundTypes.get(entry.round_id) === "FundingRound")
            ? "PARTICIPATES_IN_FUNDING_ROUND"
            : "PARTICIPATES_IN_CORPORATE_EVENT",
      direction: family === "investment" ? tie.direction : "not_applicable",
      role:
        family === "investment"
          ? [...new Set(settled.map((entry) => entry.financier_role))].sort().join(", ") || null
          : tie.role,
      claim: null,
      validSince: since,
      validUntil: until,
      sources: mergeSources(
        ...own.map((edge) => edge.sources),
        ...settled.flatMap((entry) => [
          roleSources.get(`${entry.round_id}|${entry.financier}`),
          roleSources.get(`${entry.round_id}|${entry.recipient}`),
        ]),
      ).slice(0, 12),
    };
  };

  const start = windowStart(now);
  const trails: StoredTrail[] = [];

  const add = (path: Path, hops: Hop[], pattern: TrailPattern, signal: Signal | null) => {
    const inner = path.nodes.slice(1, -1);
    const weight = inner.reduce(
      (product, node, index) =>
        path.families[index] === "investment" || path.families[index + 1] === "investment"
          ? product / Math.log(2 + (portfolio.get(node) ?? 0))
          : product,
      1,
    );
    const ranks = [...hops.map((one) => bestRank(one.sources)), ...(signal ? [bestRank(signal.sources)] : [])];

    trails.push({
      id: hashId("trail", mode, pattern, path.nodes.join(">"), path.families.join(">"), signal?.id),
      pattern,
      subject,
      end: refs.get(path.nodes[path.nodes.length - 1]!)!,
      hops,
      hopCount: hops.length,
      signal,
      // One unlabelled hop makes the whole trail unlabelled: the weakest link decides.
      weakestSourceRank: ranks.reduce<string | null>(
        (weakest, rank, index) => (index === 0 || rankValue(rank) < rankValue(weakest) ? rank : weakest),
        null,
      ),
      independentTrails: 1,
      readInFull: path.nodes.filter((node) => read.has(node)),
      seenInListOnly: path.nodes.filter((node) => !read.has(node)),
      weight,
      // The underlying relationships in walking order. Two trails with the same keys are one trail.
      pathKey: path.nodes
        .slice(0, -1)
        .map((node, index) => ties.get(hopKey(node, path.nodes[index + 1]!, path.families[index]!))?.key ?? "")
        .join("+"),
    });
  };

  for (const path of paths) {
    const hops = path.families.map((family, index) => hop(path.nodes[index]!, path.nodes[index + 1]!, family));

    if (hops.some((one) => !one)) continue;

    const end = path.nodes[path.nodes.length - 1]!;
    const signals = (endSignals.get(end) ?? []).map((row) => toSignal(row, refs)).filter((signal) => inWindow(signal, start));
    const complete = hops as Hop[];

    switch (path.shape) {
      case "shared_backer":
      case "anchor_backer": {
        add(path, complete, "T1", null);

        for (const signal of signals) {
          if (signal.type === "public_money") add(path, complete, "T2", signal);
          if (signal.type === "agreement") add(path, complete, "T6", signal);
        }

        break;
      }

      case "backer_of_sibling":
        add(path, complete, "T1", null);
        break;

      case "shared_counterparty":
      case "anchor_counterparty": {
        // The signal at the end is the end's own agreement with the shared counterparty.
        const counterparty = path.nodes[path.nodes.length - 2]!;
        const agreement = signals.find(
          (signal) => signal.type === "agreement" && signal.parties.some((party) => party.entity.id === counterparty),
        );

        add(path, complete, "T6", agreement ?? null);
        break;
      }

      case "ownership": {
        for (const signal of signals.slice(0, 3)) add(path, complete, "T4", signal);

        break;
      }
    }
  }

  const byEnd = new Map<string, StoredTrail[]>();

  for (const trail of uniqueBy(trails, (one) => one.id)) byEnd.set(trail.end.id, [...(byEnd.get(trail.end.id) ?? []), trail]);

  const kept: StoredTrail[] = [];

  for (const group of byEnd.values()) {
    const independent = independentTrails(group);

    group.sort(compareTrails);

    for (const trail of group.slice(0, PER_END)) kept.push({ ...trail, independentTrails: independent });
  }

  kept.sort(compareTrails);

  // The cap keeps the strongest trails, which for a well-connected subject are all two hops
  // long. For a founder, a public funder named on a public-money signal that stays is a
  // candidate in its own right, listed through its own trail to that company, so that trail
  // stays with it.
  const cut = kept.splice(cap);

  if (mode === "founder" && cut.length > 0) {
    const funders = new Set(
      (await db.query<{ entity_id: string }>("select entity_id from public_funders")).map((row) => row.entity_id),
    );
    const named = new Set(
      kept.flatMap((trail) =>
        trail.pattern === "T2" && trail.signal
          ? trail.signal.parties.filter((party) => funders.has(party.entity.id)).map((party) => `${trail.end.id}>${party.entity.id}`)
          : [],
      ),
    );

    kept.push(...cut.filter((trail) => trail.hops.length === 3 && named.has(`${trail.hops[1]!.to.id}>${trail.end.id}`)));
  }

  await db.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtext($1)::bigint)", [`trails:${subject.id}:${mode}`]);
    await tx.query("delete from trails where subject_id = $1 and mode = $2", [subject.id, mode]);
    await insertRows(
      tx,
      kept.map((trail) => ({
        id: trail.id,
        end_id: trail.end.id,
        pattern: trail.pattern,
        hops: trail.hops,
        hop_count: trail.hopCount,
        signal_id: trail.signal?.id ?? null,
        signal: trail.signal,
        signal_date: trail.signal?.date ?? null,
        weakest_source_rank: trail.weakestSourceRank,
        independent_trails: trail.independentTrails,
        read_in_full: trail.readInFull,
        seen_in_list_only: trail.seenInListOnly,
        path_key: trail.pathKey,
        weight: trail.weight,
      })),
      `insert into trails
         (id, subject_id, mode, end_id, pattern, hops, hop_count, signal_id, signal, signal_date, weakest_source_rank,
          independent_trails, read_in_full, seen_in_list_only, path_key, weight)
       select x.id, $2, $3, x.end_id, x.pattern, x.hops, x.hop_count, x.signal_id, x.signal, x.signal_date,
              x.weakest_source_rank, x.independent_trails, x.read_in_full, x.seen_in_list_only, x.path_key, x.weight
       from jsonb_to_recordset($1::jsonb) as x(
         id text, end_id text, pattern text, hops jsonb, hop_count integer, signal_id text, signal jsonb,
         signal_date text, weakest_source_rank text, independent_trails integer, read_in_full jsonb,
         seen_in_list_only jsonb, path_key text, weight double precision
       )
       on conflict (id) do nothing`,
      [subject.id, mode],
    );
  });

  return kept;
}

type TrailRow = {
  id: string;
  pattern: TrailPattern;
  end_id: string;
  hops: Hop[];
  hop_count: number;
  signal: Signal | null;
  weakest_source_rank: string | null;
  independent_trails: number;
  read_in_full: string[];
  seen_in_list_only: string[];
  path_key: string;
  weight: number;
};

/** The subject's stored trails, strongest first. */
export async function storedTrails(db: Db, subject: EntityRef, mode: Role): Promise<StoredTrail[]> {
  const rows = await db.query<TrailRow>("select * from trails where subject_id = $1 and mode = $2", [subject.id, mode]);

  return rows
    .map((row) => ({
      id: row.id,
      pattern: row.pattern,
      subject,
      end: row.hops[row.hops.length - 1]!.to,
      hops: row.hops,
      hopCount: row.hop_count,
      signal: row.signal,
      weakestSourceRank: row.weakest_source_rank,
      independentTrails: row.independent_trails,
      readInFull: row.read_in_full,
      seenInListOnly: row.seen_in_list_only,
      weight: row.weight,
      pathKey: row.path_key,
    }))
    .sort(compareTrails);
}

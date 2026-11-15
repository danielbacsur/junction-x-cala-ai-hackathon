import { storedTrails } from "./trails";
import { isSourcedTrail } from "./trails";
import type {
  BookRow,
  CandidateCategory,
  Constraints,
  EntityRef,
  FitLine,
  Hop,
  Mandate,
  Signal,
  SourceRef,
} from "../contract";
import type { Db } from "../db";
import { type MoneyKind, nonDilutive, partyKind } from "./money";
import { financierRoles, recipientRoles } from "./relations";
import { SLUSH_EVENT_ID } from "./requests";
import { ensureDerived } from "./rules";
import { hashId, insertRows, json, mergeSources, nameKey, rankValue, textKey, toSources, uniqueBy } from "./sql";
import { compareTrails, computeTrails, entityRefs, isDated, type StoredTrail } from "./trails";

/** The list holds at most this many rows; the gap report says how many more were found. */
const BOOK_LIMIT = 60;

/** A row shows its strongest trails; the rest stay in the store. */
const ROW_TRAILS = 6;

const idList = "select jsonb_array_elements_text($1::jsonb)";
const quoted = (values: string[]) => values.map((value) => `'${value}'`).join(", ");

/** How one hop may be worded. An undirected tie is a tie; only roles in one round make it funding. */
export function describeHop(hop: Hop): string {
  if (hop.family === "investment") {
    // A grantor granted and a lender lent; only an investor backs.
    const did = hop.role === "GRANTOR" ? "made a grant to" : hop.role === "LENDER" ? "made a loan to" : "backs";

    if (hop.direction === "from_funds_to") return `${hop.from.name} ${did} ${hop.to.name} (roles in the same round)`;
    if (hop.direction === "to_funds_from") return `${hop.to.name} ${did} ${hop.from.name} (roles in the same round)`;

    return `${hop.from.name} and ${hop.to.name} have an investment tie (direction not settled)`;
  }

  if (hop.family === "agreement") {
    return `${hop.from.name} and ${hop.to.name} have a ${hop.relationship.replaceAll("_", " ")} reported by Cala`;
  }

  return `${hop.from.name} ${hop.relationship} ${hop.to.name}`;
}

export function describeSignal(signal: Signal): string {
  const amount =
    signal.value === null
      ? ""
      : `, ${signal.units ?? ""} ${signal.value.toLocaleString("en-US")}${signal.valueIsProgrammeCeiling ? " (programme ceiling, not this party's amount)" : ""}`;
  // A flagged record's date is quoted as the record's, never stated as the date of one award.
  const when = !signal.date
    ? ", undated"
    : signal.flag
      ? `, dates disagree (the record says ${signal.date})`
      : signal.dateKind === "reported_on"
        ? `, reported on ${signal.date}`
        : `, ${(signal.dateKind ?? "date").replace("_", " ")} ${signal.date}`;

  return `${signal.label}${amount.replace("  ", " ")}${when}${signal.origin === "derived" ? ", reported by Cala" : ""}`;
}

export function describeTrail(trail: Pick<StoredTrail, "subject" | "hops" | "signal">): string {
  const chain = [trail.subject.name, ...trail.hops.map((hop) => hop.to.name)].join(" – ");

  return trail.signal ? `${chain}; ${describeSignal(trail.signal)}` : chain;
}

const words = (text: string) => textKey(text.replace(/([a-z])([A-Z])/g, "$1 $2")).trim();

/** True when one phrase holds every word of the other, so "software" finds "software and services". */
function phraseMatch(a: string, b: string): boolean {
  const [short, long] = words(a).length <= words(b).length ? [words(a), words(b)] : [words(b), words(a)];

  if (!short) return false;

  const within = new Set(long.split(" "));

  return short.split(" ").every((word) => within.has(word));
}

const regions: Record<string, string[]> = {
  nordics: ["finland", "sweden", "norway", "denmark", "iceland"],
  nordic: ["finland", "sweden", "norway", "denmark", "iceland"],
  baltics: ["estonia", "latvia", "lithuania"],
  dach: ["germany", "austria", "switzerland"],
  benelux: ["belgium", "netherlands", "luxembourg"],
  uk: ["united kingdom", "england", "scotland", "wales", "northern ireland"],
  us: ["united states", "united states of america"],
  usa: ["united states", "united states of america"],
  europe: [
    "austria", "belgium", "bulgaria", "croatia", "cyprus", "czechia", "czech republic", "denmark", "estonia",
    "finland", "france", "germany", "greece", "hungary", "iceland", "ireland", "italy", "latvia", "lithuania",
    "luxembourg", "malta", "netherlands", "norway", "poland", "portugal", "romania", "slovakia", "slovenia",
    "spain", "sweden", "switzerland", "united kingdom",
  ],
};

function placeMatch(wanted: string, place: string): boolean {
  const places = regions[words(wanted)] ?? [wanted];

  return places.some((one) => ` ${words(place)} `.includes(` ${words(one)} `));
}

type Evidence = { label: string; sources: SourceRef[] };

/** What the store holds about one candidate, loaded in bulk for the whole Book. */
type Profile = {
  ref: EntityRef;
  readKind: string | null;
  attendee: boolean;
  registry: { label: string; basis: string; ours: boolean } | null;
  stages: Evidence[];
  industries: Evidence[];
  places: Evidence[];
  /** Rounds it took part in as a financier. */
  rounds: { id: string; name: string | null; issuer: string | null; date: string | null; lead: boolean; sources: SourceRef[] }[];
  issuerRounds: number;
  investmentTies: number;
  /** Companies it is taken to back, with their industries, where their own record is stored. */
  portfolio: { name: string; industries: string[] }[];
  lastActivity: string | null;
};

async function loadProfiles(db: Db, ids: string[], withPortfolio: boolean): Promise<Map<string, Profile>> {
  const refs = await entityRefs(db, ids);
  const profiles = new Map<string, Profile>();
  const param = [json(ids)];

  for (const id of ids) {
    profiles.set(id, {
      ref: refs.get(id)!,
      readKind: null,
      attendee: false,
      registry: null,
      stages: [],
      industries: [],
      places: [],
      rounds: [],
      issuerRounds: 0,
      investmentTies: 0,
      portfolio: [],
      lastActivity: null,
    });
  }

  if (ids.length === 0) return profiles;

  type Property = { value: unknown; sources?: unknown } | undefined;

  for (const row of await db.query<{ id: string; read_kind: string | null; properties: Record<string, Property> | null }>(
    `select id, read_kind, properties from entities where id in (${idList})`,
    param,
  )) {
    const profile = profiles.get(row.id)!;
    const stage = row.properties?.funding_stage;
    const address = row.properties?.headquarters_address;

    profile.readKind = row.read_kind;

    if (typeof stage?.value === "string") profile.stages.push({ label: stage.value, sources: toSources(stage.sources) });
    if (typeof address?.value === "string") profile.places.push({ label: address.value, sources: toSources(address.sources) });
  }

  for (const row of await db.query<{
    source_id: string;
    relationship: string;
    name: string | null;
    original_label: string | null;
    sources: SourceRef[];
  }>(
    `select edges.source_id, edges.relationship, target.name, edges.properties ->> 'original_label' as original_label, edges.sources
     from edges left join entities target on target.id = edges.target_id
     where edges.source_id in (${idList})
       and edges.relationship in ('OPERATES_IN_INDUSTRY', 'HAS_HEADQUARTERS_IN', 'IS_REGISTERED_IN', 'HAS_PRESENCE_IN')`,
    param,
  )) {
    const profile = profiles.get(row.source_id)!;

    if (row.relationship === "OPERATES_IN_INDUSTRY") {
      if (row.name) profile.industries.push({ label: row.name, sources: row.sources });
      if (row.original_label) profile.industries.push({ label: row.original_label, sources: row.sources });
    } else if (row.name) {
      // A presence is a place Cala puts the entity in, like a headquarters or a registration. It
      // is matched against a stated geography and never worded as a headquarters.
      profile.places.push({ label: row.name, sources: row.sources });
    }
  }

  for (const row of await db.query<{
    entity_id: string;
    round_id: string;
    role: string;
    is_lead: boolean | null;
    name: string | null;
    date: string | null;
    sources: SourceRef[];
    issuer: string | null;
  }>(
    `select distinct on (p.entity_id, p.round_id, p.role)
            p.entity_id, p.round_id, p.role, p.is_lead, rounds.name,
            coalesce(rounds.event_date, p.event_date, rounds.announcement_date, rounds.close_date) as date, p.sources,
            (select entities.name from participations issuer join entities on entities.id = issuer.entity_id
             where issuer.round_id = p.round_id and issuer.role in (${quoted(recipientRoles)}) limit 1) as issuer
     from participations p join rounds on rounds.id = p.round_id
     where p.entity_id in (${idList})
     order by p.entity_id, p.round_id, p.role, p.is_lead desc nulls last`,
    param,
  )) {
    const profile = profiles.get(row.entity_id)!;

    if (row.date && (!profile.lastActivity || row.date > profile.lastActivity)) profile.lastActivity = row.date;

    if (recipientRoles.includes(row.role)) profile.issuerRounds += 1;

    if (financierRoles.includes(row.role)) {
      profile.rounds.push({
        id: row.round_id,
        name: row.name,
        issuer: row.issuer,
        date: row.date,
        lead: row.is_lead === true,
        sources: row.sources,
      });
    }
  }

  for (const row of await db.query<{ from_id: string; ties: number }>(
    `select from_id, count(*)::integer as ties from ties where family = 'investment' and from_id in (${idList}) group by from_id`,
    param,
  )) {
    profiles.get(row.from_id)!.investmentTies = row.ties;
  }

  for (const row of await db.query<{ entity_id: string }>(
    `select entity_id from roster where event_id = $2 and role = 'ATTENDEE' and entity_id in (${idList})`,
    [param[0], SLUSH_EVENT_ID],
  )) {
    profiles.get(row.entity_id)!.attendee = true;
  }

  for (const row of await db.query<{ entity_id: string; label: string; basis: string; ours: boolean }>(
    `select entity_id, label, basis, ours from public_funders where entity_id in (${idList})`,
    param,
  )) {
    profiles.get(row.entity_id)!.registry = { label: row.label, basis: row.basis, ours: row.ours };
  }

  if (withPortfolio) {
    for (const row of await db.query<{ from_id: string; name: string; industries: string[] | null }>(
      `select ties.from_id, company.name,
              (select jsonb_agg(distinct label) from (
                 select target.name as label from edges left join entities target on target.id = edges.target_id
                 where edges.source_id = ties.to_id and edges.relationship = 'OPERATES_IN_INDUSTRY'
                 union all
                 select edges.properties ->> 'original_label' from edges
                 where edges.source_id = ties.to_id and edges.relationship = 'OPERATES_IN_INDUSTRY'
               ) as labels where label is not null) as industries
       from ties join entities company on company.id = ties.to_id
       where ties.family = 'investment' and ties.from_id in (${idList})
         and (ties.direction = 'from_funds_to' or (ties.direction = 'undirected' and ties.stated in ('from_to', 'both')))
         and company.read_kind = 'star'`,
      param,
    )) {
      profiles.get(row.from_id)!.portfolio.push({ name: row.name, industries: row.industries ?? [] });
    }
  }

  return profiles;
}

/**
 * Investor-kind (consensus point 16.5): a registry body, three or more participations as a
 * financier, or ten or more investment ties and no stored round as issuer. It filters candidates
 * and orders reads over stored coverage. It is never evidence of who funded whom.
 */
export function investorKind(profile: Pick<Profile, "registry" | "rounds" | "investmentTies" | "issuerRounds">): boolean {
  return Boolean(profile.registry) || profile.rounds.length >= 3 || (profile.investmentTies >= 10 && profile.issuerRounds === 0);
}

type Wanted = { stages: string[]; sectors: string[]; geographies: string[]; explicit: Set<string> };

/** The customer's constraints, or for a founder who gave none, the company's own observed profile. */
function wantedProfile(mandate: Mandate, subject: Profile | undefined): Wanted {
  const constraints = mandate.constraints;
  const explicit = new Set<string>();
  const pick = (name: string, given: string[] | null, observed: string[]) => {
    if (given && given.length > 0) {
      explicit.add(name);

      return given;
    }

    return mandate.role === "founder" ? observed : [];
  };

  return {
    stages: pick("Stage", constraints.stages, uniqueBy(subject?.stages ?? [], (one) => one.label).map((one) => one.label)),
    sectors: pick("Sector", constraints.sectors, uniqueBy(subject?.industries ?? [], (one) => one.label).map((one) => one.label)),
    geographies: pick(
      "Geography",
      constraints.geographies,
      // The country is enough; the full address would never match another company's.
      uniqueBy(subject?.places ?? [], (one) => one.label)
        .map((one) => one.label)
        .filter((label) => !label.includes(",")),
    ),
    explicit,
  };
}

const list = (items: string[], most = 3) =>
  items.length > most ? `${items.slice(0, most).join(", ")} and ${items.length - most} more` : items.join(", ");

type Fit = { lines: FitLine[]; unknowns: string[]; matched: Set<string>; lead: boolean; examples: number };

/**
 * The evidenced fit of one candidate. A criterion with no stored value is an unknown, never a
 * mismatch: nothing here turns missing data into a negative fact.
 */
function fitOf(profile: Profile, wanted: Wanted, mandate: Mandate): Fit {
  const lines: FitLine[] = [];
  const unknowns: string[] = [];
  const matched = new Set<string>();
  const asInvestor = mandate.role === "founder";
  const basis = (name: string) => (wanted.explicit.has(name) ? "your criteria" : "your company's record in Cala");
  let examples = 0;

  if (wanted.stages.length > 0) {
    if (asInvestor) {
      const rounds = profile.rounds.filter((round) => round.name && wanted.stages.some((stage) => words(stage) === words(round.name!)));

      if (rounds.length > 0) {
        matched.add("Stage");
        lines.push({
          criterion: "Stage",
          statement: `Took part as a financier in ${rounds.length} stored ${list(uniqueBy(rounds, (round) => words(round.name!)).map((round) => round.name!))} round${rounds.length === 1 ? "" : "s"} (${list(rounds.map((round) => `${round.issuer ?? "issuer not read"}${round.date ? ` ${round.date}` : ""}`))}); compared with ${basis("Stage")}: ${list(wanted.stages)}.`,
          kind: "observed",
          sources: mergeSources(...rounds.map((round) => round.sources)).slice(0, 8),
        });
      } else {
        unknowns.push(`No stored round shows it investing at ${list(wanted.stages)}.`);
      }
    } else {
      const stages = profile.stages.filter((stage) => wanted.stages.some((one) => words(one) === words(stage.label)));

      if (stages.length > 0) {
        matched.add("Stage");
        lines.push({
          criterion: "Stage",
          statement: `Cala records its funding stage as ${stages[0]!.label}; compared with ${basis("Stage")}: ${list(wanted.stages)}.`,
          kind: "observed",
          sources: stages[0]!.sources.slice(0, 8),
        });
      } else if (profile.stages.length === 0) {
        unknowns.push("Funding stage is not in stored evidence.");
      } else {
        unknowns.push(`Cala records its funding stage as ${profile.stages[0]!.label}, which is not among ${list(wanted.stages)}.`);
      }
    }
  }

  if (wanted.sectors.length > 0) {
    const own = profile.industries.filter((industry) => wanted.sectors.some((sector) => phraseMatch(sector, industry.label)));

    if (own.length > 0) {
      matched.add("Sector");
      lines.push({
        criterion: "Sector",
        statement: `Cala lists it under ${list(uniqueBy(own, (one) => one.label).map((one) => one.label))}; compared with ${basis("Sector")}: ${list(wanted.sectors)}.`,
        kind: "observed",
        sources: mergeSources(...own.map((one) => one.sources)).slice(0, 8),
      });
    }

    if (asInvestor) {
      const companies = profile.portfolio.filter((company) =>
        company.industries.some((industry) => wanted.sectors.some((sector) => phraseMatch(sector, industry))),
      );

      examples = companies.length;

      if (companies.length > 0) {
        matched.add("Sector");
        lines.push({
          criterion: "Portfolio examples",
          statement: `Stored companies it has an investment tie with in ${list(wanted.sectors)}: ${list(uniqueBy(companies, (one) => one.name).map((one) => one.name))}. Past ties are not its current thesis.`,
          kind: "observed",
          sources: [],
        });
      }
    }

    if (!matched.has("Sector")) unknowns.push(`No stored evidence ties it to ${list(wanted.sectors)}.`);
  }

  if (wanted.geographies.length > 0) {
    const places = profile.places.filter((place) => wanted.geographies.some((one) => placeMatch(one, place.label)));

    if (places.length > 0) {
      matched.add("Geography");
      lines.push({
        criterion: "Geography",
        statement: `Cala places it in ${list(uniqueBy(places, (one) => one.label).map((one) => one.label))}; compared with ${basis("Geography")}: ${list(wanted.geographies)}.`,
        kind: "observed",
        sources: mergeSources(...places.map((one) => one.sources)).slice(0, 8),
      });
    } else if (profile.places.length === 0) {
      unknowns.push("Location is not in stored evidence.");
    } else {
      unknowns.push(`Cala places it in ${profile.places[0]!.label}, which is not among ${list(wanted.geographies)}.`);
    }
  }

  const leads = profile.rounds.filter((round) => round.lead);

  if (asInvestor && leads.length > 0) {
    // Marked rounds are named, not counted: without reconciliation two records may be one round.
    lines.push({
      criterion: "Lead history",
      statement: `Cala marks it as lead on stored rounds of ${list(uniqueBy(leads, (round) => round.issuer ?? round.id).map((round) => `${round.issuer ?? "an issuer not read"}${round.name ? ` (${round.name})` : ""}`))}. Its round list was read once and not reconciled, so this is not a lead count, and past leading does not show present appetite.`,
      kind: "observed",
      sources: mergeSources(...leads.map((round) => round.sources)).slice(0, 8),
    });
  }

  if (profile.lastActivity) {
    lines.push({
      criterion: "Dated activity",
      statement: `Its most recent dated round or event in stored reads is ${profile.lastActivity}.`,
      kind: "observed",
      sources: [],
    });
  }

  if (profile.readKind !== "star" && profile.readKind !== "person") {
    unknowns.push("Its own record has not been read; it was seen only in another entity's list.");
  }

  return { lines, unknowns, matched, lead: asInvestor && leads.length > 0, examples };
}

type Candidate = {
  id: string;
  category: CandidateCategory;
  role: string;
  trails: StoredTrail[];
  directFitOnly: boolean;
  /** Trails that reach the candidate on evidence its category does not rest on. Named, not shown. */
  aside: StoredTrail[];
};

type Ranked = Candidate & { profile: Profile; fit: Fit; best: StoredTrail | null; reason: string };

function excluded(profile: Profile, constraints: Constraints): boolean {
  return (constraints.exclusions ?? []).some(
    (rule) => rule === profile.ref.id || (nameKey(rule) !== "" && nameKey(rule) === nameKey(profile.ref.name)),
  );
}

const unknownMoney: ReadonlySet<MoneyKind> = new Set(["unknown"]);

/**
 * What each of these financiers put into the companies it funds, read from the stored rounds
 * with `partyKind`. A pair that no stored round ties is unknown: an INVESTED_IN edge says that
 * money moved and not what kind.
 */
async function moneyFrom(db: Db, funderIds: string[], signalIds: string[]) {
  const byPair = new Map<string, Set<MoneyKind>>();
  const byRound = new Map<string, Set<MoneyKind>>();

  for (const row of await db.query<{
    round_id: string;
    financier: string;
    recipient: string;
    role: string;
    name: string | null;
    instrument: string | null;
    named: boolean;
  }>(
    `select distinct p.round_id, p.entity_id as financier, recipient.entity_id as recipient, p.role,
            rounds.name, rounds.instrument,
            exists (
              select 1 from participations other where other.round_id = p.round_id and other.role in ('GRANTOR', 'LENDER')
            ) as named
     from participations p
     join rounds on rounds.id = p.round_id
     join participations recipient
       on recipient.round_id = p.round_id and recipient.role in (${quoted(recipientRoles)}) and recipient.entity_id <> p.entity_id
     where p.entity_id in (${idList}) and p.role in (${quoted(financierRoles)})`,
    [json(funderIds)],
  )) {
    const kind = partyKind(row.role, row, row.named);

    for (const [kinds, key] of [
      [byPair, `${row.financier}|${row.recipient}`],
      [byRound, `${row.round_id}|${row.financier}`],
    ] as const) {
      kinds.set(key, (kinds.get(key) ?? new Set<MoneyKind>()).add(kind));
    }
  }

  // A signal made from a round names that round as its basis; one made from a bare tie does not.
  const rounds = new Map(
    (
      await db.query<{ id: string; basis_id: string | null }>(`select id, basis_id from signals where id in (${idList})`, [
        json(signalIds),
      ])
    ).map((row) => [row.id, row.basis_id]),
  );

  return {
    /** Everything the funder put into one company, over all the stored rounds between the two. */
    ofTie: (funder: string, company: string): ReadonlySet<MoneyKind> => byPair.get(`${funder}|${company}`) ?? unknownMoney,
    /** What the funder put into the round behind one signal. */
    inSignal: (signalId: string, funder: string): ReadonlySet<MoneyKind> =>
      byRound.get(`${rounds.get(signalId)}|${funder}`) ?? unknownMoney,
  };
}

/**
 * How a registry body is named in a reason: by what its place on the trail rests on, and on
 * whose classification it is public. Only a grant or a loan makes it a funder; with equity it is
 * an investor, and where the record does not say, a body.
 */
function publicName(profile: Profile, category: CandidateCategory, money: ReadonlySet<MoneyKind>): string | null {
  if (!profile.registry) return null;

  const what = category === "non_dilutive" ? "funder" : money.has("equity") ? "investor" : "body";

  return `a public ${what} by ${profile.registry.ours ? "our classification" : "Cala's description"}`;
}

/** True when everything the stored rounds show is a grant or a loan: no equity, nothing unnamed. */
const onlyNonDilutive = (money: ReadonlySet<MoneyKind>) => !money.has("equity") && !money.has("unknown");

/**
 * One sentence on why to meet, worded from the trail and never beyond it. `money` is what the
 * candidate's own place on the trail rests on, and `route` what the trail's first hop put into
 * the founder's company.
 */
function reasonFor(
  candidate: Candidate,
  profile: Profile,
  best: StoredTrail | null,
  mandate: Mandate,
  fit: Fit,
  money: ReadonlySet<MoneyKind>,
  route: ReadonlySet<MoneyKind>,
): string {
  const name = profile.ref.name;

  if (!best) {
    return candidate.category === "direct_fit"
      ? `${name} fits ${list([...fit.matched]) || "the mandate"} on stored evidence; no connection to ${mandate.subject.name}'s portfolio was found, so this is a direct fit only.`
      : `${name} has an investment tie with ${mandate.subject.name} in Cala's graph.`;
  }

  if (best.pattern === "T4" && best.hops.length === 3) {
    return `${name} is connected through ${best.hops[0]!.to.name} and its stated owner ${best.hops[1]!.to.name}; ${best.signal ? describeSignal(best.signal) : "the final step is a stored investment tie"}. This connection does not establish access or investment appetite.`;
  }
  const [first, second, third] = best.hops;
  const signal = best.signal ? ` ${best.end.name} carries: ${describeSignal(best.signal)}.` : "";

  if (mandate.role === "founder") {
    const called = publicName(profile, candidate.category, money);
    const who = called ? `${name}, ${called},` : name;
    const through = first!.to.name;
    // A first hop that only granted or lent to the founder is a funder the two companies share.
    // It is not an investor who can be asked about its portfolio, so nothing says to ask it.
    const shared = !onlyNonDilutive(route)
      ? null
      : second?.direction === "from_funds_to"
        ? `${through} funds as it funds you`
        : `is tied to ${through}, which funds you`;

    // Three hops end at the candidate itself: a backer of a company beside the founder. A grant
    // or a loan is named as one, so a grantor is not read as holding a stake, and a non-dilutive
    // row names the grant or loan it rests on even where the body also holds a stake there.
    if (third && best.end.id === candidate.id) {
      const gave = !(candidate.category === "non_dilutive" || onlyNonDilutive(money))
        ? "backs"
        : money.has("grant") && money.has("loan")
          ? "made grants and loans to"
          : money.has("grant")
            ? "made a grant to"
            : "made a loan to";
      const tie =
        third.direction === "to_funds_from"
          ? `${gave} ${second!.to.name} (roles in the same round)`
          : `has an investment tie with ${second!.to.name} (direction not settled)`;

      return shared
        ? `${who} ${tie}, a company that ${shared}.`
        : `${who} ${tie}, a company beside you through ${through}; ${through} is the route to ask about.`;
    }

    // A public funder named on a sibling's grant or loan, reached through the founder's own backer.
    if (candidate.category === "non_dilutive" && best.signal && first!.to.id !== candidate.id) {
      const found = `${name} is ${called} active beside you: ${describeSignal(best.signal)} for ${best.end.name}`;

      return shared
        ? `${found}, which ${shared}.`
        : `${found}, which you reach through ${through}. Ask ${through} how ${best.end.name} obtained it.`;
    }

    // A public funder whose grant or loan the founder already has: the same funder, not a new one.
    if (candidate.category === "non_dilutive") {
      const tie = first!.direction === "to_funds_from" ? "already funds you" : "has an investment tie with you";

      return best.signal
        ? `${who} ${tie} and is tied to ${best.end.name}.${signal} This is a funder you already have, not a new one.`
        : `${who} ${tie} and is tied to ${best.end.name}, a company beside you. A funder you already have, not a new one.`;
    }

    // An existing backer, public or private: a follow-up target, never a new lead.
    const tie =
      first!.direction !== "to_funds_from"
        ? "has an investment tie with you"
        : onlyNonDilutive(money)
          ? "already funds you"
          : "already backs you";

    return best.signal
      ? `${who} ${tie} and is tied to ${best.end.name}.${signal} Ask ${name} about ${best.end.name}'s experience; this is a follow-up, not a new investor.`
      : `${who} ${tie} and is tied to ${best.end.name}, a company beside you. A follow-up target, not a new investor.`;
  }

  if (best.pattern === "T6" && best.hops.some((hop) => hop.family === "agreement")) {
    const counterparty = best.hops[best.hops.length - 1]!.from.name;
    const anchor = best.hops.length === 3 ? `your portfolio tie ${first!.to.name}` : "you";

    return `${name}'s counterparty ${counterparty} also has an agreement with ${anchor}, as Cala reports.${signal}`;
  }

  if (!second) return `${name} and your fund are both tied to ${first!.to.name}.${signal}`;

  // Worded as ties: which of them funded which is said hop by hop on the trail, where roles settle it.
  return `${name} and ${first!.to.name} are both tied to ${second.to.name} by investment, and ${first!.to.name} is tied to your fund; ${second.to.name} is a reference to ask.${signal}`;
}

function trailLines(candidate: Candidate, best: StoredTrail | null): FitLine[] {
  if (!best) return [];

  const lines: FitLine[] = [
    {
      criterion: "Trail",
      statement: `${best.hopCount} hop${best.hopCount === 1 ? "" : "s"}: ${best.hops.map(describeHop).join("; ")}.`,
      kind: "observed",
      sources: mergeSources(...best.hops.map((hop) => hop.sources)).slice(0, 10),
    },
  ];

  if (best.signal) {
    lines.push({
      criterion: "Signal",
      statement: `${best.signal.entity.name}: ${describeSignal(best.signal)}.${best.signal.flag ? ` ${best.signal.flag}` : ""}${best.signal.publicBasis ? ` Counted as public money by ${best.signal.publicBasis.ours ? "our classification" : "Cala's description"} (${best.signal.publicBasis.basis}).` : ""}`,
      kind: "observed",
      sources: best.signal.sources.slice(0, 10),
    });
  }

  // What a non-dilutive row leaves out: the same body's stakes, which are not what it rests on.
  const companies = uniqueBy(
    candidate.aside.filter((trail) => trail.end.id === candidate.id && trail.hops.length > 1),
    (trail) => trail.hops[trail.hops.length - 2]!.to.id,
  ).map((trail) => trail.hops[trail.hops.length - 2]!.to.name);

  if (companies.length > 0) {
    lines.push({
      criterion: "Also an investor",
      statement: `Stored rounds also tie it to ${list(companies)} beside you through equity or money of a kind they do not name. That is not non-dilutive funding and is not what this row rests on.`,
      kind: "observed",
      sources: mergeSources(...candidate.aside.map((trail) => trail.hops[trail.hops.length - 1]!.sources)).slice(0, 8),
    });
  }

  const independent = Math.max(...candidate.trails.map((trail) => trail.independentTrails));

  if (independent > 1) {
    lines.push({
      criterion: "Independent trails",
      statement: `${independent} trails over different relationships reach ${best.end.name}.`,
      kind: "observed",
      sources: [],
    });
  }

  lines.push({
    criterion: "Source strength",
    statement: best.weakestSourceRank
      ? `Every hop has a source Cala labels ${best.weakestSourceRank} or stronger.`
      : "At least one hop rests on sources Cala does not label.",
    kind: "observed",
    sources: [],
  });

  return lines;
}

/** Point 12, in order: explicit constraints, then trails, then evidenced fit, then the stable ID. */
function compareRanked(a: Ranked, b: Ranked, wanted: Wanted): number {
  const explicit = (ranked: Ranked) => [...ranked.fit.matched].filter((name) => wanted.explicit.has(name)).length;
  const implicit = (ranked: Ranked) => [...ranked.fit.matched].filter((name) => !wanted.explicit.has(name)).length;
  const dated = (ranked: Ranked) => (ranked.best && isDated(ranked.best.signal) ? ranked.best.signal!.date! : "");
  const independent = (ranked: Ranked) => Math.max(0, ...ranked.trails.map((trail) => trail.independentTrails));

  return (
    explicit(b) - explicit(a) ||
    (a.best?.hopCount ?? 99) - (b.best?.hopCount ?? 99) ||
    Number(dated(b) !== "") - Number(dated(a) !== "") ||
    dated(b).localeCompare(dated(a)) ||
    Number(independent(b) > 1) - Number(independent(a) > 1) ||
    rankValue(b.best?.weakestSourceRank) - rankValue(a.best?.weakestSourceRank) ||
    implicit(b) - implicit(a) ||
    Number(b.fit.lead) - Number(a.fit.lead) ||
    Number(b.fit.examples > 0) - Number(a.fit.examples > 0) ||
    (b.profile.lastActivity ?? "").localeCompare(a.profile.lastActivity ?? "") ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Rebuilds the mandate's trails from the store and writes its Book for the current revision.
 * Nothing is fetched. Returns every trail found, the ones the list's rows show, and what the
 * stored evidence could not establish.
 */
export async function rankMandate(
  db: Db,
  mandate: Mandate,
  now: Date,
): Promise<{ trails: StoredTrail[]; shown: StoredTrail[]; rows: number; gaps: string[] }> {
  await ensureDerived(db, now);

  const allTrails = await computeTrails(db, mandate.subject, mandate.role, now);
  const trails = allTrails.filter(isSourcedTrail);
  const subjectId = mandate.subject.id;
  const candidates = new Map<string, Candidate>();
  const gaps: string[] = [];
  if (allTrails.length > trails.length) gaps.push(`${allTrails.length - trails.length} trails left out: a hop or signal has no HTTP(S) source link.`);

  // A candidate may be reached on evidence of more than one kind, so offers are kept by category.
  const offers = new Map<string, { category: CandidateCategory; role: string; trails: StoredTrail[] }[]>();

  const offer = (id: string, category: CandidateCategory, role: string, trail: StoredTrail) => {
    const made = offers.get(id) ?? [];
    const one = made.find((held) => held.category === category) ?? { category, role, trails: [] };

    if (!made.includes(one)) made.push(one);
    if (!one.trails.some((held) => held.id === trail.id)) one.trails.push(trail);

    offers.set(id, made);
  };

  const registry = new Set(
    (await db.query<{ entity_id: string }>("select entity_id from public_funders")).map((row) => row.entity_id),
  );
  const ties = await db.query<{ to_id: string; direction: string; stated: string }>(
    "select to_id, direction, stated from ties where from_id = $1 and family = 'investment'",
    [subjectId],
  );

  /** What a financier's place on one trail rests on. Set for a founder, whose Book it sorts. */
  let restsOn: (id: string, trail: StoredTrail) => ReadonlySet<MoneyKind> = () => unknownMoney;

  if (mandate.role === "founder") {
    const backers = new Set(
      ties
        .filter((tie) => tie.direction === "to_funds_from" || (tie.direction === "undirected" && ["to_from", "both"].includes(tie.stated)))
        .map((tie) => tie.to_id),
    );
    const publicWanted = mandate.constraints.includePublicFunding === true;
    const backersWanted = mandate.constraints.includeExistingBackers !== false;
    const routed = new Set<string>();
    const funders = new Set<string>();

    const met = trails.flatMap((trail) => [
      trail.hops[0]!.to.id,
      trail.end.id,
      ...(trail.signal?.parties ?? []).map((party) => party.entity.id),
    ]);
    const money = await moneyFrom(db, [...new Set(met)], [
      ...new Set(trails.flatMap((trail) => (trail.signal ? [trail.signal.id] : []))),
    ]);

    // Its money in the sibling at the end, in the founder's own company, or in the signal's round.
    restsOn = (id, trail) =>
      trail.end.id === id
        ? money.ofTie(id, trail.hops[trail.hops.length - 2]!.to.id)
        : trail.hops[0]!.to.id === id
          ? money.ofTie(id, subjectId)
          : trail.signal
            ? money.inSignal(trail.signal.id, id)
            : unknownMoney;

    /**
     * A registry body is non-dilutive only on a grant or a loan, and only when the mandate asks
     * for public funding. On equity, or on money the record does not name, it is an investor
     * like any other, whatever the mandate says: the choice is about the non-dilutive category.
     * Unnamed money beside a grant to the same company is taken as that grant recorded twice.
     */
    const place = (id: string, trail: StoredTrail, investor: CandidateCategory, role: string) => {
      const kinds = registry.has(id) ? restsOn(id, trail) : null;
      const funds = kinds !== null && nonDilutive(kinds);

      if (funds) funders.add(id);

      if (funds && publicWanted) offer(id, "non_dilutive", `public funder, ${role}`, trail);
      else if (investor === "follow_up" && !backersWanted) return;
      else if (!kinds) offer(id, investor, role, trail);
      else if (kinds.has("equity") || !funds) offer(id, investor, `public body, ${role}`, trail);
    };

    for (const trail of trails) {
      const first = trail.hops[0]!.to.id;

      if (trail.pattern === "T4" && trail.hops.length < 3) continue;

      if (trail.hops.length === 3) {
        place(trail.end.id, trail, "lead", "has an investment tie with a company beside you");

        continue;
      }

      // Two hops through an existing backer: the backer is a follow-up, and a public funder
      // behind the sibling's signal is a non-dilutive candidate.
      if (backers.has(first)) {
        routed.add(first);
        place(first, trail, "follow_up", "existing backer");
      }

      if (trail.pattern === "T2" && trail.signal) {
        for (const party of trail.signal.parties) {
          const id = party.entity.id;

          if (!registry.has(id) || id === first || id === trail.end.id || backers.has(id)) continue;

          // Only the bodies that granted or lent. A public investor in the same round is
          // reached over its own tie to the sibling, at its full three hops.
          if (!nonDilutive(restsOn(id, trail))) continue;

          funders.add(id);

          if (publicWanted) offer(id, "non_dilutive", "public funder active on a company beside you", trail);
        }
      }
    }

    const silent = [...backers].filter((id) => !routed.has(id));

    if (silent.length > 0) {
      const names = await entityRefs(db, silent);

      gaps.push(
        `${silent.length} of the investors and funders Cala lists for you ${silent.length === 1 ? "has" : "have"} no other stored investment, so no trail runs through ${silent.length === 1 ? "it" : "them"}: ${list(silent.map((id) => names.get(id)!.name), 6)}.`,
      );
    }

    // Counted on grants and loans alone. One that also holds equity beside the founder is still
    // listed, as the investor it is there.
    if (!publicWanted && funders.size > 0) {
      gaps.push(
        `${funders.size} public funder${funders.size === 1 ? " has" : "s have"} made grants or loans to you or to companies beside you. Public funding is not switched on in this mandate, so ${funders.size === 1 ? "it is not listed as a non-dilutive candidate" : "they are not listed as non-dilutive candidates"}.`,
      );
    }

    if (backers.size === 0) gaps.push("No investor of your company is in stored evidence, so no trail could start.");
  } else {
    const anchors = new Set(ties.filter((tie) => tie.direction !== "to_funds_from").map((tie) => tie.to_id));

    for (const trail of trails) {
      if (trail.pattern === "T4" && trail.hops.length < 3) continue;

      offer(trail.end.id, "lead", trail.hops.length === 3 ? "connected through your portfolio" : "connected to your fund", trail);
    }

    // Researched cohort companies with no connection may still appear, as direct fit only.
    const researched = await db.query<{ id: string }>(
      `select entities.id from entities
       join roster on roster.entity_id = entities.id and roster.event_id = $1 and roster.role = 'ATTENDEE'
       where entities.read_kind = 'star' or exists (select 1 from probes where probes.subject_id = entities.id)`,
      [SLUSH_EVENT_ID],
    );

    for (const row of researched) {
      if (offers.has(row.id) || anchors.has(row.id) || row.id === subjectId) continue;

      candidates.set(row.id, {
        id: row.id,
        category: "direct_fit",
        role: "no connection to your portfolio in stored evidence",
        trails: [],
        directFitOnly: true,
        aside: [],
      });
    }

    const attending = await db.query<{ name: string }>(
      `select entities.name from entities
       join roster on roster.entity_id = entities.id and roster.event_id = $2 and roster.role = 'ATTENDEE'
       where entities.id in (${idList}) order by entities.name`,
      [json([...anchors]), SLUSH_EVENT_ID],
    );

    if (anchors.size === 0) {
      gaps.push("No portfolio company of your fund is in stored evidence, so no trail could start from an anchor.");
    } else if (attending.length > 0) {
      gaps.push(
        `${attending.length} compan${attending.length === 1 ? "y" : "ies"} already tied to your fund ${attending.length === 1 ? "is" : "are"} listed by Cala as Slush attendees and ${attending.length === 1 ? "is" : "are"} not offered as new: ${list(attending.map((row) => row.name), 8)}.`,
      );
    }
  }

  // One row per candidate. A public body reached on a grant or loan and also on equity is listed
  // as non-dilutive on the first alone; its stakes are named beside the row, never made part of it.
  for (const [id, made] of offers) {
    const chosen = made.find((one) => one.category === "non_dilutive") ?? made[0]!;

    candidates.set(id, {
      id,
      category: chosen.category,
      role: chosen.role,
      trails: chosen.trails,
      directFitOnly: false,
      aside: made.filter((one) => one !== chosen).flatMap((one) => one.trails),
    });
  }

  candidates.delete(subjectId);

  const profiles = await loadProfiles(db, [subjectId, ...candidates.keys()], mandate.role === "founder");
  const wanted = wantedProfile(mandate, profiles.get(subjectId));
  const ranked: Ranked[] = [];
  const left: string[] = [];
  let unfit = 0;

  for (const candidate of candidates.values()) {
    const profile = profiles.get(candidate.id)!;

    // An investor's candidates are Slush cohort companies and nothing else.
    if (mandate.role === "investor" && !profile.attendee) continue;

    if (excluded(profile, mandate.constraints)) {
      left.push(profile.ref.name);

      continue;
    }

    const fit = fitOf(profile, wanted, mandate);

    // Direct fit needs fit: at least one of the customer's criteria met on stored evidence.
    if (candidate.directFitOnly && fit.matched.size === 0) {
      unfit += 1;

      continue;
    }

    if (candidate.trails.length === 0) continue;
    candidate.trails.sort(compareTrails);
    candidate.trails.splice(ROW_TRAILS);

    const best = candidate.trails[0] ?? null;
    const founder = mandate.role === "founder";
    const money = founder && best ? restsOn(candidate.id, best) : unknownMoney;

    if (founder && candidate.category === "lead" && !investorKind(profile)) {
      fit.unknowns.push(
        "Whether it invests regularly is not established: stored reads show too few of its investments to say.",
      );
    }

    // A public body listed as an investor on money of no stated kind: say why it is not more.
    if (founder && profile.registry && best && candidate.category !== "non_dilutive" && !money.has("equity")) {
      fit.unknowns.push(
        "Stored rounds do not say what kind of money ties it to this trail, so it is not listed as non-dilutive: only a grant, a subsidy or a loan would make it that.",
      );
    }

    // A grantor or lender nobody has classified sits among the leads: say what it is known to do.
    if (founder && !profile.registry && best && onlyNonDilutive(money)) {
      fit.unknowns.push(
        "Stored rounds show it granting or lending, not investing. It is not in the public-funder registry, so it is not listed as a public funder.",
      );
    }

    // What the trail's first hop put into the founder's own company.
    const route = founder && best ? restsOn(best.hops[0]!.to.id, best) : unknownMoney;

    ranked.push({ ...candidate, profile, fit, best, reason: reasonFor(candidate, profile, best, mandate, fit, money, route) });
  }

  ranked.sort((a, b) => compareRanked(a, b, wanted));

  if (left.length > 0) gaps.push(`${left.length} candidate${left.length === 1 ? "" : "s"} left out by your exclusions: ${list(left, 6)}.`);

  if (unfit > 0) {
    gaps.push(
      wanted.explicit.size > 0
        ? `${unfit} researched Slush compan${unfit === 1 ? "y has" : "ies have"} no connection to your portfolio and no evidenced fit with your criteria, and ${unfit === 1 ? "is" : "are"} not listed.`
        : `${unfit} researched Slush compan${unfit === 1 ? "y has" : "ies have"} no connection to your portfolio. No stage, sector or geography was given to judge a direct fit by, so ${unfit === 1 ? "it is" : "they are"} not listed.`,
    );
  }

  if (ranked.length > BOOK_LIMIT) gaps.push(`${ranked.length - BOOK_LIMIT} further candidates rank below the ${BOOK_LIMIT} listed.`);

  const hops = uniqueBy(trails.flatMap((trail) => trail.hops), (hop) => `${hop.from.id}|${hop.to.id}|${hop.family}`);
  const undirected = hops.filter((hop) => hop.family === "investment" && hop.direction === "undirected").length;

  if (undirected > 0) {
    gaps.push(
      `${undirected} of ${hops.length} hops on these trails are undirected investment ties: no stored round's roles settle who funded whom.`,
    );
  }

  if (profiles.get(subjectId)?.readKind !== "star") {
    gaps.push(`${mandate.subject.name} has not been read in full, so trails rest on what other entities' lists show.`);
  }

  if (ranked.length === 0) gaps.push("No candidate has a demonstrated connection in stored evidence.");

  const listed = ranked.slice(0, BOOK_LIMIT);
  let briefs = 0;

  const rows = listed.map((one, index) => {
    // The three strongest rows with a sourced trail get a brief.
    const hasBrief = briefs < 3 && one.best !== null && isSourcedTrail(one.best);

    if (hasBrief) briefs += 1;

    return {
      id: hashId("row", mandate.id, mandate.revision, one.id),
      rank: index + 1,
      candidate_id: one.id,
      category: one.category,
      candidate_role: one.role,
      reason: one.reason,
      fit: [...trailLines(one, one.best), ...one.fit.lines],
      trail_ids: one.trails.map((trail) => trail.id),
      best_trail: one.best
        ? { pattern: one.best.pattern, hopCount: one.best.hopCount, signalLabel: one.best.signal?.label ?? null }
        : null,
      direct_fit_only: one.directFitOnly,
      enrichment: one.profile.readKind === "star" || one.profile.readKind === "person" ? "read_in_full" : "seen_in_list",
      unknowns: one.fit.unknowns,
      has_brief: hasBrief,
      ranking: {
        explicit: [...one.fit.matched].filter((name) => wanted.explicit.has(name)),
        matched: [...one.fit.matched],
        hops: one.best?.hopCount ?? null,
        signalDate: one.best && isDated(one.best.signal) ? one.best.signal!.date : null,
        weakestSourceRank: one.best?.weakestSourceRank ?? null,
      },
    };
  });

  await db.transaction(async (tx) => {
    // Two rankings of one mandate, such as a pass and a page load, write one after the other.
    await tx.query("select pg_advisory_xact_lock(hashtext($1)::bigint)", [`book:${mandate.id}`]);
    await tx.query("delete from book_rows where mandate_id = $1 and revision = $2", [mandate.id, mandate.revision]);
    await insertRows(
      tx,
      rows,
      `insert into book_rows
         (id, mandate_id, revision, rank, candidate_id, subject_id, category, candidate_role, reason, fit, trail_ids,
          best_trail, direct_fit_only, enrichment, unknowns, has_brief, ranking)
       select x.id, $2, $3, x.rank, x.candidate_id, $4, x.category, x.candidate_role, x.reason, x.fit, x.trail_ids,
              x.best_trail, x.direct_fit_only, x.enrichment, x.unknowns, x.has_brief, x.ranking
       from jsonb_to_recordset($1::jsonb) as x(
         id text, rank integer, candidate_id text, category text, candidate_role text, reason text, fit jsonb,
         trail_ids jsonb, best_trail jsonb, direct_fit_only boolean, enrichment text, unknowns jsonb,
         has_brief boolean, ranking jsonb
       )`,
      [mandate.id, mandate.revision, subjectId],
    );
    await tx.query(
      `insert into book_runs (mandate_id, revision, gaps, candidates_considered, ranked_at)
       values ($1, $2, $3::jsonb, $4, clock_timestamp())
       on conflict (mandate_id, revision) do update set
         gaps = excluded.gaps, candidates_considered = excluded.candidates_considered, ranked_at = excluded.ranked_at`,
      [mandate.id, mandate.revision, json(gaps), candidates.size],
    );
  });

  // Trails behind a row, and trails that end in a signal or an agreement even where the end is
  // not a candidate in this mode: a counterparty discovery is worth showing by itself.
  const onRows = new Set(listed.flatMap((one) => one.trails.map((trail) => trail.id)));
  const shown = trails.filter((trail) => onRows.has(trail.id) || trail.pattern === "T6" || trail.pattern === "T4");

  return { trails, shown, rows: rows.length, gaps };
}

type BookRowRecord = {
  id: string;
  mandate_id: string;
  revision: number;
  rank: number;
  candidate_id: string;
  category: CandidateCategory;
  reason: string;
  fit: FitLine[];
  trail_ids: string[];
  best_trail: BookRow["bestTrail"];
  direct_fit_only: boolean;
  enrichment: BookRow["enrichment"];
  unknowns: string[];
  has_brief: boolean;
};

/** The stored rows of one revision, in rank order. */
export async function bookRows(db: Db, mandate: Mandate, candidateId?: string): Promise<BookRow[]> {
  const records = await db.query<BookRowRecord>(
    `select * from book_rows where mandate_id = $1 and revision = $2 ${candidateId ? "and candidate_id = $3" : ""} order by rank`,
    candidateId ? [mandate.id, mandate.revision, candidateId] : [mandate.id, mandate.revision],
  );
  const refs = await entityRefs(db, records.map((record) => record.candidate_id));
  const attending = new Set((await db.query<{ entity_id: string }>(
    "select entity_id from roster where event_id = $1 and role = 'ATTENDEE'", [SLUSH_EVENT_ID])).map((row) => row.entity_id));

  const validTrails = new Set((await storedTrails(db, mandate.subject, mandate.role)).map((trail) => trail.id));
  return records.filter((record) => record.trail_ids.length > 0 && record.trail_ids.every((id) => validTrails.has(id))).map((record) => ({
    id: record.id,
    mandateId: record.mandate_id,
    revision: record.revision,
    rank: record.rank,
    candidate: refs.get(record.candidate_id)!,
    category: record.category,
    reason: record.reason,
    fit: record.fit,
    trailIds: record.trail_ids,
    bestTrail: record.best_trail,
    directFitOnly: record.direct_fit_only,
    enrichment: record.enrichment,
    unknowns: record.unknowns,
    hasBrief: record.has_brief,
    attendee: attending.has(record.candidate_id),
  }));
}

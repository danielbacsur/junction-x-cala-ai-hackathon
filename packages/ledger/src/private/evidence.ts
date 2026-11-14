import type { EntityRef, EvidenceBundle, Hop, RelationFamily, Signal, SourceRef } from "../contract";
import {
  type DateParts,
  normalize,
  parseStoredDate,
  Scan,
  takeAmounts,
  takeCounts,
  takeDates,
  takeYears,
} from "./text";

/**
 * The evidence bundle, indexed for the checks: who is named in it, who is linked to whom and how,
 * and which amounts, dates and counts it holds. Built once per validation, from the bundle alone.
 */

/** A name from the evidence, found in a sentence. Two entities may share one name. */
export type Mention = { start: number; end: number; ids: string[]; name: string };

export type Link = {
  family: RelationFamily;
  /** For an investment tie: the entity that provided the money, or null while that is unsettled. */
  funder: string | null;
  lead: boolean;
};

/** One supported fact: the entities it is about and the figures it carries. */
type Fact = { entities: Set<string>; amounts: SupportedAmount[]; dates: SupportedDate[] };

export type SupportedAmount = {
  value: number;
  currency: string | null;
  /** True when the figure is a programme's ceiling and not a party's own amount. */
  ceiling: boolean;
  fact: Fact;
};

export type SupportedDate = DateParts & {
  /** True when this is the date of a source document and not of the event itself. */
  ofSource: boolean;
  fact: Fact;
};

export type Evidence = {
  /** The customer's own company or fund. */
  subject: string;
  name(id: string): string;
  mentions(text: string): Mention[];
  links(a: string[], b: string[]): Link[];
  /** Names of the entities the evidence links to these, in one relation family. */
  linkedTo(ids: string[], family: RelationFamily): string[];
  onOneTrail(groups: string[][]): boolean;
  /** Pairs with an investment tie whose direction no record settles. */
  undirected: [string, string][];
  amounts: SupportedAmount[];
  dates: SupportedDate[];
  counts: Set<number>;
  knows(word: string): boolean;
  cites(url: string): boolean;
};

/** Words that mark a figure as a programme's ceiling. */
export const CEILING =
  /\bceiling\b|\bmaxim(?:um|al)\b|\bup to\b|\bcap(?:ped)?\b|\bprogram(?:me)?-wide\b|\bshared (?:across|among|between)\b|\bacross all\b|\ball awardees\b|\bnot to exceed\b|\bwhole program(?:me)?\b/i;

const LEGAL_FORM =
  /[\s,]+(?:ab|as|asa|oy|oyj|ltd|limited|inc|incorporated|llc|llp|plc|gmbh|ag|sa|sas|sarl|bv|nv|spa|srl|s\.l|s\.a|sl|kk|sf|aps|a\/s|corp|co)\.?$/i;

const GENERIC_ENDING = /\s+(?:ventures|capital|vc|partners|technology|technologies|group|holding|holdings|corporation)$/i;

// A shortened name must still be a name: "Nordic Capital" is not known as "Nordic".
const PLAIN_WORDS = new Set(
  "nordic european global first general national international northern digital green blue open united american finnish swedish norwegian danish baltic future smart new innovation the".split(
    " ",
  ),
);

// Capitalised words that are not names of anything in particular.
const COMMON_WORDS = new Set(
  `i'm i'd i'll i've cala cabala bookrunner slush seed series pre-seed observed inferred unknown
   self-reported still mr ms mrs dr prof ceo cto cfo coo cpo vp gp lp vc pe ai ml saas b2b b2c api ip esg eu us usa
   founder co-founder partner director managing head chief officer president chair chairman board team
   uk europe european nordic nordics q1 q2 q3 q4 h1 h2 mou nda ipo kpi arr mrr usd eur gbp nok sek dkk chf jpy
   january february march april may june july august september october november december
   monday tuesday wednesday thursday friday saturday sunday`.split(/\s+/),
);

const FUNDER_ROLE = /invest|grantor|lend|lead|funder|donor/i;
const ISSUER_ROLE = /issuer|borrower|grantee|recipient|beneficiary/i;

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** The names an entity goes by in prose: in full, without its legal form, and without "Ventures". */
function aliasesOf(name: string): string[] {
  const full = normalize(name).trim();
  const found = new Set<string>();

  // "Finnish Environment Institute (Syke)" is known under both names.
  for (const inner of full.matchAll(/\(([^)]+)\)/g)) found.add(inner[1].trim());

  let current = full.replace(/\s*\([^)]*\)/g, "").trim();

  found.add(current);

  // One ending at a time: "Redpine Technology AB", "Redpine Technology", "Redpine".
  for (;;) {
    const withoutForm = current.replace(LEGAL_FORM, "").trim();
    const shorter = withoutForm === current ? current.replace(GENERIC_ENDING, "").trim() : withoutForm;

    if (shorter === current || shorter.length < 3 || PLAIN_WORDS.has(shorter.toLowerCase())) break;

    found.add(shorter);
    current = shorter;
  }

  return [...found].filter((alias) => alias.length >= 2);
}

function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}&'-]*/gu) ?? []).flatMap((word) => [
    word,
    word.replace(/'s$/, ""),
    ...word.split("-"),
  ]);
}

function normalUrl(url: string) {
  return url
    .trim()
    .replace(/[.,;:!?)\]]+$/, "")
    .replace(/^https?:\/\/(?:www\.)?/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function readEvidence(bundle: EvidenceBundle): Evidence {
  const { brief, mandate } = bundle;
  const trails = brief.trails ?? [];
  const ownership = brief.ownership ?? [];

  const signals = new Map<string, Signal>();

  for (const signal of [
    ...trails.flatMap((trail) => (trail.signal ? [trail.signal] : [])),
    ...(brief.directSignals ?? []),
    ...ownership.flatMap((owner) => owner.signals),
  ]) {
    signals.set(signal.id, signal);
  }

  const hops: Hop[] = trails.flatMap((trail) => trail.hops);

  // Entities and the names they go by

  const entities = new Map<string, EntityRef>();

  for (const entity of [
    mandate.subject,
    brief.candidate,
    ...trails.flatMap((trail) => [trail.subject, trail.end]),
    ...hops.flatMap((hop) => [hop.from, hop.to]),
    ...[...signals.values()].flatMap((signal) => [signal.entity, ...signal.parties.map((party) => party.entity)]),
    ...ownership.map((owner) => owner.entity),
  ]) {
    if (!entities.has(entity.id)) entities.set(entity.id, entity);
  }

  const aliases = new Map<string, { exact: string; ids: Set<string> }>();

  for (const entity of entities.values()) {
    for (const alias of aliasesOf(entity.name)) {
      const known = aliases.get(alias.toLowerCase()) ?? { exact: alias, ids: new Set<string>() };

      known.ids.add(entity.id);
      aliases.set(alias.toLowerCase(), known);
    }
  }

  const longestFirst = [...aliases.values()].map((alias) => alias.exact).sort((a, b) => b.length - a.length);

  const namePattern =
    longestFirst.length > 0
      ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${longestFirst.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "giu")
      : null;

  function mentions(text: string): Mention[] {
    if (!namePattern) return [];

    const found: Mention[] = [];

    for (const match of text.matchAll(namePattern)) {
      const alias = aliases.get(match[0].toLowerCase());

      // A short name such as "IHI" is an acronym, so it must be written as one.
      if (!alias || (alias.exact.length <= 3 && alias.exact !== match[0])) continue;

      const ids = [...alias.ids];

      found.push({ start: match.index, end: match.index + match[0].length, ids, name: entities.get(ids[0])!.name });
    }

    return found;
  }

  // Who is linked to whom

  const links = new Map<string, Link[]>();

  function link(a: string, b: string, value: Link) {
    if (a !== b) links.set(pairKey(a, b), [...(links.get(pairKey(a, b)) ?? []), value]);
  }

  for (const hop of hops) {
    const funder =
      hop.direction === "from_funds_to" ? hop.from.id : hop.direction === "to_funds_from" ? hop.to.id : null;

    link(hop.from.id, hop.to.id, {
      family: hop.family,
      funder: hop.family === "investment" ? funder : null,
      lead: /lead/i.test(hop.role ?? ""),
    });
  }

  for (const signal of signals.values()) {
    const others = signal.parties.filter((party) => party.entity.id !== signal.entity.id);

    if (signal.type === "public_money" || signal.type === "financing") {
      // The signal's entity is the one that raised the money, unless another party is named as
      // the issuer. Only a financier and an issuer of the same transaction give a direction, and
      // two financiers of one round are not linked to each other at all.
      const own = signal.parties.find((party) => party.entity.id === signal.entity.id)?.role ?? null;
      const named = others.filter((party) => ISSUER_ROLE.test(party.role ?? "")).map((party) => party.entity.id);
      const issuers = own === null && named.length === 0 ? [signal.entity.id] : named;

      if (own !== null && ISSUER_ROLE.test(own)) issuers.push(signal.entity.id);

      for (const party of others) {
        const role = party.role ?? "";

        if (FUNDER_ROLE.test(role)) {
          for (const issuer of issuers) {
            link(issuer, party.entity.id, { family: "investment", funder: party.entity.id, lead: /lead/i.test(role) });
          }
        } else if (!ISSUER_ROLE.test(role)) {
          link(signal.entity.id, party.entity.id, { family: "investment", funder: null, lead: false });
        }
      }

      if (own !== null && FUNDER_ROLE.test(own)) {
        for (const issuer of named) {
          link(issuer, signal.entity.id, { family: "investment", funder: signal.entity.id, lead: /lead/i.test(own) });
        }
      }
    } else {
      const families: RelationFamily[] =
        signal.type === "agreement"
          ? ["agreement"]
          : signal.type === "filed_event"
            ? ["agreement", "person"]
            : ["ownership", "person"];

      for (const party of others) {
        for (const family of families) link(signal.entity.id, party.entity.id, { family, funder: null, lead: false });
      }
    }
  }

  for (const owner of ownership) {
    link(brief.candidate.id, owner.entity.id, { family: "ownership", funder: null, lead: false });
  }

  const undirected: [string, string][] = [];

  for (const [key, values] of links) {
    const investment = values.filter((value) => value.family === "investment");

    if (investment.length > 0 && investment.every((value) => value.funder === null)) {
      undirected.push(key.split("|") as [string, string]);
    }
  }

  const trailMembers = trails.map(
    (trail) =>
      new Set([
        trail.subject.id,
        trail.end.id,
        ...trail.hops.flatMap((hop) => [hop.from.id, hop.to.id]),
        ...(trail.signal ? [trail.signal.entity.id, ...trail.signal.parties.map((party) => party.entity.id)] : []),
      ]),
  );

  // Figures, counts and vocabulary

  const facts: Fact[] = [];
  const counts = new Set<number>();
  const vocabulary = new Set<string>();
  const urls = new Set<string>();
  const hosts = new Set<string>();

  function cite(sources: SourceRef[], fact: Fact | null) {
    for (const source of sources ?? []) {
      const date = parseStoredDate(source.date);

      if (date && fact) fact.dates.push({ ...date, ofSource: true, fact });

      if (source.url) {
        urls.add(normalUrl(source.url));
        hosts.add(normalUrl(source.url).split("/")[0]);
      }

      if (source.name) {
        hosts.add(source.name.toLowerCase());

        for (const word of words(source.name)) vocabulary.add(word);
      }
    }
  }

  /** Reads a supported text for the figures and names it holds. */
  function read(text: string | null | undefined, fact: Fact = { entities: new Set(), amounts: [], dates: [] }): Fact {
    if (!text) return fact;

    const plain = normalize(text);
    const found = mentions(plain);
    const scan = new Scan(plain);
    const ceiling = CEILING.test(plain);

    for (const mention of found) {
      for (const id of mention.ids) fact.entities.add(id);

      scan.blank(mention.start, mention.end);
    }

    for (const date of takeDates(scan)) fact.dates.push({ ...date, ofSource: false, fact });
    for (const amount of takeAmounts(scan)) fact.amounts.push({ ...amount, ceiling, fact });
    for (const year of takeYears(scan)) fact.dates.push({ ...year, ofSource: false, fact });
    for (const count of takeCounts(scan, false)) counts.add(count.value);
    for (const word of words(plain)) vocabulary.add(word);

    return fact;
  }

  for (const entity of entities.values()) {
    for (const word of words(normalize(entity.name))) vocabulary.add(word);

    facts.push(read(entity.description, { entities: new Set([entity.id]), amounts: [], dates: [] }));
  }

  for (const signal of signals.values()) {
    const fact: Fact = {
      entities: new Set([signal.entity.id, ...signal.parties.map((party) => party.entity.id)]),
      amounts: [],
      dates: [],
    };

    if (signal.value !== null) {
      fact.amounts.push({
        value: signal.value,
        currency: signal.units?.toUpperCase() ?? null,
        ceiling: signal.valueIsProgrammeCeiling,
        fact,
      });
    }

    const date = parseStoredDate(signal.date);

    if (date) fact.dates.push({ ...date, ofSource: signal.dateKind === "reported_on", fact });

    for (const text of [signal.label, signal.claim, signal.flag, signal.instrument, signal.publicBasis?.basis]) {
      read(text, fact);
    }

    for (const party of signal.parties) read(party.role);

    cite(signal.sources, fact);
    facts.push(fact);
  }

  for (const hop of hops) {
    const fact: Fact = { entities: new Set([hop.from.id, hop.to.id]), amounts: [], dates: [] };

    for (const value of [hop.validSince, hop.validUntil]) {
      const date = parseStoredDate(value);

      if (date) fact.dates.push({ ...date, ofSource: false, fact });
    }

    for (const text of [hop.claim, hop.relationship, hop.role]) read(text, fact);

    cite(hop.sources, fact);
    facts.push(fact);
  }

  for (const supported of bundle.supportedFacts ?? []) {
    // What Cabala inferred is not evidence for a figure or a name; only what was observed,
    // reported by the customer or marked unknown is.
    if (supported.kind === "inferred") {
      cite(supported.sources, null);
      continue;
    }

    const fact = read(supported.statement);

    cite(supported.sources, fact);
    facts.push(fact);
  }

  facts.push(read(brief.coverageNote));

  for (const owner of ownership) {
    cite(owner.sources, null);
    read(owner.relation);
  }

  for (const question of brief.questions ?? []) {
    for (const word of words(normalize(question))) vocabulary.add(word);
  }

  // Counts a packet may state without the evidence spelling them out.
  const middles = new Set(hops.flatMap((hop) => [hop.from.id, hop.to.id]));

  middles.delete(mandate.subject.id);
  middles.delete(brief.candidate.id);

  for (const count of [
    trails.length,
    middles.size,
    signals.size,
    (brief.directSignals ?? []).length,
    ownership.length,
    urls.size,
    ...trails.flatMap((trail) => [trail.hopCount, trail.hops.length, trail.independentTrails]),
  ]) {
    counts.add(count);
  }

  const tally = new Map<string, number>();

  for (const signal of signals.values()) {
    // Per entity: all its signals, those of one type, and those of one instrument ("two grants").
    for (const key of [signal.entity.id, `${signal.entity.id}|${signal.type}`, `${signal.entity.id}|${signal.instrument}`]) {
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }

  for (const count of tally.values()) counts.add(count);

  return {
    subject: mandate.subject.id,
    name: (id) => entities.get(id)?.name ?? id,
    mentions,

    links(a, b) {
      return a.flatMap((left) => b.flatMap((right) => links.get(pairKey(left, right)) ?? []));
    },

    linkedTo(ids, family) {
      const names = new Set<string>();

      for (const [key, values] of links) {
        const [a, b] = key.split("|");
        const other = ids.includes(a) ? b : ids.includes(b) ? a : null;

        if (other && values.some((value) => value.family === family)) names.add(entities.get(other)?.name ?? other);
      }

      return [...names];
    },

    onOneTrail(groups) {
      return trailMembers.some((members) => groups.every((ids) => ids.some((id) => members.has(id))));
    },

    undirected,
    amounts: facts.flatMap((fact) => fact.amounts),
    dates: facts.flatMap((fact) => fact.dates),
    counts,

    knows(word) {
      const plain = word.toLowerCase().replace(/'s$/, "");

      // A single letter is an initial or a round's letter, and a number is not a name.
      return vocabulary.has(plain) || COMMON_WORDS.has(plain) || plain.length === 1 || /^\d/.test(plain);
    },

    cites(url) {
      const plain = normalUrl(url);

      return urls.has(plain) || (!plain.includes("/") && hosts.has(plain));
    },
  };
}

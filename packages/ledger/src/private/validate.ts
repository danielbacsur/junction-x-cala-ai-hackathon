import type { EvidenceBundle, PacketSections, ValidationResult, WithheldClaim } from "../contract";
import { CEILING, type Evidence, type Mention, readEvidence } from "./evidence";
import {
  ACTS,
  assertsAppetite,
  claimsCausation,
  isHedged,
  LIMIT,
  promisesIntroduction,
  RELATION_WORDS,
  REPORTING,
  UNNAMED,
} from "./language";
import { checkRelations } from "./relations";
import {
  type Amount,
  type DateMention,
  type DateParts,
  joinSentences,
  normalize,
  sameDate,
  sameValue,
  Scan,
  splitSentences,
  takeAmounts,
  takeCounts,
  takeDates,
  takeYears,
} from "./text";
import { amountWords } from "./words";

/**
 * The deterministic check of consensus point 12. It reads each sentence for what can be checked
 * against the evidence bundle (names, amounts, units, dates, counts, cited links and the relations
 * stated between named parties) and withholds the sentence when one of them is not supported.
 * It does not judge meaning: a claim with nothing checkable in it is left to the second read.
 */

/** Prose must be supported in full. List items (questions, agenda) may plan and ask freely. */
type Mode = "prose" | "list";

const URL = /https?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi;

function shares(entities: Set<string>, named: Set<string>) {
  return entities.size === 0 || named.size === 0 || [...named].some((id) => entities.has(id));
}

function names(entities: Set<string>, evidence: Evidence) {
  return [...new Set([...entities].map((id) => evidence.name(id)))].join(" and ");
}

function dateWords(date: DateParts) {
  return [date.year, date.month, date.day]
    .filter((part) => part !== null)
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

function some(values: string[]) {
  return [...new Set(values)].slice(0, 3).join("; ");
}

// A few plain words, such as " received " or "'s grant of ". A conjunction starts something new.
const SHORT = String.raw`\s*(?:(?!(?:and|or|but|plus|while|then)\b)[\w-]+\s+){0,4}$`;
const NEAR = new RegExp(`^(?:'s)?${SHORT}`);
const NEXT = new RegExp(`^${SHORT}`);
const FROM = /^\s+(?:from|by|to|with|for)\s+(?:the\s+)?$/;

/** The names a figure is tied to by its wording: "A received X", "A granted B X", "X from B". */
function tiedTo(stated: Amount, mentions: Mention[], lower: string): Mention[] {
  const before = mentions.filter((mention) => mention.end <= stated.start);
  const after = mentions.find((mention) => mention.start >= stated.end);
  const [third, second, first] = [before.at(-3), before.at(-2), before.at(-1)];
  const tied: Mention[] = [];

  if (first && NEAR.test(lower.slice(first.end, stated.start))) {
    tied.push(first);

    // "A granted B X" ties A as well, unless A closes a list: "A and C gave B X and Y".
    const listed = /(?:\band|\bor|,)\s*$/.test(lower.slice(third?.end ?? 0, second?.start ?? 0));

    if (second && !listed && NEXT.test(lower.slice(second.end, first.start))) tied.push(second);
  }

  if (after && FROM.test(lower.slice(stated.end, after.start))) tied.push(after);

  return tied;
}

function ceilingReason(stated: Amount) {
  return `In the evidence ${stated.raw} is the ceiling of a whole programme, not a party's own amount, and the sentence does not say so.`;
}

function checkAmount(stated: Amount, mentions: Mention[], lower: string, evidence: Evidence): string | null {
  const named = new Set(mentions.flatMap((mention) => mention.ids));
  const figures = evidence.amounts.filter((supported) => sameValue(stated, supported.value));
  const matches = figures.filter(
    (supported) => !stated.currency || !supported.currency || supported.currency === stated.currency,
  );

  if (matches.length === 0) {
    if (figures.length > 0) {
      return `The evidence gives ${stated.raw} in ${figures[0].currency}, not in ${stated.currency}.`;
    }

    const known = evidence.amounts
      .filter((supported) => named.size > 0 && shares(supported.fact.entities, named))
      .map((supported) => amountWords(supported.value, supported.currency));

    return (
      `The amount ${stated.raw} does not match any amount in the evidence.` +
      (known.length > 0 ? ` The evidence has ${some(known)}.` : "") +
      " A figure of the customer's own belongs in the mandate's notes, where it counts as self-reported."
    );
  }

  const near = matches.filter((supported) => shares(supported.fact.entities, named));

  if (near.length === 0) {
    return `The evidence records ${stated.raw} for ${names(matches[0].fact.entities, evidence)}, not for ${names(named, evidence)}.`;
  }

  // The parties the wording ties the figure to must be parties to the fact it comes from.
  const parties = tiedTo(stated, mentions, lower);
  const held = near.filter((supported) =>
    parties.every((party) => shares(supported.fact.entities, new Set(party.ids))),
  );

  if (held.length === 0) {
    const strangers = parties.filter((party) => !shares(near[0].fact.entities, new Set(party.ids)));

    return `The evidence records ${stated.raw} for ${names(near[0].fact.entities, evidence)}, not for ${strangers.map((party) => party.name).join(" and ")}.`;
  }

  return held.every((supported) => supported.ceiling) && !CEILING.test(lower) ? ceilingReason(stated) : null;
}

function checkDate(
  stated: DateMention,
  amounts: Amount[],
  named: Set<string>,
  lower: string,
  evidence: Evidence,
): string | null {
  const matches = evidence.dates.filter((supported) => sameDate(stated, supported));

  if (matches.length === 0) {
    const known = evidence.dates
      .filter((supported) => !supported.ofSource && named.size > 0 && shares(supported.fact.entities, named))
      .map(dateWords);

    return (
      `The date ${stated.raw} does not match any date in the evidence.` +
      (known.length > 0 ? ` The evidence has ${some(known)}.` : "")
    );
  }

  const near = matches.filter((supported) => shares(supported.fact.entities, named));

  if (near.length === 0) {
    return `The evidence has ${stated.raw} for ${names(matches[0].fact.entities, evidence)}, not for ${names(named, evidence)}.`;
  }

  const events = near.filter((supported) => !supported.ofSource);

  if (events.length === 0 && !REPORTING.test(lower)) {
    return `In the evidence ${stated.raw} is the date of a source, not of the event, so the sentence must say that this is when it was reported.`;
  }

  // A date that belongs to a fact with an amount has to come with that fact's amount.
  const fits = (events.length > 0 ? events : near).some(
    (supported) =>
      supported.fact.amounts.length === 0 ||
      supported.fact.amounts.some((amount) => amounts.some((other) => sameValue(other, amount.value))),
  );

  if (amounts.length > 0 && !fits) {
    return `The evidence does not put ${stated.raw} and ${amounts.map((amount) => amount.raw).join(", ")} in the same fact.`;
  }

  return null;
}

/** Capitalised words the evidence does not contain, read as names it does not mention. */
function unknownNames(text: string, evidence: Evidence): string[] {
  const unknown: string[] = [];
  let phrase: { words: string[]; end: number; flagged: boolean } | null = null;

  function close() {
    if (phrase?.flagged) unknown.push(phrase.words.join(" "));

    phrase = null;
  }

  for (const match of text.matchAll(/(?<![\p{L}\p{N}'])\p{Lu}[\p{L}\p{N}&'-]*/gu)) {
    const word = match[0];
    const before = text.slice(0, match.index);
    // The first word of a sentence is capitalised anyway. There it counts as a name only when it
    // is written like one ("NASA", "OpenAI") or is the party a relation's verb acts for.
    const opening = /(?:^|[:"(])[^\p{L}\p{N}\u0001]*$/u.test(before);
    const after = text.slice(match.index + word.length).toLowerCase();
    const acts = ACTS.test(after) && !UNNAMED.test(word.toLowerCase());
    // In a compound such as "Oslo-based" only the capitalised parts are names.
    const parts = word.split("-").filter((part) => /^\p{Lu}/u.test(part));
    const isUnknown =
      !evidence.knows(word) &&
      !parts.every((part) => evidence.knows(part)) &&
      (!opening || acts || /^\p{Lu}{2,}$/u.test(word) || /\p{Ll}\p{Lu}/u.test(word));

    if (phrase && match.index === phrase.end + 1 && text[phrase.end] === " ") {
      phrase.words.push(word);
      phrase.flagged ||= isUnknown;
      phrase.end = match.index + word.length;
    } else {
      close();
      phrase = { words: [word], end: match.index + word.length, flagged: isUnknown };
    }
  }

  close();

  return unknown;
}

/** Why a sentence cannot stand. Empty when nothing checkable in it fails. */
function check(sentence: string, mode: Mode, evidence: Evidence): string[] {
  // A bracketed placeholder such as "[your name]" is not prose.
  const text = normalize(sentence).replace(/\[[^\]]*\]/g, (match) => " ".repeat(match.length));

  const reasons: string[] = [];
  const scan = new Scan(text);

  // A question asserts nothing, so it may ask about anything. One thing it may still not do is
  // take a programme's ceiling for granted as somebody's amount.
  if (/\?["')\]]*\s*$/.test(text)) {
    for (const mention of evidence.mentions(text)) scan.blank(mention.start, mention.end);

    takeDates(scan);

    for (const amount of takeAmounts(scan)) {
      const figures = evidence.amounts.filter((supported) => sameValue(amount, supported.value));

      if (figures.length > 0 && figures.every((supported) => supported.ceiling) && !CEILING.test(text)) {
        reasons.push(ceilingReason(amount));
      }
    }

    return reasons;
  }

  scan.take(URL, (match) => {
    if (!evidence.cites(match[0])) {
      reasons.push(`Cites ${match[0].replace(/[.,;:!?]+$/, "")}, which is not among the evidence's sources.`);
    }
  });

  const mentions = evidence.mentions(scan.text);
  const named = new Set(mentions.flatMap((mention) => mention.ids));

  for (const mention of mentions) scan.blank(mention.start, mention.end);

  // The wording rules read the sentence with its names blanked, so a name cannot trip them.
  const lower = scan.text.toLowerCase();
  const hedged = isHedged(scan.text);

  // The customer's own name reads as "we": what they say of themselves is theirs to say.
  let voice = "";
  let at = 0;

  for (const mention of mentions) {
    voice += lower.slice(at, mention.ids.includes(evidence.subject) ? mention.start : mention.end);
    voice += mention.ids.includes(evidence.subject) ? "we" : "";
    at = mention.end;
  }

  voice += lower.slice(at);

  const introduction = promisesIntroduction(voice);

  if (introduction) reasons.push(introduction);

  if (!hedged && !LIMIT.test(lower)) {
    for (const reason of [assertsAppetite(voice), claimsCausation(voice)]) {
      if (reason) reasons.push(reason);
    }
  }

  const dates = takeDates(scan);
  const amounts = takeAmounts(scan);
  const years = takeYears(scan);
  const counts = takeCounts(scan, true);

  for (const amount of amounts) {
    const reason = checkAmount(amount, mentions, lower, evidence);

    if (reason) reasons.push(reason);
  }

  if (mode === "prose") {
    for (const date of [...dates, ...years]) {
      const reason = checkDate(date, amounts, named, lower, evidence);

      if (reason) reasons.push(reason);
    }

    for (const count of counts) {
      if (!evidence.counts.has(count.value)) {
        reasons.push(`The count ${count.raw} does not match a count in the evidence.`);
      }
    }

    // Names are checked where a sentence states a fact; a greeting or a sign-off states none.
    const figures = amounts.length + dates.length + years.length + counts.length;
    const factual = mentions.length > 0 || figures > 0 || RELATION_WORDS.test(lower);

    const unknown = factual ? unknownNames(scan.text, evidence) : [];

    if (unknown.length > 0) {
      reasons.push(`Names ${unknown.map((name) => `"${name}"`).join(", ")}, which the evidence does not mention.`);
    }
  }

  reasons.push(...checkRelations(lower, mentions, hedged, evidence));

  return [...new Set(reasons)];
}

export function validateSections(bundle: EvidenceBundle, sections: PacketSections): ValidationResult {
  const evidence = readEvidence(bundle);
  const withheld: WithheldClaim[] = [];

  function clean(text: string | null | undefined, mode: Mode): string {
    const pieces = splitSentences(text ?? "");

    const keep = pieces.map((piece) => {
      const reasons = check(piece.text, mode, evidence);

      if (reasons.length > 0) withheld.push({ sentence: piece.text, reason: reasons.join(" "), by: "validation" });

      return reasons.length === 0;
    });

    return joinSentences(pieces, keep);
  }

  function cleanList(items: string[] | null | undefined): string[] {
    return (items ?? []).map((item) => clean(item, "list")).filter(Boolean);
  }

  const cleaned: PacketSections = {
    whyMeet: clean(sections.whyMeet, "prose"),
    trail: clean(sections.trail, "prose"),
    whyHesitate: clean(sections.whyHesitate, "prose"),
    questions: cleanList(sections.questions),
    agenda: cleanList(sections.agenda),
    outreachDraft: clean(sections.outreachDraft, "prose"),
    // The owner's own notes never leave the owner's view and are not checked.
    privateNotes: sections.privateNotes ?? "",
  };

  return { ok: withheld.length === 0, sections: cleaned, withheld };
}

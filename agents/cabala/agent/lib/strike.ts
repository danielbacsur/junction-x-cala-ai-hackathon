import type { PacketSections, WithheldClaim } from "@fundraising/package-ledger";

import type { SecondRead } from "./schemas";

type Finding = SecondRead["unsupported"][number];

const TEXT_SECTIONS = ["whyMeet", "trail", "whyHesitate", "outreachDraft"] as const;
const LIST_SECTIONS = ["questions", "agenda"] as const;

/** How alike two sentences must be before a quote that is not word for word counts as found. */
const ALIKE = 0.8;

function words(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** The share of the quote's words that the candidate sentence also holds. */
function overlap(quote: string, candidate: string) {
  const wanted = words(quote);
  const have = new Set(words(candidate));

  return wanted.length === 0 ? 0 : wanted.filter((word) => have.has(word)).length / wanted.length;
}

/** Sentences end at a full stop that a capital follows, so "Kuva US Inc., the U.S. subsidiary" stays whole. */
function sentencesOf(text: string) {
  return text
    .split(/(?<=[.!?])\s+(?=[\p{Lu}"“(])|\n+/u)
    .map((each) => each.trim())
    .filter(Boolean);
}

function tidy(text: string) {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The stretch of `text` a finding quotes. A sentence that holds the quote goes whole, even when the
 * quote left out its ending; a quote that runs over several sentences goes as quoted; otherwise the
 * closest sentence counts, if it is close enough.
 */
function locate(text: string, quote: string) {
  const sentences = sentencesOf(text);
  const holding = sentences.find((sentence) => sentence.includes(quote));

  if (holding) return holding;
  if (text.includes(quote)) return quote;

  const [best] = sentences
    .map((sentence) => ({ sentence, alike: Math.min(overlap(quote, sentence), overlap(sentence, quote)) }))
    .sort((a, b) => b.alike - a.alike);

  return best && best.alike >= ALIKE ? best.sentence : null;
}

/**
 * Removes from a draft the sentences the second read found unsupported. A finding names its
 * section, but the sentence is looked for everywhere, since the same claim is withheld wherever it
 * stands. A quote that cannot be found is returned as unlocated and changes nothing.
 */
export function strike(sections: PacketSections, findings: Finding[]) {
  const next: PacketSections = { ...sections, questions: [...sections.questions], agenda: [...sections.agenda] };
  const withheld: WithheldClaim[] = [];
  const unlocated: Finding[] = [];

  for (const finding of findings) {
    let found = false;

    for (const key of TEXT_SECTIONS) {
      const sentence = locate(next[key], finding.sentence);

      if (!sentence) continue;

      next[key] = tidy(next[key].replace(sentence, ""));
      withheld.push({ sentence, reason: finding.reason, by: "second_read" });
      found = true;
    }

    for (const key of LIST_SECTIONS) {
      for (const item of next[key].filter((each) => locate(each, finding.sentence) !== null)) {
        next[key] = next[key].filter((each) => each !== item);
        withheld.push({ sentence: item, reason: finding.reason, by: "second_read" });
        found = true;
      }
    }

    if (!found) unlocated.push(finding);
  }

  return {
    sections: next,
    withheld,
    unlocated,
    emptied: [...TEXT_SECTIONS, ...LIST_SECTIONS].filter((key) => sections[key].length > 0 && next[key].length === 0),
  };
}

import type { Conclusion, Trail } from "@fundraising/package-ledger";

/**
 * Deterministic checks on a conclusion before it is stored, one per item of the "Never" list in
 * consensus point 16.6. They catch the plain cases; they are a net under Cabala's instructions,
 * not a judge of meaning.
 */
export type Objection = { trailId: string; field: keyof Conclusion; rule: string };

const PROMISED_INTRODUCTION = /\b(?:can|could|will|would|able to|happy to)\s+(?:\w+\s+){0,3}introduc|\bwarm intro/i;
const ASSERTED_APPETITE =
  /\b(?:has|have|shows?|signals?|proves?|confirms?)\s+(?:\w+\s+){0,2}appetite\b|\b(?:is|are)\s+(?:\w+\s+)?(?:looking|keen|ready|eager)\s+to\s+(?:invest|fund|back)\b|\bwants?\s+to\s+(?:invest|fund|back)\b/i;
const CLAIMED_CAUSATION = /\b(?:led to|resulted in|caused|thanks to|as a result of)\b/i;
// Verb forms and roles only: "fund", "capital" and "ventures" are also what funds are called.
const FUNDING_WORDS = /\b(?:funded|funding|invested|invests|investing|investors?|backed|backs|backing|backers?|financed|finances|financing)\b/i;
const SAYS_UNSETTLED = /\bundirected\b|\bdirection\b|\bnot (?:settled|established|known|evidenced)\b/i;

/** Two names further apart than this many words are not one statement about the pair. */
const NEAR = 8;

const ARTICLES = new Set(["the", "a", "an"]);

/** The first word of a name that is not an article, which is how prose usually refers to an entity. */
function shortName(name: string) {
  const words = name.toLowerCase().split(/\s+/);

  return words.find((word) => !ARTICLES.has(word)) ?? words[0]!;
}

function sentencesOf(text: string) {
  return text.split(/(?<=[.!?;])\s+/);
}

/**
 * Whether a sentence puts a funding word between two names, as in "A funded B", "B's backer A" or
 * "A, an investor in B". A funding word elsewhere in the sentence belongs to another pair.
 */
function fundingBetween(sentence: string, one: string, other: string) {
  const tokens = sentence.toLowerCase().match(/[\p{L}\p{N}.]+/gu) ?? [];
  const places = (name: string) => tokens.flatMap((token, index) => (token.startsWith(name) ? [index] : []));

  return places(one).some((a) =>
    places(other).some((b) => {
      const between = tokens.slice(Math.min(a, b) + 1, Math.max(a, b));

      return between.length <= NEAR && FUNDING_WORDS.test(between.join(" "));
    }),
  );
}

export function lintConclusion(conclusion: Conclusion, trail: Trail): Objection[] {
  const objections: Objection[] = [];
  const object = (field: keyof Conclusion, rule: string) => objections.push({ trailId: trail.id, field, rule });
  const undirected = trail.hops.filter((hop) => hop.direction === "undirected");
  const ceiling = trail.signal?.valueIsProgrammeCeiling ? trail.signal : null;

  // The limits sentence is where these words belong, so it is not checked.
  for (const field of ["reading", "because", "ask"] as const) {
    const text = conclusion[field];

    if (PROMISED_INTRODUCTION.test(text)) {
      object(field, "A trail is a sourced connection, not an introduction. Do not promise or imply one.");
    }

    if (ASSERTED_APPETITE.test(text)) {
      object(field, "A signal is a reason to ask, not proof of appetite. Do not assert that anyone wants to invest.");
    }

    if (field !== "ask" && CLAIMED_CAUSATION.test(text)) {
      object(field, "The trail shows that things are connected, not that one caused the other.");
    }

    if (ceiling?.value && text.includes(String(ceiling.value).slice(0, 3)) && !/ceiling/i.test(text)) {
      object(field, `${ceiling.label} carries a programme ceiling. Do not give it as a party's contract value.`);
    }

    for (const hop of undirected) {
      const worded = sentencesOf(text).some(
        (sentence) =>
          !SAYS_UNSETTLED.test(sentence) &&
          fundingBetween(sentence, shortName(hop.from.name), shortName(hop.to.name)),
      );

      if (worded) {
        object(
          field,
          `The tie between ${hop.from.name} and ${hop.to.name} is undirected. Word it as a tie or a connection, not as funding.`,
        );
      }
    }
  }

  return objections;
}

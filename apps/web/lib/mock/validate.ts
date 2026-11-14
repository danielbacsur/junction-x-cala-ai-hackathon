import type { EvidenceBundle, PacketSections, ValidationResult, WithheldClaim } from "@fundraising/package-ledger";

/**
 * The mock's stand-in for the ledger's deterministic packet checks. It reads a packet sentence by
 * sentence and withholds the ones the stored evidence cannot carry: a promised introduction,
 * asserted appetite, a programme ceiling given as a party's amount, an amount that is nowhere in
 * the evidence, and an undirected tie worded as funding.
 */

const INTRODUCTION = /\b(?:can|could|will|would|to|able to) introduce\b|\bwarm intro/i;
const APPETITE =
  /\b(?:is|are) (?:actively |now )?(?:looking|keen|eager|ready|willing) to (?:invest|fund|back|lead)\b|\bwants? to (?:invest|fund|back|lead)\b|\bwill (?:invest|fund|back|lead)\b|\bhas appetite\b/i;
const PROMISE = /\bguarantee[sd]?\b|\bis certain to\b|\bwill (?:close|sign|commit)\b/i;
const FUNDING_VERB = /\b(?:invested in|invests in|funded|funds|backed|backs|financed|led the|is an investor in)\b/i;
const HEDGE = /\bundirected\b|\btie\b|\bnot settled\b|\bwhether\b|\bdoes not\b|\bno role\b/i;

/** NASA's CSDA On-Ramp 2 ceiling, the one programme-wide figure in the saved evidence. */
const CEILING = /476\s?(?:million|m\b)/i;
const CEILING_WORDED = /\bceiling\b|\bmaximum\b|\bprogramme\b|\bprogram\b|\bshared\b/i;

const AMOUNT = /(?:(?:NOK|SEK|EUR|GBP|USD|PLN)\s?|[$€£])\s?\d[\d.,]*(?:\s?(?:million|billion|bn|m|k)\b)?|\b\d[\d.,]*\s?(?:million|billion)\b/gi;

const SCALE: Record<string, number> = { k: 1e3, m: 1e6, million: 1e6, bn: 1e9, billion: 1e9 };

/** "NOK 14,376,817" and "€6.8 million" as plain numbers, so the same amount matches however it is written. */
function amounts(text: string): number[] {
  return [...text.matchAll(AMOUNT)].map(([found]) => {
    const scale = /(million|billion|bn|m|k)\b/i.exec(found)?.[1].toLowerCase();
    const digits = found.replace(/[^\d.,]/g, "").replace(/[.,]$/, "");
    const number = scale ? Number(digits.replace(/,/g, "")) : Number(digits.replace(/[.,](?=\d{3}\b)/g, ""));

    return Math.round(number * (scale ? SCALE[scale] : 1));
  });
}

/** The first word of a name, which is how a sentence usually refers to an entity. */
const alias = (name: string) => name.split(/[\s,]+/)[0].toLowerCase();

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

function reasonFor(sentence: string, bundle: EvidenceBundle, supported: Set<number>): string | null {
  if (INTRODUCTION.test(sentence)) {
    return "An introduction is promised. A trail supports “connected through”, never “can introduce you to”.";
  }

  if (APPETITE.test(sentence)) {
    return "Appetite is asserted. A past investment or a signal is a reason to ask, not proof of what a party wants now.";
  }

  if (PROMISE.test(sentence)) return "An outcome is promised. The packet prepares a meeting and cannot promise its result.";

  if (CEILING.test(sentence) && !CEILING_WORDED.test(sentence)) {
    return "USD 476 million is the ceiling of NASA's whole CSDA On-Ramp 2 programme, shared by all awardees. Cala's claim names Kuva Space's U.S. subsidiary and gives no amount for it.";
  }

  const unsupported = amounts(sentence).find((amount) => !supported.has(amount));

  if (unsupported !== undefined && !CEILING.test(sentence)) {
    return "This amount is not in the stored evidence for this packet.";
  }

  if (FUNDING_VERB.test(sentence) && !HEDGE.test(sentence)) {
    const text = sentence.toLowerCase();

    for (const trail of bundle.brief.trails) {
      for (const hop of trail.hops) {
        if (hop.direction !== "undirected") continue;

        if (text.includes(alias(hop.from.name)) && text.includes(alias(hop.to.name))) {
          return `The tie between ${hop.from.name} and ${hop.to.name} is undirected in the stored evidence. It can be worded as a tie, not as funding.`;
        }
      }
    }
  }

  return null;
}

const PROSE = ["whyMeet", "trail", "whyHesitate", "outreachDraft"] as const;

export function validateSections(bundle: EvidenceBundle, sections: PacketSections): ValidationResult {
  const supported = new Set(bundle.supportedFacts.flatMap((fact) => amounts(fact.statement)));
  const withheld: WithheldClaim[] = [];
  const cleaned: PacketSections = { ...sections };

  for (const key of PROSE) {
    const kept: string[] = [];

    for (const sentence of sentences(sections[key])) {
      const reason = reasonFor(sentence, bundle, supported);

      if (reason) withheld.push({ sentence, reason, by: "validation" });
      else kept.push(sentence);
    }

    cleaned[key] = kept.join(" ");
  }

  return { ok: withheld.length === 0, sections: cleaned, withheld };
}

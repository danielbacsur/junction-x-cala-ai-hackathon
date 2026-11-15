import type { Hop, Signal, SourceRef, TrailPattern } from "../contract";

/**
 * The fixed wording for hops and signals. The evidence bundle and the export both use it, so a
 * packet states a relationship in the same words wherever it appears.
 */

const RELATIONSHIPS: Record<string, string> = {
  HAS_SUBSIDIARY: "has subsidiary",
  HAS_DIRECT_PARENT: "has direct parent",
  HAS_ULTIMATE_PARENT: "has ultimate parent",
  HAS_BENEFICIARY_OWNER: "has beneficial owner",
  IS_SUBSIDIARY_OF: "is a subsidiary of",
  IS_DIRECT_PARENT_OF: "is the direct parent of",
  IS_ULTIMATE_PARENT_OF: "is the ultimate parent of",
  IS_BENEFICIARY_OWNER_OF: "is a beneficial owner of",
  FOUNDED: "founded",
  WORKS_AT: "works at",
  IS_CEO_OF: "is the chief executive of",
  IS_BOARD_MEMBER_OF: "is a board member of",
};

const AGREEMENTS: Record<string, string> = {
  government_contract: "a government contract",
  public_funding: "a public funding agreement",
  partnership: "a partnership",
  customer_agreement: "a customer agreement",
  mou: "a memorandum of understanding",
  other: "an agreement",
};

const DATE_KINDS: Record<string, string> = {
  event_date: "event date",
  announcement_date: "announced on",
  close_date: "closed on",
  reported_on: "reported on",
};

export const PATTERNS: Record<TrailPattern, string> = {
  T1: "Shared backer",
  T2: "Public money next door",
  T3: "The fund behind the fund",
  T4: "Ownership",
  T5: "Shared person",
  T6: "Shared counterparty",
};

export function amountWords(value: number, units: string | null) {
  const number = value.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return units ? `${units} ${number}` : number;
}

/** One hop as a clause. An unsettled investment tie is worded as a tie, never as funding. */
export function hopWords(hop: Hop): string {
  const from = hop.from.name;
  const to = hop.to.name;
  let words: string;

  if (hop.family === "investment") {
    if (hop.direction === "from_funds_to") words = `${from} funded ${to}`;
    else if (hop.direction === "to_funds_from") words = `${to} funded ${from}`;
    else words = `${from} and ${to} have an investment tie, and Cala's records do not settle who funded whom`;
  } else if (hop.family === "agreement") {
    words = `Cala reports ${AGREEMENTS[hop.relationship] ?? AGREEMENTS.other} between ${from} and ${to}`;
  } else if (RELATIONSHIPS[hop.relationship]) {
    words = `${from} ${RELATIONSHIPS[hop.relationship]} ${to}`;
  } else {
    words = `${from} is linked to ${to} (Cala relationship ${hop.relationship})`;
  }

  const details = [
    hop.role ? `role ${hop.role}` : null,
    hop.validSince ? `since ${hop.validSince}` : null,
    hop.validUntil ? `until ${hop.validUntil}` : null,
  ].filter(Boolean);

  return details.length > 0 ? `${words} (${details.join(", ")})` : words;
}

/** One signal as a line: what happened, to whom, how much, when and with whom. */
export function signalWords(signal: Signal): string {
  const parts = [`${signal.entity.name}: ${signal.label}`];

  if (signal.value !== null) {
    const amount = amountWords(signal.value, signal.units);

    parts.push(
      signal.valueIsProgrammeCeiling
        ? `${amount} is the ceiling of the whole programme, not this party's amount`
        : amount,
    );
  }

  if (signal.date) parts.push(`${DATE_KINDS[signal.dateKind ?? ""] ?? "dated"} ${signal.date}`);
  if (signal.instrument) parts.push(`instrument ${signal.instrument}`);

  if (signal.parties.length > 0) {
    const parties = signal.parties.map((party) =>
      party.role ? `${party.entity.name} (${party.role})` : party.entity.name,
    );

    parts.push(`parties: ${parties.join(", ")}`);
  }

  if (signal.publicBasis) {
    parts.push(`${signal.publicBasis.basis} (${signal.publicBasis.ours ? "our classification" : "in Cala's words"})`);
  }

  if (signal.flag) parts.push(`flagged: ${signal.flag}`);

  return parts.join("; ");
}

/** Ends a clause as a sentence. */
export function sentence(words: string) {
  const text = words.trim();

  return /[.!?]["')\]]?$/.test(text) ? text : `${text}.`;
}

/** The same document cited twice is one source. */
export function uniqueSources(sources: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();

  return sources.filter((source) => {
    const key = `${source.url ?? ""}|${source.name ?? ""}|${source.date ?? ""}`;

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
}

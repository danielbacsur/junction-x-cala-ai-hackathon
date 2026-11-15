/**
 * The words the surface uses for what the ledger holds. They live in one place because the
 * evidence rules are wording rules: a tie whose direction is not settled is never worded as
 * funding, a claim Cala reported is never worded as verified, and a missing fact stays missing.
 */
import type {
  BookRow,
  CandidateCategory,
  Hop,
  MandateStage,
  Role,
  Signal,
  SignalType,
  Trail,
  TrailPattern,
} from "@fundraising/package-ledger";

import { formatAmount, formatDate } from "@/lib/format";

export const STAGES: readonly MandateStage[] = ["brief_received", "researching", "challenging", "ready", "delivered"];

export const STAGE_LABEL: Record<MandateStage, string> = {
  brief_received: "Brief received",
  researching: "Researching",
  challenging: "Challenging",
  ready: "Ready for your decision",
  delivered: "Delivered",
};

/** True while Cabala may still be adding to the list, so the Desk keeps asking for news. */
export const beingWorked = (stage: MandateStage) => stage === "brief_received" || stage === "researching" || stage === "challenging";

export const MANDATE_LABEL: Record<Role, string> = { founder: "Raise Mandate", investor: "Sourcing Mandate" };

export const CATEGORY: Record<CandidateCategory, { label: string; hint: string }> = {
  lead: { label: "Lead", hint: "A party you do not have yet." },
  follow_up: { label: "Follow-up", hint: "An existing backer. Worth a conversation, not a new investor." },
  non_dilutive: { label: "Non-dilutive", hint: "A public funder. Kept apart from investors." },
  direct_fit: { label: "Direct fit only", hint: "Fits your criteria. No connection to you has been demonstrated." },
};

export const ENRICHMENT: Record<BookRow["enrichment"], { label: string; hint: string }> = {
  read_in_full: { label: "Read in full", hint: "Its own record is in the store." },
  seen_in_list: { label: "Seen in a list", hint: "Known only from another entity's record. Its own has not been read." },
  queued: { label: "Queued", hint: "Its read is waiting for Cala." },
};

export const PATTERN: Record<TrailPattern, string> = {
  T1: "Shared backer",
  T2: "Public money next door",
  T3: "The fund behind the fund",
  T4: "Ownership",
  T5: "Shared person",
  T6: "Shared counterparty",
};

export const SIGNAL_LABEL: Record<SignalType, string> = {
  public_money: "Public money",
  financing: "Financing",
  filed_event: "Filed event",
  agreement: "Agreement",
  control_change: "Control change",
};

const AGREEMENT: Record<string, string> = {
  government_contract: "government contract",
  public_funding: "public funding agreement",
  partnership: "partnership",
  customer_agreement: "customer agreement",
  mou: "memorandum of understanding",
  other: "agreement",
};

const OWNERSHIP: Record<string, string> = {
  IS_SUBSIDIARY_OF: "is a subsidiary of",
  IS_DIRECT_PARENT_OF: "is the direct parent of",
  IS_ULTIMATE_PARENT_OF: "is the ultimate parent of",
  IS_BENEFICIARY_OWNER_OF: "is a beneficial owner of",
};

const PERSON: Record<string, string> = {
  FOUNDED: "founded",
  WORKS_AT: "works at",
  IS_CEO_OF: "is chief executive of",
  IS_CTO_OF: "is chief technology officer of",
  IS_COO_OF: "is chief operating officer of",
  IS_BOARD_MEMBER_OF: "sits on the board of",
};

/** The short label drawn on an edge. */
export function hopLabel(hop: Hop): string {
  if (hop.family === "agreement") return AGREEMENT[hop.relationship] ?? "agreement";
  if (hop.family === "ownership") return "ownership";
  if (hop.family === "person") return "person";
  if (hop.direction === "undirected") return "investment tie, undirected";
  if (hop.role === "GRANTOR") return "granted to";
  if (hop.role === "LENDER") return "lent to";

  return "invested in";
}

/** What the financier did, from its role in the round: a grantor granted and a lender lent. */
function funded(role: string | null): string {
  if (role === "GRANTOR") return "made a grant to";
  if (role === "LENDER") return "made a loan to";

  return "invested in";
}

/** One sentence for a hop, in the direction the evidence supports and no further. */
export function hopSentence(hop: Hop): string {
  const { from, to } = hop;

  if (hop.family === "agreement") {
    return `${from.name} and ${to.name}: ${AGREEMENT[hop.relationship] ?? "agreement"}, reported by Cala from these documents.`;
  }

  if (hop.family === "ownership") return `${from.name} ${OWNERSHIP[hop.relationship] ?? "is tied by ownership to"} ${to.name}.`;
  if (hop.family === "person") return `${from.name} ${PERSON[hop.relationship] ?? "is connected to"} ${to.name}.`;

  if (hop.direction === "from_funds_to") return `${from.name} ${funded(hop.role)} ${to.name}.`;
  if (hop.direction === "to_funds_from") return `${to.name} ${funded(hop.role)} ${from.name}.`;

  return `${from.name} and ${to.name} share an investment tie. The stored evidence does not settle who funded whom.`;
}

/** Who points at whom on a drawn investment edge: 1 towards `to`, -1 towards `from`, 0 for neither. */
export function hopArrow(hop: Hop): -1 | 0 | 1 {
  if (hop.family !== "investment") return 0;
  if (hop.direction === "from_funds_to") return 1;
  if (hop.direction === "to_funds_from") return -1;

  return 0;
}

const DATE_KIND: Record<NonNullable<Signal["dateKind"]>, string> = {
  event_date: "event date",
  announcement_date: "announced",
  close_date: "closed",
  reported_on: "reported on",
};

/** "event date 13 Mar 2025", "reported on 12 Nov 2026" or "undated". Which date it is always shows. */
export function signalDate(signal: Signal): string {
  const date = formatDate(signal.date);

  if (!date || !signal.dateKind) return "undated";

  return `${DATE_KIND[signal.dateKind]} ${date}`;
}

/** The default signal window of point 16.4: older facts are context, not signals. */
export const WINDOW_MONTHS = 24;

export function outsideWindow(signal: Signal, now: number): boolean {
  if (!signal.date) return false;

  const date = new Date(signal.date.length === 4 ? `${signal.date}-12-31` : signal.date).getTime();
  const edge = new Date(now);

  edge.setMonth(edge.getMonth() - WINDOW_MONTHS);

  return date < edge.getTime();
}

/** The amount as it may be shown: a programme ceiling is named as one, a missing value says so. */
export function signalAmount(signal: Signal): string {
  const amount = formatAmount(signal.value, signal.units);

  if (!amount) return "no amount disclosed";

  return signal.valueIsProgrammeCeiling ? `${amount} programme ceiling, not this party's amount` : amount;
}

/** "T2 · 2 hops", with the pattern spelled out for people. */
export function trailSummary(trail: Pick<Trail, "pattern" | "hopCount">): string {
  return `${PATTERN[trail.pattern]}, ${trail.hopCount} ${trail.hopCount === 1 ? "hop" : "hops"}`;
}

/** Stored evidence older than this is called stale. */
export const STALE_AFTER = 24 * 3_600_000;

export const isStale = (fetchedAt: string | null, now: number) => fetchedAt !== null && now - new Date(fetchedAt).getTime() > STALE_AFTER;

/** "3 hours ago", "2 days ago". */
export function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  return `${Math.round(hours / 24)} days ago`;
}

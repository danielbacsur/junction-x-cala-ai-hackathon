/**
 * The contract between the ledger, the agent and the web app.
 *
 * The ledger owns the public evidence store (what Cala said, and when) and the private store
 * (mandates, Books, packets, the work log). The agent and the web app only ever go through
 * the Ledger interface at the bottom of this file, so they can be built against it before
 * the implementation exists.
 */

/** Which side of the table the customer sits on. */
export type Role = "founder" | "investor";

/** How a statement is known. Every recommendation keeps these apart on screen. */
export type EvidenceKind = "observed" | "inferred" | "unknown" | "self_reported";

/** A Cala entity, by its Cala ID. */
export type EntityRef = {
  id: string;
  name: string;
  /** Cala's entity type, such as Company, Organization, Person or FundingRound. */
  entityType: string;
  description: string | null;
};

/** A document Cala cites. Missing parts stay null; nothing is filled in. */
export type SourceRef = {
  /** Publisher or register, such as "stotte.brreg.no". */
  name: string | null;
  url: string | null;
  /** ISO date Cala attached to the source, at whatever precision it has. */
  date: string | null;
  /** Cala's provenance label (FILING, PRIMARY, PRESS), when present. It is not a truth score. */
  rank: string | null;
};

export type EntityMatch = EntityRef & {
  /** True when a star read of this entity is already in the store. */
  stored: boolean;
  /** True when Cala lists it as a Slush 2026 attendee. */
  slushAttendee: boolean;
};

/** The relation families trails may walk (consensus point 16.3). */
export type RelationFamily = "investment" | "ownership" | "person" | "agreement";

export type AgreementType =
  | "government_contract"
  | "public_funding"
  | "partnership"
  | "customer_agreement"
  | "mou"
  | "other";

/** One connection between two entities on a trail. */
export type Hop = {
  from: EntityRef;
  to: EntityRef;
  family: RelationFamily;
  /** Cala's relationship type for a native hop, or the agreement type for a derived one. */
  relationship: string;
  /**
   * For investment ties: who funded whom, when roles in one transaction settle it. An unsettled
   * tie is "undirected" and must be worded as a tie, never as funding.
   */
  direction: "from_funds_to" | "to_funds_from" | "undirected" | "not_applicable";
  role: string | null;
  /** Native hops come from entity reads; derived hops from a Cala knowledge claim. */
  origin: "native" | "derived";
  /** The claim text a derived hop was built from, quoted as Cala reported it. */
  claim: string | null;
  validSince: string | null;
  validUntil: string | null;
  sources: SourceRef[];
};

export type SignalType =
  | "public_money"
  | "financing"
  | "filed_event"
  | "agreement"
  | "control_change";

/** A dated, sourced fact about one entity (consensus point 16.4). */
export type Signal = {
  id: string;
  type: SignalType;
  entity: EntityRef;
  /** Short label for a row, such as "Grant from ENOVA SF". */
  label: string;
  date: string | null;
  /** Which date it is. "reported_on" means only the source's own date is known. */
  dateKind: "event_date" | "announcement_date" | "close_date" | "reported_on" | null;
  value: number | null;
  units: string | null;
  /** Set when the value is a programme ceiling and not this party's amount. */
  valueIsProgrammeCeiling: boolean;
  instrument: string | null;
  parties: { entity: EntityRef; role: string | null }[];
  origin: "native" | "derived";
  claim: string | null;
  /** Why a funder counts as public, and whether that is our classification or Cala's words. */
  publicBasis: { basis: string; ours: boolean } | null;
  /** Set when the record's dates disagree or are missing; such a signal is context only. */
  flag: string | null;
  sources: SourceRef[];
};

export type TrailPattern = "T1" | "T2" | "T3" | "T4" | "T5" | "T6";

/** A sourced path from the subject to another entity, with what happened at the end. */
export type Trail = {
  id: string;
  pattern: TrailPattern;
  subject: EntityRef;
  end: EntityRef;
  hops: Hop[];
  /** Underlying relationship hops; an attached signal does not count. */
  hopCount: number;
  signal: Signal | null;
  weakestSourceRank: string | null;
  /** Distinct trails reaching the same end, after removing repeats of the same relationships. */
  independentTrails: number;
  /** Entities on the trail read in full, and those seen only in another entity's list. */
  readInFull: string[];
  seenInListOnly: string[];
  conclusion: Conclusion | null;
};

/** What Cabala makes of one trail (consensus point 16.6). Always Inferred. */
export type Conclusion = {
  trailId: string;
  reading: string;
  because: string;
  doesNotProve: string;
  ask: string;
};

export type Constraints = {
  stages: string[] | null;
  sectors: string[] | null;
  geographies: string[] | null;
  /** Entity names or IDs the customer rules out. */
  exclusions: string[] | null;
  /** Founder mode: list existing backers as follow-up targets. */
  includeExistingBackers: boolean | null;
  /** Founder mode: list public funders as a separate non-dilutive category. */
  includePublicFunding: boolean | null;
  /** Free text the customer supplied; shown as Self-reported. */
  notes: string | null;
};

export type MandateStage =
  | "brief_received"
  | "researching"
  | "challenging"
  | "ready"
  | "delivered";

export type Mandate = {
  id: string;
  ownerId: string;
  role: Role;
  subject: EntityRef;
  constraints: Constraints;
  /** Goes up by one on every rerank. Packets remember the revision they were built on. */
  revision: number;
  stage: MandateStage;
  /** The eve session that carries this mandate's conversation and work log. */
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** How a candidate relates to the customer. Existing backers are never new leads. */
export type CandidateCategory = "lead" | "follow_up" | "non_dilutive" | "direct_fit";

export type FitLine = {
  /** The ranking criterion, such as "Stage", "Sector" or "Lead history". */
  criterion: string;
  statement: string;
  kind: EvidenceKind;
  sources: SourceRef[];
};

export type BookRow = {
  /** Cala roster membership; absence never establishes non-attendance. */
  attendee?: boolean;
  id: string;
  mandateId: string;
  revision: number;
  rank: number;
  candidate: EntityRef;
  category: CandidateCategory;
  /** The explicit reason to meet this candidate, in one sentence. */
  reason: string;
  fit: FitLine[];
  trailIds: string[];
  /** The best trail's pattern and hop count, for the row summary. */
  bestTrail: { pattern: TrailPattern; hopCount: number; signalLabel: string | null } | null;
  /** True when no connection to the subject or its anchors was demonstrated. */
  directFitOnly: boolean;
  /** How much of this candidate has been read. */
  enrichment: "read_in_full" | "seen_in_list" | "queued";
  unknowns: string[];
  hasBrief: boolean;
};

export type Coverage = {
  /** Size and date of the stored Slush roster snapshot. */
  rosterSize: number;
  rosterFetchedAt: string | null;
  entitiesReadInFull: number;
  hubsRead: number;
  probesStored: number;
  /** "latched" means Cala refused us and no live calls are being made. */
  cala: "answering" | "latched";
  calaCheckedAt: string | null;
  newestFetchAt: string | null;
};

export type Book = {
  mandate: Mandate;
  rows: BookRow[];
  coverage: Coverage;
  /** What the research could not establish, for the gap report. */
  gaps: string[];
};

export type Brief = {
  mandateId: string;
  revision: number;
  candidate: EntityRef;
  category: CandidateCategory;
  whyMeet: FitLine[];
  whyHesitate: FitLine[];
  trails: Trail[];
  /** The candidate's own grants, financings and agreements. */
  directSignals: Signal[];
  /** Parents, subsidiaries and owners already in a stored read, with their signals. */
  ownership: { relation: string; entity: EntityRef; signals: Signal[]; sources: SourceRef[] }[];
  questions: string[];
  stillUnknown: string[];
  /** States the bounds of what was read, such as "12 of 41 portfolio ties read in full". */
  coverageNote: string;
};

/** Stored facts about one entity, for the source drawer. */
export type Dossier = {
  entity: EntityRef;
  properties: { name: string; value: string; sources: SourceRef[] }[];
  signals: Signal[];
  /** Claims Cala reported that could not become edges, kept searchable. */
  unresolvedClaims: { claim: string; sources: SourceRef[] }[];
  /** Other IDs that may be the same entity. A proposal, never a join. */
  possibleDuplicates: { entity: EntityRef; basis: string }[];
  readInFull: boolean;
  fetchedAt: string | null;
};

export type PacketSections = {
  whyMeet: string;
  trail: string;
  whyHesitate: string;
  questions: string[];
  agenda: string[];
  outreachDraft: string;
  /** Owner-only. Never leaves the owner's view. */
  privateNotes: string;
};

export type WithheldClaim = {
  sentence: string;
  reason: string;
  by: "validation" | "second_read";
};

export type Packet = {
  id: string;
  mandateId: string;
  /** Counts up from 1 within the mandate. An edit makes a new version and needs a new approval. */
  version: number;
  candidate: EntityRef;
  basedOnRevision: number;
  status: "draft" | "approved" | "superseded";
  sections: PacketSections;
  /** The trails the packet rests on, frozen with the version. */
  trails: Trail[];
  withheld: WithheldClaim[];
  approvedAt: string | null;
  createdAt: string;
};

/** Everything a packet may state, handed to the writer and to the second read. */
export type EvidenceBundle = {
  mandate: Mandate;
  brief: Brief;
  /** Sentences the checks treat as supported, each tied to its evidence. */
  supportedFacts: { statement: string; kind: EvidenceKind; sources: SourceRef[] }[];
};

export type ValidationResult = {
  ok: boolean;
  /** The sections with unsupported factual sentences removed. */
  sections: PacketSections;
  withheld: WithheldClaim[];
};

export type WorkEventKind =
  | "stage"
  | "read"
  | "probe"
  | "trail"
  | "book"
  | "withheld"
  | "queued"
  | "outage"
  | "gap"
  | "note";

/** One line of the work log. Written by trusted code, never by a model. */
export type WorkEvent = {
  id: string;
  mandateId: string;
  at: string;
  kind: WorkEventKind;
  message: string;
  /** Seconds the step took, when it has finished. */
  seconds: number | null;
  entity: EntityRef | null;
  /** For a read or probe: true when the store answered and no request went to Cala. */
  fromStore: boolean;
};

/** The statement of work: actual counts, not estimates. */
export type Statement = {
  reads: number;
  probes: number;
  sourcesCited: number;
  trailsFound: number;
  claimsWithheld: number;
  /** Requests answered from the store instead of Cala. */
  servedFromStore: number;
};

export type ProbeProposal = {
  entity: EntityRef;
  /** Why the ledger ranks this neighbour as worth a signal probe. */
  reason: string;
  alreadyProbedAt: string | null;
};

export type WorkOptions = {
  /** Ceiling on Cala requests for this pass, retries included. Defaults to 25. */
  budget?: number;
  /** Neighbours Cabala picked for signal probes, from proposeProbes. At most six. */
  probeEntityIds?: string[];
  signal?: AbortSignal;
};

export type WorkResult = {
  mandate: Mandate;
  requestsUsed: number;
  trailsFound: number;
  rows: number;
  /** True when the budget ran out or Cala stopped answering before the pass finished. */
  partial: boolean;
  gaps: string[];
};

/** One atomic claim from a Cala knowledge answer, with the passages it cites. */
export type ProbeClaim = {
  index: number;
  text: string;
  passages: { text: string; source: SourceRef }[];
};

/** A signal probe's answer, parsed from Cala's knowledge/search response. */
export type ProbeAnswer = {
  subject: EntityRef;
  question: string;
  claims: ProbeClaim[];
  /** The entities Cala resolved in the answer, with the names it matched them from. */
  entities: { id: string; name: string; entityType: string; mentions: string[] }[];
};

/** The fields of one agreement, read out of one claim. Missing data stays null. */
export type ExtractedAgreement = {
  claimIndex: number;
  /** The two parties, named exactly as the claim names them. */
  partyA: string;
  partyB: string;
  /** Their Cala IDs when the answer's entities resolve them without ambiguity, else null. */
  partyAId: string | null;
  partyBId: string | null;
  type: AgreementType;
  date: string | null;
  datePrecision: "day" | "month" | "year" | null;
  /** An intended or announced agreement is not an executed one. */
  status: "executed" | "intended" | "unknown";
  value: number | null;
  units: string | null;
  valueIsProgrammeCeiling: boolean;
  /** False when the claim concerns a subsidiary, parent or joint venture of the probed entity. */
  aboutSubjectItself: boolean;
};

/**
 * Reads agreement fields out of a probe answer. It is one schema-bound model call per answer;
 * deterministic checks in the ledger decide which of its results may become edges.
 */
export type AgreementExtractor = (answer: ProbeAnswer) => Promise<ExtractedAgreement[]>;

export class NotFoundError extends Error {}

/** Thrown when Cala is latched off and the store cannot answer the request. */
export class CalaUnavailableError extends Error {}

/**
 * Every method that takes an ownerId checks it against the row and throws NotFoundError on a
 * mismatch, so a guessed ID never reads another customer's mandate.
 */
export interface Ledger {
  // Entities

  /** Looks in the store first, then asks Cala while it is answering. */
  findEntity(name: string, options?: { types?: string[]; limit?: number }): Promise<EntityMatch[]>;
  getDossier(entityId: string): Promise<Dossier>;
  getCoverage(): Promise<Coverage>;

  // Mandates

  createMandate(input: {
    ownerId: string;
    role: Role;
    subjectId: string;
    constraints: Constraints;
  }): Promise<Mandate>;
  getMandate(mandateId: string, ownerId: string): Promise<Mandate>;
  listMandates(ownerId: string): Promise<Mandate[]>;
  attachSession(mandateId: string, ownerId: string, sessionId: string): Promise<Mandate>;
  setStage(mandateId: string, ownerId: string, stage: MandateStage): Promise<Mandate>;
  /** Reranks from the store without new reads, and bumps the revision. */
  setConstraints(mandateId: string, ownerId: string, constraints: Constraints): Promise<Book>;

  // Research

  /** One bounded research pass. Writes trails, Book rows and work events as it goes. */
  workMandate(mandateId: string, ownerId: string, options?: WorkOptions): Promise<WorkResult>;
  /**
   * A trail action: at most five new requests around one entity of the mandate, then a rerank
   * from the store. getTrails itself never fetches, so pages can call it freely.
   */
  readAround(mandateId: string, ownerId: string, entityId: string): Promise<WorkResult>;
  proposeProbes(mandateId: string, ownerId: string): Promise<ProbeProposal[]>;
  /** Runs signal probes for the named entities, inside the mandate's probe budget. */
  checkSignals(mandateId: string, ownerId: string, entityIds: string[]): Promise<Signal[]>;

  // Reading results

  readBook(mandateId: string, ownerId: string): Promise<Book>;
  getTrails(mandateId: string, ownerId: string, candidateId: string): Promise<Trail[]>;
  getBrief(mandateId: string, ownerId: string, candidateId: string): Promise<Brief>;
  saveConclusions(mandateId: string, ownerId: string, conclusions: Conclusion[]): Promise<void>;

  // Packets

  getEvidenceBundle(mandateId: string, ownerId: string, candidateId: string): Promise<EvidenceBundle>;
  /** Deterministic checks: references, counts, units, supported fields. */
  validatePacket(bundle: EvidenceBundle, sections: PacketSections): Promise<ValidationResult>;
  /** Saves a new version. Earlier versions in the mandate are superseded. */
  savePacket(input: {
    mandateId: string;
    ownerId: string;
    candidateId: string;
    sections: PacketSections;
    withheld: WithheldClaim[];
  }): Promise<Packet>;
  /** Approves exactly this version. A later edit is a new version and needs its own approval. */
  approvePacket(mandateId: string, ownerId: string, version: number): Promise<Packet>;
  getPacket(mandateId: string, ownerId: string, version: number): Promise<Packet>;
  listPackets(mandateId: string, ownerId: string): Promise<Packet[]>;
  /** The approved or draft version as Markdown, without the private notes. */
  exportPacket(mandateId: string, ownerId: string, version: number): Promise<string>;

  // Work log

  /**
   * Appends one line. With a key, a retry of the same step returns the first line instead of
   * appending a second.
   */
  logWork(
    mandateId: string,
    event: Omit<WorkEvent, "id" | "mandateId" | "at"> & { key?: string },
  ): Promise<WorkEvent>;
  listWorkEvents(mandateId: string, ownerId: string, afterId?: string): Promise<WorkEvent[]>;
  getStatement(mandateId: string, ownerId: string): Promise<Statement>;
}

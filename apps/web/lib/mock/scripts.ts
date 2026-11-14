/**
 * What the mock ledger replays for a mandate: the work log of one research pass, the Book rows
 * as they appear, the trails behind them, the briefs and a first packet draft. Each script is a
 * timeline in seconds, so the Desk can be watched filling in, or pinned at any moment.
 */
import type {
  BookRow,
  Brief,
  Conclusion,
  EntityRef,
  MandateStage,
  PacketSections,
  Role,
  Trail,
  WithheldClaim,
  WorkEvent,
} from "@fundraising/package-ledger";

import { E, HOP, S, SIGNAL } from "@/lib/mock/evidence";

export type ScriptKey = "founder" | "investor" | "cold";

type EventSeed = Pick<WorkEvent, "kind" | "message" | "entity" | "fromStore"> & {
  /** Seconds the step took. With `until`, the step is in flight until then. */
  seconds: number | null;
  until?: number;
};

export type Step = { at: number } & ({ stage: MandateStage } | { event: EventSeed });

export type RowSeed = Omit<BookRow, "id" | "mandateId" | "revision" | "rank" | "hasBrief"> & {
  /** When the row enters the Book, and when its brief is written. */
  at: number;
  briefAt?: number;
};

export type BriefSeed = Omit<Brief, "mandateId" | "revision" | "trails"> & { trailIds: string[] };

export type PacketSeed = {
  at: number;
  candidate: EntityRef;
  sections: PacketSections;
  withheld: WithheldClaim[];
};

export type Script = {
  role: Role;
  subject: EntityRef;
  steps: Step[];
  rows: RowSeed[];
  trails: Record<string, Trail>;
  briefs: Record<string, BriefSeed>;
  gaps: { at: number; text: string }[];
  packet: PacketSeed | null;
  /** True when the pass ends with Cala refusing requests, as it did at 12:41 on 14 Nov. */
  latched: boolean;
  /** The second at which the pass has nothing more to add. */
  length: number;
};

const conclusion = (trailId: string, reading: string, because: string, doesNotProve: string, ask: string): Conclusion => ({
  trailId,
  reading,
  because,
  doesNotProve,
  ask,
});

const read = (entity: EntityRef, message: string, seconds: number): EventSeed => ({
  kind: "read",
  message,
  entity,
  fromStore: true,
  seconds,
});

const line = (kind: WorkEvent["kind"], message: string, entity: EntityRef | null = null): EventSeed => ({
  kind,
  message,
  entity,
  fromStore: false,
  seconds: null,
});

// ---------------------------------------------------------------------------
// Founder: Redpine Technology AB. The trail of point 8, 0:45 to 1:20.
// ---------------------------------------------------------------------------

const FOUNDER_TRAILS: Record<string, Trail> = {
  "t2-luminar-enova": {
    id: "t2-luminar-enova",
    pattern: "T2",
    subject: E.redpine,
    end: E.photoncycle,
    hops: [HOP.redpineLuminar, HOP.luminarPhotoncycle],
    hopCount: 2,
    signal: SIGNAL.enova,
    weakestSourceRank: "PRESS",
    independentTrails: 2,
    readInFull: [E.redpine.id, E.luminar.id, E.photoncycle.id],
    seenInListOnly: [],
    conclusion: conclusion(
      "t2-luminar-enova",
      "Public money has reached a company beside you: ENOVA SF funded Photoncycle, which shares your backer Luminar Ventures.",
      "Luminar Ventures is INVESTOR in your seed round and in Photoncycle's seed and Series A. ENOVA SF is GRANTOR in a Photoncycle grant round of NOK 14,376,817, event date 13 Mar 2025.",
      "It does not show that ENOVA SF funds software companies or companies outside Norway, that a programme is open now, or that Luminar Ventures had any part in the grant.",
      "Ask Luminar Ventures how Photoncycle obtained the ENOVA SF grant, and whether any of that experience carries over to you.",
    ),
  },
  "t2-luminar-innovation-norway": {
    id: "t2-luminar-innovation-norway",
    pattern: "T2",
    subject: E.redpine,
    end: E.photoncycle,
    hops: [HOP.redpineLuminar, HOP.luminarPhotoncycle],
    hopCount: 2,
    signal: SIGNAL.innovationNorway,
    weakestSourceRank: "PRESS",
    independentTrails: 1,
    readInFull: [E.redpine.id, E.luminar.id, E.photoncycle.id],
    seenInListOnly: [],
    conclusion: conclusion(
      "t2-luminar-innovation-norway",
      "A second public grant to Photoncycle is on record, from Innovation Norway, but the record's dates disagree.",
      "Luminar Ventures is INVESTOR in your seed round and in Photoncycle's rounds. Innovation Norway is GRANTOR in a Photoncycle grant round of NOK 5,300,000.",
      "With an event date of 27 Jan 2023 and register entries from late 2025, this may be two awards recorded as one. It is not counted as a dated signal.",
      "Ask Photoncycle's backers which Innovation Norway awards these are before relying on the amount or the date.",
    ),
  },
  "t2-nordicninja-enova": {
    id: "t2-nordicninja-enova",
    pattern: "T2",
    subject: E.redpine,
    end: E.photoncycle,
    hops: [HOP.redpineNordicninja, HOP.nordicninjaPhotoncycle],
    hopCount: 2,
    signal: SIGNAL.enova,
    weakestSourceRank: "PRESS",
    independentTrails: 2,
    readInFull: [E.redpine.id, E.photoncycle.id],
    seenInListOnly: [E.nordicninja.id],
    conclusion: conclusion(
      "t2-nordicninja-enova",
      "A second connection runs to the same grant: NORDICNINJA VC LIMITED is tied to you and to Photoncycle.",
      "NORDICNINJA VC LIMITED is in your investor list and in Photoncycle's. ENOVA SF is GRANTOR in the Photoncycle grant round.",
      "Neither tie states a role, so the stored evidence does not settle who funded whom. It is a tie, not an observed investment.",
      "Confirm with NORDICNINJA VC LIMITED what its relationship to Photoncycle is.",
    ),
  },
  "t2-vinnova": {
    id: "t2-vinnova",
    pattern: "T2",
    subject: E.redpine,
    end: E.vinnova,
    hops: [HOP.redpineVinnova],
    hopCount: 1,
    signal: SIGNAL.vinnova,
    weakestSourceRank: "PRIMARY",
    independentTrails: 1,
    readInFull: [E.redpine.id],
    seenInListOnly: [E.vinnova.id],
    conclusion: conclusion(
      "t2-vinnova",
      "VINNOVA has already granted you money once.",
      "VINNOVA is GRANTOR in a grant round of SEK 40,000 where you are ISSUER, sourced to vinnova.se.",
      "One conference grant does not show that a larger VINNOVA programme fits you. The record carries no event date.",
      "Ask your VINNOVA contact which programmes follow a first conference grant.",
    ),
  },
  "t1-lifeline": {
    id: "t1-lifeline",
    pattern: "T1",
    subject: E.redpine,
    end: E.lifelineAb,
    hops: [HOP.redpineLuminar, HOP.luminarPhotoncycle, HOP.photoncycleLifeline],
    hopCount: 3,
    signal: SIGNAL.photoncycleSeriesA,
    weakestSourceRank: "PRESS",
    independentTrails: 1,
    readInFull: [E.redpine.id, E.luminar.id, E.photoncycle.id],
    seenInListOnly: [E.lifelineAb.id],
    conclusion: conclusion(
      "t1-lifeline",
      "This investor is tied to a company beside you: Lifeline Ventures AB and your backer Luminar Ventures both appear around Photoncycle.",
      "Luminar Ventures is INVESTOR in your seed round and in Photoncycle's rounds. Lifeline Ventures AB is in Photoncycle's investor list, sourced to coverage of its Series A.",
      "It does not show that Lifeline is investing now, that it invests at your stage or in your sector, or that anyone will introduce you. The Lifeline tie states no role, and Cala holds several Lifeline Ventures entities.",
      "Ask Luminar Ventures how the Photoncycle Series A came together and which Lifeline fund took part.",
    ),
  },
  "t1-voima": {
    id: "t1-voima",
    pattern: "T1",
    subject: E.redpine,
    end: E.voimaOy,
    hops: [HOP.redpineLuminar, HOP.luminarPhotoncycle, HOP.photoncycleVoima],
    hopCount: 3,
    signal: SIGNAL.photoncycleSeriesA,
    weakestSourceRank: null,
    independentTrails: 1,
    readInFull: [E.redpine.id, E.luminar.id, E.photoncycle.id],
    seenInListOnly: [E.voimaOy.id],
    conclusion: conclusion(
      "t1-voima",
      "This investor is tied to a company beside you: Voima Ventures Oy and your backer Luminar Ventures both appear around Photoncycle.",
      "Luminar Ventures is INVESTOR in your seed round and in Photoncycle's rounds. Voima Ventures Oy is in Photoncycle's investor list, sourced to Voima's own portfolio page.",
      "It does not show that Voima is investing now or that it invests in software. The tie states no role, and Cala holds Voima Ventures under two IDs.",
      "Ask Luminar Ventures whether Voima Ventures looks beyond energy and deep tech.",
    ),
  },
  "t1-eviny": {
    id: "t1-eviny",
    pattern: "T1",
    subject: E.redpine,
    end: E.eviny,
    hops: [HOP.redpineLuminar, HOP.luminarPhotoncycle, HOP.photoncycleEviny],
    hopCount: 3,
    signal: SIGNAL.photoncycleSeriesA,
    weakestSourceRank: null,
    independentTrails: 1,
    readInFull: [E.redpine.id, E.luminar.id, E.photoncycle.id],
    seenInListOnly: [E.eviny.id],
    conclusion: conclusion(
      "t1-eviny",
      "This investor is tied to a company beside you: Eviny Ventures and your backer Luminar Ventures both appear around Photoncycle.",
      "Luminar Ventures is INVESTOR in your seed round and in Photoncycle's rounds. Eviny Ventures is in Photoncycle's investor list, sourced to an aggregator.",
      "It does not show that Eviny Ventures invests outside energy, or at all now. The tie states no role and rests on one aggregator page.",
      "Ask Luminar Ventures whether Eviny Ventures has backed anything outside energy.",
    ),
  },
};

const FOUNDER_ROWS: RowSeed[] = [
  {
    at: 6,
    briefAt: 44,
    candidate: E.luminar,
    category: "follow_up",
    reason:
      "Existing backer. Its portfolio company Photoncycle received a public grant in March 2025: ask Luminar how Photoncycle obtained it.",
    fit: [
      {
        criterion: "Trail",
        statement: "INVESTOR in your seed round and in Photoncycle's seed and Series A, with its role stated in each round.",
        kind: "observed",
        sources: [S.tfnRedpine, S.tnwPhotoncycle, S.photoncycleSeed],
      },
      {
        criterion: "Signal",
        statement: "Photoncycle received a grant of NOK 14,376,817 from ENOVA SF, event date 13 Mar 2025.",
        kind: "observed",
        sources: [S.brregEnova],
      },
      {
        criterion: "Stage",
        statement: "Lead investor in the seed rounds of Corsmed AB and Lightbringer, both sourced to December 2024.",
        kind: "observed",
        sources: [S.corsmedSeed, S.lightbringerSeed],
      },
      {
        criterion: "Lead history",
        statement: "No lead count shown: 17 of its 41 portfolio ties carry a round role in the stored reads.",
        kind: "unknown",
        sources: [],
      },
    ],
    trailIds: ["t2-luminar-enova", "t2-luminar-innovation-norway"],
    bestTrail: { pattern: "T2", hopCount: 2, signalLabel: "Grant from ENOVA SF" },
    directFitOnly: false,
    enrichment: "read_in_full",
    unknowns: ["Whether Luminar Ventures takes part in Series A rounds now", "Whether ENOVA SF's programme is open to a Swedish software company"],
  },
  {
    at: 9,
    briefAt: 45,
    candidate: E.enova,
    category: "non_dilutive",
    reason:
      "Public money next door: ENOVA SF granted NOK 14,376,817 to Photoncycle, which is connected to you through two of your backers. Ask your investor how the sibling obtained it.",
    fit: [
      {
        criterion: "Trail",
        statement: "GRANTOR in a grant round of Photoncycle, a company connected to you through Luminar Ventures and NORDICNINJA VC LIMITED.",
        kind: "observed",
        sources: [S.brregEnova],
      },
      {
        criterion: "Public body",
        statement: "Classed as public by us: it is the grantor in Norway's state-aid register. Cala's description does not say so.",
        kind: "inferred",
        sources: [S.brregEnova],
      },
      {
        criterion: "Fit",
        statement: "Whether its programmes cover software, or companies outside Norway, is not in the stored evidence.",
        kind: "unknown",
        sources: [],
      },
    ],
    trailIds: ["t2-luminar-enova", "t2-nordicninja-enova"],
    bestTrail: { pattern: "T2", hopCount: 2, signalLabel: "Grant from ENOVA SF" },
    directFitOnly: false,
    enrichment: "seen_in_list",
    unknowns: ["ENOVA SF's own record: not read", "Eligibility of a Swedish company"],
  },
  {
    at: 6,
    candidate: E.nordicninja,
    category: "follow_up",
    reason: "Existing backer, tied to Photoncycle as well. The direction of both ties is not settled in the stored evidence.",
    fit: [
      {
        criterion: "Trail",
        statement: "Listed among your investors and among Photoncycle's. Neither list states a role.",
        kind: "observed",
        sources: [S.euStartupsRedpine, S.tracxnPhotoncycle],
      },
      {
        criterion: "Direction",
        statement: "Undirected: its own record has not been read, so no round shows who funded whom.",
        kind: "unknown",
        sources: [],
      },
    ],
    trailIds: ["t2-nordicninja-enova"],
    bestTrail: { pattern: "T2", hopCount: 2, signalLabel: "Grant from ENOVA SF" },
    directFitOnly: false,
    enrichment: "seen_in_list",
    unknowns: ["Direction of both ties", "Fund size and stage focus"],
  },
  {
    at: 9,
    candidate: E.vinnova,
    category: "non_dilutive",
    reason: "Already your grantor: one grant of SEK 40,000 is in the graph. A follow-up target, not a new source.",
    fit: [
      {
        criterion: "Trail",
        statement: "GRANTOR in one grant round where you are ISSUER.",
        kind: "observed",
        sources: [S.vinnova],
      },
      {
        criterion: "Signal",
        statement: "The grant carries no event date. Its source is dated 12 Nov 2026, so it is shown as reported on that day and left out of recency comparisons.",
        kind: "observed",
        sources: [S.vinnova],
      },
    ],
    trailIds: ["t2-vinnova"],
    bestTrail: { pattern: "T2", hopCount: 1, signalLabel: "Grant from VINNOVA" },
    directFitOnly: false,
    enrichment: "seen_in_list",
    unknowns: ["Which VINNOVA programmes follow a first conference grant"],
  },
  {
    at: 15,
    briefAt: 46,
    candidate: E.lifelineAb,
    category: "lead",
    reason: "Tied to Photoncycle, which your backer Luminar Ventures funded. The shared backer is the route to ask about.",
    fit: [
      {
        criterion: "Trail",
        statement: "In Photoncycle's investor list, sourced to coverage of its Series A. No role is stated.",
        kind: "observed",
        sources: [S.tnwPhotoncycle],
      },
      {
        criterion: "Identity",
        statement: "Cala holds this tie on Lifeline Ventures AB, a Stockholm company. A separate entity, Lifeline Ventures, is a Helsinki venture firm.",
        kind: "observed",
        sources: [],
      },
      { criterion: "Stage", statement: "Stage, sector and cheque size: not read.", kind: "unknown", sources: [] },
    ],
    trailIds: ["t1-lifeline"],
    bestTrail: { pattern: "T1", hopCount: 3, signalLabel: "Financing raised" },
    directFitOnly: false,
    enrichment: "seen_in_list",
    unknowns: ["Which Lifeline entity holds the Photoncycle tie", "Stage, sector and cheque size", "Whether it is investing now"],
  },
  {
    at: 15,
    candidate: E.voimaOy,
    category: "lead",
    reason: "Tied to Photoncycle, which your backer Luminar Ventures funded. Sourced to Voima's own portfolio page.",
    fit: [
      {
        criterion: "Trail",
        statement: "In Photoncycle's investor list. No role is stated.",
        kind: "observed",
        sources: [S.voimaPortfolio],
      },
      {
        criterion: "Identity",
        statement: "Cala holds Voima Ventures under two IDs, and both are in Photoncycle's investor list. They are not joined.",
        kind: "observed",
        sources: [S.voimaPortfolio, S.tracxnPhotoncycle],
      },
      { criterion: "Sector", statement: "Whether it invests in software: not read.", kind: "unknown", sources: [] },
    ],
    trailIds: ["t1-voima"],
    bestTrail: { pattern: "T1", hopCount: 3, signalLabel: "Financing raised" },
    directFitOnly: false,
    enrichment: "seen_in_list",
    unknowns: ["Sector and stage focus", "Which of the two Voima entities is the fund"],
  },
  {
    at: 15,
    candidate: E.eviny,
    category: "lead",
    reason: "Tied to Photoncycle, which your backer Luminar Ventures funded. The tie rests on one aggregator page.",
    fit: [
      {
        criterion: "Trail",
        statement: "In Photoncycle's investor list. No role is stated.",
        kind: "observed",
        sources: [S.tracxnPhotoncycle],
      },
      { criterion: "Sector", statement: "Whether it invests outside energy: not read.", kind: "unknown", sources: [] },
    ],
    trailIds: ["t1-eviny"],
    bestTrail: { pattern: "T1", hopCount: 3, signalLabel: "Financing raised" },
    directFitOnly: false,
    enrichment: "seen_in_list",
    unknowns: ["Sector focus", "Whether it is investing now"],
  },
  {
    at: 9,
    candidate: E.innovationNorway,
    category: "non_dilutive",
    reason: "A second grant to Photoncycle is on record, but its dates disagree. Shown as context until the record is reconciled.",
    fit: [
      {
        criterion: "Signal",
        statement: "NOK 5,300,000, event date 27 Jan 2023, with register entries dated 22 Sep 2025 and 11 Dec 2025. Flagged, not counted as one dated award.",
        kind: "observed",
        sources: [S.brregInnovationA, S.brregInnovationB],
      },
    ],
    trailIds: ["t2-luminar-innovation-norway"],
    bestTrail: { pattern: "T2", hopCount: 2, signalLabel: "Grant from Innovation Norway" },
    directFitOnly: false,
    enrichment: "seen_in_list",
    unknowns: ["Whether this is one award or two"],
  },
  {
    at: 11,
    candidate: E.nodevc,
    category: "follow_up",
    reason: "Existing backer. No trail yet: its portfolio read is queued for Cala.",
    fit: [
      {
        criterion: "Trail",
        statement: "Listed among your investors. Nothing further is stored.",
        kind: "observed",
        sources: [S.tfnRedpine, S.tnwRedpine],
      },
    ],
    trailIds: [],
    bestTrail: null,
    directFitOnly: false,
    enrichment: "queued",
    unknowns: ["Its portfolio: read queued"],
  },
];

const FOUNDER_BRIEFS: Record<string, BriefSeed> = {
  [E.luminar.id]: {
    candidate: E.luminar,
    category: "follow_up",
    whyMeet: [
      {
        criterion: "Shared ground",
        statement: "Luminar Ventures already holds a stake in you: it is INVESTOR in your seed round.",
        kind: "observed",
        sources: [S.tfnRedpine, S.tnwRedpine],
      },
      {
        criterion: "Public money next door",
        statement: "Its portfolio company Photoncycle received NOK 14,376,817 from ENOVA SF, event date 13 Mar 2025.",
        kind: "observed",
        sources: [S.brregEnova],
      },
      {
        criterion: "Follow-on",
        statement: "It is INVESTOR in Photoncycle's Series A as well as its seed.",
        kind: "observed",
        sources: [S.tnwPhotoncycle, S.photoncycleSeed],
      },
      {
        criterion: "What that suggests",
        statement: "Luminar has watched a portfolio company obtain a large public grant, and is the nearest party who can say how it was done.",
        kind: "inferred",
        sources: [],
      },
    ],
    whyHesitate: [
      {
        criterion: "Not a new lead",
        statement: "An existing backer is a follow-up target. This meeting does not add an investor to your round.",
        kind: "inferred",
        sources: [],
      },
      {
        criterion: "Different ground",
        statement: "Photoncycle is listed under energy and is headquartered in Oslo. You are listed under AI, in Stockholm. The grant may not carry over.",
        kind: "inferred",
        sources: [S.photoncycleLinkedin, S.redpineLinkedin],
      },
      {
        criterion: "Lead history",
        statement: "No lead count: 17 of its 41 portfolio ties carry a round role in the stored reads.",
        kind: "unknown",
        sources: [],
      },
    ],
    trailIds: ["t2-luminar-enova", "t2-luminar-innovation-norway"],
    directSignals: [],
    ownership: [],
    questions: [
      "How did Photoncycle obtain its ENOVA SF grant, and who led the application?",
      "Would you take part in our Series A, and at what share?",
      "Which of your co-investors in Photoncycle look at data infrastructure?",
    ],
    stillUnknown: [
      "Whether ENOVA SF, or a Swedish equivalent, funds companies like yours",
      "Luminar's reserve for follow-on rounds",
      "Whether Luminar leads at Series A",
    ],
    coverageNote:
      "Luminar Ventures read in full at 12:27 on 14 Nov 2026: 41 portfolio ties, 17 with a round role. 6 of its portfolio companies are read in full.",
  },
  [E.enova.id]: {
    candidate: E.enova,
    category: "non_dilutive",
    whyMeet: [
      {
        criterion: "Public money next door",
        statement: "GRANTOR of NOK 14,376,817 to Photoncycle, event date 13 Mar 2025.",
        kind: "observed",
        sources: [S.brregEnova],
      },
      {
        criterion: "Two trails",
        statement: "Photoncycle is connected to you through Luminar Ventures and through NORDICNINJA VC LIMITED.",
        kind: "observed",
        sources: [S.tfnRedpine, S.tracxnPhotoncycle],
      },
      {
        criterion: "What that suggests",
        statement: "A public funder is active one company away from you. The practical step is to ask your investor, not to apply cold.",
        kind: "inferred",
        sources: [],
      },
    ],
    whyHesitate: [
      {
        criterion: "Fit",
        statement: "Nothing in the stored evidence shows ENOVA SF funding software, or a company outside Norway.",
        kind: "unknown",
        sources: [],
      },
      {
        criterion: "Classification",
        statement: "We class ENOVA SF as a public body because it is the grantor in Norway's state-aid register. Cala's description does not say so.",
        kind: "inferred",
        sources: [S.brregEnova],
      },
    ],
    trailIds: ["t2-luminar-enova", "t2-nordicninja-enova"],
    directSignals: [SIGNAL.enova],
    ownership: [],
    questions: [
      "Which ENOVA SF programme funded Photoncycle, and is it open to non-Norwegian applicants?",
      "What did the application require, and how long did it take?",
    ],
    stillUnknown: ["ENOVA SF's programmes and eligibility rules", "Whether a Swedish body runs a comparable programme"],
    coverageNote: "ENOVA SF is seen only as GRANTOR in one Photoncycle round. Its own record has not been read.",
  },
  [E.lifelineAb.id]: {
    candidate: E.lifelineAb,
    category: "lead",
    whyMeet: [
      {
        criterion: "Shared backer route",
        statement: "Lifeline Ventures AB is in the investor list of Photoncycle, a company your backer Luminar Ventures funded.",
        kind: "observed",
        sources: [S.tnwPhotoncycle],
      },
      {
        criterion: "Recent activity",
        statement: "Photoncycle raised financing with an event date of 4 Mar 2026.",
        kind: "observed",
        sources: [S.tracxnPhotoncycle, S.euStartupsPhotoncycle],
      },
      {
        criterion: "What that suggests",
        statement: "An investor active beside you this year, connected through a backer you already have.",
        kind: "inferred",
        sources: [],
      },
    ],
    whyHesitate: [
      {
        criterion: "Identity",
        statement: "Cala holds six Lifeline Ventures entities. The Photoncycle tie sits on Lifeline Ventures AB, a Stockholm company, not on the Helsinki venture firm.",
        kind: "observed",
        sources: [],
      },
      {
        criterion: "Direction",
        statement: "The tie to Photoncycle states no role. It is a tie, not an observed investment.",
        kind: "observed",
        sources: [S.tnwPhotoncycle],
      },
      {
        criterion: "Fit",
        statement: "Stage, sector and cheque size are still unknown: Lifeline has not been read.",
        kind: "unknown",
        sources: [],
      },
    ],
    trailIds: ["t1-lifeline"],
    directSignals: [],
    ownership: [],
    questions: [
      "Which Lifeline fund holds the Photoncycle position?",
      "Does Lifeline look at data infrastructure for AI, and at which stage?",
      "Who at Luminar worked with Lifeline on Photoncycle?",
    ],
    stillUnknown: ["Which Lifeline entity is the investor", "Its stage, sector and cheque size", "Whether it is investing now"],
    coverageNote: "Lifeline Ventures AB is seen only in Photoncycle's investor list. Its own record has not been read.",
  },
};

const FOUNDER_PACKET: PacketSeed = {
  at: 48,
  candidate: E.luminar,
  sections: {
    whyMeet:
      "Luminar Ventures is INVESTOR in Redpine's seed round and in Photoncycle's seed and Series A. Photoncycle received a grant of NOK 14,376,817 from ENOVA SF, event date 13 Mar 2025. Luminar has seen a portfolio company obtain public money and is the nearest party who can say how it was done.",
    trail:
      "Redpine Technology AB, funded by Luminar Ventures, which also funded Photoncycle. A grant from ENOVA SF is attached to Photoncycle. Both investment hops carry a stated role in a round, and the grant is sourced to Norway's state-aid register.",
    whyHesitate:
      "Luminar is an existing backer, so this meeting does not add a new investor. Photoncycle is listed under energy in Oslo, and its grant may not carry over to a Swedish software company. Luminar's lead history is not counted: 17 of its 41 portfolio ties carry a round role in the stored reads.",
    questions: [
      "How did Photoncycle obtain its ENOVA SF grant, and who led the application?",
      "Would you take part in our Series A, and at what share?",
      "Which of your co-investors in Photoncycle look at data infrastructure?",
    ],
    agenda: [
      "Where our Series A stands (5 min)",
      "How Photoncycle obtained the ENOVA SF grant (10 min)",
      "Luminar's part in the round, and who else to speak to (10 min)",
      "Next steps and owners (5 min)",
    ],
    outreachDraft:
      "Hi, ahead of Slush I would like 30 minutes on two things: where Luminar stands on our Series A, and how Photoncycle went about its ENOVA SF grant. I have a short list of questions and will send it before we meet.",
    privateNotes: "",
  },
  withheld: [
    {
      sentence: "Luminar Ventures can introduce you to ENOVA SF.",
      reason: "An introduction is promised. A trail supports “connected through”, and no stored evidence links Luminar to ENOVA SF.",
      by: "second_read",
    },
    {
      sentence: "ENOVA SF is looking to fund AI companies.",
      reason: "Appetite is asserted. The stored evidence holds one ENOVA SF grant, to a company listed under energy.",
      by: "second_read",
    },
  ],
};

const FOUNDER: Script = {
  role: "founder",
  subject: E.redpine,
  latched: false,
  length: 50,
  steps: [
    { at: 0, stage: "brief_received" },
    { at: 3, stage: "researching" },
    { at: 3, event: read(E.redpine, "Read Redpine Technology AB", 0.8) },
    { at: 4, event: read(E.luminar, "Read Luminar Ventures: 41 portfolio ties", 0.6) },
    { at: 5, event: read(E.photoncycle, "Read Photoncycle", 1.5) },
    { at: 6, event: line("trail", "Trail found: Redpine Technology AB, Luminar Ventures, Photoncycle", E.photoncycle) },
    { at: 7, event: read(E.photoncycle, "Read a Photoncycle grant round: ENOVA SF is GRANTOR", 1.1) },
    { at: 8, event: read(E.photoncycle, "Read a Photoncycle grant round: Innovation Norway is GRANTOR", 0.2) },
    { at: 9, event: line("trail", "Signal attached: grant from ENOVA SF, NOK 14,376,817, event date 13 Mar 2025", E.photoncycle) },
    {
      at: 10,
      event: {
        kind: "probe",
        message: "Signal probe for Redpine Technology AB",
        entity: E.redpine,
        fromStore: false,
        seconds: 32,
        until: 42,
      },
    },
    { at: 11, event: line("queued", "Queued for Cala: the portfolio read of node.vc", E.nodevc) },
    { at: 15, event: line("book", "Three investors added from Photoncycle's investor list, seen in the list only") },
    { at: 42, event: line("note", "Probe answered: no agreements found by Cala for Redpine Technology AB on 14 Nov 2026", E.redpine) },
    { at: 43, stage: "challenging" },
    { at: 46, event: line("note", "Three briefs written") },
    { at: 47, event: line("withheld", "Second read: 2 claims withheld") },
    { at: 48, event: line("gap", "Lifeline Ventures AB: Cala holds six entities of that name, and they are not joined", E.lifelineAb) },
    { at: 50, stage: "ready" },
    { at: 50, event: line("book", "Book ready: 9 rows, 3 briefs, 1 packet draft") },
  ],
  rows: FOUNDER_ROWS,
  trails: FOUNDER_TRAILS,
  briefs: FOUNDER_BRIEFS,
  gaps: [
    { at: 11, text: "node.vc: its portfolio has not been read. The read is queued for Cala." },
    { at: 42, text: "Redpine Technology AB: a signal probe found no agreements on 14 Nov 2026. That is none found, not none exist." },
    { at: 48, text: "Lifeline Ventures AB, Voima Ventures Oy and Eviny Ventures are seen in Photoncycle's investor list only. Their stage, sector and direction of investment are still unknown." },
    { at: 48, text: "Innovation Norway: the grant record's dates disagree, so it is context and not a dated signal." },
  ],
  packet: FOUNDER_PACKET,
};

// ---------------------------------------------------------------------------
// Investor: OTB Ventures, by way of ICEYE. The agreement trail of point 8,
// 1:20 to 2:20, on stored evidence while Cala is not answering.
// ---------------------------------------------------------------------------

const INVESTOR_TRAILS: Record<string, Trail> = {
  "t6-kuva": {
    id: "t6-kuva",
    pattern: "T6",
    subject: E.otb,
    end: E.kuva,
    hops: [HOP.otbIceye, HOP.iceyeIhi, HOP.ihiKuva],
    hopCount: 3,
    signal: SIGNAL.kuvaIhiMou,
    weakestSourceRank: null,
    independentTrails: 1,
    readInFull: [E.iceye.id],
    seenInListOnly: [E.otb.id, E.ihi.id, E.kuva.id],
    conclusion: conclusion(
      "t6-kuva",
      "The company's counterparty has a record with a comparable company: IHI Corporation signed with ICEYE before it signed with Kuva Space.",
      "ICEYE lists OTB Ventures among its investors. Cala reports a memorandum of understanding between ICEYE and IHI Corporation on 22 May 2025, and one between Kuva Space and IHI Corporation in mid-2026. IHI Corporation has the same Cala ID in both answers.",
      "It does not show that OTB Ventures invested in ICEYE: that tie states no role. A memorandum is not an order, no amount is disclosed, and the claims are reported by Cala from press coverage, not verified by a filing.",
      "Ask Kuva Space what the IHI demonstration phase has shown, and ask ICEYE what turned its own IHI memorandum into a contract.",
    ),
  },
};

const INVESTOR_ROWS: RowSeed[] = [
  {
    at: 8,
    briefAt: 18,
    candidate: E.kuva,
    category: "lead",
    reason:
      "Works with IHI Corporation, which also signed with ICEYE, a company OTB Ventures is tied to. The shared counterparty is a reference to check.",
    fit: [
      {
        criterion: "Trail",
        statement: "Kuva Space and ICEYE each signed a memorandum of understanding with IHI Corporation, as reported by Cala from press coverage.",
        kind: "observed",
        sources: [S.kuvaIhiA, S.iceyeIhiMou],
      },
      {
        criterion: "Anchor",
        statement: "ICEYE lists OTB Ventures among its investors. No role is stated, so the tie is undirected.",
        kind: "observed",
        sources: [S.otbPortfolio],
      },
      {
        criterion: "Direct signal",
        statement: "A commercial pilot with CHATEAU PUYBARBE, announced 19 Mar 2026.",
        kind: "observed",
        sources: [S.kuvaPuybarbe],
      },
      {
        criterion: "Stage",
        statement: "Kuva Space has not been read in full: its stage, funding and backers are not stored.",
        kind: "unknown",
        sources: [],
      },
    ],
    trailIds: ["t6-kuva"],
    bestTrail: { pattern: "T6", hopCount: 3, signalLabel: "Memorandum of understanding with IHI Corporation" },
    directFitOnly: false,
    enrichment: "seen_in_list",
    unknowns: [
      "Kuva Space's stage, funding and investors",
      "Whether OTB Ventures invested in ICEYE: the tie is undirected",
      "The value of the IHI memorandum: none disclosed",
    ],
  },
  {
    at: 10,
    candidate: E.waymap,
    category: "direct_fit",
    reason: "Direct fit only: listed by Cala as a Slush attendee, with no connection to OTB Ventures or its portfolio in the stored evidence.",
    fit: [
      { criterion: "Stage", statement: "Series B.", kind: "observed", sources: [S.waymapFiling] },
      {
        criterion: "Signal",
        statement: "Grant of GBP 223,111 from Innovate UK, event date 1 Nov 2021. Older than the 24-month window, so context only.",
        kind: "observed",
        sources: [S.waymapGrant, S.waymapNews],
      },
    ],
    trailIds: [],
    bestTrail: null,
    directFitOnly: true,
    enrichment: "read_in_full",
    unknowns: ["Any tie to OTB Ventures or its portfolio"],
  },
  {
    at: 10,
    candidate: E.trustnxt,
    category: "direct_fit",
    reason: "Direct fit only: listed by Cala as a Slush attendee, with no connection to OTB Ventures or its portfolio in the stored evidence.",
    fit: [
      { criterion: "Stage", statement: "Pre-seed.", kind: "observed", sources: [S.trustnxtRound] },
      {
        criterion: "Signal",
        statement: "Grant from IFB Innovationsstarter GmbH, announced 19 Dec 2024. The funder is not classed as public, and no amount is recorded.",
        kind: "observed",
        sources: [S.trustnxtGrant],
      },
    ],
    trailIds: [],
    bestTrail: null,
    directFitOnly: true,
    enrichment: "read_in_full",
    unknowns: ["Any tie to OTB Ventures or its portfolio", "The grant's amount"],
  },
  {
    at: 10,
    candidate: E.katana,
    category: "direct_fit",
    reason: "Direct fit only: listed by Cala as a Slush attendee, with no connection to OTB Ventures or its portfolio in the stored evidence.",
    fit: [
      { criterion: "Stage", statement: "Series B.", kind: "observed", sources: [S.katanaRound] },
      {
        criterion: "Signal",
        statement: "Grant of EUR 50,000 from the European Commission, event date 23 Jan 2019. Older than the 24-month window, so context only.",
        kind: "observed",
        sources: [S.katanaGrant],
      },
    ],
    trailIds: [],
    bestTrail: null,
    directFitOnly: true,
    enrichment: "read_in_full",
    unknowns: ["Any tie to OTB Ventures or its portfolio"],
  },
  {
    at: 12,
    candidate: E.corsmed,
    category: "direct_fit",
    reason: "Direct fit only so far: listed by Cala as a Slush attendee. Its read is queued, and Cala is not answering.",
    fit: [
      {
        criterion: "Listing",
        statement: "Seen in the Slush roster and in Luminar Ventures' portfolio list. Nothing further is stored.",
        kind: "observed",
        sources: [S.slush, S.luminarPortfolio],
      },
    ],
    trailIds: [],
    bestTrail: null,
    directFitOnly: true,
    enrichment: "queued",
    unknowns: ["Everything beyond its name: read queued"],
  },
];

const INVESTOR_BRIEFS: Record<string, BriefSeed> = {
  [E.kuva.id]: {
    candidate: E.kuva,
    category: "lead",
    whyMeet: [
      {
        criterion: "Shared counterparty",
        statement: "Kuva Space signed a memorandum of understanding with IHI Corporation in mid-2026, after a demonstration phase that began in November 2025.",
        kind: "observed",
        sources: [S.kuvaIhiA, S.kuvaIhiB],
      },
      {
        criterion: "A reference exists",
        statement: "ICEYE signed a memorandum with IHI Corporation on 22 May 2025 and a procurement contract on 16 Oct 2025. ICEYE lists OTB Ventures among its investors.",
        kind: "observed",
        sources: [S.iceyeIhiMou, S.iceyeIhiContractA, S.otbPortfolio],
      },
      {
        criterion: "Direct signal",
        statement: "A commercial pilot with CHATEAU PUYBARBE was announced on 19 Mar 2026.",
        kind: "observed",
        sources: [S.kuvaPuybarbe],
      },
      {
        criterion: "What that suggests",
        statement: "IHI has already bought from a comparable satellite company connected to you. That is a reference you can check before the meeting.",
        kind: "inferred",
        sources: [],
      },
    ],
    whyHesitate: [
      {
        criterion: "A memorandum is not an order",
        statement: "The IHI agreement is a memorandum to evaluate a constellation. Cala reports that it discloses no financial amount.",
        kind: "observed",
        sources: [S.kuvaIhiA],
      },
      {
        criterion: "The NASA award",
        statement: "Cala reports a NASA CSDA award to Kuva Space's U.S. subsidiary. USD 476 million is the ceiling of the whole programme, shared by all awardees, and not this company's amount.",
        kind: "observed",
        sources: [S.kuvaNasaA, S.kuvaNasaB],
      },
      {
        criterion: "Undirected tie",
        statement: "The stored evidence does not settle whether OTB Ventures invested in ICEYE.",
        kind: "unknown",
        sources: [],
      },
      {
        criterion: "Thin record",
        statement: "Kuva Space has not been read in full. Its stage, funding and backers are still unknown.",
        kind: "unknown",
        sources: [],
      },
    ],
    trailIds: ["t6-kuva"],
    directSignals: [SIGNAL.kuvaPuybarbe, SIGNAL.kuvaIhiMou],
    ownership: [],
    questions: [
      "What has the IHI demonstration phase shown since November 2025, and what would turn the memorandum into an order?",
      "What is Kuva Space's own task-order value under NASA's CSDA programme?",
      "How does your offer to IHI differ from ICEYE's?",
    ],
    stillUnknown: [
      "Kuva Space's funding, stage and investors",
      "The value of any IHI or NASA work",
      "Whether the pilot with the Finnish Environment Institute continued after 2025",
    ],
    coverageNote:
      "Kuva Space is known from the Slush roster and one stored signal probe, answered at 12:28 on 14 Nov 2026 with 7 claims. It has not been read in full.",
  },
};

const INVESTOR_PACKET: PacketSeed = {
  at: 20,
  candidate: E.kuva,
  sections: {
    whyMeet:
      "Kuva Space signed a memorandum of understanding with IHI Corporation in mid-2026. IHI Corporation signed a memorandum with ICEYE on 22 May 2025 and a procurement contract on 16 Oct 2025, and ICEYE lists OTB Ventures among its investors. The company's counterparty has a record with a comparable company.",
    trail:
      "OTB Ventures and ICEYE share an investment tie whose direction is not settled. ICEYE and IHI Corporation: memorandum of understanding, reported by Cala. IHI Corporation and Kuva Space: memorandum of understanding, reported by Cala. Three hops, and the last two are derived from Cala's knowledge claims.",
    whyHesitate:
      "A memorandum is not an order, and no amount is disclosed. Cala reports a NASA CSDA award to Kuva Space's U.S. subsidiary, where USD 476 million is the ceiling of the whole programme and not this company's amount. Kuva Space has not been read in full.",
    questions: [
      "What has the IHI demonstration phase shown since November 2025, and what would turn the memorandum into an order?",
      "What is Kuva Space's own task-order value under NASA's CSDA programme?",
      "How does your offer to IHI differ from ICEYE's?",
    ],
    agenda: [
      "Kuva Space's constellation and customers today (10 min)",
      "The IHI evaluation: scope, timeline, what follows (10 min)",
      "Funding to date and what the round is for (5 min)",
      "Next steps (5 min)",
    ],
    outreachDraft:
      "Hi, I am preparing for Slush and would like 30 minutes with Kuva Space. I am interested in the evaluation you are running with IHI Corporation and in how the constellation is funded. I will send three questions ahead of the meeting.",
    privateNotes: "",
  },
  withheld: [],
};

const INVESTOR: Script = {
  role: "investor",
  subject: E.otb,
  latched: true,
  length: 22,
  steps: [
    { at: 0, stage: "brief_received" },
    { at: 3, stage: "researching" },
    { at: 3, event: line("outage", "Cala is not answering. Working from stored evidence, fetched up to 12:30 on 14 Nov 2026") },
    { at: 4, event: line("queued", "Queued for Cala: the portfolio read of OTB Ventures", E.otb) },
    { at: 5, event: read(E.iceye, "Read ICEYE: OTB Ventures is among its 17 investment ties", 0.2) },
    {
      at: 6,
      event: { kind: "probe", message: "Stored signal probe for ICEYE: 11 claims", entity: E.iceye, fromStore: true, seconds: 0 },
    },
    {
      at: 7,
      event: { kind: "probe", message: "Stored signal probe for Kuva Space: 7 claims", entity: E.kuva, fromStore: true, seconds: 0 },
    },
    { at: 8, event: line("trail", "Trail found: OTB Ventures, ICEYE, IHI Corporation, Kuva Space", E.kuva) },
    { at: 10, event: read(E.waymap, "Read WAYMAP LIMITED, TrustNXT and Katana MRP: no tie to the portfolio", 0.4) },
    { at: 12, event: line("queued", "Queued for Cala: the read of Corsmed AB", E.corsmed) },
    { at: 14, stage: "challenging" },
    { at: 18, event: line("note", "One brief written") },
    { at: 20, event: line("gap", "Two more briefs could not be written: no other candidate has a demonstrated connection") },
    { at: 22, stage: "ready" },
    { at: 22, event: line("book", "Book ready: 5 rows, 1 brief, 1 packet draft") },
  ],
  rows: INVESTOR_ROWS,
  trails: INVESTOR_TRAILS,
  briefs: INVESTOR_BRIEFS,
  gaps: [
    { at: 4, text: "OTB Ventures itself has not been read. Its only stored anchor is ICEYE, from ICEYE's own investor list." },
    { at: 12, text: "Corsmed AB: its read is queued, and Cala is not answering." },
    {
      at: 20,
      text: "One brief instead of three: WAYMAP LIMITED, TrustNXT and Katana MRP are direct fit only, with no demonstrated connection to OTB Ventures or its portfolio.",
    },
    { at: 20, text: "Kuva Space's NASA award names its U.S. subsidiary, which Cala does not resolve to an entity. The claim stays in the dossier and is not an edge." },
  ],
  packet: INVESTOR_PACKET,
};

// ---------------------------------------------------------------------------
// Cold: a subject with no stored neighbourhood. Nothing is invented; the read
// is queued and the Book says so.
// ---------------------------------------------------------------------------

export function coldScript(role: Role, subject: EntityRef, stored: boolean): Script {
  return {
    role,
    subject,
    latched: false,
    length: 8,
    steps: [
      { at: 0, stage: "brief_received" },
      { at: 3, stage: "researching" },
      stored
        ? { at: 4, event: read(subject, `Read ${subject.name}`, 0.9) }
        : { at: 4, event: line("queued", `Queued for Cala: the first read of ${subject.name}`, subject) },
      { at: 6, event: line("queued", `Queued for Cala: reads of the entities around ${subject.name}`, subject) },
      { at: 8, event: line("gap", `No trails yet: nothing around ${subject.name} has been read`, subject) },
    ],
    rows: [],
    trails: {},
    briefs: {},
    gaps: [
      {
        at: 8,
        text: `The store holds ${stored ? "one read of" : "no read of"} ${subject.name} and nothing around it. The Book stays empty until the queued reads are answered.`,
      },
    ],
    packet: null,
  };
}

export const SCRIPTS = { founder: FOUNDER, investor: INVESTOR } as const;

/** Which script a new mandate replays, by its subject. */
export function scriptFor(subjectId: string): ScriptKey {
  if (subjectId === E.redpine.id) return "founder";
  if (subjectId === E.otb.id) return "investor";

  return "cold";
}


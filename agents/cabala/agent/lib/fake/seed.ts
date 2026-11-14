/**
 * Seed for the in-memory ledger: two worked mandates copied by hand from the saved Cala responses
 * in `.handoff/debate/evidence-round-4-fable/`. Redpine is the founder case (star-redpine,
 * hub-luminar, star-lum-photoncycle and the round-grant files) and OTB Ventures the investor case
 * (iceye-full-star, ksearch-iceye-gov and ksearch-signal-kuva-space). Nothing here is invented:
 * a value the files do not hold stays null.
 */
import type {
  Brief,
  CandidateCategory,
  Constraints,
  Dossier,
  EntityRef,
  EvidenceBundle,
  FitLine,
  Hop,
  ProbeProposal,
  Role,
  Signal,
  SourceRef,
  Trail,
} from "@fundraising/package-ledger";

/** When the saved responses were fetched. */
export const FETCHED_AT = "2026-11-14T12:30:00+02:00";
export const PROBED_ON = "2026-11-14";

function entity(id: string, name: string, entityType: string, description: string | null = null): EntityRef {
  return { id, name, entityType, description };
}

function source(name: string | null, url: string | null, date: string | null, rank: string | null): SourceRef {
  return { name, url, date, rank };
}

const redpine = entity(
  "331fec23-9c63-4885-a8f5-c2902c9e1b9d",
  "Redpine Technology AB",
  "Company",
  "Your agent reads the whole paper, not just the abstract. Licensed peer-reviewed full text in medicine, " +
    "chemistry, and materials science, behind one endpoint.",
);
const luminar = entity(
  "be67283b-4529-4a2d-834a-96edc4b36971",
  "Luminar Ventures",
  "Company",
  "Nordic venture capital fund specializing in early-stage investments in technology companies.",
);
const nordicNinja = entity("a46a1058-93a7-4b0f-bc1f-bc31238fb006", "NORDICNINJA VC LIMITED", "Company");
const photoncycle = entity(
  "d5f8974b-7765-44f7-afc6-6f1767b8bad0",
  "Photoncycle",
  "Company",
  "The year-round solar energy system for heating and electricity",
);
const enova = entity("76d8c340-04bf-474a-b8c6-00c4e8438b79", "ENOVA SF", "Company");
const innovationNorway = entity("e8203bac-13d8-5d13-ab4d-996b6657363b", "Innovation Norway", "Organization");
const vinnova = entity("63261106-7e97-4765-b212-96ee486a2e05", "VINNOVA", "Organization");
const lifeline = entity("4d668c75-c7a0-4f5b-baea-ce0fa6a34e31", "Lifeline Ventures AB", "Company");
const voima = entity("1f973216-f1e5-4466-8409-da6608460c02", "Voima Ventures Oy", "Company");

const otb = entity("d26a193e-78e6-47ed-a265-877bc5a60b35", "OTB Ventures", "Company");
const iceye = entity(
  "0247c487-08b6-4e07-8e92-0969cdfeaa2d",
  "ICEYE",
  "Company",
  "Finnish aerospace and defense company founded in 2014 and headquartered in Espoo.",
);
const ihi = entity("6d909137-a0a9-414c-bc93-40cbf5f6acd8", "IHI Corporation", "Company");
const kuva = entity("41f89a61-54ac-4068-82af-a2d2096efcfc", "Kuva Space", "Company");
const puybarbe = entity("8a37b7fa-e810-5656-aa41-9251ba8ffd94", "CHATEAU PUYBARBE", "Company");

export const ENTITIES = [
  redpine,
  luminar,
  nordicNinja,
  photoncycle,
  enova,
  innovationNorway,
  vinnova,
  lifeline,
  voima,
  otb,
  iceye,
  ihi,
  kuva,
  puybarbe,
];

/** Entities with a star or hub read in the saved files. The rest were seen in another's list. */
export const READ_IN_FULL = new Set([redpine.id, luminar.id, photoncycle.id, iceye.id]);

/** Slush 2026 attendees among the seeded entities, from the saved roster. */
export const SLUSH_ATTENDEES = new Set([redpine.id, photoncycle.id, kuva.id]);

const redpineSeedPress = [
  source(
    "techfundingnews.com",
    "https://techfundingnews.com/nordicninja-leads-redpine-in-e6-8m-round-to-let-ai-agents-access-private-data/",
    "2026-04-28",
    "PRESS",
  ),
  source("thenextweb.com", "https://thenextweb.com/news/redpine-raises-e6-8m-api-for-ai-agents", "2026-04-28", "PRESS"),
  source("redpine.ai", "https://www.redpine.ai/about", "2026-11-07", "PRIMARY"),
];
const photoncycleSeriesA = [
  source(
    "thenextweb.com",
    "https://thenextweb.com/news/photoncycle-raises-e15m-series-a-to-address-europes-seasonal-energy-storage-gap",
    "2026-03-04",
    "PRESS",
  ),
  source("Luminar Ventures – Portfolio Companies", "https://luminarventures.com/portfolio", "2025-01-01", null),
];
const tracxnPhotoncycle = [
  source(
    "tracxn.com",
    "https://tracxn.com/d/companies/photoncycle/__K_fz8f9JI0uUGDnUOskGhh5b20eu4zCbM12X0i-3gJE/funding-and-investors",
    "2026-08-24",
    null,
  ),
];
const enovaFiling = [
  source("stotte.brreg.no", "https://stotte.brreg.no/en/oppslag/stoettetildeling/1000026319", "2025-06-19", "FILING"),
];
const innovationNorwayFilings = [
  source("stotte.brreg.no", "https://stotte.brreg.no/en/oppslag/stoettetildeling/1000026931", "2025-09-22", "FILING"),
  source("stotte.brreg.no", "https://stotte.brreg.no/en/oppslag/stoettetildeling/1000031655", "2025-12-11", "FILING"),
];
const vinnovaRegister = [
  source(
    "vinnova.se",
    "https://www.vinnova.se/p/konferensmedverkan-mobile-world-congress-2027-redpine-/",
    "2026-11-12",
    "PRIMARY",
  ),
];
const otbPortfolio = [source("Portfolio - OTB Ventures", "https://otb.vc/portfolio", "2026-08-21", null)];
const iceyeIhiPress = [
  source(
    "ICEYE",
    "https://www.iceye.com/newsroom/press-releases/iceye-and-ihi-start-cooperation-to-develop-sar-satellite-constellation-in-japan?hs_amp=true",
    null,
    null,
  ),
];
const iceyeIhiContract = [
  source(
    "morningstar.com",
    "https://www.morningstar.com/news/pr-newswire/20251016la99676/iceye-and-ihi-sign-agreement-to-build-an-earth-observation-satellite-constellation",
    null,
    null,
  ),
];
const kuvaIhiPress = [
  source("arcticstartup.com", "https://arcticstartup.com/kuva-space-partners-with-ihi", null, null),
  source(
    "jp.ibtimes.com",
    "https://jp.ibtimes.com/ihi-partners-finlands-kuva-space-hyperspectral-satellite-constellation-102837",
    null,
    null,
  ),
];
const kuvaNasaPress = [
  source(
    "BeBeez International",
    "https://bebeez.eu/2026/07/01/kuva-space-scores-nasa-contract-accelerates-hyperspectral-constellation-ambitions",
    null,
    null,
  ),
  source(
    "Military Aerospace",
    "https://www.militaryaerospace.com/commercial-aerospace/news/55388073/nasa-selects-kuva-space-for-commercial-hyperspectral-satellite-data-program",
    null,
    null,
  ),
];
const kuvaSykePress = [
  source(
    "arctictoday.com",
    "https://www.arctictoday.com/%F0%9F%87%AB%F0%9F%87%AE-finnish-environment-institute-and-kuva-space-partner-to-enhance-finlands-inland-and-coastal-water-quality-monitoring",
    null,
    null,
  ),
];
const kuvaPuybarbePress = [
  source(
    "kuvaspace.com",
    "https://kuvaspace.com/en/resources/the-first-vineyard-operationally-monitored-by-hyperspectral-satellites-from-space",
    null,
    null,
  ),
];

function hop(
  from: EntityRef,
  to: EntityRef,
  direction: Hop["direction"],
  role: string | null,
  sources: SourceRef[],
): Hop {
  return {
    from,
    to,
    family: "investment",
    relationship: "INVESTED_IN",
    direction,
    role,
    origin: "native",
    claim: null,
    validSince: null,
    validUntil: null,
    sources,
  };
}

function agreement(from: EntityRef, to: EntityRef, claim: string, validSince: string | null, sources: SourceRef[]): Hop {
  return {
    from,
    to,
    family: "agreement",
    relationship: "mou",
    direction: "not_applicable",
    role: null,
    origin: "derived",
    claim,
    validSince,
    validUntil: null,
    sources,
  };
}

// Roles in round f7e9dbb3 (Luminar INVESTOR, Redpine ISSUER) settle this tie's direction.
const redpineLuminar = hop(redpine, luminar, "to_funds_from", "INVESTOR", redpineSeedPress);

// Rounds 922d6772 and 03428a20 hold Luminar as INVESTOR and Photoncycle as ISSUER.
const luminarPhotoncycle = hop(luminar, photoncycle, "from_funds_to", "INVESTOR", photoncycleSeriesA);

// NordicNinja's two ties have no role evidence in the saved files, so they stay undirected.
const redpineNordicNinja = hop(redpine, nordicNinja, "undirected", null, redpineSeedPress.slice(0, 2));
const nordicNinjaPhotoncycle = hop(nordicNinja, photoncycle, "undirected", null, tracxnPhotoncycle);

const photoncycleLifeline = hop(photoncycle, lifeline, "undirected", null, photoncycleSeriesA.slice(0, 1));
const photoncycleVoima = hop(photoncycle, voima, "undirected", null, [
  source("voimaventures.com", "https://voimaventures.com/portfolio", "2026-08-24", null),
]);

const otbIceye = hop(otb, iceye, "undirected", null, otbPortfolio);

const ICEYE_IHI_CLAIM =
  "ICEYE and Japan’s IHI Corporation signed a memorandum of understanding on 22 May 2025 to develop a SAR " +
  "constellation of up to 24 satellites.";
const ICEYE_IHI_CONTRACT_CLAIM =
  "Following the May MOU, ICEYE and IHI signed a procurement contract on 16 October 2025 for an initial four " +
  "satellites (with an option for 20 more) to be built in Japan.";
const KUVA_IHI_CLAIM =
  "The memorandum of understanding with Japan’s IHI Corporation was signed in mid‑2026 after a demonstration phase " +
  "that began in November 2025, outlining a strategic partnership to evaluate a potential 20‑satellite Japanese " +
  "hyperspectral constellation.";
const KUVA_NASA_CLAIM =
  "The NASA Commercial Satellite Data Acquisition (CSDA) On‑Ramp 2 award was announced on 18 June 2026, is a " +
  "firm‑fixed‑price IDIQ contract with a maximum ceiling of $476 million and runs through 15 Nov 2028, establishing " +
  "the government contract with NASA for Kuva Space’s U.S. subsidiary.";
const KUVA_SYKE_CLAIM =
  "The partnership with the Finnish Environment Institute (Syke) was announced on 3 July 2025, describing a " +
  "public‑private pilot to test hyperspectral data and AI for algae‑bloom monitoring in Finland’s lakes and coastal waters.";
const KUVA_PUYBARBE_CLAIM =
  "The collaboration with Château Puybarbe was announced on 19 March 2026, describing a commercial pilot where the " +
  "vineyard will be monitored using Kuva Space’s hyperspectral satellite imagery.";

const iceyeIhi = agreement(iceye, ihi, ICEYE_IHI_CLAIM, "2025-05-22", iceyeIhiPress);
const ihiKuva = agreement(ihi, kuva, KUVA_IHI_CLAIM, null, kuvaIhiPress);

function signal(fields: Pick<Signal, "id" | "type" | "entity" | "label" | "sources"> & Partial<Signal>): Signal {
  return {
    date: null,
    dateKind: null,
    value: null,
    units: null,
    valueIsProgrammeCeiling: false,
    instrument: null,
    parties: [],
    origin: "native",
    claim: null,
    publicBasis: null,
    flag: null,
    ...fields,
  };
}

const enovaGrant = signal({
  id: "signal-photoncycle-enova-2025",
  type: "public_money",
  entity: photoncycle,
  label: "Grant from ENOVA SF",
  date: "2025-03-13",
  dateKind: "event_date",
  value: 14_376_817,
  units: "NOK",
  instrument: "GRANT",
  parties: [
    { entity: enova, role: "GRANTOR" },
    { entity: photoncycle, role: "ISSUER" },
  ],
  publicBasis: {
    basis: "ENOVA SF is the grantor in Norway's state-aid register and is listed in our public-funder registry.",
    ours: true,
  },
  sources: enovaFiling,
});

const innovationNorwayGrant = signal({
  id: "signal-photoncycle-innovation-norway",
  type: "public_money",
  entity: photoncycle,
  label: "Grant from Innovation Norway",
  date: "2023-01-27",
  dateKind: "event_date",
  value: 5_300_000,
  units: "NOK",
  instrument: "GRANT",
  parties: [
    { entity: innovationNorway, role: "GRANTOR" },
    { entity: photoncycle, role: "ISSUER" },
  ],
  publicBasis: {
    basis: "Innovation Norway is the grantor in Norway's state-aid register and is listed in our public-funder registry.",
    ours: true,
  },
  flag:
    "The record rests on two register entries dated 2025-09-22 and 2025-12-11 against an event date of 2023-01-27. " +
    "The dates disagree, so this is context and not one dated award.",
  sources: innovationNorwayFilings,
});

const vinnovaGrant = signal({
  id: "signal-redpine-vinnova",
  type: "public_money",
  entity: redpine,
  label: "Grant from VINNOVA",
  date: "2026-11-12",
  dateKind: "reported_on",
  value: 40_000,
  units: "SEK",
  instrument: "GRANT",
  parties: [
    { entity: vinnova, role: "GRANTOR" },
    { entity: redpine, role: "ISSUER" },
  ],
  publicBasis: { basis: "VINNOVA is the grantor in its own project register.", ours: true },
  sources: vinnovaRegister,
});

const photoncycleSeriesARound = signal({
  id: "signal-photoncycle-series-a",
  type: "financing",
  entity: photoncycle,
  label: "Series A",
  date: "2026-03-04",
  dateKind: "reported_on",
  instrument: null,
  parties: [
    { entity: photoncycle, role: "ISSUER" },
    { entity: luminar, role: "INVESTOR" },
  ],
  sources: photoncycleSeriesA.slice(0, 1),
});

const kuvaIhiMou = signal({
  id: "signal-kuva-ihi-mou",
  type: "agreement",
  entity: kuva,
  label: "Memorandum of understanding with IHI Corporation",
  date: "2026",
  dateKind: "reported_on",
  parties: [
    { entity: kuva, role: null },
    { entity: ihi, role: null },
  ],
  origin: "derived",
  claim: KUVA_IHI_CLAIM,
  sources: kuvaIhiPress,
});

const kuvaPuybarbe = signal({
  id: "signal-kuva-puybarbe",
  type: "agreement",
  entity: kuva,
  label: "Vineyard-monitoring collaboration with Château Puybarbe",
  date: "2026-03-19",
  dateKind: "announcement_date",
  parties: [
    { entity: kuva, role: null },
    { entity: puybarbe, role: null },
  ],
  origin: "derived",
  claim: KUVA_PUYBARBE_CLAIM,
  sources: kuvaPuybarbePress,
});

const iceyeIhiMou = signal({
  id: "signal-iceye-ihi-mou",
  type: "agreement",
  entity: iceye,
  label: "Memorandum of understanding with IHI Corporation",
  date: "2025-05-22",
  dateKind: "announcement_date",
  parties: [
    { entity: iceye, role: null },
    { entity: ihi, role: null },
  ],
  origin: "derived",
  claim: ICEYE_IHI_CLAIM,
  sources: iceyeIhiPress,
});

export const SIGNALS = [
  enovaGrant,
  innovationNorwayGrant,
  vinnovaGrant,
  photoncycleSeriesARound,
  kuvaIhiMou,
  kuvaPuybarbe,
  iceyeIhiMou,
];

function trail(
  fields: Pick<Trail, "id" | "pattern" | "subject" | "end" | "hops" | "signal"> & Partial<Trail>,
): Trail {
  const onTrail = [fields.subject.id, ...fields.hops.map((each) => each.to.id)];

  return {
    hopCount: fields.hops.length,
    weakestSourceRank: null,
    independentTrails: 1,
    readInFull: onTrail.filter((id) => READ_IN_FULL.has(id)),
    seenInListOnly: onTrail.filter((id) => !READ_IN_FULL.has(id)),
    conclusion: null,
    ...fields,
  };
}

const viaLuminarEnova = trail({
  id: "trail-redpine-luminar-photoncycle-enova",
  pattern: "T2",
  subject: redpine,
  end: photoncycle,
  hops: [redpineLuminar, luminarPhotoncycle],
  signal: enovaGrant,
  weakestSourceRank: "PRESS",
  independentTrails: 2,
});
const viaNordicNinjaEnova = trail({
  id: "trail-redpine-nordicninja-photoncycle-enova",
  pattern: "T2",
  subject: redpine,
  end: photoncycle,
  hops: [redpineNordicNinja, nordicNinjaPhotoncycle],
  signal: enovaGrant,
  independentTrails: 2,
});
const viaLuminarInnovationNorway = trail({
  id: "trail-redpine-luminar-photoncycle-innovation-norway",
  pattern: "T2",
  subject: redpine,
  end: photoncycle,
  hops: [redpineLuminar, luminarPhotoncycle],
  signal: innovationNorwayGrant,
  weakestSourceRank: "PRESS",
});
const toLifeline = trail({
  id: "trail-redpine-luminar-photoncycle-lifeline",
  pattern: "T1",
  subject: redpine,
  end: lifeline,
  hops: [redpineLuminar, luminarPhotoncycle, photoncycleLifeline],
  signal: photoncycleSeriesARound,
  weakestSourceRank: "PRESS",
});
const toVoima = trail({
  id: "trail-redpine-luminar-photoncycle-voima",
  pattern: "T1",
  subject: redpine,
  end: voima,
  hops: [redpineLuminar, luminarPhotoncycle, photoncycleVoima],
  signal: null,
});
const otbToKuva = trail({
  id: "trail-otb-iceye-ihi-kuva",
  pattern: "T6",
  subject: otb,
  end: kuva,
  hops: [otbIceye, iceyeIhi, ihiKuva],
  signal: kuvaIhiMou,
});

function line(criterion: string, statement: string, kind: FitLine["kind"], sources: SourceRef[] = []): FitLine {
  return { criterion, statement, kind, sources };
}

export type SeedRow = {
  candidate: EntityRef;
  category: CandidateCategory;
  reason: string;
  fit: FitLine[];
  trails: Trail[];
  directFitOnly: boolean;
  unknowns: string[];
  brief: Omit<Brief, "mandateId" | "revision" | "candidate" | "category" | "trails"> | null;
  /** Statements the packet checks treat as supported, beyond what the trails themselves say. */
  facts: EvidenceBundle["supportedFacts"];
};

export type Scenario = {
  key: string;
  role: Role;
  subject: EntityRef;
  constraints: Constraints;
  rows: SeedRow[];
  gaps: string[];
  proposals: ProbeProposal[];
};

const founderRows: SeedRow[] = [
  {
    candidate: enova,
    category: "non_dilutive",
    reason:
      "ENOVA SF granted NOK 14,376,817 to Photoncycle, which shares the backer Luminar Ventures with Redpine; ask " +
      "Luminar how Photoncycle obtained it.",
    fit: [
      line(
        "Trail",
        "Luminar Ventures funded Redpine's seed round and two Photoncycle rounds; Photoncycle received a grant from ENOVA SF.",
        "observed",
        [...redpineSeedPress.slice(0, 1), ...photoncycleSeriesA.slice(0, 1), ...enovaFiling],
      ),
      line("Signal date", "The grant's event date is 2025-03-13, inside the 24-month window.", "observed", enovaFiling),
      line("Geography", "Whether ENOVA SF funds companies outside Norway is not established.", "unknown"),
    ],
    trails: [viaLuminarEnova, viaNordicNinjaEnova],
    directFitOnly: false,
    unknowns: [
      "Whether ENOVA SF funds companies outside Norway.",
      "Which programme the grant came from, and whether it is still open.",
    ],
    brief: {
      whyMeet: [
        line(
          "Signal",
          "ENOVA SF granted Photoncycle NOK 14,376,817, with an event date of 2025-03-13, recorded in Norway's state-aid register.",
          "observed",
          enovaFiling,
        ),
        line(
          "Connection",
          "Luminar Ventures invested in Redpine's seed round and in Photoncycle's seed and Series A rounds, settled by the roles in those rounds.",
          "observed",
          [...redpineSeedPress.slice(0, 1), ...photoncycleSeriesA.slice(0, 1)],
        ),
        line(
          "Reading",
          "A public funder is active in the portfolio of Redpine's own investor; Luminar can say how the grant was obtained.",
          "inferred",
        ),
      ],
      whyHesitate: [
        line(
          "Geography",
          "The grant is in Norway's register and Photoncycle is in Oslo; Redpine is in Stockholm. Eligibility outside Norway is unknown.",
          "unknown",
        ),
        line(
          "Sector",
          "Photoncycle is labelled energy and Redpine is labelled AI. A programme that funded one may not fund the other.",
          "inferred",
        ),
      ],
      directSignals: [],
      ownership: [],
      questions: [
        "Which ENOVA SF programme funded Photoncycle, and what did the application require?",
        "Did Luminar Ventures play any part in the application?",
        "Is there a comparable Swedish programme Luminar's portfolio has used?",
      ],
      stillUnknown: [
        "Whether ENOVA SF funds companies outside Norway.",
        "Which programme the grant came from, and whether it is still open.",
        "ENOVA SF itself has not been read; only its role in this one round is stored.",
      ],
      coverageNote:
        "Luminar Ventures: 41 portfolio ties and 17 role-bearing participations stored. Redpine and Photoncycle are " +
        "read in full. ENOVA SF is seen only as a participant in one round.",
    },
    facts: [],
  },
  {
    candidate: luminar,
    category: "follow_up",
    reason:
      "Existing backer of Redpine. Luminar Ventures also funded Photoncycle, which holds grants from ENOVA SF and " +
      "Innovation Norway; ask how that funding came about.",
    fit: [
      line("Relationship", "Luminar Ventures invested in Redpine's seed round.", "observed", redpineSeedPress.slice(0, 1)),
      line("Category", "An existing backer is a follow-up target, not a new investor lead.", "inferred"),
    ],
    trails: [viaLuminarEnova, viaLuminarInnovationNorway],
    directFitOnly: false,
    unknowns: ["Whether Luminar Ventures took part in Photoncycle's grant applications."],
    brief: {
      whyMeet: [
        line(
          "Relationship",
          "Luminar Ventures invested in Redpine's seed round, which the press reported on 2026-04-28.",
          "observed",
          redpineSeedPress,
        ),
        line(
          "Sibling",
          "Luminar Ventures invested in Photoncycle's seed and Series A rounds.",
          "observed",
          photoncycleSeriesA,
        ),
        line(
          "Signal",
          "Photoncycle received NOK 14,376,817 from ENOVA SF, with an event date of 2025-03-13.",
          "observed",
          enovaFiling,
        ),
        line(
          "Reading",
          "The existing backer has seen a portfolio company through a public grant and is the person to ask about it.",
          "inferred",
        ),
      ],
      whyHesitate: [
        line(
          "Not a new lead",
          "This is a conversation with an investor Redpine already has. It adds no new capital by itself.",
          "inferred",
        ),
        line(
          "Second grant",
          "The Innovation Norway record carries disagreeing dates and is context only.",
          "observed",
          innovationNorwayFilings,
        ),
      ],
      directSignals: [],
      ownership: [],
      questions: [
        "How did Photoncycle obtain the ENOVA SF grant, and how long did it take?",
        "Which public programmes has Luminar seen work for a company at Redpine's stage?",
      ],
      stillUnknown: ["Whether Luminar Ventures took part in Photoncycle's grant applications."],
      coverageNote:
        "Luminar Ventures is read as a hub: 41 portfolio ties, 17 role-bearing participations. Six of its portfolio " +
        "companies are Slush attendees and are read in full.",
    },
    facts: [],
  },
  {
    candidate: lifeline,
    category: "lead",
    reason:
      "Cala lists a tie between Lifeline Ventures AB and Photoncycle, a company that shares the backer Luminar " +
      "Ventures with Redpine.",
    fit: [
      line(
        "Trail",
        "Three connections: Redpine, Luminar Ventures, Photoncycle, Lifeline Ventures AB. The last tie is undirected.",
        "observed",
        photoncycleSeriesA.slice(0, 1),
      ),
      line("Stage", "Stage focus is unknown: Lifeline Ventures AB has not been read in full.", "unknown"),
    ],
    trails: [toLifeline],
    directFitOnly: false,
    unknowns: [
      "The direction of the tie between Lifeline Ventures AB and Photoncycle is not settled by round roles.",
      "Stage, sector and geography focus: Lifeline Ventures AB has not been read in full.",
    ],
    brief: {
      whyMeet: [
        line(
          "Connection",
          "Cala lists a tie between Lifeline Ventures AB and Photoncycle, sourced to press coverage of Photoncycle's Series A.",
          "observed",
          photoncycleSeriesA.slice(0, 1),
        ),
        line(
          "Shared backer",
          "Photoncycle and Redpine both have Luminar Ventures as an investor.",
          "observed",
          [...redpineSeedPress.slice(0, 1), ...photoncycleSeriesA.slice(0, 1)],
        ),
        line(
          "Reading",
          "An investor tied to a company beside Redpine in Luminar's portfolio; Luminar is the route to ask about.",
          "inferred",
        ),
      ],
      whyHesitate: [
        line(
          "Direction",
          "No round roles are stored for the tie, so it is not established that Lifeline Ventures AB funded Photoncycle.",
          "unknown",
        ),
        line("Fit", "Nothing stored shows Lifeline's stage or sector focus.", "unknown"),
      ],
      directSignals: [],
      ownership: [],
      questions: [
        "What is Lifeline Ventures AB's relationship to Photoncycle?",
        "Does Lifeline Ventures AB invest at seed in data and AI companies?",
      ],
      stillUnknown: [
        "The direction of the tie between Lifeline Ventures AB and Photoncycle.",
        "Lifeline Ventures AB's stage, sector and geography focus.",
      ],
      coverageNote: "Lifeline Ventures AB is seen only in Photoncycle's list. One read would settle its role and focus.",
    },
    facts: [],
  },
  {
    candidate: innovationNorway,
    category: "non_dilutive",
    reason:
      "Innovation Norway is the grantor on a Photoncycle grant record whose dates disagree, so it is context and " +
      "not a dated award.",
    fit: [
      line(
        "Signal",
        "A grant record of NOK 5,300,000 with disagreeing dates; flagged and left out of recency comparisons.",
        "observed",
        innovationNorwayFilings,
      ),
    ],
    trails: [viaLuminarInnovationNorway],
    directFitOnly: false,
    unknowns: ["Which of the record's dates is the award date."],
    brief: null,
    facts: [],
  },
  {
    candidate: voima,
    category: "lead",
    reason: "Cala lists a tie between Voima Ventures Oy and Photoncycle, which shares Luminar Ventures with Redpine.",
    fit: [line("Trail", "Three connections; the last tie is undirected and sourced to Voima's portfolio page.", "observed")],
    trails: [toVoima],
    directFitOnly: false,
    unknowns: ["The direction of the tie.", "Voima Ventures Oy has not been read in full."],
    brief: null,
    facts: [],
  },
  {
    candidate: nordicNinja,
    category: "follow_up",
    reason: "Cala lists ties between NORDICNINJA VC LIMITED and both Redpine and Photoncycle; neither tie has role evidence.",
    fit: [line("Relationship", "A tie to Redpine is listed; its direction is not settled by stored roles.", "observed")],
    trails: [viaNordicNinjaEnova],
    directFitOnly: false,
    unknowns: ["The direction of both ties; NordicNinja's hub has not been read."],
    brief: null,
    facts: [],
  },
];

const KUVA_FACTS: EvidenceBundle["supportedFacts"] = [
  {
    statement:
      "Cala lists a tie between OTB Ventures and ICEYE, sourced to OTB Ventures' portfolio page. No transaction roles " +
      "are stored, so the direction of the tie is not settled.",
    kind: "observed",
    sources: otbPortfolio,
  },
  { statement: `Reported by Cala: ${ICEYE_IHI_CLAIM}`, kind: "observed", sources: iceyeIhiPress },
  { statement: `Reported by Cala: ${ICEYE_IHI_CONTRACT_CLAIM}`, kind: "observed", sources: iceyeIhiContract },
  {
    statement: `Reported by Cala: ${KUVA_IHI_CLAIM} The memorandum discloses no financial amount.`,
    kind: "observed",
    sources: kuvaIhiPress,
  },
  {
    statement:
      "Reported by Cala: NASA announced the Commercial Satellite Data Acquisition (CSDA) On-Ramp 2 awardees on 18 June " +
      "2026. The award names Kuva US Inc., the U.S. subsidiary of Kuva Space, not Kuva Space itself. $476 million is the " +
      "maximum ceiling of the whole multiple-award contract, shared across all awardees; the value of Kuva's own task " +
      "orders is not disclosed. The contract runs through 15 November 2028.",
    kind: "observed",
    sources: kuvaNasaPress,
  },
  { statement: `Reported by Cala: ${KUVA_SYKE_CLAIM} No value is disclosed.`, kind: "observed", sources: kuvaSykePress },
  { statement: `Reported by Cala: ${KUVA_PUYBARBE_CLAIM} No value is disclosed.`, kind: "observed", sources: kuvaPuybarbePress },
  { statement: "Cala lists Kuva Space as an attendee of Slush 2026.", kind: "observed", sources: [] },
];

const investorRows: SeedRow[] = [
  {
    candidate: kuva,
    category: "lead",
    reason:
      "Kuva Space signed a memorandum of understanding with IHI Corporation, which has a memorandum and a " +
      "procurement contract with ICEYE; Cala lists a tie between OTB Ventures and ICEYE.",
    fit: [
      line(
        "Trail",
        "Three connections: OTB Ventures, ICEYE, IHI Corporation, Kuva Space. The first is an undirected tie; the other two are agreements reported by Cala.",
        "observed",
        [...otbPortfolio, ...iceyeIhiPress, ...kuvaIhiPress.slice(0, 1)],
      ),
      line("Signal date", "The Kuva Space and IHI memorandum is reported for mid-2026.", "observed", kuvaIhiPress),
      line("Event", "Cala lists Kuva Space as a Slush 2026 attendee.", "observed"),
    ],
    trails: [otbToKuva],
    directFitOnly: false,
    unknowns: [
      "The value of any Kuva Space agreement: none is disclosed.",
      "Kuva Space's funding stage and investors: it has a stored signal probe and no star read.",
    ],
    brief: {
      whyMeet: [
        line(
          "Shared counterparty",
          "IHI Corporation signed a memorandum of understanding with Kuva Space in mid-2026 and one with ICEYE on 22 May 2025; the same IHI entity appears in both of Cala's answers.",
          "observed",
          [...kuvaIhiPress, ...iceyeIhiPress],
        ),
        line(
          "Record",
          "ICEYE and IHI went on to sign a procurement contract on 16 October 2025 for an initial four satellites.",
          "observed",
          iceyeIhiContract,
        ),
        line(
          "Reading",
          "Kuva Space's counterparty has a record with a comparable company that Cala ties to OTB Ventures.",
          "inferred",
        ),
      ],
      whyHesitate: [
        line(
          "Agreement type",
          "The Kuva Space agreement is a memorandum of understanding with no disclosed amount; it is not a contract.",
          "observed",
          kuvaIhiPress,
        ),
        line(
          "NASA award",
          "Cala reports the NASA CSDA award names Kuva US Inc., the U.S. subsidiary. $476 million is the programme-wide ceiling for all awardees; Kuva's own amount is not disclosed.",
          "observed",
          kuvaNasaPress,
        ),
        line(
          "Fund connection",
          "The tie between OTB Ventures and ICEYE has no role evidence in stored reads.",
          "unknown",
          otbPortfolio,
        ),
      ],
      directSignals: [kuvaIhiMou, kuvaPuybarbe],
      ownership: [],
      questions: [
        "What does the IHI memorandum commit either side to, and what would turn it into a contract?",
        "What has Kuva US Inc. been awarded under NASA's CSDA programme so far?",
        "How does Kuva Space's hyperspectral offer sit beside ICEYE's radar offer for the same customers?",
      ],
      stillUnknown: [
        "The value of the IHI memorandum and of any NASA task order.",
        "Kuva Space's funding stage, investors and current round.",
        "Whether Kuva Space is raising, and whether anyone from the company will be at Slush.",
      ],
      coverageNote:
        "Kuva Space: one stored signal probe from 2026-11-14 and no star read. ICEYE is read in full. OTB Ventures and " +
        "IHI Corporation are seen only in other entities' lists and answers.",
    },
    facts: KUVA_FACTS,
  },
  {
    candidate: photoncycle,
    category: "direct_fit",
    reason:
      "Direct fit only: a Slush attendee with public grants on record. No connection to OTB Ventures or its " +
      "portfolio is demonstrated.",
    fit: [
      line("Event", "Cala lists Photoncycle as a Slush 2026 attendee.", "observed"),
      line("Signal", "ENOVA SF granted Photoncycle NOK 14,376,817, with an event date of 2025-03-13.", "observed", enovaFiling),
      line("Connection", "No stored path connects Photoncycle to OTB Ventures or to ICEYE.", "unknown"),
    ],
    trails: [],
    directFitOnly: true,
    unknowns: ["Any connection to OTB Ventures' portfolio."],
    brief: null,
    facts: [],
  },
];

export const SCENARIOS: Scenario[] = [
  {
    key: "founder-redpine",
    role: "founder",
    subject: redpine,
    constraints: {
      stages: ["Series A"],
      sectors: ["AI", "data infrastructure"],
      geographies: ["Nordics", "Europe"],
      exclusions: null,
      includeExistingBackers: true,
      includePublicFunding: true,
      notes: "Hypothetical mandate for the demo: Redpine preparing its next round at Slush.",
    },
    rows: founderRows,
    gaps: [
      "NordicNinja's ties to Redpine and Photoncycle have no role evidence in stored reads, so both are shown as undirected ties.",
      "Lifeline Ventures AB and Voima Ventures Oy are seen only in Photoncycle's list; neither has been read in full.",
      `Redpine's signal probe: none found by Cala on ${PROBED_ON}. Its VINNOVA grant comes from the graph.`,
      "No stored evidence shows the stage, sector or geography focus of the listed investors.",
    ],
    proposals: [
      { entity: redpine, reason: "The subject itself; a probe is already stored.", alreadyProbedAt: FETCHED_AT },
      {
        entity: photoncycle,
        reason: "Shares two backers with Redpine and holds two public grants; a probe would show its agreements.",
        alreadyProbedAt: null,
      },
      {
        entity: luminar,
        reason: "Redpine's investor with 41 stored portfolio ties; a probe would show fund-level announcements.",
        alreadyProbedAt: null,
      },
    ],
  },
  {
    key: "investor-otb",
    role: "investor",
    subject: otb,
    constraints: {
      stages: null,
      sectors: ["space", "earth observation"],
      geographies: ["Europe"],
      exclusions: null,
      includeExistingBackers: null,
      includePublicFunding: null,
      notes: "Hypothetical mandate for the demo: OTB Ventures shortlisting Slush companies near its portfolio.",
    },
    rows: investorRows,
    gaps: [
      "The tie between OTB Ventures and ICEYE has no role evidence in stored reads and is shown as an undirected tie.",
      "OTB Ventures has no hub read, so its other portfolio companies were not used as anchors.",
      "Kuva Space has a signal probe and no star read: its investors and stage are unknown.",
    ],
    proposals: [
      { entity: kuva, reason: "Candidate with a stored probe naming IHI Corporation.", alreadyProbedAt: FETCHED_AT },
      { entity: iceye, reason: "Portfolio anchor with a stored probe naming IHI Corporation.", alreadyProbedAt: FETCHED_AT },
      {
        entity: ihi,
        reason: "Counterparty of both ICEYE and Kuva Space; a probe would show its other agreements.",
        alreadyProbedAt: null,
      },
    ],
  },
];

/** What a dossier shows beyond an entity's signals, for the entities the saved files describe. */
export const DOSSIER_EXTRAS: Record<string, Pick<Dossier, "properties" | "unresolvedClaims" | "possibleDuplicates">> = {
  [redpine.id]: {
    properties: [
      { name: "headquarters_address", value: "Stockholm, Sweden", sources: [redpineSeedPress[2]!] },
      { name: "funding_stage", value: "SEED", sources: redpineSeedPress.slice(1, 2) },
      { name: "total_funding", value: "9000000 EUR", sources: redpineSeedPress.slice(0, 2) },
    ],
    unresolvedClaims: [],
    possibleDuplicates: [
      {
        entity: entity("ffc9399d-04d8-4e3e-afc1-dd64e3fb652b", "Redpine", "Company"),
        basis: "Cala's probe answer resolved the name to this second ID. A proposal, not a join.",
      },
    ],
  },
  [photoncycle.id]: {
    properties: [
      { name: "headquarters_address", value: "Oslo, Norway", sources: [] },
      { name: "funding_stage", value: "SERIES_A", sources: [] },
    ],
    unresolvedClaims: [],
    possibleDuplicates: [],
  },
  [kuva.id]: {
    properties: [],
    unresolvedClaims: [
      { claim: KUVA_NASA_CLAIM, sources: kuvaNasaPress },
      { claim: KUVA_SYKE_CLAIM, sources: kuvaSykePress },
    ],
    possibleDuplicates: [],
  },
};

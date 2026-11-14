import type {
  Brief,
  Constraints,
  EntityRef,
  Hop,
  PacketSections,
  Signal,
  SourceRef,
  Trail,
} from "../../src/contract";

/**
 * Two briefs built by hand from the saved Cala responses in evidence-round-4-fable: Redpine's
 * shared backers and Photoncycle's grants, and ICEYE, IHI Corporation and Kuva Space with the NASA
 * award that names Kuva's US subsidiary. The entity IDs are short stand-ins for Cala's.
 */

function entity(id: string, name: string, entityType = "Company", description: string | null = null): EntityRef {
  return { id, name, entityType, description };
}

export const redpine = entity("redpine", "Redpine Technology AB");
export const luminar = entity("luminar", "Luminar Ventures");
export const nordicNinja = entity("nordicninja", "NordicNinja VC");
export const photoncycle = entity("photoncycle", "Photoncycle AS");
export const enova = entity("enova", "ENOVA SF", "Organization");
export const innovationNorway = entity("innovation-norway", "Innovation Norway", "Organization");
export const iceye = entity("iceye", "ICEYE");
export const ihi = entity("ihi", "IHI Corporation");
export const kuvaSpace = entity("kuva-space", "Kuva Space", "Company", "Finnish hyperspectral satellite company.");
export const kuvaUs = entity("kuva-us", "Kuva US Inc.");
export const nasa = entity("nasa", "NASA", "Organization");

export const openConstraints: Constraints = {
  stages: ["Seed"],
  sectors: null,
  geographies: ["Nordics"],
  exclusions: null,
  includeExistingBackers: true,
  includePublicFunding: true,
  notes: null,
};

const enovaRegister: SourceRef = {
  name: "stotte.brreg.no",
  url: "https://stotte.brreg.no/en/oppslag/stoettetildeling/1000026319",
  date: "2025-06-19",
  rank: "FILING",
};

const innovationRegister: SourceRef = {
  name: "stotte.brreg.no",
  url: "https://stotte.brreg.no/en/oppslag/stoettetildeling/1000026931",
  date: "2025-09-22",
  rank: "FILING",
};

const press: SourceRef = {
  name: "eu-startups.com",
  url: "https://www.eu-startups.com/2026/04/stockholms-redpine-raises-e6-8-million",
  date: "2026-04-28",
  rank: "PRESS",
};

function hop(from: EntityRef, to: EntityRef, fields: Partial<Hop> = {}): Hop {
  return {
    from,
    to,
    family: "investment",
    relationship: "INVESTED_IN",
    direction: "undirected",
    role: null,
    origin: "native",
    claim: null,
    validSince: null,
    validUntil: null,
    sources: [press],
    ...fields,
  };
}

function signal(id: string, on: EntityRef, fields: Partial<Signal>): Signal {
  return {
    id,
    type: "financing",
    entity: on,
    label: "",
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
    sources: [],
    ...fields,
  };
}

function trail(id: string, fields: Pick<Trail, "pattern" | "subject" | "end" | "hops" | "signal"> & Partial<Trail>): Trail {
  return {
    id,
    hopCount: fields.hops.length,
    weakestSourceRank: "PRESS",
    independentTrails: 1,
    readInFull: [],
    seenInListOnly: [],
    conclusion: null,
    ...fields,
  };
}

export const enovaGrant = signal("signal-enova", photoncycle, {
  type: "public_money",
  label: "Grant from ENOVA SF",
  date: "2025-03-13",
  dateKind: "event_date",
  value: 14376817,
  units: "NOK",
  instrument: "GRANT",
  parties: [{ entity: enova, role: "GRANTOR" }],
  publicBasis: { basis: "ENOVA SF is a Norwegian state enterprise", ours: true },
  sources: [enovaRegister],
});

export const innovationGrant = signal("signal-innovation-norway", photoncycle, {
  type: "public_money",
  label: "Grant from Innovation Norway",
  date: "2023-01-27",
  dateKind: "event_date",
  value: 5300000,
  units: "NOK",
  instrument: "GRANT",
  parties: [{ entity: innovationNorway, role: "GRANTOR" }],
  flag: "the register's entries for this grant carry different dates",
  sources: [innovationRegister],
});

/** Redpine's Raise Mandate: Luminar's funding is settled by roles, NordicNinja's ties are not. */
export function redpineBrief(mandateId: string, revision: number): Brief {
  return {
    mandateId,
    revision,
    candidate: enova,
    category: "non_dilutive",
    whyMeet: [
      {
        criterion: "Trail",
        statement: "ENOVA SF funded a company that shares a backer with Redpine Technology AB.",
        kind: "observed",
        sources: [enovaRegister],
      },
    ],
    whyHesitate: [
      {
        criterion: "Geography",
        statement: "Whether ENOVA SF funds companies registered outside Norway is not in the stored evidence.",
        kind: "unknown",
        sources: [],
      },
    ],
    trails: [
      trail("trail-luminar", {
        pattern: "T2",
        subject: redpine,
        end: enova,
        hops: [
          hop(redpine, luminar, { direction: "to_funds_from", role: "INVESTOR" }),
          hop(luminar, photoncycle, { direction: "from_funds_to", role: "INVESTOR" }),
          hop(photoncycle, enova, { direction: "to_funds_from", role: "GRANTOR", sources: [enovaRegister] }),
        ],
        signal: enovaGrant,
        weakestSourceRank: "PRESS",
        independentTrails: 2,
        readInFull: [redpine.id, luminar.id, photoncycle.id],
        seenInListOnly: [enova.id],
        conclusion: {
          trailId: "trail-luminar",
          reading: "This public funder is active in your investors' portfolios.",
          because: "Luminar Ventures funded both Redpine and Photoncycle, and ENOVA SF gave Photoncycle a grant.",
          doesNotProve: "It does not prove that ENOVA SF funds companies like Redpine or has a programme open now.",
          ask: "Ask Luminar Ventures how Photoncycle obtained the ENOVA grant.",
        },
      }),
      trail("trail-nordicninja", {
        pattern: "T2",
        subject: redpine,
        end: photoncycle,
        hops: [hop(redpine, nordicNinja), hop(nordicNinja, photoncycle)],
        signal: innovationGrant,
        independentTrails: 2,
        readInFull: [redpine.id, photoncycle.id],
        seenInListOnly: [nordicNinja.id],
      }),
    ],
    directSignals: [],
    ownership: [],
    questions: ["Which programme funded Photoncycle, and is it open to Swedish companies?"],
    stillUnknown: ["Whether NordicNinja VC funded Redpine or Photoncycle: no stored record settles the direction."],
    coverageNote: "3 of the 5 entities on these trails were read in full; ENOVA SF and NordicNinja VC were seen only in other entities' lists.",
  };
}

const ihiKuvaClaim =
  "The memorandum of understanding with Japan’s IHI Corporation was signed in mid‑2026 after a demonstration phase that began in November 2025, outlining a strategic partnership to evaluate a potential 20‑satellite Japanese hyperspectral constellation.";

const nasaClaim =
  "The NASA Commercial Satellite Data Acquisition (CSDA) On‑Ramp 2 award was announced on 18 June 2026, is a firm‑fixed‑price IDIQ contract with a maximum ceiling of $476 million and runs through 15 Nov 2028, establishing the government contract with NASA for Kuva Space’s U.S. subsidiary.";

const arcticStartup: SourceRef = {
  name: "arcticstartup.com",
  url: "https://arcticstartup.com/kuva-space-partners-with-ihi",
  date: null,
  rank: null,
};

/** ICEYE's mandate: a counterparty it shares with Kuva Space, and an award to Kuva's subsidiary. */
export function kuvaBrief(mandateId: string, revision: number): Brief {
  return {
    mandateId,
    revision,
    candidate: kuvaSpace,
    category: "direct_fit",
    whyMeet: [],
    whyHesitate: [],
    trails: [
      trail("trail-ihi", {
        pattern: "T6",
        subject: iceye,
        end: kuvaSpace,
        hops: [
          hop(iceye, ihi, {
            family: "agreement",
            relationship: "mou",
            direction: "not_applicable",
            origin: "derived",
            claim:
              "ICEYE and Japan’s IHI Corporation signed a memorandum of understanding on 22 May 2025 to develop a SAR constellation of up to 24 satellites.",
            sources: [{ name: "ICEYE", url: "https://www.iceye.com/newsroom/press-releases/iceye-and-ihi", date: null, rank: null }],
          }),
          hop(ihi, kuvaSpace, {
            family: "agreement",
            relationship: "mou",
            direction: "not_applicable",
            origin: "derived",
            claim: ihiKuvaClaim,
            sources: [arcticStartup],
          }),
        ],
        signal: null,
      }),
    ],
    directSignals: [],
    ownership: [
      {
        relation: "subsidiary",
        entity: kuvaUs,
        sources: [],
        signals: [
          signal("signal-nasa", kuvaUs, {
            type: "agreement",
            label: "NASA CSDA On-Ramp 2 award",
            date: "2026-06-18",
            dateKind: "announcement_date",
            value: 476000000,
            units: "USD",
            valueIsProgrammeCeiling: true,
            parties: [{ entity: nasa, role: null }],
            origin: "derived",
            claim: nasaClaim,
            sources: [
              {
                name: "militaryaerospace.com",
                url: "https://www.militaryaerospace.com/commercial-aerospace/news/55388073/nasa-selects-kuva-space",
                date: null,
                rank: null,
              },
            ],
          }),
        ],
      },
    ],
    questions: [],
    stillUnknown: ["The value of Kuva US Inc.'s own task orders under the NASA programme has not been disclosed."],
    coverageNote: "Both agreements come from one signal probe each; neither company's investors were read.",
  };
}

export function sections(fields: Partial<PacketSections> = {}): PacketSections {
  return {
    whyMeet: "",
    trail: "",
    whyHesitate: "",
    questions: [],
    agenda: [],
    outreachDraft: "",
    privateNotes: "",
    ...fields,
  };
}

/**
 * The mock's evidence: entities, sources, ties and dated facts copied from the Cala responses
 * saved on 2026-11-14 (evidence-round-2, -4 and -6). Names, IDs, dates, amounts and URLs are the
 * ones in those files; what a file does not hold stays null here too.
 */
import type { Dossier, EntityMatch, EntityRef, Hop, Signal, SourceRef } from "@fundraising/package-ledger";

const source = (name: string | null, url: string | null, date: string | null, rank: string | null): SourceRef => ({
  name,
  url,
  date,
  rank,
});

const entity = (id: string, name: string, entityType: string, description: string | null = null): EntityRef => ({
  id,
  name,
  entityType,
  description,
});

/** When each saved response was fetched, by the clock of the machine that fetched it. */
export const FETCHED = {
  roster: "2026-11-14T12:02:00+02:00",
  redpine: "2026-11-14T12:23:56+02:00",
  luminar: "2026-11-14T12:27:08+02:00",
  photoncycle: "2026-11-14T12:29:18+02:00",
  grants: "2026-11-14T12:30:02+02:00",
  redpineProbe: "2026-11-14T12:28:10+02:00",
  kuvaProbe: "2026-11-14T12:28:28+02:00",
  iceye: "2026-11-14T12:20:11+02:00",
  iceyeProbe: "2026-11-14T12:21:53+02:00",
  cohort: "2026-11-14T12:24:26+02:00",
  refused: "2026-11-14T12:41:00+02:00",
  newest: "2026-11-14T12:55:50+02:00",
} as const;

export const E = {
  redpine: entity(
    "331fec23-9c63-4885-a8f5-c2902c9e1b9d",
    "Redpine Technology AB",
    "Company",
    "Your agent reads the whole paper, not just the abstract. Licensed peer-reviewed full text in medicine, chemistry, and materials science, behind one endpoint.",
  ),
  luminar: entity(
    "be67283b-4529-4a2d-834a-96edc4b36971",
    "Luminar Ventures",
    "Company",
    "Nordic venture capital fund specializing in early-stage investments in technology companies.",
  ),
  nordicninja: entity("a46a1058-93a7-4b0f-bc1f-bc31238fb006", "NORDICNINJA VC LIMITED", "Company"),
  nodevc: entity("abd185d2-6933-484f-85b7-a4c4a1b60e56", "node.vc", "Company"),
  photoncycle: entity(
    "d5f8974b-7765-44f7-afc6-6f1767b8bad0",
    "Photoncycle",
    "Company",
    "The year-round solar energy system for heating and electricity",
  ),
  enova: entity("76d8c340-04bf-474a-b8c6-00c4e8438b79", "ENOVA SF", "Company"),
  innovationNorway: entity("e8203bac-13d8-5d13-ab4d-996b6657363b", "Innovation Norway", "Organization"),
  vinnova: entity("63261106-7e97-4765-b212-96ee486a2e05", "VINNOVA", "Organization"),
  lifelineAb: entity(
    "4d668c75-c7a0-4f5b-baea-ce0fa6a34e31",
    "Lifeline Ventures AB",
    "Company",
    "A Swedish company incorporated in 2010 and headquartered in Stockholm.",
  ),
  lifelineOrg: entity(
    "476a73ac-afa2-4713-9f73-188bc7ec0b95",
    "Lifeline Ventures",
    "Organization",
    "Finnish venture capital firm headquartered in Helsinki.",
  ),
  voimaOy: entity("1f973216-f1e5-4466-8409-da6608460c02", "Voima Ventures Oy", "Company"),
  voimaOrg: entity("8673db97-466e-4e7e-8417-a0ce1207bf9e", "Voima Ventures", "Organization"),
  eviny: entity("8540e55a-1f3b-4969-bf08-6802f5344d24", "Eviny Ventures", "Company"),
  saminvest: entity(
    "077d67bb-1ec0-484e-892a-4140d31af6d1",
    "Saminvest AB",
    "Company",
    "Swedish venture capital firm headquartered in Stockholm, founded in 2016.",
  ),

  otb: entity("d26a193e-78e6-47ed-a265-877bc5a60b35", "OTB Ventures", "Company"),
  iceye: entity(
    "0247c487-08b6-4e07-8e92-0969cdfeaa2d",
    "ICEYE",
    "Company",
    "Finnish aerospace and defense company founded in 2014 and headquartered in Espoo.",
  ),
  ihi: entity("6d909137-a0a9-414c-bc93-40cbf5f6acd8", "IHI Corporation", "Company"),
  kuva: entity("41f89a61-54ac-4068-82af-a2d2096efcfc", "Kuva Space", "Company"),
  puybarbe: entity("8a37b7fa-e810-5656-aa41-9251ba8ffd94", "CHATEAU PUYBARBE", "Company"),
  nasa: entity("903f54b0-1bb2-406c-8bcc-9b80df792a75", "NASA", "Organization"),

  waymap: entity(
    "caf77a29-53cd-4c6c-9776-bb47acf63c54",
    "WAYMAP LIMITED",
    "Company",
    "Waymap is the world's only navigation app to guide you outdoors, indoors, and even deep underground. Accessible step-by-step navigation for all.",
  ),
  innovateUk: entity("6258b41e-9e4a-4df3-927c-37cb96378959", "Innovate UK", "Organization"),
  trustnxt: entity(
    "15fe4d14-50d7-481b-91bd-724a852039ab",
    "TrustNXT",
    "Company",
    "TrustNXT provides a cryptographic trust layer for Physical AI, securing data provenance across robotics, autonomous systems and critical infrastructure.",
  ),
  ifb: entity("43f1235b-4325-4e2f-8d90-bd0e4b2a99c1", "IFB Innovationsstarter GmbH", "Company"),
  katana: entity(
    "51f64e19-6d58-4b3a-8374-ce9e9213b1bc",
    "Katana MRP",
    "Company",
    "Optimize operations with Katana, the cloud-based inventory management software designed for real-time production and material tracking. Try our free plan.",
  ),
  ecDigital: entity(
    "c11c80dd-f29e-5f65-bc84-06871200dcef",
    "European Commission (Digital Europe Programme, European Digital Innovation Hubs)",
    "Organization",
  ),
  corsmed: entity("86918e08-e1e0-4caa-8b76-d4e22fd61699", "Corsmed AB", "Company"),
  calaAi: entity("81cfdabc-53f7-426a-b358-a942e159ca0f", "Cala AI", "Company"),
} as const;

export const S = {
  slush: source("Slush", "https://slush.org/", "2026-11-14", null),

  gleifRedpine: source("GLEIF", "https://search.gleif.org/#/record/6488I0LOG0TY2766P195", "2026-04-08", null),
  redpineSite: source("redpine.ai", "https://redpine.ai/", "2026-11-03", "PRIMARY"),
  redpineAbout: source("redpine.ai", "https://www.redpine.ai/about", "2026-11-07", "PRIMARY"),
  redpineLinkedin: source("linkedin.com", "https://www.linkedin.com/company/redpineai/", "2026-11-02", "AGGREGATOR"),
  euStartupsRedpine: source(
    "eu-startups.com",
    "https://www.eu-startups.com/2026/04/stockholms-redpine-raises-e6-8-million-to-unlock-licensed-premium-data-for-ai-agents/",
    "2026-04-28",
    "PRESS",
  ),
  tnwRedpine: source("thenextweb.com", "https://thenextweb.com/news/redpine-raises-e6-8m-api-for-ai-agents", "2026-04-28", "PRESS"),
  tfnRedpine: source(
    "techfundingnews.com",
    "https://techfundingnews.com/nordicninja-leads-redpine-in-e6-8m-round-to-let-ai-agents-access-private-data/",
    "2026-04-28",
    "PRESS",
  ),
  arcticRedpine: source("arcticstartup.com", "https://arcticstartup.com/redpine-raises-e6-8m-seed/", "2026-05-01", "PRESS"),
  vinnova: source(
    "vinnova.se",
    "https://www.vinnova.se/p/konferensmedverkan-mobile-world-congress-2027-redpine-/",
    "2026-11-12",
    "PRIMARY",
  ),

  luminarPortfolio: source("Luminar Ventures – Portfolio Companies", "https://luminarventures.com/portfolio", "2025-01-01", null),
  luminarFund: source(
    "Luminar Ventures closes second fund at €65M, focusing on AI and fintech in the Nordics",
    "https://tech.eu/2023/10/06/luminar-ventures-eur65-ai-and-fintech-in-the-norics",
    "2023-10-06",
    null,
  ),
  fiban: source("Partners | FiBAN", "https://fiban.org/portfolio", "2025-08-26", null),
  luminarProfile: source(
    "7 Best Venture Capital (VC) Firms in Sweden",
    "https://earlynode.com/vc-fundraising/7-best-venture-capital-vc-firms-in-sweden",
    "2026-01-01",
    null,
  ),
  corsmedSeed: source(
    "eu-startups.com",
    "https://www.eu-startups.com/2024/12/from-hours-to-minutes-swedish-startup-corsmed-raises-e3-3-million-to-accelerate-mris/",
    "2024-12-18",
    "PRESS",
  ),
  lightbringerSeed: source(
    "lightbringer.com",
    "https://lightbringer.com/news-items/legal-tech-company-lightbringer-raises-42",
    "2024-12-18",
    "PRIMARY",
  ),

  tnwPhotoncycle: source(
    "thenextweb.com",
    "https://thenextweb.com/news/photoncycle-raises-e15m-series-a-to-address-europes-seasonal-energy-storage-gap",
    "2026-03-04",
    "PRESS",
  ),
  euStartupsPhotoncycle: source(
    "eu-startups.com",
    "https://www.eu-startups.com/2026/03/oslos-photoncycle-raises-e15-million-to-enable-households-to-store-surplus-summer-solar-power-for-winter-use/",
    "2026-03-04",
    "PRESS",
  ),
  photoncycleSeed: source(
    "taiyangnews.info",
    "https://taiyangnews.info/photoncycle-prepping-for-market-launch-with-seed-funding",
    "2024-04-10",
    "PRESS",
  ),
  photoncycleSite: source("photoncycle.com", "https://www.photoncycle.com/en/", "2026-11-04", "PRIMARY"),
  photoncycleLinkedin: source("linkedin.com", "https://www.linkedin.com/company/photoncycle/", "2026-11-02", "AGGREGATOR"),
  tracxnPhotoncycle: source(
    "tracxn.com",
    "https://tracxn.com/d/companies/photoncycle/__K_fz8f9JI0uUGDnUOskGhh5b20eu4zCbM12X0i-3gJE/funding-and-investors",
    "2026-08-24",
    null,
  ),
  voimaPortfolio: source("voimaventures.com", "https://voimaventures.com/portfolio", "2026-08-24", null),
  brregEnova: source("stotte.brreg.no", "https://stotte.brreg.no/en/oppslag/stoettetildeling/1000026319", "2025-06-19", "FILING"),
  brregInnovationA: source(
    "stotte.brreg.no",
    "https://stotte.brreg.no/en/oppslag/stoettetildeling/1000026931",
    "2025-09-22",
    "FILING",
  ),
  brregInnovationB: source(
    "stotte.brreg.no",
    "https://stotte.brreg.no/en/oppslag/stoettetildeling/1000031655",
    "2025-12-11",
    "FILING",
  ),

  otbPortfolio: source("Portfolio - OTB Ventures", "https://otb.vc/portfolio", "2026-08-21", null),
  iceyeSeriesD: source(
    "satellitetoday.com",
    "https://www.satellitetoday.com/finance/2022/02/03/iceye-raises-136m-in-series-d-funding-round",
    "2026-06-20",
    null,
  ),
  gleifIceye: source("GLEIF", "https://search.gleif.org/#/record/743700XY20YYW4T0OM62", "2026-04-08", null),
  calaIceye: source("Cala AI", null, "2026-08-19", null),

  // Passages behind Cala's knowledge claims carry a publisher and a URL, and no date or rank.
  iceyeIhiMou: source(
    "ICEYE",
    "https://www.iceye.com/newsroom/press-releases/iceye-and-ihi-start-cooperation-to-develop-sar-satellite-constellation-in-japan?hs_amp=true",
    null,
    null,
  ),
  iceyeIhiContractA: source(
    "morningstar.com",
    "https://www.morningstar.com/news/pr-newswire/20251016la99676/iceye-and-ihi-sign-agreement-to-build-an-earth-observation-satellite-constellation",
    null,
    null,
  ),
  iceyeIhiContractB: source(
    "Defence Industry Europe",
    "https://defence-industry.eu/iceye-and-ihi-sign-agreement-to-build-satellite-constellation-for-earth-observation-in-japan",
    null,
    null,
  ),
  iceyeSpock: source(
    "ICEYE",
    "https://www.iceye.com/newsroom/press-releases/iceye-and-rheinmetall-win-major-contract-worth-billions-for-space-reconnaissance",
    null,
    null,
  ),
  iceyeFinland: source(
    "Finnish Government",
    "https://valtioneuvosto.fi/en/-/1948673/finnish-defence-forces-to-procure-satellites-from-iceye",
    null,
    null,
  ),
  kuvaIhiA: source("arcticstartup.com", "https://arcticstartup.com/kuva-space-partners-with-ihi", null, null),
  kuvaIhiB: source(
    "jp.ibtimes.com",
    "https://jp.ibtimes.com/ihi-partners-finlands-kuva-space-hyperspectral-satellite-constellation-102837",
    null,
    null,
  ),
  kuvaNasaA: source(
    "bebeez.eu",
    "https://bebeez.eu/2026/07/01/kuva-space-scores-nasa-contract-accelerates-hyperspectral-constellation-ambitions",
    null,
    null,
  ),
  kuvaNasaB: source(
    "militaryaerospace.com",
    "https://www.militaryaerospace.com/commercial-aerospace/news/55388073/nasa-selects-kuva-space-for-commercial-hyperspectral-satellite-data-program",
    null,
    null,
  ),
  kuvaSyke: source(
    "arctictoday.com",
    "https://www.arctictoday.com/%F0%9F%87%AB%F0%9F%87%AE-finnish-environment-institute-and-kuva-space-partner-to-enhance-finlands-inland-and-coastal-water-quality-monitoring",
    null,
    null,
  ),
  kuvaSykeFunding: source("Kauppalehti", "https://www.kauppalehti.fi/lehdistotiedotteet/a/b1a9c073-2304-568d-ac3c-4be314007738", null, null),
  kuvaPuybarbe: source(
    "kuvaspace.com",
    "https://kuvaspace.com/en/resources/the-first-vineyard-operationally-monitored-by-hyperspectral-satellites-from-space",
    null,
    null,
  ),

  waymapGrant: source(
    "gtr.ukri.org",
    "https://gtr.ukri.org/find-research-and-innovation/project/28c47050-4938-4337-ab46-3373f0b3b704",
    "2026-11-13",
    "FILING",
  ),
  waymapNews: source(
    "waymapnav.com",
    "https://waymapnav.com/news/waymap-backed-by-uk-governments-innovation-agency",
    "2021-11-23",
    "PRIMARY",
  ),
  waymapFiling: source(
    "find-and-update.company-information.service.gov.uk",
    "https://find-and-update.company-information.service.gov.uk/company/11050813/filing-history/MzUyNjQ5ODM4NWFkaXF6a2N4/document?format=pdf&download=0",
    "2026-06-18",
    "FILING",
  ),
  waymapLinkedin: source("linkedin.com", "https://www.linkedin.com/company/waymap/mycompany/?viewAsMember=true", "2026-11-02", "AGGREGATOR"),
  waymapRegister: source(
    "Companies House UK",
    "https://find-and-update.company-information.service.gov.uk/company/11050813",
    "2026-05-01",
    null,
  ),
  trustnxtGrant: source(
    "startupcity.hamburg",
    "https://startupcity.hamburg/news-events/news/these-startups-were-funded-by-ifb-in-december-2024",
    "2024-12-19",
    "PRIMARY",
  ),
  trustnxtRound: source(
    "eu-startups.com",
    "https://www.eu-startups.com/2025/09/hamburgs-trustnxt-bags-e1-6-million-to-combat-ai-manipulation-of-images-and-videos/",
    "2025-09-04",
    "PRESS",
  ),
  trustnxtLegal: source("trustnxt.com", "https://trustnxt.com/legal-notice", "2026-11-12", "PRIMARY"),
  trustnxtLinkedin: source("linkedin.com", "https://www.linkedin.com/company/trustnxt/", "2026-11-02", "AGGREGATOR"),
  katanaGrant: source("cordis.europa.eu", "https://cordis.europa.eu/project/id/855987", "2019-02-25", "FILING"),
  katanaRound: source("businesswire.com", "https://www.businesswire.com/news/home/20221012005045/en", "2022-10-12", "PRIMARY"),
  katanaAbout: source("katanamrp.com", "https://katanamrp.com/about-us/", "2026-11-11", "PRIMARY"),
  katanaLinkedin: source("linkedin.com", "https://www.linkedin.com/company/katanamrp/", "2026-11-02", "AGGREGATOR"),
} as const;

/** The claims Cala reported, quoted exactly as its knowledge endpoint returned them. */
export const CLAIM = {
  iceyeIhiMou:
    "ICEYE and Japan’s IHI Corporation signed a memorandum of understanding on 22 May 2025 to develop a SAR constellation of up to 24 satellites.",
  iceyeIhiContract:
    "Following the May MOU, ICEYE and IHI signed a procurement contract on 16 October 2025 for an initial four satellites (with an option for 20 more) to be built in Japan.",
  iceyeSpock:
    "ICEYE, through the joint venture Rheinmetall ICEYE Space Solutions, received the German Armed Forces “SPOCK 1” contract on 18 December 2025, valued at roughly €1.7 billion and running to end‑20210 with extensions.",
  iceyeFinland:
    "ICEYE signed a procurement contract with the Finnish Defence Forces on 8 September 2025 for a sovereign SAR satellite system worth about €158 million, including options for extension.",
  kuvaIhiMou:
    "The memorandum of understanding with Japan’s IHI Corporation was signed in mid‑2026 after a demonstration phase that began in November 2025, outlining a strategic partnership to evaluate a potential 20‑satellite Japanese hyperspectral constellation.",
  kuvaIhiValue:
    "The IHI‑Kuva MoU does not disclose a financial amount, focusing instead on technical evaluation and potential domestic satellite manufacturing.",
  kuvaNasa:
    "The NASA Commercial Satellite Data Acquisition (CSDA) On‑Ramp 2 award was announced on 18 June 2026, is a firm‑fixed‑price IDIQ contract with a maximum ceiling of $476 million and runs through 15 Nov 2028, establishing the government contract with NASA for Kuva Space’s U.S. subsidiary.",
  kuvaSyke:
    "The partnership with the Finnish Environment Institute (Syke) was announced on 3 July 2025, describing a public‑private pilot to test hyperspectral data and AI for algae‑bloom monitoring in Finland’s lakes and coastal waters.",
  kuvaPuybarbe:
    "The collaboration with Château Puybarbe was announced on 19 March 2026, describing a commercial pilot where the vineyard will be monitored using Kuva Space’s hyperspectral satellite imagery.",
} as const;

// ---------------------------------------------------------------------------
// Ties. Direction is settled only where two stored reads show the roles in one
// round; everything else stays an undirected tie.
// ---------------------------------------------------------------------------

const native = (
  from: EntityRef,
  to: EntityRef,
  direction: Hop["direction"],
  role: string | null,
  sources: SourceRef[],
): Hop => ({
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
});

const agreement = (from: EntityRef, to: EntityRef, relationship: string, claim: string, sources: SourceRef[]): Hop => ({
  from,
  to,
  family: "agreement",
  relationship,
  direction: "not_applicable",
  role: null,
  origin: "derived",
  claim,
  validSince: null,
  validUntil: null,
  sources,
});

export const HOP = {
  redpineLuminar: native(
    E.redpine,
    E.luminar,
    "to_funds_from",
    "Seed round: Luminar Ventures is INVESTOR, Redpine Technology AB is ISSUER",
    [S.tfnRedpine, S.tnwRedpine, S.euStartupsRedpine, S.arcticRedpine],
  ),
  luminarPhotoncycle: native(
    E.luminar,
    E.photoncycle,
    "from_funds_to",
    "Seed and Series A rounds: Luminar Ventures is INVESTOR, Photoncycle is ISSUER",
    [S.luminarPortfolio, S.tnwPhotoncycle, S.photoncycleSeed],
  ),
  redpineNordicninja: native(E.redpine, E.nordicninja, "undirected", null, [S.euStartupsRedpine, S.tfnRedpine, S.tnwRedpine]),
  nordicninjaPhotoncycle: native(E.nordicninja, E.photoncycle, "undirected", null, [S.tracxnPhotoncycle]),
  redpineVinnova: native(
    E.redpine,
    E.vinnova,
    "to_funds_from",
    "Grant round: VINNOVA is GRANTOR, Redpine Technology AB is ISSUER",
    [S.vinnova],
  ),
  photoncycleLifeline: native(E.photoncycle, E.lifelineAb, "undirected", null, [S.tnwPhotoncycle]),
  photoncycleVoima: native(E.photoncycle, E.voimaOy, "undirected", null, [S.voimaPortfolio]),
  photoncycleEviny: native(E.photoncycle, E.eviny, "undirected", null, [S.tracxnPhotoncycle]),

  otbIceye: native(E.otb, E.iceye, "undirected", null, [S.otbPortfolio, S.iceyeSeriesD]),
  iceyeIhi: agreement(E.iceye, E.ihi, "mou", CLAIM.iceyeIhiMou, [S.iceyeIhiMou]),
  ihiKuva: agreement(E.ihi, E.kuva, "mou", CLAIM.kuvaIhiMou, [S.kuvaIhiA, S.kuvaIhiB]),
} as const;

// ---------------------------------------------------------------------------
// Signals: dated, sourced facts about one entity.
// ---------------------------------------------------------------------------

const OURS = "Our classification. Cala's description of the body does not say it is public.";

export const SIGNAL = {
  enova: {
    id: "48681996-125a-51d3-9c20-61db0d626dd0",
    type: "public_money",
    entity: E.photoncycle,
    label: "Grant from ENOVA SF",
    date: "2025-03-13",
    dateKind: "event_date",
    value: 14376817,
    units: "NOK",
    valueIsProgrammeCeiling: false,
    instrument: "GRANT",
    parties: [
      { entity: E.enova, role: "GRANTOR" },
      { entity: E.photoncycle, role: "ISSUER" },
    ],
    origin: "native",
    claim: null,
    publicBasis: { basis: `Grantor in Norway's state-aid register, stotte.brreg.no. ${OURS}`, ours: true },
    flag: null,
    sources: [S.brregEnova],
  },
  innovationNorway: {
    id: "da65b870-36bb-5d82-8e78-3ab6c90190c9",
    type: "public_money",
    entity: E.photoncycle,
    label: "Grant from Innovation Norway",
    date: "2023-01-27",
    dateKind: "event_date",
    value: 5300000,
    units: "NOK",
    valueIsProgrammeCeiling: false,
    instrument: "GRANT",
    parties: [
      { entity: E.innovationNorway, role: "GRANTOR" },
      { entity: E.photoncycle, role: "ISSUER" },
    ],
    origin: "native",
    claim: null,
    publicBasis: { basis: `Grantor in Norway's state-aid register, stotte.brreg.no. ${OURS}`, ours: true },
    flag: "The record's dates disagree: event date 27 Jan 2023, but its two register entries are dated 22 Sep 2025 and 11 Dec 2025. Shown as context, not counted as one dated award.",
    sources: [S.brregInnovationA, S.brregInnovationB],
  },
  vinnova: {
    id: "ca144fee-3a29-5e2d-bf64-aee79d46ed9a",
    type: "public_money",
    entity: E.redpine,
    label: "Grant from VINNOVA",
    date: "2026-11-12",
    dateKind: "reported_on",
    value: 40000,
    units: "SEK",
    valueIsProgrammeCeiling: false,
    instrument: "GRANT",
    parties: [
      { entity: E.vinnova, role: "GRANTOR" },
      { entity: E.redpine, role: "ISSUER" },
    ],
    origin: "native",
    claim: null,
    publicBasis: { basis: `Grantor in the graph, sourced to vinnova.se. ${OURS}`, ours: true },
    flag: null,
    sources: [S.vinnova],
  },
  redpineSeed: {
    id: "f7e9dbb3-dd97-51be-8ebf-be133b8dc750",
    type: "financing",
    entity: E.redpine,
    label: "Seed round",
    date: "2026-04-28",
    dateKind: "reported_on",
    value: null,
    units: null,
    valueIsProgrammeCeiling: false,
    instrument: null,
    parties: [
      { entity: E.redpine, role: "ISSUER" },
      { entity: E.luminar, role: "INVESTOR" },
    ],
    origin: "native",
    claim: null,
    publicBasis: null,
    flag: null,
    sources: [S.euStartupsRedpine, S.arcticRedpine, S.tfnRedpine, S.tnwRedpine],
  },
  photoncycleSeriesA: {
    id: "d40aebfb-4d57-473d-ae8a-a05cb179d424",
    type: "financing",
    entity: E.photoncycle,
    label: "Financing raised",
    date: "2026-03-04",
    dateKind: "event_date",
    value: null,
    units: null,
    valueIsProgrammeCeiling: false,
    instrument: null,
    parties: [{ entity: E.photoncycle, role: "ISSUER" }],
    origin: "native",
    claim: null,
    publicBasis: null,
    flag: null,
    sources: [S.tracxnPhotoncycle, S.euStartupsPhotoncycle],
  },

  iceyeIhiMou: {
    id: "iceye-claim-2",
    type: "agreement",
    entity: E.iceye,
    label: "Memorandum of understanding with IHI Corporation",
    date: "2025-05-22",
    dateKind: "event_date",
    value: null,
    units: null,
    valueIsProgrammeCeiling: false,
    instrument: null,
    parties: [
      { entity: E.iceye, role: null },
      { entity: E.ihi, role: null },
    ],
    origin: "derived",
    claim: CLAIM.iceyeIhiMou,
    publicBasis: null,
    flag: null,
    sources: [S.iceyeIhiMou],
  },
  iceyeIhiContract: {
    id: "iceye-claim-3",
    type: "agreement",
    entity: E.iceye,
    label: "Procurement contract with IHI Corporation",
    date: "2025-10-16",
    dateKind: "event_date",
    value: null,
    units: null,
    valueIsProgrammeCeiling: false,
    instrument: null,
    parties: [
      { entity: E.iceye, role: null },
      { entity: E.ihi, role: null },
    ],
    origin: "derived",
    claim: CLAIM.iceyeIhiContract,
    publicBasis: null,
    flag: null,
    sources: [S.iceyeIhiContractA, S.iceyeIhiContractB],
  },
  kuvaIhiMou: {
    id: "kuva-claim-4",
    type: "agreement",
    entity: E.kuva,
    label: "Memorandum of understanding with IHI Corporation",
    date: "2026",
    dateKind: "reported_on",
    value: null,
    units: null,
    valueIsProgrammeCeiling: false,
    instrument: null,
    parties: [
      { entity: E.kuva, role: null },
      { entity: E.ihi, role: null },
    ],
    origin: "derived",
    claim: CLAIM.kuvaIhiMou,
    publicBasis: null,
    flag: null,
    sources: [S.kuvaIhiA, S.kuvaIhiB],
  },
  kuvaPuybarbe: {
    id: "kuva-claim-6",
    type: "agreement",
    entity: E.kuva,
    label: "Commercial pilot with CHATEAU PUYBARBE",
    date: "2026-03-19",
    dateKind: "announcement_date",
    value: null,
    units: null,
    valueIsProgrammeCeiling: false,
    instrument: null,
    parties: [
      { entity: E.kuva, role: null },
      { entity: E.puybarbe, role: null },
    ],
    origin: "derived",
    claim: CLAIM.kuvaPuybarbe,
    publicBasis: null,
    flag: null,
    sources: [S.kuvaPuybarbe],
  },

  waymapGrant: {
    id: "0e25b560-07c3-555c-86a5-bb27e7316e94",
    type: "public_money",
    entity: E.waymap,
    label: "Grant from Innovate UK",
    date: "2021-11-01",
    dateKind: "event_date",
    value: 223111,
    units: "GBP",
    valueIsProgrammeCeiling: false,
    instrument: "GRANT",
    parties: [
      { entity: E.innovateUk, role: "GRANTOR" },
      { entity: E.waymap, role: "ISSUER" },
    ],
    origin: "native",
    claim: null,
    publicBasis: { basis: `Grantor in UK Research and Innovation's register, gtr.ukri.org. ${OURS}`, ours: true },
    flag: null,
    sources: [S.waymapGrant, S.waymapNews],
  },
  trustnxtGrant: {
    id: "f64927eb-8545-51bd-8568-203fc5588937",
    type: "financing",
    entity: E.trustnxt,
    label: "Grant from IFB Innovationsstarter GmbH",
    date: "2024-12-19",
    dateKind: "announcement_date",
    value: null,
    units: null,
    valueIsProgrammeCeiling: false,
    instrument: "GRANT",
    parties: [
      { entity: E.ifb, role: "GRANTOR" },
      { entity: E.trustnxt, role: "ISSUER" },
    ],
    origin: "native",
    claim: null,
    publicBasis: null,
    flag: null,
    sources: [S.trustnxtGrant],
  },
  katanaGrant: {
    id: "55019305-51c2-5fb1-9d8b-976a1308ca1c",
    type: "public_money",
    entity: E.katana,
    label: "Grant from the European Commission",
    date: "2019-01-23",
    dateKind: "event_date",
    value: 50000,
    units: "EUR",
    valueIsProgrammeCeiling: false,
    instrument: "GRANT",
    parties: [
      { entity: E.ecDigital, role: "GRANTOR" },
      { entity: E.katana, role: "ISSUER" },
    ],
    origin: "native",
    claim: null,
    publicBasis: { basis: `Grantor in the EU's project register, cordis.europa.eu. ${OURS}`, ours: true },
    flag: null,
    sources: [S.katanaGrant],
  },
} as const satisfies Record<string, Signal>;

// ---------------------------------------------------------------------------
// Dossiers: what the store holds on one entity, for the drawer and the intake.
// ---------------------------------------------------------------------------

const property = (name: string, value: string, ...sources: SourceRef[]) => ({ name, value, sources });

const listed = (ref: EntityRef, sources: SourceRef[], note: string): Dossier => ({
  entity: ref,
  properties: [property("seen_in", note, ...sources)],
  signals: [],
  unresolvedClaims: [],
  possibleDuplicates: [],
  readInFull: false,
  fetchedAt: null,
});

const DOSSIERS: Dossier[] = [
  {
    entity: E.redpine,
    properties: [
      property("legal_name", "Redpine Technology AB", S.gleifRedpine),
      property("headquarters_address", "Stockholm, Sweden", S.redpineAbout),
      property("funding_stage", "SEED", S.euStartupsRedpine, S.tnwRedpine),
      property("industry", "ai", S.redpineLinkedin),
      property("total_funding", "EUR 9,000,000", S.tnwRedpine, S.tfnRedpine),
      property("founding_date", "2024-10-10", S.gleifRedpine),
      property("website", "redpine.ai", S.redpineSite),
      property(
        "investors",
        "NORDICNINJA VC LIMITED, Luminar Ventures, node.vc and seven individuals",
        S.euStartupsRedpine,
        S.tfnRedpine,
        S.arcticRedpine,
      ),
      property("event", "Listed by Cala as an attendee of Slush 2026", S.slush),
    ],
    signals: [SIGNAL.redpineSeed, SIGNAL.vinnova],
    unresolvedClaims: [],
    possibleDuplicates: [
      {
        entity: entity("ffc9399d-04d8-4e3e-afc1-dd64e3fb652b", "Redpine", "Company"),
        basis: "Cala's knowledge answer resolved the name “Redpine Technology AB” to this second ID. Not joined.",
      },
    ],
    readInFull: true,
    fetchedAt: FETCHED.redpine,
  },
  {
    entity: E.luminar,
    properties: [
      property("website", "luminarventures.com", S.luminarProfile),
      property("headquarters", "Sweden", S.fiban),
      property("industry", "VENTURE_CAPITAL", S.luminarProfile),
      property(
        "portfolio",
        "41 investment ties. 17 participations carry a role: INVESTOR in 9 funding rounds and 8 financing events",
        S.luminarPortfolio,
      ),
      property("fund", "“Luminar Ventures closes second fund at €65M, focusing on AI and fintech in the Nordics” (source title)", S.luminarFund),
      property(
        "backers",
        "Saminvest AB is INVESTOR in two of its fund closings, 2018 and 2023. The European Investment Fund is listed as a tie, direction not settled",
        S.luminarFund,
      ),
    ],
    signals: [],
    unresolvedClaims: [],
    possibleDuplicates: [],
    readInFull: true,
    fetchedAt: FETCHED.luminar,
  },
  {
    entity: E.photoncycle,
    properties: [
      property("legal_name", "Photoncycle AS", S.photoncycleSite),
      property("headquarters_address", "Oslo, Norway", S.photoncycleLinkedin),
      property("funding_stage", "SERIES_A", S.euStartupsPhotoncycle),
      property("industry", "energy", S.photoncycleLinkedin),
      property("total_funding", "NOK 40,940,657", S.brregEnova),
      property("founding_date", "2020-01-01", S.photoncycleLinkedin),
      property("event", "Listed by Cala as an attendee of Slush 2026", S.slush),
    ],
    signals: [SIGNAL.enova, SIGNAL.photoncycleSeriesA, SIGNAL.innovationNorway],
    unresolvedClaims: [],
    possibleDuplicates: [],
    readInFull: true,
    fetchedAt: FETCHED.photoncycle,
  },
  {
    ...listed(E.nordicninja, [S.euStartupsRedpine, S.tracxnPhotoncycle], "The investor lists of Redpine Technology AB and Photoncycle"),
  },
  { ...listed(E.nodevc, [S.tfnRedpine, S.tnwRedpine], "The investor list of Redpine Technology AB") },
  {
    ...listed(E.enova, [S.brregEnova], "One grant round of Photoncycle, as GRANTOR"),
    signals: [SIGNAL.enova],
  },
  {
    ...listed(E.innovationNorway, [S.brregInnovationA, S.brregInnovationB], "One grant round of Photoncycle, as GRANTOR"),
    signals: [SIGNAL.innovationNorway],
  },
  {
    ...listed(E.vinnova, [S.vinnova], "One grant round of Redpine Technology AB, as GRANTOR"),
    signals: [SIGNAL.vinnova],
  },
  {
    ...listed(E.lifelineAb, [S.tnwPhotoncycle], "The investor list of Photoncycle"),
    possibleDuplicates: [
      { entity: E.lifelineOrg, basis: "Same name. Cala's search returns six Lifeline Ventures entities. Not joined." },
      {
        entity: entity(
          "111aea67-7cea-43ec-b4cd-25b1b9b6140a",
          "Lifeline Ventures Fund II Ky",
          "Company",
          "Finnish venture capital fund based in Helsinki, founded in 2014.",
        ),
        basis: "Same name stem. Not joined.",
      },
    ],
  },
  {
    ...listed(E.voimaOy, [S.voimaPortfolio], "The investor list of Photoncycle"),
    possibleDuplicates: [{ entity: E.voimaOrg, basis: "Same name, and both IDs are in Photoncycle's investor list. Not joined." }],
  },
  { ...listed(E.eviny, [S.tracxnPhotoncycle], "The investor list of Photoncycle") },

  { ...listed(E.otb, [S.otbPortfolio, S.iceyeSeriesD], "The investor list of ICEYE") },
  {
    entity: E.iceye,
    properties: [
      property("description", "Finnish aerospace and defense company founded in 2014 and headquartered in Espoo.", S.calaIceye),
      property("headquarters_address", "Maarintie 6, 02150 ESPOO, ESPOO, FI-02150, FI", S.gleifIceye),
      property("founding_date", "2014-09-04", S.gleifIceye),
      property("investors", "17 investment ties in the stored read, OTB Ventures among them", S.otbPortfolio),
    ],
    signals: [SIGNAL.iceyeIhiContract, SIGNAL.iceyeIhiMou],
    unresolvedClaims: [
      { claim: CLAIM.iceyeSpock, sources: [S.iceyeSpock] },
      { claim: CLAIM.iceyeFinland, sources: [S.iceyeFinland] },
    ],
    possibleDuplicates: [],
    readInFull: true,
    fetchedAt: FETCHED.iceye,
  },
  {
    ...listed(E.ihi, [S.iceyeIhiMou, S.kuvaIhiA], "Cala's knowledge answers for ICEYE and Kuva Space, under one ID"),
    signals: [SIGNAL.iceyeIhiContract, SIGNAL.iceyeIhiMou, SIGNAL.kuvaIhiMou],
  },
  {
    entity: E.kuva,
    properties: [property("event", "Listed by Cala as an attendee of Slush 2026", S.slush)],
    signals: [SIGNAL.kuvaIhiMou, SIGNAL.kuvaPuybarbe],
    unresolvedClaims: [
      { claim: CLAIM.kuvaNasa, sources: [S.kuvaNasaA, S.kuvaNasaB] },
      { claim: CLAIM.kuvaSyke, sources: [S.kuvaSyke] },
    ],
    possibleDuplicates: [],
    readInFull: false,
    fetchedAt: FETCHED.kuvaProbe,
  },
  {
    entity: E.waymap,
    properties: [
      property("headquarters_address", "London, United Kingdom", S.waymapLinkedin),
      property("funding_stage", "SERIES_B", S.waymapFiling),
      property("industry", "SOFTWARE_AND_SERVICES", S.waymapRegister),
      property("event", "Listed by Cala as an attendee of Slush 2026", S.slush),
    ],
    signals: [SIGNAL.waymapGrant],
    unresolvedClaims: [],
    possibleDuplicates: [],
    readInFull: true,
    fetchedAt: FETCHED.cohort,
  },
  {
    entity: E.trustnxt,
    properties: [
      property("headquarters_address", "Esplanade 40, 20354 Hamburg, Germany", S.trustnxtLegal),
      property("funding_stage", "PRE_SEED", S.trustnxtRound),
      property("industry", "cyber", S.trustnxtLinkedin),
      property("event", "Listed by Cala as an attendee of Slush 2026", S.slush),
    ],
    signals: [SIGNAL.trustnxtGrant],
    unresolvedClaims: [],
    possibleDuplicates: [],
    readInFull: true,
    fetchedAt: FETCHED.cohort,
  },
  {
    entity: E.katana,
    properties: [
      property("headquarters_address", "Tallinn, Estonia", S.katanaAbout),
      property("funding_stage", "SERIES_B", S.katanaRound),
      property("industry", "manufacturingMaterials", S.katanaLinkedin),
      property("event", "Listed by Cala as an attendee of Slush 2026", S.slush),
    ],
    signals: [SIGNAL.katanaGrant],
    unresolvedClaims: [],
    possibleDuplicates: [],
    readInFull: true,
    fetchedAt: FETCHED.cohort,
  },
  { ...listed(E.corsmed, [S.luminarPortfolio, S.corsmedSeed], "The portfolio list of Luminar Ventures") },
];

export const DOSSIER = new Map(DOSSIERS.map((dossier) => [dossier.entity.id, dossier]));

/** A dossier for an entity the store has only a name for. */
export function emptyDossier(ref: EntityRef): Dossier {
  return {
    entity: ref,
    properties: [],
    signals: [],
    unresolvedClaims: [],
    possibleDuplicates: [],
    readInFull: false,
    fetchedAt: null,
  };
}

// ---------------------------------------------------------------------------
// The names the intake can find. Search results are the saved ones, duplicates
// included, because telling them apart is the customer's call.
// ---------------------------------------------------------------------------

const match = (ref: EntityRef, stored: boolean, slushAttendee: boolean): EntityMatch => ({ ...ref, stored, slushAttendee });

export const CATALOGUE: EntityMatch[] = [
  match(E.redpine, true, true),
  match(E.photoncycle, true, true),
  match(E.kuva, false, true),
  match(E.waymap, true, true),
  match(E.trustnxt, true, true),
  match(E.katana, true, true),
  match(E.corsmed, false, true),
  match(E.calaAi, true, true),
  match(E.iceye, true, false),
  match(E.luminar, true, false),
  match(E.otb, false, false),
  match(E.nordicninja, false, false),
  match(E.nodevc, false, false),
  match(E.saminvest, true, false),
  match(E.lifelineAb, false, false),
  match(E.lifelineOrg, false, false),
  match(
    entity(
      "111aea67-7cea-43ec-b4cd-25b1b9b6140a",
      "Lifeline Ventures Fund II Ky",
      "Company",
      "Finnish venture capital fund based in Helsinki, founded in 2014.",
    ),
    false,
    false,
  ),
  match(
    entity("912e9dc4-796a-4694-ae51-679ef378a953", "LIFELINE VENTURES SPV", "Company", "A company whose fiscal year ends on December 31."),
    false,
    false,
  ),
  match(
    entity(
      "503fca19-dcb6-4f69-9834-b2fa4f6debdf",
      "Lifeline Ventures III AB",
      "Company",
      "Swedish company incorporated in 2011 and headquartered in Stockholm.",
    ),
    false,
    false,
  ),
  match(
    entity(
      "16055086-7d3a-4990-a5e4-422333413419",
      "Lifeline Ventures Fund VI SCSp",
      "Company",
      "a Luxembourg-based venture capital fund incorporated in 2025",
    ),
    false,
    false,
  ),
  match(
    entity(
      "3b0499bc-3c7e-4d50-aee5-42de34a5f8d0",
      "Business Finland Oy",
      "Company",
      "Finnish government agency headquartered in Helsinki that promotes trade, investment and innovation for Finnish companies, founded in 2015.",
    ),
    true,
    false,
  ),
  match(
    entity(
      "d5b41639-eb27-43df-a6ee-a4f03807fbca",
      "Business Finland",
      "Organization",
      "Finnish government agency that funds and promotes innovation and export activities.",
    ),
    true,
    false,
  ),
  match(
    entity(
      "41c754b1-029c-4087-b456-920d3c67ae0e",
      "Business Finland Venture Capital",
      "Company",
      "Finnish government agency's venture capital arm investing in early-stage VC funds.",
    ),
    false,
    false,
  ),
];

/** What the mock reports about the store as a whole: the saved files, counted. */
export const STORE = {
  rosterSize: 2988,
  entitiesReadInFull: 17,
  hubsRead: 10,
  probesStored: 3,
} as const;

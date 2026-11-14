/**
 * A ledger that replays the saved evidence, for building and showing the surfaces before the real
 * one exists (BOOKRUNNER_MOCK=1). It keeps mandates in memory, sends nothing to Cala, and plays
 * each research pass back on a clock so that every state of the Desk can be reached and watched.
 */
import { randomUUID } from "node:crypto";

import {
  NotFoundError,
  type Book,
  type BookRow,
  type Brief,
  type Constraints,
  type Coverage,
  type EntityRef,
  type EvidenceBundle,
  type Ledger,
  type Mandate,
  type MandateStage,
  type Packet,
  type Statement,
  type Trail,
  type WorkEvent,
  type WorkResult,
} from "@fundraising/package-ledger";

import { CATALOGUE, DOSSIER, E, FETCHED, STORE, emptyDossier } from "@/lib/mock/evidence";
import { SCRIPTS, coldScript, scriptFor, type Script, type ScriptKey } from "@/lib/mock/scripts";
import { validateSections } from "@/lib/mock/validate";

type Extra = Omit<WorkEvent, "id" | "mandateId">;

/** A search match without its search-only flags. */
const toRef = ({ id, name, entityType, description }: EntityRef): EntityRef => ({ id, name, entityType, description });

type Entry = {
  mandate: Mandate;
  key: ScriptKey;
  script: Script;
  startedAt: number;
  /** A frozen moment of the script, in seconds. Null lets the clock run. */
  pinned: number | null;
  /** Makes the evidence look this many hours older, to reach the stale state. */
  agedHours: number;
  stage: MandateStage | null;
  packets: Packet[];
  extras: Extra[];
};

type Store = { mandates: Map<string, Entry> };

// Pages, route handlers and the proxy may each load this module, so the state hangs off the
// process and survives a hot reload.
const scope = globalThis as typeof globalThis & { __bookrunnerMock?: Store };
const store = (scope.__bookrunnerMock ??= { mandates: new Map() });

/** How many script seconds pass per real second. */
const speed = () => Number(process.env.BOOKRUNNER_MOCK_SPEED) || 1;

const iso = (ms: number) => new Date(ms).toISOString();

function elapsed(entry: Entry) {
  if (entry.pinned !== null) return entry.pinned;

  return Math.min(((Date.now() - entry.startedAt) / 1000) * speed(), entry.script.length + 1);
}

/** The real moment a script second falls on, for this mandate. */
const moment = (entry: Entry, at: number) => iso(entry.startedAt + (at * 1000) / speed());

function owned(mandateId: string, ownerId: string): Entry {
  const entry = store.mandates.get(mandateId);

  if (!entry || entry.mandate.ownerId !== ownerId) throw new NotFoundError("No such mandate.");

  return entry;
}

function stageOf(entry: Entry): MandateStage {
  if (entry.stage) return entry.stage;

  const now = elapsed(entry);
  let stage: MandateStage = "brief_received";

  for (const step of entry.script.steps) {
    if ("stage" in step && step.at <= now) stage = step.stage;
  }

  return stage;
}

function eventsOf(entry: Entry): WorkEvent[] {
  const now = elapsed(entry);
  const labels: Record<MandateStage, string> = {
    brief_received: "Brief received",
    researching: "Researching",
    challenging: "Challenging",
    ready: "Ready for your decision",
    delivered: "Delivered",
  };

  const scripted: Extra[] = entry.script.steps
    .filter((step) => step.at <= now)
    .map((step) => {
      if ("stage" in step) {
        return { at: moment(entry, step.at), kind: "stage", message: labels[step.stage], seconds: null, entity: null, fromStore: false };
      }

      const { until, ...event } = step.event;

      // A step still in flight has no duration yet.
      return { ...event, at: moment(entry, step.at), seconds: until !== undefined && until > now ? null : event.seconds };
    });

  return [...scripted, ...entry.extras]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((event, index) => ({ ...event, id: `${entry.mandate.id}:${String(index).padStart(4, "0")}`, mandateId: entry.mandate.id }));
}

function mandateOf(entry: Entry): Mandate {
  const events = eventsOf(entry);

  return { ...entry.mandate, stage: stageOf(entry), updatedAt: events.at(-1)?.at ?? entry.mandate.createdAt };
}

const excluded = (constraints: Constraints, name: string) =>
  (constraints.exclusions ?? []).some((rule) => rule.trim() && name.toLowerCase().includes(rule.trim().toLowerCase()));

function rowsOf(entry: Entry): BookRow[] {
  const now = elapsed(entry);
  const { constraints, id, revision } = entry.mandate;

  return entry.script.rows
    .filter((row) => row.at <= now)
    .filter((row) => !excluded(constraints, row.candidate.name))
    .filter((row) => constraints.includeExistingBackers !== false || row.category !== "follow_up")
    .filter((row) => constraints.includePublicFunding !== false || row.category !== "non_dilutive")
    .map(({ at, briefAt, ...row }, index) => ({
      ...row,
      id: `${id}:${row.candidate.id}`,
      mandateId: id,
      revision,
      rank: index + 1,
      hasBrief: briefAt !== undefined && Math.max(at, briefAt) <= now,
    }));
}

const shifted = (time: string, hours: number) => (hours ? iso(new Date(time).getTime() - hours * 3_600_000) : time);

function coverageOf(entry: Entry | null): Coverage {
  const latched = entry ? entry.script.latched : process.env.BOOKRUNNER_MOCK_CALA === "latched";
  const aged = entry?.agedHours ?? 0;

  return {
    ...STORE,
    rosterFetchedAt: shifted(FETCHED.roster, aged),
    cala: latched ? "latched" : "answering",
    calaCheckedAt: shifted(latched ? FETCHED.refused : FETCHED.newest, aged),
    newestFetchAt: shifted(latched ? FETCHED.grants : FETCHED.newest, aged),
  };
}

function trailsFor(entry: Entry, candidateId: string): Trail[] {
  const row = rowsOf(entry).find((candidate) => candidate.candidate.id === candidateId);

  return (row?.trailIds ?? []).map((id) => entry.script.trails[id]).filter(Boolean);
}

function briefFor(entry: Entry, candidateId: string): Brief {
  const seed = entry.script.briefs[candidateId];
  const row = rowsOf(entry).find((candidate) => candidate.candidate.id === candidateId);

  if (!seed || !row?.hasBrief) throw new NotFoundError("No brief for this candidate.");

  const { trailIds, ...brief } = seed;

  return {
    ...brief,
    mandateId: entry.mandate.id,
    revision: entry.mandate.revision,
    trails: trailIds.map((id) => entry.script.trails[id]),
  };
}

/** Everything a packet may state: the brief's lines, each hop, each signal and each conclusion. */
function bundleFor(entry: Entry, candidateId: string): EvidenceBundle {
  const brief = briefFor(entry, candidateId);
  const facts: EvidenceBundle["supportedFacts"] = [];

  for (const fit of [...brief.whyMeet, ...brief.whyHesitate]) {
    facts.push({ statement: fit.statement, kind: fit.kind, sources: fit.sources });
  }

  for (const trail of brief.trails) {
    for (const hop of trail.hops) {
      facts.push({
        statement: hop.claim ?? `${hop.from.name} and ${hop.to.name}: ${hop.role ?? "a tie with no stated role"}.`,
        kind: "observed",
        sources: hop.sources,
      });
    }

    if (trail.conclusion) facts.push({ statement: trail.conclusion.reading, kind: "inferred", sources: [] });
  }

  for (const signal of [...brief.directSignals, ...brief.trails.flatMap((trail) => (trail.signal ? [trail.signal] : []))]) {
    const amount = signal.value === null ? "" : `, ${signal.units ?? ""} ${signal.value.toLocaleString("en-GB")}`;

    facts.push({ statement: `${signal.label}${amount}, ${signal.date ?? "undated"}.`, kind: "observed", sources: signal.sources });
  }

  // The dossier's unresolved claims may be quoted with their limits, so their figures are known too.
  for (const claim of DOSSIER.get(candidateId)?.unresolvedClaims ?? []) {
    facts.push({ statement: claim.claim, kind: "observed", sources: claim.sources });
  }

  return { mandate: mandateOf(entry), brief, supportedFacts: facts };
}

/** Writes the script's first packet draft into the mandate once the pass has reached it. */
function packetsOf(entry: Entry): Packet[] {
  const seed = entry.script.packet;

  if (seed && entry.packets.length === 0 && seed.at <= elapsed(entry)) {
    entry.packets.push({
      id: randomUUID(),
      mandateId: entry.mandate.id,
      version: 1,
      candidate: seed.candidate,
      basedOnRevision: 1,
      status: "draft",
      sections: seed.sections,
      trails: trailsFor(entry, seed.candidate.id),
      withheld: seed.withheld,
      approvedAt: null,
      createdAt: moment(entry, seed.at),
    });
  }

  return entry.packets;
}

function packetOf(entry: Entry, version: number): Packet {
  const packet = packetsOf(entry).find((candidate) => candidate.version === version);

  if (!packet) throw new NotFoundError("No such packet version.");

  return packet;
}

function markdown(mandate: Mandate, packet: Packet): string {
  const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
  const sources = new Map<string, string>();

  for (const trail of packet.trails) {
    for (const item of [...trail.hops.flatMap((hop) => hop.sources), ...(trail.signal?.sources ?? [])]) {
      if (item.url) sources.set(item.url, [item.name, item.date, item.rank].filter(Boolean).join(", "));
    }
  }

  return [
    `# Meeting packet: ${packet.candidate.name}`,
    `Prepared for ${mandate.subject.name} by Cabala, Bookrunner. Version ${packet.version}, ${packet.status}${packet.approvedAt ? `, approved ${packet.approvedAt.slice(0, 10)}` : ""}.`,
    `## Why meet\n\n${packet.sections.whyMeet}`,
    `## The trail behind it\n\n${packet.sections.trail}`,
    `## Why hesitate\n\n${packet.sections.whyHesitate}`,
    `## Questions\n\n${list(packet.sections.questions)}`,
    `## Agenda\n\n${list(packet.sections.agenda)}`,
    `## Outreach draft\n\n${packet.sections.outreachDraft}`,
    `## Sources\n\n${list([...sources].map(([url, label]) => `${label}: ${url}`))}`,
    "A trail is a sourced connection, not an introduction. A signal is a reason to ask, not proof of appetite. Built with Cala.",
  ].join("\n\n");
}

function statementOf(entry: Entry): Statement {
  const events = eventsOf(entry);
  const rows = rowsOf(entry);
  const trails = new Set(rows.flatMap((row) => row.trailIds));
  const urls = new Set<string>();

  for (const row of rows) for (const fit of row.fit) for (const item of fit.sources) if (item.url) urls.add(item.url);

  for (const id of trails) {
    const trail = entry.script.trails[id];

    for (const item of [...trail.hops.flatMap((hop) => hop.sources), ...(trail.signal?.sources ?? [])]) {
      if (item.url) urls.add(item.url);
    }
  }

  return {
    reads: events.filter((event) => event.kind === "read").length,
    probes: events.filter((event) => event.kind === "probe").length,
    sourcesCited: urls.size,
    trailsFound: trails.size,
    claimsWithheld: new Set(packetsOf(entry).flatMap((packet) => packet.withheld.map((claim) => claim.sentence))).size,
    servedFromStore: events.filter((event) => event.fromStore).length,
  };
}

/** What a research pass reports, read off the replay as it stands. No request is ever sent. */
function passOf(entry: Entry): WorkResult {
  const rows = rowsOf(entry);

  return {
    mandate: mandateOf(entry),
    requestsUsed: 0,
    trailsFound: new Set(rows.flatMap((row) => row.trailIds)).size,
    rows: rows.length,
    partial: rows.some((row) => row.enrichment === "queued"),
    gaps: entry.script.gaps.filter((gap) => gap.at <= elapsed(entry)).map((gap) => gap.text),
  };
}

function note(entry: Entry, kind: WorkEvent["kind"], message: string) {
  entry.extras.push({ at: iso(Date.now()), kind, message, seconds: null, entity: null, fromStore: false });
}

function create(input: { ownerId: string; role: Mandate["role"]; subjectId: string; constraints: Constraints }): Entry {
  const subject = CATALOGUE.find((candidate) => candidate.id === input.subjectId);

  if (!subject) throw new NotFoundError("No such entity.");

  const key = scriptFor(subject.id);
  const ref = toRef(subject);
  const now = iso(Date.now());

  const entry: Entry = {
    mandate: {
      id: randomUUID(),
      ownerId: input.ownerId,
      role: input.role,
      subject: ref,
      constraints: input.constraints,
      revision: 1,
      stage: "brief_received",
      sessionId: null,
      createdAt: now,
      updatedAt: now,
    },
    key,
    script: key === "cold" ? coldScript(input.role, ref, subject.stored) : SCRIPTS[key],
    startedAt: Date.now(),
    pinned: null,
    agedHours: 0,
    stage: null,
    packets: [],
    extras: [],
  };

  store.mandates.set(entry.mandate.id, entry);

  return entry;
}

const OPEN: Constraints = {
  stages: null,
  sectors: null,
  geographies: null,
  exclusions: null,
  includeExistingBackers: true,
  includePublicFunding: true,
  notes: null,
};

/** The moments of a mandate that have a name, so each state of the Desk has one address. */
export const SCENARIOS = [
  "founder-brief",
  "founder-researching",
  "founder-challenging",
  "founder-ready",
  "founder-revised",
  "founder-delivered",
  "founder-stale",
  "investor-researching",
  "investor-outage",
  "investor-stale",
  "cold-queued",
] as const;

export type Scenario = (typeof SCENARIOS)[number];

/** Creates a mandate for this guest, frozen at the named moment, and returns its ID. */
export async function seedScenario(ownerId: string, scenario: Scenario): Promise<string> {
  const ledger = createMockLedger();
  const [who, when] = scenario.split("-") as [string, string];

  const subject = who === "founder" ? E.redpine : who === "investor" ? E.otb : E.calaAi;
  const entry = create({
    ownerId,
    role: who === "investor" ? "investor" : "founder",
    subjectId: subject.id,
    constraints:
      who === "founder"
        ? { ...OPEN, stages: ["Series A"], sectors: ["ai"], geographies: ["Nordics"], notes: "Raising a Series A in the first half of 2027." }
        : { ...OPEN, stages: ["Seed", "Series A"], sectors: ["space", "dual use"], geographies: ["Europe"] },
  });

  const { id } = entry.mandate;
  const at: Record<string, number> = { brief: 1, researching: who === "founder" ? 20 : 9, challenging: 45, queued: 9 };

  entry.pinned = at[when] ?? entry.script.length;
  // A frozen pass is one that already happened: its events end now instead of starting now.
  entry.startedAt = Date.now() - (entry.pinned * 1000) / speed();

  if (when === "stale") {
    entry.agedHours = 72;
    entry.startedAt -= 72 * 3_600_000;
  }

  if (when === "revised") {
    await ledger.setConstraints(id, ownerId, { ...entry.mandate.constraints, includePublicFunding: false });
  }

  if (when === "delivered") {
    await ledger.approvePacket(id, ownerId, 1);
    await ledger.setStage(id, ownerId, "delivered");
  }

  return id;
}

export function createMockLedger(): Ledger {
  return {
    async findEntity(name, options = {}) {
      const query = name.trim().toLowerCase();

      if (query.length < 2) return [];

      return CATALOGUE.filter((candidate) => candidate.name.toLowerCase().includes(query))
        .filter((candidate) => !options.types?.length || options.types.includes(candidate.entityType))
        .slice(0, options.limit ?? 8);
    },

    async getDossier(entityId) {
      const known = DOSSIER.get(entityId);

      if (known) return known;

      const listed = CATALOGUE.find((candidate) => candidate.id === entityId);

      if (!listed) throw new NotFoundError("No such entity.");

      return emptyDossier(toRef(listed));
    },

    async getCoverage() {
      return coverageOf(null);
    },

    async createMandate(input) {
      return mandateOf(create(input));
    },

    async getMandate(mandateId, ownerId) {
      return mandateOf(owned(mandateId, ownerId));
    },

    async listMandates(ownerId) {
      return [...store.mandates.values()]
        .filter((entry) => entry.mandate.ownerId === ownerId)
        .map(mandateOf)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async attachSession(mandateId, ownerId, sessionId) {
      const entry = owned(mandateId, ownerId);

      entry.mandate = { ...entry.mandate, sessionId };

      return mandateOf(entry);
    },

    async setStage(mandateId, ownerId, stage) {
      const entry = owned(mandateId, ownerId);

      entry.stage = stage;
      note(entry, "stage", stage === "delivered" ? "Delivered" : `Stage set: ${stage}`);

      return mandateOf(entry);
    },

    async setConstraints(mandateId, ownerId, constraints) {
      const entry = owned(mandateId, ownerId);

      entry.mandate = { ...entry.mandate, constraints, revision: entry.mandate.revision + 1 };
      note(entry, "book", `Criteria revised: the Book was reranked from the store, with no new reads (revision ${entry.mandate.revision})`);

      return this.readBook(mandateId, ownerId);
    },

    async workMandate(mandateId, ownerId) {
      return passOf(owned(mandateId, ownerId));
    },

    // The mock sends nothing to Cala, so reading around an entity finds what the replay already holds.
    async readAround(mandateId, ownerId) {
      return passOf(owned(mandateId, ownerId));
    },

    async proposeProbes(mandateId, ownerId) {
      owned(mandateId, ownerId);

      return [];
    },

    async checkSignals(mandateId, ownerId) {
      owned(mandateId, ownerId);

      return [];
    },

    async readBook(mandateId, ownerId): Promise<Book> {
      const entry = owned(mandateId, ownerId);

      return {
        mandate: mandateOf(entry),
        rows: rowsOf(entry),
        coverage: coverageOf(entry),
        gaps: entry.script.gaps.filter((gap) => gap.at <= elapsed(entry)).map((gap) => gap.text),
      };
    },

    async getTrails(mandateId, ownerId, candidateId) {
      return trailsFor(owned(mandateId, ownerId), candidateId);
    },

    async getBrief(mandateId, ownerId, candidateId) {
      return briefFor(owned(mandateId, ownerId), candidateId);
    },

    async saveConclusions(mandateId, ownerId) {
      owned(mandateId, ownerId);
    },

    async getEvidenceBundle(mandateId, ownerId, candidateId) {
      return bundleFor(owned(mandateId, ownerId), candidateId);
    },

    async validatePacket(bundle, sections) {
      return validateSections(bundle, sections);
    },

    async savePacket({ mandateId, ownerId, candidateId, sections, withheld }) {
      const entry = owned(mandateId, ownerId);
      const packets = packetsOf(entry);
      const candidate = briefFor(entry, candidateId).candidate;

      for (const packet of packets) packet.status = "superseded";

      const packet: Packet = {
        id: randomUUID(),
        mandateId,
        version: packets.length + 1,
        candidate,
        basedOnRevision: entry.mandate.revision,
        status: "draft",
        sections,
        trails: trailsFor(entry, candidateId),
        withheld,
        approvedAt: null,
        createdAt: iso(Date.now()),
      };

      packets.push(packet);
      note(
        entry,
        withheld.length ? "withheld" : "note",
        `Packet version ${packet.version} saved${withheld.length ? `: ${withheld.length} ${withheld.length === 1 ? "claim" : "claims"} withheld` : ""}`,
      );

      return packet;
    },

    async approvePacket(mandateId, ownerId, version) {
      const entry = owned(mandateId, ownerId);
      const packet = packetOf(entry, version);

      if (packet.status === "superseded") throw new Error("A newer version exists. Approve that one instead.");

      packet.status = "approved";
      packet.approvedAt = iso(Date.now());
      note(entry, "note", `Packet version ${version} approved`);

      return packet;
    },

    async getPacket(mandateId, ownerId, version) {
      return packetOf(owned(mandateId, ownerId), version);
    },

    async listPackets(mandateId, ownerId) {
      return [...packetsOf(owned(mandateId, ownerId))];
    },

    async exportPacket(mandateId, ownerId, version) {
      const entry = owned(mandateId, ownerId);

      return markdown(mandateOf(entry), packetOf(entry, version));
    },

    async logWork(mandateId, event) {
      const entry = store.mandates.get(mandateId);

      if (!entry) throw new NotFoundError("No such mandate.");

      entry.extras.push({ ...event, at: iso(Date.now()) });

      return eventsOf(entry).at(-1)!;
    },

    async listWorkEvents(mandateId, ownerId, afterId) {
      const events = eventsOf(owned(mandateId, ownerId));

      return afterId ? events.filter((event) => event.id > afterId) : events;
    },

    async getStatement(mandateId, ownerId) {
      return statementOf(owned(mandateId, ownerId));
    },
  };
}

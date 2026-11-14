import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  type Book,
  type BookRow,
  type Brief,
  type Conclusion,
  type Constraints,
  type Coverage,
  type Dossier,
  type EvidenceBundle,
  type Ledger,
  type Mandate,
  NotFoundError,
  type Packet,
  type PacketSections,
  type Trail,
  type WithheldClaim,
  type WorkEvent,
} from "@fundraising/package-ledger";

import {
  DOSSIER_EXTRAS,
  ENTITIES,
  FETCHED_AT,
  PROBED_ON,
  READ_IN_FULL,
  SCENARIOS,
  SIGNALS,
  SLUSH_ATTENDEES,
  type Scenario,
  type SeedRow,
} from "./seed";

/**
 * Mandate IDs the fake answers without createMandate: `fake-founder-redpine` and
 * `fake-investor-otb`, each with an optional `-<suffix>` so that parallel runs get their own copy.
 * `fake-ready-…` starts with the research already done and, for the investor case, a draft packet.
 * A copy belongs to the first guest who opens it.
 */
const TEMPLATE = /^fake-(ready-)?(founder-redpine|investor-otb)(?:-[\w-]+)?$/;

/**
 * Where the fake keeps its mandates between processes. `eve dev` starts a fresh process on every
 * rebuild, and a session should not lose its mandate to that.
 */
const STATE_FILE = process.env.BOOKRUNNER_FAKE_STATE ?? ".eve/fake-ledger.json";

type Held = {
  mandate: Mandate;
  /** The seeded scenario the mandate plays out, by key; null for a subject the seed does not cover. */
  scenario: string | null;
  worked: boolean;
  conclusions: Record<string, Conclusion>;
  packets: Packet[];
  /** Work-log lines; a line written with a key is not written twice. */
  events: (WorkEvent & { key?: string })[];
};

type State = { serial: number; held: Record<string, Held> };

/** Milliseconds a pass waits before each line it logs, so that a run can be watched or interrupted. */
const DELAY_MS = Number(process.env.BOOKRUNNER_FAKE_DELAY_MS ?? 0);

function load(): State {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
  } catch {
    // An unreadable file is the same as none: the fake starts empty.
  }

  return { serial: 0, held: {} };
}

const TEXT_SECTIONS = ["whyMeet", "trail", "whyHesitate", "outreachDraft", "privateNotes"] as const;

/** An amount as prose writes it, such as "$476 million", "NOK 14,376,817" or "€15M". */
const AMOUNT = /(?:[$€£]|\b(?:NOK|SEK|EUR|USD|GBP)\s?)\d[\d,.]*(?:\s?(?:million|billion|m|bn))?/gi;

function sentencesOf(text: string) {
  return text.match(/[^.!?\n]+[.!?]*/g)?.map((each) => each.trim()).filter(Boolean) ?? [];
}

function digits(amount: string) {
  return amount.replace(/[^\d]/g, "");
}

export function createFakeLedger(): Ledger {
  const state = load();
  const held = new Map(Object.entries(state.held));

  const now = () => new Date().toISOString();
  const nextId = (prefix: string) => `${prefix}-${++state.serial}`;
  const scenarioOf = (entry: Held) => SCENARIOS.find((each) => each.key === entry.scenario) ?? null;

  function persist() {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ serial: state.serial, held: Object.fromEntries(held) }));
  }

  function log(mandateId: string, event: Omit<WorkEvent, "id" | "mandateId" | "at"> & { key?: string }) {
    const events = held.get(mandateId)?.events;
    const written = event.key ? events?.find((each) => each.key === event.key) : undefined;

    if (written) return written;

    const entry = { ...event, id: nextId("event"), mandateId, at: now() };

    events?.push(entry);

    return entry;
  }

  function open(mandateId: string, ownerId: string) {
    let entry = held.get(mandateId);
    const template = TEMPLATE.exec(mandateId);

    if (!entry && template) {
      const scenario = SCENARIOS.find((each) => each.key === template[2])!;

      entry = start(mandateId, ownerId, scenario, scenario.constraints);

      if (template[1]) prepare(entry);
    }

    if (!entry || entry.mandate.ownerId !== ownerId) throw new NotFoundError(`No mandate ${mandateId}.`);

    return entry;
  }

  function start(mandateId: string, ownerId: string, scenario: Scenario | null, constraints: Constraints) {
    const subject = scenario?.subject ?? ENTITIES[0]!;
    const entry: Held = {
      mandate: {
        id: mandateId,
        ownerId,
        role: scenario?.role ?? "founder",
        subject,
        constraints,
        revision: 1,
        stage: "brief_received",
        sessionId: null,
        createdAt: now(),
        updatedAt: now(),
      },
      scenario: scenario?.key ?? null,
      worked: false,
      conclusions: {},
      packets: [],
      events: [],
    };

    held.set(mandateId, entry);

    return entry;
  }

  /** Puts a copy where a finished first pass would leave it, for runs that start mid-mandate. */
  function prepare(entry: Held) {
    entry.worked = true;
    entry.mandate.stage = "ready";

    const first = scenarioOf(entry)?.rows.find((row) => row.brief && row.trails.length > 0);

    if (entry.scenario !== "investor-otb" || !first) return;

    const candidate = first.candidate.name;

    entry.packets.push({
      id: nextId("packet"),
      mandateId: entry.mandate.id,
      version: 1,
      candidate: first.candidate,
      basedOnRevision: entry.mandate.revision,
      status: "draft",
      sections: {
        whyMeet:
          `${candidate} signed a memorandum of understanding with IHI Corporation in mid-2026. IHI Corporation also ` +
          "signed a memorandum of understanding with ICEYE on 22 May 2025, and Cala lists a tie between OTB Ventures and ICEYE.",
        trail:
          "OTB Ventures is tied to ICEYE (undirected, from OTB's portfolio page). ICEYE and IHI Corporation signed a " +
          `memorandum of understanding on 22 May 2025. IHI Corporation and ${candidate} signed one in mid-2026. ` +
          "Both agreements are reported by Cala from the documents it cites.",
        whyHesitate:
          "The agreement is a memorandum with no disclosed amount. The NASA award names Kuva US Inc., and its " +
          "$476 million figure is the ceiling of the whole programme.",
        questions: ["What would turn the IHI memorandum into a contract?"],
        agenda: ["The IHI memorandum and its next step", "What Kuva US Inc. has been awarded so far"],
        outreachDraft: `Hello, I would like to talk at Slush about ${candidate}'s memorandum with IHI Corporation.`,
        privateNotes: "",
      },
      trails: first.trails,
      withheld: [],
      approvedAt: null,
      createdAt: now(),
    });
  }

  /** The scenario's rows that the mandate's constraints keep, in rank order. */
  function rowsOf(entry: Held) {
    const scenario = scenarioOf(entry);

    if (!entry.worked || !scenario) return [];

    const { exclusions, includeExistingBackers, includePublicFunding } = entry.mandate.constraints;
    const excluded = (exclusions ?? []).map((each) => each.toLowerCase());

    return scenario.rows.filter(
      (row) =>
        !excluded.some((each) => row.candidate.id === each || row.candidate.name.toLowerCase().includes(each)) &&
        !(row.category === "follow_up" && includeExistingBackers === false) &&
        !(row.category === "non_dilutive" && includePublicFunding === false),
    );
  }

  function withConclusion(entry: Held, trail: Trail): Trail {
    return { ...trail, conclusion: entry.conclusions[trail.id] ?? null };
  }

  function toBookRow(entry: Held, row: SeedRow, index: number): BookRow {
    const best = row.trails[0];

    return {
      id: `${entry.mandate.id}:${row.candidate.id}`,
      mandateId: entry.mandate.id,
      revision: entry.mandate.revision,
      rank: index + 1,
      candidate: row.candidate,
      category: row.category,
      reason: row.reason,
      fit: row.fit,
      trailIds: row.trails.map((trail) => trail.id),
      bestTrail: best
        ? { pattern: best.pattern, hopCount: best.hopCount, signalLabel: best.signal?.label ?? null }
        : null,
      directFitOnly: row.directFitOnly,
      enrichment: READ_IN_FULL.has(row.candidate.id) ? "read_in_full" : "seen_in_list",
      unknowns: row.unknowns,
      hasBrief: row.brief !== null,
    };
  }

  function seedRow(entry: Held, candidateId: string) {
    const row = rowsOf(entry).find((each) => each.candidate.id === candidateId);

    if (!row) throw new NotFoundError(`No candidate ${candidateId} in this Book.`);

    return row;
  }

  function coverage(): Coverage {
    return {
      rosterSize: 2988,
      rosterFetchedAt: "2026-11-14T12:06:00+02:00",
      entitiesReadInFull: READ_IN_FULL.size,
      hubsRead: 1,
      probesStored: 3,
      // The fake never calls Cala, which is what a latched client looks like from here.
      cala: "latched",
      calaCheckedAt: FETCHED_AT,
      newestFetchAt: FETCHED_AT,
    };
  }

  function book(entry: Held): Book {
    return {
      mandate: entry.mandate,
      rows: rowsOf(entry).map((row, index) => toBookRow(entry, row, index)),
      coverage: coverage(),
      gaps: entry.worked
        ? (scenarioOf(entry)?.gaps ?? ["Nothing is stored about this subject, and Cala is not being called."])
        : ["The mandate has not been worked yet."],
    };
  }

  function brief(entry: Held, candidateId: string): Brief {
    const row = seedRow(entry, candidateId);

    if (!row.brief) throw new NotFoundError(`No brief for ${row.candidate.name}: the evidence does not carry one.`);

    return {
      mandateId: entry.mandate.id,
      revision: entry.mandate.revision,
      candidate: row.candidate,
      category: row.category,
      trails: row.trails.map((trail) => withConclusion(entry, trail)),
      ...row.brief,
    };
  }

  function exportMarkdown(packet: Packet) {
    const { sections } = packet;
    const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");

    return [
      `# Meeting packet: ${packet.candidate.name}`,
      `Version ${packet.version}, ${packet.status}${packet.approvedAt ? `, approved ${packet.approvedAt}` : ""}.`,
      `## Why meet\n\n${sections.whyMeet}`,
      `## The trail behind it\n\n${sections.trail}`,
      `## Why hesitate\n\n${sections.whyHesitate}`,
      `## Questions\n\n${list(sections.questions)}`,
      `## Agenda\n\n${list(sections.agenda)}`,
      `## Outreach draft\n\n${sections.outreachDraft}`,
    ].join("\n\n");
  }

  const ledger: Ledger = {
    async findEntity(name, options) {
      const wanted = name.trim().toLowerCase();

      return ENTITIES.filter(
        (entity) =>
          entity.name.toLowerCase().includes(wanted) &&
          (!options?.types?.length || options.types.includes(entity.entityType)),
      )
        .slice(0, options?.limit ?? 8)
        .map((entity) => ({
          ...entity,
          stored: READ_IN_FULL.has(entity.id),
          slushAttendee: SLUSH_ATTENDEES.has(entity.id),
        }));
    },

    async getDossier(entityId) {
      const entity = ENTITIES.find((each) => each.id === entityId);

      if (!entity) throw new NotFoundError(`No entity ${entityId} in the store.`);

      const dossier: Dossier = {
        entity,
        ...(DOSSIER_EXTRAS[entityId] ?? { properties: [], unresolvedClaims: [], possibleDuplicates: [] }),
        signals: SIGNALS.filter((signal) => signal.entity.id === entityId),
        readInFull: READ_IN_FULL.has(entityId),
        fetchedAt: FETCHED_AT,
      };

      return dossier;
    },

    async getCoverage() {
      return coverage();
    },

    async createMandate({ ownerId, role, subjectId, constraints }) {
      const scenario = SCENARIOS.find((each) => each.subject.id === subjectId && each.role === role) ?? null;
      const subject = ENTITIES.find((each) => each.id === subjectId);

      if (!subject) throw new NotFoundError(`No entity ${subjectId} in the store.`);

      const entry = start(nextId("mandate"), ownerId, scenario, constraints);

      entry.mandate = { ...entry.mandate, role, subject };

      return entry.mandate;
    },

    async getMandate(mandateId, ownerId) {
      return open(mandateId, ownerId).mandate;
    },

    async listMandates(ownerId) {
      return [...held.values()].map((entry) => entry.mandate).filter((mandate) => mandate.ownerId === ownerId);
    },

    async attachSession(mandateId, ownerId, sessionId) {
      const entry = open(mandateId, ownerId);

      entry.mandate = { ...entry.mandate, sessionId, updatedAt: now() };

      return entry.mandate;
    },

    async setStage(mandateId, ownerId, stage) {
      const entry = open(mandateId, ownerId);

      entry.mandate = { ...entry.mandate, stage, updatedAt: now() };

      return entry.mandate;
    },

    async setConstraints(mandateId, ownerId, constraints) {
      const entry = open(mandateId, ownerId);

      entry.mandate = {
        ...entry.mandate,
        constraints,
        revision: entry.mandate.revision + 1,
        updatedAt: now(),
      };
      log(mandateId, {
        kind: "book",
        message: `Reranked from the store for revision ${entry.mandate.revision}`,
        seconds: 0,
        entity: null,
        fromStore: true,
      });

      return book(entry);
    },

    async workMandate(mandateId, ownerId, options) {
      const entry = open(mandateId, ownerId);
      const scenario = scenarioOf(entry);

      if (!scenario) {
        log(mandateId, {
          kind: "gap",
          message: `Nothing stored about ${entry.mandate.subject.name}, and Cala is not being called`,
          seconds: null,
          entity: entry.mandate.subject,
          fromStore: true,
        });
        entry.worked = true;

        return { mandate: entry.mandate, requestsUsed: 0, trailsFound: 0, rows: 0, partial: true, gaps: book(entry).gaps };
      }

      // A pass that takes time writes its state as it goes, as the real one does.
      const step = async (event: Parameters<typeof log>[1]) => {
        if (DELAY_MS > 0) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

        log(mandateId, event);
        persist();
      };

      const onTrails = new Map(
        scenario.rows.flatMap((row) => row.trails).flatMap((trail) => trail.hops).map((hop) => [hop.to.id, hop.to]),
      );

      entry.mandate = { ...entry.mandate, stage: "researching", updatedAt: now() };
      await step({ kind: "stage", message: "Researching.", seconds: null, entity: null, fromStore: false });

      await step({
        kind: READ_IN_FULL.has(scenario.subject.id) ? "read" : "gap",
        message: READ_IN_FULL.has(scenario.subject.id)
          ? `Read ${scenario.subject.name} from the store`
          : `${scenario.subject.name} has no stored read; working from other entities' lists`,
        seconds: 0,
        entity: scenario.subject,
        fromStore: true,
      });

      for (const entity of onTrails.values()) {
        if (READ_IN_FULL.has(entity.id)) {
          await step({ kind: "read", message: `Read ${entity.name} from the store`, seconds: 0, entity, fromStore: true });
        }
      }

      for (const entityId of (options?.probeEntityIds ?? []).slice(0, 6)) {
        const proposal = scenario.proposals.find((each) => each.entity.id === entityId);

        if (!proposal) continue;

        await step({
          kind: proposal.alreadyProbedAt ? "probe" : "queued",
          message: proposal.alreadyProbedAt
            ? `Probe for ${proposal.entity.name} answered from the store`
            : `Probe for ${proposal.entity.name} queued: Cala is not answering`,
          seconds: 0,
          entity: proposal.entity,
          fromStore: true,
        });
      }

      entry.worked = true;

      const rows = rowsOf(entry);
      const trails = new Set(rows.flatMap((row) => row.trails.map((trail) => trail.id)));

      for (const row of rows) {
        for (const trail of row.trails) {
          await step({
            kind: "trail",
            message: `Trail to ${row.candidate.name}: ${trail.pattern}, ${trail.hopCount} connections`,
            seconds: null,
            entity: row.candidate,
            fromStore: true,
          });
        }
      }

      await step({ kind: "book", message: `Book ranked: ${rows.length} rows`, seconds: 0, entity: null, fromStore: true });

      entry.mandate = { ...entry.mandate, stage: "challenging", updatedAt: now() };
      await step({ kind: "stage", message: "Challenging.", seconds: null, entity: null, fromStore: false });

      return {
        mandate: entry.mandate,
        requestsUsed: 0,
        trailsFound: trails.size,
        rows: rows.length,
        partial: false,
        gaps: scenario.gaps,
      };
    },

    async readAround(mandateId, ownerId, entityId) {
      const entry = open(mandateId, ownerId);
      const entity = ENTITIES.find((each) => each.id === entityId) ?? null;
      const rows = rowsOf(entry);

      log(mandateId, {
        kind: "queued",
        message: `Reads around ${entity?.name ?? entityId} queued: Cala is not answering`,
        seconds: 0,
        entity,
        fromStore: true,
      });

      return {
        mandate: entry.mandate,
        requestsUsed: 0,
        trailsFound: 0,
        rows: rows.length,
        partial: true,
        gaps: [`Nothing new was read around ${entity?.name ?? entityId}: Cala is not answering.`],
      };
    },

    async proposeProbes(mandateId, ownerId) {
      return scenarioOf(open(mandateId, ownerId))?.proposals ?? [];
    },

    async checkSignals(mandateId, ownerId, entityIds) {
      open(mandateId, ownerId);

      for (const entityId of entityIds) {
        const entity = ENTITIES.find((each) => each.id === entityId) ?? null;
        const found = SIGNALS.filter((signal) => signal.entity.id === entityId).length;

        log(mandateId, {
          kind: "probe",
          message: found
            ? `${found} stored signals for ${entity?.name ?? entityId}`
            : `None found by Cala on ${PROBED_ON} for ${entity?.name ?? entityId}`,
          seconds: 0,
          entity,
          fromStore: true,
        });
      }

      return SIGNALS.filter((signal) => entityIds.includes(signal.entity.id));
    },

    async readBook(mandateId, ownerId) {
      return book(open(mandateId, ownerId));
    },

    async getTrails(mandateId, ownerId, candidateId) {
      const entry = open(mandateId, ownerId);

      return seedRow(entry, candidateId).trails.map((trail) => withConclusion(entry, trail));
    },

    async getBrief(mandateId, ownerId, candidateId) {
      return brief(open(mandateId, ownerId), candidateId);
    },

    async saveConclusions(mandateId, ownerId, conclusions) {
      const entry = open(mandateId, ownerId);

      for (const conclusion of conclusions) entry.conclusions[conclusion.trailId] = conclusion;
    },

    async getEvidenceBundle(mandateId, ownerId, candidateId) {
      const entry = open(mandateId, ownerId);
      const row = seedRow(entry, candidateId);
      const candidateBrief = brief(entry, candidateId);
      const bundle: EvidenceBundle = {
        mandate: entry.mandate,
        brief: candidateBrief,
        supportedFacts: [
          ...row.facts,
          ...[...candidateBrief.whyMeet, ...candidateBrief.whyHesitate].map(({ statement, kind, sources }) => ({
            statement,
            kind,
            sources,
          })),
          ...candidateBrief.trails.flatMap((trail) => (trail.signal ? [trail.signal] : [])).map((signal) => ({
            statement:
              `${signal.label} on ${signal.entity.name}` +
              (signal.value ? `: ${signal.units} ${signal.value.toLocaleString("en-US")}` : "") +
              (signal.date ? `, ${signal.dateKind} ${signal.date}` : "") +
              (signal.flag ? `. ${signal.flag}` : "."),
            kind: "observed" as const,
            sources: signal.sources,
          })),
        ],
      };

      return bundle;
    },

    async validatePacket(bundle, sections) {
      const known = new Set(
        bundle.supportedFacts.flatMap((fact) => fact.statement.match(AMOUNT) ?? []).map(digits),
      );
      const withheld: WithheldClaim[] = [];
      const cleaned: PacketSections = { ...sections };

      // The fake's one deterministic check: an amount in the prose must appear in the evidence.
      for (const key of TEXT_SECTIONS) {
        for (const sentence of sentencesOf(sections[key])) {
          const unknown = (sentence.match(AMOUNT) ?? []).find((amount) => !known.has(digits(amount)));

          if (!unknown) continue;

          withheld.push({ sentence, reason: `The amount ${unknown} is not in the evidence.`, by: "validation" });
          cleaned[key] = cleaned[key].replace(sentence, "").replace(/ {2,}/g, " ").trim();
        }
      }

      return { ok: withheld.length === 0, sections: cleaned, withheld };
    },

    async savePacket({ mandateId, ownerId, candidateId, sections, withheld }) {
      const entry = open(mandateId, ownerId);
      const row = seedRow(entry, candidateId);
      const latest = entry.packets.at(-1);

      // Saving what the latest version already holds is a retry, not an edit.
      if (
        latest?.candidate.id === candidateId &&
        JSON.stringify(latest.sections) === JSON.stringify(sections) &&
        JSON.stringify(latest.withheld) === JSON.stringify(withheld)
      ) {
        return latest;
      }

      const packet: Packet = {
        id: nextId("packet"),
        mandateId,
        version: entry.packets.length + 1,
        candidate: row.candidate,
        basedOnRevision: entry.mandate.revision,
        status: "draft",
        sections,
        trails: row.trails.map((trail) => withConclusion(entry, trail)),
        withheld,
        approvedAt: null,
        createdAt: now(),
      };
      const known = new Set(entry.packets.flatMap((each) => each.withheld.map((claim) => claim.sentence)));
      const fresh = withheld.filter((claim) => !known.has(claim.sentence));

      entry.packets = [...entry.packets.map((each) => ({ ...each, status: "superseded" as const })), packet];

      for (const [by, label] of [
        ["validation", "Validation"],
        ["second_read", "Second read"],
      ] as const) {
        const count = fresh.filter((claim) => claim.by === by).length;

        if (count === 0) continue;

        log(mandateId, {
          kind: "withheld",
          message: `${label}: ${count} ${count === 1 ? "claim" : "claims"} withheld (packet v${packet.version})`,
          seconds: null,
          entity: row.candidate,
          fromStore: false,
        });
      }

      return packet;
    },

    async approvePacket(mandateId, ownerId, version) {
      const entry = open(mandateId, ownerId);
      const packet = entry.packets.find((each) => each.version === version);

      if (!packet) throw new NotFoundError(`No packet version ${version}.`);
      if (packet.status === "superseded") throw new Error(`Version ${version} was superseded by a later edit.`);

      const approved: Packet = { ...packet, status: "approved", approvedAt: packet.approvedAt ?? now() };

      entry.packets = entry.packets.map((each) => (each.version === version ? approved : each));

      return approved;
    },

    async getPacket(mandateId, ownerId, version) {
      const packet = open(mandateId, ownerId).packets.find((each) => each.version === version);

      if (!packet) throw new NotFoundError(`No packet version ${version}.`);

      return packet;
    },

    async listPackets(mandateId, ownerId) {
      return open(mandateId, ownerId).packets;
    },

    async exportPacket(mandateId, ownerId, version) {
      const packet = open(mandateId, ownerId).packets.find((each) => each.version === version);

      if (!packet) throw new NotFoundError(`No packet version ${version}.`);

      return exportMarkdown(packet);
    },

    async logWork(mandateId, event) {
      if (!held.has(mandateId)) throw new NotFoundError(`No mandate ${mandateId}.`);

      return log(mandateId, event);
    },

    async listWorkEvents(mandateId, ownerId, afterId) {
      const { events } = open(mandateId, ownerId);
      const from = afterId ? events.findIndex((event) => event.id === afterId) + 1 : 0;

      return events.slice(from);
    },

    async getStatement(mandateId, ownerId) {
      const entry = open(mandateId, ownerId);
      const count = (kind: WorkEvent["kind"]) => entry.events.filter((event) => event.kind === kind).length;
      const rows = rowsOf(entry);
      const cited = new Set(
        rows
          .flatMap((row) => row.trails)
          .flatMap((trail) => [...trail.hops.flatMap((hop) => hop.sources), ...(trail.signal?.sources ?? [])])
          .map((source) => source.url)
          .filter(Boolean),
      );

      return {
        reads: count("read"),
        probes: count("probe"),
        sourcesCited: cited.size,
        trailsFound: new Set(rows.flatMap((row) => row.trails.map((trail) => trail.id))).size,
        claimsWithheld: new Set(entry.packets.flatMap((packet) => packet.withheld.map((claim) => claim.sentence))).size,
        servedFromStore: entry.events.filter((event) => event.fromStore && ["read", "probe"].includes(event.kind)).length,
      };
    },
  };

  // Every call may have changed something, so every call writes the state back.
  return Object.fromEntries(
    Object.entries(ledger).map(([name, method]) => [
      name,
      async (...args: unknown[]) => {
        try {
          return await (method as (...args: unknown[]) => Promise<unknown>)(...args);
        } finally {
          persist();
        }
      },
    ]),
  ) as unknown as Ledger;
}

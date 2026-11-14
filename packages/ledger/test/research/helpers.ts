import { copyFile, mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { fixtureExtractor, importFixtures } from "../../src/admin";
import { type Budget, CalaBudgetError, type CalaClient, type CalaRequest, type RawResponse } from "../../src/cala/contract";
import { requestId } from "../../src/cala/id";
import {
  type AgreementExtractor,
  CalaUnavailableError,
  type Constraints,
  type Ledger,
  type Mandate,
  NotFoundError,
  type Role,
  type WorkEvent,
} from "../../src/contract";
import type { Db } from "../../src/db";
import { createRawStore, createResearch, type IngestInput, type Research } from "../../src/research";
import { fromSavedRequest } from "../../src/research/requests";
import { memoryDb } from "../db";

export const fixtures = fileURLToPath(new URL("../../fixtures/", import.meta.url));

/** Reads saved by the Slush crawl of 2026-11-14, kept as the crawler wrote them. */
export const records = fileURLToPath(new URL("./records/", import.meta.url));

/** The day the fixtures were saved, so the 24-month signal window sits where the evidence is. */
export const NOW = new Date("2026-11-14T12:00:00Z");

export const ids = {
  redpine: "331fec23-9c63-4885-a8f5-c2902c9e1b9d",
  luminar: "be67283b-4529-4a2d-834a-96edc4b36971",
  nordicNinja: "a46a1058-93a7-4b0f-bc1f-bc31238fb006",
  photoncycle: "d5f8974b-7765-44f7-afc6-6f1767b8bad0",
  enova: "76d8c340-04bf-474a-b8c6-00c4e8438b79",
  innovationNorway: "e8203bac-13d8-5d13-ab4d-996b6657363b",
  vinnova: "63261106-7e97-4765-b212-96ee486a2e05",
  iceye: "0247c487-08b6-4e07-8e92-0969cdfeaa2d",
  ihi: "6d909137-a0a9-414c-bc93-40cbf5f6acd8",
  kuva: "41f89a61-54ac-4068-82af-a2d2096efcfc",
  nasa: "903f54b0-1bb2-406c-8bcc-9b80df792a75",
  kfund: "2c557cbb-4e37-44db-9f47-5bc327a86320",
  masia: "f2b20ea8-c011-4ee4-b038-4bee061c8145",
  calaAi: "81cfdabc-53f7-426a-b358-a942e159ca0f",
  eib: "01c894d5-9eee-4929-a536-c1626fcddb96",
  saminvest: "077d67bb-1ec0-484e-892a-4140d31af6d1",
  businessFinland: "d5b41639-eb27-43df-a6ee-a4f03807fbca",
  businessFinlandOy: "3b0499bc-3c7e-4d50-aee5-42de34a5f8d0",
};

export const noConstraints: Constraints = {
  stages: null,
  sectors: null,
  geographies: null,
  exclusions: null,
  includeExistingBackers: null,
  includePublicFunding: null,
  notes: null,
};

/** A small stand-in for the private store: mandates in memory, and the work log as an array. */
export function fakeMandates(research: () => Pick<Research, "entityRef">) {
  const mandates = new Map<string, Mandate>();
  const events: (Omit<WorkEvent, "id" | "at"> & { id: string; key?: string })[] = [];

  const api: Pick<Ledger, "getMandate" | "logWork" | "setStage"> = {
    async getMandate(mandateId, ownerId) {
      const mandate = mandates.get(mandateId);

      if (!mandate || mandate.ownerId !== ownerId) throw new NotFoundError("No such mandate.");

      return mandate;
    },

    async logWork(mandateId, event) {
      // As in the private store: a line written under a key is written once.
      const written = event.key ? events.find((line) => line.mandateId === mandateId && line.key === event.key) : undefined;
      const stored = written ?? { ...event, id: String(events.length + 1), mandateId };

      if (!written) events.push(stored);

      return { ...stored, at: NOW.toISOString() };
    },

    async setStage(mandateId, ownerId, stage) {
      const mandate = { ...(await api.getMandate(mandateId, ownerId)), stage };

      mandates.set(mandateId, mandate);

      return mandate;
    },
  };

  return {
    api,
    events,

    async create(role: Role, subjectId: string, constraints: Partial<Constraints> = {}, ownerId = "guest-1") {
      const mandate: Mandate = {
        id: `mandate-${mandates.size + 1}`,
        ownerId,
        role,
        subject: await research().entityRef(subjectId),
        constraints: { ...noConstraints, ...constraints },
        revision: 1,
        stage: "brief_received",
        sessionId: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      };

      mandates.set(mandate.id, mandate);

      return mandate;
    },

    /** What setConstraints does in the private store: new constraints, next revision. */
    revise(mandate: Mandate, constraints: Partial<Constraints>) {
      const revised = { ...mandate, constraints: { ...mandate.constraints, ...constraints }, revision: mandate.revision + 1 };

      mandates.set(mandate.id, revised);

      return revised;
    },
  };
}

/** A Cala that is latched off: it answers what the store holds and refuses everything else. */
export function storedCala(db: Db): CalaClient & { asked: CalaRequest[] } {
  const store = createRawStore(db);
  const asked: CalaRequest[] = [];

  return {
    asked,

    async request(request) {
      asked.push(request);

      const stored = await store.get(requestId(request));

      if (!stored) throw new CalaUnavailableError("Cala is latched off and the store has no answer.");

      return stored;
    },

    async status() {
      return { state: "latched", since: null, reason: "test", recentRequests: 0, queued: 0, keys: 1 };
    },

    recover: async () => false,
  };
}

type Saved = { _request?: { path?: string; body?: { input?: string } }; _seconds?: number; response?: unknown };

/**
 * A Cala that answers as if live: entity reads from the saved file of that entity whatever the
 * body, and signal probes from the saved answer whose question names the same entity. Every
 * answer counts against the budget; an entity with no saved file fails like a 404.
 */
export async function liveCala(): Promise<CalaClient & { sent: CalaRequest[] }> {
  const entities = new Map<string, Saved>();
  const probes: { name: string; saved: Saved }[] = [];
  const sent: CalaRequest[] = [];

  for (const folder of ["evidence-round-4-fable", "evidence-round-6-fable"]) {
    for (const name of (await readdir(`${fixtures}/${folder}`)).filter((file) => file.endsWith(".json")).sort()) {
      const saved = JSON.parse(await readFile(`${fixtures}/${folder}/${name}`, "utf8")) as Saved;
      const path = saved._request?.path ?? "";

      if (!saved.response) continue;

      if (path.startsWith("/entities/") && path !== "/entities/lookup" && !name.includes("bogus")) {
        entities.set(path.slice("/entities/".length), saved);
      }

      const question = saved._request?.body?.input;

      if (path === "/knowledge/search" && question) {
        probes.push({ name: /has (.+?) \(/.exec(question)?.[1] ?? question, saved });
      }
    }
  }

  return {
    sent,

    async request(request, options = {}) {
      const budget: Budget | undefined = options.budget;

      if (budget && budget.used >= budget.limit) throw new CalaBudgetError("The budget is spent.");

      let saved: Saved | undefined;

      if (request.kind === "entity") saved = entities.get(request.entityId);
      if (request.kind === "knowledge_search") saved = probes.find((probe) => request.input.includes(`has ${probe.name} `))?.saved;

      if (budget) budget.used += 1;

      sent.push(request);

      if (!saved) throw new Error("HTTP 404");

      const response: RawResponse = {
        id: requestId(request),
        request,
        status: 200,
        fetchedAt: NOW.toISOString(),
        seconds: saved._seconds ?? 0.1,
        body: saved.response,
        fromStore: false,
      };

      return response;
    },

    async status() {
      return { state: "answering", since: null, reason: null, recentRequests: sent.length, queued: 0, keys: 1 };
    },

    recover: async () => true,
  };
}

/** Ingests crawl records from test/research/records by name, as the crawl importer does. */
export async function ingestRecords(research: Pick<Research, "ingest">, names: string[]): Promise<void> {
  for (const name of names) {
    const saved = JSON.parse(await readFile(`${records}/${name}.json`, "utf8")) as {
      _request: { method?: string; path?: string; body?: unknown };
      _fetched_at: string;
      _seconds?: number;
      response: unknown;
    };
    const request = fromSavedRequest(saved._request)!;
    const input: IngestInput = {
      id: requestId(request),
      request,
      status: 200,
      fetchedAt: new Date(saved._fetched_at.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).toISOString(),
      seconds: saved._seconds ?? 0,
      body: saved.response,
      fromStore: true,
      provenance: { fixture: `records/${name}.json`, note: "Slush crawl of 2026-11-14." },
    };

    await research.ingest(input);
  }
}

/** A fixtures folder that holds the Slush roster and nothing else: the state before any research. */
export async function rosterOnly(): Promise<string> {
  const directory = await mkdtemp(`${tmpdir()}/bookrunner-roster-`);
  const folder = "evidence-round-2-fable";

  await mkdir(`${directory}/${folder}`);
  await copyFile(`${fixtures}/manifest.json`, `${directory}/manifest.json`);

  for (const name of ["slush-attendees.json", "event-slush-1000.json"]) {
    await copyFile(`${fixtures}/${folder}/${name}`, `${directory}/${folder}/${name}`);
  }

  return directory;
}

export type World = {
  db: Db;
  research: Research;
  mandates: ReturnType<typeof fakeMandates>;
  cala: CalaClient;
};

/** A store with every fixture imported, a research engine over it, and a Cala that only serves the store. */
export async function world(
  options: { cala?: (db: Db) => CalaClient; extract?: AgreementExtractor; fixtures?: "all" | "roster" } = {},
): Promise<World> {
  const db = await memoryDb();
  const cala = options.cala ? options.cala(db) : storedCala(db);
  let research: Research;
  const mandates = fakeMandates(() => research);

  research = createResearch({
    db,
    cala,
    mandates: mandates.api,
    extractAgreements: options.extract ?? (await fixtureExtractor()),
    now: () => NOW,
  });

  await importFixtures(research, options.fixtures === "roster" ? await rosterOnly() : undefined);

  return { db, research, mandates, cala };
}

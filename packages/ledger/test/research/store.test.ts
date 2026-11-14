import { afterAll, beforeAll, expect, test } from "vitest";

import { requestId } from "../../src/cala/id";
import type { Db } from "../../src/db";
import { importFixtures } from "../../src/research/fixtures";
import { ingestResponse } from "../../src/research/ingest";
import { createRawStore } from "../../src/research/raw";
import { narrowStarBody, starBody } from "../../src/research/requests";
import { memoryDb } from "../db";

const CALA_AI = "81cfdabc-53f7-426a-b358-a942e159ca0f";
const REDPINE = "331fec23-9c63-4885-a8f5-c2902c9e1b9d";

let db: Db;
let imported: { files: number; skipped: string[] };

beforeAll(async () => {
  db = await memoryDb();
  imported = await importFixtures({ ingest: async (response) => void (await ingestResponse(db, response)) });
}, 120_000);

afterAll(() => db.close());

test("the raw store keeps responses, paces reservations and holds the latch", async () => {
  const store = createRawStore(db);
  const request = { kind: "search_entities", name: "nobody" } as const;
  const response = {
    id: requestId(request),
    request,
    status: 200,
    fetchedAt: "2026-11-14T10:00:00.000Z",
    seconds: 0.2,
    body: { entities: [] },
    fromStore: false,
  };

  expect(await store.get(response.id)).toBeNull();

  await store.put(response);
  await store.put(response);

  expect(await store.get(response.id)).toEqual({ ...response, fromStore: true });

  // A later fetch of the same request is kept beside the first and becomes the answer.
  await store.put({ ...response, fetchedAt: "2026-11-14T11:00:00.000Z", body: { entities: [{ id: "x" }] } });
  expect((await store.get(response.id))?.fetchedAt).toBe("2026-11-14T11:00:00.000Z");
  expect(await db.query("select 1 from raw_responses where id = $1", [response.id])).toHaveLength(2);

  expect(await store.getLatch()).toEqual({ latched: false, since: null, reason: null });

  await store.setLatch({ latched: true, reason: "HTML 403" });

  const latched = await store.getLatch();

  expect(latched.latched).toBe(true);
  expect(latched.reason).toBe("HTML 403");

  await store.setLatch({ latched: true, reason: "HTML 403 again" });
  expect((await store.getLatch()).since).toBe(latched.since);

  await store.setLatch({ latched: false, reason: null });
  expect((await store.getLatch()).latched).toBe(false);

  // Starts on one key are a gap apart, and the eleventh waits for the first to leave the minute.
  const waits: number[] = [];

  for (let start = 0; start < 11; start += 1) waits.push(await store.reserve(7, 1000, 10));

  expect(waits[0]).toBe(0);
  expect(waits[1]).toBeGreaterThan(900);
  expect(waits[9]).toBeGreaterThan(8900);
  expect(waits[10]).toBeGreaterThan(59_000);

  // Another key has its own quota.
  expect(await store.reserve(8, 6100, 10)).toBe(0);
  expect(await store.recentStarts()).toBe(2);
});

test("request bodies built here have the IDs of the saved requests", async () => {
  const wide = await db.query<{ provenance: { fixture: string } }>("select provenance from raw_responses where id = $1", [
    requestId({ kind: "entity", entityId: CALA_AI, body: starBody }),
  ]);
  const narrow = await db.query<{ provenance: { fixture: string } }>(
    "select provenance from raw_responses where id = $1",
    [requestId({ kind: "entity", entityId: CALA_AI, body: narrowStarBody })],
  );

  expect(wide[0]?.provenance.fixture).toBe("evidence-round-6-fable/star-cala-ai-template-v2.json");
  expect(narrow[0]?.provenance.fixture).toBe("evidence-round-4-fable/star-cala-ai.json");
});

test("fixtures import with their provenance and normalize into the store", async () => {
  expect(imported.files).toBeGreaterThan(50);
  expect(imported.skipped.some((line) => line.includes("star-cala-ai-template-v2.error.json"))).toBe(true);

  const count = async (sql: string, params: unknown[] = []) =>
    (await db.query<{ n: number }>(`select count(*)::integer as n from ${sql}`, params))[0]!.n;

  expect(await count("roster where role = 'ATTENDEE'")).toBe(2988);
  expect(await count("roster where role = 'ORGANIZER'")).toBe(1);
  expect(await count("entities where read_kind = 'star'")).toBeGreaterThan(25);
  expect(await count("raw_responses where provenance is null and kind <> 'search_entities'")).toBe(0);

  const [redpine] = await db.query<{ name: string; read_kind: string; properties: Record<string, { value: unknown }> }>(
    "select name, read_kind, properties from entities where id = $1",
    [REDPINE],
  );

  expect(redpine).toMatchObject({ name: "Redpine Technology AB", read_kind: "star" });
  expect(redpine!.properties.funding_stage!.value).toBe("SEED");

  // Ten investors on Redpine's own read, each edge with its sources and whose read showed it.
  const investors = await db.query<{ sources: unknown[]; observed_direction: string }>(
    "select sources, observed_direction from edges where target_id = $1 and relationship = 'INVESTED_IN' and observed_on = $1",
    [REDPINE],
  );

  expect(investors).toHaveLength(10);
  expect(investors.every((edge) => edge.sources.length > 0 && edge.observed_direction === "incoming")).toBe(true);

  // The Vinnova grant round: both participants with roles, and the round's own fields.
  const participants = await db.query<{ role: string }>(
    "select distinct entity_id, role from participations where round_id = 'ca144fee-3a29-5e2d-bf64-aee79d46ed9a'",
  );

  expect(participants.map((row) => row.role).sort()).toEqual(["GRANTOR", "ISSUER"]);

  const [round] = await db.query("select instrument, transaction_value, transaction_value_units, event_date from rounds where id = $1", [
    "ca144fee-3a29-5e2d-bf64-aee79d46ed9a",
  ]);

  expect(round).toEqual({ instrument: "GRANT", transaction_value: 40000, transaction_value_units: "SEK", event_date: null });

  // Probe claims are stored as reported, with the passages they cite.
  const claims = await db.query<{ passages: { source: { url: string | null } }[] }>(
    "select passages from probe_claims where subject_id = '41f89a61-54ac-4068-82af-a2d2096efcfc' order by claim_index",
  );

  expect(claims).toHaveLength(7);
  expect(claims.every((claim) => claim.passages.length > 0 && claim.passages.every((passage) => passage.source.url))).toBe(true);
});

test("ingest is safe to repeat", async () => {
  const before = await db.query<{ value: number }>("select value from store_meta where key = 'ingest_seq'");
  const again = await importFixtures({ ingest: async (response) => void (await ingestResponse(db, response)) });
  const after = await db.query<{ value: number }>("select value from store_meta where key = 'ingest_seq'");

  expect(again.files).toBe(imported.files);
  expect(after).toEqual(before);
});

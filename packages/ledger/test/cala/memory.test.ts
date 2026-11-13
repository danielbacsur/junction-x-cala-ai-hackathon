import { expect, test } from "vitest";

import { createMemoryStore } from "../../src/cala/memory";

test("starts on one key keep their gap and their ceiling for a rolling minute", async () => {
  let time = 1_000_000;

  const store = createMemoryStore({ now: () => time });
  const waits: number[] = [];

  for (let start = 0; start < 5; start++) waits.push(await store.reserve(0, 2_000, 3));

  // Three starts two seconds apart, then the fourth and fifth a minute after the first and second.
  expect(waits).toEqual([0, 2_000, 4_000, 60_000, 62_000]);
  expect(await store.reserve(1, 2_000, 3)).toBe(0);
  expect(await store.recentStarts()).toBe(2);

  time += 61_000;

  // The first starts have left the minute and the last one has not come yet.
  expect(await store.recentStarts()).toBe(3);
  expect(store.starts(0)).toEqual([1_002_000, 1_004_000, 1_060_000, 1_062_000]);
  expect(await store.reserve(0, 2_000, 3)).toBe(3_000);
});

test("the latch remembers when it last changed, and a repeated refusal does not move it", async () => {
  let time = Date.parse("2026-11-14T10:41:00.000Z");

  const store = createMemoryStore({ now: () => time });

  expect(await store.getLatch()).toEqual({ latched: false, since: null, reason: null });

  await store.setLatch({ latched: true, reason: "HTML 403" });

  time += 180_000;

  await store.setLatch({ latched: true, reason: "Still 403" });

  expect(await store.getLatch()).toEqual({ latched: true, since: "2026-11-14T10:41:00.000Z", reason: "Still 403" });

  await store.setLatch({ latched: false, reason: null });

  expect(await store.getLatch()).toEqual({ latched: false, since: "2026-11-14T10:44:00.000Z", reason: null });
});

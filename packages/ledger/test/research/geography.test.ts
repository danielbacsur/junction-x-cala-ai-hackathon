import { afterAll, beforeAll, expect, test } from "vitest";

import type { Book } from "../../src/contract";
import { ids, ingestRecords, type World, world } from "./helpers";

/**
 * A stated geography is matched against every place Cala puts a candidate in, a presence as
 * much as a headquarters. The two records are reads from the Slush crawl of 2026-11-14 kept in
 * records/ as the crawler saved them: tozero, which NordicNinja and In-Q-Tel both invested in,
 * and In-Q-Tel, whose only place edge is a presence in the United States (its headquarters is a
 * street address that names no country).
 */

const IN_Q_TEL = "71086908-52f0-4e8d-829d-3fcd5b24bfd6";

let w: World;
let book: Book;

beforeAll(async () => {
  w = await world();

  await ingestRecords(w.research, ["star-tozero", "hub-in-q-tel"]);

  const mandate = await w.mandates.create("founder", ids.redpine, { geographies: ["United States"] });

  await w.research.workMandate(mandate.id, mandate.ownerId);

  book = await w.research.readBook(mandate.id, mandate.ownerId);
}, 120_000);

afterAll(() => w.db.close());

test("a candidate whose only place is a presence matches a stated geography", () => {
  const row = book.rows.find((one) => one.candidate.id === IN_Q_TEL);
  const geography = row?.fit.find((line) => line.criterion === "Geography");

  expect(row?.trailIds.length).toBeGreaterThan(0);
  expect(geography?.kind).toBe("observed");
  expect(geography?.statement).toContain("Cala places it in United States");
  expect(geography?.statement).not.toMatch(/headquarter/i);
  expect(geography?.sources.length).toBeGreaterThan(0);

  // An explicit criterion ranks first, so the one candidate that meets it leads the Book.
  expect(row?.rank).toBe(1);
});

test("a candidate with no stored place is unknown and does not match", () => {
  const unplaced = book.rows.filter((row) => row.unknowns.includes("Location is not in stored evidence."));

  expect(unplaced.length).toBeGreaterThan(0);
  expect(unplaced.every((row) => row.fit.every((line) => line.criterion !== "Geography"))).toBe(true);
});

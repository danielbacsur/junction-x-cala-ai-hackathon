import assert from "node:assert/strict";
import { test } from "node:test";

import type { Conclusion, Hop, Trail } from "@fundraising/package-ledger";

import { lintConclusion } from "./lint.ts";

const entity = (name: string) => ({ id: name, name, entityType: "Company", description: null });
const hop = (from: string, to: string, direction: Hop["direction"]) => ({ from: entity(from), to: entity(to), direction }) as Hop;

const trail = {
  id: "trail",
  hops: [
    hop("Redpine Technology AB", "Luminar Ventures", "to_funds_from"),
    hop("Luminar Ventures", "Photoncycle", "from_funds_to"),
    hop("Photoncycle", "Lifeline Ventures AB", "undirected"),
  ],
  signal: { label: "NASA CSDA award", value: 476_000_000, valueIsProgrammeCeiling: true },
} as Trail;

const clean: Conclusion = {
  trailId: "trail",
  reading: "Lifeline Ventures AB is tied to Photoncycle, a company Redpine's investor Luminar Ventures also funded.",
  because: "Luminar Ventures funded Redpine and Photoncycle; Cala lists a tie between Photoncycle and Lifeline Ventures AB.",
  doesNotProve: "It does not show that Lifeline funded Photoncycle, or that Luminar can introduce anyone.",
  ask: "Ask Luminar Ventures how Lifeline Ventures AB is connected to Photoncycle.",
};

const objectsTo = (patch: Partial<Conclusion>) => lintConclusion({ ...clean, ...patch }, trail).map((each) => each.field);

test("a conclusion that follows the rules passes, limits sentence included", () => {
  assert.deepEqual(objectsTo({}), []);
});

test("an undirected tie worded as funding is sent back", () => {
  assert.deepEqual(objectsTo({ reading: "Lifeline Ventures funded Photoncycle's Series A." }), ["reading"]);
  assert.deepEqual(objectsTo({ because: "Photoncycle's backer Lifeline Ventures AB is active." }), ["because"]);
  assert.deepEqual(objectsTo({ reading: "Lifeline, an investor in Photoncycle, is next." }), ["reading"]);
});

test("a fund's name, or a name that starts with an article, is not funding wording", () => {
  const funds = {
    id: "trail",
    hops: [
      hop("OTB Ventures", "ICEYE", "undirected"),
      hop("ICEYE", "Scaleup Europe Fund", "undirected"),
      hop("Scaleup Europe Fund", "The Exploration Company", "undirected"),
    ],
    signal: null,
  } as Trail;
  const lint = (reading: string) => lintConclusion({ ...clean, reading, because: "x", ask: "y" }, funds).length;

  assert.equal(lint("The Exploration Company and ICEYE are both connected to Scaleup Europe Fund, so a reference exists."), 0);
  assert.equal(lint("The Exploration Company shares a tied fund, Scaleup Europe Fund, with ICEYE."), 0);
  assert.equal(lint("Scaleup Europe Fund backed The Exploration Company in August."), 1);
});

test("a directed hop may be worded as funding", () => {
  assert.deepEqual(objectsTo({ reading: "Luminar Ventures funded Photoncycle and Redpine." }), []);
});

test("saying that the direction is not settled is not an overclaim", () => {
  assert.deepEqual(objectsTo({ because: "It is not established that Lifeline funded Photoncycle." }), []);
});

test("a promised introduction, asserted appetite and claimed causation are sent back", () => {
  assert.deepEqual(objectsTo({ reading: "Luminar can introduce you to Lifeline." }), ["reading"]);
  assert.deepEqual(objectsTo({ reading: "Lifeline is looking to invest in AI." }), ["reading"]);
  assert.deepEqual(objectsTo({ reading: "Luminar's backing led to the grant." }), ["reading"]);
});

test("a programme ceiling given as a contract value is sent back", () => {
  assert.deepEqual(objectsTo({ because: "Kuva won a $476 million contract." }), ["because"]);
  assert.deepEqual(objectsTo({ because: "The programme ceiling is $476 million across all awardees." }), []);
});

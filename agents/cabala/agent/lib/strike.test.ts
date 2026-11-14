import assert from "node:assert/strict";
import { test } from "node:test";

import type { PacketSections } from "@fundraising/package-ledger";

import { strike } from "./strike.ts";

const sections: PacketSections = {
  whyMeet: "Kuva Space won a $476 million NASA contract. Kuva Space signed a memorandum with IHI Corporation in mid-2026.",
  trail: "OTB Ventures is tied to ICEYE. ICEYE and IHI Corporation signed a memorandum on 22 May 2025.",
  whyHesitate: "The agreement is a memorandum with no disclosed amount.",
  questions: ["What would turn the memorandum into a contract?", "How large is the NASA contract Kuva Space won?"],
  agenda: ["The IHI memorandum"],
  outreachDraft: "Hello, I would like to talk at Slush.",
  privateNotes: "Ask about the round.",
};

test("a quoted sentence is removed and recorded as withheld by the second read", () => {
  const result = strike(sections, [
    { section: "whyMeet", sentence: "Kuva Space won a $476 million NASA contract.", reason: "The award names the subsidiary." },
  ]);

  assert.equal(result.sections.whyMeet, "Kuva Space signed a memorandum with IHI Corporation in mid-2026.");
  assert.deepEqual(result.withheld, [
    { sentence: "Kuva Space won a $476 million NASA contract.", reason: "The award names the subsidiary.", by: "second_read" },
  ]);
  assert.deepEqual(result.unlocated, []);
});

test("a quote that is nearly word for word still finds its sentence", () => {
  const result = strike(sections, [
    { section: "trail", sentence: "ICEYE and IHI Corporation signed a memorandum on 22 May 2025", reason: "x" },
  ]);

  assert.equal(result.sections.trail, "OTB Ventures is tied to ICEYE.");
});

test("a list item is removed whole", () => {
  const result = strike(sections, [
    { section: "questions", sentence: "How large is the NASA contract Kuva Space won?", reason: "It presupposes a contract." },
  ]);

  assert.deepEqual(result.sections.questions, ["What would turn the memorandum into a contract?"]);
});

test("a quote that is not in the draft changes nothing and is reported", () => {
  const finding = { section: "whyMeet" as const, sentence: "IHI Corporation acquired Kuva Space.", reason: "x" };
  const result = strike(sections, [finding]);

  assert.deepEqual(result.sections, sections);
  assert.deepEqual(result.unlocated, [finding]);
});

test("a section left empty is named, and private notes are never touched", () => {
  const result = strike(sections, [
    { section: "whyHesitate", sentence: "The agreement is a memorandum with no disclosed amount.", reason: "x" },
  ]);

  assert.deepEqual(result.emptied, ["whyHesitate"]);
  assert.equal(result.sections.privateNotes, "Ask about the round.");
});

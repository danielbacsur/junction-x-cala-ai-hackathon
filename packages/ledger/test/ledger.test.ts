import { expect, test } from "vitest";

import { createLedgerParts, NotFoundError, type PacketSections } from "../src";
import { fixtureExtractor, importFixtures } from "../src/admin";
import { memoryDb } from "./db";
import { ids, noConstraints, storedCala } from "./research/helpers";

/** The composed ledger over every fixture, with a Cala that only serves the store. */
async function composed() {
  const db = await memoryDb();
  const parts = createLedgerParts({
    databaseUrl: "unused",
    calaKeys: [],
    db,
    cala: storedCala(db),
    extractAgreements: await fixtureExtractor(),
  });

  await importFixtures(parts.research);

  return parts;
}

test("a founder mandate runs from hiring to an exported packet", async () => {
  const { ledger } = await composed();
  const owner = "guest-founder";

  const [match] = await ledger.findEntity("Redpine Technology");

  expect(match?.id).toBe(ids.redpine);
  expect(match?.slushAttendee).toBe(true);

  const mandate = await ledger.createMandate({
    ownerId: owner,
    role: "founder",
    subjectId: ids.redpine,
    constraints: { ...noConstraints, includePublicFunding: true },
  });

  const result = await ledger.workMandate(mandate.id, owner);

  expect(result.trailsFound).toBeGreaterThan(0);

  const book = await ledger.readBook(mandate.id, owner);
  const luminar = book.rows.find((row) => row.candidate.id === ids.luminar);

  expect(book.rows.length).toBeGreaterThan(0);
  expect(luminar?.category).toBe("follow_up");
  expect(luminar?.trailIds.length).toBeGreaterThan(0);

  // Another guest sees none of it.
  await expect(ledger.readBook(mandate.id, "someone-else")).rejects.toThrow(NotFoundError);

  const brief = await ledger.getBrief(mandate.id, owner, ids.luminar);
  const grant = brief.trails.find((trail) => trail.signal?.type === "public_money");

  expect(grant?.signal?.sources.length).toBeGreaterThan(0);
  expect(grant?.hops.every((hop) => hop.sources.length > 0)).toBe(true);

  await ledger.saveConclusions(mandate.id, owner, [
    {
      trailId: grant!.id,
      reading: "Luminar Ventures already backs a company beside you that received public money.",
      because: "Luminar Ventures backs both Redpine and Photoncycle.",
      doesNotProve: "It does not show that the same funding is open to Redpine.",
      ask: "Ask Luminar how Photoncycle obtained its grant.",
    },
  ]);

  const bundle = await ledger.getEvidenceBundle(mandate.id, owner, ids.luminar);

  expect(bundle.supportedFacts.length).toBeGreaterThan(0);

  const sections: PacketSections = {
    whyMeet: "Luminar Ventures backs Redpine Technology AB.",
    trail: "Kuva Space won a $476 million NASA contract.",
    whyHesitate: "",
    questions: ["How did Photoncycle obtain its grant?"],
    agenda: ["Introductions"],
    outreachDraft: "",
    privateNotes: "Keep this to ourselves.",
  };

  const checked = await ledger.validatePacket(bundle, sections);

  // The invented sentence is withheld by the real validator over the real bundle.
  expect(checked.withheld.map((claim) => claim.sentence).join(" ")).toContain("476");
  expect(checked.sections.trail).not.toContain("476");

  const packet = await ledger.savePacket({
    mandateId: mandate.id,
    ownerId: owner,
    candidateId: ids.luminar,
    sections: checked.sections,
    withheld: checked.withheld,
  });

  expect(packet.version).toBe(1);
  expect(packet.status).toBe("draft");

  const approved = await ledger.approvePacket(mandate.id, owner, packet.version);

  expect(approved.status).toBe("approved");

  const markdown = await ledger.exportPacket(mandate.id, owner, packet.version);

  expect(markdown).toContain("Luminar Ventures");
  expect(markdown).toContain("Built with Cala");
  expect(markdown).not.toContain("Keep this to ourselves");

  const statement = await ledger.getStatement(mandate.id, owner);

  expect(statement.trailsFound).toBeGreaterThan(0);
  expect(statement.sourcesCited).toBeGreaterThan(0);
  expect(statement.claimsWithheld).toBeGreaterThan(0);

  const events = await ledger.listWorkEvents(mandate.id, owner);

  expect(events.some((event) => event.kind === "trail")).toBe(true);
});

test("an investor mandate ranks companies and reranks on new constraints", async () => {
  const { ledger } = await composed();
  const owner = "guest-investor";

  const mandate = await ledger.createMandate({
    ownerId: owner,
    role: "investor",
    subjectId: ids.kfund,
    constraints: noConstraints,
  });

  await ledger.workMandate(mandate.id, owner);

  const book = await ledger.readBook(mandate.id, owner);

  expect(book.rows.length).toBeGreaterThan(0);
  expect(book.coverage.rosterSize).toBeGreaterThan(2000);

  const reranked = await ledger.setConstraints(mandate.id, owner, { ...noConstraints, geographies: ["Spain"] });

  expect(reranked.mandate.revision).toBe(mandate.revision + 1);
});

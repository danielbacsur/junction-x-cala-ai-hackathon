import { afterAll, beforeAll, expect, test } from "vitest";

import { NotFoundError } from "../../src/contract";
import { SupersededError } from "../../src/private";
import { enova, openConstraints, redpine, sections } from "./fixtures";
import { privateStore } from "./store";

let context: Awaited<ReturnType<typeof privateStore>>;

beforeAll(async () => {
  context = await privateStore();
});

afterAll(() => context.db.close());

const draft = sections({
  whyMeet: "ENOVA SF gave Photoncycle AS a grant of NOK 14,376,817, with an event date of 13 March 2025.",
  trail: "Luminar Ventures funded both Redpine and Photoncycle.",
  whyHesitate: "Whether ENOVA SF funds companies registered outside Norway is not in the stored evidence.",
  questions: ["Which programme funded Photoncycle?"],
  agenda: ["Introductions", "How the ENOVA application worked"],
  outreachDraft: "Hello,\n\nRedpine and Photoncycle share a backer in Luminar Ventures.",
  privateNotes: "PRIVATE: our runway ends in March.",
});

async function hire(ownerId: string) {
  const mandate = await context.store.createMandate({
    ownerId,
    role: "founder",
    subjectId: redpine.id,
    constraints: openConstraints,
  });

  return { mandate, packet: { mandateId: mandate.id, ownerId, candidateId: enova.id, withheld: [] } };
}

test("the evidence bundle ties each statement to its kind and its sources", async () => {
  const { store } = context;
  const { mandate } = await hire("guest-bundle");
  const bundle = await store.getEvidenceBundle(mandate.id, "guest-bundle", enova.id);
  const kindOf = (statement: string) => bundle.supportedFacts.find((fact) => fact.statement === statement)?.kind;

  expect(bundle.mandate).toEqual(mandate);
  expect(bundle.brief.candidate).toEqual(enova);

  expect(kindOf("Luminar Ventures funded Redpine Technology AB (role INVESTOR).")).toBe("observed");
  expect(kindOf("This public funder is active in your investors' portfolios.")).toBe("inferred");
  expect(kindOf("It does not prove that ENOVA SF funds companies like Redpine or has a programme open now.")).toBe("unknown");
  expect(kindOf("Stage: Seed.")).toBe("self_reported");

  // An unsettled tie is worded as a tie, and a flagged record keeps its flag.
  expect(
    kindOf("Redpine Technology AB and NordicNinja VC have an investment tie, and Cala's records do not settle who funded whom."),
  ).toBe("observed");

  const grant = bundle.supportedFacts.find((fact) => fact.statement.startsWith("Photoncycle AS: Grant from Innovation Norway"));

  expect(grant?.statement).toContain("NOK 5,300,000; event date 2023-01-27");
  expect(grant?.statement).toContain("flagged: the register's entries for this grant carry different dates");
  expect(grant?.sources).toEqual([expect.objectContaining({ name: "stotte.brreg.no", rank: "FILING" })]);

  await expect(store.getEvidenceBundle(mandate.id, "guest-bundle", "nobody")).rejects.toThrow(NotFoundError);
});

test("each save is the next version and supersedes the earlier ones", async () => {
  const { store } = context;
  const { mandate, packet } = await hire("guest-versions");

  const first = await store.savePacket({ ...packet, sections: draft });

  expect(first).toMatchObject({
    mandateId: mandate.id,
    version: 1,
    candidate: enova,
    basedOnRevision: 1,
    status: "draft",
    sections: draft,
    withheld: [],
    approvedAt: null,
  });

  // The trails are frozen with the version.
  expect(first.trails.map((trail) => trail.id)).toEqual(["trail-luminar", "trail-nordicninja"]);

  const second = await store.savePacket({ ...packet, sections: { ...draft, agenda: ["Introductions"] } });

  expect(second).toMatchObject({ version: 2, status: "draft" });
  expect(await store.getPacket(mandate.id, "guest-versions", 1)).toEqual({ ...first, status: "superseded" });
  expect((await store.listPackets(mandate.id, "guest-versions")).map((item) => item.version)).toEqual([2, 1]);

  await expect(store.getPacket(mandate.id, "guest-versions", 3)).rejects.toThrow(NotFoundError);
  await expect(store.getPacket(mandate.id, "guest-versions", Number.NaN)).rejects.toThrow(NotFoundError);
});

test("saving the same packet again is a retry, not a new version", async () => {
  const { store } = context;
  const { mandate, packet } = await hire("guest-retry");
  const first = await store.savePacket({ ...packet, sections: draft });

  expect(await store.savePacket({ ...packet, sections: draft })).toEqual(first);

  const retries = await Promise.all([1, 2, 3].map(() => store.savePacket({ ...packet, sections: draft })));

  expect(retries).toEqual([first, first, first]);
  expect(await store.listPackets(mandate.id, "guest-retry")).toEqual([first]);

  // A retry after approval returns the approved version and leaves the approval alone.
  const approved = await store.approvePacket(mandate.id, "guest-retry", 1);

  expect(await store.savePacket({ ...packet, sections: draft })).toEqual(approved);
});

test("no version is stored with a sentence the checks withhold", async () => {
  const { store } = context;
  const { packet } = await hire("guest-checked");
  const carried = { sentence: "ENOVA SF is the obvious next funder.", reason: "Not entailed.", by: "second_read" as const };

  const saved = await store.savePacket({
    ...packet,
    sections: { ...draft, whyMeet: `${draft.whyMeet} Luminar Ventures will introduce you to ENOVA SF.` },
    withheld: [carried],
  });

  expect(saved.sections.whyMeet).toBe(draft.whyMeet);
  expect(saved.sections.privateNotes).toBe(draft.privateNotes);

  expect(saved.withheld).toEqual([
    carried,
    {
      sentence: "Luminar Ventures will introduce you to ENOVA SF.",
      reason: expect.stringContaining("not an introduction"),
      by: "validation",
    },
  ]);
});

test("approval belongs to one exact version", async () => {
  const { store } = context;
  const { mandate, packet } = await hire("guest-approval");
  const owner = "guest-approval";

  await store.savePacket({ ...packet, sections: draft });

  const approved = await store.approvePacket(mandate.id, owner, 1);

  expect(approved.status).toBe("approved");
  expect(new Date(approved.approvedAt!).toISOString()).toBe(approved.approvedAt);

  // Approving again, in turn or at once, changes nothing.
  expect(await store.approvePacket(mandate.id, owner, 1)).toEqual(approved);
  expect(await Promise.all([1, 2].map(() => store.approvePacket(mandate.id, owner, 1)))).toEqual([approved, approved]);

  // An edit is a new version without approval, and it takes the approval off the old one.
  const edited = await store.savePacket({ ...packet, sections: { ...draft, questions: [] } });

  expect(edited).toMatchObject({ version: 2, status: "draft", approvedAt: null });
  expect(await store.getPacket(mandate.id, owner, 1)).toEqual({ ...approved, status: "superseded" });

  await expect(store.approvePacket(mandate.id, owner, 1)).rejects.toThrow(SupersededError);
  await expect(store.approvePacket(mandate.id, owner, 7)).rejects.toThrow(NotFoundError);
  expect((await store.getPacket(mandate.id, owner, 2)).status).toBe("draft");

  await store.approvePacket(mandate.id, owner, 2);

  expect((await store.listPackets(mandate.id, owner)).map((item) => item.status)).toEqual(["approved", "superseded"]);
});

test("the export shows the trail with its sources and leaves the private notes out", async () => {
  const { store } = context;
  const { mandate, packet } = await hire("guest-export");
  const owner = "guest-export";

  await store.savePacket({ ...packet, sections: draft });

  const markdown = await store.exportPacket(mandate.id, owner, 1);

  for (const expected of [
    "# Meeting packet: ENOVA SF",
    "Prepared for Redpine Technology AB, Raise Mandate.",
    "Version 1, draft, not approved.",
    `## Why meet\n\n${draft.whyMeet}`,
    `## The trail\n\n${draft.trail}`,
    "### Trail 1: Public money next door, 3 hops",
    "1. Luminar Ventures funded Redpine Technology AB (role INVESTOR).\n   - Observed in Cala's graph as INVESTED_IN.",
    "3. ENOVA SF funded Photoncycle AS (role GRANTOR).",
    "[stotte.brreg.no](https://stotte.brreg.no/en/oppslag/stoettetildeling/1000026319) (2025-06-19, FILING)",
    "**Signal.** Photoncycle AS: Grant from ENOVA SF; NOK 14,376,817; event date 2025-03-13;",
    "**Reading (Inferred).** This public funder is active in your investors' portfolios.",
    "**It does not prove.** It does not prove that ENOVA SF funds companies like Redpine",
    "1. Redpine Technology AB and NordicNinja VC have an investment tie, and Cala's records do not settle who funded whom.",
    "Seen only in another entity's list: NordicNinja VC.",
    "## Questions\n\n- Which programme funded Photoncycle?",
    "## Agenda\n\n1. Introductions\n2. How the ENOVA application worked",
    "## Outreach draft\n\nHello,\n\nRedpine and Photoncycle share a backer in Luminar Ventures.",
    "### Observed\n\n- ENOVA SF funded a company that shares a backer with Redpine Technology AB.",
    "### Inferred\n\n- This public funder is active in your investors' portfolios.",
    "### Still unknown\n\n- It does not prove that ENOVA SF funds companies like Redpine",
    "## Coverage\n\n3 of the 5 entities on these trails were read in full",
    "Built with Cala.",
  ]) {
    expect(markdown).toContain(expected);
  }

  expect(markdown.indexOf("### Observed")).toBeLessThan(markdown.indexOf("### Inferred"));
  expect(markdown.indexOf("### Inferred")).toBeLessThan(markdown.indexOf("### Still unknown"));

  // Neither the private notes nor the customer's own criteria reach the file.
  expect(markdown).not.toContain("PRIVATE");
  expect(markdown).not.toContain("runway");
  expect(markdown).not.toContain("Self-reported");
  expect(markdown).not.toContain("Stage: Seed");

  await store.approvePacket(mandate.id, owner, 1);

  expect(await store.exportPacket(mandate.id, owner, 1)).toMatch(/Version 1, approved on \d{4}-\d{2}-\d{2}T/);
  await expect(store.exportPacket(mandate.id, owner, 2)).rejects.toThrow(NotFoundError);
});

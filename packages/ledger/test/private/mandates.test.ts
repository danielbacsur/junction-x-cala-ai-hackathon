import { afterAll, beforeAll, expect, test } from "vitest";

import { NotFoundError } from "../../src/contract";
import { enova, openConstraints, redpine, sections } from "./fixtures";
import { privateStore } from "./store";

let context: Awaited<ReturnType<typeof privateStore>>;

beforeAll(async () => {
  context = await privateStore();
});

afterAll(() => context.db.close());

function hire(ownerId: string) {
  return context.store.createMandate({
    ownerId,
    role: "founder",
    subjectId: redpine.id,
    constraints: openConstraints,
  });
}

test("a new mandate resolves its subject and records the guest", async () => {
  const { db, store } = context;
  const mandate = await hire("guest-new");

  expect(mandate).toMatchObject({
    ownerId: "guest-new",
    role: "founder",
    subject: redpine,
    constraints: openConstraints,
    revision: 1,
    stage: "brief_received",
    sessionId: null,
  });

  expect(new Date(mandate.createdAt).toISOString()).toBe(mandate.createdAt);
  expect(await db.query("select id from guests where id = $1", ["guest-new"])).toEqual([{ id: "guest-new" }]);
  expect(await store.getMandate(mandate.id, "guest-new")).toEqual(mandate);
  expect(await store.listMandates("guest-new")).toEqual([mandate]);

  await expect(
    store.createMandate({ ownerId: "guest-new", role: "founder", subjectId: "nobody", constraints: openConstraints }),
  ).rejects.toThrow(NotFoundError);
});

test("another guest gets the same refusal as for a mandate that does not exist", async () => {
  const { store, research } = context;
  const mandate = await hire("guest-owner");
  const packet = { mandateId: mandate.id, candidateId: enova.id, sections: sections({ whyMeet: "Hello." }), withheld: [] };

  await store.savePacket({ ...packet, ownerId: "guest-owner" });
  await store.logWork(mandate.id, { kind: "note", message: "Private line", seconds: null, entity: null, fromStore: false });

  const calls: Record<string, (mandateId: string, ownerId: string) => Promise<unknown>> = {
    getMandate: (id, owner) => store.getMandate(id, owner),
    attachSession: (id, owner) => store.attachSession(id, owner, "session-stolen"),
    setStage: (id, owner) => store.setStage(id, owner, "delivered"),
    getEvidenceBundle: (id, owner) => store.getEvidenceBundle(id, owner, enova.id),
    approvePacket: (id, owner) => store.approvePacket(id, owner, 1),
    getPacket: (id, owner) => store.getPacket(id, owner, 1),
    listPackets: (id, owner) => store.listPackets(id, owner),
    exportPacket: (id, owner) => store.exportPacket(id, owner, 1),
    listWorkEvents: (id, owner) => store.listWorkEvents(id, owner),
    getStatement: (id, owner) => store.getStatement(id, owner),
    savePacket: (id, owner) => store.savePacket({ ...packet, mandateId: id, ownerId: owner }),
    setConstraints: (id, owner) => store.setConstraints(id, owner, { ...openConstraints, stages: ["Series B"] }),
  };

  const ranked = research.ranked.length;

  for (const [name, call] of Object.entries(calls)) {
    const refusal = await call(mandate.id, "guest-stranger").catch((error: unknown) => error);
    const missing = await call("no-such-mandate", "guest-stranger").catch((error: unknown) => error);

    expect(refusal, name).toBeInstanceOf(NotFoundError);
    expect(missing, name).toBeInstanceOf(NotFoundError);
    expect((refusal as Error).message, name).toBe((missing as Error).message);
  }

  // Nothing the stranger tried took effect.
  expect(await store.listMandates("guest-stranger")).toEqual([]);
  expect(await store.getMandate(mandate.id, "guest-owner")).toEqual(mandate);
  expect(await store.listPackets(mandate.id, "guest-owner")).toMatchObject([{ version: 1, status: "draft" }]);
  expect(research.ranked.length).toBe(ranked);

  // The owner passes every one of the same calls.
  for (const call of Object.values(calls)) await call(mandate.id, "guest-owner");
});

test("the first session attached stays, and a session carries one mandate", async () => {
  const { store } = context;
  const first = await hire("guest-session");
  const second = await hire("guest-session");

  expect((await store.attachSession(first.id, "guest-session", "session-1")).sessionId).toBe("session-1");
  expect((await store.attachSession(first.id, "guest-session", "session-1")).sessionId).toBe("session-1");
  expect((await store.attachSession(first.id, "guest-session", "session-2")).sessionId).toBe("session-1");

  await expect(store.attachSession(second.id, "guest-session", "session-1")).rejects.toThrow(NotFoundError);
  expect((await store.getMandate(second.id, "guest-session")).sessionId).toBeNull();
});

test("the stage moves, and only to a known stage", async () => {
  const { store } = context;
  const mandate = await hire("guest-stage");

  expect((await store.setStage(mandate.id, "guest-stage", "researching")).stage).toBe("researching");
  expect((await store.setStage(mandate.id, "guest-stage", "delivered")).stage).toBe("delivered");

  // Research may continue after delivery, so a stage can also go back.
  expect((await store.setStage(mandate.id, "guest-stage", "researching")).stage).toBe("researching");

  await expect(store.setStage(mandate.id, "guest-stage", "finished" as never)).rejects.toThrow("Unknown stage");
});

test("new criteria raise the revision, rerank, and leave earlier packets on the older one", async () => {
  const { store, research } = context;
  const mandate = await hire("guest-criteria");
  const packet = { mandateId: mandate.id, ownerId: "guest-criteria", candidateId: enova.id, withheld: [] };
  const before = await store.savePacket({ ...packet, sections: sections({ whyMeet: "Hello." }) });
  const criteria = { ...openConstraints, stages: ["Series A"], exclusions: [" Sequoia ", "Sequoia", ""] };

  const book = await store.setConstraints(mandate.id, "guest-criteria", criteria);

  expect(book.mandate).toMatchObject({ id: mandate.id, revision: 2 });
  expect(book.mandate.constraints).toEqual({ ...criteria, exclusions: ["Sequoia"] });
  expect(research.ranked.at(-1)).toEqual(book.mandate);
  expect(await store.getMandate(mandate.id, "guest-criteria")).toEqual(book.mandate);

  // The earlier packet is now based on older criteria: its revision is below the mandate's.
  const earlier = await store.getPacket(mandate.id, "guest-criteria", before.version);

  expect(earlier).toMatchObject({ basedOnRevision: 1, status: "draft" });
  expect(await store.exportPacket(mandate.id, "guest-criteria", before.version)).toContain("rests on older criteria");

  // The same text saved again is a new version, because it now rests on the new criteria.
  const after = await store.savePacket({ ...packet, sections: sections({ whyMeet: "Hello." }) });

  expect(after).toMatchObject({ version: 2, basedOnRevision: 2, status: "draft" });

  // The same criteria again are a retry: reranked, but no new revision.
  const ranked = research.ranked.length;
  const again = await store.setConstraints(mandate.id, "guest-criteria", criteria);

  expect(again.mandate.revision).toBe(2);
  expect(research.ranked.length).toBe(ranked + 1);
});

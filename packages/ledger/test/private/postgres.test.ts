import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { connect, type Db, migrate } from "../../src/db";
import { createPrivateStore, type PrivateStore } from "../../src/private";
import { enova, openConstraints, photoncycle, redpine, sections } from "./fixtures";
import { fakeResearch } from "./store";

/**
 * The same store on a real Postgres, where writes truly run at once. PGlite runs one statement at
 * a time, so only this file exercises the row locks. It runs when TEST_DATABASE_URL names a
 * database it may fill, and is skipped otherwise.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("on Postgres", () => {
  let db: Db;
  let store: PrivateStore;

  beforeAll(async () => {
    db = connect(url!);
    await migrate(db);
    store = createPrivateStore({ db, research: fakeResearch() });
  });

  afterAll(() => db?.close());

  async function hire(ownerId: string) {
    const mandate = await store.createMandate({
      ownerId,
      role: "founder",
      subjectId: redpine.id,
      constraints: openConstraints,
    });

    return { mandate, packet: { mandateId: mandate.id, ownerId, candidateId: enova.id, withheld: [] } };
  }

  test("rows come back in the contract's shapes", async () => {
    const { mandate, packet } = await hire(`guest-${crypto.randomUUID()}`);
    const event = await store.logWork(mandate.id, {
      kind: "read",
      message: "Read Photoncycle AS",
      seconds: 1.5,
      entity: photoncycle,
      fromStore: true,
    });

    const saved = await store.savePacket({ ...packet, sections: sections({ agenda: ["Introductions"] }) });

    expect(mandate).toMatchObject({ subject: redpine, constraints: openConstraints, revision: 1 });
    expect(new Date(mandate.createdAt).toISOString()).toBe(mandate.createdAt);
    expect(event).toMatchObject({ id: expect.stringMatching(/^\d+$/), seconds: 1.5, entity: photoncycle, fromStore: true });
    expect(saved).toMatchObject({ version: 1, sections: { agenda: ["Introductions"] }, withheld: [], candidate: enova });
    expect(saved.trails).toHaveLength(2);

    expect(await store.getStatement(mandate.id, mandate.ownerId)).toEqual({
      reads: 0,
      probes: 0,
      sourcesCited: 3,
      trailsFound: 2,
      claimsWithheld: 0,
      servedFromStore: 1,
    });
  });

  test("a poller never misses a line while many are written at once", async () => {
    const { mandate } = await hire(`guest-${crypto.randomUUID()}`);
    const seen: string[] = [];
    let writing = true;

    async function poll() {
      while (writing) {
        const events = await store.listWorkEvents(mandate.id, mandate.ownerId, seen.at(-1));

        seen.push(...events.map((event) => event.id));
      }
    }

    const poller = poll();

    const written = await Promise.all(
      Array.from({ length: 60 }, (_, index) =>
        store.logWork(mandate.id, {
          kind: "read",
          message: `Read ${index}`,
          seconds: null,
          entity: null,
          fromStore: false,
        }),
      ),
    );

    writing = false;
    await poller;

    const rest = await store.listWorkEvents(mandate.id, mandate.ownerId, seen.at(-1));
    const all = (await store.listWorkEvents(mandate.id, mandate.ownerId)).map((event) => event.id);

    expect(all).toHaveLength(60);
    expect(new Set(written.map((event) => event.id))).toEqual(new Set(all));
    expect([...seen, ...rest.map((event) => event.id)]).toEqual(all);
  });

  test("a keyed line retried at once is written once", async () => {
    const { mandate } = await hire(`guest-${crypto.randomUUID()}`);
    const event = { kind: "stage" as const, message: "Researching", seconds: null, entity: null, fromStore: false };

    const written = await Promise.all(
      Array.from({ length: 12 }, () => store.logWork(mandate.id, { ...event, key: "stage:researching" })),
    );

    expect(new Set(written.map((line) => line.id)).size).toBe(1);
    expect(await store.listWorkEvents(mandate.id, mandate.ownerId)).toHaveLength(1);
  });

  test("saves at once make one version each, and the same save makes one", async () => {
    const { mandate, packet } = await hire(`guest-${crypto.randomUUID()}`);

    const same = await Promise.all(
      Array.from({ length: 8 }, () => store.savePacket({ ...packet, sections: sections({ agenda: ["Introductions"] }) })),
    );

    expect(new Set(same.map((saved) => saved.id)).size).toBe(1);

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        store.savePacket({ ...packet, sections: sections({ agenda: [`Item ${index}`] }) }),
      ),
    );

    const versions = await store.listPackets(mandate.id, mandate.ownerId);

    expect(versions.map((saved) => saved.version)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(versions.filter((saved) => saved.status !== "superseded").map((saved) => saved.version)).toEqual([7]);
  });

  test("approvals at once leave one approval, and it never moves", async () => {
    const { mandate, packet } = await hire(`guest-${crypto.randomUUID()}`);

    await store.savePacket({ ...packet, sections: sections({ agenda: ["Introductions"] }) });

    const approvals = await Promise.all(
      Array.from({ length: 6 }, () => store.approvePacket(mandate.id, mandate.ownerId, 1)),
    );

    expect(new Set(approvals.map((approved) => approved.approvedAt)).size).toBe(1);
    expect(approvals[0].status).toBe("approved");
  });

  test("sessions attached at once leave one session on the mandate", async () => {
    const { mandate } = await hire(`guest-${crypto.randomUUID()}`);
    const sessions = Array.from({ length: 6 }, () => `session-${crypto.randomUUID()}`);

    const attached = await Promise.all(
      sessions.map((session) => store.attachSession(mandate.id, mandate.ownerId, session)),
    );

    const winner = (await store.getMandate(mandate.id, mandate.ownerId)).sessionId;

    expect(sessions).toContain(winner);
    expect(new Set(attached.map((result) => result.sessionId))).toEqual(new Set([winner]));
  });

  test("criteria changed at once each raise the revision once", async () => {
    const { mandate } = await hire(`guest-${crypto.randomUUID()}`);

    await Promise.all(
      ["Seed", "Series A", "Series B"].map((stage) =>
        store.setConstraints(mandate.id, mandate.ownerId, { ...openConstraints, stages: [stage, "Growth"] }),
      ),
    );

    expect((await store.getMandate(mandate.id, mandate.ownerId)).revision).toBe(4);
  });
});

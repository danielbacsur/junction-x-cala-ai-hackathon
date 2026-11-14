import { afterAll, beforeAll, expect, test } from "vitest";

import { NotFoundError, type WorkEventKind } from "../../src/contract";
import { enova, openConstraints, photoncycle, redpine, sections } from "./fixtures";
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

function line(kind: WorkEventKind, message: string, fromStore = false) {
  return { kind, message, seconds: 1.5, entity: photoncycle, fromStore };
}

test("the log reads in the order it was written, and afterId polls it", async () => {
  const { store } = context;
  const mandate = await hire("guest-log");
  const other = await hire("guest-log");

  const first = await store.logWork(mandate.id, line("stage", "Researching"));
  const elsewhere = await store.logWork(other.id, line("note", "Another mandate"));
  const second = await store.logWork(mandate.id, line("read", "Read Photoncycle AS", true));
  const third = await store.logWork(mandate.id, { kind: "gap", message: "No rounds read", seconds: null, entity: null, fromStore: false });

  expect(second).toMatchObject({
    mandateId: mandate.id,
    kind: "read",
    message: "Read Photoncycle AS",
    seconds: 1.5,
    entity: photoncycle,
    fromStore: true,
  });

  expect(new Date(second.at).toISOString()).toBe(second.at);
  expect(third).toMatchObject({ seconds: null, entity: null, fromStore: false });

  expect(await store.listWorkEvents(mandate.id, "guest-log")).toEqual([first, second, third]);
  expect(await store.listWorkEvents(mandate.id, "guest-log", first.id)).toEqual([second, third]);
  expect(await store.listWorkEvents(mandate.id, "guest-log", third.id)).toEqual([]);

  // A cursor from another mandate, or one that is no cursor at all, never shows another log.
  expect(await store.listWorkEvents(mandate.id, "guest-log", elsewhere.id)).toEqual([second, third]);
  expect(await store.listWorkEvents(mandate.id, "guest-log", "not-an-id")).toEqual([first, second, third]);
});

test("lines written at once all land, each once, in ID order", async () => {
  const { store } = context;
  const mandate = await hire("guest-burst");

  const written = await Promise.all(
    Array.from({ length: 25 }, (_, index) => store.logWork(mandate.id, line("read", `Read ${index}`))),
  );

  const listed = await store.listWorkEvents(mandate.id, "guest-burst");
  const ids = listed.map((event) => Number(event.id));

  expect(new Set(written.map((event) => event.id)).size).toBe(25);
  expect(listed.map((event) => event.message).sort()).toEqual(written.map((event) => event.message).sort());
  expect(ids).toEqual([...ids].sort((a, b) => a - b));
});

test("a retried line with the same key is written once", async () => {
  const { store } = context;
  const mandate = await hire("guest-retry");
  const event = { ...line("stage", "Researching"), key: "stage:researching" };

  const first = await store.logWork(mandate.id, event);
  const retries = await Promise.all([store.logWork(mandate.id, event), store.logWork(mandate.id, event)]);

  expect(retries).toEqual([first, first]);
  expect(await store.listWorkEvents(mandate.id, "guest-retry")).toEqual([first]);

  // Without a key every call is a line of its own.
  await store.logWork(mandate.id, line("read", "Read Photoncycle AS"));
  await store.logWork(mandate.id, line("read", "Read Photoncycle AS"));

  expect(await store.listWorkEvents(mandate.id, "guest-retry")).toHaveLength(3);
});

test("a line for an unknown mandate or of an unknown kind is refused", async () => {
  const { store } = context;
  const mandate = await hire("guest-refused");

  await expect(store.logWork("no-such-mandate", line("note", "Lost"))).rejects.toThrow(NotFoundError);
  await expect(store.logWork(mandate.id, line("guess" as never, "Lost"))).rejects.toThrow("Unknown work event kind");
  expect(await store.listWorkEvents(mandate.id, "guest-refused")).toEqual([]);
});

test("the statement of work counts what the log and the packets hold", async () => {
  const { store, research } = context;
  const mandate = await hire("guest-statement");
  const owner = "guest-statement";

  expect(await store.getStatement(mandate.id, owner)).toEqual({
    reads: 0,
    probes: 0,
    sourcesCited: research.counts.sources,
    trailsFound: research.counts.trails,
    claimsWithheld: 0,
    servedFromStore: 0,
  });

  for (const event of [
    line("read", "Read Redpine Technology AB"),
    line("read", "Read Luminar Ventures"),
    line("read", "Read Photoncycle AS", true),
    line("read", "Read Photoncycle AS", true),
    line("read", "Read NordicNinja VC", true),
    line("probe", "Asked Cala about Photoncycle AS"),
    line("probe", "Asked Cala about Redpine Technology AB", true),
    line("queued", "Queued for Cala"),
    line("trail", "Trail found"),
    line("withheld", "Kept out of the graph: the award names another legal entity"),
  ]) {
    await store.logWork(mandate.id, event);
  }

  const secondRead = [
    { sentence: "ENOVA SF is the obvious next funder.", reason: "Not entailed by the trail.", by: "second_read" as const },
    { sentence: "Photoncycle is growing fast.", reason: "No evidence of growth.", by: "second_read" as const },
  ];

  // Version 1: the checks withhold one sentence, and the second read had withheld two.
  await store.savePacket({
    mandateId: mandate.id,
    ownerId: owner,
    candidateId: enova.id,
    sections: sections({ whyMeet: "Luminar Ventures funded Redpine. NordicNinja VC invested in Redpine." }),
    withheld: secondRead,
  });

  // Version 2 carries the same claims forward and adds one. A claim is counted once.
  await store.savePacket({
    mandateId: mandate.id,
    ownerId: owner,
    candidateId: enova.id,
    sections: sections({ whyMeet: "Luminar Ventures funded Redpine." }),
    withheld: [
      ...secondRead,
      { sentence: "  photoncycle is growing FAST. ", reason: "Repeated.", by: "validation" },
      { sentence: "ENOVA SF will fund Redpine.", reason: "Appetite asserted.", by: "second_read" },
    ],
  });

  expect(await store.getStatement(mandate.id, owner)).toEqual({
    reads: 2,
    probes: 1,
    sourcesCited: research.counts.sources,
    trailsFound: research.counts.trails,
    // Four distinct sentences across the two versions, and one line from other trusted code.
    claimsWithheld: 5,
    servedFromStore: 4,
  });

  // The store writes the packet's own lines, and they are not counted a second time.
  const lines = (await store.listWorkEvents(mandate.id, owner)).filter((event) => event.kind === "withheld");

  expect(lines.map((event) => event.message)).toEqual([
    "Kept out of the graph: the award names another legal entity",
    "Validation: 1 claim withheld (packet v1)",
    "Second read: 2 claims withheld (packet v1)",
    "Second read: 1 claim withheld (packet v2)",
  ]);
});

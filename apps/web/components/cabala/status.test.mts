import assert from "node:assert/strict";
import { test } from "node:test";

import { DONE_FOR, cabalaStatus, type Stream } from "./status.ts";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

type Line = Parameters<typeof cabalaStatus>[0]["events"][number];

const line = (kind: Line["kind"], seconds: number, more: Partial<Line> = {}): Line => ({
  kind,
  at: ago(seconds),
  seconds: 1,
  fromStore: false,
  ...more,
});

const status = (stream: Stream, events: Line[] = [], stage: Parameters<typeof cabalaStatus>[0]["stage"] = "researching", cala: "answering" | "latched" = "answering") =>
  cabalaStatus({ stream, events, stage, cala, now: NOW });

test("a question or approval is the waiting pose, whatever else is going on", () => {
  assert.equal(status({ kind: "needs-you" }, [line("probe", 5, { seconds: null })]).state, "waiting");
});

test("a failed turn is the error pose", () => {
  assert.equal(status({ kind: "failed" }).state, "error");
});

test("a probe in flight is Asking Cala, timed from when it was sent", () => {
  const result = status({ kind: "calling", names: ["work_mandate"] }, [line("read", 20), line("probe", 14, { seconds: null })]);

  assert.deepEqual(result, { state: "reading", label: "Asking Cala", since: ago(14) });
});

test("a probe stops being in flight once its answer is logged, or after its time is up", () => {
  const entity = { id: "kuva" };
  const answered = [line("probe", 40, { seconds: null, entity }), line("probe", 2, { seconds: 38, entity })];

  assert.equal(status({ kind: "offline" }, answered).label, "Reading");
  assert.equal(status({ kind: "offline" }, [line("probe", 400, { seconds: null, entity })]).label, "Researching");
});

test("the tool that probes Cala is Asking Cala, timed from when the call started", () => {
  const result = status({ kind: "calling", names: ["check_signals"], started: ago(9) }, [], "ready");

  assert.deepEqual(result, { state: "reading", label: "Asking Cala", since: ago(9) });
});

test("a probe answered from the store is not a probe in flight", () => {
  assert.notEqual(status({ kind: "offline" }, [line("probe", 3, { seconds: null, fromStore: true })]).label, "Asking Cala");
});

test("a quota wait is Queued for Cala and never reading", () => {
  const result = status({ kind: "calling", names: ["read_book"] }, [line("read", 9), line("queued", 4)]);

  assert.equal(result.state, "asleep");
  assert.equal(result.label, "Queued for Cala");
});

test("a gap written after a queued read does not end the wait", () => {
  assert.equal(status({ kind: "offline" }, [line("queued", 9), line("gap", 2)]).label, "Queued for Cala");
});

test("work logged after a queued read does end it", () => {
  assert.equal(status({ kind: "offline" }, [line("queued", 9), line("trail", 2)]).state, "working");
});

test("with Cala refusing requests the wait is a pause, said in words", () => {
  assert.equal(status({ kind: "offline" }, [line("outage", 30)]).label, "Paused: Cala is not answering");
  assert.equal(status({ kind: "offline" }, [line("queued", 3)], "researching", "latched").label, "Paused: Cala is not answering");
});

test("a tool whose name starts with a read verb is reading, any other tool is working", () => {
  assert.equal(status({ kind: "calling", names: ["read_book"] }, [], "ready").state, "reading");
  assert.equal(status({ kind: "calling", names: ["get_trails"] }, [], "ready").state, "reading");
  assert.equal(status({ kind: "calling", names: ["build_packet"] }, [], "ready").state, "working");
  assert.equal(status({ kind: "writing" }, [], "ready").state, "working");
});

test("with no stream, a fresh log line decides between reading, working and the second read", () => {
  assert.equal(status({ kind: "offline" }, [line("read", 2)]).state, "reading");
  assert.equal(status({ kind: "offline" }, [line("trail", 2)]).state, "working");
  assert.equal(status({ kind: "offline" }, [line("withheld", 2)], "challenging").label, "Second read");
});

test("an old log line says nothing about now", () => {
  assert.deepEqual(status({ kind: "offline" }, [line("read", 300)]), { state: "thinking", label: "Researching", since: null });
});

test("done is held for a moment after a turn, then the figure is idle again", () => {
  assert.equal(status({ kind: "finished", at: NOW - 200 }, [], "ready").state, "done");
  assert.deepEqual(status({ kind: "finished", at: NOW - DONE_FOR - 1 }, [], "ready"), { state: "idle", label: "Ready for your decision", since: null });
});

test("a settled mandate is idle, and says which stage it rests at", () => {
  assert.equal(status({ kind: "idle" }, [], "delivered").label, "Delivered");
  assert.equal(status({ kind: "offline" }, [], "brief_received").label, "Brief received");
});

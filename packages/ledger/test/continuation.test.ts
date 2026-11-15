import { afterEach, expect, test } from "vitest";
import { memoryDb } from "./db";
import { createContinuation } from "../src/continuation";
import type { Research } from "../src/research";
import type { WorkResult } from "../src/contract";

afterEach(() => { delete process.env.CABALA_CONTINUATION_ENABLED; });
test("continuation is opt-in, claims exclude customer work, and its lifetime budget stops at 25", async () => {
  const db = await memoryDb();
  try {
    await db.query("insert into guests (id) values ('owner')");
    await db.query(`insert into mandates (id, owner_id, role, subject, constraints, stage)
      values ('m', 'owner', 'founder', '{}', '{}', 'ready')`);
    const budgets: number[] = [];
    let runner: ReturnType<typeof createContinuation>;
    const research = {
      async workMandate() { throw new Error("must not start concurrent customer pass"); },
      async continueMandate(id: string, owner: string, budget: number) {
        budgets.push(budget);
        await expect(runner.workMandate(id, owner)).rejects.toThrow("already running");
        return { requestsUsed: Math.min(7, budget) } as WorkResult;
      },
    } as unknown as Research;
    runner = createContinuation(db, research);
    expect(await runner.continueMandates()).toEqual({ enabled: false, passes: 0 });
    process.env.CABALA_CONTINUATION_ENABLED = "1";
    for (let i = 0; i < 5; i++) await runner.continueMandates();
    expect(budgets).toEqual([25, 18, 11, 4]);
    expect(await db.query("select requests_spent, stage, continuing_since from mandates")).toEqual([
      { requests_spent: 25, stage: "ready", continuing_since: null },
    ]);
  } finally { await db.close(); }
});

test("a zero-request pass closes continuation and closed mandates are never scheduled", async () => {
  const db = await memoryDb();
  try {
    process.env.CABALA_CONTINUATION_ENABLED = "1";
    await db.query("insert into guests (id) values ('owner')");
    await db.query("insert into mandates (id, owner_id, role, subject, constraints, stage) values ('m', 'owner', 'founder', '{}', '{}', 'delivered')");
    let calls = 0;
    const runner = createContinuation(db, { async continueMandate() { calls++; return { requestsUsed: 0 }; } } as unknown as Research);
    await runner.continueMandates(); await runner.continueMandates();
    expect(calls).toBe(1);
    expect(await db.query("select open, requests_spent, stage from mandates")).toEqual([{ open: false, requests_spent: 0, stage: "delivered" }]);
  } finally { await db.close(); }
});

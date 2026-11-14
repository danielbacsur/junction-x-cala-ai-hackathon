import { expect, test } from "vitest";

import { migrate } from "../src/admin";
import { memoryDb } from "./db";

test("migrations apply once and transactions roll back", async () => {
  const db = await memoryDb();

  expect(await migrate(db)).toEqual([]);

  await db.query("create table things (id int primary key)");

  await expect(
    db.transaction(async (tx) => {
      await tx.query("insert into things values ($1)", [1]);

      throw new Error("no");
    }),
  ).rejects.toThrow("no");

  expect(await db.query("select * from things")).toEqual([]);

  await db.close();
});

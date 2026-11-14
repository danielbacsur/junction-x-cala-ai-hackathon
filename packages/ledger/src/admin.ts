/**
 * The ledger's second entry, `@fundraising/package-ledger/admin`: what sets a store up, as
 * opposed to what runs on one. Its functions find their folders (the migrations in sql/, the
 * saved responses in fixtures/) beside this package's sources. A bundler cannot follow that, so
 * nothing here is exported from the root, which the web app and the agent bundle.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { Db } from "./db";

export { fixtureExtractor, importFixtures } from "./research/fixtures";

const migrations = fileURLToPath(new URL("../sql/", import.meta.url));

/**
 * Applies the files in sql/ that have not run yet, in name order, each in its own transaction.
 * Returns the names it applied.
 */
export async function migrate(db: Db, directory = migrations): Promise<string[]> {
  await db.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );

  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((row) => row.name));
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const applied: string[] = [];

  for (const name of files) {
    if (done.has(name)) continue;

    const sql = await readFile(`${directory}/${name}`, "utf8");

    await db.transaction(async (tx) => {
      await tx.query(sql);
      await tx.query("insert into schema_migrations (name) values ($1)", [name]);
    });

    applied.push(name);
  }

  return applied;
}

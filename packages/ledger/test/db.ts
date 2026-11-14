import { PGlite } from "@electric-sql/pglite";

import { migrate } from "../src/admin";
import type { Db } from "../src/db";

/** A fresh in-memory Postgres with every migration applied, for one test file. */
export async function memoryDb(): Promise<Db> {
  const pglite = new PGlite();

  function wrap(target: Pick<PGlite, "query" | "exec">): Db["query"] {
    return async (text, params = []) => {
      // PGlite's query takes one statement; migration files hold several.
      if (params.length === 0 && text.includes(";")) {
        const results = await target.exec(text);

        return (results.at(-1)?.rows ?? []) as never[];
      }

      return (await target.query(text, params)).rows as never[];
    };
  }

  const db: Db = {
    query: wrap(pglite),

    transaction: (run) =>
      pglite.transaction(async (handle) => {
        const tx: Db = { query: wrap(handle), transaction: (nested) => nested(tx), close: async () => {} };

        return run(tx);
      }) as never,

    close: () => pglite.close(),
  };

  await migrate(db);

  return db;
}

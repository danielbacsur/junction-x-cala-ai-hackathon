import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * The little of Postgres the ledger uses. Production runs on node-postgres and the tests on an
 * in-memory PGlite, so everything written against Db runs the same SQL in both.
 */
export interface Db {
  query<Row = Record<string, unknown>>(text: string, params?: unknown[]): Promise<Row[]>;
  /** Runs the callback in one transaction and rolls back if it throws. */
  transaction<Result>(run: (tx: Db) => Promise<Result>): Promise<Result>;
  close(): Promise<void>;
}

/** Connects to Postgres. The pool is created on the first query, so builds need no database. */
export function connect(databaseUrl: string): Db {
  let pool: import("pg").Pool | undefined;

  async function getPool() {
    if (!pool) {
      const { default: pg } = await import("pg");

      // Dates and bigints stay strings, so rows are JSON-serializable as they come.
      pg.types.setTypeParser(pg.types.builtins.INT8, Number);
      pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);
      pg.types.setTypeParser(pg.types.builtins.DATE, String);
      pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) => new Date(value).toISOString());

      pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
    }

    return pool;
  }

  return {
    async query(text, params = []) {
      return (await (await getPool()).query(text, params)).rows;
    },

    async transaction(run) {
      const client = await (await getPool()).connect();

      const tx: Db = {
        async query(text, params = []) {
          return (await client.query(text, params)).rows;
        },
        transaction: (nested) => nested(tx),
        async close() {},
      };

      try {
        await client.query("begin");
        const result = await run(tx);
        await client.query("commit");

        return result;
      } catch (error) {
        await client.query("rollback");

        throw error;
      } finally {
        client.release();
      }
    },

    async close() {
      await pool?.end();
      pool = undefined;
    },
  };
}

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

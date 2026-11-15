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

      // The driver already verifies the certificate under sslmode=require and warns on every
      // start that this will change; naming the mode it applies keeps the behaviour and the log.
      const connectionString = databaseUrl.replace(/([?&])sslmode=require\b/, "$1sslmode=verify-full");

      pool = new pg.Pool({
        connectionString,
        max: 5,
        // A connection the network drops without a word would otherwise hold its query for ever.
        keepAlive: true,
        connectionTimeoutMillis: 15_000,
        query_timeout: 120_000,
      });

      // An idle connection the network dropped is replaced on the next query. Without a
      // listener the error is unhandled and ends the process.
      pool.on("error", () => {});
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

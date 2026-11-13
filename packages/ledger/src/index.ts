import type { Ledger } from "./contract";

export * from "./contract";
export { calaKeysFromEnv } from "./keys";

export type LedgerOptions = {
  /** Postgres connection string for both stores. */
  databaseUrl: string;
  /** Cala API keys. Requests are paced per key; see calaKeysFromEnv. */
  calaKeys: string[];
};

export function createLedger(options: LedgerOptions): Ledger {
  void options;

  throw new Error("The ledger is not implemented yet.");
}

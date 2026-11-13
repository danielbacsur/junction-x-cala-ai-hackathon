import type { Ledger } from "./contract";

export { type CalaClientEvent, type CalaClientOptions, createCalaClient } from "./cala/client";
export * from "./cala/contract";
export { CalaKeyError, CalaRateLimitError, CalaRequestError, CalaTimeoutError } from "./cala/errors";
export { checkAgreements, createAgreementExtractor } from "./cala/extract";
export { requestId } from "./cala/id";
export { createMemoryStore, type MemoryStore } from "./cala/memory";
export * from "./contract";
export { connect, type Db, migrate } from "./db";
export * from "./guest";
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

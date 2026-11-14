import { createCalaClient } from "./cala/client";
import type { CalaClient } from "./cala/contract";
import { createAgreementExtractor } from "./cala/extract";
import type { AgreementExtractor, Ledger } from "./contract";
import { connect, type Db } from "./db";
import { createPrivateStore, type PrivateStore } from "./private";
import { createRawStore, createResearch } from "./research";

export { type CalaClientEvent, type CalaClientOptions, createCalaClient } from "./cala/client";
export * from "./cala/contract";
export { CalaKeyError, CalaRateLimitError, CalaRequestError, CalaTimeoutError } from "./cala/errors";
export { checkAgreements, createAgreementExtractor } from "./cala/extract";
export { requestId } from "./cala/id";
export { createMemoryStore, type MemoryStore } from "./cala/memory";
export * from "./contract";
export { connect, type Db } from "./db";
export * from "./guest";
export { calaKeysFromEnv } from "./keys";

export { createPrivateStore, type PrivateStore, SupersededError } from "./private";
export { confirmIdentity, createRawStore, createResearch, type Research } from "./research";

export type LedgerOptions = {
  /** Postgres connection string for both stores. */
  databaseUrl: string;
  /** Cala API keys. Requests are paced per key; see calaKeysFromEnv. */
  calaKeys: string[];
  /** Replaceable for tests: an open database, a Cala client, an agreement extractor. */
  db?: Db;
  cala?: CalaClient;
  extractAgreements?: AgreementExtractor;
};

/**
 * The ledger with the parts it is made of, for scripts that import responses. Migrations and the
 * fixture importer are in the package's second entry, `@fundraising/package-ledger/admin`.
 */
export function createLedgerParts(options: LedgerOptions) {
  const db = options.db ?? connect(options.databaseUrl);
  const cala = options.cala ?? createCalaClient({ keys: options.calaKeys, store: createRawStore(db) });

  // The research engine logs to the private store, and the private store reranks through the
  // research engine, so the first is handed the second before it exists.
  let store: PrivateStore;

  const research = createResearch({
    db,
    cala,
    extractAgreements: options.extractAgreements ?? createAgreementExtractor(),

    mandates: {
      getMandate: (mandateId, ownerId) => store.getMandate(mandateId, ownerId),
      logWork: (mandateId, event) => store.logWork(mandateId, event),
      setStage: (mandateId, ownerId, stage) => store.setStage(mandateId, ownerId, stage),
    },
  });

  store = createPrivateStore({ db, research });

  const ledger: Ledger = {
    findEntity: research.findEntity,
    getDossier: research.getDossier,
    getCoverage: research.getCoverage,
    workMandate: research.workMandate,
    readAround: research.readAround,
    proposeProbes: research.proposeProbes,
    checkSignals: research.checkSignals,
    readBook: research.readBook,
    getTrails: research.getTrails,
    getBrief: research.getBrief,
    saveConclusions: research.saveConclusions,

    ...store,
  };

  return { ledger, research, store, cala, db };
}

export function createLedger(options: LedgerOptions): Ledger {
  return createLedgerParts(options).ledger;
}

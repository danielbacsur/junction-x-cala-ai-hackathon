import { calaKeysFromEnv, createLedger, type Ledger } from "@fundraising/package-ledger";

import { createMockLedger } from "@/lib/mock/ledger";

let ledger: Ledger | undefined;

/** True when the app runs on the seeded evidence of lib/mock instead of the real ledger. */
export function mocked() {
  return process.env.BOOKRUNNER_MOCK === "1";
}

/** The one ledger of this process, created on first use so that builds need no database. */
export function getLedger(): Ledger {
  if (mocked()) return createMockLedger();

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

  ledger ??= createLedger({ databaseUrl, calaKeys: calaKeysFromEnv() });

  return ledger;
}

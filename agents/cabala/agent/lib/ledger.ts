import { calaKeysFromEnv, createLedger, type Ledger } from "@fundraising/package-ledger";

let ledger: Ledger | undefined;

/** The one ledger of this process, created on first use so that builds need no database. */
export function getLedger(): Ledger {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

  ledger ??= createLedger({ databaseUrl, calaKeys: calaKeysFromEnv() });

  return ledger;
}

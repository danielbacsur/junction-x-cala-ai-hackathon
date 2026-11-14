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

/**
 * One ledger read whose failure the page can say in words. Any failure, a ledger that cannot be
 * created included, comes back as null, and is logged for whoever runs the server.
 */
export async function attempt<Result>(read: (ledger: Ledger) => Promise<Result>): Promise<Result | null> {
  try {
    return await read(getLedger());
  } catch (error) {
    console.error(error);

    return null;
  }
}

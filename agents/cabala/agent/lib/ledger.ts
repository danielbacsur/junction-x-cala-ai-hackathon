import { calaKeysFromEnv, createLedger, type Ledger } from "@fundraising/package-ledger";

import { createFakeLedger } from "./fake/ledger";

// Tools and workflow steps are bundled apart, so the one ledger of the process hangs off
// globalThis and not off this module.
const shared = globalThis as { bookrunnerLedger?: Ledger };

/**
 * The one ledger of this process, created on first use so that builds need no database.
 * BOOKRUNNER_FAKE_LEDGER=1 swaps in the in-memory one, seeded from saved Cala responses, for
 * local runs and evals.
 */
export function getLedger(): Ledger {
  if (shared.bookrunnerLedger) return shared.bookrunnerLedger;

  if (process.env.BOOKRUNNER_FAKE_LEDGER === "1") return (shared.bookrunnerLedger = createFakeLedger());

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

  return (shared.bookrunnerLedger = createLedger({ databaseUrl, calaKeys: calaKeysFromEnv() }));
}

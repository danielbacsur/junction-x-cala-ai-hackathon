import { defineSchedule } from "eve/schedules";
import { calaKeysFromEnv, createLedgerParts } from "@fundraising/package-ledger";

export default defineSchedule({
  cron: "*/15 * * * *",
  timezone: "UTC",
  async run() {
    if (process.env.CABALA_CONTINUATION_ENABLED !== "1") return;
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required for scheduled research.");
    const parts = createLedgerParts({ databaseUrl, calaKeys: calaKeysFromEnv() });
    try { await parts.continueMandates(); }
    finally { await parts.db.close(); }
  },
});

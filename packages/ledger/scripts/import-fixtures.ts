/**
 * Applies the migrations and loads the committed fixtures into the database named by
 * DATABASE_URL. It makes no request to Cala and can be run again at any time: a response that
 * is already stored and read is skipped.
 *
 *   npm run fixtures -w @fundraising/package-ledger
 */
import { fileURLToPath } from "node:url";

import { CalaUnavailableError } from "../src/contract";
import { connect, migrate } from "../src/db";
import { createResearch, fixtureExtractor, importFixtures } from "../src/research";

// The repo's .env.local holds DATABASE_URL in development. A value already set wins.
for (const file of [".env.local", ".env"]) {
  try {
    if (!process.env.DATABASE_URL) process.loadEnvFile(fileURLToPath(new URL(`../../../${file}`, import.meta.url)));
  } catch {
    // The file is optional.
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const db = connect(databaseUrl);

const never = async (): Promise<never> => {
  throw new CalaUnavailableError("The fixture importer does not call Cala or touch mandates.");
};

try {
  const applied = await migrate(db);

  console.log(applied.length > 0 ? `Applied migrations: ${applied.join(", ")}` : "Migrations are up to date.");

  const research = createResearch({
    db,
    cala: { request: never, status: never, recover: never },
    mandates: { getMandate: never, logWork: never, setStage: never },
    // The probe fixtures are read with the hand-written readings committed beside them.
    extractAgreements: await fixtureExtractor(),
  });

  const { files, skipped } = await importFixtures(research);

  console.log(`Imported ${files} fixture files.`);

  for (const line of skipped) console.log(`Skipped ${line}`);

  // Reading coverage also rebuilds the ties and signals, so the first customer does not wait for it.
  const coverage = await research.getCoverage();
  const [counts] = await db.query<{ entities: number; edges: number; ties: number; signals: number }>(
    `select (select count(*)::integer from entities) as entities,
            (select count(*)::integer from edges) as edges,
            (select count(*)::integer from ties) as ties,
            (select count(*)::integer from signals) as signals`,
  );

  console.log(
    `Store: ${counts?.entities} entities, ${counts?.edges} edges, ${counts?.ties} ties, ${counts?.signals} signals; ` +
      `${coverage.entitiesReadInFull} read in full, ${coverage.hubsRead} hubs, ${coverage.probesStored} probes, ` +
      `Slush roster of ${coverage.rosterSize} from ${coverage.rosterFetchedAt}.`,
  );
} finally {
  await db.close();
}

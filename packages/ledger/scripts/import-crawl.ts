/**
 * Loads saved Cala entity reads into the database named by DATABASE_URL. The files are the
 * crawler's output, one response per file in the evidence wrapper
 * `{_request, _fetched_at, _seconds, response}`. It makes no request to Cala and can be run
 * again at any time, also while the crawl is still writing: a response that is already stored
 * is skipped.
 *
 *   npm run crawl:import -w @fundraising/package-ledger -- <folder> [<folder> …]
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { requestId } from "../src/cala/id";
import { CalaUnavailableError } from "../src/contract";
import { connect, migrate } from "../src/db";
import { createResearch } from "../src/research";
import type { IngestInput } from "../src/research/ingest";
import { fromSavedRequest } from "../src/research/requests";

/** One fewer than the pool, so the progress queries always find a free connection. */
const CONCURRENCY = 4;

type Saved = {
  _request: { method?: string; path?: string; body?: unknown };
  _fetched_at: string;
  _seconds?: number;
  response: unknown;
};

// The repo's .env.local holds DATABASE_URL in development. A value already set wins.
for (const file of [".env.local", ".env"]) {
  try {
    if (!process.env.DATABASE_URL) process.loadEnvFile(fileURLToPath(new URL(`../../../${file}`, import.meta.url)));
  } catch {
    // The file is optional.
  }
}

const databaseUrl = process.env.DATABASE_URL;
const folders = process.argv.slice(2);

if (!databaseUrl || folders.length === 0) {
  console.error("Usage: DATABASE_URL=… import-crawl <folder> [<folder> …]");
  process.exit(1);
}

const db = connect(databaseUrl);

const never = async (): Promise<never> => {
  throw new CalaUnavailableError("The crawl importer does not call Cala or touch mandates.");
};

/** The saved clock time, such as 2026-11-14T14:15:48+0200, as an ISO instant. */
function instant(saved: string): string {
  return new Date(saved.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).toISOString();
}

try {
  await migrate(db);

  const research = createResearch({
    db,
    cala: { request: never, status: never, recover: never },
    mandates: { getMandate: never, logWork: never, setStage: never },
    // Entity reads hold no probe answers, so nothing here needs the model.
    extractAgreements: never,
  });

  const stored = new Set((await db.query<{ id: string }>("select id from raw_responses")).map((row) => row.id));
  const files: string[] = [];

  for (const folder of folders) {
    for (const name of (await readdir(folder)).filter((file) => file.endsWith(".json")).sort()) {
      files.push(`${folder}/${name}`);
    }
  }

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const started = Date.now();

  async function worker() {
    for (let file = files.pop(); file; file = files.pop()) {
      try {
        const saved = JSON.parse(await readFile(file, "utf8")) as Saved;
        const request = fromSavedRequest(saved._request);

        if (!request || saved.response === undefined || saved.response === null) {
          failed += 1;
          console.error(`Not a usable response: ${file}`);

          continue;
        }

        const id = requestId(request);

        if (stored.has(id)) {
          skipped += 1;

          continue;
        }

        const input: IngestInput = {
          id,
          request,
          status: 200,
          fetchedAt: instant(saved._fetched_at),
          seconds: saved._seconds ?? 0,
          body: saved.response,
          fromStore: true,
          provenance: { fixture: file.split("/").slice(-2).join("/"), note: "Slush crawl of 2026-11-14." },
        };

        // Two reads that mention the same neighbour can collide; the second attempt finds it written.
        for (let attempt = 1; ; attempt += 1) {
          try {
            await research.ingest(input);

            break;
          } catch (error) {
            if (attempt === 3) throw error;
          }
        }

        imported += 1;

        if (imported % 100 === 0) {
          const perMinute = Math.round(imported / ((Date.now() - started) / 60000));

          console.log(`${imported} imported, ${files.length} to go, ${perMinute} a minute`);
        }
      } catch (error) {
        failed += 1;
        console.error(`Failed ${file}: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`Imported ${imported}, already stored ${skipped}, failed ${failed}.`);

  // Reading coverage also rebuilds the ties and signals, so the first customer does not wait for it.
  const rebuilt = Date.now();
  const coverage = await research.getCoverage();
  const [counts] = await db.query<{ entities: number; edges: number; ties: number; signals: number }>(
    `select (select count(*)::integer from entities) as entities,
            (select count(*)::integer from edges) as edges,
            (select count(*)::integer from ties) as ties,
            (select count(*)::integer from signals) as signals`,
  );

  console.log(
    `Store: ${counts?.entities} entities, ${counts?.edges} edges, ${counts?.ties} ties, ${counts?.signals} signals; ` +
      `${coverage.entitiesReadInFull} read in full, ${coverage.hubsRead} hubs, ${coverage.probesStored} probes. ` +
      `Rebuilding ties and signals took ${Math.round((Date.now() - rebuilt) / 1000)} s.`,
  );
} finally {
  await db.close();
}

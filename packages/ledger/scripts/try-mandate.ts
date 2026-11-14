/**
 * Works one mandate from the command line and prints its Book with every trail spelled out,
 * for checking what the engine finds without the agent or the web app.
 *
 *   npm run try -w @fundraising/package-ledger -- founder "Redpine Technology"
 *   npm run try -w @fundraising/package-ledger -- investor "Luminar Ventures" --rows 20
 *   npm run try -w @fundraising/package-ledger -- founder <entity-id> --live 25
 *   npm run try -w @fundraising/package-ledger -- founder ConfidentialMind --crawl <folder> --no-public
 *
 * Without --live the pass spends no Cala requests and answers from the store alone. The mandate
 * is saved under the owner "try-mandate" and left in place.
 *
 * With --crawl nothing is read from or written to DATABASE_URL: the committed fixtures and the
 * crawler's saved reads (the folder's stars, hubs and rounds) are loaded into a Postgres that
 * lives in memory for this one run, and no request can reach Cala.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { calaKeysFromEnv, CalaUnavailableError, createLedgerParts, requestId, type Role, type Signal, type Trail } from "../src";
import { importFixtures } from "../src/admin";
import type { IngestInput } from "../src/research";
import { fromSavedRequest } from "../src/research/requests";
import { memoryDb } from "../test/db";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(fileURLToPath(new URL(`../../../${file}`, import.meta.url)));
  } catch {
    // The file is optional.
  }
}

const [role, subject, ...flags] = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const at = flags.indexOf(`--${name}`);

  return at >= 0 ? Number(flags[at + 1]) : fallback;
};

const crawl = flags.includes("--crawl") ? flags[flags.indexOf("--crawl") + 1] : undefined;

if ((role !== "founder" && role !== "investor") || !subject || !(crawl ?? process.env.DATABASE_URL)) {
  console.error(
    'Usage: try-mandate <founder|investor> "<name or entity id>" [--live <requests>] [--rows <count>] [--crawl <folder>] [--no-public]',
  );
  process.exit(1);
}

/** A store in memory, holding the committed fixtures and the saved reads of one crawl. */
async function fromCrawl(folder: string) {
  const never = async (): Promise<never> => {
    throw new CalaUnavailableError("A run from crawl files makes no Cala requests.");
  };
  const parts = createLedgerParts({
    databaseUrl: "unused",
    calaKeys: [],
    db: await memoryDb(),
    cala: { request: never, status: never, recover: never },
    // No reading of probe answers: their claims stay as Cala reported them.
    extractAgreements: never,
  });

  await importFixtures(parts.research);

  for (const kind of ["stars", "hubs", "rounds"]) {
    for (const name of (await readdir(`${folder}/${kind}`)).filter((file) => file.endsWith(".json")).sort()) {
      const saved = JSON.parse(await readFile(`${folder}/${kind}/${name}`, "utf8")) as {
        _request: { method?: string; path?: string; body?: unknown };
        _fetched_at: string;
        _seconds?: number;
        response: unknown;
      };
      const request = fromSavedRequest(saved._request);

      if (!request || saved.response === undefined || saved.response === null) continue;

      const input: IngestInput = {
        id: requestId(request),
        request,
        status: 200,
        fetchedAt: new Date(saved._fetched_at.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).toISOString(),
        seconds: saved._seconds ?? 0,
        body: saved.response,
        fromStore: true,
        provenance: { fixture: `${kind}/${name}`, note: "Slush crawl of 2026-11-14." },
      };

      await parts.research.ingest(input);
    }
  }

  return parts;
}

const owner = "try-mandate";
const rows = flag("rows", 12);
const { ledger, db } = crawl
  ? await fromCrawl(crawl)
  : createLedgerParts({ databaseUrl: process.env.DATABASE_URL!, calaKeys: calaKeysFromEnv() });

function signalLine(signal: Signal) {
  const value = signal.value === null ? "" : `, ${signal.units ?? ""} ${signal.value.toLocaleString("en")}`;
  const ceiling = signal.valueIsProgrammeCeiling ? " (programme ceiling)" : "";
  const date = signal.date ? `, ${signal.dateKind ?? "date"} ${signal.date}` : ", undated";
  const source = signal.sources[0]?.url ?? signal.sources[0]?.name ?? "no source";

  return `${signal.type}: ${signal.label}${value}${ceiling}${date} [${signal.origin}] <${source}>${signal.flag ? ` FLAG ${signal.flag}` : ""}`;
}

function trailLines(trail: Trail) {
  const arrow = { from_funds_to: "=funds=>", to_funds_from: "<=funded by=", undirected: "~tie~", not_applicable: "--" };

  const path = trail.hops
    .map((hop, index) => `${index === 0 ? hop.from.name : ""} ${arrow[hop.direction]}[${hop.relationship}${hop.origin === "derived" ? "*" : ""}] ${hop.to.name}`)
    .join(" ");

  return [
    `    ${trail.pattern} (${trail.hopCount} hops, ${trail.independentTrails} independent): ${path.trim()}`,
    ...(trail.signal ? [`      signal on ${trail.signal.entity.name}: ${signalLine(trail.signal)}`] : []),
  ];
}

try {
  const isId = /^[0-9a-f-]{36}$/.test(subject);
  const subjectId = isId ? subject : (await ledger.findEntity(subject, { limit: 5 }))[0]?.id;

  if (!subjectId) throw new Error(`Nothing in the store or in Cala is called "${subject}".`);

  const mandate = await ledger.createMandate({
    ownerId: owner,
    role: role as Role,
    subjectId,
    constraints: {
      stages: null,
      sectors: null,
      geographies: null,
      exclusions: null,
      includeExistingBackers: true,
      includePublicFunding: !flags.includes("--no-public"),
      notes: null,
    },
  });

  const started = Date.now();
  const result = await ledger.workMandate(mandate.id, owner, { budget: flag("live", 0) });
  const book = await ledger.readBook(mandate.id, owner);

  console.log(`${role} mandate on ${mandate.subject.name} (${mandate.subject.id})`);
  console.log(`${mandate.subject.description ?? "no description"}`);
  console.log(
    `${result.rows} rows, ${result.trailsFound} trails, ${result.requestsUsed} Cala requests, ` +
      `${Math.round((Date.now() - started) / 1000)} s, mandate ${mandate.id}\n`,
  );

  for (const row of book.rows.slice(0, rows)) {
    console.log(`#${row.rank} ${row.candidate.name} [${row.candidate.entityType}] ${row.category}${row.directFitOnly ? " (direct fit only)" : ""}`);
    console.log(`    ${row.reason}`);

    for (const trail of (await ledger.getTrails(mandate.id, owner, row.candidate.id)).slice(0, 3)) {
      for (const line of trailLines(trail)) console.log(line);
    }
  }

  console.log(`\nGaps:`);

  for (const gap of book.gaps) console.log(`  - ${gap}`);

  console.log(`\nCoverage: ${JSON.stringify(book.coverage)}`);
} finally {
  await db.close();
}

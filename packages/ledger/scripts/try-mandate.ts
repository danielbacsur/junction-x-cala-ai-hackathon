/**
 * Works one mandate from the command line and prints its Book with every trail spelled out,
 * for checking what the engine finds without the agent or the web app.
 *
 *   npm run try -w @fundraising/package-ledger -- founder "Redpine Technology"
 *   npm run try -w @fundraising/package-ledger -- investor "Luminar Ventures" --rows 20
 *   npm run try -w @fundraising/package-ledger -- founder <entity-id> --live 25
 *
 * Without --live the pass spends no Cala requests and answers from the store alone. The mandate
 * is saved under the owner "try-mandate" and left in place.
 */
import { fileURLToPath } from "node:url";

import { calaKeysFromEnv, createLedgerParts, type Role, type Signal, type Trail } from "../src";

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

if ((role !== "founder" && role !== "investor") || !subject || !process.env.DATABASE_URL) {
  console.error('Usage: try-mandate <founder|investor> "<name or entity id>" [--live <requests>] [--rows <count>]');
  process.exit(1);
}

const owner = "try-mandate";
const rows = flag("rows", 12);
const { ledger, db } = createLedgerParts({ databaseUrl: process.env.DATABASE_URL, calaKeys: calaKeysFromEnv() });

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
      includePublicFunding: true,
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

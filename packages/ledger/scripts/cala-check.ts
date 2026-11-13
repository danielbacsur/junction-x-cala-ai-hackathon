/**
 * One paced check of the Cala client against the real API. It sends at most 15 requests, one at
 * a time, and uses no key more than twice: an entity search for Redpine Technology AB, one star
 * read of it with the body of consensus point 5.2, the same read again to show the store answers
 * it, and one small entity search on every key that is left. It never sends a knowledge request
 * and stops for good at a load balancer's 403. Keys are named by their position only.
 *
 *   node_modules/.bin/jiti packages/ledger/scripts/cala-check.ts --env <path to .env> [--save <folder>]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { type CalaClientEvent, createCalaClient } from "../src/cala/client";
import type { CalaRequest, RawResponse } from "../src/cala/contract";
import { toHttp } from "../src/cala/http";
import { createMemoryStore } from "../src/cala/memory";
import { CalaUnavailableError } from "../src/contract";
import { calaKeysFromEnv } from "../src/keys";

const MOST_REQUESTS = 15;
const MOST_PER_KEY = 2;

const REDPINE = "331fec23-9c63-4885-a8f5-c2902c9e1b9d";

/** Entities the product reads first, so the answers are worth keeping when --save is given. */
const OTHERS = [
  "Luminar Ventures",
  "NordicNinja",
  "Photoncycle",
  "ICEYE",
  "Kuva Space",
  "IHI Corporation",
  "Kfund",
  "Business Finland",
];

const limited = (limit: number, names: string) => Object.fromEntries(names.split(" ").map((name) => [name, { limit }]));

/** Relationship names the mentors have not confirmed. Cala answers an unknown name with an empty list. */
const candidates =
  "HAS_CUSTOMER IS_CUSTOMER_OF IS_PARTNER_OF PARTNERS_WITH IS_SUPPLIER_OF ACQUIRED HAS_CONTRACT_WITH AWARDED_CONTRACT";
const ownership = "IS_SUBSIDIARY_OF IS_DIRECT_PARENT_OF IS_ULTIMATE_PARENT_OF";
const properties =
  "name legal_name aliases description website headquarters_address founding_date employee_count_range " +
  "funding_stage total_funding total_funding_units operational_status";

/** The star body the specification names: evidence-round-6-fable/star-body-v2.json. */
const STAR_BODY = {
  properties: properties.split(" "),
  relationships: {
    outgoing: {
      ...limited(1000, "INVESTED_IN PARTICIPATES_IN_FUNDING_ROUND PARTICIPATES_IN_CORPORATE_EVENT"),
      ...limited(200, "PARTICIPATES_IN_EVENT OPERATES_IN_INDUSTRY HAS_HEADQUARTERS_IN IS_REGISTERED_IN"),
      ...limited(200, `${ownership} IS_BENEFICIARY_OWNER_OF IS_MEMBER_OF HAS_DOMAIN_NAME HAS_PRESENCE_IN`),
      ...limited(200, `TRADED_ON LISTED_ON ${candidates}`),
    },
    incoming: {
      ...limited(1000, "INVESTED_IN PARTICIPATES_IN_FUNDING_ROUND"),
      ...limited(200, "FOUNDED WORKS_AT IS_MEMBER_OF IS_CEO_OF IS_CTO_OF IS_CFO_OF IS_COO_OF IS_EXECUTIVE_OF"),
      ...limited(200, `IS_BOARD_MEMBER_OF IS_VICEPRESIDENT_OF ${ownership}`),
      ...limited(200, `MANUFACTURED_BY DESIGNED_BY OPERATED_BY CREATED_BY PUBLISHED_BY GRANTED_BY ${candidates}`),
      ...limited(50, "IS_BENEFICIARY_OWNER_OF"),
    },
  },
};

const { values } = parseArgs({
  options: {
    /** The .env file that holds CALA_API_KEYS. */
    env: { type: "string" },
    /** A folder to keep the answers in. */
    save: { type: "string" },
    /** Milliseconds to wait after each request, on top of the client's own pacing. */
    gap: { type: "string", default: "3000" },
    /** Another address than Cala's, to rehearse the check against a stand-in. */
    base: { type: "string", default: "https://api.cala.ai" },
  },
});

const BASE_URL = values.base;

if (values.env) process.loadEnvFile(values.env);

const keys = calaKeysFromEnv();
const events: CalaClientEvent[] = [];
const uses = keys.map(() => 0);

let sent = 0;

/** The check's own limits, enforced where nothing in the client can get around them. */
const guarded: typeof fetch = async (input, init) => {
  const key = keys.indexOf(new Headers(init?.headers).get("x-api-key") ?? "");

  if (String(input).includes("/knowledge/")) throw new Error("This check sends no knowledge requests.");
  if (sent >= MOST_REQUESTS) throw new Error(`This check sends at most ${MOST_REQUESTS} requests.`);
  if (key === -1 || uses[key] >= MOST_PER_KEY) throw new Error(`This check uses a key at most ${MOST_PER_KEY} times.`);

  sent += 1;
  uses[key] += 1;

  return fetch(input, init);
};

const store = createMemoryStore();
const onEvent = (event: CalaClientEvent) => events.push(event);
const client = createCalaClient({ keys, store, fetch: guarded, baseUrl: BASE_URL, onEvent });

/** Saves an answer the way the evidence folders hold them, so it can be imported like a fixture. */
async function save(tag: string, response: RawResponse) {
  if (!values.save || response.fromStore) return;

  const { method, url, body } = toHttp(response.request, BASE_URL);

  const saved = {
    _request: { method, path: url.slice(`${BASE_URL}/v1`.length), body: body ? JSON.parse(body) : null },
    _fetched_at: response.fetchedAt,
    _seconds: response.seconds,
    response: response.body,
  };

  await mkdir(values.save, { recursive: true });
  await writeFile(`${values.save}/${tag}.json`, JSON.stringify(saved, null, 1));
}

async function ask(tag: string, request: CalaRequest): Promise<RawResponse> {
  const before = sent;

  // A 429 would pause a key for a minute. The check reports it and does not sit it out.
  const response = await client.request(request, { priority: "customer", signal: AbortSignal.timeout(90_000) });
  const how = response.fromStore ? "from the store" : `HTTP ${response.status} in ${response.seconds} s`;
  const size = JSON.stringify(response.body).length;

  console.log(`${tag}: ${how} (${sent - before} request(s) sent, ${size} bytes)`);

  await save(tag, response);

  if (!response.fromStore) await new Promise((resolve) => setTimeout(resolve, Number(values.gap)));

  return response;
}

function report() {
  console.log(`\nRequests sent: ${sent} of at most ${MOST_REQUESTS}.`);

  for (const [key, count] of uses.entries()) {
    const answers = events.flatMap((event) =>
      event.type === "answered" && event.key === key
        ? [`${event.kind} ${event.status ?? "no answer"} in ${event.seconds} s`]
        : [],
    );

    console.log(`key ${key}: used ${count} time(s)${answers.length ? `: ${answers.join("; ")}` : ""}`);
  }

  for (const event of events) if (event.type !== "answered") console.log("event:", JSON.stringify(event));
}

async function main() {
  console.log(`${keys.length} keys loaded. Pacing: 6.1 s between starts on a key, 10 starts a minute.\n`);

  if (keys.length === 0) throw new Error("CALA_API_KEYS is empty. Pass --env with the path of the .env file.");

  const search = await ask("search-redpine", { kind: "search_entities", name: "Redpine Technology AB", limit: 5 });
  const found = (search.body as { entities?: { id: string; name: string; entity_type: string }[] }).entities ?? [];

  for (const entity of found) console.log(`  ${entity.id}  ${entity.entity_type}  ${entity.name}`);

  if (!found.some((entity) => entity.id === REDPINE)) console.log(`  The search did not return ${REDPINE}.`);

  const star: CalaRequest = { kind: "entity", entityId: REDPINE, body: STAR_BODY };
  const first = await ask("star-redpine-v2", star);
  const body = first.body as { name?: string; relationships?: Record<string, Record<string, unknown[]>> };

  for (const direction of ["outgoing", "incoming"]) {
    const lists = Object.entries(body.relationships?.[direction] ?? {}).filter(([, list]) => list.length > 0);

    console.log(`  ${direction}: ${lists.map(([name, list]) => `${name} ${list.length}`).join(", ") || "nothing"}`);
  }

  const again = await ask("star-redpine-v2 again", star);

  if (!again.fromStore || again.fetchedAt !== first.fetchedAt) {
    throw new Error("The store did not answer the second read.");
  }

  // One small search on each key that has not been used, so every key is seen to work.
  for (const name of OTHERS.slice(0, Math.max(0, keys.length - 2))) {
    await ask(`search-${name.toLowerCase().replaceAll(" ", "-")}`, { kind: "search_entities", name, limit: 5 });
  }

  const status = await client.status();

  console.log(`\nStatus: ${status.state}, ${status.keys} of ${keys.length} keys usable.`);
  console.log(`Our starts in the last minute: ${status.recentRequests}. Queued: ${status.queued}.`);
}

main()
  .then(() => report())
  .catch((error: unknown) => {
    report();

    if (error instanceof CalaUnavailableError) {
      console.log(`\nStopped at the load balancer's refusal and did not retry.\n${error.message}`);
      process.exitCode = 2;

      return;
    }

    console.log(`\nThe check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });

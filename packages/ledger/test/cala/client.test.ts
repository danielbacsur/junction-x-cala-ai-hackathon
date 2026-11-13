import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { type CalaClientEvent, type CalaClientOptions, createCalaClient } from "../../src/cala/client";
import { type Budget, CalaBudgetError, type CalaRequest } from "../../src/cala/contract";
import { CalaKeyError, CalaRateLimitError, CalaRequestError, CalaTimeoutError } from "../../src/cala/errors";
import { requestId } from "../../src/cala/id";
import { createMemoryStore } from "../../src/cala/memory";
import { CalaUnavailableError } from "../../src/contract";
import { after, type Call, failure, fakeCala, json, never, outcome, refusal } from "./fake";

const START = Date.parse("2026-11-14T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ now: START });

  // The client starts on a random key and adds random jitter to a pause. Tests start on the first.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Runs everything that is due now or within the given time on the fake clock. */
const pass = (milliseconds = 0) => vi.advanceTimersByTimeAsync(milliseconds);

const star = (name: string): CalaRequest => ({ kind: "search_entities", name });

/** The name a recorded entity search asked for, to tell the calls apart. */
const asked = (call: Call) => new URL(call.url).searchParams.get("name");

function setup(cala: ReturnType<typeof fakeCala>, options: Partial<CalaClientOptions> = {}) {
  const store = createMemoryStore();
  const events: CalaClientEvent[] = [];

  const client = createCalaClient({
    keys: ["key-a", "key-b", "key-c"],
    store,
    fetch: cala.fetch,
    onEvent: (event) => events.push(event),
    ...options,
  });

  return { client, store, events };
}

test("each kind of request becomes its HTTP request", async () => {
  const cala = fakeCala();
  const { client } = setup(cala, { keys: ["key-a"], minGapMs: 0, perMinute: 100 });
  const body = { properties: ["name"], relationships: { outgoing: { INVESTED_IN: { limit: 1000 } } } };

  await client.request({ kind: "entity", entityId: "331fec23-9c63-4885-a8f5-c2902c9e1b9d", body });
  await client.request({ kind: "search_entities", name: "Redpine AB", types: ["Company", "Organization"], limit: 5 });
  await client.request({ kind: "lookup", scheme: "cik", value: "0001321655" });
  await client.request({ kind: "knowledge_search", input: "Redpine grants?" });
  await client.request({ kind: "knowledge_query", input: "startups.location=Spain" });

  expect(cala.calls.map(({ method, url, body }) => ({ method, url, body }))).toEqual([
    { method: "POST", url: "https://api.cala.ai/v1/entities/331fec23-9c63-4885-a8f5-c2902c9e1b9d", body },
    {
      method: "GET",
      url: "https://api.cala.ai/v1/entities?name=Redpine+AB&entity_types=Company&entity_types=Organization&limit=5",
      body: null,
    },
    { method: "POST", url: "https://api.cala.ai/v1/entities/lookup", body: { id: { cik: "0001321655" } } },
    { method: "POST", url: "https://api.cala.ai/v1/knowledge/search", body: { input: "Redpine grants?" } },
    { method: "POST", url: "https://api.cala.ai/v1/knowledge/query", body: { input: "startups.location=Spain" } },
  ]);

  expect(cala.calls.every((call) => call.key === "key-a")).toBe(true);
});

test("the store answers a request that was made before, unless a fresh one is asked for", async () => {
  const cala = fakeCala(() => json({ entities: [{ id: "1", name: "Redpine" }] }));
  const { client, store } = setup(cala);

  const first = await client.request(star("Redpine"));
  const second = await client.request(star("Redpine"));

  expect(first).toMatchObject({ status: 200, fromStore: false, fetchedAt: "2026-11-14T12:00:00.000Z" });
  expect(second).toEqual({ ...first, fromStore: true });
  expect(cala.calls).toHaveLength(1);
  expect((await store.get(requestId(star("Redpine"))))?.body).toEqual({ entities: [{ id: "1", name: "Redpine" }] });

  const third = await client.request(star("Redpine"), { fresh: true });

  expect(third.fromStore).toBe(false);
  expect(cala.calls).toHaveLength(2);
});

test("an imported fixture is answered without a request", async () => {
  const cala = fakeCala();
  const { client, store } = setup(cala);
  const request: CalaRequest = { kind: "knowledge_search", input: "saved probe" };

  await store.put({
    id: requestId(request),
    request,
    status: 200,
    fetchedAt: "2026-11-14T10:28:10.000Z",
    seconds: 32.31,
    body: { content: "saved" },
    fromStore: false,
  });

  expect(await client.request(request)).toMatchObject({ fromStore: true, fetchedAt: "2026-11-14T10:28:10.000Z" });
  expect(cala.calls).toHaveLength(0);
});

test("identical requests in flight share one send", async () => {
  const cala = fakeCala();
  const { client } = setup(cala);

  const [first, second, other] = await Promise.all([
    client.request(star("Redpine")),
    client.request(star("Redpine")),
    client.request(star("Luminar")),
  ]);

  expect(cala.calls).toHaveLength(2);
  expect(second).toEqual(first);
  expect(first.fromStore).toBe(false);
  expect(other.id).not.toBe(first.id);
});

test("starts are paced on every key and go to the key that is free soonest", async () => {
  const cala = fakeCala();
  const { client, store } = setup(cala);

  const all = Promise.all(["a", "b", "c", "d", "e", "f", "g"].map((name) => client.request(star(name))));

  await pass(20_000);
  await all;

  expect(cala.calls.map((call) => [call.key, call.at - START])).toEqual([
    ["key-a", 0],
    ["key-b", 0],
    ["key-c", 0],
    ["key-a", 6_100],
    ["key-b", 6_100],
    ["key-c", 6_100],
    ["key-a", 12_200],
  ]);

  expect(store.starts(0)).toEqual([START, START + 6_100, START + 12_200]);
  expect((await client.status()).recentRequests).toBe(7);
});

test("only starts are paced, so a slow probe does not hold up the next request", async () => {
  const cala = fakeCala((call) => after(call.url.includes("/knowledge/") ? 50_000 : 300, json({})));
  const { client } = setup(cala, { keys: ["key-a"] });

  const probe = outcome(client.request({ kind: "knowledge_search", input: "a slow probe" }));
  const read = client.request(star("Redpine"), { priority: "customer" });

  await pass(6_400);

  expect((await read).status).toBe(200);
  expect(cala.calls.map((call) => call.at - START)).toEqual([0, 6_100]);
  expect(await Promise.race([probe, "still in flight"])).toBe("still in flight");

  await pass(50_000);

  expect((await probe).value).toMatchObject({ status: 200, seconds: 50 });
});

test("no key starts more than its ceiling in any rolling minute", async () => {
  const cala = fakeCala();
  const { client } = setup(cala, { keys: ["key-a"], minGapMs: 1_000, perMinute: 10 });

  const all = Promise.all(Array.from({ length: 12 }, (_, index) => client.request(star(`entity ${index}`))));

  await pass(59_999);

  expect(cala.calls).toHaveLength(10);

  await pass(2_000);
  await all;

  const starts = cala.calls.map((call) => call.at - START);

  expect(starts).toEqual([0, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000, 60_000, 61_000]);

  for (const start of starts) {
    expect(starts.filter((other) => other > start - 60_000 && other <= start).length).toBeLessThanOrEqual(10);
  }
});

test("two clients on one store share the schedule of a key", async () => {
  const cala = fakeCala();
  const store = createMemoryStore();
  const options = { keys: ["key-a"], store, fetch: cala.fetch, onEvent: () => {} };
  const one = createCalaClient(options);
  const two = createCalaClient(options);

  const all = Promise.all([one.request(star("a")), two.request(star("b")), one.request(star("c"))]);

  await pass(20_000);
  await all;

  expect(cala.calls.map((call) => call.at - START).sort((a, b) => a - b)).toEqual([0, 6_100, 12_200]);
});

test("a customer does not wait for a key that another process holds while one is free", async () => {
  const cala = fakeCala();
  const store = createMemoryStore();
  const options = { keys: ["key-a", "key-b"], store, fetch: cala.fetch, onEvent: () => {} };
  const agent = createCalaClient(options);
  const web = createCalaClient(options);

  await agent.request(star("the agent's read"));

  // Both clients begin on the first key. Only the store knows the agent has just used it.
  const patient = web.request(star("enrichment"), { priority: "background" });

  await pass();

  expect(cala.calls).toHaveLength(1);

  const customer = await web.request(star("the customer's search"), { priority: "customer" });

  expect(customer.status).toBe(200);

  await pass(6_100);
  await patient;

  expect(cala.calls.map((call) => [asked(call), call.key, call.at - START])).toEqual([
    ["the agent's read", "key-a", 0],
    ["the customer's search", "key-b", 0],
    ["enrichment", "key-a", 6_100],
  ]);
});

test("a waiting customer goes before a mandate's reads, and those before enrichment", async () => {
  const cala = fakeCala();
  const { client } = setup(cala, { keys: ["key-a"] });

  const first = client.request(star("first in, sent at once"), { priority: "background" });

  await pass();

  const rest = Promise.all([
    client.request(star("background"), { priority: "background" }),
    client.request(star("mandate"), { priority: "mandate" }),
    client.request(star("unlabelled")),
    client.request(star("customer"), { priority: "customer" }),
  ]);

  await pass(30_000);
  await Promise.all([first, rest]);

  expect(cala.calls.map(asked)).toEqual([
    "first in, sent at once",
    "customer",
    "mandate",
    "unlabelled",
    "background",
  ]);
});

test("a customer who asks for a queued background read moves it forward", async () => {
  const cala = fakeCala();
  const { client } = setup(cala, { keys: ["key-a"] });

  const first = client.request(star("in flight"), { priority: "background" });

  await pass();

  const rest = Promise.all([
    client.request(star("earlier"), { priority: "background" }),
    client.request(star("wanted"), { priority: "background" }),
    client.request(star("wanted"), { priority: "customer" }),
  ]);

  await pass(20_000);
  await Promise.all([first, rest]);

  expect(cala.calls.map(asked)).toEqual(["in flight", "wanted", "earlier"]);
});

test("a 429 pauses the key for Retry-After and the request is sent again", async () => {
  const limited = { error: "rate_limit_exceeded", message: "Too many requests." };
  const cala = fakeCala((_, index) => (index === 0 ? json(limited, 429, { "retry-after": "30" }) : json({})));
  const { client, events } = setup(cala, { keys: ["key-a"] });
  const budget: Budget = { limit: 5, used: 0 };

  const pending = outcome(client.request(star("Redpine"), { budget }));

  await pass(29_999);

  expect(cala.calls).toHaveLength(1);
  expect((await client.status()).queued).toBe(1);

  await pass(1);

  expect((await pending).value).toMatchObject({ status: 200, fromStore: false });
  expect(cala.calls.map((call) => call.at - START)).toEqual([0, 30_000]);
  expect(budget.used).toBe(2);
  expect(events).toContainEqual({
    type: "key_paused",
    key: 0,
    milliseconds: 30_000,
    reason: "HTTP 429: Too many requests.",
  });
});

test("Retry-After may be a date", async () => {
  const until = new Date(START + 45_000).toUTCString();
  const cala = fakeCala((_, index) => (index === 0 ? json({}, 429, { "retry-after": until }) : json({})));
  const { client } = setup(cala, { keys: ["key-a"] });

  const pending = outcome(client.request(star("Redpine")));

  await pass(45_000);
  await pending;

  expect(cala.calls.map((call) => call.at - START)).toEqual([0, 45_000]);
});

test("without Retry-After a 429 pauses the key for a minute and some jitter", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0.5);

  const cala = fakeCala((_, index) => (index === 0 ? json({ error: "rate_limit_exceeded" }, 429) : json({})));
  const { client } = setup(cala, { keys: ["key-a"] });

  const pending = outcome(client.request(star("Redpine")));

  await pass(62_499);

  expect(cala.calls).toHaveLength(1);

  await pass(1);
  await pending;

  expect(cala.calls.map((call) => call.at - START)).toEqual([0, 62_500]);
});

test("a request that is rate-limited on one key is retried on another that is free", async () => {
  const cala = fakeCala((call) => (call.key === "key-a" ? json({}, 429, { "retry-after": "45" }) : json({})));
  const { client } = setup(cala, { keys: ["key-a", "key-b"] });

  const response = await client.request(star("Redpine"));

  expect(response.status).toBe(200);
  expect(cala.calls.map((call) => [call.key, call.at - START])).toEqual([
    ["key-a", 0],
    ["key-b", 0],
  ]);

  // The paused key sits out its 45 seconds while the other one carries on.
  const next = Promise.all([client.request(star("a")), client.request(star("b"))]);

  await pass(12_200);
  await next;

  expect(cala.calls.slice(2).map((call) => [call.key, call.at - START])).toEqual([
    ["key-b", 6_100],
    ["key-b", 12_200],
  ]);
});

test("a request is retried three times after a 429 and then fails with a clear error", async () => {
  const cala = fakeCala(() => json({ message: "Too many requests." }, 429, { "retry-after": "10" }));
  const { client } = setup(cala, { keys: ["key-a"] });
  const budget: Budget = { limit: 10, used: 0 };

  const pending = outcome(client.request(star("Redpine"), { budget }));

  await pass(60_000);

  const { error } = await pending;

  expect(error).toBeInstanceOf(CalaRateLimitError);
  expect((error as CalaRateLimitError).status).toBe(429);
  expect((error as Error).message).toContain("retried 3 times");
  expect(cala.calls.map((call) => call.at - START)).toEqual([0, 10_000, 20_000, 30_000]);
  expect(budget.used).toBe(4);
  expect((await client.status()).state).toBe("answering");
});

test("keys that are rate-limited together slow the whole pool, which recovers after a quiet spell", async () => {
  let limited = true;

  const cala = fakeCala(() => after(100, limited ? json({}, 429, { "retry-after": "20" }) : json({})));
  const { client, events } = setup(cala, { keys: ["key-a", "key-b", "key-c", "key-d"] });

  const first = Promise.all(["a", "b", "c", "d"].map((name) => outcome(client.request(star(name)))));

  await pass(100);

  expect(cala.calls.map((call) => call.key)).toEqual(["key-a", "key-b", "key-c", "key-d"]);
  expect(events.filter((event) => event.type === "pool_slowed")).toEqual([
    { type: "pool_slowed", lanes: 2, reason: "several keys answered 429 within one minute" },
  ]);

  // Nothing is sent while the pool sits out the pause, then two keys carry the load of four.
  limited = false;

  await pass(19_999);

  expect(cala.calls).toHaveLength(4);

  await pass(10_000);

  expect((await first).every((result) => result.value?.status === 200)).toBe(true);
  expect(cala.calls.slice(4).map((call) => [call.key, call.at - START])).toEqual([
    ["key-a", 20_100],
    ["key-b", 20_100],
    ["key-a", 26_200],
    ["key-b", 26_200],
  ]);

  await pass(10 * 60_000);

  const later = Promise.all(["e", "f", "g", "h"].map((name) => client.request(star(name))));

  await pass(100);
  await later;

  expect(cala.calls.slice(8).map((call) => call.key).sort()).toEqual(["key-a", "key-b", "key-c", "key-d"]);
  expect(events).toContainEqual({ type: "pool_restored", lanes: 4 });
});

test("an HTML 403 from the load balancer latches dispatch off, and the store still answers", async () => {
  let refusing = false;

  const cala = fakeCala(() => after(200, refusing ? refusal() : json({ entities: [] })));
  const { client, store, events } = setup(cala, { keys: ["key-a", "key-b"] });

  const before = client.request(star("stored before the outage"));

  await pass(60_000);
  await before;

  refusing = true;

  const refused = outcome(client.request(star("refused")));
  const queued = [outcome(client.request(star("in flight"))), outcome(client.request(star("queued")))];

  await pass(200);

  const { error } = await refused;

  expect(error).toBeInstanceOf(CalaUnavailableError);
  expect((error as Error).message).toContain("load balancer refused a request with HTTP 403");
  expect((error as Error).message).toContain("recover()");

  // The second request was already on its way on the other key; the third never left.
  for (const result of await Promise.all(queued)) expect(result.error).toBeInstanceOf(CalaUnavailableError);

  expect(cala.calls.map(asked)).toEqual([
    "stored before the outage",
    "refused",
    "in flight",
  ]);
  expect(await store.getLatch()).toMatchObject({ latched: true, since: "2026-11-14T12:01:00.200Z" });
  expect(events.filter((event) => event.type === "latched")).toHaveLength(1);
  expect(await client.status()).toMatchObject({ state: "latched", since: "2026-11-14T12:01:00.200Z", queued: 0 });

  // No timer is left running: the client does not try again by itself, however long it waits.
  expect(vi.getTimerCount()).toBe(0);

  refusing = false;

  await pass(3_600_000);

  expect(cala.calls).toHaveLength(3);
  await expect(client.request(star("new while latched"))).rejects.toBeInstanceOf(CalaUnavailableError);
  expect(await client.request(star("stored before the outage"))).toMatchObject({ fromStore: true });
  expect(await client.request(star("stored before the outage"), { fresh: true })).toMatchObject({ fromStore: true });
  expect(cala.calls).toHaveLength(3);
});

test("recover sends one diagnostic request and unlatches only when it succeeds", async () => {
  let refusing = true;

  const cala = fakeCala(() => (refusing ? refusal() : json({ entities: [] })));
  const { client, store, events } = setup(cala, { keys: ["key-a"] });

  await expect(client.request(star("refused"))).rejects.toBeInstanceOf(CalaUnavailableError);

  const failed = client.recover();

  await pass(10_000);

  expect(await failed).toBe(false);
  expect(cala.calls).toHaveLength(2);
  expect(cala.calls[1]).toMatchObject({ method: "GET", url: "https://api.cala.ai/v1/entities?name=Cala&limit=1" });
  expect((await client.status()).state).toBe("latched");
  expect((await store.getLatch()).since).toBe("2026-11-14T12:00:00.000Z");

  refusing = false;

  const recovered = client.recover();

  await pass(10_000);

  expect(await recovered).toBe(true);
  expect(cala.calls).toHaveLength(3);
  expect(await client.status()).toMatchObject({ state: "answering", reason: null });
  expect(events.at(-1)).toEqual({ type: "recovered" });

  // The diagnostic was paced like any request: one key, 6.1 seconds between its starts.
  expect(cala.calls.map((call) => call.at - START)).toEqual([0, 6_100, 12_200]);

  const after = client.request(star("after recovery"));

  await pass(10_000);

  expect((await after).status).toBe(200);
});

test("a latch set by another process stops this one before it sends", async () => {
  const cala = fakeCala();
  const { client, store } = setup(cala, { keys: ["key-a"] });

  const first = client.request(star("sent"));
  const waiting = outcome(client.request(star("waits for the key")));

  await pass();
  await first;
  await store.setLatch({ latched: true, reason: "Another process saw the refusal." });
  await pass(10_000);

  const { error } = await waiting;

  expect(error).toBeInstanceOf(CalaUnavailableError);
  expect((error as Error).message).toContain("Another process saw the refusal.");
  expect(cala.calls).toHaveLength(1);
});

test.each([
  [401, { detail: "Invalid API key" }, "HTTP 401: Invalid API key"],
  [403, { message: "Forbidden" }, "HTTP 403: Forbidden"],
])("a JSON %i about one key disables that key and the pool carries on", async (status, body, reason) => {
  const cala = fakeCala((call) => (call.key === "key-a" ? json(body, status) : json({ entities: [] })));
  const { client, events } = setup(cala, { keys: ["key-a", "key-b"] });
  const budget: Budget = { limit: 5, used: 0 };

  const response = await client.request(star("Redpine"), { budget });

  expect(response.status).toBe(200);
  expect(cala.calls.map((call) => call.key)).toEqual(["key-a", "key-b"]);
  expect(budget.used).toBe(2);
  expect(events).toContainEqual({ type: "key_disabled", key: 0, reason });
  expect(await client.status()).toMatchObject({ state: "answering", keys: 1 });

  const more = Promise.all([client.request(star("a")), client.request(star("b"))]);

  await pass(20_000);
  await more;

  expect(cala.calls.slice(2).every((call) => call.key === "key-b")).toBe(true);
});

test("when every key is refused, requests fail without latching the pool", async () => {
  const cala = fakeCala(() => json({ detail: "Invalid API key" }, 401));
  const { client } = setup(cala, { keys: ["key-a", "key-b"] });

  await client.request(star("stored")).catch(() => {});

  const error = await failure(client.request(star("Redpine")));

  expect(error).toBeInstanceOf(CalaKeyError);
  expect(error).toBeInstanceOf(CalaUnavailableError);
  expect((error as Error).message).toContain("key 0: HTTP 401: Invalid API key");
  expect(cala.calls).toHaveLength(2);
  expect(await client.status()).toMatchObject({ state: "answering", keys: 0 });
});

test("a client without keys still answers from the store", async () => {
  const cala = fakeCala();
  const { client, store } = setup(cala, { keys: [] });
  const request = star("stored");

  const saved = { id: requestId(request), request, status: 200, fetchedAt: "", seconds: 0, body: {}, fromStore: false };

  await store.put(saved);

  expect((await client.request(request)).fromStore).toBe(true);
  await expect(client.request(star("not stored"))).rejects.toBeInstanceOf(CalaKeyError);
  expect(await client.recover()).toBe(false);
  expect(cala.calls).toHaveLength(0);
});

test("a spent budget stops a request before it is sent", async () => {
  const cala = fakeCala();
  const { client } = setup(cala);
  const budget: Budget = { limit: 2, used: 0 };

  const results = await Promise.all(["a", "b", "c"].map((name) => outcome(client.request(star(name), { budget }))));

  expect(results.map((result) => result.value?.status)).toEqual([200, 200, undefined]);
  expect(results[2].error).toBeInstanceOf(CalaBudgetError);
  expect((results[2].error as Error).message).toBe(
    'The budget of 2 Cala requests is spent, so the entity search for "c" was not sent.',
  );
  expect(cala.calls).toHaveLength(2);
  expect(budget).toEqual({ limit: 2, used: 2 });

  // The store costs nothing; a new request is refused at once.
  expect((await client.request(star("a"), { budget })).fromStore).toBe(true);
  await expect(client.request(star("d"), { budget })).rejects.toBeInstanceOf(CalaBudgetError);
  expect(cala.calls).toHaveLength(2);
});

test("callers who share one send are each charged once, and one budget only once", async () => {
  const cala = fakeCala();
  const { client } = setup(cala);
  const mine: Budget = { limit: 5, used: 0 };
  const theirs: Budget = { limit: 5, used: 0 };

  await Promise.all([
    client.request(star("Redpine"), { budget: mine }),
    client.request(star("Redpine"), { budget: mine }),
    client.request(star("Redpine"), { budget: theirs }),
  ]);

  expect(cala.calls).toHaveLength(1);
  expect(mine.used).toBe(1);
  expect(theirs.used).toBe(1);
});

test("entity requests time out after 60 seconds and knowledge requests after 120", async () => {
  const cala = fakeCala(never);
  const { client } = setup(cala);
  const budget: Budget = { limit: 5, used: 0 };

  const read = outcome(client.request({ kind: "entity", entityId: "331fec23", body: {} }, { budget }));
  const probe = outcome(client.request({ kind: "knowledge_search", input: "probe" }, { budget }));

  await pass(59_999);

  expect(cala.calls.map((call) => call.signal?.aborted)).toEqual([false, false]);

  await pass(1);

  const { error } = await read;

  expect(error).toBeInstanceOf(CalaTimeoutError);
  expect((error as Error).message).toBe("Cala did not answer the entity read of 331fec23 within 60 seconds.");
  expect(cala.calls.map((call) => call.signal?.aborted)).toEqual([true, false]);

  await pass(60_000);

  expect((await probe).error).toBeInstanceOf(CalaTimeoutError);
  expect(cala.calls.map((call) => call.signal?.aborted)).toEqual([true, true]);

  // A timed-out request was sent, so it counts, and it is not sent again.
  expect(budget.used).toBe(2);
  expect(cala.calls).toHaveLength(2);
  expect(vi.getTimerCount()).toBe(0);
});

test("pending work is cancelled through its signal and never sent", async () => {
  const cala = fakeCala();
  const { client } = setup(cala, { keys: ["key-a"] });
  const controller = new AbortController();
  const budget: Budget = { limit: 5, used: 0 };

  const first = client.request(star("sent at once"));
  const cancelled = outcome(client.request(star("cancelled"), { signal: controller.signal, budget }));
  const kept = client.request(star("kept"));

  await pass();

  expect((await client.status()).queued).toBe(2);

  controller.abort();

  expect(((await cancelled).error as Error).name).toBe("AbortError");
  expect((await client.status()).queued).toBe(1);

  await pass(20_000);
  await Promise.all([first, kept]);

  expect(cala.calls.map(asked)).toEqual(["sent at once", "kept"]);
  expect(budget.used).toBe(0);

  await expect(client.request(star("already cancelled"), { signal: controller.signal })).rejects.toMatchObject({
    name: "AbortError",
  });
});

test("cancelling the only queued request leaves no timer behind", async () => {
  const cala = fakeCala();
  const { client } = setup(cala, { keys: ["key-a"] });
  const controller = new AbortController();

  await client.request(star("sent at once"));

  const cancelled = outcome(client.request(star("cancelled"), { signal: controller.signal }));

  await pass();

  expect(vi.getTimerCount()).toBe(1);

  controller.abort();

  await pass();
  await cancelled;

  expect(vi.getTimerCount()).toBe(0);
  expect(cala.calls).toHaveLength(1);
});

test("a caller who cancels a request in flight leaves, and the answer is still stored", async () => {
  let answer: (response: Response) => void = () => {};

  const cala = fakeCala(() => new Promise((resolve) => (answer = resolve)));
  const { client, store } = setup(cala);
  const controller = new AbortController();

  const cancelled = outcome(client.request(star("Redpine"), { signal: controller.signal }));

  await pass();

  controller.abort();

  expect(((await cancelled).error as Error).name).toBe("AbortError");

  answer(json({ entities: [] }));

  await pass();

  expect(await store.get(requestId(star("Redpine")))).toMatchObject({ status: 200 });
});

test("an error status is reported with what Cala said, is not stored and is not retried", async () => {
  const missing = { error_type: "entity_not_found_error", message: "Entity not found." };
  const cala = fakeCala(() => json({ response_type: "ERROR", error: missing }, 404));
  const { client, store } = setup(cala);
  const request: CalaRequest = { kind: "lookup", scheme: "lei", value: "UNKNOWN" };

  const error = await failure(client.request(request));

  expect(error).toBeInstanceOf(CalaRequestError);
  expect(error).toMatchObject({
    status: 404,
    message: "Cala answered the lookup of lei UNKNOWN with HTTP 404: Entity not found.",
  });
  expect(cala.calls).toHaveLength(1);
  expect(await store.get(requestId(request))).toBeNull();
  expect((await client.status()).state).toBe("answering");
});

test("a network failure fails the one request and does not latch", async () => {
  const cala = fakeCala(() => Promise.reject(new TypeError("fetch failed")));
  const { client } = setup(cala);

  const error = await failure(client.request(star("Redpine")));

  expect(error).toBeInstanceOf(CalaRequestError);
  expect(error.message).toBe('The entity search for "Redpine" did not reach Cala: fetch failed');
  expect((error as CalaRequestError).status).toBeNull();
  expect((await client.status()).state).toBe("answering");
});

test("a sleep that returns at once stands in for time, so other tests need no clock", async () => {
  vi.useRealTimers();

  const cala = fakeCala((_, index) => (index === 1 ? json({}, 429) : json({ index })));
  const { client } = setup(cala, { keys: ["key-a"], sleep: async () => {} });

  const responses = await Promise.all(["a", "b", "c", "d"].map((name) => client.request(star(name))));

  expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
  expect(cala.calls).toHaveLength(5);
});

test("a key never appears in an error, an event or a stored response", async () => {
  const secret = "cala-secret-key-1";
  const replies = [
    () => json({ detail: `Key ${secret} is over its quota.` }, 429, { "retry-after": "1" }),
    () => json({ echoed: secret }),
    () => json({ message: `Bad request for ${secret}` }, 422),
    () => Promise.reject(new Error(`connect failed with header ${secret}`)),
    () => json({ detail: `Unknown key ${secret}` }, 401),
  ];

  const cala = fakeCala((_, index) => replies[index]());
  const lines: string[] = [];

  vi.spyOn(console, "warn").mockImplementation((...parts) => void lines.push(JSON.stringify(parts)));

  const store = createMemoryStore();
  const client = createCalaClient({ keys: [secret], store, fetch: cala.fetch, minGapMs: 0, perMinute: 100 });

  const stored = outcome(client.request(star("echo")));

  await pass(1_000);

  const errors = [
    await failure(client.request(star("unprocessable"))),
    await failure(client.request(star("unreachable"))),
    await failure(client.request(star("refused"))),
  ];

  expect(cala.calls).toHaveLength(5);
  expect(cala.calls.every((call) => call.key === secret)).toBe(true);

  const said = JSON.stringify([
    (await stored).value,
    errors.map((error) => error.message),
    lines,
    store.responses(),
    await client.status(),
  ]);

  expect(said).not.toContain(secret);
  expect(said).toContain("Bad request for [cala key]");
  expect(said).toContain("connect failed with header [cala key]");
  expect(said).toContain("Unknown key [cala key]");
  expect(lines).toHaveLength(2);
});

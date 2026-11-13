import { CalaUnavailableError } from "../contract";
import {
  type Budget,
  CalaBudgetError,
  type CalaClient,
  type CalaPriority,
  type CalaRequest,
  type RawResponse,
  type RawStore,
} from "./contract";
import { CalaKeyError, CalaRateLimitError, CalaRequestError, CalaTimeoutError } from "./errors";
import { describe, label, type Reply, retryAfter, toHttp } from "./http";
import { requestId } from "./id";
import { MINUTE, nextStart, withinMinute } from "./pace";

/** What the client tells its host as it happens. A key is only ever named by its index. */
export type CalaClientEvent =
  /** One request got an HTTP answer, or none (status null) on a timeout or network failure. */
  | { type: "answered"; key: number; kind: CalaRequest["kind"]; status: number | null; seconds: number }
  | { type: "key_paused"; key: number; milliseconds: number; reason: string }
  | { type: "key_disabled"; key: number; reason: string }
  /** Several keys were rate-limited together, so fewer of them are treated as independent. */
  | { type: "pool_slowed"; lanes: number; reason: string }
  | { type: "pool_restored"; lanes: number }
  | { type: "latched"; reason: string }
  | { type: "recovered" };

export type CalaClientOptions = {
  /** Cala API keys. Each key is paced against its own quota. */
  keys: string[];
  store: RawStore;
  baseUrl?: string;
  /** Milliseconds between two starts on one key. Defaults to 6,100. */
  minGapMs?: number;
  /** Starts allowed on one key in any rolling minute. Defaults to 10. */
  perMinute?: number;
  /** Replaceable for tests. */
  fetch?: typeof fetch;
  /** May resolve early when the signal aborts; the client then looks at its state again. */
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  /** Defaults to one console warning per event that is not routine. */
  onEvent?: (event: CalaClientEvent) => void;
};

const RANK: Record<CalaPriority, number> = { customer: 0, mandate: 1, background: 2 };

const ENTITY_TIMEOUT = 60_000;
const KNOWLEDGE_TIMEOUT = 120_000;

/** How often one request is sent again after a 429. */
const RETRIES = 3;
const JITTER = 5_000;

/** A slowed pool tries more keys again after this long without a 429. */
const QUIET = 10 * MINUTE;

/** A reserved start this much later than expected means another process holds the key. */
const SURPRISE = 1_000;

/** The request recover() sends: the cheapest one that still needs a key. */
const DIAGNOSTIC: CalaRequest = { kind: "search_entities", name: "Cala", limit: 1 };

type Key = {
  index: number;
  secret: string;
  /** Why Cala refused this key, once it has. A disabled key is never used again. */
  disabled: string | null;
  pausedUntil: number;
  rateLimitedAt: number;
  /** Our own reserved starts in the last minute, to tell which key is free soonest. */
  starts: number[];
};

type Waiter = {
  budget: Budget | undefined;
  resolve: (response: RawResponse) => void;
  reject: (error: unknown) => void;
  detach: () => void;
};

/** One request to Cala and every caller waiting for its answer. */
type Job = {
  id: string;
  request: CalaRequest;
  rank: number;
  order: number;
  waiters: Set<Waiter>;
  retries: number;
  /** True from the moment it is taken for sending until Cala's answer is handled. */
  flying: boolean;
  /** The budgets already charged for the current send. */
  charged: Set<Budget>;
};

/** A start reserved on one key, and whether a customer was already hurried past it. */
type Start = { key: Key; at: number; hurried: boolean };

/** What one answer means for the request that got it. */
type Verdict =
  | { kind: "answer"; response: RawResponse }
  | { kind: "rate_limited" }
  /** The HTML 403 of Cala's load balancer, which is neither about quota nor about the key. */
  | { kind: "refused"; reason: string }
  | { kind: "key_refused" }
  | { kind: "error"; error: unknown };

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);

    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }

    signal?.addEventListener("abort", done, { once: true });
  });
}

function warn(event: CalaClientEvent) {
  if (event.type === "answered") return;

  const { type, ...details } = event;

  console.warn(`[cala] ${type.replace("_", " ")}`, details);
}

/**
 * The one way requests reach Cala. It answers from the store first, paces the starts on every
 * key through the store so that several processes share one schedule, and stops sending when
 * Cala's load balancer refuses us, until an operator asks it to try again.
 */
export function createCalaClient(options: CalaClientOptions): CalaClient {
  const { store } = options;
  const baseUrl = (options.baseUrl ?? "https://api.cala.ai").replace(/\/+$/, "");
  const minGapMs = options.minGapMs ?? 6_100;
  const perMinute = options.perMinute ?? 10;
  const fetcher = options.fetch ?? fetch;
  const sleep = options.sleep ?? wait;
  const now = options.now ?? Date.now;
  const onEvent = options.onEvent ?? warn;

  const keys: Key[] = [...new Set(options.keys)].map((secret, index) => ({
    index,
    secret,
    disabled: null,
    pausedUntil: 0,
    rateLimitedAt: -Infinity,
    starts: [],
  }));

  /** Every request that is queued or in flight, by request ID, so identical ones share it. */
  const jobs = new Map<string, Job>();
  let queue: Job[] = [];
  let order = 0;

  /**
   * How many keys are treated as having a quota of their own. It starts at all of them, halves
   * when several are rate-limited together, and doubles back after a quiet spell. With fewer
   * lanes than keys only the first keys send, each still paced through the store.
   */
  let lanes = keys.length;
  /** Where the search for a free key starts. Random, so processes do not all begin on one key. */
  let cursor = Math.floor(Math.random() * keys.length);
  let poolPausedUntil = 0;
  let slowedAt = -Infinity;
  let quietSince = -Infinity;

  let pumping = false;
  let nap: AbortController | null = null;
  /** The reserved start the pump is waiting for, if it is. */
  let awaited: Start | null = null;
  /** The write of a refusal seen here. Latch reads wait for it, so nothing slips out meanwhile. */
  let refusal: Promise<void> | null = null;
  let recovering: Promise<boolean> | null = null;

  function redact(text: string): string {
    return keys.reduce((clean, key) => clean.split(key.secret).join("[cala key]"), text);
  }

  function emit(event: CalaClientEvent) {
    try {
      onEvent(event);
    } catch {
      // A host that fails to log must not fail a request.
    }
  }

  function usable(): Key[] {
    return keys.filter((key) => !key.disabled);
  }

  function noKey(): CalaKeyError {
    const refused = keys.map((key) => `key ${key.index}: ${key.disabled}`).join("; ");

    return new CalaKeyError(
      keys.length === 0
        ? "No Cala key is configured, so nothing can be asked of Cala. Set CALA_API_KEYS."
        : `Cala refused every configured key, so nothing can be asked of Cala (${refused}).`,
    );
  }

  /**
   * The key that may start soonest as far as this process knows, the pause it sits out first, if
   * any, and when it is expected to be free. Among equals the least recently used one is taken.
   */
  function choose(time: number, except?: Key): { key: Key; pausedUntil: number; readyAt: number } | null {
    const pool = usable();

    if (lanes < pool.length && time - Math.max(quietSince, slowedAt) >= QUIET) {
      lanes = Math.min(pool.length, lanes * 2);
      quietSince = time;

      emit({ type: "pool_restored", lanes });
    }

    const paused = (key: Key) => Math.max(key.pausedUntil, poolPausedUntil, time);
    const turn = (key: Key) => (key.index - cursor + keys.length) % keys.length;

    // With fewer lanes than keys, the first keys that sit out no pause carry the load.
    const active = pool
      .sort((a, b) => paused(a) - paused(b) || a.index - b.index)
      .slice(0, Math.max(1, lanes))
      .sort((a, b) => turn(a) - turn(b));

    let best: { key: Key; pausedUntil: number; readyAt: number } | null = null;

    for (const key of active) {
      if (key === except) continue;

      key.starts = withinMinute(key.starts, time);

      const pausedUntil = paused(key);
      const readyAt = Math.max(pausedUntil, nextStart(key.starts, time, minGapMs, perMinute));

      if (!best || readyAt < best.readyAt) best = { key, pausedUntil, readyAt };
    }

    return best;
  }

  /** Lifts the pauses that a completed sleep has sat out, so an injected sleep counts as time. */
  function release(until: number) {
    for (const key of keys) if (key.pausedUntil <= until) key.pausedUntil = 0;

    if (poolPausedUntil <= until) poolPausedUntil = 0;
  }

  /** Reserves the next start on one key through the store and returns how long to wait for it. */
  async function reserve(key: Key): Promise<number> {
    const delay = await store.reserve(key.index, minGapMs, perMinute);

    key.starts.push(now() + delay);
    cursor = (key.index + 1) % keys.length;

    return delay;
  }

  /** Sleeps unless woken. True when the whole time has passed. */
  async function rest(milliseconds: number): Promise<boolean> {
    const controller = new AbortController();

    nap = controller;

    try {
      await sleep(milliseconds, controller.signal);
    } finally {
      if (nap === controller) nap = null;
    }

    return !controller.signal.aborted;
  }

  async function readLatch() {
    if (refusal) await refusal;

    return store.getLatch();
  }

  /** Records the refusal in the store once, for every process, and leaves an earlier one as it is. */
  function latch(reason: string): Promise<void> {
    refusal ??= (async () => {
      try {
        if ((await store.getLatch()).latched) return;

        await store.setLatch({ latched: true, reason });

        emit({ type: "latched", reason });
      } finally {
        refusal = null;
      }
    })();

    return refusal;
  }

  function unavailable(request: CalaRequest, latched: { since: string | null; reason: string | null }) {
    const since = latched.since ? ` since ${latched.since}` : "";
    const reason = latched.reason ? ` ${latched.reason}` : "";

    return new CalaUnavailableError(
      `Cala is not answering${since}, and the ${label(request)} is not in the store.${reason} ` +
        "Nothing is sent until recover() succeeds.",
    );
  }

  function settle(job: Job, outcome: { response: RawResponse } | { error: unknown }) {
    jobs.delete(job.id);

    for (const waiter of job.waiters) {
      waiter.detach();

      if ("response" in outcome) waiter.resolve(outcome.response);
      else waiter.reject(outcome.error);
    }

    job.waiters.clear();
  }

  function failQueued(error: (job: Job) => unknown) {
    const failed = queue;

    queue = [];

    for (const job of failed) settle(job, { error: error(job) });

    nap?.abort();
  }

  /** One caller stops waiting. A queued job nobody waits for is dropped; a sent one still lands. */
  function leave(job: Job, waiter: Waiter) {
    waiter.detach();
    job.waiters.delete(waiter);

    if (job.waiters.size > 0 || job.flying) return;

    jobs.delete(job.id);
    queue = queue.filter((queued) => queued !== job);

    if (queue.length === 0) nap?.abort();
  }

  function requeue(job: Job) {
    job.flying = false;
    job.charged.clear();

    if (job.waiters.size === 0) {
      jobs.delete(job.id);

      return;
    }

    // It keeps its place in line, which is ahead of everything that arrived after it.
    queue.push(job);
    pump();
  }

  /** The next job to send: a waiting customer first, then by arrival. Charges its budgets. */
  function take(): Job | null {
    for (;;) {
      const job = queue.reduce<Job | null>(
        (best, candidate) =>
          !best || candidate.rank < best.rank || (candidate.rank === best.rank && candidate.order < best.order)
            ? candidate
            : best,
        null,
      );

      if (!job) return null;

      queue = queue.filter((queued) => queued !== job);

      for (const waiter of [...job.waiters]) {
        if (!waiter.budget || waiter.budget.used < waiter.budget.limit) continue;

        waiter.detach();
        job.waiters.delete(waiter);
        waiter.reject(spent(waiter.budget, job.request));
      }

      if (job.waiters.size === 0) {
        jobs.delete(job.id);

        continue;
      }

      for (const waiter of job.waiters) charge(job, waiter.budget);

      job.flying = true;

      return job;
    }
  }

  function spent(budget: Budget, request: CalaRequest) {
    return new CalaBudgetError(
      `The budget of ${budget.limit} Cala requests is spent, so the ${label(request)} was not sent.`,
    );
  }

  /** Counts one send against a budget, once however many callers share that budget. */
  function charge(job: Job, budget: Budget | undefined) {
    if (!budget || job.charged.has(budget)) return;

    budget.used += 1;
    job.charged.add(budget);
  }

  /** Sends one request with one key and reads the whole answer, inside the request's time limit. */
  async function exchange(request: CalaRequest, key: Key): Promise<Reply> {
    const { method, url, body } = toHttp(request, baseUrl);
    const limit = request.kind.startsWith("knowledge") ? KNOWLEDGE_TIMEOUT : ENTITY_TIMEOUT;
    const controller = new AbortController();

    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const seconds = limit / 1_000;

        reject(new CalaTimeoutError(`Cala did not answer the ${label(request)} within ${seconds} seconds.`, null));
        controller.abort();
      }, limit);
    });

    const answer = (async (): Promise<Reply> => {
      const response = await fetcher(url, {
        method,
        body,
        signal: controller.signal,
        headers: {
          "X-API-KEY": key.secret,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
      });

      const text = redact(await response.text());
      const reply: Reply = { status: response.status, text, json: null, isJson: false, retryAfter: null };

      reply.retryAfter = response.headers.get("retry-after");

      try {
        reply.json = JSON.parse(text);
        reply.isJson = true;
      } catch {
        // An HTML page or an empty body. The status decides what it means.
      }

      return reply;
    })();

    // After a timeout the abandoned fetch rejects with nobody listening.
    answer.catch(() => {});

    try {
      return await Promise.race([answer, timeout]);
    } catch (error) {
      if (error instanceof CalaTimeoutError) throw error;

      const cause = redact(error instanceof Error ? error.message : String(error));

      throw new CalaRequestError(`The ${label(request)} did not reach Cala: ${cause}`, null);
    } finally {
      clearTimeout(timer);
    }
  }

  /** One send, and what its answer means for the key, the pool and the latch. */
  async function attempt(request: CalaRequest, key: Key): Promise<Verdict> {
    const started = now();
    const seconds = () => Math.round((now() - started) / 10) / 100;

    let reply: Reply;

    try {
      reply = await exchange(request, key);
    } catch (error) {
      emit({ type: "answered", key: key.index, kind: request.kind, status: null, seconds: seconds() });

      return { kind: "error", error };
    }

    const { status } = reply;
    const time = now();

    emit({ type: "answered", key: key.index, kind: request.kind, status, seconds: seconds() });

    if (status >= 200 && status < 300 && reply.isJson) {
      const response: RawResponse = {
        id: requestId(request),
        request,
        status,
        fetchedAt: new Date(time).toISOString(),
        seconds: seconds(),
        body: reply.json,
        fromStore: false,
      };

      return { kind: "answer", response };
    }

    if (status === 429) {
      const pause = retryAfter(reply.retryAfter, time) ?? MINUTE + Math.random() * JITTER;
      const together = keys.some((other) => other !== key && time - other.rateLimitedAt < MINUTE);

      key.pausedUntil = Math.max(key.pausedUntil, time + pause);
      key.rateLimitedAt = time;
      quietSince = time;

      const reason = `HTTP 429: ${describe(reply)}`;

      emit({ type: "key_paused", key: key.index, milliseconds: Math.round(pause), reason });

      // Two keys refused within a minute do not have a quota each, whatever the accounts say.
      if (together) {
        poolPausedUntil = Math.max(poolPausedUntil, time + pause);

        if (time - slowedAt >= MINUTE) {
          lanes = Math.max(1, Math.floor(Math.min(lanes, usable().length) / 2));
          slowedAt = time;

          emit({ type: "pool_slowed", lanes, reason: "several keys answered 429 within one minute" });
        }
      }

      return { kind: "rate_limited" };
    }

    if (status === 403 && !reply.isJson) {
      return {
        kind: "refused",
        reason: `Cala's load balancer refused a request with HTTP 403 and an HTML page (${describe(reply)}).`,
      };
    }

    if (status === 401 || status === 403) {
      key.disabled = `HTTP ${status}: ${describe(reply)}`;

      emit({ type: "key_disabled", key: key.index, reason: key.disabled });

      return { kind: "key_refused" };
    }

    const said = reply.isJson || status >= 300 ? describe(reply) : "a body that is not JSON";

    return {
      kind: "error",
      error: new CalaRequestError(`Cala answered the ${label(request)} with HTTP ${status}: ${said}`, status),
    };
  }

  async function fly(job: Job, key: Key) {
    try {
      const verdict = await attempt(job.request, key);

      switch (verdict.kind) {
        case "answer":
          await store.put(verdict.response);

          return settle(job, { response: verdict.response });

        case "rate_limited":
          job.retries += 1;

          if (job.retries <= RETRIES) return requeue(job);

          return settle(job, {
            error: new CalaRateLimitError(
              `Cala rate-limited the ${label(job.request)} ${job.retries} times (HTTP 429). ` +
                `It was retried ${RETRIES} times and is given up.`,
              429,
            ),
          });

        case "refused": {
          const written = latch(verdict.reason);
          const latched = { since: new Date(now()).toISOString(), reason: verdict.reason };

          failQueued((queued) => unavailable(queued.request, latched));

          // The latch failing to save must not hide the refusal from this caller.
          await written.catch(() => {});

          return settle(job, { error: unavailable(job.request, latched) });
        }

        case "key_refused":
          if (usable().length > 0) return requeue(job);

          failQueued(noKey);

          return settle(job, { error: noKey() });

        case "error":
          return settle(job, { error: verdict.error });
      }
    } catch (error) {
      settle(job, { error });
    }
  }

  async function run() {
    while (queue.length > 0) {
      const latched = await readLatch();

      if (latched.latched) return failQueued((job) => unavailable(job.request, latched));

      const choice = choose(now());

      if (!choice) return failQueued(noKey);

      // Every usable key is paused by a 429. Sit it out before reserving, then look again.
      if (choice.pausedUntil > now()) {
        if (await rest(choice.pausedUntil - now())) release(choice.pausedUntil);

        continue;
      }

      const { key } = choice;
      const delay = await reserve(key);

      if (delay > 0) {
        const start: Start = { key, at: now() + delay, hurried: false };

        awaited = start;

        if (queue.some((job) => job.rank === RANK.customer)) void hurry(start);

        const rested = await rest(delay);

        awaited = null;

        // Woken early means the queue emptied. The start is given up, never used before its time.
        if (!rested) continue;

        const later = await readLatch();

        if (later.latched) return failQueued((job) => unavailable(job.request, later));
      }

      // The key may have been paused or refused while this start was waited for.
      if (key.disabled || Math.max(key.pausedUntil, poolPausedUntil) > now()) continue;

      const job = take();

      if (job) void fly(job, key);
    }
  }

  /**
   * One try at a sooner start for a waiting customer, on another key than the one the pump waits
   * for. Only the store knows what other processes took, so a key this process believed free can
   * turn out to be held while another is not. If the try fails, its reservation is a start that
   * nobody uses, which is why a customer gets one and other work gets none.
   */
  async function hurry(start: Start) {
    const other = start.hurried ? null : choose(now(), start.key);

    if (!other || other.readyAt + SURPRISE >= start.at) return;

    start.hurried = true;

    try {
      const { key } = other;
      const delay = await reserve(key);

      if (now() + delay >= start.at) return;
      if (delay > 0) await sleep(delay);

      const latched = await readLatch();

      if (latched.latched) return failQueued((job) => unavailable(job.request, latched));
      if (key.disabled || Math.max(key.pausedUntil, poolPausedUntil) > now()) return;

      const job = take();

      if (job) void fly(job, key);
      if (queue.length === 0) nap?.abort();
    } catch {
      // The customer still has the start the pump is waiting for.
    }
  }

  function pump() {
    if (pumping) return;

    pumping = true;

    run()
      .catch((error) => failQueued(() => error))
      .finally(() => {
        pumping = false;

        if (queue.length > 0) pump();
      });
  }

  /** The one request recover() sends, on the key that is free soonest and paced like any other. */
  async function diagnose(): Promise<boolean> {
    if (refusal) await refusal.catch(() => {});

    let choice = choose(now());

    while (choice && choice.pausedUntil > now()) {
      await sleep(choice.pausedUntil - now());
      release(choice.pausedUntil);

      choice = choose(now());
    }

    if (!choice) return false;

    const { key } = choice;
    const delay = await reserve(key);

    if (delay > 0) await sleep(delay);

    const verdict = await attempt(DIAGNOSTIC, key);

    if (verdict.kind === "refused") await latch(verdict.reason);
    if (verdict.kind !== "answer") return false;

    await store.put(verdict.response);

    if ((await store.getLatch()).latched) {
      await store.setLatch({ latched: false, reason: null });

      emit({ type: "recovered" });
    }

    return true;
  }

  return {
    async request(request, { priority = "mandate", fresh = false, budget, signal } = {}) {
      const id = requestId(request);

      signal?.throwIfAborted();

      if (!fresh) {
        const stored = await store.get(id);

        if (stored) return { ...stored, fromStore: true };
      }

      const latched = await readLatch();

      if (latched.latched) {
        // A fresh read cannot be had. The stored answer, which carries its own fetch time, can.
        const stored = fresh ? await store.get(id) : null;

        if (stored) return { ...stored, fromStore: true };

        throw unavailable(request, latched);
      }

      signal?.throwIfAborted();

      if (usable().length === 0) throw noKey();

      const existing = jobs.get(id);
      // A caller whose budget already paid for the send in flight may wait for it again.
      const paid = budget !== undefined && existing?.flying === true && existing.charged.has(budget);

      if (budget && budget.used >= budget.limit && !paid) throw spent(budget, request);

      return new Promise<RawResponse>((resolve, reject) => {
        const job: Job = existing ?? {
          id,
          request,
          rank: RANK[priority],
          order: order++,
          waiters: new Set(),
          retries: 0,
          flying: false,
          charged: new Set(),
        };

        if (!existing) {
          jobs.set(id, job);
          queue.push(job);
        }

        const waiter: Waiter = { budget, resolve, reject, detach: () => {} };

        if (signal) {
          const abort = () => {
            leave(job, waiter);
            reject(signal.reason);
          };

          signal.addEventListener("abort", abort, { once: true });
          waiter.detach = () => signal.removeEventListener("abort", abort);
        }

        job.waiters.add(waiter);
        job.rank = Math.min(job.rank, RANK[priority]);

        // Joining a request that is already on its way still counts as one request for the joiner.
        if (job.flying) charge(job, budget);
        if (awaited && job.rank === RANK.customer && !job.flying) void hurry(awaited);

        pump();
      });
    },

    async status() {
      if (refusal) await refusal.catch(() => {});

      const [latched, recentRequests] = await Promise.all([store.getLatch(), store.recentStarts()]);

      return {
        state: latched.latched ? "latched" : "answering",
        since: latched.since,
        reason: latched.reason,
        recentRequests,
        queued: queue.length,
        keys: usable().length,
      };
    },

    recover() {
      recovering ??= diagnose().finally(() => {
        recovering = null;
      });

      return recovering;
    },
  };
}

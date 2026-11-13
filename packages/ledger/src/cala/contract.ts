/**
 * The seam between the ledger and Cala. The ledger plans reads against CalaClient and never
 * sends a request itself, so every request passes one pacing, caching and outage rule.
 */

/** One Cala request, described by what is asked, not by how it is sent. */
export type CalaRequest =
  /** POST /v1/entities/{id} with a properties and relationships body (a star, hub or round read). */
  | { kind: "entity"; entityId: string; body: unknown }
  /** GET /v1/entities?name=…, the fuzzy name search. */
  | { kind: "search_entities"; name: string; types?: string[]; limit?: number }
  /** POST /v1/entities/lookup with exactly one identifier scheme, such as lei or cik. */
  | { kind: "lookup"; scheme: string; value: string }
  /** POST /v1/knowledge/search, used for signal probes. Expect 30 to 60 seconds. */
  | { kind: "knowledge_search"; input: string }
  /** POST /v1/knowledge/query, fallback discovery only. Its rows carry no sources. */
  | { kind: "knowledge_query"; input: string };

/** Who is waiting. A waiting customer goes before a mandate's reads, and those before enrichment. */
export type CalaPriority = "customer" | "mandate" | "background";

export type RawResponse = {
  /** Stable hash of the request: endpoint, entity, fields, direction, pagination. */
  id: string;
  request: CalaRequest;
  status: number;
  fetchedAt: string;
  seconds: number;
  body: unknown;
  /** True when the store answered and no request was sent. */
  fromStore: boolean;
};

/** A ceiling on requests for one piece of work. The client counts sent requests, retries included. */
export type Budget = { limit: number; used: number };

export type CalaStatus = {
  /** "latched" means Cala refused us (an HTML 403) and dispatch is off until recover() succeeds. */
  state: "answering" | "latched";
  since: string | null;
  reason: string | null;
  /** Our own requests in the last minute across all keys. Not Cala's remaining balance. */
  recentRequests: number;
  queued: number;
  keys: number;
};

/** Thrown when a budget is spent. The caller returns partial results and a scoped continuation. */
export class CalaBudgetError extends Error {}

export interface CalaClient {
  /**
   * Answers from the store when the same request was made before, unless `fresh` is set.
   * Throws CalaUnavailableError (from ../contract) when latched and the store has no answer,
   * and CalaBudgetError when the budget is spent.
   */
  request(
    request: CalaRequest,
    options?: { priority?: CalaPriority; fresh?: boolean; budget?: Budget; signal?: AbortSignal },
  ): Promise<RawResponse>;
  status(): Promise<CalaStatus>;
  /** One counted diagnostic request, on an operator's word. Unlatches on success. */
  recover(): Promise<boolean>;
}

/**
 * Where the client keeps raw responses and coordinates pacing across processes. The ledger
 * implements it over Postgres; tests use an in-memory one.
 */
export interface RawStore {
  get(id: string): Promise<RawResponse | null>;
  put(response: RawResponse): Promise<void>;
  getLatch(): Promise<{ latched: boolean; since: string | null; reason: string | null }>;
  setLatch(latch: { latched: boolean; reason: string | null }): Promise<void>;
  /**
   * Atomically reserves the next start for one key and returns how many milliseconds the caller
   * must wait before sending. Starts on one key are at least minGapMs apart and at most
   * perMinute fall in any rolling minute.
   */
  reserve(keyIndex: number, minGapMs: number, perMinute: number): Promise<number>;
  /** Starts recorded in the last minute, across all keys. */
  recentStarts(): Promise<number>;
}

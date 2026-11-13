import type { CalaClient, RawStore } from "./contract";

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
  sleep?: (milliseconds: number) => Promise<void>;
};

export function createCalaClient(options: CalaClientOptions): CalaClient {
  void options;

  throw new Error("The Cala client is not implemented yet.");
}

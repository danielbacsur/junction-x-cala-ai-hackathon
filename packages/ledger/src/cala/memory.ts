import type { RawResponse, RawStore } from "./contract";
import { MINUTE, nextStart, withinMinute } from "./pace";

export type MemoryStore = RawStore & {
  /** Every stored response, oldest first. */
  responses(): RawResponse[];
  /** The reserved starts of one key that are still inside the rolling minute, oldest first. */
  starts(keyIndex: number): number[];
};

/**
 * A RawStore that lives in one process, for tests and one-off scripts. It paces exactly as the
 * Postgres store has to, but nothing in it survives the process or is shared with another one.
 */
export function createMemoryStore(options: { now?: () => number } = {}): MemoryStore {
  const now = options.now ?? Date.now;
  const responses = new Map<string, RawResponse>();
  const lanes = new Map<number, number[]>();

  let latch: { latched: boolean; since: string | null; reason: string | null } = {
    latched: false,
    since: null,
    reason: null,
  };

  return {
    async get(id) {
      return responses.get(id) ?? null;
    },

    async put(response) {
      responses.set(response.id, response);
    },

    async getLatch() {
      return { ...latch };
    },

    async setLatch({ latched, reason }) {
      // Since is when the state last changed, so a repeated refusal does not move it.
      const since = latched === latch.latched ? latch.since : new Date(now()).toISOString();

      latch = { latched, since, reason };
    },

    async reserve(keyIndex, minGapMs, perMinute) {
      const time = now();
      const starts = withinMinute(lanes.get(keyIndex) ?? [], time);
      const at = nextStart(starts, time, minGapMs, perMinute);

      lanes.set(keyIndex, [...starts, at]);

      return at - time;
    },

    async recentStarts() {
      const time = now();

      return [...lanes.values()].flat().filter((start) => start > time - MINUTE && start <= time).length;
    },

    responses() {
      return [...responses.values()];
    },

    starts(keyIndex) {
      return withinMinute(lanes.get(keyIndex) ?? [], now());
    },
  };
}

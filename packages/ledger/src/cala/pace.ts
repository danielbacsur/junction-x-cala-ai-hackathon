/** The rolling window Cala's quota is counted over. */
export const MINUTE = 60_000;

/** Drops the starts that left the rolling minute. Reserved starts in the future stay. */
export function withinMinute(starts: number[], now: number): number[] {
  return starts.filter((start) => start > now - MINUTE);
}

/**
 * The earliest moment a new start fits after the given ones, which are in ascending order: at
 * least minGapMs after the last, and never the one that makes more than perMinute in a minute.
 */
export function nextStart(starts: number[], now: number, minGapMs: number, perMinute: number): number {
  let at = now;

  const last = starts.at(-1);

  if (last !== undefined) at = Math.max(at, last + minGapMs);
  if (starts.length >= perMinute) at = Math.max(at, starts[starts.length - perMinute] + MINUTE);

  return at;
}

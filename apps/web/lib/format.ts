/**
 * Dates and amounts as the surface words them. Times are shown in Helsinki time, where Slush is,
 * so the server and the browser always print the same thing.
 */
const ZONE = "Europe/Helsinki";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ZONE });
const STAMP = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONE,
});

/** An ISO date at the precision it has: "2025", "Mar 2025" or "13 Mar 2025". Never padded out. */
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;

  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!month) return year;

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day ?? 1)));
  if (Number.isNaN(date.getTime())) return iso;

  return day ? DAY.format(date) : MONTH.format(date);
}

/** A moment as "14 Nov, 12:30". */
export function formatStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;

  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? iso : STAMP.format(date);
}

/** A moment as "12:30". */
export function formatClock(iso: string | null | undefined): string | null {
  if (!iso) return null;

  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? iso : CLOCK.format(date);
}

const GROUPED = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** "NOK 14,376,817". The units are whatever Cala gave; a missing value stays missing. */
export function formatAmount(value: number | null | undefined, units: string | null | undefined): string | null {
  if (value == null) return null;

  return units ? `${units} ${GROUPED.format(value)}` : GROUPED.format(value);
}

/** "12s", "1m 22s", "2h 5m". */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));

  if (whole < 60) return `${whole}s`;
  if (whole < 3600) return `${Math.floor(whole / 60)}m ${whole % 60}s`;

  return `${Math.floor(whole / 3600)}h ${Math.floor((whole % 3600) / 60)}m`;
}

/** "1 read", "3 reads". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${GROUPED.format(count)} ${count === 1 ? one : many}`;
}

import { createHash } from "node:crypto";

import type { SourceRef } from "../contract";
import type { Db } from "../db";

/** A timestamp column as an ISO string. node-postgres returns a string and PGlite a Date. */
export function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const date = value instanceof Date ? value : new Date(String(value));

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A jsonb parameter. Both drivers take it as text behind a `::jsonb` cast. */
export function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** A short stable ID for a derived row, from the values that identify it. */
export function hashId(...parts: (string | number | null | undefined)[]): string {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("\u001f"))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Inserts rows through one jsonb parameter ($1), in slices small enough for any driver. Further
 * parameters follow as $2 and up.
 */
export async function insertRows(
  db: Db,
  rows: Record<string, unknown>[],
  statement: string,
  parameters: unknown[] = [],
): Promise<void> {
  for (let start = 0; start < rows.length; start += 500) {
    await db.query(statement, [json(rows.slice(start, start + 500)), ...parameters]);
  }
}

/** The last row for each key, so one statement never touches a row twice. */
export function uniqueBy<Row>(rows: Row[], key: (row: Row) => string): Row[] {
  return [...new Map(rows.map((row) => [key(row), row])).values()];
}

/** Words of a text in lowercase, joined by single spaces and padded, for whole-word matching. */
export function textKey(text: string): string {
  const words = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  return ` ${words} `;
}

/** True when the name occurs in the text as whole words. */
export function mentions(text: string, name: string): boolean {
  const key = nameKey(name);

  return key.length > 0 && textKey(text).includes(` ${key} `);
}

/** Lowercase letters and digits only, without a trailing legal form. */
export function nameKey(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  while (words.length > 1 && legalForms.has(words[words.length - 1]!)) words.pop();

  return words.join(" ");
}

const legalForms = new Set([
  "ab",
  "ag",
  "aps",
  "as",
  "asa",
  "bv",
  "co",
  "corp",
  "corporation",
  "gmbh",
  "inc",
  "kg",
  "limited",
  "llc",
  "lp",
  "ltd",
  "nv",
  "oy",
  "oyj",
  "plc",
  "sa",
  "sarl",
  "sas",
  "sl",
  "spa",
  "srl",
]);

/** Cala's provenance labels, strongest first. An unlabelled source ranks below all of them. */
const rankOrder = ["FILING", "PRIMARY", "PRESS", "AGGREGATOR"];

export function rankValue(rank: string | null | undefined): number {
  const position = rank ? rankOrder.indexOf(rank) : -1;

  return position === -1 ? 0 : rankOrder.length - position;
}

/** The strongest provenance label among a hop's sources, or null when none is labelled. */
export function bestRank(sources: SourceRef[]): string | null {
  let best: string | null = null;

  for (const source of sources) {
    if (rankValue(source.rank) > rankValue(best)) best = source.rank;
  }

  return best;
}

type CalaSource = {
  name?: string | null;
  document?: string | null;
  date?: string | null;
  source_rank?: string | null;
};

/** Cala's source objects as SourceRefs, without repeats. Missing parts stay null. */
export function toSources(raw: unknown): SourceRef[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const sources: SourceRef[] = [];

  for (const item of raw as CalaSource[]) {
    if (!item || typeof item !== "object") continue;

    const source: SourceRef = {
      name: item.name || null,
      url: item.document || null,
      date: item.date || null,
      rank: item.source_rank || null,
    };
    const key = `${source.name}|${source.url}|${source.date}|${source.rank}`;

    if (seen.has(key)) continue;

    seen.add(key);
    sources.push(source);
  }

  return sources;
}

/** Several source lists as one, without repeats. */
export function mergeSources(...lists: (SourceRef[] | null | undefined)[]): SourceRef[] {
  const seen = new Set<string>();
  const merged: SourceRef[] = [];

  for (const list of lists) {
    for (const source of list ?? []) {
      const key = `${source.name}|${source.url}|${source.date}|${source.rank}`;

      if (seen.has(key)) continue;

      seen.add(key);
      merged.push(source);
    }
  }

  return merged;
}

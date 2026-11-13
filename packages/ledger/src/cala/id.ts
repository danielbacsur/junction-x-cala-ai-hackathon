import { createHash } from "node:crypto";

import type { CalaRequest } from "./contract";

/** JSON with object keys in sorted order, so equal requests serialize equally. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`);

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

/**
 * The store key of a request. The fixture importer and the live client both use it, so a
 * request that was saved once is answered from the store wherever it is asked again.
 */
export function requestId(request: CalaRequest): string {
  return createHash("sha256").update(canonical(request)).digest("hex");
}

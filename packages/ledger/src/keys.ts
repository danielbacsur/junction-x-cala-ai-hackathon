/**
 * Reads the Cala keys from the environment. CALA_API_KEYS holds several keys separated by commas
 * or whitespace, and each one is paced against its own quota. CALA_API_KEY, a single key, is the
 * fallback.
 */
export function calaKeysFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  const keys = (env.CALA_API_KEYS ?? env.CALA_API_KEY ?? "")
    .split(/[\s,]+/)
    .map((key) => key.trim())
    .filter(Boolean);

  return [...new Set(keys)];
}

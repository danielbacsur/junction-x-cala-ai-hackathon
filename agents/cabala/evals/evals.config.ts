import { defineEvalConfig } from "eve/evals";

// A turn here reads a ledger, calls a model several times and may run a second read, so the
// defaults are too tight. Every eval works its own copy of a seeded mandate; see guest.ts.
export default defineEvalConfig({
  maxConcurrency: 4,
  timeoutMs: 8 * 60 * 1_000,
});

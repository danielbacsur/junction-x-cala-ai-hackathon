import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every file starts its own in-memory Postgres, which takes seconds when files run side by side.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

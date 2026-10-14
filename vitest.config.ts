import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest configuration for Phase 1 server-side tests.
// - Node environment (tests touch SQLite + onnxruntime-node, both Node-only).
// - Path alias "@/..." mirrors tsconfig so tests import the same modules as the app.
// - Long timeout for the first run, which may download the embedding model.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Retrieval tests share a lazily-loaded embedding singleton; running files
    // sequentially avoids redundant model loads and keeps memory low.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});

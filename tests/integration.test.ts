// tests/integration.test.ts
// (13) Existing chat and document workflows are not broken, and the new
// context-builder integrates retrieval + memory without throwing.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { openDbAt } from "@/lib/server/db";
import { ingestDocument } from "@/lib/server/retrieval-store";
import { createMemory } from "@/lib/server/memory-store";
import { buildTurnContext } from "@/lib/server/context-builder";
import { tmpDbPath, cleanupDbPath, DOCS, USER_A } from "./fixtures";

// Legacy TF-IDF path must still import and function (it is the fallback).
import { indexDocument, retrieveRelevant } from "@/lib/rag-store";

describe("legacy TF-IDF retrieval still works (non-regression)", () => {
  it("indexes and retrieves via the original in-memory store", async () => {
    const n = await indexDocument("legacy-doc", [
      "alpha beta gamma delta",
      "the quick brown fox jumps",
    ]);
    expect(n).toBe(2);
    const res = await retrieveRelevant("quick brown fox", ["legacy-doc"], 3);
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeGreaterThan(0);
  });
});

describe("context-builder integration", () => {
  let dbPath: string;
  let db: Database.Database;

  beforeAll(async () => {
    // The context-builder uses the default singleton DB, so point that at a
    // temp file for this suite via the env var before any getDb() call here.
    dbPath = tmpDbPath("integration");
    process.env.SECOND_BRAIN_DB_PATH = dbPath;
    db = openDbAt(dbPath);
    for (const d of DOCS) {
      await ingestDocument({ userId: USER_A, name: d.name, text: d.text }, db);
    }
    createMemory(
      { userId: USER_A, entity: "user", attribute: "favorite_topic", value: "astronomy", source: "chat:1" },
      db
    );
  });

  afterAll(() => {
    db.close();
    cleanupDbPath(dbPath);
    delete process.env.SECOND_BRAIN_DB_PATH;
  });

  it("returns empty context when userId or query is missing", async () => {
    const noUser = await buildTurnContext({ userId: "", query: "cats" });
    expect(noUser.retrievalContext).toBe("");
    expect(noUser.memoryContext).toBe("");

    const noQuery = await buildTurnContext({ userId: USER_A, query: "   " });
    expect(noQuery.retrievalContext).toBe("");
    expect(noQuery.memoryContext).toBe("");
  });

  it("builds combined retrieval + memory context for a real query", async () => {
    const ctx = await buildTurnContext({
      userId: USER_A,
      query: "galaxies nebulae telescope",
    });
    // Memory leg should surface the active fact.
    expect(ctx.memoryContext).toContain("favorite_topic");
    expect(ctx.stats.injectedMemories).toBeGreaterThan(0);
    // Retrieval leg should surface the astronomy document (lexical match at least).
    expect(ctx.stats.retrievedChunks).toBeGreaterThan(0);
    expect(ctx.retrievalContext).toContain("astronomy.txt");
  });
});

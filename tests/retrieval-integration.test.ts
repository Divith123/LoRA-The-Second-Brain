// tests/retrieval-integration.test.ts
// Part 1 regression tests: the upload -> index -> retrieve -> context flow that
// was previously returning retrievedChunks=0. Verifies corpus-wide retrieval,
// the dedup/orphaned-id fix, diagnostics, and persistence across restart.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { openDbAt } from "@/lib/server/db";
import {
  ingestDocument,
  hybridRetrieveWithDiagnostics,
  retrievalStats,
} from "@/lib/server/retrieval-store";
import { buildTurnContext } from "@/lib/server/context-builder";
import { tmpDbPath, cleanupDbPath, USER_A, USER_B } from "./fixtures";

const ORION_TEXT = "Project Orion uses a blue access code named SKY-482.";
const ORION_QUERY = "What access code does Project Orion use?";

describe("Part 1 — upload -> index -> retrieve (corpus-wide)", () => {
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    dbPath = tmpDbPath("retr-int");
    db = openDbAt(dbPath);
  });
  afterEach(() => {
    db.close();
    cleanupDbPath(dbPath);
  });

  it("indexes an uploaded doc and retrieves it WITHOUT a docFilter (corpus-wide)", async () => {
    const ing = await ingestDocument(
      { userId: USER_A, name: "Project_Orion.txt", text: ORION_TEXT, source: "upload", docId: "upload-xyz" },
      db
    );
    expect(ing.duplicate).toBe(false);
    expect(ing.chunkCount).toBe(1);
    expect(retrievalStats(USER_A, db).chunks).toBe(1);

    const { chunks, diagnostics } = await hybridRetrieveWithDiagnostics(
      { userId: USER_A, query: ORION_QUERY, docFilter: null },
      db
    );
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].docName).toBe("Project_Orion.txt");
    expect(chunks[0].text).toContain("SKY-482");
    // Diagnostics populated (so zero-results are explainable).
    expect(diagnostics.candidateChunks).toBe(1);
    expect(diagnostics.bm25Candidates).toBeGreaterThan(0);
  });

  it("still retrieves when the client's fileId does NOT match the stored docId (dedup/orphan fix)", async () => {
    // Ingest once with a stable docId.
    await ingestDocument(
      { userId: USER_A, name: "Project_Orion.txt", text: ORION_TEXT, source: "upload", docId: "original-id" },
      db
    );
    // Re-ingest identical content -> deduped, keeps original docId.
    const dup = await ingestDocument(
      { userId: USER_A, name: "Project_Orion.txt", text: ORION_TEXT, source: "upload", docId: "a-new-upload-id" },
      db
    );
    expect(dup.duplicate).toBe(true);
    expect(dup.docId).toBe("original-id"); // canonical id, not the new one

    // Corpus-wide retrieval ignores the mismatch entirely and still finds it.
    const { chunks } = await hybridRetrieveWithDiagnostics(
      { userId: USER_A, query: ORION_QUERY, docFilter: null },
      db
    );
    expect(chunks.some((c) => c.text.includes("SKY-482"))).toBe(true);
  });

  it("builds model-facing retrieval context containing the retrieved fact", async () => {
    const p = tmpDbPath("retr-ctx");
    process.env.SECOND_BRAIN_DB_PATH = p;
    try {
      const sdb = openDbAt(p);
      await ingestDocument(
        { userId: USER_A, name: "Project_Orion.txt", text: ORION_TEXT, source: "upload" },
        sdb
      );
      sdb.close();
      const { buildTurnContext: build } = await import("@/lib/server/context-builder");
      const ctx = await build({ userId: USER_A, query: ORION_QUERY });
      expect(ctx.stats.retrievedChunks).toBeGreaterThan(0);
      expect(ctx.stats.scope).toBe("corpus");
      expect(ctx.retrievalContext).toContain("SKY-482");
    } finally {
      cleanupDbPath(p);
      delete process.env.SECOND_BRAIN_DB_PATH;
    }
  });

  it("isolates retrieval per user", async () => {
    await ingestDocument(
      { userId: USER_A, name: "Project_Orion.txt", text: ORION_TEXT, source: "upload" },
      db
    );
    const { chunks } = await hybridRetrieveWithDiagnostics(
      { userId: USER_B, query: ORION_QUERY, docFilter: null },
      db
    );
    expect(chunks.length).toBe(0);
  });
});

describe("Part 1 — persistence across restart (corpus-wide)", () => {
  it("retrieves an ingested doc after re-opening the database file", async () => {
    const dbPath = tmpDbPath("retr-persist");
    try {
      const db1 = openDbAt(dbPath);
      await ingestDocument(
        { userId: USER_A, name: "Project_Orion.txt", text: ORION_TEXT, source: "upload" },
        db1
      );
      db1.close();

      // Simulate app restart: fresh connection to the same file.
      const db2 = openDbAt(dbPath);
      const { chunks } = await hybridRetrieveWithDiagnostics(
        { userId: USER_A, query: ORION_QUERY, docFilter: null },
        db2
      );
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].text).toContain("SKY-482");
      db2.close();
    } finally {
      cleanupDbPath(dbPath);
    }
  });
});

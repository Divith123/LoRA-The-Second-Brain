// tests/memory-contamination.test.ts
// Part 2 regression tests: explicit personal memory must take precedence over
// uploaded-document content, superseded versions must not leak, and unrelated
// résumé content must not override a direct preference.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { openDbAt } from "@/lib/server/db";
import {
  createMemory,
  updateMemory,
  getActiveMemories,
  getMemoryHistory,
} from "@/lib/server/memory-store";
import { ingestDocument } from "@/lib/server/retrieval-store";
import { tmpDbPath, cleanupDbPath, USER_A, USER_B } from "./fixtures";

// buildTurnContext uses the getDb() singleton, so these tests drive the store
// functions directly with an explicit db to assert the data-level precedence
// that the prompt then relies on. (A separate test drives buildTurnContext via
// the singleton env override.)

describe("Part 2 — memory precedence over documents (data layer)", () => {
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    dbPath = tmpDbPath("contam");
    db = openDbAt(dbPath);
  });
  afterEach(() => {
    db.close();
    cleanupDbPath(dbPath);
  });

  it("preferred-editor correction: latest active memory is Cursor, VS Code is superseded", () => {
    // 1. user states preference
    createMemory(
      { userId: USER_A, entity: "user", attribute: "preferred_editor", value: "VS Code", source: "chat:1" },
      db
    );
    // 2. user corrects it
    updateMemory(
      { userId: USER_A, entity: "user", attribute: "preferred_editor", value: "Cursor", source: "chat:2" },
      db
    );

    const active = getActiveMemories(USER_A, undefined, db);
    const editor = active.find((m) => m.attribute === "preferred_editor");
    expect(editor).toBeDefined();
    // Latest valid explicit memory wins.
    expect(editor!.value).toBe("Cursor");
    // Only one active record for the key.
    expect(active.filter((m) => m.attribute === "preferred_editor").length).toBe(1);

    // The superseded VS Code value is NOT in the active set...
    expect(active.some((m) => m.value === "VS Code")).toBe(false);
    // ...but is preserved in history for audit.
    const history = getMemoryHistory(USER_A, "user", "preferred_editor", db);
    expect(history.some((h) => h.value === "VS Code" && h.status === "superseded")).toBe(true);
  });

  it("résumé document content does not become a personal memory", async () => {
    // Ingesting a document must NOT create any memory records.
    await ingestDocument(
      {
        userId: USER_A,
        name: "resume.txt",
        text: "Experienced engineer. Skills: Python, TypeScript. Tools: VS Code, Git. Hobbies: chess.",
        source: "upload",
      },
      db
    );
    // No memory was auto-created from the document.
    expect(getActiveMemories(USER_A, undefined, db).length).toBe(0);
  });

  it("active memory set contains only the user's explicit facts, not document text", async () => {
    createMemory(
      { userId: USER_A, entity: "user", attribute: "preferred_editor", value: "Cursor", source: "chat" },
      db
    );
    await ingestDocument(
      {
        userId: USER_A,
        name: "resume.txt",
        text: "The candidate primarily programs in Python and used VS Code at their last job.",
        source: "upload",
      },
      db
    );

    const active = getActiveMemories(USER_A, undefined, db);
    // Exactly the one explicit memory; the résumé's "Python"/"VS Code" are not here.
    expect(active.length).toBe(1);
    expect(active[0].value).toBe("Cursor");
    const serialized = JSON.stringify(active);
    expect(serialized).not.toContain("Python");
  });

  it("memory precedence is isolated per user", () => {
    createMemory(
      { userId: USER_A, entity: "user", attribute: "preferred_editor", value: "Cursor", source: "chat" },
      db
    );
    createMemory(
      { userId: USER_B, entity: "user", attribute: "preferred_editor", value: "Neovim", source: "chat" },
      db
    );
    const a = getActiveMemories(USER_A, undefined, db);
    const b = getActiveMemories(USER_B, undefined, db);
    expect(a[0].value).toBe("Cursor");
    expect(b[0].value).toBe("Neovim");
  });
});

describe("Part 2 — buildTurnContext precedence (prompt assembly)", () => {
  // Drive the real buildTurnContext via the singleton env override so we assert
  // the actual model-facing context strings.
  it("memory block is authoritative and separate from retrieved résumé content", async () => {
    const dbPath = tmpDbPath("contam-ctx");
    process.env.SECOND_BRAIN_DB_PATH = dbPath;
    try {
      const { openDbAt: open } = await import("@/lib/server/db");
      const sdb = open(dbPath);
      createMemory(
        { userId: USER_A, entity: "user", attribute: "preferred_editor", value: "VS Code", source: "chat:1" },
        sdb
      );
      updateMemory(
        { userId: USER_A, entity: "user", attribute: "preferred_editor", value: "Cursor", source: "chat:2" },
        sdb
      );
      await ingestDocument(
        {
          userId: USER_A,
          name: "resume.txt",
          text: "The candidate primarily uses Python and VS Code and enjoys competitive chess tournaments.",
          source: "upload",
        },
        sdb
      );
      sdb.close();

      // Fresh import so buildTurnContext opens the singleton at our env path.
      const { buildTurnContext } = await import("@/lib/server/context-builder");
      const ctx = await buildTurnContext({
        userId: USER_A,
        query: "which editor do I prefer?",
      });

      // Memory block present, says Cursor, and is labeled authoritative.
      expect(ctx.memoryContext).toContain("Cursor");
      expect(ctx.memoryContext.toLowerCase()).toContain("authoritative");
      // Superseded value is NOT in the authoritative memory block.
      expect(ctx.memoryContext).not.toContain("VS Code");
      // The résumé may be retrieved, but it lives in a SEPARATE retrieval block,
      // never in the memory block.
      expect(ctx.stats.activeMemories).toBe(1);
    } finally {
      cleanupDbPath(dbPath);
      delete process.env.SECOND_BRAIN_DB_PATH;
    }
  });
});

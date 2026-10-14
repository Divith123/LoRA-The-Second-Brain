// tests/memory.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { openDbAt } from "@/lib/server/db";
import {
  createMemory,
  updateMemory,
  contradictMemory,
  removeMemory,
  getActiveMemories,
  getActiveRecord,
  getMemoryHistory,
} from "@/lib/server/memory-store";
import { tmpDbPath, cleanupDbPath, USER_A, USER_B } from "./fixtures";

describe("structured personal memory lifecycle", () => {
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    dbPath = tmpDbPath("memory");
    db = openDbAt(dbPath);
  });

  afterEach(() => {
    db.close();
    cleanupDbPath(dbPath);
  });

  // (7) Memory creation and retrieval work correctly.
  it("creates and retrieves an active memory", () => {
    const rec = createMemory(
      {
        userId: USER_A,
        entity: "user",
        attribute: "favorite_color",
        value: "blue",
        source: "chat:1",
        confidence: 0.8,
      },
      db
    );
    expect(rec.version).toBe(1);
    expect(rec.status).toBe("active");

    const active = getActiveMemories(USER_A, undefined, db);
    expect(active.length).toBe(1);
    expect(active[0].value).toBe("blue");
    expect(active[0].confidence).toBe(0.8);
  });

  // (8) Memory updates preserve version history.
  it("updating preserves the prior version as superseded", () => {
    createMemory(
      { userId: USER_A, entity: "user", attribute: "city", value: "Paris", source: "chat:1" },
      db
    );
    const updated = updateMemory(
      { userId: USER_A, entity: "user", attribute: "city", value: "Berlin", source: "chat:2" },
      db
    );
    expect(updated.version).toBe(2);
    expect(updated.value).toBe("Berlin");
    expect(updated.supersedes_memory_id).toBeTruthy();

    const history = getMemoryHistory(USER_A, "user", "city", db);
    expect(history.length).toBe(2);
    expect(history[0].status).toBe("superseded");
    expect(history[0].value).toBe("Paris");
    expect(history[1].status).toBe("active");
    expect(history[1].value).toBe("Berlin");

    // Exactly one active record at any time.
    expect(getActiveMemories(USER_A, undefined, db).length).toBe(1);
  });

  // (9) Contradictions do not silently overwrite historical records.
  it("recording a contradiction keeps the old value in history with provenance", () => {
    createMemory(
      { userId: USER_A, entity: "user", attribute: "diet", value: "vegetarian", source: "chat:1" },
      db
    );
    const con = contradictMemory(
      { userId: USER_A, entity: "user", attribute: "diet", value: "vegan", source: "chat:5" },
      db
    );
    expect(con.value).toBe("vegan");
    // Provenance explicitly records that this conflicts with the earlier value.
    expect(con.source).toContain("contradiction");
    expect(con.source).toContain("vegetarian");

    const history = getMemoryHistory(USER_A, "user", "diet", db);
    expect(history.length).toBe(2);
    // The original is retained, not destroyed.
    const original = history.find((h) => h.value === "vegetarian");
    expect(original).toBeDefined();
    expect(original!.status).toBe("superseded");
  });

  // (10) Deleted memories are excluded from normal retrieval.
  it("deletion excludes the record from active retrieval but keeps history", () => {
    createMemory(
      { userId: USER_A, entity: "user", attribute: "phone", value: "555-0100", source: "chat:1" },
      db
    );
    removeMemory(USER_A, "user", "phone", "user-deletion", db);

    expect(getActiveRecord(USER_A, "user", "phone", db)).toBeUndefined();
    expect(getActiveMemories(USER_A, undefined, db).length).toBe(0);

    // History still contains a tombstone for audit.
    const history = getMemoryHistory(USER_A, "user", "phone", db);
    const tombstone = history.find((h) => h.status === "deleted");
    expect(tombstone).toBeDefined();
  });

  // (11) Tombstones prevent deleted memories from being reactivated accidentally.
  it("tombstone blocks silent re-creation but allows explicit reactivation", () => {
    createMemory(
      { userId: USER_A, entity: "user", attribute: "nickname", value: "Ace", source: "chat:1" },
      db
    );
    removeMemory(USER_A, "user", "nickname", "user-deletion", db);

    // Accidental recreate is refused.
    expect(() =>
      createMemory(
        { userId: USER_A, entity: "user", attribute: "nickname", value: "Maverick", source: "chat:9" },
        db
      )
    ).toThrow(/deleted/i);

    // Still no active record after the blocked attempt.
    expect(getActiveMemories(USER_A, undefined, db).length).toBe(0);

    // Explicit, intentional reactivation succeeds and is marked in provenance.
    const re = createMemory(
      {
        userId: USER_A,
        entity: "user",
        attribute: "nickname",
        value: "Maverick",
        source: "chat:10",
        reactivate: true,
      },
      db
    );
    expect(re.status).toBe("active");
    expect(re.source).toContain("reactivated");
    expect(getActiveMemories(USER_A, undefined, db).length).toBe(1);
  });

  // (12) User data remains isolated.
  it("keeps memories isolated per user", () => {
    createMemory(
      { userId: USER_A, entity: "user", attribute: "lang", value: "fr", source: "chat:1" },
      db
    );
    createMemory(
      { userId: USER_B, entity: "user", attribute: "lang", value: "de", source: "chat:1" },
      db
    );
    expect(getActiveRecord(USER_A, "user", "lang", db)!.value).toBe("fr");
    expect(getActiveRecord(USER_B, "user", "lang", db)!.value).toBe("de");
    expect(getActiveMemories(USER_A, undefined, db).length).toBe(1);
    expect(getActiveMemories(USER_B, undefined, db).length).toBe(1);
  });

  it("rejects invalid confidence by clamping into [0,1]", () => {
    const hi = createMemory(
      { userId: USER_A, entity: "x", attribute: "a", value: "v", source: "s", confidence: 5 },
      db
    );
    expect(hi.confidence).toBeLessThanOrEqual(1);
    const lo = updateMemory(
      { userId: USER_A, entity: "x", attribute: "a", value: "w", source: "s", confidence: -3 },
      db
    );
    expect(lo.confidence).toBeGreaterThanOrEqual(0);
  });
});

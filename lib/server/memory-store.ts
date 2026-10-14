// lib/server/memory-store.ts
// Structured, versioned personal memory for Phase 1.
//
// A memory record is a (entity, attribute, value) triple with provenance,
// confidence, status and a version chain. The store is deterministic and never
// silently destroys history:
//
//   create()     -> inserts a v1 active record for a new (entity, attribute)
//   update()     -> supersedes the active record, inserts v+1 active record
//   contradict() -> same mechanism as update but tags provenance as a conflict;
//                   the prior value is preserved as a 'superseded' row
//   remove()     -> supersedes the active record and writes a 'deleted'
//                   tombstone so the key cannot silently re-activate
//   getActive()  -> returns only active records (default retrieval)
//   history()    -> returns the full version chain for a key
//
// IMPORTANT (research scope): nothing here trains a model. This is the
// non-parametric substrate that later phases will selectively consolidate into
// LoRA adapters. We deliberately keep provenance + timestamps so a future phase
// can distinguish a deliberate correction from an uncertain/unrelated statement.

import crypto from "node:crypto";
import type { DB } from "@/lib/server/db";
import { getDb, nowIso } from "@/lib/server/db";

export type MemoryStatus = "active" | "superseded" | "deleted";

export interface MemoryRecord {
  memory_id: string;
  user_id: string;
  entity: string;
  attribute: string;
  value: string | null;
  created_at: string;
  updated_at: string;
  source: string;
  confidence: number;
  status: MemoryStatus;
  version: number;
  supersedes_memory_id: string | null;
}

export interface CreateMemoryInput {
  userId: string;
  entity: string;
  attribute: string;
  value: string;
  source: string;
  confidence?: number;
  /**
   * If a deleted tombstone exists for this key, creation is refused unless
   * reactivate=true. This prevents a deleted memory from silently returning.
   */
  reactivate?: boolean;
}

export interface UpdateMemoryInput {
  userId: string;
  entity: string;
  attribute: string;
  value: string;
  source: string;
  confidence?: number;
  /** When true, provenance is annotated to mark this as a conflicting value. */
  asContradiction?: boolean;
}

function clampConfidence(c: number | undefined): number {
  if (c === undefined || Number.isNaN(c)) return 0.5;
  return Math.min(1, Math.max(0, c));
}

function normKey(s: string): string {
  return s.trim().toLowerCase();
}

/** Fetch the single active record for a key, if any. */
export function getActiveRecord(
  userId: string,
  entity: string,
  attribute: string,
  db: DB = getDb()
): MemoryRecord | undefined {
  return db
    .prepare(
      `SELECT * FROM memory_records
       WHERE user_id = ? AND entity = ? AND attribute = ? AND status = 'active'`
    )
    .get(userId, normKey(entity), normKey(attribute)) as MemoryRecord | undefined;
}

/** The latest tombstone for a key, if the key was deleted and not recreated. */
function getLatestTombstone(
  userId: string,
  entity: string,
  attribute: string,
  db: DB
): MemoryRecord | undefined {
  return db
    .prepare(
      `SELECT * FROM memory_records
       WHERE user_id = ? AND entity = ? AND attribute = ? AND status = 'deleted'
       ORDER BY version DESC LIMIT 1`
    )
    .get(userId, normKey(entity), normKey(attribute)) as MemoryRecord | undefined;
}

/** Highest version seen for a key across all statuses. */
function maxVersion(
  userId: string,
  entity: string,
  attribute: string,
  db: DB
): number {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(version), 0) AS v FROM memory_records
       WHERE user_id = ? AND entity = ? AND attribute = ?`
    )
    .get(userId, normKey(entity), normKey(attribute)) as { v: number };
  return row.v;
}

/**
 * Create a new memory. Fails if an active record already exists for the key
 * (callers should use update() to change a value). If a deleted tombstone
 * exists, creation is refused unless reactivate=true.
 */
export function createMemory(input: CreateMemoryInput, db: DB = getDb()): MemoryRecord {
  const { userId, source } = input;
  if (!userId) throw new Error("createMemory: userId is required");
  const entity = normKey(input.entity);
  const attribute = normKey(input.attribute);
  if (!entity || !attribute) throw new Error("createMemory: entity and attribute are required");

  const existingActive = getActiveRecord(userId, entity, attribute, db);
  if (existingActive) {
    throw new Error(
      `createMemory: an active memory already exists for (${entity}, ${attribute}); use updateMemory`
    );
  }

  const tombstone = getLatestTombstone(userId, entity, attribute, db);
  if (tombstone && !input.reactivate) {
    throw new Error(
      `createMemory: (${entity}, ${attribute}) was deleted; pass reactivate=true to intentionally restore`
    );
  }

  const now = nowIso();
  const version = maxVersion(userId, entity, attribute, db) + 1;
  const rec: MemoryRecord = {
    memory_id: crypto.randomUUID(),
    user_id: userId,
    entity,
    attribute,
    value: input.value,
    created_at: now,
    updated_at: now,
    source: tombstone ? `${source} (reactivated)` : source,
    confidence: clampConfidence(input.confidence),
    status: "active",
    version,
    supersedes_memory_id: tombstone ? tombstone.memory_id : null,
  };

  db.prepare(
    `INSERT INTO memory_records
       (memory_id, user_id, entity, attribute, value, created_at, updated_at,
        source, confidence, status, version, supersedes_memory_id)
     VALUES (@memory_id, @user_id, @entity, @attribute, @value, @created_at,
             @updated_at, @source, @confidence, @status, @version, @supersedes_memory_id)`
  ).run(rec);

  return rec;
}

/**
 * Update (or contradict) the active value for a key. The previous active record
 * is marked 'superseded' (history preserved) and a new 'active' record is
 * inserted with an incremented version pointing back via supersedes_memory_id.
 *
 * If no active record exists, this behaves like create() (unless a tombstone
 * blocks it, matching create() semantics).
 */
export function updateMemory(input: UpdateMemoryInput, db: DB = getDb()): MemoryRecord {
  const { userId, source } = input;
  if (!userId) throw new Error("updateMemory: userId is required");
  const entity = normKey(input.entity);
  const attribute = normKey(input.attribute);
  if (!entity || !attribute) throw new Error("updateMemory: entity and attribute are required");

  const now = nowIso();

  const tx = db.transaction((): MemoryRecord => {
    const current = getActiveRecord(userId, entity, attribute, db);

    if (!current) {
      // No active record: create (respecting tombstone rules).
      return createMemory(
        {
          userId,
          entity,
          attribute,
          value: input.value,
          source,
          confidence: input.confidence,
        },
        db
      );
    }

    // Supersede the current active record first so the partial unique index on
    // active rows is not violated when we insert the new active row.
    db.prepare(
      `UPDATE memory_records SET status = 'superseded', updated_at = ?
       WHERE memory_id = ?`
    ).run(now, current.memory_id);

    const provenance = input.asContradiction
      ? `${source} (contradiction of v${current.version}:"${current.value ?? ""}")`
      : source;

    const rec: MemoryRecord = {
      memory_id: crypto.randomUUID(),
      user_id: userId,
      entity,
      attribute,
      value: input.value,
      created_at: current.created_at, // preserve first-seen time for the key
      updated_at: now,
      source: provenance,
      confidence: clampConfidence(input.confidence),
      status: "active",
      version: current.version + 1,
      supersedes_memory_id: current.memory_id,
    };

    db.prepare(
      `INSERT INTO memory_records
         (memory_id, user_id, entity, attribute, value, created_at, updated_at,
          source, confidence, status, version, supersedes_memory_id)
       VALUES (@memory_id, @user_id, @entity, @attribute, @value, @created_at,
               @updated_at, @source, @confidence, @status, @version, @supersedes_memory_id)`
    ).run(rec);

    return rec;
  });

  return tx();
}

/**
 * Record a conflicting value. Thin wrapper over updateMemory that preserves the
 * prior value as 'superseded' and tags provenance. Does NOT assume the newest
 * statement is correct — it simply records it with provenance so later phases
 * can arbitrate. Confidence defaults lower for unverified contradictions.
 */
export function contradictMemory(
  input: Omit<UpdateMemoryInput, "asContradiction">,
  db: DB = getDb()
): MemoryRecord {
  return updateMemory(
    { ...input, asContradiction: true, confidence: input.confidence ?? 0.4 },
    db
  );
}

/**
 * Delete a memory for a key: supersede the active record (if any) and write a
 * 'deleted' tombstone. Idempotent-ish: deleting an already-deleted key is a
 * no-op that returns the existing tombstone.
 */
export function removeMemory(
  userId: string,
  entity: string,
  attribute: string,
  source = "user-deletion",
  db: DB = getDb()
): MemoryRecord {
  if (!userId) throw new Error("removeMemory: userId is required");
  const e = normKey(entity);
  const a = normKey(attribute);
  const now = nowIso();

  const tx = db.transaction((): MemoryRecord => {
    const current = getActiveRecord(userId, e, a, db);
    const existingTombstone = getLatestTombstone(userId, e, a, db);

    if (!current && existingTombstone) {
      return existingTombstone; // already deleted
    }

    const lastValue = current?.value ?? null;
    const version = maxVersion(userId, e, a, db) + 1;

    if (current) {
      db.prepare(
        `UPDATE memory_records SET status = 'superseded', updated_at = ?
         WHERE memory_id = ?`
      ).run(now, current.memory_id);
    }

    const tombstone: MemoryRecord = {
      memory_id: crypto.randomUUID(),
      user_id: userId,
      entity: e,
      attribute: a,
      value: lastValue, // retain last value for audit; status marks it deleted
      created_at: now,
      updated_at: now,
      source,
      confidence: 0,
      status: "deleted",
      version,
      supersedes_memory_id: current ? current.memory_id : null,
    };

    db.prepare(
      `INSERT INTO memory_records
         (memory_id, user_id, entity, attribute, value, created_at, updated_at,
          source, confidence, status, version, supersedes_memory_id)
       VALUES (@memory_id, @user_id, @entity, @attribute, @value, @created_at,
               @updated_at, @source, @confidence, @status, @version, @supersedes_memory_id)`
    ).run(tombstone);

    return tombstone;
  });

  return tx();
}

/** All active records for a user (default retrieval surface). */
export function getActiveMemories(
  userId: string,
  opts?: { entity?: string; limit?: number },
  db: DB = getDb()
): MemoryRecord[] {
  const clauses = ["user_id = ?", "status = 'active'"];
  const params: any[] = [userId];
  if (opts?.entity) {
    clauses.push("entity = ?");
    params.push(normKey(opts.entity));
  }
  let sql = `SELECT * FROM memory_records WHERE ${clauses.join(
    " AND "
  )} ORDER BY updated_at DESC`;
  if (opts?.limit) {
    sql += ` LIMIT ?`;
    params.push(opts.limit);
  }
  return db.prepare(sql).all(...params) as MemoryRecord[];
}

/** Full version chain for a key, oldest first (includes superseded + deleted). */
export function getMemoryHistory(
  userId: string,
  entity: string,
  attribute: string,
  db: DB = getDb()
): MemoryRecord[] {
  return db
    .prepare(
      `SELECT * FROM memory_records
       WHERE user_id = ? AND entity = ? AND attribute = ?
       ORDER BY version ASC`
    )
    .all(userId, normKey(entity), normKey(attribute)) as MemoryRecord[];
}

/** Fetch one record by id (any status). */
export function getMemoryById(
  memoryId: string,
  db: DB = getDb()
): MemoryRecord | undefined {
  return db
    .prepare(`SELECT * FROM memory_records WHERE memory_id = ?`)
    .get(memoryId) as MemoryRecord | undefined;
}

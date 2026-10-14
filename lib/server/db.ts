// lib/server/db.ts
// Server-side SQLite persistence foundation for Phase 1.
//
// IMPORTANT: This module is Node-only. It must never be imported into client
// components. The browser side continues to use Dexie/IndexedDB (lib/database.ts).
// This store backs server-side hybrid retrieval and structured personal memory,
// both of which run inside API routes / server actions.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

// Resolve the on-disk database location. Configurable via env so we never
// hardcode a machine-specific path. Defaults to <project>/data/second-brain.db.
function resolveDbPath(): string {
  const configured = process.env.SECOND_BRAIN_DB_PATH;
  if (configured && configured.trim()) {
    return path.resolve(configured.trim());
  }
  return path.join(process.cwd(), "data", "second-brain.db");
}

// Current schema version. Bump when adding a migration below.
const SCHEMA_VERSION = 2;

// The schema is intentionally created with IF NOT EXISTS so that opening an
// existing database is a no-op. Migrations are keyed off user_version.
function migrate(db: DB): void {
  const current = db.pragma("user_version", { simple: true }) as number;

  if (current < 1) {
    db.exec(`
      -- ============================ RETRIEVAL ============================
      -- A document is a logical source (an uploaded file, a note, etc.).
      -- content_hash enables duplicate detection within a user scope.
      CREATE TABLE IF NOT EXISTS rag_documents (
        doc_id        TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL,
        name          TEXT NOT NULL,
        source        TEXT NOT NULL,              -- e.g. "upload", "note"
        mime          TEXT,
        content_hash  TEXT NOT NULL,              -- sha256 of extracted text
        created_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rag_documents_user ON rag_documents(user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_rag_documents_user_hash
        ON rag_documents(user_id, content_hash);

      -- A chunk is a retrievable unit of a document. The dense vector is stored
      -- as a BLOB (Float32 little-endian). dim lets us validate on read.
      CREATE TABLE IF NOT EXISTS rag_chunks (
        chunk_id    TEXT PRIMARY KEY,
        doc_id      TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        idx         INTEGER NOT NULL,             -- position within document
        text        TEXT NOT NULL,
        token_count INTEGER NOT NULL,             -- rough whitespace token count
        dim         INTEGER,                      -- embedding dimension (nullable)
        vector      BLOB,                         -- Float32Array bytes (nullable)
        created_at  TEXT NOT NULL,
        FOREIGN KEY (doc_id) REFERENCES rag_documents(doc_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_rag_chunks_user ON rag_chunks(user_id);
      CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(doc_id);

      -- ============================ MEMORY ===============================
      -- Structured, versioned personal memory records.
      -- status: 'active' | 'superseded' | 'deleted'
      -- A deletion creates a tombstone row (status='deleted') so the (entity,
      -- attribute) key cannot silently flip back to active on later ingestion.
      CREATE TABLE IF NOT EXISTS memory_records (
        memory_id            TEXT PRIMARY KEY,
        user_id              TEXT NOT NULL,
        entity               TEXT NOT NULL,
        attribute            TEXT NOT NULL,
        value                TEXT,                -- null allowed for tombstones
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL,
        source               TEXT NOT NULL,       -- provenance
        confidence           REAL NOT NULL DEFAULT 0.5,
        status               TEXT NOT NULL DEFAULT 'active',
        version              INTEGER NOT NULL DEFAULT 1,
        supersedes_memory_id TEXT,                -- points at the prior version
        CHECK (status IN ('active', 'superseded', 'deleted')),
        CHECK (confidence >= 0.0 AND confidence <= 1.0),
        CHECK (version >= 1)
      );
      CREATE INDEX IF NOT EXISTS idx_memory_user ON memory_records(user_id);
      CREATE INDEX IF NOT EXISTS idx_memory_key
        ON memory_records(user_id, entity, attribute);
      CREATE INDEX IF NOT EXISTS idx_memory_status
        ON memory_records(user_id, status);

      -- At most one ACTIVE record per (user, entity, attribute). Superseded and
      -- deleted rows are exempt (NULL in the partial-index column => not indexed).
      CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_active_key
        ON memory_records(user_id, entity, attribute)
        WHERE status = 'active';
    `);
  }

  if (current < 2) {
    db.exec(`
      -- ============================ DOWNLOADS ============================
      -- Server-side download registry. Tracks model downloads so progress
      -- survives browser refreshes and the background job keeps running
      -- independent of any client connection.
      CREATE TABLE IF NOT EXISTS downloads (
        download_id     TEXT PRIMARY KEY,
        model_id        TEXT NOT NULL,
        download_source TEXT NOT NULL DEFAULT 'ollama',  -- 'ollama' | 'direct'
        status          TEXT NOT NULL DEFAULT 'pending',
        progress        REAL NOT NULL DEFAULT 0,         -- 0-100
        message         TEXT NOT NULL DEFAULT '',
        bytes_done      INTEGER NOT NULL DEFAULT 0,
        bytes_total     INTEGER NOT NULL DEFAULT 0,
        file_path       TEXT,                            -- for direct downloads
        error           TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        CHECK (status IN ('pending', 'downloading', 'completed', 'error', 'cancelled'))
      );
      CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
      CREATE INDEX IF NOT EXISTS idx_downloads_model  ON downloads(model_id);
    `);
  }

  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

// Singleton connection per process. better-sqlite3 is synchronous and safe to
// share across requests within a single Node process.
let singleton: DB | null = null;
let exitHooksRegistered = false;

// Register process-exit hooks once so the singleton WAL is checkpointed and the
// connection closed on graceful shutdown. WAL mode is already crash-safe (data
// is recovered from the -wal file on the next open), so this is a durability
// nicety, not a correctness requirement. Only the app singleton is wired up;
// test/eval databases opened via openDbAt manage their own lifecycle.
function registerExitHooks(): void {
  if (exitHooksRegistered) return;
  exitHooksRegistered = true;
  const shutdown = () => {
    try {
      closeDb();
    } catch {
      /* best effort on shutdown */
    }
  };
  process.once("exit", shutdown);
  process.once("SIGINT", () => {
    shutdown();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    shutdown();
    process.exit(143);
  });
}

export function getDb(): DB {
  if (singleton) return singleton;

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL"); // better concurrency + durability
  db.pragma("foreign_keys = ON");
  migrate(db);

  singleton = db;
  registerExitHooks();
  return db;
}

// Open an isolated database at an explicit path. Used by tests and the eval
// script so they never touch the application database.
export function openDbAt(dbPath: string): DB {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function closeDb(): void {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}

// --- small shared helpers ---

export function nowIso(): string {
  return new Date().toISOString();
}

export function floatArrayToBlob(vec: number[] | Float32Array): Buffer {
  const f32 = vec instanceof Float32Array ? vec : Float32Array.from(vec);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

export function blobToFloatArray(buf: Buffer | null | undefined): Float32Array | null {
  if (!buf || buf.length === 0) return null;
  // Copy into an aligned buffer to be safe across platforms.
  const copy = Buffer.from(buf);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

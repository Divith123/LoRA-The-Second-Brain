// lib/server/retrieval-store.ts
// Persistent hybrid retrieval over per-user document collections.
//
// Pipeline:
//   ingest:  text -> chunk -> embed (dense) -> persist chunks + vectors (SQLite)
//   query:   query -> {dense cosine top-N, BM25 top-N} -> Reciprocal Rank Fusion
//
// Design choices:
//  - Persistence: chunks, embeddings (as Float32 BLOBs), and metadata live in
//    SQLite, so retrieval survives application restarts (fixing the previous
//    in-memory array that reset on every restart / hot-reload).
//  - Dense and lexical legs are independent and either can be disabled via
//    config. If the embedding model is unavailable, dense silently drops out
//    and the system still works lexically.
//  - User isolation is enforced in every SQL query via a user_id predicate.
//  - Duplicate documents are detected via a sha256 content hash scoped per user.

import crypto from "node:crypto";
import type { DB } from "@/lib/server/db";
import {
  getDb,
  nowIso,
  floatArrayToBlob,
  blobToFloatArray,
} from "@/lib/server/db";
import { chunkText } from "@/lib/file-processing";
import { retrievalConfig } from "@/lib/config";
import {
  embedTextsLocal,
  embedQueryLocal,
  cosineSim,
} from "@/lib/server/embeddings-local";
import { Bm25Index, type Bm25Doc } from "@/lib/server/bm25";

export interface IngestOptions {
  userId: string;
  name: string;
  text: string;
  source?: string; // "upload" | "note" | ...
  mime?: string;
  docId?: string; // caller-provided stable id (e.g. upload id)
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface IngestResult {
  docId: string;
  chunkCount: number;
  duplicate: boolean; // true if identical content already existed for the user
  denseIndexed: boolean; // whether dense vectors were stored
}

export interface RetrievedChunk {
  chunkId: string;
  docId: string;
  docName: string;
  source: string;
  idx: number;
  text: string;
  score: number; // fused RRF score
  denseRank: number | null;
  bm25Rank: number | null;
}

export interface QueryOptions {
  userId: string;
  query: string;
  topK?: number;
  docFilter?: string[] | null; // restrict to specific doc ids
  sourceFilter?: string[] | null; // restrict to specific sources
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function countTokens(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Ingest a document: chunk, embed, and persist. Idempotent per (user, content):
 * re-ingesting identical text returns the existing doc and does not duplicate.
 */
export async function ingestDocument(
  opts: IngestOptions,
  db: DB = getDb()
): Promise<IngestResult> {
  const {
    userId,
    name,
    text,
    source = "upload",
    mime = null,
    chunkSize = retrievalConfig.chunkSize,
    chunkOverlap = retrievalConfig.chunkOverlap,
  } = opts;

  if (!userId) throw new Error("ingestDocument: userId is required");

  const cleanText = (text ?? "").trim();
  const contentHash = sha256(`${name}\u0000${cleanText}`);

  // Duplicate detection scoped to the user.
  const existing = db
    .prepare(
      `SELECT doc_id FROM rag_documents WHERE user_id = ? AND content_hash = ?`
    )
    .get(userId, contentHash) as { doc_id: string } | undefined;

  if (existing) {
    const row = db
      .prepare(`SELECT COUNT(*) AS c FROM rag_chunks WHERE doc_id = ?`)
      .get(existing.doc_id) as { c: number };
    return {
      docId: existing.doc_id,
      chunkCount: row.c,
      duplicate: true,
      denseIndexed: false,
    };
  }

  const docId = opts.docId?.trim() || crypto.randomUUID();
  const chunks = cleanText ? chunkText(cleanText, chunkSize, chunkOverlap) : [];

  // Embed all chunks up front (dense leg). On failure these come back as nulls
  // and we simply persist chunks without vectors (lexical-only for this doc).
  let vectors: (Float32Array | null)[] = chunks.map(() => null);
  let denseIndexed = false;
  if (retrievalConfig.useDense && chunks.length) {
    try {
      vectors = await embedTextsLocal(chunks);
      denseIndexed = vectors.some((v) => v !== null);
    } catch (err) {
      console.error(
        "[retrieval-store] Dense embedding failed during ingest; storing lexical-only:",
        err instanceof Error ? err.message : err
      );
    }
  }

  const insertDoc = db.prepare(
    `INSERT INTO rag_documents (doc_id, user_id, name, source, mime, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertChunk = db.prepare(
    `INSERT INTO rag_chunks (chunk_id, doc_id, user_id, idx, text, token_count, dim, vector, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const createdAt = nowIso();
  const tx = db.transaction(() => {
    insertDoc.run(docId, userId, name, source, mime, contentHash, createdAt);
    for (let i = 0; i < chunks.length; i++) {
      const v = vectors[i];
      insertChunk.run(
        `${docId}:${i}`,
        docId,
        userId,
        i,
        chunks[i],
        countTokens(chunks[i]),
        v ? v.length : null,
        v ? floatArrayToBlob(v) : null,
        createdAt
      );
    }
  });
  tx();

  return { docId, chunkCount: chunks.length, duplicate: false, denseIndexed };
}

interface ChunkRow {
  chunk_id: string;
  doc_id: string;
  doc_name: string;
  source: string;
  idx: number;
  text: string;
  dim: number | null;
  vector: Buffer | null;
}

/** Load the user's candidate chunks, honoring optional metadata filters. */
function loadUserChunks(
  db: DB,
  userId: string,
  docFilter?: string[] | null,
  sourceFilter?: string[] | null
): ChunkRow[] {
  const clauses: string[] = ["c.user_id = ?"];
  const params: any[] = [userId];

  if (docFilter && docFilter.length) {
    clauses.push(`c.doc_id IN (${docFilter.map(() => "?").join(",")})`);
    params.push(...docFilter);
  }
  if (sourceFilter && sourceFilter.length) {
    clauses.push(`d.source IN (${sourceFilter.map(() => "?").join(",")})`);
    params.push(...sourceFilter);
  }

  return db
    .prepare(
      `SELECT c.chunk_id, c.doc_id, d.name AS doc_name, d.source AS source,
              c.idx, c.text, c.dim, c.vector
       FROM rag_chunks c
       JOIN rag_documents d ON d.doc_id = c.doc_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY c.doc_id, c.idx`
    )
    .all(...params) as ChunkRow[];
}

/** Reciprocal Rank Fusion: score = sum over legs of 1 / (k + rank). */
function rrfFuse(
  denseRanked: string[],
  bm25Ranked: string[],
  k: number
): Map<string, { score: number; denseRank: number | null; bm25Rank: number | null }> {
  const fused = new Map<
    string,
    { score: number; denseRank: number | null; bm25Rank: number | null }
  >();

  const ensure = (id: string) => {
    if (!fused.has(id))
      fused.set(id, { score: 0, denseRank: null, bm25Rank: null });
    return fused.get(id)!;
  };

  denseRanked.forEach((id, i) => {
    const e = ensure(id);
    e.score += 1 / (k + i + 1);
    e.denseRank = i + 1;
  });
  bm25Ranked.forEach((id, i) => {
    const e = ensure(id);
    e.score += 1 / (k + i + 1);
    e.bm25Rank = i + 1;
  });

  return fused;
}

export interface RetrievalDiagnostics {
  candidateChunks: number; // user chunks considered (after metadata filters)
  denseAvailable: boolean; // whether the dense leg produced a ranking
  denseCandidates: number;
  bm25Candidates: number;
  returned: number;
}

export interface HybridRetrieveResult {
  chunks: RetrievedChunk[];
  diagnostics: RetrievalDiagnostics;
}

/**
 * Core hybrid retrieval with diagnostics. Returns the top-k fused chunks with
 * source attribution and per-leg ranks, plus candidate counts for logging.
 * Handles empty queries, missing embeddings, and empty corpora gracefully.
 */
export async function hybridRetrieveWithDiagnostics(
  opts: QueryOptions,
  db: DB = getDb()
): Promise<HybridRetrieveResult> {
  const { userId, docFilter = null, sourceFilter = null } = opts;
  const topK = opts.topK ?? retrievalConfig.topK;
  const pool = retrievalConfig.candidatePool;
  const query = (opts.query ?? "").trim();

  const diagnostics: RetrievalDiagnostics = {
    candidateChunks: 0,
    denseAvailable: false,
    denseCandidates: 0,
    bm25Candidates: 0,
    returned: 0,
  };

  if (!userId) throw new Error("hybridRetrieve: userId is required");
  if (!query) return { chunks: [], diagnostics }; // empty-query guard

  let rows: ChunkRow[];
  try {
    rows = loadUserChunks(db, userId, docFilter, sourceFilter);
  } catch (err) {
    console.error(
      "[retrieval-store] Failed to load chunks:",
      err instanceof Error ? err.message : err
    );
    return { chunks: [], diagnostics };
  }
  diagnostics.candidateChunks = rows.length;
  if (!rows.length) return { chunks: [], diagnostics };

  const byId = new Map<string, ChunkRow>();
  for (const r of rows) byId.set(r.chunk_id, r);

  // ---- Dense leg ----
  let denseRanked: string[] = [];
  if (retrievalConfig.useDense) {
    try {
      const qvec = await embedQueryLocal(query);
      if (qvec) {
        diagnostics.denseAvailable = true;
        const scored: { id: string; score: number }[] = [];
        for (const r of rows) {
          const v = blobToFloatArray(r.vector);
          if (!v) continue;
          scored.push({ id: r.chunk_id, score: cosineSim(qvec, v) });
        }
        scored.sort((a, b) => b.score - a.score);
        denseRanked = scored.slice(0, pool).map((s) => s.id);
      }
    } catch (err) {
      console.error(
        "[retrieval-store] Dense retrieval failed; continuing lexical-only:",
        err instanceof Error ? err.message : err
      );
    }
  }
  diagnostics.denseCandidates = denseRanked.length;

  // ---- Lexical (BM25) leg ----
  let bm25Ranked: string[] = [];
  if (retrievalConfig.useBm25) {
    try {
      const docs: Bm25Doc[] = rows.map((r) => ({ id: r.chunk_id, text: r.text }));
      const idx = new Bm25Index(docs);
      bm25Ranked = idx.search(query, pool).map((r) => r.id);
    } catch (err) {
      console.error(
        "[retrieval-store] BM25 retrieval failed:",
        err instanceof Error ? err.message : err
      );
    }
  }
  diagnostics.bm25Candidates = bm25Ranked.length;

  // If neither leg produced anything (e.g. dense down + no lexical overlap),
  // return empty rather than guessing.
  if (!denseRanked.length && !bm25Ranked.length) {
    return { chunks: [], diagnostics };
  }

  // ---- Fuse ----
  const fused = rrfFuse(denseRanked, bm25Ranked, retrievalConfig.rrfK);
  const ordered = Array.from(fused.entries()).sort(
    (a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0])
  );

  const out: RetrievedChunk[] = [];
  for (const [chunkId, meta] of ordered.slice(0, topK)) {
    const r = byId.get(chunkId);
    if (!r) continue;
    out.push({
      chunkId,
      docId: r.doc_id,
      docName: r.doc_name,
      source: r.source,
      idx: r.idx,
      text: r.text,
      score: meta.score,
      denseRank: meta.denseRank,
      bm25Rank: meta.bm25Rank,
    });
  }
  diagnostics.returned = out.length;
  return { chunks: out, diagnostics };
}

/**
 * Backward-compatible hybrid retrieval returning just the chunk array.
 * Handles empty queries, missing embeddings, and empty corpora gracefully.
 */
export async function hybridRetrieve(
  opts: QueryOptions,
  db: DB = getDb()
): Promise<RetrievedChunk[]> {
  const { chunks } = await hybridRetrieveWithDiagnostics(opts, db);
  return chunks;
}

/** Delete a document and its chunks for a user (used by tests + file deletion). */
export function deleteDocument(userId: string, docId: string, db: DB = getDb()): void {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM rag_chunks WHERE user_id = ? AND doc_id = ?`).run(
      userId,
      docId
    );
    db.prepare(`DELETE FROM rag_documents WHERE user_id = ? AND doc_id = ?`).run(
      userId,
      docId
    );
  });
  tx();
}

/** Count documents / chunks for diagnostics and tests. */
export function retrievalStats(userId: string, db: DB = getDb()): {
  docs: number;
  chunks: number;
} {
  const d = db
    .prepare(`SELECT COUNT(*) AS c FROM rag_documents WHERE user_id = ?`)
    .get(userId) as { c: number };
  const c = db
    .prepare(`SELECT COUNT(*) AS c FROM rag_chunks WHERE user_id = ?`)
    .get(userId) as { c: number };
  return { docs: d.c, chunks: c.c };
}

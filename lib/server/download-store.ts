// lib/server/download-store.ts
// CRUD layer for the `downloads` table. Pure functions, no side effects beyond
// DB writes. Follows the same pattern as memory-store.ts / retrieval-store.ts.

import crypto from "node:crypto";
import type { DB } from "@/lib/server/db";
import { getDb, nowIso } from "@/lib/server/db";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DownloadStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "error"
  | "cancelled";

export interface DownloadRecord {
  download_id: string;
  model_id: string;
  download_source: "ollama" | "direct";
  status: DownloadStatus;
  progress: number;       // 0–100
  message: string;
  bytes_done: number;
  bytes_total: number;
  file_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDownloadInput {
  modelId: string;
  downloadSource: "ollama" | "direct";
  filePath?: string;
}

export interface UpdateProgressInput {
  progress: number;
  message: string;
  bytesDone?: number;
  bytesTotal?: number;
  status?: DownloadStatus;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/** Create a new download record and return it. */
export function createDownload(
  input: CreateDownloadInput,
  db: DB = getDb()
): DownloadRecord {
  const now = nowIso();
  const rec: DownloadRecord = {
    download_id: crypto.randomUUID(),
    model_id: input.modelId,
    download_source: input.downloadSource,
    status: "pending",
    progress: 0,
    message: "Queued",
    bytes_done: 0,
    bytes_total: 0,
    file_path: input.filePath ?? null,
    error: null,
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `INSERT INTO downloads
       (download_id, model_id, download_source, status, progress, message,
        bytes_done, bytes_total, file_path, error, created_at, updated_at)
     VALUES
       (@download_id, @model_id, @download_source, @status, @progress, @message,
        @bytes_done, @bytes_total, @file_path, @error, @created_at, @updated_at)`
  ).run(rec);

  return rec;
}

/** Get a single download by id. */
export function getDownload(
  downloadId: string,
  db: DB = getDb()
): DownloadRecord | undefined {
  return db
    .prepare(`SELECT * FROM downloads WHERE download_id = ?`)
    .get(downloadId) as DownloadRecord | undefined;
}

/** Get active download for a specific model (pending or downloading). */
export function getActiveDownloadForModel(
  modelId: string,
  db: DB = getDb()
): DownloadRecord | undefined {
  return db
    .prepare(
      `SELECT * FROM downloads
       WHERE model_id = ? AND status IN ('pending', 'downloading')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(modelId) as DownloadRecord | undefined;
}

/** Get all active downloads (pending + downloading). */
export function getActiveDownloads(db: DB = getDb()): DownloadRecord[] {
  return db
    .prepare(
      `SELECT * FROM downloads
       WHERE status IN ('pending', 'downloading')
       ORDER BY created_at DESC`
    )
    .all() as DownloadRecord[];
}

/** Get all downloads (including completed, error, cancelled). */
export function getAllDownloads(
  limit: number = 50,
  db: DB = getDb()
): DownloadRecord[] {
  return db
    .prepare(`SELECT * FROM downloads ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as DownloadRecord[];
}

/** Update progress for a download. Called frequently during the download. */
export function updateProgress(
  downloadId: string,
  input: UpdateProgressInput,
  db: DB = getDb()
): void {
  const now = nowIso();
  db.prepare(
    `UPDATE downloads
     SET progress   = @progress,
         message    = @message,
         bytes_done = @bytesDone,
         bytes_total = @bytesTotal,
         status     = @status,
         updated_at = @updatedAt
     WHERE download_id = @downloadId`
  ).run({
    downloadId,
    progress: input.progress,
    message: input.message,
    bytesDone: input.bytesDone ?? 0,
    bytesTotal: input.bytesTotal ?? 0,
    status: input.status ?? "downloading",
    updatedAt: now,
  });
}

/** Mark a download as completed. */
export function markCompleted(
  downloadId: string,
  message: string = "Download completed successfully!",
  filePath?: string,
  db: DB = getDb()
): void {
  const now = nowIso();
  db.prepare(
    `UPDATE downloads
     SET status = 'completed', progress = 100, message = ?, file_path = COALESCE(?, file_path), updated_at = ?
     WHERE download_id = ?`
  ).run(message, filePath ?? null, now, downloadId);
}

/** Mark a download as errored. */
export function markError(
  downloadId: string,
  errorMessage: string,
  db: DB = getDb()
): void {
  const now = nowIso();
  db.prepare(
    `UPDATE downloads
     SET status = 'error', error = ?, message = ?, updated_at = ?
     WHERE download_id = ?`
  ).run(errorMessage, `Failed: ${errorMessage}`, now, downloadId);
}

/** Mark a download as cancelled. */
export function markCancelled(
  downloadId: string,
  db: DB = getDb()
): void {
  const now = nowIso();
  db.prepare(
    `UPDATE downloads
     SET status = 'cancelled', message = 'Cancelled by user', updated_at = ?
     WHERE download_id = ?`
  ).run(now, downloadId);
}

/**
 * Clean up stale downloads. On server restart, any "downloading" records are
 * leftovers from a previous process — mark them as error so the user can retry.
 */
export function recoverStaleDownloads(db: DB = getDb()): number {
  const now = nowIso();
  const result = db.prepare(
    `UPDATE downloads
     SET status = 'error', error = 'Server restarted during download', message = 'Interrupted — please retry', updated_at = ?
     WHERE status IN ('pending', 'downloading')`
  ).run(now);
  return result.changes;
}

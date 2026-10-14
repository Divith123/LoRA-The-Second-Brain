// lib/server/download-manager.ts
// Singleton background download manager. Downloads run as fire-and-forget
// async jobs in the Node process — completely decoupled from HTTP requests.
// Progress is written to the SQLite download-store so any client can poll it.

import { Ollama } from "ollama";
import fs from "node:fs";
import path from "node:path";
import {
  createDownload,
  getActiveDownloadForModel,
  getActiveDownloads,
  getDownload,
  updateProgress,
  markCompleted,
  markError,
  markCancelled,
  recoverStaleDownloads,
  type DownloadRecord,
} from "@/lib/server/download-store";

const MODELS_DIR = path.join(process.cwd(), "models");
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

// ─── Abort controllers for in-flight downloads ───────────────────────────────
// Keyed by download_id so we can cancel a specific job.
const abortControllers = new Map<string, AbortController>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Kick off a download. If there's already an active download for this model,
 * returns the existing record instead of starting a duplicate.
 */
export function startDownload(
  modelId: string,
  downloadSource: "ollama" | "direct",
  host?: string | null
): DownloadRecord {
  // Dedupe: if already downloading this model, return existing record.
  const existing = getActiveDownloadForModel(modelId);
  if (existing) return existing;

  const record = createDownload({ modelId, downloadSource });

  // Fire and forget — the job runs in the background.
  if (downloadSource === "ollama") {
    runOllamaDownload(record.download_id, modelId, host ?? null);
  } else {
    runDirectDownload(record.download_id, modelId);
  }

  return record;
}

/** Cancel an in-flight download. */
export function cancelDownload(downloadId: string): boolean {
  const ctrl = abortControllers.get(downloadId);
  if (ctrl) {
    ctrl.abort();
    abortControllers.delete(downloadId);
  }
  const rec = getDownload(downloadId);
  if (rec && (rec.status === "pending" || rec.status === "downloading")) {
    markCancelled(downloadId);
    return true;
  }
  return false;
}

/** Get a snapshot of all active downloads (for the polling endpoint). */
export { getActiveDownloads, getDownload };

/**
 * Call once on server start to mark orphaned "downloading" rows from a
 * previous process as errored so users can retry.
 */
export function recoverOnStartup(): void {
  const recovered = recoverStaleDownloads();
  if (recovered > 0) {
    console.log(`[download-manager] Recovered ${recovered} stale download(s) from previous run.`);
  }
}

// ─── Ollama download job ─────────────────────────────────────────────────────

async function runOllamaDownload(
  downloadId: string,
  modelId: string,
  host: string | null
) {
  const ac = new AbortController();
  abortControllers.set(downloadId, ac);

  try {
    updateProgress(downloadId, {
      status: "downloading",
      progress: 0,
      message: `Pulling ${modelId} via Ollama...`,
    });

    const ollamaInstance = host
      ? new Ollama({ host })
      : new Ollama({ host: process.env.OLLAMA_HOST || "http://localhost:11434" });

    const pullResponse = await ollamaInstance.pull({
      model: modelId,
      stream: true,
    });

    let totalLayers = 0;
    let completedLayers = 0;

    for await (const chunk of pullResponse) {
      // Respect cancellation
      if (ac.signal.aborted) {
        throw new DOMException("Download cancelled", "AbortError");
      }

      if (chunk.total) totalLayers = chunk.total;
      if (chunk.completed) completedLayers = chunk.completed;

      const progress =
        totalLayers > 0 ? Math.round((completedLayers / totalLayers) * 100) : 0;
      const message = chunk.status || `Downloading ${modelId}...`;

      updateProgress(downloadId, {
        status: "downloading",
        progress,
        message,
        bytesDone: completedLayers,
        bytesTotal: totalLayers,
      });
    }

    markCompleted(downloadId, "Download completed successfully!");
  } catch (err: any) {
    if (err?.name === "AbortError") {
      markCancelled(downloadId);
    } else {
      markError(downloadId, err?.message || "Unknown Ollama error");
    }
  } finally {
    abortControllers.delete(downloadId);
  }
}

// ─── Direct (HuggingFace) download job with resume support ───────────────────

async function runDirectDownload(downloadId: string, modelId: string) {
  const ac = new AbortController();
  abortControllers.set(downloadId, ac);

  try {
    updateProgress(downloadId, {
      status: "downloading",
      progress: 0,
      message: "Fetching model info from Hugging Face...",
    });

    // ── Find a GGUF file ──────────────────────────────────────────────────
    const filesRes = await fetch(
      `https://huggingface.co/api/models/${modelId}/tree/main`,
      { signal: ac.signal }
    );
    if (!filesRes.ok) throw new Error("Could not fetch model files from Hugging Face");

    const files: any[] = await filesRes.json();
    const ggufFiles = files
      .filter((f: any) => f.type === "file" && f.path.toLowerCase().endsWith(".gguf"))
      .sort((a: any, b: any) => a.size - b.size);

    if (ggufFiles.length === 0) throw new Error("No GGUF files found for this model");

    const selectedFile = ggufFiles[0];
    const downloadUrl = `https://huggingface.co/${modelId}/resolve/main/${selectedFile.path}`;
    const filename =
      selectedFile.path.split("/").pop() || `${modelId.split("/")[1]}.gguf`;
    const filePath = path.join(MODELS_DIR, filename);

    // ── Resume support: check existing partial file ───────────────────────
    let existingBytes = 0;
    if (fs.existsSync(filePath)) {
      existingBytes = fs.statSync(filePath).size;
    }

    const headers: Record<string, string> = {};
    if (existingBytes > 0) {
      headers["Range"] = `bytes=${existingBytes}-`;
    }

    const dlRes = await fetch(downloadUrl, { headers, signal: ac.signal });

    // If the server doesn't support range or file is already complete
    const isPartial = dlRes.status === 206;
    if (!dlRes.ok && dlRes.status !== 206) {
      throw new Error("Failed to download model file");
    }

    const contentLength = parseInt(dlRes.headers.get("content-length") || "0");
    const totalBytes = isPartial ? existingBytes + contentLength : contentLength;

    const reader = dlRes.body?.getReader();
    if (!reader) throw new Error("No download stream");

    // Append if resuming, otherwise overwrite
    const fileStream = fs.createWriteStream(filePath, {
      flags: isPartial ? "a" : "w",
    });

    let downloadedBytes = isPartial ? existingBytes : 0;

    updateProgress(downloadId, {
      status: "downloading",
      progress: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
      message: isPartial
        ? `Resuming ${filename} from ${formatSize(existingBytes)}...`
        : `Downloading ${filename}...`,
      bytesDone: downloadedBytes,
      bytesTotal: totalBytes,
    });

    while (true) {
      if (ac.signal.aborted) {
        reader.cancel();
        throw new DOMException("Download cancelled", "AbortError");
      }

      const { done, value } = await reader.read();
      if (done) break;

      fileStream.write(value);
      downloadedBytes += value.length;

      const progress =
        totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
      const message = `Downloading ${filename}... (${formatSize(downloadedBytes)}${totalBytes > 0 ? ` / ${formatSize(totalBytes)}` : ""})`;

      updateProgress(downloadId, {
        status: "downloading",
        progress,
        message,
        bytesDone: downloadedBytes,
        bytesTotal: totalBytes,
      });
    }

    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    markCompleted(
      downloadId,
      `Download completed! Model saved as ${filename}`,
      filePath
    );
  } catch (err: any) {
    if (err?.name === "AbortError") {
      markCancelled(downloadId);
    } else {
      markError(downloadId, err?.message || "Unknown download error");
    }
  } finally {
    abortControllers.delete(downloadId);
  }
}

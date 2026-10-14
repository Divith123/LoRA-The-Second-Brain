import { NextRequest, NextResponse } from 'next/server';
import { Ollama } from 'ollama';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { modelService } from '@/lib/model-service';
import {
  startDownload as startBgDownload,
  cancelDownload as cancelBgDownload,
  getActiveDownloads,
  getDownload,
  recoverOnStartup,
} from '@/lib/server/download-manager';

const MODELS_DIR = path.join(process.cwd(), 'models');

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://localhost:11434'
});

// On server start, mark any orphaned "downloading" records as failed.
recoverOnStartup();

// GET /api/models - Fetch models or check status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const query = searchParams.get('query') || 'gguf';
  const host = searchParams.get('host');
  const provider = searchParams.get('provider');

  try {
    switch (type) {
      case 'huggingface':
        return await handleHuggingFaceModels(query);
      case 'local':
        return await handleLocalModels(host);
      case 'status':
        return await handleOllamaStatus(host);
      case 'local-files':
        return await handleLocalFiles();
      case 'provider':
        return await handleProviderModels(provider);
      case 'system':
        return handleSystemSpecs();
      case 'downloads':
        return handleActiveDownloads();
      case 'download-progress':
        return handleDownloadProgressSSE(searchParams.get('id'));
      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/models - Start a background download (returns immediately)
export async function POST(request: NextRequest) {
  try {
    const { modelId, downloadSource, host } = await request.json();

    if (!modelId) {
      return NextResponse.json({ error: 'Model ID is required' }, { status: 400 });
    }

    const record = startBgDownload(
      modelId,
      downloadSource === 'direct' ? 'direct' : 'ollama',
      host
    );

    return NextResponse.json(record);
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: 'Failed to start download' }, { status: 500 });
  }
}

// DELETE /api/models - Delete model or cancel download
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const modelName = searchParams.get('name');
  const downloadId = searchParams.get('downloadId');
  const host = searchParams.get('host');

  // Cancel a download
  if (downloadId) {
    const ok = cancelBgDownload(downloadId);
    return NextResponse.json({ success: ok });
  }

  // Delete an installed model
  if (!modelName) {
    return NextResponse.json({ error: 'Model name is required' }, { status: 400 });
  }

  try {
    const ollamaInstance = host ? new Ollama({ host }) : ollama;
    await ollamaInstance.delete({ model: modelName });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: 'Failed to delete model' }, { status: 500 });
  }
}

// helpers
function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "Unknown";
  const u = ["B","KB","MB","GB","TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${u[i]}`;
}

async function headSize(repoId: string, rfilename: string) {
  const urls = [
    `https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(rfilename)}`,
    `https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(rfilename)}?download=true`,
  ];
  for (const url of urls) {
    const r = await fetch(url, { method: "HEAD" });
    const len = r.headers.get("content-length");
    if (r.ok && len) return Number(len);
  }
  return undefined;
}

// UPDATED
async function handleHuggingFaceModels(query: string) {
  try {
    // 1) search list (fast)
    const res = await fetch(
      `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=50&sort=downloads&direction=-1`
    );
    if (!res.ok) throw new Error("Failed to fetch models from Hugging Face");
    const models = await res.json();

    // 2) enrich each row
    const formatted = await Promise.all(
      models.map(async (m: any) => {
        // ── format: be generous (tags OR any .gguf filename)
        const hasGgufTag = Array.isArray(m.tags) && m.tags.some((t: string) => t.toLowerCase() === "gguf");
        const ggufFile = m.siblings?.find((s: any) => s?.rfilename?.toLowerCase?.().endsWith(".gguf"));
        const format = hasGgufTag || ggufFile ? "GGUF" : "UNKNOWN";

        // ── size: try detail.gguf.total; else HEAD the .gguf file; else Unknown
        let sizeStr = "Unknown";
        try {
          const detail = await fetch(`https://huggingface.co/api/models/${m.id}`).then(r => r.ok ? r.json() : null);
          const ggufTotal = detail?.gguf?.total; // bytes, if present on some repos
          if (typeof ggufTotal === "number") sizeStr = formatBytes(ggufTotal);
        } catch { /* ignore */ }

        if (sizeStr === "Unknown" && ggufFile?.rfilename) {
          const bytes = await headSize(m.id, ggufFile.rfilename);
          sizeStr = formatBytes(bytes);
        }

        return {
          id: m.id,
          name: m.id.split("/")[1] || m.id,
          author: m.author || m.id.split("/")[0] || "unknown",
          downloads: m.downloads ?? 0,
          likes: m.likes ?? 0,
          tags: m.tags ?? [],
          size: sizeStr,   // ✅ no more “Unknown” when HEAD works
          format,          // ✅ shows GGUF based on tags/filenames
        };
      })
    );

    return NextResponse.json(formatted);
  } catch (err) {
    console.error("HuggingFace API error:", err);
    return NextResponse.json([], { status: 500 });
  }
}

async function handleOllamaStatus(host?: string | null) {
  try {
    const ollamaInstance = host ? new Ollama({ host }) : ollama;
    await ollamaInstance.list();
    return NextResponse.json({ isRunning: true });
  } catch (error) {
    return NextResponse.json({ isRunning: false });
  }
}

async function handleLocalModels(host?: string | null) {
  try {
    const ollamaInstance = host ? new Ollama({ host }) : ollama;
    const response = await ollamaInstance.list();
    const models = response.models.map(model => ({
      name: model.name,
      size: formatSize(model.size),
      format: 'GGUF',
      downloadedAt: model.modified_at ? new Date(model.modified_at).toISOString() : new Date().toISOString(),
      backend: 'ollama-cpu' as const
    }));

    return NextResponse.json(models);
  } catch (error) {
    console.error('Local models error:', error);
    return NextResponse.json([], { status: 500 });
  }
}

async function handleLocalFiles() {
  try {
    const files = fs.readdirSync(MODELS_DIR);
    const modelFiles = files.filter(file => file.endsWith('.gguf') || file.endsWith('.bin'));

    const models = modelFiles.map(file => {
      const filePath = path.join(MODELS_DIR, file);
      const stats = fs.statSync(filePath);

      return {
        name: file.replace(/\.(gguf|bin)$/i, ''),
        filename: file,
        size: formatSize(stats.size),
        format: file.endsWith('.gguf') ? 'GGUF' : 'GGML',
        downloadedAt: stats.mtime.toISOString(),
        path: filePath,
        backend: 'local' as const
      };
    });

    return NextResponse.json(models);
  } catch (error) {
    console.error('Local files error:', error);
    return NextResponse.json([], { status: 500 });
  }
}

function handleSystemSpecs() {
  try {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return NextResponse.json({
      platform: os.platform(),        // 'win32' | 'darwin' | 'linux'
      arch: os.arch(),                // 'x64' | 'arm64' ...
      cpuModel: cpus?.[0]?.model?.trim() || 'Unknown CPU',
      cpuCores: cpus?.length || 0,
      totalMemoryBytes: totalMem,
      freeMemoryBytes: freeMem,
      totalMemoryGB: Math.round((totalMem / 1024 ** 3) * 10) / 10,
      freeMemoryGB: Math.round((freeMem / 1024 ** 3) * 10) / 10,
    });
  } catch (error) {
    console.error('System specs error:', error);
    return NextResponse.json({ error: 'Failed to read system specs' }, { status: 500 });
  }
}

function handleActiveDownloads() {
  try {
    const active = getActiveDownloads();
    return NextResponse.json(active);
  } catch (error) {
    console.error('Active downloads error:', error);
    return NextResponse.json([], { status: 500 });
  }
}

function handleDownloadProgressSSE(downloadId: string | null) {
  if (!downloadId) {
    return NextResponse.json({ error: 'Download ID (id) is required' }, { status: 400 });
  }

  // SSE stream that polls the DB every 500ms and pushes updates to the client.
  // When the download finishes (completed/error/cancelled), the stream closes.
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(() => {
        try {
          if (closed) { clearInterval(interval); return; }

          const rec = getDownload(downloadId);
          if (!rec) {
            controller.enqueue(
              encoder.encode(`event: error\ndata: ${JSON.stringify({ status: 'error', message: 'Download not found' })}\n\n`)
            );
            clearInterval(interval);
            closed = true;
            controller.close();
            return;
          }

          controller.enqueue(
            encoder.encode(`event: progress\ndata: ${JSON.stringify({
              download_id: rec.download_id,
              model_id: rec.model_id,
              status: rec.status,
              progress: rec.progress,
              message: rec.message,
              bytes_done: rec.bytes_done,
              bytes_total: rec.bytes_total,
            })}\n\n`)
          );

          if (rec.status === 'completed' || rec.status === 'error' || rec.status === 'cancelled') {
            clearInterval(interval);
            closed = true;
            controller.close();
          }
        } catch {
          clearInterval(interval);
          if (!closed) { closed = true; controller.close(); }
        }
      }, 500);
    },
    cancel() {
      closed = true;
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

async function handleProviderModels(provider: string | null) {
  if (!provider) {
    return NextResponse.json({ error: 'Provider parameter is required' }, { status: 400 });
  }

  try {
    const models = await modelService.getProviderModels(provider as any);
    return NextResponse.json(models);
  } catch (error) {
    console.error(`Provider models error for ${provider}:`, error);
    return NextResponse.json([], { status: 500 });
  }
}

function extractModelSize(modelId: string): string {
  const sizeMatch = modelId.match(/(\d+(?:\.\d+)?)([bBkKmMgGtT])/i);
  if (sizeMatch) {
    const [, size, unit] = sizeMatch;
    return `${size}${unit.toUpperCase()}`;
  }
  return 'Unknown';
}

function detectFormat(tags: string[]): string {
  if (tags.some(tag => tag.toLowerCase().includes('gguf'))) return 'GGUF';
  if (tags.some(tag => tag.toLowerCase().includes('h2o'))) return 'H2O-Danube';
  if (tags.some(tag => tag.toLowerCase().includes('safetensors'))) return 'SafeTensors';
  return 'Unknown';
}

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
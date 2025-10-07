import { NextRequest, NextResponse } from 'next/server';
import { Ollama } from 'ollama';
import fs from 'fs';
import path from 'path';
import { modelService } from '@/lib/model-service';

const MODELS_DIR = path.join(process.cwd(), 'models');

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://localhost:11434'
});

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
      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/models - Download model
export async function POST(request: NextRequest) {
  try {
    const { modelId, downloadSource, host } = await request.json();

    if (!modelId) {
      return NextResponse.json({ error: 'Model ID is required' }, { status: 400 });
    }

    // Choose download method based on source
    if (downloadSource === 'direct') {
      return await downloadModelDirect(modelId);
    } else {
      // Default to Ollama download with progress
      return await downloadModelWithOllama(modelId, host);
    }
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json({ error: 'Failed to start download' }, { status: 500 });
  }
}

// DELETE /api/models - Delete model
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const modelName = searchParams.get('name');
  const host = searchParams.get('host');

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

async function downloadModelDirect(modelId: string) {
  try {
    // Create a custom response for Server-Sent Events
    let controller: ReadableStreamDefaultController;

    const stream = new ReadableStream({
      start(ctrl) {
        controller = ctrl;
        // Send initial progress
        controller.enqueue(`event: progress\ndata: ${JSON.stringify({ status: 'starting', progress: 0, message: 'Starting download...' })}\n\n`);

        // Start the download process asynchronously
        downloadModelFromHuggingFace(modelId, controller);
      }
    });

    const response = new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });

    return response;
  } catch (error) {
    console.error('Direct download error:', error);
    return NextResponse.json({ error: 'Failed to start download' }, { status: 500 });
  }
}

async function downloadModelWithOllama(modelId: string, host?: string | null) {
  // Create a custom response for Server-Sent Events
  let controller: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;
      // Send initial progress
      controller.enqueue(`event: progress\ndata: ${JSON.stringify({ status: 'starting', progress: 0, message: 'Starting download...' })}\n\n`);

      // Start the download process asynchronously
      downloadModelWithProgress(modelId, controller, host);
    }
  });

  const response = new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });

  return response;
}

async function downloadModelFromHuggingFace(modelId: string, controller: ReadableStreamDefaultController) {
  try {
    // First, get the model info to find GGUF files
    const modelInfoResponse = await fetch(`https://huggingface.co/api/models/${modelId}`);
    if (!modelInfoResponse.ok) {
      throw new Error('Model not found on Hugging Face');
    }

    const modelInfo = await modelInfoResponse.json();

    // Get the model files
    const filesResponse = await fetch(`https://huggingface.co/api/models/${modelId}/tree/main`);
    if (!filesResponse.ok) {
      throw new Error('Could not fetch model files');
    }

    const files = await filesResponse.json();

    // Find GGUF files (prioritize smaller ones first)
    const ggufFiles = files
      .filter((file: any) => file.type === 'file' && file.path.toLowerCase().endsWith('.gguf'))
      .sort((a: any, b: any) => a.size - b.size);

    if (ggufFiles.length === 0) {
      throw new Error('No GGUF files found for this model');
    }

    // Use the smallest GGUF file (usually Q4_K_M or similar)
    const selectedFile = ggufFiles[0];
    const downloadUrl = `https://huggingface.co/${modelId}/resolve/main/${selectedFile.path}`;
    const filename = selectedFile.path.split('/').pop() || `${modelId.split('/')[1]}.gguf`;
    const filePath = path.join(MODELS_DIR, filename);

    // Start download
    const downloadResponse = await fetch(downloadUrl);
    if (!downloadResponse.ok) {
      throw new Error('Failed to download model file');
    }

    const contentLength = parseInt(downloadResponse.headers.get('content-length') || '0');
    const reader = downloadResponse.body?.getReader();

    if (!reader) {
      throw new Error('Failed to create download stream');
    }

    const fileStream = fs.createWriteStream(filePath);
    let downloadedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      fileStream.write(value);
      downloadedBytes += value.length;

      const progress = contentLength > 0 ? Math.round((downloadedBytes / contentLength) * 100) : 0;
      const message = `Downloading ${filename}... (${formatSize(downloadedBytes)}${contentLength > 0 ? ` / ${formatSize(contentLength)}` : ''})`;

      controller.enqueue(`event: progress\ndata: ${JSON.stringify({
        status: 'downloading',
        progress,
        message,
        downloaded: downloadedBytes,
        total: contentLength
      })}\n\n`);
    }

    fileStream.end();

    // Wait for file to be written
    await new Promise<void>((resolve, reject) => {
      fileStream.on('finish', () => resolve());
      fileStream.on('error', reject);
    });

    // Send completion
    controller.enqueue(`event: complete\ndata: ${JSON.stringify({
      status: 'completed',
      progress: 100,
      message: `Download completed! Model saved as ${filename}`,
      filename,
      path: filePath
    })}\n\n`);

  } catch (error) {
    console.error('Direct download error:', error);
    controller.enqueue(`event: error\ndata: ${JSON.stringify({
      status: 'error',
      progress: 0,
      message: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    })}\n\n`);
  } finally {
    controller.close();
  }
}

async function downloadModelWithProgress(modelId: string, controller: ReadableStreamDefaultController, host?: string | null) {
  try {
    // Use Ollama's pull with progress tracking
    const ollamaInstance = host ? new Ollama({ host }) : ollama;
    const pullResponse = await ollamaInstance.pull({
      model: modelId,
      stream: true
    });

    let totalLayers = 0;
    let completedLayers = 0;

    for await (const chunk of pullResponse) {
      if (chunk.total) {
        totalLayers = chunk.total;
      }

      if (chunk.completed) {
        completedLayers = chunk.completed;
      }

      const progress = totalLayers > 0 ? Math.round((completedLayers / totalLayers) * 100) : 0;
      const message = chunk.status || `Downloading ${modelId}...`;

      controller.enqueue(`event: progress\ndata: ${JSON.stringify({
        status: 'downloading',
        progress,
        message,
        completed: completedLayers,
        total: totalLayers
      })}\n\n`);

      // Small delay to prevent overwhelming the client
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Send completion
    controller.enqueue(`event: complete\ndata: ${JSON.stringify({
      status: 'completed',
      progress: 100,
      message: 'Download completed successfully!'
    })}\n\n`);

  } catch (error) {
    console.error('Download error:', error);
    controller.enqueue(`event: error\ndata: ${JSON.stringify({
      status: 'error',
      progress: 0,
      message: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    })}\n\n`);
  } finally {
    controller.close();
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
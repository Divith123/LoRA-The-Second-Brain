// app/api/files/route.ts
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { processUploadedFile, type UploadedFileMeta as Meta } from "@/lib/file-processing";
import { indexDocument } from "@/lib/rag-store";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

async function ensureDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

export type UploadedFileMeta = {
  id: string;           // temporary id (we’ll persist in DB in step 2)
  name: string;         // original name
  serverName: string;   // stored filename on disk
  mime: string;
  size: number;
  path: string;         // absolute path on server
  createdAt: string;
};

// POST /api/files  (multipart/form-data; key = "files")
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    await ensureDir();
    const form = await req.formData();

    const files = form.getAll("files");
    if (!files.length) {
      return NextResponse.json(
        { error: "No files provided (key must be 'files')" },
        { status: 400 }
      );
    }

    const saved: Array<Meta & { textLen: number; chunkCount: number }> = [];

    for (const f of files) {
      if (!(f instanceof File)) continue;

      const id = crypto.randomUUID();
      const original = safeName(f.name || "file");
      const serverName = `${Date.now()}-${id}-${original}`;
      const abs = path.join(UPLOAD_DIR, serverName);

      // write to disk
      const buf = Buffer.from(await f.arrayBuffer());
      await fs.writeFile(abs, buf);

      // Note: DatabaseService uses IndexedDB (browser-only), so we can't store metadata server-side
      // File metadata should be managed client-side only
      // TODO: Implement proper server-side file metadata storage if needed

      // ---- NEW: extract & chunk immediately
      const meta: Meta = {
        id,
        name: original,
        serverName,
        mime: f.type || "application/octet-stream",
        size: buf.byteLength,
        path: abs,
        createdAt: new Date().toISOString(),
      };

      const processed = await processUploadedFile(meta);
      await indexDocument(meta.id, processed.chunks);
      saved.push({
        ...meta,
        textLen: processed.text.length,
        chunkCount: processed.chunks.length,
      });
    }

    return NextResponse.json({ files: saved }, { status: 201 });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// GET /api/files - List uploaded files for a specific user
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Since DatabaseService uses IndexedDB (browser-only), we can't access it from server-side API routes
    // For now, return empty array. File metadata should be managed client-side only.
    // TODO: Implement proper server-side file metadata storage if needed
    const files: any[] = [];

    return NextResponse.json({ files }, { status: 200 });
  } catch (err) {
    console.error("List files error:", err);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}

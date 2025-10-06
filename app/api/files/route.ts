// app/api/files/route.ts
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { processUploadedFile, type UploadedFileMeta as Meta } from "@/lib/file-processing";
import { indexDocument } from "@/lib/rag-store";

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

// DELETE /api/files?id=<tempId>&name=<serverName>
// (Convenience cleanup until we persist in DB)
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const serverName = url.searchParams.get("name");
    if (!serverName) return NextResponse.json({ error: "name required" }, { status: 400 });

    const abs = path.join(UPLOAD_DIR, path.basename(serverName));
    await fs.unlink(abs).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

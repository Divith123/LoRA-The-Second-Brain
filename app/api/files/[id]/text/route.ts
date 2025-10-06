import { NextResponse, NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { extractText } from '@/lib/file-processing';

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entries = await fs.readdir(UPLOAD_DIR);
    const hit = entries.find(n => n.includes(`-${params.id}-`));
    if (!hit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const abs = path.join(UPLOAD_DIR, hit);

    // Extract text for many file formats (txt/csv/pdf/docx/etc.)
    const meta = {
      id: params.id,
      name: hit.split(`-${params.id}-`).slice(1).join(`-${params.id}-`) || hit,
      serverName: hit,
      mime: '',
      size: (await fs.stat(abs)).size,
      path: abs,
      createdAt: new Date().toISOString(),
    } as any;

    const text = (await extractText(meta)).slice(0, 64 * 1024);
    return new NextResponse(text, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Read failed" }, { status: 500 });
  }
}

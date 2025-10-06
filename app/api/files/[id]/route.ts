import { NextResponse, NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

function guessContentType(name: string) {
  const ext = path.extname(name).toLowerCase();
  switch (ext) {
    case ".txt": return "text/plain";
    case ".md": return "text/markdown";
    case ".csv": return "text/csv";
    case ".json": return "application/json";
    case ".pdf": return "application/pdf";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entries = await fs.readdir(UPLOAD_DIR);
    const hit = entries.find(n => n.includes(`-${params.id}-`));
    if (!hit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const abs = path.join(UPLOAD_DIR, hit);
  const buf = await fs.readFile(abs);
  const body = new Uint8Array(buf);

    const original = hit.split(`-${params.id}-`).slice(1).join(`-${params.id}-`) || hit;
    const contentType = guessContentType(hit);

    // Decide inline vs attachment: common previewable types inline
    const inlineTypes = ["text/plain","text/markdown","text/csv","application/json","application/pdf","image/png","image/jpeg","image/gif","image/webp"];
    const dispType = inlineTypes.includes(contentType) ? "inline" : "attachment";

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": `${contentType}; charset=utf-8`,
        "Content-Disposition": `${dispType}; filename="${original.replace(/\"/g, '"') }"`,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Read failed" }, { status: 500 });
  }
}

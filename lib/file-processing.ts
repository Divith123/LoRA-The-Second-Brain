// lib/file-processing.ts
import fs from "node:fs/promises";
import path from "node:path";

export type UploadedFileMeta = {
  id: string;
  name: string;
  serverName: string;
  mime: string;
  size: number;
  path: string;
  createdAt: string;
};

export type ExtractedDoc = {
  file: UploadedFileMeta;
  text: string;
  chunks: string[];
};

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 200;

export function chunkText(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_OVERLAP
): string[] {
  const chunks: string[] = [];
  const clean = text.replace(/\r/g, "");
  if (!clean.trim()) return chunks;

  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + chunkSize, clean.length);
    const slice = clean.slice(i, end);
    chunks.push(slice.trim());
    if (end === clean.length) break;
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks;
}

async function extractTxtLike(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath, "utf8");
  return buf.toString();
}

async function extractCsv(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath, "utf8");
  // very light CSV → TSV text (good enough for RAG)
  return raw.replace(/,/g, "\t");
}

async function extractPdf(filePath: string): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default as any;
    const dataBuffer = await fs.readFile(filePath);
    const res = await pdfParse(dataBuffer);
    return res?.text ?? "";
  } catch {
    // pdf-parse not installed
    return "";
  }
}

async function extractDocx(filePath: string): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const res = await mammoth.extractRawText({ path: filePath });
    return res?.value ?? "";
  } catch {
    // mammoth not installed
    return "";
  }
}

function extOf(filePath: string) {
  return path.extname(filePath).toLowerCase();
}

export async function extractText(meta: UploadedFileMeta): Promise<string> {
  const e = extOf(meta.path);
  const mime = (meta.mime || "").toLowerCase();

  if (e === ".txt" || e === ".md" || mime.startsWith("text/")) {
    return extractTxtLike(meta.path);
  }
  if (e === ".csv" || mime === "text/csv") {
    return extractCsv(meta.path);
  }
  if (e === ".pdf" || mime === "application/pdf") {
    return extractPdf(meta.path);
  }
  if (e === ".docx" || mime.includes("officedocument.wordprocessingml")) {
    return extractDocx(meta.path);
  }

  // fallback: try reading as utf8 text
  try {
    return extractTxtLike(meta.path);
  } catch {
    return "";
  }
}

export async function processUploadedFile(
  meta: UploadedFileMeta,
  opts?: { chunkSize?: number; overlap?: number }
): Promise<ExtractedDoc> {
  const text = await extractText(meta);
  const chunks = chunkText(text, opts?.chunkSize, opts?.overlap);
  return { file: meta, text, chunks };
}

// lib/rag-store.ts
import { embedTexts } from "./embeddings";

export type ChunkRecord = {
  id: string;
  docId: string;
  idx: number;
  text: string;
  vector: number[];
};

const mem: ChunkRecord[] = []; // MVP in-memory

function cosine(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s; // both are normalized
}

export async function indexDocument(
  docId: string,
  chunks: string[]
): Promise<number> {
  if (!chunks.length) return 0;
  const vecs = await embedTexts(chunks);
  for (let i = 0; i < chunks.length; i++) {
    mem.push({
      id: `${docId}:${i}`,
      docId,
      idx: i,
      text: chunks[i],
      vector: vecs[i],
    });
  }
  return chunks.length;
}

export async function retrieveRelevant(
  query: string,
  docFilter?: string[] | null,
  k: number = 6
) {
  if (!mem.length) return [];
  const [qv] = await embedTexts([query]);
  const pool = docFilter?.length ? mem.filter(m => docFilter.includes(m.docId)) : mem;

  const scored = pool.map(r => ({ r, score: cosine(qv, r.vector) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(s => s.r);
}

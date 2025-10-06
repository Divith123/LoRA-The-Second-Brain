// lib/embeddings.ts
// Pure TF-IDF fallback (no native deps)

function tokenize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  // TF-IDF with L2 normalization
  const docs = texts.map(tokenize);

  const vocab = new Map<string, number>();
  const df = new Map<string, number>();
  for (const d of docs) {
    const seen = new Set(d);
    for (const t of Array.from(seen)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  let idx = 0;
  for (const t of Array.from(df.keys())) vocab.set(t, idx++);

  const N = texts.length;
  const mat = texts.map(() => Array(vocab.size).fill(0));

  docs.forEach((d, i) => {
    const counts = new Map<string, number>();
    for (const t of d) counts.set(t, (counts.get(t) ?? 0) + 1);
    const max = Math.max(...Array.from(counts.values()), 1);
    for (const [t, c] of Array.from(counts.entries())) {
      const j = vocab.get(t)!;
      const tf = 0.5 + 0.5 * (c / max);
      const idf = Math.log((N + 1) / ((df.get(t) ?? 1) + 1)) + 1;
      mat[i][j] = tf * idf;
    }
  });

  // L2 normalize
  for (const v of mat) {
    const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
  }
  return mat;
}

// lib/server/bm25.ts
// Pure-TypeScript BM25 lexical retrieval. No native dependencies.
//
// BM25 is computed over a provided corpus (the user's chunks). We build the
// index on demand from persisted rows. For Phase 1 corpora (per-user document
// collections) this is cheap; a persistent inverted index is a Phase 2+
// optimization and is called out in the README limitations.

export interface Bm25Doc {
  id: string; // chunk_id
  text: string;
}

export interface Bm25Result {
  id: string;
  score: number;
}

const K1 = 1.5; // term-frequency saturation
const B = 0.75; // length normalization

/** Lowercase alphanumeric tokenizer, matching the dense side's preprocessing. */
export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export class Bm25Index {
  private docs: { id: string; tokens: string[]; len: number }[] = [];
  private df = new Map<string, number>(); // document frequency per term
  private avgLen = 0;
  private built = false;

  constructor(docs: Bm25Doc[] = []) {
    if (docs.length) this.build(docs);
  }

  build(docs: Bm25Doc[]): void {
    this.docs = docs.map((d) => {
      const tokens = tokenize(d.text);
      return { id: d.id, tokens, len: tokens.length };
    });

    this.df.clear();
    let totalLen = 0;
    for (const d of this.docs) {
      totalLen += d.len;
      const seen = new Set(d.tokens);
      for (const t of Array.from(seen)) {
        this.df.set(t, (this.df.get(t) ?? 0) + 1);
      }
    }
    this.avgLen = this.docs.length ? totalLen / this.docs.length : 0;
    this.built = true;
  }

  get size(): number {
    return this.docs.length;
  }

  /** Robertson–Spärck Jones IDF with the usual +0.5 smoothing, floored at 0. */
  private idf(term: string): number {
    const n = this.docs.length;
    const dft = this.df.get(term) ?? 0;
    const raw = Math.log((n - dft + 0.5) / (dft + 0.5) + 1);
    return Math.max(0, raw);
  }

  /** Score the corpus against a query; returns the top-k by BM25 score. */
  search(query: string, k = 50): Bm25Result[] {
    if (!this.built || !this.docs.length) return [];
    const qTokens = tokenize(query);
    if (!qTokens.length) return [];

    const qSet = Array.from(new Set(qTokens));
    const results: Bm25Result[] = [];

    for (const d of this.docs) {
      if (!d.len) continue;
      // term frequencies in this doc
      const tf = new Map<string, number>();
      for (const t of d.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

      let score = 0;
      for (const term of qSet) {
        const f = tf.get(term);
        if (!f) continue;
        const idf = this.idf(term);
        const denom = f + K1 * (1 - B + (B * d.len) / (this.avgLen || 1));
        score += idf * ((f * (K1 + 1)) / denom);
      }
      if (score > 0) results.push({ id: d.id, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }
}

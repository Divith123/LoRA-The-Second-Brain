// scripts/eval-retrieval.ts
// Reproducible retrieval evaluation comparing four methods on a small, fully
// documented synthetic dataset with known relevance judgments:
//
//   1. TF-IDF   (lib/embeddings.ts + cosine, shared-vocab reconstruction).
//              NOTE: this is a CHARITABLE baseline. It builds a single TF-IDF
//              matrix over the query + all documents so they share a vocabulary.
//              The ACTUAL shipped legacy rag-store recomputed TF-IDF per call
//              with query and documents in different vocabularies, so it
//              performed WORSE than this row suggests. We use the charitable
//              version to avoid flattering the new methods by comparison.
//   2. BM25     (lib/server/bm25.ts)
//   3. Dense    (lib/server/embeddings-local.ts + cosine)
//   4. Hybrid   (lib/server/retrieval-store.ts hybridRetrieve: dense+BM25 via RRF)
//
// Metrics (document-level): Recall@k, MRR@k, nDCG@k, plus mean query latency and
// on-disk index size. Fixed seed-free deterministic corpus; no fabricated
// numbers — everything printed is measured at runtime.
//
// Run:  npm run eval:retrieval
//       npm run eval:retrieval -- --k 5
//
// NOTE: honesty constraints — if the embedding model cannot be loaded, the
// Dense and Hybrid rows are reported as "unavailable" rather than zeros.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { openDbAt, blobToFloatArray } from "@/lib/server/db";
import { ingestDocument, hybridRetrieve } from "@/lib/server/retrieval-store";
import {
  embedTextsLocal,
  embedQueryLocal,
  cosineSim,
} from "@/lib/server/embeddings-local";
import { Bm25Index } from "@/lib/server/bm25";
import { embedTexts as tfidfEmbed } from "@/lib/embeddings";

// ----------------------- Evaluation dataset (documented) --------------------
// 12 short documents across 4 topics (pets, finance, astronomy, cooking) plus
// distractors. Each query has a single known-relevant document. This mirrors
// the unit-test fixtures but is larger so metrics are more meaningful. The
// dataset is intentionally small so the eval runs in seconds on a laptop.
const EVAL_USER = "eval-user";

const DOCS: { name: string; text: string }[] = [
  { name: "pets-cat.txt", text: "The cat sat quietly on the warm windowsill. Cats are independent, curious animals that enjoy sunlight and frequent short naps." },
  { name: "pets-dog.txt", text: "Dogs are loyal companions that thrive on routine and exercise. A well trained puppy learns to fetch, sit, and stay with practice." },
  { name: "pets-care.txt", text: "Regular veterinary checkups, vaccinations, and a balanced diet keep household animals healthy and happy throughout their lives." },
  { name: "finance-earnings.txt", text: "Quarterly revenue grew twelve percent year over year. The fiscal outlook remains positive and investors expect steady dividend growth." },
  { name: "finance-market.txt", text: "Stock markets fluctuated amid interest rate speculation. Analysts advised a diversified portfolio to hedge against volatility." },
  { name: "finance-budget.txt", text: "A household budget tracks monthly income and expenses, allocating funds to savings, rent, utilities, and discretionary spending." },
  { name: "astro-galaxies.txt", text: "The telescope captured distant galaxies and nebulae. Astronomers study starlight to understand the age and expansion of the universe." },
  { name: "astro-planets.txt", text: "The rover analyzed Martian soil for signs of water. Planetary scientists compare the atmospheres of rocky and gas giant worlds." },
  { name: "astro-blackhole.txt", text: "A black hole bends spacetime so strongly that light cannot escape its event horizon, revealed through gravitational lensing." },
  { name: "cook-pasta.txt", text: "Boil the pasta in salted water until al dente, then toss with garlic, olive oil, and freshly grated parmesan cheese." },
  { name: "cook-bread.txt", text: "Knead the dough until elastic, let it proof until doubled, then bake at high heat for a crisp golden crust." },
  { name: "cook-soup.txt", text: "Simmer vegetables and stock slowly to build flavor, seasoning with herbs, salt, and pepper near the end of cooking." },
];

// query -> the single relevant document name. Mix of semantic (synonyms, no
// lexical overlap) and lexical (rare exact keywords) to differentiate methods.
const QUERIES: { query: string; relevant: string; kind: "semantic" | "lexical" }[] = [
  { query: "a feline taking a nap in the sunshine", relevant: "pets-cat.txt", kind: "semantic" },
  { query: "training a loyal canine to fetch", relevant: "pets-dog.txt", kind: "semantic" },
  { query: "keeping household animals healthy vaccinations vet", relevant: "pets-care.txt", kind: "lexical" },
  { query: "quarterly revenue dividend fiscal outlook", relevant: "finance-earnings.txt", kind: "lexical" },
  { query: "hedging portfolio against market volatility", relevant: "finance-market.txt", kind: "semantic" },
  { query: "tracking monthly income and expenses savings", relevant: "finance-budget.txt", kind: "lexical" },
  { query: "distant galaxies nebulae starlight telescope", relevant: "astro-galaxies.txt", kind: "lexical" },
  { query: "searching for water on the red planet mars rover", relevant: "astro-planets.txt", kind: "semantic" },
  { query: "light cannot escape event horizon spacetime", relevant: "astro-blackhole.txt", kind: "lexical" },
  { query: "cooking noodles with garlic and parmesan", relevant: "cook-pasta.txt", kind: "semantic" },
  { query: "kneading dough and proofing before baking", relevant: "cook-bread.txt", kind: "lexical" },
  { query: "slowly simmering a flavorful vegetable broth", relevant: "cook-soup.txt", kind: "semantic" },
];

// ------------------------------- Metrics ------------------------------------
// All metrics are computed per query against a single relevant document and
// then averaged. Ranked = ordered list of document names (best first).

function recallAtK(ranked: string[], relevant: string, k: number): number {
  return ranked.slice(0, k).includes(relevant) ? 1 : 0;
}

function mrrAtK(ranked: string[], relevant: string, k: number): number {
  const i = ranked.slice(0, k).indexOf(relevant);
  return i === -1 ? 0 : 1 / (i + 1);
}

function ndcgAtK(ranked: string[], relevant: string, k: number): number {
  const i = ranked.slice(0, k).indexOf(relevant);
  if (i === -1) return 0;
  // single binary-relevant doc => IDCG = 1, DCG = 1/log2(rank+1)
  return 1 / Math.log2(i + 2);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// --------------------------- Retrieval methods ------------------------------
// Each returns a ranked list of DOCUMENT NAMES for a query. We rank documents
// by their best-scoring chunk (max pooling) so all methods are compared at the
// document level with the same relevance judgments.

type DocScored = { name: string; score: number };

function rankByBestChunk(perChunk: { name: string; score: number }[]): string[] {
  const best = new Map<string, number>();
  for (const c of perChunk) {
    const cur = best.get(c.name);
    if (cur === undefined || c.score > cur) best.set(c.name, c.score);
  }
  return Array.from(best.entries())
    .map(([name, score]): DocScored => ({ name, score }))
    // Deterministic ordering: sort by score desc, then by name asc so that
    // tied scores never depend on map/insertion order (which previously varied
    // run-to-run because chunk ids embedded random UUIDs).
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((d) => d.name);
}

async function main() {
  const kArgIdx = process.argv.indexOf("--k");
  const K = kArgIdx !== -1 ? Number(process.argv[kArgIdx + 1]) || 5 : 5;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-eval-"));
  const dbPath = path.join(tmpDir, "eval.db");
  const db = openDbAt(dbPath);

  console.log("=".repeat(72));
  console.log("Phase 1 Retrieval Evaluation");
  console.log(`Dataset: ${DOCS.length} documents, ${QUERIES.length} queries, k=${K}`);
  console.log("=".repeat(72));

  // Probe dense availability honestly.
  const [probe] = await embedTextsLocal(["probe"]);
  const denseAvailable = probe !== null;
  if (!denseAvailable) {
    console.warn(
      "\n[warn] Embedding model unavailable — Dense and Hybrid rows will be marked UNAVAILABLE.\n"
    );
  }

  // Ingest once into the persistent store (populates chunks + dense vectors).
  // Pass a STABLE docId derived from the document name so chunk_ids are
  // deterministic across runs (otherwise random UUIDs make tie-ordering, and
  // thus borderline MRR/nDCG, vary run-to-run).
  for (const d of DOCS) {
    await ingestDocument(
      { userId: EVAL_USER, name: d.name, text: d.text, docId: `eval-${d.name}` },
      db
    );
  }

  // Pull chunk rows once; all methods operate over the same chunks.
  const rows = db
    .prepare(
      `SELECT c.chunk_id, d.name AS doc_name, c.text, c.vector
       FROM rag_chunks c JOIN rag_documents d ON d.doc_id = c.doc_id
       WHERE c.user_id = ? ORDER BY c.chunk_id`
    )
    .all(EVAL_USER) as {
    chunk_id: string;
    doc_name: string;
    text: string;
    vector: Buffer | null;
  }[];

  // Pre-build the two reusable indexes.
  const bm25 = new Bm25Index(rows.map((r) => ({ id: r.chunk_id, text: r.text })));
  const nameByChunk = new Map(rows.map((r) => [r.chunk_id, r.doc_name]));

  // TF-IDF (shared vocab) — build a joint matrix over ALL chunks + the query so
  // that the query and documents share a vocabulary (the legacy per-call bug
  // meant they usually did not; here we construct it correctly for a fair,
  // charitable baseline that is kinder than the real shipped legacy path).
  async function tfidfRank(query: string): Promise<string[]> {
    const corpus = rows.map((r) => r.text);
    const mat = await tfidfEmbed([query, ...corpus]); // row 0 = query
    const q = mat[0];
    const perChunk = rows.map((r, i) => {
      const v = mat[i + 1];
      let s = 0;
      for (let j = 0; j < q.length && j < v.length; j++) s += q[j] * v[j];
      return { name: r.doc_name, score: s };
    });
    return rankByBestChunk(perChunk);
  }

  function bm25Rank(query: string): string[] {
    const res = bm25.search(query, rows.length);
    return rankByBestChunk(
      res.map((r) => ({ name: nameByChunk.get(r.id)!, score: r.score }))
    );
  }

  async function denseRank(query: string): Promise<string[]> {
    const qv = await embedQueryLocal(query);
    if (!qv) return [];
    const perChunk = rows.map((r) => {
      const v = blobToFloatArray(r.vector);
      return { name: r.doc_name, score: v ? cosineSim(qv, v) : -1 };
    });
    return rankByBestChunk(perChunk);
  }

  async function hybridRank(query: string): Promise<string[]> {
    const res = await hybridRetrieve(
      { userId: EVAL_USER, query, topK: rows.length },
      db
    );
    // hybridRetrieve already returns chunk-level, fused order; collapse to docs
    // preserving first-seen (best fused) order.
    const seen = new Set<string>();
    const order: string[] = [];
    for (const c of res) {
      if (!seen.has(c.docName)) {
        seen.add(c.docName);
        order.push(c.docName);
      }
    }
    return order;
  }

  type MethodResult = {
    name: string;
    recall: number;
    mrr: number;
    ndcg: number;
    msPerQuery: number;
    available: boolean;
  };

  async function evaluate(
    label: string,
    ranker: (q: string) => Promise<string[]> | string[],
    available = true
  ): Promise<MethodResult> {
    if (!available) {
      return { name: label, recall: 0, mrr: 0, ndcg: 0, msPerQuery: 0, available: false };
    }
    const recalls: number[] = [];
    const mrrs: number[] = [];
    const ndcgs: number[] = [];
    const t0 = performance.now();
    for (const { query, relevant } of QUERIES) {
      const ranked = await ranker(query);
      recalls.push(recallAtK(ranked, relevant, K));
      mrrs.push(mrrAtK(ranked, relevant, K));
      ndcgs.push(ndcgAtK(ranked, relevant, K));
    }
    const elapsed = performance.now() - t0;
    return {
      name: label,
      recall: mean(recalls),
      mrr: mean(mrrs),
      ndcg: mean(ndcgs),
      msPerQuery: elapsed / QUERIES.length,
      available: true,
    };
  }

  const results: MethodResult[] = [];
  results.push(await evaluate("TF-IDF (shared)", tfidfRank));
  results.push(await evaluate("BM25", bm25Rank));
  results.push(await evaluate("Dense", denseRank, denseAvailable));
  results.push(await evaluate("Hybrid (RRF)", hybridRank, denseAvailable));

  // On-disk index size (SQLite file + WAL sidecars).
  let bytes = 0;
  for (const f of fs.readdirSync(tmpDir)) {
    bytes += fs.statSync(path.join(tmpDir, f)).size;
  }
  const indexKb = (bytes / 1024).toFixed(1);

  // ------------------------------- Report ----------------------------------
  const pad = (s: string, n: number) => s.padEnd(n);
  const num = (x: number) => x.toFixed(3);
  console.log("");
  console.log(
    pad("Method", 18) +
      pad(`Recall@${K}`, 11) +
      pad(`MRR@${K}`, 10) +
      pad(`nDCG@${K}`, 10) +
      pad("ms/query", 10)
  );
  console.log("-".repeat(59));
  for (const r of results) {
    if (!r.available) {
      console.log(pad(r.name, 18) + "UNAVAILABLE (embedding model not loaded)");
      continue;
    }
    console.log(
      pad(r.name, 18) +
        pad(num(r.recall), 11) +
        pad(num(r.mrr), 10) +
        pad(num(r.ndcg), 10) +
        pad(r.msPerQuery.toFixed(1), 10)
    );
  }
  console.log("-".repeat(59));
  console.log(`Index size on disk: ${indexKb} KB (SQLite + WAL)`);
  console.log(`Embedding model:    ${denseAvailable ? "loaded" : "unavailable"}`);
  console.log("");
  console.log(
    "Note: metrics are document-level (best-chunk pooling) against single-relevant\n" +
      "judgments on the synthetic dataset defined in this file. Reproduce with:\n" +
      "  npm run eval:retrieval -- --k " + K
  );

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

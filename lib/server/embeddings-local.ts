// lib/server/embeddings-local.ts
// Local sentence-embedding service backed by @xenova/transformers (ONNX runtime).
//
// - Fully local inference. The model is downloaded once from the Hugging Face
//   hub and then cached on disk; subsequent runs work offline.
// - Lazy singleton: the pipeline is only constructed on first use so importing
//   this module is cheap and never blocks startup.
// - Output vectors are mean-pooled over tokens and L2-normalized, so a dot
//   product between two vectors equals their cosine similarity.
//
// This service is Node-only (it uses onnxruntime-node) and must not be bundled
// into client components.

import { retrievalConfig } from "@/lib/config";

type FeatureExtractionPipeline = (
  texts: string | string[],
  opts: { pooling: "mean" | "none" | "cls"; normalize: boolean }
) => Promise<{ data: Float32Array; dims: number[] }>;

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;
let embeddingDim: number | null = null;
let loadFailed = false;

/**
 * Build (once) and return the feature-extraction pipeline. Returns null if the
 * model cannot be loaded (e.g. no network on first run); callers must treat a
 * null/empty result as "dense retrieval unavailable" and fall back to lexical.
 */
async function getPipeline(): Promise<FeatureExtractionPipeline | null> {
  if (loadFailed) return null;
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      // Dynamic import keeps the heavy dependency out of the module graph until
      // it is actually needed, and avoids SSR bundling issues.
      const { pipeline, env } = await import("@xenova/transformers");

      // Keep model/cache locations configurable and local-first.
      if (process.env.SECOND_BRAIN_MODELS_CACHE) {
        env.cacheDir = process.env.SECOND_BRAIN_MODELS_CACHE;
      }
      // Allow fully offline operation once the model has been cached.
      if (/^(1|true|yes|on)$/i.test(process.env.SECOND_BRAIN_OFFLINE || "")) {
        env.allowRemoteModels = false;
      }

      const extractor = (await pipeline(
        "feature-extraction",
        retrievalConfig.embeddingModel
      )) as unknown as FeatureExtractionPipeline;
      return extractor;
    })().catch((err) => {
      console.error(
        "[embeddings-local] Failed to load embedding model; dense retrieval disabled:",
        err instanceof Error ? err.message : err
      );
      loadFailed = true;
      // Re-throw so the awaiting caller's try/catch can handle it.
      throw err;
    });
  }

  try {
    return await pipelinePromise;
  } catch {
    return null;
  }
}

/** Dimension of the loaded embedding model, or null if not loaded yet. */
export function getEmbeddingDim(): number | null {
  return embeddingDim;
}

/** True if a previous load attempt failed; dense retrieval should be skipped. */
export function isDenseUnavailable(): boolean {
  return loadFailed;
}

/**
 * Embed a batch of texts. Returns one Float32Array per input (L2-normalized).
 * On failure, returns an array of nulls of the same length so callers can
 * degrade gracefully rather than crash.
 */
export async function embedTextsLocal(
  texts: string[]
): Promise<(Float32Array | null)[]> {
  if (!texts.length) return [];

  const extractor = await getPipeline();
  if (!extractor) return texts.map(() => null);

  const out: (Float32Array | null)[] = [];
  // Process one at a time to keep peak memory low on constrained machines and
  // to make a single failing input non-fatal for the rest of the batch.
  for (const t of texts) {
    const clean = (t ?? "").trim();
    if (!clean) {
      out.push(null);
      continue;
    }
    try {
      const result = await extractor(clean, { pooling: "mean", normalize: true });
      const vec = new Float32Array(result.data); // copy out of the backing buffer
      embeddingDim = vec.length;
      out.push(vec);
    } catch (err) {
      console.error(
        "[embeddings-local] Embedding failed for one input:",
        err instanceof Error ? err.message : err
      );
      out.push(null);
    }
  }
  return out;
}

/** Embed a single query. Returns null if dense retrieval is unavailable. */
export async function embedQueryLocal(query: string): Promise<Float32Array | null> {
  const [v] = await embedTextsLocal([query]);
  return v ?? null;
}

/** Cosine similarity for L2-normalized vectors (i.e. a dot product). */
export function cosineSim(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

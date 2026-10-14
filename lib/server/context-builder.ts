// Clean interface between chat orchestration (app/actions.tsx) and the Phase 1
// retrieval + memory layers. Keeps the server action thin and keeps all
// Node-only imports (SQLite, embeddings) behind a single module.
//
// Everything here is guarded by config flags and fails soft: if a layer errors
// or is disabled, it contributes an empty string and the chat still works.

import { retrievalConfig, memoryConfig } from "@/lib/config";
import {
  hybridRetrieveWithDiagnostics,
  retrievalStats,
} from "@/lib/server/retrieval-store";
import { getActiveMemories } from "@/lib/server/memory-store";

export interface BuiltContext {
  /** Markdown block of retrieved document chunks with source attribution. */
  retrievalContext: string;
  /** Markdown block of active structured personal memories. */
  memoryContext: string;
  /** Debug/telemetry counts (not shown to the model). */
  stats: {
    retrievalEnabled: boolean;
    memoryEnabled: boolean;
    indexedDocs: number;
    indexedChunks: number;
    denseCandidates: number;
    bm25Candidates: number;
    retrievedChunks: number;
    activeMemories: number;
    injectedMemories: number;
    scope: "corpus" | "filtered" | "none";
  };
}

function emptyStats(): BuiltContext["stats"] {
  return {
    retrievalEnabled: retrievalConfig.enabled,
    memoryEnabled: memoryConfig.enabled,
    indexedDocs: 0,
    indexedChunks: 0,
    denseCandidates: 0,
    bm25Candidates: 0,
    retrievedChunks: 0,
    activeMemories: 0,
    injectedMemories: 0,
    scope: "none",
  };
}

export interface BuildContextOptions {
  userId?: string | null;
  query: string;
  /**
   * Optional hard restriction to specific document ids. IMPORTANT: by default
   * (null/undefined) retrieval searches the user's WHOLE corpus — the "second
   * brain" should recall from everything the user has stored, not only the
   * files attached to the current message. Passing a docFilter is an explicit
   * narrowing (e.g. "answer only from these files").
   */
  docFilter?: string[] | null;
  topK?: number;
}

/**
 * Build retrieval + memory context for a single turn. Both legs are optional
 * and independently flag-gated. Returns empty strings when disabled or on error
 * so the caller can concatenate unconditionally.
 */
export async function buildTurnContext(
  opts: BuildContextOptions
): Promise<BuiltContext> {
  const userId = opts.userId?.trim();
  const query = (opts.query ?? "").trim();

  const stats = emptyStats();

  // Without a user we cannot enforce isolation, so we contribute nothing.
  if (!userId || !query) {
    return { retrievalContext: "", memoryContext: "", stats };
  }

  let retrievalContext = "";
  let memoryContext = "";

  // ---- Hybrid retrieval leg (corpus-wide by default) ----
  if (retrievalConfig.enabled) {
    try {
      const { docs, chunks } = retrievalStats(userId);
      stats.indexedDocs = docs;
      stats.indexedChunks = chunks;

      const docFilter = opts.docFilter && opts.docFilter.length ? opts.docFilter : null;
      stats.scope = docFilter ? "filtered" : "corpus";

      const result = await hybridRetrieveWithDiagnostics({
        userId,
        query,
        topK: opts.topK ?? retrievalConfig.topK,
        docFilter,
      });
      stats.denseCandidates = result.diagnostics.denseCandidates;
      stats.bm25Candidates = result.diagnostics.bm25Candidates;
      stats.retrievedChunks = result.chunks.length;

      if (result.chunks.length) {
        const body = result.chunks
          .map(
            (c, i) =>
              `[#${i + 1}] source="${c.docName}" (doc:${c.docId}, chunk:${c.idx}, score:${c.score.toFixed(4)}, dense:${c.denseRank ?? "-"}, bm25:${c.bm25Rank ?? "-"})\n${c.text}`
          )
          .join("\n\n");
        retrievalContext = `RETRIEVED CONTEXT (hybrid dense+BM25 over your saved documents; cite sources by name when used):\n\n${body}`;
      }
    } catch (err) {
      console.error(
        "[context-builder] hybrid retrieval failed; skipping:",
        err instanceof Error ? err.message : err
      );
    }
  }

  // ---- Structured memory leg ----
  // Explicit personal memories are kept STRICTLY separate from document
  // retrieval and conversation history. They are the highest-trust signal for
  // personal questions and are labeled as such for the model.
  if (memoryConfig.enabled) {
    try {
      const memories = getActiveMemories(userId, { limit: memoryConfig.maxInjected });
      stats.activeMemories = memories.length;
      stats.injectedMemories = memories.length;
      if (memories.length) {
        const body = memories
          .map(
            (m) =>
              `- ${m.entity}.${m.attribute} = ${JSON.stringify(m.value)} (confidence:${m.confidence}, updated:${m.updated_at})`
          )
          .join("\n");
        memoryContext =
          "KNOWN FACTS ABOUT THE USER (authoritative explicit personal memory). " +
          "These are the user's own confirmed statements about themselves and OVERRIDE anything in uploaded documents or past chatter. " +
          "When a personal question matches one of these facts, answer from the fact and ignore conflicting document content:\n" +
          body;
      }
    } catch (err) {
      console.error(
        "[context-builder] memory fetch failed; skipping:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return { retrievalContext, memoryContext, stats };
}

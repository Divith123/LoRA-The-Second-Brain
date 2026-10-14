// Configuration for LoRA model inference
export interface LoRAConfig {
  inferenceBackend: 'ollama-cpu' | 'ollama-gpu' | 'webgpu' | 'wasm';
  memoryLimit: number; // in MB
  contextWindow: number; // max tokens
  quantization: 'Q4_K_M' | 'Q5_K_M' | 'Q8_0' | 'FP16';
  enableGPU: boolean;
  threads: number; // -1 for auto
}

export const defaultConfig: LoRAConfig = {
  inferenceBackend: 'ollama-cpu',
  memoryLimit: 4096, // 4GB default
  contextWindow: 2048, // 2048 tokens
  quantization: 'Q4_K_M', // Good balance of quality vs memory
  enableGPU: false, // CPU only by default to save RAM
  threads: -1 // Auto-detect
};

// Memory-optimized presets
export const memoryPresets = {
  'ultra-low': {
    inferenceBackend: 'ollama-cpu' as const,
    memoryLimit: 2048,
    contextWindow: 1024,
    quantization: 'Q4_K_M' as const,
    enableGPU: false,
    threads: 2
  },
  'low': {
    inferenceBackend: 'ollama-cpu' as const,
    memoryLimit: 4096,
    contextWindow: 2048,
    quantization: 'Q4_K_M' as const,
    enableGPU: false,
    threads: 4
  },
  'balanced': {
    inferenceBackend: 'ollama-cpu' as const,
    memoryLimit: 8192,
    contextWindow: 4096,
    quantization: 'Q5_K_M' as const,
    enableGPU: false,
    threads: -1
  },
  'high-performance': {
    inferenceBackend: 'ollama-gpu' as const,
    memoryLimit: 16384,
    contextWindow: 8192,
    quantization: 'Q8_0' as const,
    enableGPU: true,
    threads: -1
  }
};

// Helper function to get recommended models based on memory constraints
export function getRecommendedModels(memoryMB: number): string[] {
  if (memoryMB <= 4096) {
    return ['microsoft/phi-2', 'microsoft/phi-1_5', 'distilgpt2'];
  } else if (memoryMB <= 8192) {
    return ['microsoft/phi-2', 'google/gemma-2b-it', 'meta/llama-2-7b-chat'];
  } else {
    return ['google/gemma-7b-it', 'meta/llama-2-13b-chat', 'microsoft/phi-2'];
  }
}

// ===================== Phase 1: Retrieval & Memory config =====================
// Server-side configuration for the persistent hybrid-retrieval pipeline and
// the structured personal-memory store. All values are env-overridable so no
// machine-specific settings are hardcoded. These flags let the new layers be
// turned on/off without touching the chat orchestration code.

function envBool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return def;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

function envNum(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export interface RetrievalConfig {
  /** Master switch for the persistent hybrid retrieval store. */
  enabled: boolean;
  /** Enable dense (embedding) retrieval leg. */
  useDense: boolean;
  /** Enable BM25 (lexical) retrieval leg. */
  useBm25: boolean;
  /** Local sentence-embedding model id (downloaded once, then cached offline). */
  embeddingModel: string;
  /** Chunking parameters. */
  chunkSize: number;
  chunkOverlap: number;
  /** Reciprocal Rank Fusion constant k. */
  rrfK: number;
  /** How many fused chunks to return to the prompt builder. */
  topK: number;
  /** Per-leg candidate pool size before fusion. */
  candidatePool: number;
}

export const retrievalConfig: RetrievalConfig = {
  enabled: envBool("SECOND_BRAIN_RETRIEVAL", true),
  useDense: envBool("SECOND_BRAIN_RETRIEVAL_DENSE", true),
  useBm25: envBool("SECOND_BRAIN_RETRIEVAL_BM25", true),
  embeddingModel:
    process.env.SECOND_BRAIN_EMBED_MODEL || "Xenova/all-MiniLM-L6-v2",
  chunkSize: envNum("SECOND_BRAIN_CHUNK_SIZE", 1000),
  chunkOverlap: envNum("SECOND_BRAIN_CHUNK_OVERLAP", 200),
  rrfK: envNum("SECOND_BRAIN_RRF_K", 60),
  topK: envNum("SECOND_BRAIN_TOP_K", 6),
  candidatePool: envNum("SECOND_BRAIN_CANDIDATE_POOL", 50),
};

export interface MemoryConfig {
  /** Master switch for injecting structured personal memory into prompts. */
  enabled: boolean;
  /** Max active memory records surfaced into a single prompt. */
  maxInjected: number;
}

export const memoryConfig: MemoryConfig = {
  enabled: envBool("SECOND_BRAIN_MEMORY", true),
  maxInjected: envNum("SECOND_BRAIN_MEMORY_MAX_INJECTED", 20),
};

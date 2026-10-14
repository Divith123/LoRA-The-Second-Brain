// Estimates whether a model can run on the current machine, based on the
// host's RAM and a rough memory requirement derived from the model's
// parameter count and quantization. These are heuristics — real memory use
// depends on quant format, context length, and the inference engine — but
// they give users a reliable "will this fit?" signal before downloading.

export interface SystemSpecs {
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  totalMemoryGB: number;
  freeMemoryGB: number;
}

export type CompatLevel = 'runs-well' | 'tight' | 'wont-fit' | 'unknown';

export interface CompatResult {
  level: CompatLevel;
  /** Estimated RAM the model needs, in GB (undefined when unknown). */
  requiredGB?: number;
  /** Short human-readable label for the UI badge. */
  label: string;
  /** Longer explanation for tooltips. */
  detail: string;
}

/**
 * Pull a parameter count (in billions) out of a model id/name.
 * Handles things like "llama2", "llama-3.1-8b", "qwen2.5:14b",
 * "Mistral-7B-Instruct", "phi3:3.8b", "tinyllama-1.1b".
 */
export function extractParamCountB(modelId: string): number | undefined {
  const s = modelId.toLowerCase();

  // Explicit "<number>b" (billions), e.g. 7b, 8b, 1.1b, 3.8b, 70b
  const bMatch = s.match(/(\d+(?:\.\d+)?)\s*b(?![a-z0-9])/);
  if (bMatch) return parseFloat(bMatch[1]);

  // "<number>m" (millions) -> convert to billions, e.g. 350m, 125m
  const mMatch = s.match(/(\d+(?:\.\d+)?)\s*m(?![a-z0-9])/);
  if (mMatch) return parseFloat(mMatch[1]) / 1000;

  // Common families with a well-known default size when unspecified.
  if (/\bllama\s*2\b|\bllama2\b/.test(s)) return 7;
  if (/\bllama\s*3\b|\bllama3\b/.test(s)) return 8;
  if (/\bmistral\b/.test(s)) return 7;
  if (/\bgemma\s*2?\b|\bgemma\b/.test(s)) return 7;
  if (/\bphi\s*3\b|\bphi3\b/.test(s)) return 3.8;
  if (/\bphi\s*2\b|\bphi2\b/.test(s)) return 2.7;
  if (/\btinyllama\b/.test(s)) return 1.1;
  if (/\bqwen\b/.test(s)) return 7;

  return undefined;
}

/**
 * Detect a quantization multiplier from the id. Lower-bit quants need less
 * RAM. The multiplier is roughly bytes-per-parameter.
 */
function quantBytesPerParam(modelId: string): number {
  const s = modelId.toLowerCase();
  if (/q2/.test(s)) return 0.4;
  if (/q3/.test(s)) return 0.5;
  if (/q4/.test(s)) return 0.6;
  if (/q5/.test(s)) return 0.7;
  if (/q6/.test(s)) return 0.85;
  if (/q8/.test(s)) return 1.1;
  if (/f16|fp16/.test(s)) return 2.0;
  if (/f32|fp32/.test(s)) return 4.0;
  // Default assumption: a 4-bit quant (most common for local GGUF/Ollama).
  return 0.6;
}

/**
 * Estimate required RAM in GB for a model.
 * paramsB (billions) * bytesPerParam gives model weights in GB,
 * plus a fixed overhead for KV cache / runtime (~1.5 GB).
 */
export function estimateRequiredGB(modelId: string): number | undefined {
  const paramsB = extractParamCountB(modelId);
  if (paramsB === undefined) return undefined;
  const bpp = quantBytesPerParam(modelId);
  const weightsGB = paramsB * bpp;
  const overheadGB = 1.5;
  return Math.round((weightsGB + overheadGB) * 10) / 10;
}

/**
 * Compare a model's estimated need against the machine's total RAM and
 * produce a verdict for the UI.
 */
export function computeCompatibility(modelId: string, specs?: SystemSpecs | null): CompatResult {
  const requiredGB = estimateRequiredGB(modelId);

  if (!specs || !specs.totalMemoryGB) {
    return {
      level: 'unknown',
      requiredGB,
      label: 'Unknown',
      detail: 'System specs are unavailable, so compatibility can’t be estimated.',
    };
  }

  if (requiredGB === undefined) {
    return {
      level: 'unknown',
      label: 'Unknown',
      detail: `Couldn’t estimate this model’s size. Your machine has ${specs.totalMemoryGB} GB RAM.`,
    };
  }

  const totalGB = specs.totalMemoryGB;

  // Thresholds relative to total system RAM.
  if (requiredGB <= totalGB * 0.6) {
    return {
      level: 'runs-well',
      requiredGB,
      label: 'Runs well',
      detail: `Needs ~${requiredGB} GB RAM. Your machine has ${totalGB} GB — comfortable fit.`,
    };
  }

  if (requiredGB <= totalGB * 0.9) {
    return {
      level: 'tight',
      requiredGB,
      label: 'Might be slow',
      detail: `Needs ~${requiredGB} GB RAM, close to your ${totalGB} GB. It may run but could be slow or swap to disk.`,
    };
  }

  return {
    level: 'wont-fit',
    requiredGB,
    label: 'Too large',
    detail: `Needs ~${requiredGB} GB RAM but your machine only has ${totalGB} GB. Likely won’t run.`,
  };
}

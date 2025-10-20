// Configuration for Venom model inference
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
export type InferenceBackend = 'ollama-cpu' | 'ollama-gpu' | 'webgpu' | 'wasm';

export type ProviderType = 'ollama' | 'openai' | 'gemini' | 'groq' | 'openrouter';

export interface HuggingFaceModel {
  id: string;
  name: string;
  size: string;
  format: string;
  downloads: number;
  likes: number;
  tags: string[];
  author: string;
  quantization?: string; // Q4_K_M, Q5_K_M, etc.
}

export interface LocalModel {
  name: string;
  size: string;
  format: string;
  downloadedAt: string;
  backend: InferenceBackend;
}

export interface ProviderModel {
  id: string;
  name: string;
  provider: ProviderType;
  contextLength?: number;
  pricing?: {
    input?: number;
    output?: number;
  };
  capabilities?: string[];
}
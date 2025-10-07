import { Ollama } from 'ollama';
import { InferenceBackend, ProviderType, ProviderModel, HuggingFaceModel, LocalModel } from './model-types';

class ModelService {
  private ollama: Ollama;
  private backend: InferenceBackend;

  constructor(backend: InferenceBackend = 'ollama-cpu') {
    this.backend = backend;
    this.ollama = new Ollama({
      host: process.env.OLLAMA_HOST || 'http://localhost:11434'
    });
  }

  // Set inference backend
  setBackend(backend: InferenceBackend) {
    this.backend = backend;
  }

  // Get available models for each provider
  async getProviderModels(provider: ProviderType): Promise<ProviderModel[]> {
    switch (provider) {
      case 'openai':
        return this.getOpenAIModels();
      case 'gemini':
        return this.getGeminiModels();
      case 'groq':
        return this.getGroqModels();
      case 'openrouter':
        return this.getOpenRouterModels();
      default:
        return [];
    }
  }

  private async getOpenAIModels(): Promise<ProviderModel[]> {
    // OpenAI models based on current API documentation
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        contextLength: 128000,
        pricing: { input: 2.50, output: 10.00 },
        capabilities: ['text', 'vision']
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        contextLength: 128000,
        pricing: { input: 0.15, output: 0.60 },
        capabilities: ['text', 'vision']
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        contextLength: 128000,
        pricing: { input: 10.00, output: 30.00 },
        capabilities: ['text']
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        contextLength: 16385,
        pricing: { input: 0.50, output: 1.50 },
        capabilities: ['text']
      }
    ];
  }

  private async getGeminiModels(): Promise<ProviderModel[]> {
    // Gemini models based on current API documentation
    return [
      {
        id: 'gemini-2.0-flash-exp',
        name: 'Gemini 2.0 Flash',
        provider: 'gemini',
        contextLength: 1048576,
        pricing: { input: 0.00, output: 0.00 }, // Free during experimental
        capabilities: ['text', 'vision', 'multimodal']
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        provider: 'gemini',
        contextLength: 2097152,
        pricing: { input: 1.25, output: 5.00 },
        capabilities: ['text', 'vision', 'multimodal']
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        provider: 'gemini',
        contextLength: 1048576,
        pricing: { input: 0.075, output: 0.30 },
        capabilities: ['text', 'vision', 'multimodal']
      }
    ];
  }

  private async getGroqModels(): Promise<ProviderModel[]> {
    // Groq models based on current API documentation
    return [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B Versatile',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.59, output: 0.79 },
        capabilities: ['text']
      },
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.05, output: 0.08 },
        capabilities: ['text']
      },
      {
        id: 'openai/gpt-oss-120b',
        name: 'GPT-OSS 120B',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.59, output: 0.99 },
        capabilities: ['text']
      },
      {
        id: 'groq/compound',
        name: 'Groq Compound',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.00, output: 0.00 }, // Free
        capabilities: ['text', 'web-search', 'code-execution']
      }
    ];
  }

  private async getOpenRouterModels(): Promise<ProviderModel[]> {
    // OpenRouter provides access to hundreds of models from various providers
    // We'll return a curated selection of popular models
    return [
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o (OpenRouter)',
        provider: 'openrouter',
        contextLength: 128000,
        pricing: { input: 2.50, output: 10.00 },
        capabilities: ['text', 'vision']
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'openrouter',
        contextLength: 200000,
        pricing: { input: 3.00, output: 15.00 },
        capabilities: ['text', 'vision']
      },
      {
        id: 'meta-llama/llama-3.1-405b-instruct',
        name: 'Llama 3.1 405B Instruct',
        provider: 'openrouter',
        contextLength: 131072,
        pricing: { input: 2.00, output: 2.00 },
        capabilities: ['text']
      },
      {
        id: 'google/gemini-pro-1.5',
        name: 'Gemini Pro 1.5',
        provider: 'openrouter',
        contextLength: 2097152,
        pricing: { input: 1.25, output: 5.00 },
        capabilities: ['text', 'vision']
      }
    ];
  }

  // Generate response using the appropriate provider
  async generateResponse(provider: ProviderType, model: string, messages: any[], options: any = {}): Promise<any> {
    switch (provider) {
      case 'ollama':
        return this.generateOllamaResponse(model, messages, options);
      case 'openai':
        return this.generateOpenAIResponse(model, messages, options);
      case 'gemini':
        return this.generateGeminiResponse(model, messages, options);
      case 'groq':
        return this.generateGroqResponse(model, messages, options);
      case 'openrouter':
        return this.generateOpenRouterResponse(model, messages, options);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  private async generateOllamaResponse(model: string, messages: any[], options: any = {}): Promise<any> {
    try {
      const response = await this.ollama.chat({
        model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        stream: true,
        options: {
          temperature: options.temperature || 0.8,
          top_p: options.topP || 0.7,
          num_predict: options.maxTokens || 1024,
          // Memory optimization options
          num_ctx: 2048, // Limit context window to reduce memory
          num_thread: -1, // Use all available threads
          num_gpu: 0, // Disable GPU to save VRAM, use CPU only
          ...options
        }
      });

      return response;
    } catch (error) {
      console.error('Error generating Ollama response:', error);
      throw error;
    }
  }

  private async generateOpenAIResponse(model: string, messages: any[], options: any = {}): Promise<any> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          temperature: options.temperature || 0.8,
          top_p: options.topP || 0.7,
          max_tokens: options.maxTokens || 1024,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      console.error('Error generating OpenAI response:', error);
      throw error;
    }
  }

  private async generateGeminiResponse(model: string, messages: any[], options: any = {}): Promise<any> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    try {
      // Convert messages to Gemini format
      const geminiMessages = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?alt=sse&key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            temperature: options.temperature || 0.8,
            topP: options.topP || 0.7,
            maxOutputTokens: options.maxTokens || 1024,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      console.error('Error generating Gemini response:', error);
      throw error;
    }
  }

  private async generateGroqResponse(model: string, messages: any[], options: any = {}): Promise<any> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('Groq API key not configured');
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          temperature: options.temperature || 0.8,
          top_p: options.topP || 0.7,
          max_tokens: options.maxTokens || 1024,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      console.error('Error generating Groq response:', error);
      throw error;
    }
  }

  private async generateOpenRouterResponse(model: string, messages: any[], options: any = {}): Promise<any> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'LoRA The Second Brain',
        },
        body: JSON.stringify({
          model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          temperature: options.temperature || 0.8,
          top_p: options.topP || 0.7,
          max_tokens: options.maxTokens || 1024,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      console.error('Error generating OpenRouter response:', error);
      throw error;
    }
  }

  // Fetch available models from Hugging Face
  async fetchHuggingFaceModels(query: string = 'gguf', limit: number = 50): Promise<HuggingFaceModel[]> {
    try {
      const response = await fetch(
        `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=${limit}&sort=downloads&direction=-1`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch models from Hugging Face');
      }

      const models = await response.json();

      return models.map((model: any) => ({
        id: model.id,
        name: model.id.split('/')[1],
        size: this.extractModelSize(model.id),
        format: this.detectFormat(model.tags || []),
        downloads: model.downloads || 0,
        likes: model.likes || 0,
        tags: model.tags || [],
        author: model.id.split('/')[0]
      }));
    } catch (error) {
      console.error('Error fetching Hugging Face models:', error);
      return [];
    }
  }

  // Get locally available models from Ollama
  async getLocalModels(): Promise<LocalModel[]> {
    try {
      const response = await this.ollama.list();
      return response.models.map(model => ({
        name: model.name,
        size: this.formatSize(model.size),
        format: 'GGUF',
        downloadedAt: model.modified_at ? new Date(model.modified_at).toISOString() : new Date().toISOString(),
        backend: this.backend
      }));
    } catch (error) {
      console.error('Error fetching local models:', error);
      return [];
    }
  }

  // Download a model from Hugging Face
  async downloadModel(modelId: string): Promise<boolean> {
    try {
      await this.ollama.pull({ model: modelId });
      return true;
    } catch (error) {
      console.error('Error downloading model:', error);
      return false;
    }
  }

  // Delete a local model
  async deleteModel(modelName: string): Promise<boolean> {
    try {
      await this.ollama.delete({ model: modelName });
      return true;
    } catch (error) {
      console.error('Error deleting model:', error);
      return false;
    }
  }

  // Check if Ollama is running
  async checkOllamaStatus(): Promise<boolean> {
    try {
      await this.ollama.list();
      return true;
    } catch (error) {
      return false;
    }
  }

  private extractModelSize(modelId: string): string {
    const sizeMatch = modelId.match(/(\d+(?:\.\d+)?)([bBkKmMgGtT])/i);
    if (sizeMatch) {
      const [, size, unit] = sizeMatch;
      return `${size}${unit.toUpperCase()}`;
    }
    return 'Unknown';
  }

  private detectFormat(tags: string[]): string {
    if (tags.some(tag => tag.toLowerCase().includes('gguf'))) return 'GGUF';
    if (tags.some(tag => tag.toLowerCase().includes('h2o'))) return 'H2O-Danube';
    if (tags.some(tag => tag.toLowerCase().includes('safetensors'))) return 'SafeTensors';
    return 'Unknown';
  }

  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

export const modelService = new ModelService();
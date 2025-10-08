import { Ollama } from 'ollama';
import { InferenceBackend, ProviderType, ProviderModel, HuggingFaceModel, LocalModel } from './model-types';
import fs from 'fs/promises';
import path from 'path';

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
    // OpenAI models based on current API pricing (October 2025)
    return [
      {
        id: 'gpt-5',
        name: 'GPT-5',
        provider: 'openai',
        contextLength: 131072,
        pricing: { input: 1.25, output: 10.00 },
        capabilities: ['text', 'vision', 'reasoning']
      },
      {
        id: 'gpt-5-mini',
        name: 'GPT-5 Mini',
        provider: 'openai',
        contextLength: 131072,
        pricing: { input: 0.25, output: 2.00 },
        capabilities: ['text', 'vision', 'reasoning']
      },
      {
        id: 'gpt-5-nano',
        name: 'GPT-5 Nano',
        provider: 'openai',
        contextLength: 131072,
        pricing: { input: 0.05, output: 0.40 },
        capabilities: ['text', 'vision']
      },
      {
        id: 'gpt-5-pro',
        name: 'GPT-5 Pro',
        provider: 'openai',
        contextLength: 131072,
        pricing: { input: 15.00, output: 120.00 },
        capabilities: ['text', 'vision', 'reasoning', 'coding']
      },
      {
        id: 'gpt-4.1',
        name: 'GPT-4.1',
        provider: 'openai',
        contextLength: 131072,
        pricing: { input: 3.00, output: 12.00 },
        capabilities: ['text', 'vision']
      },
      {
        id: 'gpt-4.1-mini',
        name: 'GPT-4.1 Mini',
        provider: 'openai',
        contextLength: 131072,
        pricing: { input: 0.80, output: 3.20 },
        capabilities: ['text', 'vision']
      },
      {
        id: 'gpt-4.1-nano',
        name: 'GPT-4.1 Nano',
        provider: 'openai',
        contextLength: 131072,
        pricing: { input: 0.20, output: 0.80 },
        capabilities: ['text', 'vision']
      },
      {
        id: 'o4-mini',
        name: 'O4 Mini',
        provider: 'openai',
        contextLength: 131072,
        pricing: { input: 4.00, output: 16.00 },
        capabilities: ['text', 'reasoning']
      },
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
      }
    ];
  }

  private async getGeminiModels(): Promise<ProviderModel[]> {
    // Gemini models that are directly supported by the Gemini API (no OpenRouter fallback)
    return [
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        provider: 'gemini',
        contextLength: 2097152, // 2M tokens
        pricing: { input: 0.00, output: 0.00 }, // Pricing TBD
        capabilities: ['text', 'vision', 'multimodal', 'reasoning', 'coding']
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'gemini',
        contextLength: 1048576, // 1M tokens
        pricing: { input: 0.00, output: 0.00 }, // Pricing TBD
        capabilities: ['text', 'vision', 'multimodal']
      },
      {
        id: 'gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash-Lite',
        provider: 'gemini',
        contextLength: 1048576, // 1M tokens
        pricing: { input: 0.00, output: 0.00 }, // Pricing TBD
        capabilities: ['text', 'vision', 'multimodal']
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        provider: 'gemini',
        contextLength: 1048576, // 1M tokens
        pricing: { input: 0.075, output: 0.30 },
        capabilities: ['text', 'vision', 'multimodal']
      },
      {
        id: 'gemini-2.0-flash-lite',
        name: 'Gemini 2.0 Flash-Lite',
        provider: 'gemini',
        contextLength: 1048576, // 1M tokens
        pricing: { input: 0.00, output: 0.00 }, // Free tier available
        capabilities: ['text', 'vision', 'multimodal']
      },
      {
        id: 'gemini-2.5-flash-image',
        name: 'Gemini 2.5 Flash Image',
        provider: 'gemini',
        contextLength: 4000, // Limited for image generation
        pricing: { input: 0.00, output: 0.00 }, // Pricing TBD
        capabilities: ['text', 'image-generation']
      }
    ];
  }

  private async getGroqModels(): Promise<ProviderModel[]> {
    // Groq models based on current documentation (October 2025)
    return [
      // Production Models
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.05, output: 0.08 },
        capabilities: ['text']
      },
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B Versatile',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.59, output: 0.79 },
        capabilities: ['text']
      },
      {
        id: 'meta-llama/llama-guard-4-12b',
        name: 'Llama Guard 4 12B',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.00, output: 0.00 }, // Free for safety
        capabilities: ['text', 'safety']
      },
      {
        id: 'openai/gpt-oss-120b',
        name: 'GPT-OSS 120B',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.59, output: 0.99 },
        capabilities: ['text', 'reasoning']
      },
      {
        id: 'openai/gpt-oss-20b',
        name: 'GPT-OSS 20B',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.00, output: 0.00 }, // Free
        capabilities: ['text']
      },
      {
        id: 'whisper-large-v3',
        name: 'Whisper Large V3',
        provider: 'groq',
        contextLength: 0, // Not applicable for audio
        pricing: { input: 0.00, output: 0.00 }, // Free on Groq
        capabilities: ['transcription']
      },
      {
        id: 'whisper-large-v3-turbo',
        name: 'Whisper Large V3 Turbo',
        provider: 'groq',
        contextLength: 0, // Not applicable for audio
        pricing: { input: 0.00, output: 0.00 }, // Free on Groq
        capabilities: ['transcription']
      },
      // Production Systems
      {
        id: 'groq/compound',
        name: 'Groq Compound',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.00, output: 0.00 }, // Free
        capabilities: ['text', 'web-search', 'code-execution', 'reasoning']
      },
      {
        id: 'groq/compound-mini',
        name: 'Groq Compound Mini',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.00, output: 0.00 }, // Free
        capabilities: ['text', 'web-search', 'code-execution']
      },
      // Preview Models (use with caution)
      {
        id: 'meta-llama/llama-4-maverick-17b-128e-instruct',
        name: 'Llama 4 Maverick 17B',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.00, output: 0.00 }, // Preview
        capabilities: ['text']
      },
      {
        id: 'meta-llama/llama-4-scout-17b-16e-instruct',
        name: 'Llama 4 Scout 17B',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.00, output: 0.00 }, // Preview
        capabilities: ['text']
      },
      {
        id: 'playai-tts',
        name: 'PlayAI TTS',
        provider: 'groq',
        contextLength: 8192,
        pricing: { input: 0.00, output: 0.00 }, // Preview
        capabilities: ['text-to-speech']
      },
      {
        id: 'playai-tts-arabic',
        name: 'PlayAI TTS Arabic',
        provider: 'groq',
        contextLength: 8192,
        pricing: { input: 0.00, output: 0.00 }, // Preview
        capabilities: ['text-to-speech']
      },
      {
        id: 'qwen/qwen3-32b',
        name: 'Qwen3 32B',
        provider: 'groq',
        contextLength: 131072,
        pricing: { input: 0.00, output: 0.00 }, // Preview
        capabilities: ['text']
      }
    ];
  }

  private async getOpenRouterModels(): Promise<ProviderModel[]> {
    // OpenRouter provides access to hundreds of models from various providers
    // This is a curated selection based on commonly available models (October 2025)
    return [
      // OpenAI models via OpenRouter
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o (OpenRouter)',
        provider: 'openrouter',
        contextLength: 128000,
        pricing: { input: 2.50, output: 10.00 },
        capabilities: ['text', 'vision']
      },
      {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini (OpenRouter)',
        provider: 'openrouter',
        contextLength: 128000,
        pricing: { input: 0.15, output: 0.60 },
        capabilities: ['text', 'vision']
      },
      {
        id: 'openai/gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo (OpenRouter)',
        provider: 'openrouter',
        contextLength: 16385,
        pricing: { input: 0.50, output: 1.50 },
        capabilities: ['text']
      },
      // Anthropic models
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'openrouter',
        contextLength: 200000,
        pricing: { input: 3.00, output: 15.00 },
        capabilities: ['text', 'vision']
      },
      // Meta Llama models
      {
        id: 'meta-llama/llama-3.1-8b-instruct',
        name: 'Llama 3.1 8B Instruct',
        provider: 'openrouter',
        contextLength: 131072,
        pricing: { input: 0.07, output: 0.07 },
        capabilities: ['text']
      },
      {
        id: 'meta-llama/llama-3.1-70b-instruct',
        name: 'Llama 3.1 70B Instruct',
        provider: 'openrouter',
        contextLength: 131072,
        pricing: { input: 0.59, output: 0.79 },
        capabilities: ['text']
      },
      // Google Gemini models
      {
        id: 'google/gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        provider: 'openrouter',
        contextLength: 2097152,
        pricing: { input: 0.00, output: 0.00 }, // Pricing TBD
        capabilities: ['text', 'vision', 'multimodal']
      },
      {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'openrouter',
        contextLength: 1048576,
        pricing: { input: 0.00, output: 0.00 }, // Pricing TBD
        capabilities: ['text', 'vision', 'multimodal']
      },
      // Image generation
      {
        id: 'openai/dall-e-3',
        name: 'DALL-E 3',
        provider: 'openrouter',
        contextLength: 4000,
        pricing: { input: 0.04, output: 0.08 },
        capabilities: ['text', 'image-generation']
      },
      {
        id: 'stability-ai/stable-diffusion-xl-1024-v1-0',
        name: 'Stable Diffusion XL',
        provider: 'openrouter',
        contextLength: 77,
        pricing: { input: 0.018, output: 0.018 },
        capabilities: ['text', 'image-generation']
      }
    ];
  }

  // Generate response using the appropriate provider
  async generateResponse(provider: ProviderType, model: string, messages: any[], options: any = {}): Promise<any> {
    // Special handling for transcription models - they only work with Groq
    if (model.includes('whisper')) {
      if (provider !== 'groq') {
        throw new Error('Whisper transcription is only available through Groq API');
      }
      return this.generateGroqTranscription(model, messages, options);
    }

    // Check if this is an image generation request
    const lastMessage = messages[messages.length - 1]?.content || '';
    const isImageGeneration = /generate.*image|create.*image|draw.*image|make.*image|produce.*image|generate.*picture|create.*picture|draw.*picture|make.*picture|produce.*picture/i.test(lastMessage);

    // For image generation with Gemini, use direct Gemini API
    if (isImageGeneration && provider === 'gemini') {
      return this.generateImagenResponse('gemini-2.0-flash-exp', messages, options);
    }

    // For Gemini provider, always use direct Gemini API (no OpenRouter fallback)
    if (provider === 'gemini') {
      return this.generateGeminiResponse(model, messages, options);
    }

    // Check if the requested provider's API key is configured
    const hasApiKey = this.checkApiKeyConfigured(provider);

    // If API key is not configured for the requested provider, try OpenRouter as fallback
    if (!hasApiKey && provider !== 'ollama' && provider !== 'openrouter') {
      // Map model names to OpenRouter equivalents if possible
      const mappedModel = this.mapModelToOpenRouter(model, provider);
      return this.generateOpenRouterResponse(mappedModel, messages, options);
    }

    switch (provider) {
      case 'ollama':
        return this.generateOllamaResponse(model, messages, options);
      case 'openai':
        return this.generateOpenAIResponse(model, messages, options);
      case 'groq':
        return this.generateGroqResponse(model, messages, options);
      case 'openrouter':
        // For Gemini image generation via OpenRouter, use direct Gemini API instead
        if (isImageGeneration && model.includes('gemini') && model.includes('image')) {
          return this.generateImagenResponse(model, messages, options);
        }
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

    // Check if this is an image generation request
    const lastMessage = messages[messages.length - 1]?.content || '';
    const isImageGeneration = /generate.*image|create.*image|draw.*image|make.*image|produce.*image|generate.*picture|create.*picture|draw.*picture|make.*picture|produce.*picture/i.test(lastMessage);

    // For image generation, use Imagen API instead of Gemini
    if (isImageGeneration) {
      if (model !== 'gemini-2.5-flash-image') {
        throw new Error('Image generation is only supported with gemini-2.5-flash-image model');
      }
      return this.generateImagenResponse(model, messages, options);
    }

    // For text generation, only support 2.x flash models directly
    if (model !== 'gemini-2.5-flash' && model !== 'gemini-2.5-flash-lite' && model !== 'gemini-2.0-flash' && model !== 'gemini-2.0-flash-lite' && model !== 'gemini-2.5-flash-image') {
      throw new Error(`Gemini model ${model} is not supported. Use gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.0-flash, gemini-2.0-flash-lite, or gemini-2.5-flash-image for text generation, or gemini-2.5-flash-image for image generation.`);
    }

    try {
      // Convert messages to Gemini format
      const geminiMessages = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      // For image generation, use streaming API with proper configuration
      if (isImageGeneration) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: geminiMessages,
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              temperature: options.temperature || 0.8,
              topP: options.topP || 0.7,
              maxOutputTokens: options.maxTokens || 4096, // Higher limit for images
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
        }

        return response;
      } else {
        // For text generation, use the regular API
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?alt=sse&key=${apiKey}`;

        const response = await fetch(url, {
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
          const errorText = await response.text();
          console.error(`Direct Gemini API error: ${response.status} - ${errorText}`);
          throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
        }

        return response;
      }
    } catch (error) {
      console.error('Error generating Gemini response:', error);
      throw error;
    }
  }

  private async generateImagenResponse(model: string, messages: any[], options: any = {}): Promise<any> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    // Use gemini-2.0-flash-exp as requested
    const actualModel = 'gemini-2.0-flash-exp';

    try {
      // Extract the prompt from the last message
      const prompt = messages[messages.length - 1]?.content || '';

      // Use non-streaming API for reliable image generation
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"]
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini image generation error: ${response.status} - ${errorText}`);
      }

      // Parse the JSON response
      const result = await response.json();

      // Check if we have image data in the response and save it to a file
      const candidates = result.candidates;
      if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
        const parts = candidates[0].content.parts;
        for (const part of parts) {
          if (part.inlineData) {

            // Save the image to public/uploads directory
            const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
            const filepath = path.join(process.cwd(), 'public', 'uploads', filename);

            // Ensure the directory exists
            await fs.mkdir(path.dirname(filepath), { recursive: true });

            // Decode base64 and save
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
            await fs.writeFile(filepath, imageBuffer);

            // Replace inlineData with text containing image URL
            part.text = `Here's the generated image:\n\n![Generated Image](/uploads/${filename})\n\n`;
            delete part.inlineData;
          }
        }
      }

      // Return the processed text content directly
      let finalText = '';
      if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.text) {
            finalText += part.text;
          }
        }
      }

      console.log('🖼️ Image generation response text:', finalText);
      
      // Return a simple streaming response that includes the markdown image
      let readCount = 0;
      return {
        body: {
          getReader: () => ({
            read: async () => {
              if (readCount === 0) {
                readCount++;
                return {
                  done: false,
                  value: new TextEncoder().encode(`data: ${JSON.stringify({
                    candidates: [{
                      content: {
                        parts: [{ text: finalText }]
                      }
                    }]
                  })}\n\n`)
                };
              } else {
                return {
                  done: true,
                  value: undefined
                };
              }
            }
          })
        }
      };
    } catch (error) {
      throw error;
    }
  }

  private async generateGroqResponse(model: string, messages: any[], options: any = {}): Promise<any> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('Groq API key not configured');
    }

    // Handle transcription models (Whisper)
    if (model.includes('whisper')) {
      return this.generateGroqTranscription(model, messages, options);
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

  private async generateGroqTranscription(model: string, messages: any[], options: any = {}): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('Groq API key not configured');
    }

    try {
      // For transcription, we expect the audio data to be provided in the options as base64
      const audioBase64 = options.audioBase64;
      const fileName = options.fileName || 'audio.wav';
      const mimeType = options.mimeType || 'audio/wav';

      if (!audioBase64) {
        throw new Error('Audio data is required for transcription');
      }

      // Convert base64 to Blob
      const audioData = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
      const audioBlob = new Blob([audioData], { type: mimeType });

      const formData = new FormData();
      formData.append('file', audioBlob, fileName);
      formData.append('model', model);
      if (options.language) {
        formData.append('language', options.language);
      }
      if (options.response_format) {
        formData.append('response_format', options.response_format);
      }

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq transcription API error: ${response.statusText} - ${errorText}`);
      }

      // Extract the text content from the response
      const transcriptionText = await response.text();
      return transcriptionText;
    } catch (error) {
      console.error('Error generating Groq transcription:', error);
      throw error;
    }
  }

  private async generateOpenRouterResponse(model: string, messages: any[], options: any = {}): Promise<any> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    // Check if this is an image generation request
    const lastMessage = messages[messages.length - 1]?.content || '';
    const isImageGeneration = /generate.*image|create.*image|draw.*image|make.*image|produce.*image|generate.*picture|create.*picture|draw.*picture|make.*picture|produce.*picture/i.test(lastMessage) && model.includes('gemini') && model.includes('image');

    try {
      if (isImageGeneration) {
        // For image generation, use non-streaming request to get the complete response
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
            max_tokens: options.maxTokens || 1024,
            stream: false, // Disable streaming for image generation
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenRouter image generation error: ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();

        // Process OpenRouter image generation response
        if (result.choices && result.choices.length > 0) {
          const choice = result.choices[0];
          const message = choice.message;

          // Handle different content formats from OpenRouter
          let content = '';
          if (typeof message?.content === 'string') {
            content = message.content;
          } else if (message?.content && Array.isArray(message.content)) {
            // Handle array of content parts (like Gemini format)
            for (const part of message.content) {
              if (typeof part === 'string') {
                content += part;
              } else if (part.text) {
                content += part.text;
              } else if (part.image_url || part.imageUrl) {
                const url = part.image_url || part.imageUrl;
                if (url.url) {
                  content += `\n\n![Generated Image](${url.url})\n\n`;
                }
              } else if (part.inlineData || part.inline_data) {
                const data = part.inlineData || part.inline_data;
                if (data.data && (data.mimeType || data.mime_type)) {
                  const mimeType = data.mimeType || data.mime_type || 'image/png';
                  content += `\n\n![Generated Image](data:${mimeType};base64,${data.data})\n\n`;
                }
              }
            }
          } else if (message?.content && typeof message.content === 'object') {
            // Handle object format
            if (message.content.parts) {
              for (const part of message.content.parts) {
                if (part.text) {
                  content += part.text;
                } else if (part.inlineData || part.inline_data) {
                  const data = part.inlineData || part.inline_data;
                  if (data.data && (data.mimeType || data.mime_type)) {
                    const mimeType = data.mimeType || data.mime_type || 'image/png';
                    content += `\n\n![Generated Image](data:${mimeType};base64,${data.data})\n\n`;
                  }
                }
              }
            } else {
              // Handle if content is directly the inlineData object
              const data = message.content.inlineData || message.content.inline_data;
              if (data && data.data && (data.mimeType || data.mime_type)) {
                const mimeType = data.mimeType || data.mime_type || 'image/png';
                content = `![Generated Image](data:${mimeType};base64,${data.data})`;
              } else if (message.content.text && message.content.image) {
                // Handle OpenAI-style content with text and image
                content = message.content.text;
                if (message.content.image.url) {
                  content += `\n\n![Generated Image](${message.content.image.url})\n\n`;
                }
              }
            }
          }

          // Check if message has separate image field
          if (message.image) {
            if (message.image.url) {
              content += `\n\n![Generated Image](${message.image.url})\n\n`;
            } else if (message.image.data && message.image.mimeType) {
              content += `\n\n![Generated Image](data:${message.image.mimeType};base64,${message.image.data})\n\n`;
            }
          }
          // Check if we actually have image data
          const hasImageData = content.includes('data:image') || content.includes('![Generated Image]') || content.includes('http') && content.includes('image');

          if (!hasImageData) {
            // OpenRouter didn't return actual image data, fall back to direct Gemini API
            return this.generateImagenResponse(model, messages, options);
          }

          // Return plain object with processed content
          return {
            type: 'openrouter-image',
            content: content,
            hasImageData: true
          };
        }

        throw new Error('No content in OpenRouter image generation response');
      } else {
        // For regular text generation, use streaming
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
          const errorText = await response.text();
          throw new Error(`OpenRouter API error: ${response.statusText} - ${errorText}`);
        }

        return response;
      }
    } catch (error) {
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
  private checkApiKeyConfigured(provider: ProviderType): boolean {
    switch (provider) {
      case 'openai':
        return !!process.env.OPENAI_API_KEY;
      case 'gemini':
        return !!process.env.GEMINI_API_KEY; // Enable direct Gemini API for flash models
      case 'groq':
        return !!process.env.GROQ_API_KEY;
      case 'openrouter':
        return !!process.env.OPENROUTER_API_KEY;
      default:
        return false;
    }
  }

  // Map model names from other providers to OpenRouter equivalents
  private mapModelToOpenRouter(model: string, originalProvider: ProviderType): string {
    console.log(`Mapping model ${model} from ${originalProvider} to OpenRouter equivalent`);

    // For Groq models, try to find equivalent models on OpenRouter
    if (originalProvider === 'groq') {
      if (model.includes('llama-3.3-70b')) {
        return 'meta-llama/llama-3.1-405b-instruct'; // Closest equivalent
      }
      if (model.includes('llama-3.1-8b')) {
        return 'meta-llama/llama-3.1-405b-instruct'; // Use available model
      }
      if (model.includes('openai/gpt-oss')) {
        return 'openai/gpt-4o'; // Fallback to GPT-4o
      }
      if (model.includes('groq/compound')) {
        return 'anthropic/claude-3.5-sonnet'; // Good alternative
      }
    }

    // For OpenAI models, use the OpenRouter version
    if (originalProvider === 'openai') {
      if (model === 'gpt-4o') return 'openai/gpt-4o';
      if (model === 'gpt-4o-mini') return 'openai/gpt-4o-mini';
      if (model === 'gpt-4-turbo') return 'openai/gpt-4-turbo';
      if (model === 'gpt-3.5-turbo') return 'openai/gpt-3.5-turbo';
    }

    // For Gemini models, use the OpenRouter version (used as fallback)
    if (originalProvider === 'gemini') {
      if (model === 'gemini-1.5-pro') {
        return 'openai/gpt-4o'; // Pro model falls back to GPT-4o
      }
      if (model === 'gemini-1.5-flash' || model === 'gemini-2.0-flash-exp') {
        return 'openai/gpt-4o-mini'; // Flash models fallback
      }
    }

    // Default fallback to GPT-4o
    console.log(`Using default fallback: openai/gpt-4o`);
    return 'openai/gpt-4o';
  }
}

export const modelService = new ModelService();
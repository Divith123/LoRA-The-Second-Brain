"use server";

import { createStreamableValue } from "ai/rsc";
import { CoreMessage } from "ai";
import { modelService } from "@/lib/model-service";
// import { rateLimit } from "@/lib/ratelimit";
import { headers } from "next/headers";
import fsSync from 'fs';
import path from 'path';
import fs from 'fs/promises';
import { retrieveRelevant } from "@/lib/rag-store";
import { extractText } from '@/lib/file-processing';
import { ProviderType } from "@/lib/model-types";
import { DatabaseService } from "@/lib/database";
import { EncryptedConversationStorage } from "@/lib/encrypted-conversation-storage";
import { filterThinkingContent } from "@/lib/utils";

let localInferenceService: any = null;

const MODELS_DIR = path.join(process.cwd(), 'models');

// Check if a model is a locally downloaded file (not managed by Ollama)
async function isLocalDownloadedModel(modelName: string): Promise<boolean> {
  try {
    if (!fsSync.existsSync(MODELS_DIR)) return false;
    const files = fsSync.readdirSync(MODELS_DIR);
    const modelFiles = files.filter(
      (f) => f.toLowerCase().endsWith(".gguf") || f.toLowerCase().endsWith(".bin")
    );
    return modelFiles.some(
      (file) => file.replace(/\.(gguf|bin)$/i, "") === modelName
    );
  } catch {
    return false;
  }
}

// Generate response using local GGUF model
async function generateLocalModelResponse(messages: CoreMessage[], model: string) {
  const stream = createStreamableValue();

  (async () => {
    try {
      if (!localInferenceService) {
        const mod = await import("@/lib/local-inference-service");
        localInferenceService = mod.localInferenceService;
      }

      const exists = await localInferenceService.modelExists(model);
      if (!exists) {
        throw new Error(`Local model not found: ${model}`);
      }

      // Normalize messages to plain strings
      const formatted = messages.map(m => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
      }));

      const generator = localInferenceService.generateResponse(model, formatted, {
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 512,
        repetitionPenalty: 1.1,
      });

      let acc = "";
      for await (const chunk of generator) {
        acc += chunk;
        stream.update(acc); // progressively stream full text to the client
      }
      stream.done();
    } catch (err: any) {
      stream.update(
        `Local inference error for "${model}": ${err?.message ?? "Unknown error"}`
      );
      stream.done();
    }
  })();

  return stream.value;
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

export async function continueConversation(
  messages: CoreMessage[],
  model: string,
  provider: ProviderType = 'ollama',
  opts?: {
    fileIds?: string[];
    conversationHistory?: string;
    mode?: "think-longer" | "deep-research" | "web-search" | "study" | "sarcastic";
  }
) {
  // const ip = headers().get("x-forwarded-for") ?? "unknown";
  // const isLimited = rateLimit(ip);
  // if (isLimited) {
  //   throw new Error(`Rate Limit Exceeded for ${ip}`);
  // }

  // 🔥 ADDED: If the client attached files, try to read and extract their text on the server
  let fileContext = "";
  if (opts?.fileIds && opts.fileIds.length > 0) {
    console.log('🔍 Processing file IDs:', opts.fileIds);
    try {
      const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
      const entries = await fs.readdir(UPLOAD_DIR);
      console.log('📁 Files in uploads directory:', entries.length, 'files');
      const picked: string[] = [];
      for (const id of opts.fileIds.slice(0, 3)) {
        console.log('🔎 Looking for file with ID:', id);
        const hit = entries.find((n: string) => n.includes(`-${id}-`));
        console.log('📄 Found matching file:', hit);
        if (!hit) {
          console.log('❌ No file found for ID:', id, '- available files:', entries);
          continue;
        }
        const abs = path.join(UPLOAD_DIR, hit);
        const meta = {
          id,
          name: hit.split(`-${id}-`).slice(1).join(`-${id}-`) || hit,
          serverName: hit,
          mime: '',
          size: (await fs.stat(abs)).size,
          path: abs,
          createdAt: new Date().toISOString(),
        };
        console.log('📋 Processing file:', meta.name, 'size:', meta.size, 'bytes');
        try {
          const txt = await extractText(meta as any as import('@/lib/file-processing').UploadedFileMeta);
          const snippet = txt && txt.trim() ? txt.slice(0, 8000) : null;
          console.log('📝 Extracted text length:', txt?.length || 0, 'characters');
          if (snippet) {
            picked.push(`### ${meta.name}\n${snippet}`);
            console.log('✅ Added file content to context');
          } else {
            picked.push(`### ${meta.name}\n(No text content could be extracted from this file. It may be an image, scanned document, or unsupported format.)`);
            console.log('⚠️ No text content extracted from file');
          }
        } catch (e) {
          console.error('❌ Error extracting text from file:', meta.name, e);
          picked.push(`### ${meta.name}\n(Error: Could not extract text from this file. The file may be corrupted or in an unsupported format.)`);
        }
      }
      if (picked.length) {
        fileContext = `UPLOADED FILES - YOU MUST USE THIS CONTENT TO ANSWER QUESTIONS:\n\n${picked.join('\n\n')}`;
        console.log('📚 File context built, total length:', fileContext.length, 'characters');
      } else {
        console.log('🚫 No file content extracted from any files');
      }
    } catch (e) {
      console.error('💥 Failed to build server-side file context', e);
    }
  } else {
    console.log('📭 No file IDs provided');
  }

  // build retrieval context from uploaded files (or global index)
  const lastUserMsg = String(messages[messages.length - 1]?.content ?? "");
  const ctxChunks = await retrieveRelevant(lastUserMsg, opts?.fileIds ?? null, 6);
  const ctxText = ctxChunks
    .map((c, i) => `[#${i + 1}] (doc:${c.docId}, chunk:${c.idx})\n${c.text}`)
    .join("\n\n");

  // 🔥 NEW: Use provided conversation history for knowledge base context
  let knowledgeBaseContext = opts?.conversationHistory || '';

  // 🔥 NEW: Handle different AI modes with specific prompts and parameters
  let modePrompt = '';
  let modeTemperature = 0.8;
  let modeMaxTokens = 1024;
  let modeInstructions = '';

  if (opts?.mode) {
    switch (opts.mode) {
      case 'think-longer':
        modePrompt = 'Think Longer Mode: Take your time to analyze this deeply. Consider multiple perspectives, explore implications, and provide thorough reasoning before giving your final answer. Structure your response with clear steps and detailed explanations.';
        modeTemperature = 0.6; // Lower temperature for more focused thinking
        modeMaxTokens = 2048; // Allow longer responses
        modeInstructions = 'Break down complex problems step-by-step. Consider edge cases and alternative solutions. Show your reasoning process clearly.';
        break;

      case 'deep-research':
        modePrompt = 'Deep Research Mode: Conduct thorough research and analysis. Provide comprehensive information with sources, evidence, and detailed explanations. Cross-reference multiple perspectives and provide balanced viewpoints.';
        modeTemperature = 0.7;
        modeMaxTokens = 4096; // Much longer for research
        modeInstructions = 'Cite sources when possible. Provide evidence-based answers. Explore related topics and connections. Be comprehensive but organized.';
        break;

      case 'web-search':
        modePrompt = 'Web Search Mode: You have access to web search capabilities. Provide current, up-to-date information by searching and analyzing web content. Include relevant URLs and sources in your response.';
        modeTemperature = 0.8;
        modeMaxTokens = 2048;
        modeInstructions = 'Search for current information. Include URLs and sources. Verify information accuracy. Provide context and background.';
        break;

      case 'study':
        modePrompt = 'Study Mode: Focus on educational content and learning. Explain concepts clearly, provide examples, and help the user understand complex topics. Use analogies and structured explanations.';
        modeTemperature = 0.7;
        modeMaxTokens = 2048;
        modeInstructions = 'Explain concepts step-by-step. Use examples and analogies. Break down complex ideas. Focus on clarity and understanding.';
        break;

      case 'sarcastic':
        modePrompt = 'You are a sarcastic speaking LoRA AI. Respond with witty, ironic commentary in short, punchy answers. Keep responses under 50 words - be clever but concise. Use sarcasm sparingly but effectively.';
        modeTemperature = 0.7; // Balanced creativity for voice responses
        modeMaxTokens = 256; // Much shorter for voice responses
        modeInstructions = 'Keep ALL responses under 50 words. Be sarcastic but brief. Focus on one clever point per response.';
        break;
    }
  }

  // Combine any server-built fileContext snippets with retrieval text and knowledge base
  const combinedContextText = [fileContext, ctxText, knowledgeBaseContext].filter(Boolean).join("\n\n");

  console.log('🔗 Context combination:');
  console.log('- fileContext length:', fileContext?.length || 0);
  console.log('- ctxText length:', ctxText?.length || 0);
  console.log('- knowledgeBaseContext length:', knowledgeBaseContext?.length || 0);
  console.log('- combinedContextText length:', combinedContextText?.length || 0);

  const withContext: CoreMessage[] = combinedContextText
    ? [
        {
          role: "system",
          content:
            "You are LoRA, the Second Brain - a personal AI companion that remembers and connects the user's thoughts across conversations. " +
            (modePrompt ? `\n\n${modePrompt}` : '') +
            (modeInstructions ? `\n\n${modeInstructions}` : '') +
            "\n\nIMPORTANT: If files are attached to this message, you MUST use the provided file content in your response. " +
            "Do NOT say you cannot access files or that you don't have access to the content. " +
            "The file content is provided below - read it and answer questions based on it. " +
            "If a file shows '(No text content could be extracted)', inform the user that you cannot read that type of file. " +
            "If a file shows an error message, explain that you encountered an issue reading the file.\n\n" +
            "When answering questions about uploaded files, quote relevant sections and provide specific details from the content.\n\n" +
            "Use the following context from previous conversations, uploaded files, and retrieval index if relevant. " +
            "Reference past conversations when appropriate to show continuity and memory. " +
            "If asked about previous discussions or thoughts, draw from the conversation history provided. " +
            "If the answer is not contained in the context, say so and answer from general knowledge.\n\n" +
            combinedContextText,
        },
        ...messages,
      ]
    : [
        {
          role: "system",
          content:
            "You are LoRA, the Second Brain - a personal AI companion that remembers and connects the user's thoughts across conversations. " +
            (modePrompt ? `\n\n${modePrompt}` : '') +
            (modeInstructions ? `\n\n${modeInstructions}` : '') +
            "\n\nYou have access to the user's conversation history and can reference past discussions when relevant.",
        },
        ...messages,
      ];

  console.log('🤖 System prompt built:');
  console.log('- Has context:', combinedContextText ? 'YES' : 'NO');
  console.log('- Mode prompt:', modePrompt ? 'YES' : 'NO');
  console.log('- Mode instructions:', modeInstructions ? 'YES' : 'NO');
  console.log('- Total system message length:', withContext[0].content.length, 'characters');

  const isLocal = await isLocalDownloadedModel(model);
  if (isLocal) {
    // 🔥 CHANGED: pass context-augmented messages
    return await generateLocalModelResponse(withContext, model);
  }

  // Check Ollama status only for Ollama provider
  const isOllamaRunning = await modelService.checkOllamaStatus();
  if (provider === 'ollama' && !isOllamaRunning) {
    throw new Error(
      "Ollama is not running. Start Ollama or pick a local GGUF file model."
    );
  }

  // For API providers, proceed regardless of Ollama status
  // 🔥 CHANGED: pass context-augmented messages with mode-specific parameters
  const response = await modelService.generateResponse(provider, model, withContext, {
    temperature: modeTemperature,
    topP: 0.7,
    maxTokens: modeMaxTokens,
  });

  const stream = createStreamableValue();
  (async () => {
    try {
      let acc = "";

      // Handle Ollama streaming response
      if (provider === 'ollama') {
        // Handle Ollama streaming response
        for await (const chunk of response) {
          if (chunk.done) break;
          const content = chunk.message?.content || "";
          acc += content;
          stream.update(acc);
        }
      } else if (provider === 'gemini') {
        // Handle Gemini streaming response (supports both text and images)
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body reader available');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const parts = parsed.candidates?.[0]?.content?.parts;

                if (parts) {
                  for (const part of parts) {
                    // Handle text content (now includes image URLs)
                    if (part.text) {
                      console.log('📥 Gemini part.text:', part.text.substring(0, 200));
                      acc += part.text;
                      stream.update(acc);
                    }
                  }
                }
              } catch (e) {
                // Skip invalid JSON
                console.warn('Failed to parse Gemini streaming response:', data);
              }
            }
          }
        }
      } else {
        // Handle OpenAI-compatible API streaming responses (OpenAI, Groq, OpenRouter)
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body reader available');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content ||
                               parsed.choices?.[0]?.text ||
                               "";
                if (content) {
                  acc += content;
                  stream.update(acc);
                }
              } catch (e) {
                // Skip invalid JSON
                console.warn('Failed to parse streaming response:', data);
              }
            }
          }
        }

        // Check for image data in the accumulated text (for OpenRouter image generation)
        const imageMatch = acc.match(/data:image\/[^;]+;base64,([^"'\s]+)/);
        if (imageMatch) {
          // If we found image data in the text, keep it as is (it will be displayed as markdown)
          console.log('Found image data in OpenAI-compatible response');
        }
      }

      stream.done();
    } catch (e) {
      stream.error(e as Error);
    }
  })();

  return stream.value;
}

// Handle transcription requests
async function handleTranscription(model: string, provider: ProviderType, audioData: string, fileName: string, mimeType: string) {
  if (!audioData) {
    throw new Error('Audio data is required for transcription');
  }

  const stream = createStreamableValue();

  (async () => {
    try {
      const transcriptionText = await modelService.generateResponse(provider, model, [], {
        audioBase64: audioData,
        fileName,
        mimeType,
        response_format: 'text'
      });

      // For transcription, we get the text directly
      stream.update(transcriptionText);
      stream.done();
    } catch (error) {
      stream.error(error as Error);
    }
  })();

  return stream.value;
}

// Export handleTranscription as a server action
export async function handleTranscriptionAction(model: string, provider: ProviderType, audioData: string, fileName: string, mimeType: string) {
  return await handleTranscription(model, provider, audioData, fileName, mimeType);
}

// Server action for voice transcription that returns text directly (not a stream)
export async function transcribeAudioForVoice(model: string, provider: ProviderType, audioData: string, fileName: string, mimeType: string): Promise<string> {
  if (!audioData) {
    throw new Error('Audio data is required for transcription');
  }

  try {
    const transcriptionText = await modelService.generateResponse(provider, model, [], {
      audioBase64: audioData,
      fileName,
      mimeType,
      response_format: 'text'
    });

    // Return the transcription text directly
    return transcriptionText;
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
}

// Handle text-to-speech requests
async function handleTextToSpeech(text: string, voice: string = 'af_bella', responseFormat: string = 'wav', userId?: string) {
  try {
    console.log('TTS Request:', { textLength: text.length, voice, responseFormat });

    // Filter thinking content from the text
    const filteredText = filterThinkingContent(text);
    console.log('Filtered text length:', filteredText.length);

    if (!filteredText.trim()) {
      throw new Error('No speech content after filtering thinking patterns');
    }

    // Get user's Groq API key
    if (!userId) {
      throw new Error('User ID is required for TTS');
    }

    const apiKeys = await DatabaseService.getUserApiKeys(userId);
    const groqApiKey = apiKeys?.groqApiKey;

    if (!groqApiKey) {
      throw new Error('Groq API key not configured. Please add your Groq API key in settings.');
    }

    // Call Groq TTS API
    const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: filteredText,
        voice: 'alloy', // Groq supports: alloy, echo, fable, onyx, nova, shimmer
        response_format: 'mp3',
        speed: 1.0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq TTS API error:', response.status, errorText);
      throw new Error(`Groq TTS API error: ${response.status} - ${errorText}`);
    }

    // Get the audio data as array buffer
    const audioBuffer = await response.arrayBuffer();

    // Convert to base64
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    console.log('Groq TTS generated successfully, audio length:', base64Audio.length);

    return {
      audioData: base64Audio,
      contentType: 'audio/mpeg',
      fileName: `groq-tts-${Date.now()}.mp3`,
    };
  } catch (error) {
    console.error('Error generating TTS:', error);
    throw error;
  }
}

// Export handleTextToSpeech as a server action
export async function handleTextToSpeechAction(text: string, voice?: string, responseFormat?: string, userId?: string) {
  return await handleTextToSpeech(text, voice, responseFormat, userId);
}

// Handle ElevenLabs text-to-speech requests
async function handleElevenLabsTextToSpeech(text: string, voiceId: string = 'JkpEM0J2p7DL32VXnieS', userId?: string) {
  try {
    console.log('ElevenLabs TTS Request:', { textLength: text.length, voiceId, userId });

    // Filter thinking content from the text
    const filteredText = filterThinkingContent(text);
    console.log('Filtered text length:', filteredText.length);

    if (!filteredText.trim()) {
      throw new Error('No speech content after filtering thinking patterns');
    }

    // Get user's ElevenLabs API key
    if (!userId) {
      throw new Error('User ID is required for ElevenLabs TTS');
    }

    const apiKeys = await DatabaseService.getUserApiKeys(userId);
    const elevenlabsApiKey = apiKeys?.elevenlabsApiKey;

    if (!elevenlabsApiKey) {
      throw new Error('ElevenLabs API key not configured. Please add your ElevenLabs API key in settings.');
    }

    // Call ElevenLabs API
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenlabsApiKey,
      },
      body: JSON.stringify({
        text: filteredText,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // Get the audio data as array buffer
    const audioBuffer = await response.arrayBuffer();

    // Convert to base64
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    console.log('ElevenLabs TTS generated successfully, audio length:', base64Audio.length);

    return {
      audioData: base64Audio,
      contentType: 'audio/mpeg',
      fileName: `elevenlabs-tts-${Date.now()}.mp3`,
    };
  } catch (error) {
    console.error('Error generating ElevenLabs TTS:', error);
    throw error;
  }
}

// Export handleElevenLabsTextToSpeech as a server action
export async function handleElevenLabsTextToSpeechAction(text: string, voiceId?: string, userId?: string) {
  return await handleElevenLabsTextToSpeech(text, voiceId, userId);
}

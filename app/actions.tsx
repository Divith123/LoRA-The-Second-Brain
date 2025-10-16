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
        modePrompt = 'You are a sarcastic speaking Venom AI. Respond with witty, ironic commentary in short, punchy answers. Keep responses under 50 words - be clever but concise. Use sarcasm sparingly but effectively.';
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
            "You are Venom, the Second Brain - a personal AI companion that remembers and connects the user's thoughts across conversations. " +
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
            "You are Venom, the Second Brain - a personal AI companion that remembers and connects the user's thoughts across conversations. " +
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
    // First, get transcription with language detection
    const transcriptionResult = await modelService.generateResponse(provider, model, [], {
      audioBase64: audioData,
      fileName,
      mimeType,
      response_format: 'verbose_json' // Get detailed response with language info
    });

    // Extract text and language from the result
    let transcriptionText = '';
    let detectedLanguage = '';

    if (typeof transcriptionResult === 'string') {
      transcriptionText = transcriptionResult;
      // Fallback: detect language from text content
      detectedLanguage = detectLanguageFromText(transcriptionText);
    } else if (transcriptionResult && typeof transcriptionResult === 'object') {
      // Handle verbose_json format
      transcriptionText = transcriptionResult.text || transcriptionResult.transcript || '';
      detectedLanguage = transcriptionResult.language || '';
      // If no language detected, try to detect from text
      if (!detectedLanguage) {
        detectedLanguage = detectLanguageFromText(transcriptionText);
      }
    }

    console.log('Transcription result:', { text: transcriptionText, language: detectedLanguage });

    // Language validation: only allow English, Tamil, and Tanglish
    const allowedLanguages = ['en', 'english', 'ta', 'tamil'];
    const isEnglish = detectedLanguage.toLowerCase().includes('en') || detectedLanguage.toLowerCase().includes('english');
    const isTamil = detectedLanguage.toLowerCase().includes('ta') || detectedLanguage.toLowerCase().includes('tamil');

    // Check for Tanglish (mix of English and Tamil characters)
    const hasEnglishChars = /[a-zA-Z]/.test(transcriptionText);
    const hasTamilChars = /[\u0B80-\u0BFF]/.test(transcriptionText); // Tamil Unicode block
    const isTanglish = hasEnglishChars && hasTamilChars;

    // Removed language restriction - allow all languages
    // if (!isEnglish && !isTamil && !isTanglish) {
    //   // If language detection failed or returned unknown, check text content
    //   if (!hasEnglishChars && !hasTamilChars) {
    //     throw new Error('Unsupported language detected. Only English, Tamil, and Tanglish (English-Tamil mix) are supported.');
    //   }
    //   // If we have characters but no language detected, assume it's supported if it has English/Tamil chars
    // }

    // Return the transcription text directly
    return transcriptionText;
  } catch (error) {
    // If verbose_json failed, try with text format as fallback
    if (error instanceof Error && (error.message.includes('verbose_json') || error.message.includes('parse'))) {
      console.warn('Verbose JSON transcription failed, trying text format:', error);
      try {
        const fallbackResult = await modelService.generateResponse(provider, model, [], {
          audioBase64: audioData,
          fileName,
          mimeType,
          response_format: 'text' // Fallback to text format
        });

        // For text format, we just get the string directly
        const transcriptionText = typeof fallbackResult === 'string' ? fallbackResult : '';
        console.log('Fallback transcription result:', transcriptionText);

        // Basic language check for fallback - removed restriction
        // const detectedLanguage = detectLanguageFromText(transcriptionText);
        // const hasEnglishChars = /[a-zA-Z]/.test(transcriptionText);
        // const hasTamilChars = /[\u0B80-\u0BFF]/.test(transcriptionText);

        // if (!hasEnglishChars && !hasTamilChars) {
        //   throw new Error('Unsupported language detected. Only English, Tamil, and Tanglish (English-Tamil mix) are supported.');
        // }

        return transcriptionText;
      } catch (fallbackError) {
        console.error('Fallback transcription also failed:', fallbackError);
        throw fallbackError;
      }
    }
    console.error('Transcription error:', error);
    throw error;
  }
}

// Helper function to detect language from text content
function detectLanguageFromText(text: string): string {
  const hasEnglishChars = /[a-zA-Z]/.test(text);
  const hasTamilChars = /[\u0B80-\u0BFF]/.test(text); // Tamil Unicode block

  if (hasTamilChars && hasEnglishChars) {
    return 'tanglish'; // Mix of both
  } else if (hasTamilChars) {
    return 'ta'; // Tamil
  } else if (hasEnglishChars) {
    return 'en'; // English
  }
  return 'unknown';
}

// Handle text-to-speech requests
async function handleTextToSpeech(text: string, voice: string = 'af_bella', responseFormat: string = 'wav', groqApiKey?: string) {
  try {
    console.log('Groq TTS Request:', { textLength: text.length, voice, responseFormat });

    // Filter thinking content from the text
    const filteredText = filterThinkingContent(text);
    console.log('Filtered text length:', filteredText.length);

    if (!filteredText.trim()) {
      throw new Error('No speech content after filtering thinking patterns');
    }

    // Determine API key: user setting takes precedence, then environment variable
    const apiKey = groqApiKey || process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('Groq API key not configured. Please add your Groq API key in settings or set GROQ_API_KEY environment variable.');
    }

    // Validate voice parameter - Groq supports specific PlayAI voices
    const validVoices = ['Arista-PlayAI', 'Atlas-PlayAI', 'Basil-PlayAI', 'Briggs-PlayAI', 'Calum-PlayAI', 'Celeste-PlayAI', 'Cheyenne-PlayAI', 'Chip-PlayAI', 'Cillian-PlayAI', 'Deedee-PlayAI', 'Fritz-PlayAI', 'Gail-PlayAI', 'Indigo-PlayAI', 'Mamaw-PlayAI', 'Mason-PlayAI', 'Mikail-PlayAI', 'Mitch-PlayAI', 'Quinn-PlayAI', 'Thunder-PlayAI'];
    const finalVoice = validVoices.includes(voice) ? voice : 'Celeste-PlayAI'; // Default to Celeste-PlayAI if invalid
    console.log('Using Groq voice:', finalVoice);

    // Call Groq TTS API
    let response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'playai-tts', // Correct Groq TTS model
        input: filteredText,
        voice: finalVoice,
        response_format: 'wav', // Groq uses WAV format
        speed: 1.0,
      }),
    });

    // Handle response errors with fallback and specific messages
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq TTS API error:', response.status, errorText);
      // Model not found fallback: switch to Celeste-PlayAI voice
      if (response.status === 404) {
        const altBody = JSON.stringify({
          model: 'playai-tts',
          input: filteredText,
          voice: 'Celeste-PlayAI',
          response_format: 'wav',
          speed: 1.0,
        });
        response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: altBody,
        });
        if (!response.ok) {
          throw new Error(`Groq TTS fallback with 'Celeste-PlayAI' voice error: ${response.status}`);
        }
      } else {
        // Provide more specific error messages
        if (response.status === 401) {
          throw new Error('Groq API key is invalid. Please check your API key in settings.');
        } else if (response.status === 400) {
          throw new Error('Invalid request to Groq TTS API. Please check the text content.');
        } else if (response.status === 429) {
          throw new Error('Groq API rate limit exceeded. Please try again later.');
        } else {
          throw new Error(`Groq TTS API error: ${response.status} - ${errorText}`);
        }
      }
    }

    // Get the audio data as array buffer
    const audioBuffer = await response.arrayBuffer();

    // Convert to base64
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    console.log('Groq TTS generated successfully, audio length:', base64Audio.length);

    return {
      audioData: base64Audio,
      contentType: 'audio/wav', // Groq returns WAV format
      fileName: `groq-tts-${Date.now()}.wav`,
    };
  } catch (error) {
    console.error('Error generating Groq TTS:', error);
    throw error;
  }
}

// Export handleTextToSpeech as a server action
export async function handleTextToSpeechAction(text: string, voice?: string, responseFormat?: string, groqApiKey?: string) {
  return await handleTextToSpeech(text, voice, responseFormat, groqApiKey);
}

// Handle ElevenLabs text-to-speech requests
async function handleElevenLabsTextToSpeech(text: string, voiceId?: string, elevenlabsApiKey?: string) {
  try {
    console.log('ElevenLabs TTS Request:', { textLength: text.length, voiceId, hasApiKey: !!elevenlabsApiKey });

    // Filter thinking content from the text
    const filteredText = filterThinkingContent(text);
    console.log('Filtered text length:', filteredText.length);

    if (!filteredText.trim()) {
      throw new Error('No speech content after filtering thinking patterns');
    }

    // Determine API key: user setting takes precedence, then environment variable
    const apiKey = elevenlabsApiKey || process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ElevenLabs API key not configured. Please add your ElevenLabs API key in settings or set ELEVENLABS_API_KEY environment variable.');
    }

    // Determine voice ID: parameter takes precedence, then environment variable, then default
    const finalVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID || 'JkpEM0J2p7DL32VXnieS'; // Default voice from Python code
    console.log('Using ElevenLabs voice ID:', finalVoiceId);

    // Emotion tags (from Python code)
    const AUDIO_TAGS: { [key: string]: string } = {
      "whisper": "[whispering]",
      "angry": "[angry]",
      "shout": "[shouting]",
      "sad": "[sad]",
      "laugh": "[laughing]",
      "excited": "[excited]",
    };

    // For now, no emotion is applied (can be extended later)
    let processedText = filteredText;

    // Get voice settings from localStorage or use defaults
    const stability = parseFloat(typeof window !== 'undefined' ? localStorage.getItem('elevenlabs_stability') || '0.5' : '0.5');
    const similarity_boost = parseFloat(typeof window !== 'undefined' ? localStorage.getItem('elevenlabs_similarity_boost') || '0.75' : '0.75');
    const style = parseFloat(typeof window !== 'undefined' ? localStorage.getItem('elevenlabs_style') || '0.0' : '0.0');
    const speed = parseFloat(typeof window !== 'undefined' ? localStorage.getItem('elevenlabs_speed') || '1.0' : '1.0');
    const use_speaker_boost = typeof window !== 'undefined' ? (localStorage.getItem('elevenlabs_use_speaker_boost') !== 'false') : true;

    // Call ElevenLabs API exactly like Python code
  // Use the standard endpoint per ElevenLabs API docs
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${finalVoiceId}`;
    const headers = {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    };
    const payload = {
      text: processedText,
      model_id: 'eleven_monolingual_v1', // Official default model according to docs
      voice_settings: {
        stability: stability,
        similarity_boost: similarity_boost,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);

      // Try to parse error details
      let errorDetail = null;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.detail;
      } catch (e) {
        // Not JSON, use raw text
      }

      // If API key is invalid (401), retry with server environment variable key if different
      if (response.status === 401 && process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY !== apiKey) {
        console.warn('User-provided ElevenLabs API key failed, retrying with server environment key');
        const retryHeaders = { ...headers, 'xi-api-key': process.env.ELEVENLABS_API_KEY };
        const retryResponse = await fetch(url, { method: 'POST', headers: retryHeaders, body: JSON.stringify(payload) });
        if (retryResponse.ok) {
          const buffer = await retryResponse.arrayBuffer();
          const base64Audio = Buffer.from(buffer).toString('base64');
          return {
            audioData: base64Audio,
            contentType: 'audio/mpeg',
            fileName: `elevenlabs-tts-${Date.now()}.mp3`,
          };
        } else {
          errorText = await retryResponse.text();
          throw new Error(`ElevenLabs API retry failed: ${retryResponse.status} - ${errorText}`);
        }
      }
      // Provide more specific error messages
      if (response.status === 401) {
        if (errorDetail && errorDetail.status === 'quota_exceeded') {
          throw new Error(`ElevenLabs quota exceeded. You have ${errorDetail.message.match(/You have (\d+) credits remaining/)?.[1] || 0} credits remaining, but ${errorDetail.message.match(/(\d+) credits are required/)?.[1] || 'this many'} are required for this request.`);
        } else if (errorDetail && errorDetail.status === 'payment_issue') {
          throw new Error('ElevenLabs payment issue detected. Please check your billing information and payment method on the ElevenLabs website.');
        } else if (errorDetail && errorDetail.status === 'invalid_api_key') {
          throw new Error('ElevenLabs API key is invalid. Please check your API key in settings.');
        } else {
          // Generic 401 error - could be various authentication issues
          throw new Error('ElevenLabs authentication failed. Please check your API key and account status.');
        }
      } else if (response.status === 400) {
        throw new Error('Invalid request to ElevenLabs API. Please check the voice ID and text content.');
      } else if (response.status === 422) {
        throw new Error('ElevenLabs request validation failed. The voice ID may be invalid or text too long.');
      } else if (response.status === 429) {
        throw new Error('ElevenLabs API rate limit exceeded. Please try again later.');
      } else if (response.status === 402) {
        throw new Error('ElevenLabs payment required. Please check your account balance and billing information.');
      } else {
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }
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
export async function handleElevenLabsTextToSpeechAction(text: string, voiceId?: string, elevenlabsApiKey?: string) {
  return await handleElevenLabsTextToSpeech(text, voiceId, elevenlabsApiKey);
}

// Handle ElevenLabs speech-to-text requests
async function handleElevenLabsSpeechToText(audioData: string, filename: string = "audio.wav") {
  try {
    console.log('ElevenLabs STT Request:', { filename, hasApiKey: !!process.env.ELEVENLABS_API_KEY });

    // Determine API key: environment variable
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ElevenLabs API key not configured. Please set ELEVENLABS_API_KEY environment variable.');
    }

    // Convert base64 audio data to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Call ElevenLabs STT API exactly like Python code
    const url = 'https://api.elevenlabs.io/v1/speech-to-text';
    const headers = {
      'Accept': 'application/json',
      'xi-api-key': apiKey,
    };

    // Create form data with file
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
    formData.append('file', audioBlob, filename);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs STT API error:', response.status, errorText);

      // Provide more specific error messages
      if (response.status === 401) {
        throw new Error('ElevenLabs STT authentication failed. Please check your API key and account status.');
      } else if (response.status === 400) {
        throw new Error('Invalid audio file format for ElevenLabs STT. Please ensure the audio is in a supported format.');
      } else if (response.status === 422) {
        throw new Error('ElevenLabs STT request validation failed. The audio file may be corrupted or too long.');
      } else if (response.status === 429) {
        throw new Error('ElevenLabs STT API rate limit exceeded. Please try again later.');
      } else if (response.status === 402) {
        throw new Error('ElevenLabs STT payment required. Please check your account balance and billing information.');
      } else {
        throw new Error(`ElevenLabs STT API error: ${response.status} - ${errorText}`);
      }
    }

    const data = await response.json();
    console.log('ElevenLabs STT response:', data);

    // Extract text from response (similar to Python code)
    let text = '';
    if (typeof data === 'object' && data !== null) {
      // Common field names
      text = data.text || data.transcript || '';

      if (!text && data.results && Array.isArray(data.results)) {
        // Join segment texts if available
        text = data.results.map((seg: any) => seg.text || '').join(' ');
      }
    } else {
      text = String(data);
    }

    console.log('ElevenLabs STT extracted text:', text);

    return {
      text: text || '',
    };
  } catch (error) {
    console.error('Error transcribing with ElevenLabs STT:', error);
    throw error;
  }
}

// Export handleElevenLabsSpeechToText as a server action
export async function handleElevenLabsSpeechToTextAction(audioData: string, filename?: string) {
  return await handleElevenLabsSpeechToText(audioData, filename);
}

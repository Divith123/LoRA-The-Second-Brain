"use server";

import { createStreamableValue } from "ai/rsc";
import { CoreMessage } from "ai";
import { modelService } from "@/lib/model-service";
import { rateLimit } from "@/lib/ratelimit";
import { headers } from "next/headers";
import fsSync from 'fs';
import path from 'path';
import fs from 'fs/promises';
import { retrieveRelevant } from "@/lib/rag-store";
import { extractText } from '@/lib/file-processing';

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
      const formatted = [
        {
          role: "system",
          content: `You are a local LLM running as model: ${model}. If the user asks what model you are, answer with exactly "${model}".`
        },
        ...messages.map(m => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
        }))
      ];

      const generator = await localInferenceService.generateResponse(model, formatted, {
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
  opts?: { fileIds?: string[] } // 🔥 ADDED: accept attached file IDs
) {
  const ip = headers().get("x-forwarded-for") ?? "unknown";
  const isLimited = rateLimit(ip);
  if (isLimited) {
    throw new Error(`Rate Limit Exceeded for ${ip}`);
  }

  // 🔥 ADDED: If the client attached files, try to read and extract their text on the server
  let fileContext = "";
  if (opts?.fileIds && opts.fileIds.length > 0) {
    try {
      const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
      const entries = await fs.readdir(UPLOAD_DIR);
      const picked: string[] = [];
      for (const id of opts.fileIds.slice(0, 3)) {
        const hit = entries.find((n: string) => n.includes(`-${id}-`));
        if (!hit) continue;
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
        try {
          const txt = await extractText(meta as any as import('@/lib/file-processing').UploadedFileMeta);
          const snippet = txt ? txt.slice(0, 8000) : `(no text extracted)`;
          picked.push(`### ${meta.name}\n${snippet}`);
        } catch (e) {
          picked.push(`### ${meta.name}\n(text unavailable; id=${id})`);
        }
      }
      if (picked.length) {
        fileContext = `Use the following uploaded files if relevant:\n\n${picked.join('\n\n')}`;
      }
    } catch (e) {
      console.error('Failed to build server-side file context', e);
    }
  }

  // build retrieval context from uploaded files (or global index)
  const lastUserMsg = String(messages[messages.length - 1]?.content ?? "");
  const ctxChunks = await retrieveRelevant(lastUserMsg, opts?.fileIds ?? null, 6);
  const ctxText = ctxChunks
    .map((c, i) => `[#${i + 1}] (doc:${c.docId}, chunk:${c.idx})\n${c.text}`)
    .join("\n\n");

  // Combine any server-built fileContext snippets with retrieval text
  const combinedContextText = [fileContext, ctxText].filter(Boolean).join("\n\n");

  const withContext: CoreMessage[] = combinedContextText
    ? [
        {
          role: "system",
          content:
            "Use the following context from the user's uploaded files and retrieval index if relevant. " +
            "If the answer is not contained in the context, say so and answer from general knowledge.\n\n" +
            combinedContextText,
        },
        ...messages,
      ]
    : messages;

  const isLocal = await isLocalDownloadedModel(model);
  if (isLocal) {
    // 🔥 CHANGED: pass context-augmented messages
    return await generateLocalModelResponse(withContext, model);
  }

  // Ollama path
  const isOllamaRunning = await modelService.checkOllamaStatus();
  if (!isOllamaRunning) {
    throw new Error(
      "Ollama is not running. Start Ollama or pick a local GGUF file model."
    );
  }

  // 🔥 CHANGED: pass context-augmented messages
  const response = await modelService.generateResponse(model, withContext, {
    temperature: 0.8,
    topP: 0.7,
    maxTokens: 1024,
  });

  const stream = createStreamableValue();
  (async () => {
    try {
      let acc = "";
      for await (const chunk of response) {
        if (chunk.done) break;
        const content = chunk.message?.content || "";
        acc += content;
        stream.update(acc);
      }
      stream.done();
    } catch (e) {
      stream.error(e as Error);
    }
  })();

  return stream.value;
}

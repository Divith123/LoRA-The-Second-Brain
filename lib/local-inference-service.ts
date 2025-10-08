// lib/local-inference-service.ts
import fs from "fs";
import path from "path";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import net from "node:net";

const MODELS_DIR = path.join(process.cwd(), "models");

// ---- config from .env ----
const BIN  = (process.env.LLM_SERVER_BIN || "").replace(/^"(.*)"$/, "$1");
const HOST = process.env.LLM_HOST || "127.0.0.1";
const BASE = Number(process.env.LLM_BASE_PORT || 8080);
const THREADS = String(process.env.LLM_THREADS || 8);
const NGL = String(process.env.LLM_NGL || 35);
const CTX = String(process.env.LLM_CTX || 4096);

if (!BIN) throw new Error("LLM_SERVER_BIN not set. Add it to .env.local");

// ---- helpers ----
function resolveModelPath(model: string) {
  const gguf = path.join(MODELS_DIR, `${model}.gguf`);
  const bin  = path.join(MODELS_DIR, `${model}.bin`);
  if (fs.existsSync(gguf)) return gguf;
  if (fs.existsSync(bin))  return bin;
  return null;
}

async function getFreePort(start: number): Promise<number> {
  let p = start;
  while (true) {
    const free = await new Promise<boolean>((res) => {
      const s = net.createServer()
        .once("error", () => res(false))
        .once("listening", () => s.close(() => res(true)))
        .listen(p, HOST);
    });
    if (free) return p;
    p++;
  }
}

async function waitHealth(url: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${url}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`llama-server health timeout at ${url}`);
}

async function* streamOpenAIChat(res: Response) {
  if (!res.ok || !res.body) throw new Error(`LLM HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
      for (const line of chunk.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const j = JSON.parse(payload);
          const delta =
            j.choices?.[0]?.delta?.content ??
            j.choices?.[0]?.message?.content ??
            j.choices?.[0]?.text ?? "";
          if (delta) yield delta as string;
        } catch {}
      }
    }
  }
}

// ---- process manager ----
type Entry = { port: number; proc: ChildProcessWithoutNullStreams };
const RUNNING = new Map<string, Entry>();

async function ensureModelServer(model: string): Promise<Entry> {
  const existing = RUNNING.get(model);
  if (existing && !existing.proc.killed) return existing;

  const modelPath = resolveModelPath(model);
  if (!modelPath) throw new Error(`Model file not found for "${model}" in /models`);

  const port = await getFreePort(BASE + RUNNING.size);

  const args = [
    "-m", modelPath,
    "-c", CTX,
    "-ngl", NGL,
    "-t", THREADS,
    "--host", HOST,
    "--port", String(port),
  ];

  const proc = spawn(BIN, args, { windowsHide: true });

  proc.stdout.on("data", d => process.stdout.write(`[llama ${model}] ${d}`));
  proc.stderr.on("data", d => process.stderr.write(`[llama ${model} ERR] ${d}`));
  proc.on("exit", () => RUNNING.delete(model));

  const url = `http://${HOST}:${port}`;
  await waitHealth(url);

  const entry = { port, proc };
  RUNNING.set(model, entry);
  return entry;
}

process.on("exit", () => { for (const {proc} of Array.from(RUNNING.values())) try { proc.kill(); } catch {} });
process.on("SIGINT", () => process.exit());
process.on("SIGTERM", () => process.exit());

// ---- public API ----
export const localInferenceService = {
  modelExists(model: string) {
    return !!resolveModelPath(model);
  },

  async *generateResponse(
    model: string,
    messages: { role: string; content: string }[],
    params: { temperature?: number; topP?: number; maxTokens?: number; repetitionPenalty?: number } = {}
  ) {
    const { port } = await ensureModelServer(model);
    const url = `http://${HOST}:${port}/v1/chat/completions`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: params.temperature ?? 0.7,
        top_p: params.topP ?? 0.9,
        max_tokens: params.maxTokens ?? 512,
        repeat_penalty: params.repetitionPenalty ?? 1.1,
      }),
    });

    if (!res.ok || !res.body) throw new Error(`LLM HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
        for (const line of chunk.split("\n")) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") return;
          try {
            const j = JSON.parse(payload);
            const delta =
              j.choices?.[0]?.delta?.content ??
              j.choices?.[0]?.message?.content ??
              j.choices?.[0]?.text ?? "";
            if (delta) yield delta as string;
          } catch {}
        }
      }
    }
  },
};

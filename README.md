<div align="center">

# LoRA  The Second Brain

**A privacy-first, local-first AI workspace that remembers.**

Chat with local or cloud LLMs, talk to it with your voice, ground answers in your own documents, and keep every byte encrypted on your machine.

<p>
<img src="https://img.shields.io/badge/Next.js_14-000000.svg?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 14">
<img src="https://img.shields.io/badge/TypeScript-3178C6.svg?style=for-the-badge&logo=TypeScript&logoColor=white" alt="TypeScript">
<img src="https://img.shields.io/badge/Ollama-000000.svg?style=for-the-badge&logo=Ollama&logoColor=white" alt="Ollama">
<img src="https://img.shields.io/badge/Hugging_Face-F8F9FA.svg?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face">
<img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="MIT License">
</p>

</div>

---

## Table of Contents

- [What Is LoRA?](#what-is-lora)
- [Why It Matters](#why-it-matters)
- [Feature Overview](#feature-overview)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Using the App](#using-the-app)
- [Project Structure](#project-structure)
- [Security Model](#security-model)
- [Roadmap & Known Limitations](#roadmap--known-limitations)
- [Contributing](#contributing)
- [License](#license)

---

## What Is LoRA?

LoRA  The Second Brain is an open-source AI chat application that runs on your own machine first and reaches out to the cloud only when you ask it to. It is built to be a *personal* AI companion: one that remembers your past conversations, reasons over the documents you upload, speaks and listens, and stores everything behind client-side encryption that even the host cannot read.

Unlike a thin wrapper around a single API, LoRA is a complete workspace. It unifies **local inference** (Ollama and a bundled `llama.cpp` server for raw GGUF files), **four cloud providers** (OpenAI, Google Gemini, Groq, OpenRouter), **retrieval-augmented generation** over your files, **cross-conversation memory**, **voice and text-to-speech**, **image generation**, and even a **deepfake detection** module  all behind one interface.

> The name is a nod to how a *second brain* should behave: it holds your knowledge, recalls it on demand, and keeps it private.

---

## Why It Matters

For **researchers and developers**, LoRA is interesting on three axes:

| Concern | How LoRA addresses it |
| --- | --- |
| **Privacy** | Conversations, files, and projects are encrypted in the browser with AES-256-GCM before they ever touch disk. Keys are derived from the user's password via PBKDF2 (200,000 iterations). Nothing is sent to a server you don't control unless you explicitly pick a cloud model. |
| **Portability of models** | Discover and pull any GGUF model from Hugging Face, run it through Ollama, or drop a raw `.gguf`/`.bin` file into `/models` and serve it with the built-in `llama.cpp` process manager  no cloud account required. |
| **Provider independence** | A single `ModelService` abstraction routes requests to Ollama, OpenAI, Gemini, Groq, or OpenRouter, with automatic OpenRouter fallback when a provider key is missing. Swap models mid-conversation without changing your workflow. |

If you are studying local inference ergonomics, client-side encryption patterns, lightweight RAG without a vector database, or multi-provider orchestration in a Next.js App Router codebase, this project is a compact, readable reference implementation.

---

## Feature Overview

### Core intelligence
- **Local model execution** via [Ollama](https://ollama.ai/) (CPU or GPU) with memory-optimized presets (`ultra-low`, `low`, `balanced`, `high-performance`).
- **Raw GGUF/GGML inference** through a bundled `llama.cpp` server manager that spawns a per-model process, finds a free port, waits for health, and streams OpenAI-compatible completions.
- **Multi-provider cloud routing** across OpenAI (GPT-5 / GPT-4.1 / GPT-4o / o4-mini), Google Gemini (2.5 / 2.0 Flash family), Groq (Llama 3.x, GPT-OSS, Qwen3, Compound), and OpenRouter (hundreds of models), with graceful OpenRouter fallback.
- **Streaming responses** across every backend using the Vercel AI SDK's streamable values.

### Memory & retrieval (the "Second Brain")
- **Cross-conversation memory**  LoRA retrieves relevant snippets from your past chats and feeds them into the system prompt, so it can reference prior discussions.
- **Retrieval-augmented generation** over uploaded documents using an in-memory TF-IDF index with cosine similarity (no native vector DB dependency).
- **Document ingestion** for `.pdf`, `.docx`, `.csv`, `.txt`, and `.md`, with automatic text extraction, chunking (1000 chars / 200 overlap), and indexing.

### Interaction modes
- **Specialized AI modes**: *Think Longer*, *Deep Research*, *Web Search*, *Study*, and *Sarcastic*  each tuning the system prompt, temperature, and token budget.
- **Voice conversations** via Gemini Live and speech-to-text transcription via Groq Whisper (`whisper-large-v3` / `turbo`).
- **Text-to-speech** with multiple engines: Groq TTS, ElevenLabs, Kokoro, and Edge/Bark fallbacks.
- **Image generation** through Gemini / Imagen, with generated images saved locally and returned as inline Markdown.

### Tooling & extras
- **Hugging Face model browser** with live search, size enrichment via HEAD requests, and direct or Ollama-based downloads streamed over Server-Sent Events with progress.
- **DeepSecureAI**  an experimental deepfake detection module for images and video.
- **Projects** to group related conversations and files.
- **Account system** with password-strength enforcement, security-question recovery, and encrypted per-user data.
- **Modern UI** built on shadcn/ui, Radix primitives, Tailwind CSS, light/dark theming, and Sonner toasts.

---

## How It Works

```
                         ┌─────────────────────────────────────────┐
                         │              Browser (client)            │
                         │                                          │
   You ──chat/voice──▶   │  React UI · Dexie/IndexedDB · AES-GCM    │
                         │  encryption · theming · model selector   │
                         └───────────────┬──────────────────────────┘
                                         │ Server Actions / API routes
                                         ▼
                         ┌─────────────────────────────────────────┐
                         │           Next.js server layer           │
                         │                                          │
                         │  continueConversation()                  │
                         │   ├─ build file context (RAG extract)    │
                         │   ├─ retrieve relevant chunks (TF-IDF)   │
                         │   ├─ inject cross-conversation memory    │
                         │   └─ apply mode prompt + params          │
                         │                                          │
                         │  ModelService.generateResponse()         │
                         └───────┬───────────────────────┬─────────┘
                                 │                         │
                   local         ▼                         ▼  cloud
          ┌──────────────────────────────┐   ┌──────────────────────────────┐
          │ Ollama  ·  llama.cpp server   │   │ OpenAI · Gemini · Groq ·      │
          │ (GGUF / .bin in /models)      │   │ OpenRouter (with fallback)    │
          └──────────────────────────────┘   └──────────────────────────────┘
```

When you send a message, the server action assembles context from (1) any attached files, (2) the TF-IDF retrieval index, and (3) relevant history from your previous conversations. It then selects the right backend  a locally downloaded GGUF file, Ollama, or a cloud provider  and streams the response back token by token.

---

## Architecture

| Layer | Responsibility | Key files |
| --- | --- | --- |
| **UI / Client** | React Server Components, chat surface, model selector, voice modal, settings, sidebar, projects | `app/`, `components/` |
| **Server Actions** | Orchestrates context building, RAG, memory, modes, and streaming | `app/actions.tsx` |
| **API Routes** | Model discovery/download, file CRUD, TTS, voice | `app/api/**` |
| **Model Service** | Provider abstraction + routing + fallback | `lib/model-service.ts` |
| **Local Inference** | `llama.cpp` process manager for GGUF/`.bin` | `lib/local-inference-service.ts` |
| **RAG** | Text extraction, chunking, embeddings, retrieval | `lib/file-processing.ts`, `lib/embeddings.ts`, `lib/rag-store.ts` |
| **Storage** | Dexie/IndexedDB schema + encrypted stores | `lib/database.ts`, `lib/encrypted-*-storage.ts` |
| **Security** | AES-GCM encryption, PBKDF2 key derivation, password hashing | `lib/encryption.ts` |
| **Config** | Inference presets and memory tuning | `lib/config.ts` |

---

## Tech Stack

- **Framework:** Next.js 14 (App Router, React Server Components), React 18, TypeScript 5
- **AI/LLM:** Vercel AI SDK, Ollama, `llama.cpp` server, OpenAI / Gemini (`@google/genai`) / Groq / OpenRouter APIs
- **RAG & docs:** TF-IDF embeddings, `pdf-parse`, `mammoth` (DOCX), cosine similarity
- **Storage:** Dexie.js over IndexedDB, filesystem for model/file blobs
- **Crypto:** Web Crypto API  AES-256-GCM, PBKDF2 (SHA-256, 200k iterations)
- **Voice/TTS:** Gemini Live, Groq Whisper, ElevenLabs, Kokoro, `edge-tts` / Bark
- **UI:** shadcn/ui, Radix UI, Tailwind CSS, `next-themes`, Lucide / Font Awesome, Sonner

---

## Getting Started

### Prerequisites

1. **Node.js** 18.17+ and npm.
2. **Ollama** (for local models)  download from [ollama.ai](https://ollama.ai/) and run `ollama serve`.
3. *(Optional)* A `llama.cpp` server binary if you want to serve raw `.gguf`/`.bin` files placed in `/models`.
4. *(Optional)* API keys for any cloud providers you plan to use.

### Installation

```bash
git clone https://github.com/Divith123/LoRA---The-Second-Brain.git
cd LoRA---The-Second-Brain
npm install
```

### Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** `npm run dev` and `ollama serve` are long-running processes. Run them in separate terminals and leave them active.

### Available scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

---

## Configuration

Create a `.env.local` file in the project root. All values are optional  LoRA runs purely locally with Ollama and no keys at all. Add keys only for the cloud features you want.

```bash
# Ollama (defaults to http://localhost:11434)
OLLAMA_HOST=http://localhost:11434

# Cloud providers (add only what you need)
OPENROUTER_API_KEY=your_openrouter_api_key_here   # https://openrouter.ai/keys
GEMINI_API_KEY=your_gemini_api_key_here           # https://makersuite.google.com/app/apikey
GROQ_API_KEY=your_groq_api_key_here               # https://console.groq.com/keys
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here   # https://elevenlabs.io/app/profile

# Local llama.cpp server (only if serving raw GGUF/.bin files)
LLM_SERVER_BIN="C:\\path\\to\\llama-server.exe"
LLM_HOST=127.0.0.1
LLM_BASE_PORT=8080
LLM_THREADS=8
LLM_NGL=35
LLM_CTX=4096
```

> API keys can also be entered per-user in the in-app **Settings** modal, where they are stored with the rest of your encrypted profile. The `.env` keys act as server-side defaults.

### Inference presets

`lib/config.ts` exposes tunable memory presets so you can match the app to your hardware:

| Preset | Memory | Context | Quantization | GPU |
| --- | --- | --- | --- | --- |
| `ultra-low` | 2 GB | 1024 | Q4_K_M | off |
| `low` | 4 GB | 2048 | Q4_K_M | off |
| `balanced` | 8 GB | 4096 | Q5_K_M | off |
| `high-performance` | 16 GB | 8192 | Q8_0 | on |

---

## Using the App

1. **Create an account**  passwords must be 12+ characters with mixed case, numbers, and symbols. A security question enables recovery. Your encryption key is derived from this password.
2. **Add API keys** *(optional)*  open **Settings** to store keys for Groq, Gemini, OpenAI, OpenRouter, or ElevenLabs.
3. **Pick or download a model**  browse Hugging Face GGUF models, pull them via Ollama, or drop a `.gguf` file into `/models`. Cloud models appear once their provider key is set.
4. **Chat**  start a conversation. Toggle a **mode** (Think Longer, Deep Research, Study, etc.) for different behavior.
5. **Upload documents**  attach PDFs, Word docs, CSVs, or text files and ask questions grounded in their content.
6. **Talk to it**  use the voice modal for spoken input and text-to-speech replies.
7. **Organize**  group conversations and files into **Projects**.

---

## Project Structure

```
LoRA-The-Second-Brain/
├─ app/
│  ├─ actions.tsx            # Core server action: context + RAG + memory + routing
│  ├─ api/
│  │  ├─ files/              # Encrypted file CRUD + text extraction
│  │  ├─ models/             # HF discovery, downloads (SSE), status, provider models
│  │  ├─ tts/                # Text-to-speech endpoints
│  │  └─ voice/              # Gemini Live voice session
│  ├─ DeepSecureAI/          # Deepfake detection module (image/video)
│  ├─ about/ · profile/      # Static + user pages
│  └─ layout.tsx · page.tsx  # Providers, theming, shell
├─ components/               # UI: chat, sidebar, dialogs, model selector, shadcn/ui
├─ lib/
│  ├─ model-service.ts       # Multi-provider routing + fallback
│  ├─ local-inference-service.ts  # llama.cpp process manager
│  ├─ embeddings.ts · rag-store.ts · file-processing.ts  # RAG pipeline
│  ├─ database.ts            # Dexie/IndexedDB schema + DatabaseService
│  ├─ encryption.ts          # AES-GCM + PBKDF2
│  ├─ encrypted-*-storage.ts # Encrypted conversation/file/project stores
│  └─ config.ts              # Inference presets
├─ models/                   # Local GGUF / .bin files (git-ignored)
├─ uploads/                  # Uploaded + generated files
└─ public/                   # Static assets
```

---

## Security Model

- **Encryption at rest:** conversations, files, and projects are serialized and encrypted with **AES-256-GCM** before storage. Each payload carries its own random 128-bit salt and 96-bit IV.
- **Key derivation:** the encryption key is derived from the user's password using **PBKDF2-SHA-256 with 200,000 iterations**  the key is never stored, only re-derived on demand.
- **Password handling:** passwords and security answers are hashed (SHA-256) for verification; strength is enforced at creation.
- **Local-first by default:** with no cloud keys configured, no conversation data leaves your machine. Cloud calls happen only for the specific provider/model you select.

> **Caveat:** SHA-256 password hashing without a per-user salt+stretch for the *verification* hash is weaker than the data-encryption path. Treat this project as a strong starting point rather than an audited security product, and review the crypto for your own threat model before production use.

---

## Roadmap & Known Limitations

- The RAG index (`lib/rag-store.ts`) is **in-memory** for the MVP, so retrieval state resets on server restart. A persistent vector store is a natural next step.
- Embeddings use **TF-IDF** rather than semantic vectors  fast and dependency-free, but less nuanced than transformer embeddings.
- `DeepSecureAI` is **experimental** and depends on client-side model assets.
- Some provider model lists and pricing are curated snapshots and may drift from upstream.

Contributions in any of these areas are especially welcome.

---

## Contributing

Issues and pull requests are welcome. Please:

1. Open an issue describing the change or bug.
2. Keep PRs focused and include a clear description of what and why.
3. Run `npm run lint` before submitting.

Issue templates for bugs, features, and custom requests live in `.github/ISSUE_TEMPLATE/`.

---

## License

Released under the **MIT License**. Copyright © 2025 Divith S. See [LICENSE](./LICENSE) for details.

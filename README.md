<h1 align="center">LoRA: The Second Brain</h1>

<p align="center">

<img src ="https://img.shields.io/badge/Next.js-000000.svg?style=for-the-badge&logo=nextdotjs&logoColor=white">
<img src ="https://img.shields.io/badge/TypeScript-3178C6.svg?style=for-the-badge&logo=TypeScript&logoColor=white">
<img src ="https://img.shields.io/badge/Ollama-000000.svg?style=for-the-badge&logo=Ollama&logoColor=white">
<img src ="https://img.shields.io/badge/Hugging_Face-F8F9FA.svg?style=for-the-badge&logo=huggingface&logoColor=black">

</p>

An open-source AI chatbot app that runs models locally using Ollama, supporting a wide variety of Small Language Models (SLMs) from Meta, Google, Alibaba, and others in GGUF and H2O-Danube formats.

## Features

- [Next.js](https://nextjs.org/) 14 App Router with React Server Components
- Local AI model execution via [Ollama](https://ollama.com/)
- Dynamic model fetching from [Hugging Face](https://huggingface.co/)
- Support for GGUF and H2O-Danube model formats
- [shadcn/ui](https://ui.shadcn.com/) for UI components
- [Tailwind CSS](https://tailwindcss.com/) for styling
- Custom rate limiter for server actions
- [Sonner](https://sonner.emilkowal.ski/) for toast notifications
- Local SQLite database for conversations and user data
- Privacy-focused: Everything runs locally, no data sent to external servers

## How It Works?

This app uses Ollama to run AI models locally on your machine. Models are downloaded from Hugging Face and stored locally. The app provides a beautiful interface to browse, download, and chat with various SLMs.

### Supported Model Formats
- **GGUF**: Optimized format for efficient inference
- **H2O-Danube**: High-performance model format

### Supported Model Providers
- Meta (Llama series)
- Google (Gemma series)
- Alibaba (Qwen series)
- Microsoft (Phi series)
- Mistral AI
- And many more...

## Local Development

### Prerequisites

1. **Install Ollama**: Download and install Ollama from [ollama.com](https://ollama.com/)
2. **Start Ollama**: Run `ollama serve` in your terminal

### Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/Divith123/LoRA---The-Second-Brain.git
cd LoRA---The-Second-Brain
npm install
```

Create a `.env.local` file (optional):

```bash
# Optional: Set custom Ollama host
OLLAMA_HOST=http://localhost:11434
```

Run the development server:

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Using the App

1. **First Time Setup**: Create an account or login
2. **Browse Models**: Click the model selector to browse available models from Hugging Face
3. **Download Models**: Select and download models you want to use
4. **Start Chatting**: Choose a downloaded model and start your conversation

## Architecture

- **Frontend**: Next.js 14 with TypeScript
- **AI Engine**: Ollama for local model execution
- **Model Registry**: Hugging Face API for model discovery
- **Database**: SQLite with Dexie.js for local data storage
- **UI**: shadcn/ui components with Tailwind CSS

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

This project is open-source and available under the MIT License.

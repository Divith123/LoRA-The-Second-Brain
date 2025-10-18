"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Github } from "lucide-react";
import Nav from "@/components/nav";

interface Dev {
  name: string;
  github: string;
  bio?: string;
}

const developers: Dev[] = [
    {
    name: "Divith",
    github: "https://github.com/Divith123",
  },
  {
    name: "Hariharan",
    github: "https://github.com/Hariharanpugazh",
  },
  {
    name: "Krishneshwaran",
    github: "https://github.com/Krishneshwaran",
  },
  {
    name: "Kaviya Priya",
    github: "https://github.com/Kaviyapriya6",
  },
  {
    name: "Kavin Bakyaraj",
    github: "https://github.com/Kavin-Bakyaraj",
  },
  {
    name: "Dilan Melvin",
    github: "https://github.com/dilanmelvin",
  },
  {
    name: "Dharshaneshwaran",
    github: "https://github.com/Dharshaneshwaran",
  },
];

function DeveloperCard({ dev }: { dev: Dev }) {
  const username = dev.github.split("/").pop();
  const avatar = `https://avatars.githubusercontent.com/${username}`;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={avatar} alt={dev.name} />
          <AvatarFallback className="text-lg">{dev.name.split(" ").map((n) => n[0]).join("").toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold truncate">{dev.name}</h3>
            <a
              href={dev.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <Github className="h-4 w-4" />
              <span className="sr-only">GitHub</span>
            </a>
          </div>

          {dev.bio ? (
            <p className="mt-1 text-xs text-muted-foreground">{dev.bio}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Contributor</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AboutPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
  {/* Site nav: show back button on left, no model selector and no sidebar */}
  <Nav showMediaSelector={false} showSidebar={false} hideModelSelector={true} />

      <main className="pt-24 px-6 pb-12 max-w-4xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">About LoRA</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Privacy-first, offline personal AI — built by the developers below.
          </p>
        </header>

        <section className="mb-6">
          <h2 className="text-lg font-medium mb-3">Developers</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {developers.map((d, idx) => {
                        const isLastOdd = developers.length % 2 === 1 && idx === developers.length - 1;
                        return (
                          <div
                            key={d.github}
                            className={isLastOdd ? 'md:col-span-2 flex justify-center' : ''}
                          >
                            <div className={isLastOdd ? 'w-full md:max-w-2xl' : 'w-full'}>
                              <DeveloperCard dev={d} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
          
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Project Overview</h2>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              LoRA: The Second Brain is an open-source AI chatbot application that revolutionizes how you interact with artificial intelligence. 
              Built with privacy as a core principle, it runs entirely locally on your machine using Ollama, ensuring your conversations and data never leave your device.
            </p>
            <p>
              The application supports a wide variety of Small Language Models (SLMs) from leading providers including Meta, Google, Alibaba, Microsoft, 
              and others. With support for both GGUF and H2O-Danube model formats, you have access to cutting-edge AI capabilities without compromising your privacy.
            </p>
            <p>
              Whether you&apos;re a developer, researcher, or privacy-conscious user, LoRA provides a beautiful interface to browse, download, and chat with 
              various state-of-the-art language models, all while maintaining complete control over your data and conversations.
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Core Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h3 className="font-medium text-sm mb-2">Local AI Models</h3>
                <p className="text-xs text-muted-foreground">Run powerful language models locally using Ollama with support for GGUF and H2O-Danube formats.</p>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h3 className="font-medium text-sm mb-2">Document Intelligence</h3>
                <p className="text-xs text-muted-foreground">Upload and search through your documents using advanced RAG (Retrieval Augmented Generation) capabilities.</p>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h3 className="font-medium text-sm mb-2">Project Organization</h3>
                <p className="text-xs text-muted-foreground">Organize your conversations and projects with an intuitive sidebar and file management system.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h3 className="font-medium text-sm mb-2">Customizable Settings</h3>
                <p className="text-xs text-muted-foreground">Fine-tune model parameters, inference settings, and personalize your AI experience.</p>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h3 className="font-medium text-sm mb-2">Privacy First</h3>
                <p className="text-xs text-muted-foreground">Everything runs locally - no data sent to external servers, complete privacy and security.</p>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h3 className="font-medium text-sm mb-2">DeepSecure AI</h3>
                <p className="text-xs text-muted-foreground">Advanced media analysis tools for comprehensive AI-powered content understanding.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Supported Model Providers</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border border-border bg-card/30 text-center">
              <div className="font-medium text-sm">Meta</div>
              <div className="text-xs text-muted-foreground">Llama Series</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card/30 text-center">
              <div className="font-medium text-sm">Google</div>
              <div className="text-xs text-muted-foreground">Gemma Series</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card/30 text-center">
              <div className="font-medium text-sm">Alibaba</div>
              <div className="text-xs text-muted-foreground">Qwen Series</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card/30 text-center">
              <div className="font-medium text-sm">Microsoft</div>
              <div className="text-xs text-muted-foreground">Phi Series</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card/30 text-center">
              <div className="font-medium text-sm">Mistral AI</div>
              <div className="text-xs text-muted-foreground">Mistral Models</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card/30 text-center">
              <div className="font-medium text-sm">Hugging Face</div>
              <div className="text-xs text-muted-foreground">Model Registry</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card/30 text-center">
              <div className="font-medium text-sm">GGUF</div>
              <div className="text-xs text-muted-foreground">Optimized Format</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card/30 text-center">
              <div className="font-medium text-sm">H2O-Danube</div>
              <div className="text-xs text-muted-foreground">High Performance</div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Technical Architecture</h2>
          <div className="space-y-4">
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <h3 className="font-medium text-sm mb-2">Frontend Technology Stack</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <div>• Next.js 14 App Router</div>
                <div>• TypeScript</div>
                <div>• React Server Components</div>
                <div>• shadcn/ui Components</div>
                <div>• Tailwind CSS</div>
                <div>• Sonner Notifications</div>
                <div>• Custom Rate Limiter</div>
                <div>• Responsive Design</div>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <h3 className="font-medium text-sm mb-2">AI & Data Infrastructure</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <div>• Ollama Local Engine</div>
                <div>• SQLite Database</div>
                <div>• Dexie.js Storage</div>
                <div>• RAG Implementation</div>
                <div>• Vector Embeddings</div>
                <div>• File Processing</div>
                <div>• Encryption Support</div>
                <div>• Offline Capabilities</div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Getting Started</h2>
          <div className="space-y-3">
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold mt-0.5">1</div>
                <div>
                  <h3 className="font-medium text-sm mb-1">Install Prerequisites</h3>
                  <p className="text-xs text-muted-foreground">Download and install Ollama from ollama.ai, then run &apos;ollama serve&apos; in your terminal.</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold mt-0.5">2</div>
                <div>
                  <h3 className="font-medium text-sm mb-1">Setup Application</h3>
                  <p className="text-xs text-muted-foreground">Clone the repository, install dependencies with &apos;npm install&apos;, and run &apos;npm run dev&apos; to start the development server.</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold mt-0.5">3</div>
                <div>
                  <h3 className="font-medium text-sm mb-1">Start Using</h3>
                  <p className="text-xs text-muted-foreground">Create an account, browse and download AI models from the model selector, then start chatting with your chosen model.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Privacy & Security</h2>
          <div className="p-4 rounded-lg border border-border bg-card/50">
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Complete Privacy:</strong> All AI processing happens locally on your machine. 
                No conversations, documents, or personal data ever leave your device.
              </p>
              <p>
                <strong className="text-foreground">Encrypted Storage:</strong> Local data is stored securely with encryption support, 
                ensuring your information remains protected even on your own device.
              </p>
              <p>
                <strong className="text-foreground">No External Dependencies:</strong> Once models are downloaded, the application works 
                completely offline, giving you full control over your AI experience.
              </p>
              <p>
                <strong className="text-foreground">Open Source:</strong> The entire codebase is available on GitHub, 
                allowing for full transparency and community-driven improvements.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Contributing & License</h2>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              LoRA: The Second Brain is an open-source project released under the MIT License. We welcome contributions from developers, 
              designers, and AI enthusiasts who want to help improve the application.
            </p>
            <p>
              Whether you&apos;re interested in adding new features, fixing bugs, improving documentation, or suggesting enhancements, 
              your contributions are valuable to the community. Feel free to submit issues and pull requests on our GitHub repository.
            </p>
          </div>
        </section>                  <footer className="mt-8 pt-6 border-t border-border text-center">
                    <p className="text-xs text-muted-foreground">Built by  Divith  &amp; Harlee  · <a className="text-primary hover:underline" href="https://github.com/Divith123/LoRA-The-Second-Brain" target="_blank" rel="noreferrer">GitHub</a></p>
                  </footer>
                </main>
              </div>
            );
          }

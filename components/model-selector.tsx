"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { ChevronDown, Check, Download, Cpu, Trash2, Search, AlertCircle, Key, Zap, Sparkles, Globe, MemoryStick, CheckCircle2, XCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalModels, useHuggingFaceModels, useDownloadModel, useDeleteModel, useOllamaStatus, useLocalFiles, useProviderModels, useSystemSpecs, useActiveDownloads } from "@/lib/model-hooks";
import type { DownloadProgress } from "@/lib/model-hooks";
import { ProviderType } from "@/lib/model-types";
import { computeCompatibility, CompatLevel } from "@/lib/model-compat";
import { toast } from "sonner";

type ModelSelectorProps = {
  currentModel: string;
  onModelChange: (model: string, provider?: ProviderType) => void;
};

export function ModelSelector({ currentModel, onModelChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("gguf");
  const [activeTab, setActiveTab] = useState<"ollama" | "local-files" | "browse" | "api">("ollama");
  const [apiKeys, setApiKeys] = useState({
    openai: '',
    gemini: '',
    groq: '',
    openrouter: ''
  });
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showOllamaWarning, setShowOllamaWarning] = useState(true);
  // Keyed by modelId. downloadId is needed to cancel the server-side job.
  const [downloadingModels, setDownloadingModels] = useState<
    Record<string, { downloadId: string; progress: number; message: string; status: string; completed?: number; total?: number }>
  >({});

  const { data: localModels = [], isLoading: isLoadingLocal } = useLocalModels();
  const { data: localFiles = [], isLoading: isLoadingLocalFiles } = useLocalFiles();
  const { data: hfModels = [], isLoading: isLoadingHF } = useHuggingFaceModels(searchQuery);
  const { data: isOllamaRunning = false } = useOllamaStatus();
  const { data: systemSpecs } = useSystemSpecs();
  const { data: activeDownloads = [] } = useActiveDownloads();
  const { startDownload, cancelDownload, reconnectDownload, isPending } = useDownloadModel();
  const deleteMutation = useDeleteModel();

  // Build the onProgress callback once so hydrate + start share identical logic.
  const makeProgressHandler = (modelId: string) => (progress: DownloadProgress) => {
    setDownloadingModels(prev => ({
      ...prev,
      [modelId]: {
        downloadId: progress.downloadId,
        progress: progress.progress,
        message: progress.message,
        status: progress.status,
        completed: progress.bytesDone,
        total: progress.bytesTotal,
      }
    }));

    if (progress.status === 'completed' || progress.status === 'cancelled' || progress.status === 'error') {
      if (progress.status === 'completed') toast.success(`Downloaded ${modelId} successfully`);
      if (progress.status === 'error') toast.error(`Download failed: ${progress.message}`);
      setTimeout(() => {
        setDownloadingModels(prev => {
          const updated = { ...prev };
          delete updated[modelId];
          return updated;
        });
      }, 800);
    }
  };

  // Hydrate from server on mount + whenever the poll refreshes. This is what
  // makes a download survive a page refresh: the server keeps running the job,
  // and the UI re-attaches to it. Reconnect SSE for anything we aren't tracking.
  const reconnectedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const rec of activeDownloads) {
      setDownloadingModels(prev => {
        // Don't clobber a fresher local update for the same model.
        const existing = prev[rec.model_id];
        if (existing && existing.downloadId === rec.download_id && existing.progress >= rec.progress) {
          return prev;
        }
        return {
          ...prev,
          [rec.model_id]: {
            downloadId: rec.download_id,
            progress: rec.progress,
            message: rec.message,
            status: rec.status,
            completed: rec.bytes_done,
            total: rec.bytes_total,
          }
        };
      });

      // Attach a live SSE listener once per download id.
      if (!reconnectedIds.current.has(rec.download_id)) {
        reconnectedIds.current.add(rec.download_id);
        reconnectDownload(rec.download_id, makeProgressHandler(rec.model_id));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDownloads]);

  // Provider models
  const { data: openaiModels = [], isLoading: isLoadingOpenAI } = useProviderModels('openai');
  const { data: geminiModels = [], isLoading: isLoadingGemini } = useProviderModels('gemini');
  const { data: groqModels = [], isLoading: isLoadingGroq } = useProviderModels('groq');
  const { data: openrouterModels = [], isLoading: isLoadingOpenRouter } = useProviderModels('openrouter');

  const getModelIcon = (modelName: string, provider?: ProviderType) => {
    if (provider === 'openai') return '🤖';
    if (provider === 'gemini') return '✨';
    if (provider === 'groq') return '⚡';
    if (provider === 'openrouter') return '🌐';

    if (modelName.includes("llama") || modelName.includes("meta")) {
      return "🦙";
    } else if (modelName.includes("gemma") || modelName.includes("google")) {
      return "🤖";
    } else if (modelName.includes("mistral")) {
      return "🌪️";
    } else if (modelName.includes("phi")) {
      return "🌀";
    } else if (modelName.includes("qwen") || modelName.includes("alibaba")) {
      return "�";
    }
    return "🧠";
  };

  const handleDownload = async (modelId: string, downloadSource: 'ollama' | 'direct' = 'ollama') => {
    try {
      setDownloadingModels(prev => ({
        ...prev,
        [modelId]: { downloadId: '', progress: 0, message: 'Starting download...', status: 'starting' }
      }));

      const record = await startDownload({
        modelId,
        downloadSource,
        onProgress: makeProgressHandler(modelId),
      });

      if (!record) {
        setDownloadingModels(prev => {
          const updated = { ...prev };
          delete updated[modelId];
          return updated;
        });
        toast.error(`Failed to download ${modelId}`);
      }
    } catch (error) {
      console.error('Download error:', error);
      setDownloadingModels(prev => {
        const updated = { ...prev };
        delete updated[modelId];
        return updated;
      });
      toast.error(`Failed to download ${modelId}`);
    }
  };

  const handleDelete = async (modelName: string) => {
    try {
      await deleteMutation.mutateAsync(modelName);
      toast.success(`Deleted ${modelName}`);
    } catch (error) {
      toast.error(`Failed to delete ${modelName}`);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return null;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  // Compatibility badge: shows whether a model fits the current machine's RAM
  const compatStyles: Record<CompatLevel, { className: string; Icon: typeof CheckCircle2 }> = {
    'runs-well': {
      className: 'text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-950/50 border-green-200 dark:border-green-800',
      Icon: CheckCircle2,
    },
    'tight': {
      className: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800',
      Icon: AlertTriangle,
    },
    'wont-fit': {
      className: 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/50 border-red-200 dark:border-red-800',
      Icon: XCircle,
    },
    'unknown': {
      className: 'text-muted-foreground bg-muted border-transparent',
      Icon: HelpCircle,
    },
  };

  const renderCompatBadge = (modelId: string) => {
    const result = computeCompatibility(modelId, systemSpecs);
    const { className, Icon } = compatStyles[result.level];
    return (
      <div
        className={cn(
          'flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap',
          className
        )}
        title={result.detail}
      >
        <Icon size={10} />
        <span>{result.label}</span>
      </div>
    );
  };

  // Shared download-progress panel used across tabs
  const renderDownloadProgress = (modelId: string) => {
    const d = downloadingModels[modelId];
    if (!d) return null;

    const downloaded = formatBytes(d.completed);
    const total = formatBytes(d.total);

    return (
      <div className="mt-2 p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground truncate">
            {d.message || 'Downloading...'}
          </span>
          <span className="text-xs font-semibold text-primary shrink-0">{d.progress}%</span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${d.progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {downloaded && total ? `${downloaded} / ${total}` : d.status}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => d.downloadId && cancelDownload(d.downloadId)}
            disabled={!d.downloadId}
            className="h-6 px-2 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Cancel download"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  const getDisplayName = (modelName: string, provider?: ProviderType) => {
    if (!modelName) return 'Select Model';
    if (provider) {
      switch (provider) {
        case 'openai':
          return `OpenAI: ${modelName}`;
        case 'gemini':
          return `Gemini: ${modelName}`;
        case 'groq':
          return `Groq: ${modelName}`;
        case 'openrouter':
          return `OpenRouter: ${modelName}`;
        default:
          return modelName;
      }
    }
    // For local models, show just the name
    if (localModels.some(m => m.name === modelName)) {
      return modelName;
    }
    // For HF models, show the full model identifier for clarity
    return modelName;
  };

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 h-8 px-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <span className="max-w-[200px] truncate font-semibold">{getDisplayName(currentModel) || 'Select Model'}</span>
        <ChevronDown size={14} className="text-muted-foreground" />
      </Button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Blur Background */}
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal Card */}
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Select Model</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 p-0"
              >
                ✕
              </Button>
            </div>

            {/* Ollama Status */}
            {!isOllamaRunning && showOllamaWarning && (
              <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOllamaWarning(false)}
                  className="absolute top-2 right-2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  title="Dismiss warning"
                >
                  ✕
                </Button>
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  <h3 className="font-medium text-destructive">Ollama Not Running</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Ollama is required to run AI models locally. Would you like to install it?
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      // Open Ollama download page
                      window.open('https://ollama.ai/download', '_blank');
                    }}
                    className="flex-1"
                  >
                    Download Ollama
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Copy installation command
                      navigator.clipboard.writeText('curl -fsSL https://ollama.ai/install.sh | sh');
                      toast.success('Installation command copied to clipboard');
                    }}
                    className="flex-1"
                  >
                    Copy Install Command
                  </Button>
                </div>
                <div className="mt-3 p-3 bg-muted rounded text-xs font-mono">
                  <div>curl -fsSL https://ollama.ai/install.sh | sh</div>
                  <div className="mt-1 text-muted-foreground">Run this in your terminal to install Ollama</div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-4 overflow-x-auto">
              <Button
                variant={activeTab === "ollama" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("ollama")}
                className="flex-1 min-w-[100px]"
              >
                Ollama ({localModels.length})
              </Button>
              <Button
                variant={activeTab === "local-files" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("local-files")}
                className="flex-1 min-w-[100px]"
              >
                Local Files ({localFiles.length})
              </Button>
              <Button
                variant={activeTab === "browse" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("browse")}
                className="flex-1 min-w-[100px]"
              >
                Browse Models
              </Button>
              <Button
                variant={activeTab === "api" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("api")}
                className="flex-1 min-w-[100px]"
              >
                <Key size={14} className="mr-1" />
                API ({openaiModels.slice(0, 4).length + geminiModels.slice(0, 3).length + groqModels.length + openrouterModels.length})
              </Button>
            </div>

            {/* Search for Browse tab */}
            {activeTab === "browse" && (
              <>
                {/* System specs banner — tells users what their machine can handle */}
                <div className="mb-3 p-3 rounded-lg border border-border bg-muted/40">
                  {systemSpecs ? (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <MemoryStick size={15} className="text-primary" />
                        <span className="text-sm font-medium">Your system</span>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-foreground">{systemSpecs.totalMemoryGB} GB RAM</span>
                        <span>•</span>
                        <span>{systemSpecs.cpuCores} CPU cores</span>
                        <span>•</span>
                        <span className="truncate max-w-[220px]" title={systemSpecs.cpuModel}>{systemSpecs.cpuModel}</span>
                        <span>•</span>
                        <span className="uppercase">{systemSpecs.platform} / {systemSpecs.arch}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Badges below estimate whether each model fits this machine. Estimates are approximate.
                      </p>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MemoryStick size={15} />
                      <span>Detecting system specs…</span>
                    </div>
                  )}
                </div>

                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search models (e.g., llama, gemma, gguf)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-background/50 border border-muted rounded-lg focus:border-primary/50 transition-colors"
                  />
                </div>
              </>
            )}

            {/* API Keys Section */}
            {activeTab === "api" && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium">API Keys</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowApiKeys(!showApiKeys)}
                    className="text-xs"
                  >
                    {showApiKeys ? 'Hide' : 'Configure'}
                  </Button>
                </div>
                {showApiKeys && (
                  <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">OpenAI API Key</label>
                        <input
                          type="password"
                          placeholder="sk-..."
                          value={apiKeys.openai}
                          onChange={(e) => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                          className="w-full px-3 py-2 text-sm bg-background border border-muted rounded focus:border-primary/50 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Gemini API Key</label>
                        <input
                          type="password"
                          placeholder="AIza..."
                          value={apiKeys.gemini}
                          onChange={(e) => setApiKeys(prev => ({ ...prev, gemini: e.target.value }))}
                          className="w-full px-3 py-2 text-sm bg-background border border-muted rounded focus:border-primary/50 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Groq API Key</label>
                        <input
                          type="password"
                          placeholder="gsk_..."
                          value={apiKeys.groq}
                          onChange={(e) => setApiKeys(prev => ({ ...prev, groq: e.target.value }))}
                          className="w-full px-3 py-2 text-sm bg-background border border-muted rounded focus:border-primary/50 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">OpenRouter API Key</label>
                        <input
                          type="password"
                          placeholder="sk-or-v1-..."
                          value={apiKeys.openrouter}
                          onChange={(e) => setApiKeys(prev => ({ ...prev, openrouter: e.target.value }))}
                          className="w-full px-3 py-2 text-sm bg-background border border-muted rounded focus:border-primary/50 transition-colors"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          // Save API keys to localStorage
                          Object.entries(apiKeys).forEach(([provider, key]) => {
                            if (key) localStorage.setItem(`${provider}_api_key`, key);
                          });
                          toast.success('API keys saved');
                          setShowApiKeys(false);
                        }}
                        className="flex-1"
                      >
                        Save Keys
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Load API keys from localStorage
                          setApiKeys({
                            openai: localStorage.getItem('openai_api_key') || '',
                            gemini: localStorage.getItem('gemini_api_key') || '',
                            groq: localStorage.getItem('groq_api_key') || '',
                            openrouter: localStorage.getItem('openrouter_api_key') || ''
                          });
                        }}
                        className="flex-1"
                      >
                        Load Saved
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Active downloads banner (visible across all tabs) */}
            {Object.keys(downloadingModels).length > 0 && (
              <div className="mb-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Active Downloads
                </h4>
                {Object.keys(downloadingModels).map((modelId) => (
                  <div key={`active-${modelId}`}>
                    <div className="text-xs font-medium truncate mb-1">{modelId}</div>
                    {renderDownloadProgress(modelId)}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {activeTab === "ollama" ? (
                // Ollama Models Tab
                isLoadingLocal ? (
                  <div className="text-center py-8">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-sm text-muted-foreground">Loading Ollama models...</p>
                  </div>
                ) : localModels.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground mb-3">No Ollama models found.</p>
                    <p className="text-xs text-muted-foreground mb-4">Download some popular models to get started:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {['llama2', 'mistral', 'gemma'].map((model) => (
                        <Button
                          key={model}
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(model, 'ollama')}
                          disabled={!isOllamaRunning || !!downloadingModels[model]}
                          className="text-xs"
                        >
                          <Download size={12} className="mr-1" />
                          {model}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  localModels.map((model) => {
                    const isSelected = model.name === currentModel;

                    return (
                      <div
                        key={model.name}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border transition-colors",
                          isSelected ? "bg-primary/10 border-primary/20" : "bg-background/50 border-muted hover:border-primary/30"
                        )}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-lg">{getModelIcon(model.name)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{model.name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{model.size}</span>
                              <span>•</span>
                              <span>{model.format}</span>
                              <span>•</span>
                              <span>Downloaded {new Date(model.downloadedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(model.name)}
                            disabled={deleteMutation.isPending}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 size={14} />
                          </Button>

                          {isSelected && (
                            <Check size={16} className="text-primary" />
                          )}

                          {!isSelected && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                onModelChange(model.name, 'ollama');
                                setIsOpen(false);
                              }}
                            >
                              Use
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )
              ) : activeTab === "local-files" ? (
                // Local Files Tab
                isLoadingLocalFiles ? (
                  <div className="text-center py-8">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-sm text-muted-foreground">Loading local files...</p>
                  </div>
                ) : localFiles.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground mb-3">No local model files found.</p>
                    <p className="text-xs text-muted-foreground mb-4">Download models directly to your local folder:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {['microsoft/DialoGPT-medium', 'microsoft/DialoGPT-small'].map((model) => (
                        <Button
                          key={model}
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(model, 'direct')}
                          disabled={isPending}
                          className="text-xs"
                        >
                          <Download size={12} className="mr-1" />
                          {model.split('/')[1]}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  localFiles.map((model) => {
                    const isSelected = model.name === currentModel;

                    return (
                      <div
                        key={model.name}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border transition-colors",
                          isSelected ? "bg-primary/10 border-primary/20" : "bg-background/50 border-muted hover:border-primary/30"
                        )}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-lg">{getModelIcon(model.name)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{model.name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{model.size}</span>
                              <span>•</span>
                              <span>{model.format}</span>
                              <span>•</span>
                              <span>Downloaded {new Date(model.downloadedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(model.name)}
                            disabled={deleteMutation.isPending}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 size={14} />
                          </Button>

                          {isSelected && (
                            <Check size={16} className="text-primary" />
                          )}

                          {!isSelected && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                onModelChange(model.name, 'ollama');
                                setIsOpen(false);
                              }}
                            >
                              Use
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )
              ) : activeTab === "browse" ? (
                // Browse Models Tab
                isLoadingHF ? (
                  <div className="text-center py-8">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-sm text-muted-foreground">Searching models...</p>
                  </div>
                ) : hfModels.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">No models found.</p>
                    <p className="text-xs text-muted-foreground mt-1">Try a different search term.</p>
                  </div>
                ) : (
                  hfModels.map((model) => {
                    const isDownloadedOllama = localModels.some(m => m.name === model.id);
                    const isDownloadedLocal = localFiles.some(m => m.name === model.name);
                    const isSelected = model.id === currentModel || model.name === currentModel;

                    return (
                      <div
                        key={model.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border transition-colors",
                          isSelected ? "bg-primary/10 border-primary/20" : "bg-background/50 border-muted hover:border-primary/30"
                        )}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-lg">{getModelIcon(model.name)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium truncate">{model.name}</span>
                              {renderCompatBadge(model.id)}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{model.author}</span>
                              <span>•</span>
                              <span>{model.size}</span>
                              <span>•</span>
                              <span>{model.format}</span>
                              <span>•</span>
                              <span>↓ {model.downloads.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isDownloadedOllama && (
                            <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950 px-2 py-1 rounded-full">
                              <Download size={10} />
                              <span>Ollama</span>
                            </div>
                          )}
                          {isDownloadedLocal && (
                            <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 px-2 py-1 rounded-full">
                              <Download size={10} />
                              <span>Local</span>
                            </div>
                          )}
                          {downloadingModels[model.id] ? (
                            <div className="min-w-[180px]">
                              {renderDownloadProgress(model.id)}
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(model.id, 'direct')}
                                disabled={isPending}
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                                title="Download directly to local folder"
                              >
                                <Download size={14} />
                              </Button>
                              {isOllamaRunning && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownload(model.id, 'ollama')}
                                  disabled={isPending}
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                                  title="Download via Ollama"
                                >
                                  <Cpu size={14} />
                                </Button>
                              )}
                            </div>
                          )}


                          {(isDownloadedOllama || isDownloadedLocal) && isSelected && (
                            <Check size={16} className="text-primary" />
                          )}

                          {(isDownloadedOllama || isDownloadedLocal) && !isSelected && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                onModelChange(isDownloadedOllama ? model.id : model.name, 'ollama');
                                setIsOpen(false);
                              }}
                            >
                              Use
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )
              ) : activeTab === "api" ? (
                // API Models Tab - All providers in one tab
                <div className="space-y-6">
                  {/* OpenAI Section */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Key size={16} className="text-blue-600" />
                      <h4 className="font-medium">OpenAI ({openaiModels.slice(0, 4).length})</h4>
                    </div>
                    {isLoadingOpenAI ? (
                      <div className="text-center py-4">
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-1"></div>
                        <p className="text-xs text-muted-foreground">Loading OpenAI models...</p>
                      </div>
                    ) : openaiModels.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-xs text-muted-foreground">No OpenAI models available.</p>
                        <p className="text-xs text-muted-foreground">Configure your API key above.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {openaiModels.slice(0, 4).map((model) => {
                          const isSelected = model.id === currentModel;

                          return (
                            <div
                              key={model.id}
                              className={cn(
                                "flex items-center justify-between p-2 rounded-lg border transition-colors",
                                isSelected ? "bg-primary/10 border-primary/20" : "bg-background/50 border-muted hover:border-primary/30"
                              )}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-sm">{getModelIcon(model.name, 'openai')}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">{model.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Context: {model.contextLength?.toLocaleString()}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {isSelected && (
                                  <Check size={14} className="text-primary" />
                                )}

                                {!isSelected && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      onModelChange(model.id, 'openai');
                                      setIsOpen(false);
                                    }}
                                    className="text-xs px-2 py-1 h-7"
                                  >
                                    Use
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Gemini Section */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={16} className="text-purple-600" />
                      <h4 className="font-medium">Gemini ({geminiModels.slice(0, 3).length})</h4>
                    </div>
                    {isLoadingGemini ? (
                      <div className="text-center py-4">
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-1"></div>
                        <p className="text-xs text-muted-foreground">Loading Gemini models...</p>
                      </div>
                    ) : geminiModels.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-xs text-muted-foreground">No Gemini models available.</p>
                        <p className="text-xs text-muted-foreground">Configure your API key above.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {geminiModels.slice(0, 3).map((model) => {
                          const isSelected = model.id === currentModel;

                          return (
                            <div
                              key={model.id}
                              className={cn(
                                "flex items-center justify-between p-2 rounded-lg border transition-colors",
                                isSelected ? "bg-primary/10 border-primary/20" : "bg-background/50 border-muted hover:border-primary/30"
                              )}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-sm">{getModelIcon(model.name, 'gemini')}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">{model.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Context: {model.contextLength?.toLocaleString()}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {isSelected && (
                                  <Check size={14} className="text-primary" />
                                )}

                                {!isSelected && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      onModelChange(model.id, 'gemini');
                                      setIsOpen(false);
                                    }}
                                    className="text-xs px-2 py-1 h-7"
                                  >
                                    Use
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Groq Section */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Zap size={16} className="text-orange-600" />
                      <h4 className="font-medium">Groq ({groqModels.length})</h4>
                    </div>
                    {isLoadingGroq ? (
                      <div className="text-center py-4">
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-1"></div>
                        <p className="text-xs text-muted-foreground">Loading Groq models...</p>
                      </div>
                    ) : groqModels.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-xs text-muted-foreground">No Groq models available.</p>
                        <p className="text-xs text-muted-foreground">Configure your API key above.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {groqModels.map((model) => {
                          const isSelected = model.id === currentModel;

                          return (
                            <div
                              key={model.id}
                              className={cn(
                                "flex items-center justify-between p-2 rounded-lg border transition-colors",
                                isSelected ? "bg-primary/10 border-primary/20" : "bg-background/50 border-muted hover:border-primary/30"
                              )}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-sm">{getModelIcon(model.name, 'groq')}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">{model.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {model.capabilities?.includes('transcription') ? 'Audio Transcription' : `Context: ${model.contextLength?.toLocaleString()}`}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {isSelected && (
                                  <Check size={14} className="text-primary" />
                                )}

                                {!isSelected && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      onModelChange(model.id, 'groq');
                                      setIsOpen(false);
                                    }}
                                    className="text-xs px-2 py-1 h-7"
                                  >
                                    Use
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* OpenRouter Section */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Globe size={16} className="text-green-600" />
                      <h4 className="font-medium">OpenRouter ({openrouterModels.length})</h4>
                    </div>
                    {isLoadingOpenRouter ? (
                      <div className="text-center py-4">
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-1"></div>
                        <p className="text-xs text-muted-foreground">Loading OpenRouter models...</p>
                      </div>
                    ) : openrouterModels.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-xs text-muted-foreground">No OpenRouter models available.</p>
                        <p className="text-xs text-muted-foreground">Configure your API key above.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {openrouterModels.map((model) => {
                          const isSelected = model.id === currentModel;

                          return (
                            <div
                              key={model.id}
                              className={cn(
                                "flex items-center justify-between p-2 rounded-lg border transition-colors",
                                isSelected ? "bg-primary/10 border-primary/20" : "bg-background/50 border-muted hover:border-primary/30"
                              )}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-sm">{getModelIcon(model.name, 'openrouter')}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">{model.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Context: {model.contextLength?.toLocaleString()}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {isSelected && (
                                  <Check size={14} className="text-primary" />
                                )}

                                {!isSelected && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      onModelChange(model.id, 'openrouter');
                                      setIsOpen(false);
                                    }}
                                    className="text-xs px-2 py-1 h-7"
                                  >
                                    Use
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <Download size={12} className="text-blue-600" />
                  <span>Direct download saves to local models folder</span>
                </div>
                <div className="flex items-center gap-2">
                  <Cpu size={12} className="text-green-600" />
                  <span>Ollama download requires Ollama service</span>
                </div>
                <div className="flex items-center gap-2">
                  <Key size={12} className="text-purple-600" />
                  <span>API providers require API keys to be configured</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={12} className="text-primary" />
                  <span>Models run locally for privacy</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { ChevronDown, Check, Download, Cpu, Trash2, Search, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalModels, useHuggingFaceModels, useDownloadModel, useDeleteModel, useOllamaStatus, useLocalFiles } from "@/lib/model-hooks";
import { toast } from "sonner";

type ModelSelectorProps = {
  currentModel: string;
  onModelChange: (model: string) => void;
};

export function ModelSelector({ currentModel, onModelChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("gguf");
  const [activeTab, setActiveTab] = useState<"ollama" | "local-files" | "browse">("ollama");
  const [downloadingModels, setDownloadingModels] = useState<Record<string, { progress: number; message: string }>>({});

  const { data: localModels = [], isLoading: isLoadingLocal } = useLocalModels();
  const { data: localFiles = [], isLoading: isLoadingLocalFiles } = useLocalFiles();
  const { data: hfModels = [], isLoading: isLoadingHF } = useHuggingFaceModels(searchQuery);
  const { data: isOllamaRunning = false } = useOllamaStatus();
  const { startDownload, cancelDownload, isPending } = useDownloadModel();
  const deleteMutation = useDeleteModel();

  const getModelIcon = (modelName: string) => {
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
        [modelId]: { progress: 0, message: 'Starting download...' }
      }));

      const ok = await startDownload({
        modelId,
        downloadSource,
        onProgress: (progress) => {
          setDownloadingModels(prev => ({
            ...prev,
            [modelId]: { progress: progress.progress, message: progress.message }
          }));

          if (progress.status === 'completed' || progress.status === 'cancelled') {
            setTimeout(() => {
              setDownloadingModels(prev => {
                const updated = { ...prev };
                delete updated[modelId];
                return updated;
              });
            }, 500);
          }
        }
      });

      if (ok) toast.success(`Downloaded ${modelId} successfully`);
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

  const getDisplayName = (modelName: string) => {
    if (!modelName) return 'Select Model';
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
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-2xl mx-4 h-[600px] overflow-hidden">
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
            {!isOllamaRunning && (
              <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  <h3 className="font-medium text-destructive">Ollama Not Running</h3>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              <Button
                variant={activeTab === "ollama" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("ollama")}
                className="flex-1"
              >
                Ollama Models ({localModels.length})
              </Button>
              <Button
                variant={activeTab === "local-files" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("local-files")}
                className="flex-1"
              >
                Local Files ({localFiles.length})
              </Button>
              <Button
                variant={activeTab === "browse" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("browse")}
                className="flex-1"
              >
                Browse Models
              </Button>
            </div>

            {/* Search for Browse tab */}
            {activeTab === "browse" && (
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
                    <p className="text-sm text-muted-foreground">No Ollama models found.</p>
                    <p className="text-xs text-muted-foreground mt-1">Download models from the Browse tab.</p>
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
                                onModelChange(model.name);
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
                    <p className="text-sm text-muted-foreground">No local model files found.</p>
                    <p className="text-xs text-muted-foreground mt-1">Download models directly from the Browse tab.</p>
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
                                onModelChange(model.name);
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
              ) : (
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
                            <div className="font-medium truncate">{model.name}</div>
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
                            <div className="flex flex-col items-center gap-1 min-w-[80px]">
                              {/* Progress bar */}
                              <div className="w-full bg-muted rounded-full h-1.5">
                                <div
                                  className="bg-primary h-1.5 rounded-full transition-all duration-300"
                                  style={{ width: `${downloadingModels[model.id].progress}%` }}
                                />
                              </div>

                              {/* Percentage text */}
                              <span className="text-xs text-muted-foreground">
                                {downloadingModels[model.id].progress}%
                              </span>

                              {/* Cancel button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => cancelDownload()} // <-- call hook cancel
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 mt-1"
                                title="Cancel download"
                              >
                                Cancel
                              </Button>
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
                                onModelChange(isDownloadedOllama ? model.id : model.name);
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
              )}
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HuggingFaceModel, LocalModel, ProviderModel, ProviderType } from "@/lib/model-types";
import { useRef, useState } from "react";

// Query keys
export const modelQueryKeys = {
  huggingFaceModels: (query: string) => ['huggingFaceModels', query] as const,
  localModels: ['localModels'] as const,
  localFiles: ['localFiles'] as const,
  ollamaStatus: ['ollamaStatus'] as const,
  providerModels: (provider: ProviderType) => ['providerModels', provider] as const,
};

// Fetch provider models
export function useProviderModels(provider: ProviderType) {
  return useQuery({
    queryKey: modelQueryKeys.providerModels(provider),
    queryFn: async (): Promise<ProviderModel[]> => {
      const response = await fetch(`/api/models?type=provider&provider=${provider}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${provider} models`);
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Fetch Hugging Face models
export function useHuggingFaceModels(query: string = 'gguf') {
  return useQuery({
    queryKey: modelQueryKeys.huggingFaceModels(query),
    queryFn: async (): Promise<HuggingFaceModel[]> => {
      const response = await fetch(`/api/models?type=huggingface&query=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Fetch local models
export function useLocalModels() {
  return useQuery({
    queryKey: modelQueryKeys.localModels,
    queryFn: async (): Promise<LocalModel[]> => {
      const host = typeof window !== 'undefined' ? localStorage.getItem('ollama_host') : null;
      const url = host ? `/api/models?type=local&host=${encodeURIComponent(host)}` : '/api/models?type=local';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch local models');
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    retry: (failureCount, error) => {
      // Don't retry if Ollama is not running
      if (error instanceof Error && error.message.includes('Failed to fetch local models')) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

// Fetch local files (directly downloaded models)
export function useLocalFiles() {
  return useQuery({
    queryKey: modelQueryKeys.localFiles,
    queryFn: async (): Promise<LocalModel[]> => {
      const response = await fetch('/api/models?type=local-files');
      if (!response.ok) {
        throw new Error('Failed to fetch local files');
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Check Ollama status
export function useOllamaStatus() {
  return useQuery({
    queryKey: modelQueryKeys.ollamaStatus,
    queryFn: async (): Promise<boolean> => {
      const host = typeof window !== 'undefined' ? localStorage.getItem('ollama_host') : null;
      const url = host ? `/api/models?type=status&host=${encodeURIComponent(host)}` : '/api/models?type=status';
      const response = await fetch(url);
      if (!response.ok) {
        return false;
      }
      const data = await response.json();
      return data.isRunning;
    },
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });
}

// Download model mutation with progress tracking
export function useDownloadModel() {
  const queryClient = useQueryClient();
  const controllerRef = useRef<AbortController | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function startDownload({
    modelId,
    downloadSource = "ollama",
    onProgress,
  }: {
    modelId: string;
    downloadSource?: "ollama" | "direct";
    onProgress?: (p: { status: string; progress: number; message: string }) => void;
  }) {
    setIsPending(true);
    controllerRef.current = new AbortController();

    try {
      const host =
        typeof window !== "undefined" ? localStorage.getItem("ollama_host") : null;

      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, downloadSource, host }),
        signal: controllerRef.current.signal, // ✅ enables cancel
      });

      if (!res.ok) throw new Error("Failed to start download");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              onProgress?.(data);

              if (data.status === "completed") {
                queryClient.invalidateQueries({ queryKey: ["localModels"] });
                queryClient.invalidateQueries({ queryKey: ["localFiles"] });
                return true;
              }
              if (data.status === "error") throw new Error(data.message);
            } catch {
              /* ignore parse blips */
            }
          }
        }
      }

      return true;
    } catch (err: any) {
      // Treat aborts as a normal cancel, not an error
      if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
        onProgress?.({ status: "cancelled", progress: 0, message: "Cancelled" });
        return false;
      }
      throw err;
    } finally {
      setIsPending(false);
      controllerRef.current = null;
    }
  }

  function cancelDownload() {
    controllerRef.current?.abort();
  }

  return { startDownload, cancelDownload, isPending };
}

// Delete model mutation
export function useDeleteModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (modelName: string): Promise<boolean> => {
      const host = typeof window !== 'undefined' ? localStorage.getItem('ollama_host') : null;
      const url = host ? `/api/models?name=${encodeURIComponent(modelName)}&host=${encodeURIComponent(host)}` : `/api/models?name=${encodeURIComponent(modelName)}`;
      const response = await fetch(url, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete model');
      }
      const data = await response.json();
      return data.success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelQueryKeys.localModels });
      queryClient.invalidateQueries({ queryKey: modelQueryKeys.localFiles });
    },
  });
}
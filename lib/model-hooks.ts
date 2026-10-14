import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HuggingFaceModel, LocalModel, ProviderModel, ProviderType } from "@/lib/model-types";
import { SystemSpecs } from "@/lib/model-compat";
import { useRef, useState, useCallback, useEffect } from "react";

// ─── Shared type for download progress the UI consumes ───────────────────────

export interface DownloadProgress {
  downloadId: string;
  modelId: string;
  status: string;
  progress: number;
  message: string;
  bytesDone?: number;
  bytesTotal?: number;
}

// ─── Server-side download record shape (matches download-store.ts) ───────────

export interface ServerDownloadRecord {
  download_id: string;
  model_id: string;
  download_source: string;
  status: string;
  progress: number;
  message: string;
  bytes_done: number;
  bytes_total: number;
  file_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// Query keys
export const modelQueryKeys = {
  huggingFaceModels: (query: string) => ['huggingFaceModels', query] as const,
  localModels: ['localModels'] as const,
  localFiles: ['localFiles'] as const,
  ollamaStatus: ['ollamaStatus'] as const,
  providerModels: (provider: ProviderType) => ['providerModels', provider] as const,
  systemSpecs: ['systemSpecs'] as const,
  activeDownloads: ['activeDownloads'] as const,
};

// Fetch host system specs (RAM, CPU, platform) to gauge model compatibility
export function useSystemSpecs() {
  return useQuery({
    queryKey: modelQueryKeys.systemSpecs,
    queryFn: async (): Promise<SystemSpecs> => {
      const response = await fetch('/api/models?type=system');
      if (!response.ok) {
        throw new Error('Failed to fetch system specs');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // specs rarely change within a session
    retry: 1,
  });
}

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

// ─── Poll active downloads (survives page refresh) ───────────────────────────

export function useActiveDownloads() {
  return useQuery({
    queryKey: modelQueryKeys.activeDownloads,
    queryFn: async (): Promise<ServerDownloadRecord[]> => {
      const response = await fetch('/api/models?type=downloads');
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 1000,
    refetchInterval: 2000, // poll every 2s while any download is active
  });
}

// ─── Download model — fire-and-forget POST + SSE reconnect ───────────────────

export function useDownloadModel() {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  // Track active SSE connections so we can clean them up.
  const sseRefs = useRef<Map<string, EventSource>>(new Map());

  // Clean up all SSE connections on unmount.
  useEffect(() => {
    return () => {
      sseRefs.current.forEach((es) => es.close());
      sseRefs.current.clear();
    };
  }, []);

  /**
   * Subscribe to SSE progress for a given download. Calls onProgress with
   * every update and resolves when the download reaches a terminal state.
   */
  const subscribeSSE = useCallback(
    (
      downloadId: string,
      onProgress?: (p: DownloadProgress) => void
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        // Don't double-subscribe
        if (sseRefs.current.has(downloadId)) {
          resolve(true);
          return;
        }

        const es = new EventSource(
          `/api/models?type=download-progress&id=${encodeURIComponent(downloadId)}`
        );
        sseRefs.current.set(downloadId, es);

        es.addEventListener("progress", (event) => {
          try {
            const data = JSON.parse((event as MessageEvent).data);
            onProgress?.({
              downloadId: data.download_id ?? downloadId,
              modelId: data.model_id ?? "",
              status: data.status,
              progress: data.progress,
              message: data.message,
              bytesDone: data.bytes_done,
              bytesTotal: data.bytes_total,
            });

            if (
              data.status === "completed" ||
              data.status === "error" ||
              data.status === "cancelled"
            ) {
              es.close();
              sseRefs.current.delete(downloadId);
              queryClient.invalidateQueries({ queryKey: modelQueryKeys.localModels });
              queryClient.invalidateQueries({ queryKey: modelQueryKeys.localFiles });
              queryClient.invalidateQueries({ queryKey: modelQueryKeys.activeDownloads });
              resolve(data.status === "completed");
            }
          } catch {
            /* ignore parse blips */
          }
        });

        es.addEventListener("error", (event) => {
          try {
            const data = JSON.parse(((event as MessageEvent).data) || "{}");
            onProgress?.({
              downloadId,
              modelId: "",
              status: "error",
              progress: 0,
              message: data.message || "Connection lost",
            });
          } catch {
            /* SSE transport error — the polling hook will keep the UI updated */
          }
          es.close();
          sseRefs.current.delete(downloadId);
          resolve(false);
        });

        es.onerror = () => {
          // Connection dropped — clean up. Polling takes over.
          es.close();
          sseRefs.current.delete(downloadId);
          resolve(false);
        };
      });
    },
    [queryClient]
  );

  /**
   * Start a download. Returns the server record immediately. The download
   * runs in the background on the server — refreshing the page won't stop it.
   */
  const startDownload = useCallback(
    async ({
      modelId,
      downloadSource = "ollama",
      onProgress,
    }: {
      modelId: string;
      downloadSource?: "ollama" | "direct";
      onProgress?: (p: DownloadProgress) => void;
    }): Promise<ServerDownloadRecord | null> => {
      setIsPending(true);

      try {
        const host =
          typeof window !== "undefined"
            ? localStorage.getItem("ollama_host")
            : null;

        const res = await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelId, downloadSource, host }),
        });

        if (!res.ok) throw new Error("Failed to start download");

        const record: ServerDownloadRecord = await res.json();

        // Invalidate the active-downloads query so the UI picks it up
        queryClient.invalidateQueries({ queryKey: modelQueryKeys.activeDownloads });

        // Open an SSE connection for live progress
        subscribeSSE(record.download_id, onProgress);

        return record;
      } catch (err) {
        console.error("startDownload error:", err);
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [queryClient, subscribeSSE]
  );

  /** Cancel a download running on the server. */
  const cancelDownload = useCallback(
    async (downloadId: string) => {
      // Close the SSE connection if we have one
      const es = sseRefs.current.get(downloadId);
      if (es) {
        es.close();
        sseRefs.current.delete(downloadId);
      }

      try {
        await fetch(
          `/api/models?downloadId=${encodeURIComponent(downloadId)}`,
          { method: "DELETE" }
        );
      } catch {
        /* best effort */
      }

      queryClient.invalidateQueries({ queryKey: modelQueryKeys.activeDownloads });
    },
    [queryClient]
  );

  /**
   * Re-attach an SSE listener for a download that was already in progress
   * (discovered via useActiveDownloads after a page refresh).
   */
  const reconnectDownload = useCallback(
    (downloadId: string, onProgress?: (p: DownloadProgress) => void) => {
      subscribeSSE(downloadId, onProgress);
    },
    [subscribeSSE]
  );

  return { startDownload, cancelDownload, reconnectDownload, isPending };
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
"use client";

import { Button } from "./ui/button";
import { ProviderType } from "@/lib/model-types";
import Textarea from "react-textarea-autosize";
import { AiOutlineEnter } from "react-icons/ai";
import { Upload, Brain, Search, BookOpen, Clock, X, Mic } from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import FilePreviewModal from "./file-preview-modal";
import { SeeAllFilesDialog } from "./dialogs/see-all-files-dialog";

type AIMode = "think-longer" | "deep-research" | "web-search" | "study";

type ChatInputProps = {
  input: string;
  setInput: (input: string) => void;
  handleSubmit: (payload: { input: string; model: string; fileIds?: string[]; files?: { id: string; name: string; size?: number }[]; audioFile?: File; mode?: AIMode }) => Promise<void>;
  model: string;
  handleModelChange: (model: string, provider?: ProviderType) => void;
  isLoading?: boolean;
  onOpenFilesDialog?: () => void;
};

export default function ChatInput({
  input,
  setInput,
  handleSubmit,
  model,
  handleModelChange,
  isLoading = false,
  onOpenFilesDialog,
}: ChatInputProps) {
  const [selectedMode, setSelectedMode] = useState<AIMode | null>(null);
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [showStorageSelector, setShowStorageSelector] = useState(false);
  const [showFilesDialog, setShowFilesDialog] = useState(false);
  const [storageFiles, setStorageFiles] = useState<Array<{
    id: string;
    name: string;
    size: number;
    createdAt: string;
  }>>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string; size?: number }>>([]);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const modes = useMemo(() => [
    { id: "think-longer" as AIMode, label: "Think Longer", icon: Clock, shortcut: "/think" },
    { id: "deep-research" as AIMode, label: "Deep Research", icon: Search, shortcut: "/research" },
    { id: "web-search" as AIMode, label: "Web Search", icon: Search, shortcut: "/search" },
    { id: "study" as AIMode, label: "Study Mode", icon: BookOpen, shortcut: "/study" },
  ], []);

  // Detect slash commands - use useCallback to stabilize the function
  const detectSlashCommands = useCallback(() => {
    const slashCommands = modes.map(mode => mode.shortcut);
    const lastWord = input.split(' ').pop() || '';

    if (slashCommands.includes(lastWord)) {
      const mode = modes.find(m => m.shortcut === lastWord);
      if (mode) {
        setSelectedMode(mode.id);
        setInput(input.replace(lastWord, '').trim());
      }
    }
  }, [input, modes, setInput]);

  useEffect(() => {
    detectSlashCommands();
  }, [detectSlashCommands]);

  const handleModeSelect = (mode: AIMode) => {
    setSelectedMode(mode);
    setShowModeSelector(false);
    // Focus back to textarea
    textareaRef.current?.focus();
  };

  const clearMode = () => {
    setSelectedMode(null);
    textareaRef.current?.focus();
  };

  const handleFileUpload = async () => {
    const inputEl = document.createElement("input");
    inputEl.type = "file";
    inputEl.multiple = true;
    inputEl.accept = ".pdf,.docx,.txt,.csv"; // adjust as you like
    inputEl.onchange = async (e: any) => {
      const files = e.target.files;
      if (!files?.length) return;

      const form = new FormData();
      for (const f of files) form.append("files", f);

      // Get current user ID from localStorage
      const currentUserId = localStorage.getItem("lora_current_user");
      if (!currentUserId) {
        console.error("No current user found");
        return;
      }

      const res = await fetch(`/api/files?userId=${currentUserId}`, { method: "POST", body: form });
      const data = await res.json();
      if (res.ok && data?.files) {
        setAttachments(prev => [...prev, ...data.files]);
      }
    };
    inputEl.click();
  };

  // drag-and-drop handlers
  const onDropFiles = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;

    // If transcription model, prefer audio file drop
    if (isTranscriptionModel) {
      const audio = Array.from(filesList).find(f => f.type.startsWith('audio/'));
      if (audio) {
        setAudioFile(audio);
        return;
      }
    }

    // Otherwise upload files to /api/files same as handleFileUpload
    const form = new FormData();
    for (const f of Array.from(filesList)) form.append('files', f);

    // Get current user ID from localStorage
    const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('lora_current_user') : null;
    if (!currentUserId) {
      console.error('No current user found');
      return;
    }

    try {
      const res = await fetch(`/api/files?userId=${currentUserId}`, { method: 'POST', body: form });
      const data = await res.json();
      if (res.ok && data?.files) {
        setAttachments(prev => [...prev, ...data.files]);
      }
    } catch (error) {
      console.error('Failed to upload dropped files', error);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    onDropFiles(e.dataTransfer.files);
  };

  const handleAudioUpload = () => {
    const inputEl = document.createElement("input");
    inputEl.type = "file";
    inputEl.accept = "audio/*,.wav,.mp3,.m4a,.flac,.ogg"; // audio file types
    inputEl.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        setAudioFile(file);
      }
    };
    inputEl.click();
  };

  const removeAudioFile = () => {
    setAudioFile(null);
  };

  // helpers
  const prettyBytes = (n: number) => {
    if (!n && n !== 0) return "";
    const u = ["B","KB","MB","GB"]; let i=0; let v=n;
    while (v>=1024 && i<u.length-1){ v/=1024; i++; }
    return `${v.toFixed(i?1:0)} ${u[i]}`;
  };
  const truncate = (s: string, n = 28) =>
    s.length > n ? s.slice(0, n - 3) + "..." : s;

  const handleUploadFromStorage = async () => {
    try {
      // Get current user ID from localStorage
      const currentUserId = localStorage.getItem("lora_current_user");
      if (!currentUserId) {
        console.error("No current user found");
        return;
      }

      const res = await fetch(`/api/files?userId=${currentUserId}`);
      const data = await res.json();
      if (res.ok && data?.files) {
        setStorageFiles(data.files);
        setShowStorageSelector(true);
        setShowUploadOptions(false);
      }
    } catch (error) {
      console.error("Failed to fetch storage files:", error);
    }
  };

  const handleSelectStorageFile = (file: { id: string; name: string; size: number }) => {
    setAttachments(prev => [...prev, { id: file.id, name: file.name, size: file.size }]);
    setShowStorageSelector(false);
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(f => f.id !== id));
  };

  // ...existing code...

  const getPlaceholder = () => {
    if (isTranscriptionModel) {
      return "Upload an audio file to transcribe...";
    }
    if (selectedMode) {
      const mode = modes.find(m => m.id === selectedMode);
      return `Ask me anything in ${mode?.label} mode...`;
    }
    return "Type / for modes, or ask me anything!";
  };

  const isTranscriptionModel = model.includes('whisper');

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isTranscriptionModel) {
      if (!audioFile) {
        alert("Please upload an audio file for transcription");
        return;
      }
    } else if (input.trim().length === 0 || isLoading || !model) {
      return;
    }

    try {
      await handleSubmit({
        input,
        model,
        fileIds: attachments.map(a => a.id),
        files: attachments.map(a => ({ id: a.id, name: a.name, size: a.size })),
        audioFile: audioFile || undefined,
        mode: selectedMode || undefined,
      });
      setSelectedMode(null);
      setShowModeSelector(false);
      setAudioFile(null); // Clear audio file after submission
      // optionally: setAttachments([]);
    } catch (error) {
      // Handle error if needed
      console.error("Submit error:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      !isLoading
    ) {
      e.preventDefault();
      if (isTranscriptionModel) {
        if (audioFile && model) {
          onSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
        }
      } else if (input.trim().length > 0 && model) {
        onSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="w-full bg-gradient-to-t from-background via-background/95 to-background/80 backdrop-blur-sm">
      <div className="w-full max-w-4xl items-center py-4">
        <div className="relative flex w-full flex-col items-start gap-2">
          {/* Mode indicator and clear button */}
          {selectedMode && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded-full">
                {(() => {
                  const mode = modes.find(m => m.id === selectedMode);
                  const Icon = mode?.icon;
                  return Icon ? <Icon size={12} /> : null;
                })()}
                <span>{modes.find(m => m.id === selectedMode)?.label}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearMode}
                  className="h-4 w-4 p-0 ml-1 hover:bg-muted-foreground/20"
                  disabled={isLoading}
                >
                  <X size={10} />
                </Button>
              </div>
            </div>
          )}

          <div
            className={"relative flex w-full items-center" + (isDragging ? " ring-2 ring-primary/40 rounded-lg" : "")}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Mode selector button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowModeSelector(!showModeSelector)}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-6 w-6 p-0 hover:bg-muted"
              disabled={isLoading}
            >
              <Brain size={14} className={selectedMode ? "text-primary" : "text-muted-foreground"} />
            </Button>

            <Textarea
              ref={textareaRef}
              name="message"
              rows={1}
              maxRows={5}
              tabIndex={0}
              placeholder={getPlaceholder()}
              spellCheck={false}
              value={input}
              disabled={isLoading}
              className="focus-visible:ring-nvidia min-h-10 w-full resize-none rounded-lg border border-input bg-background pb-1 pl-10 pr-20 pt-2 text-sm shadow-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
            />
            {isDragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-2 text-sm text-primary">Drop files to upload</div>
              </div>
            )}

            {/* attachments moved below textarea to avoid overlapping the send button */}

            {/* Upload buttons - show different buttons based on model type */}
            {isTranscriptionModel ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAudioUpload}
                className="absolute right-12 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
                disabled={isLoading}
                title="Upload audio file"
              >
                <Mic size={14} />
              </Button>
            ) : (
              <div className="absolute right-12 top-1/2 -translate-y-1/2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUploadOptions(!showUploadOptions)}
                  className="h-6 w-6 p-0 hover:bg-muted"
                  disabled={isLoading}
                  title="Upload files"
                >
                  <Upload size={14} />
                </Button>
                {showUploadOptions && (
                  <div className="absolute bottom-full mb-2 right-0 bg-popover/95 backdrop-blur-sm border border-border/50 rounded-2xl shadow-xl p-2 z-20 min-w-[160px]">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        handleFileUpload();
                        setShowUploadOptions(false);
                      }}
                      className="w-full justify-start text-xs h-8 rounded-xl hover:bg-muted/80"
                      disabled={isLoading}
                    >
                      <Upload size={12} className="mr-2" />
                      Upload from Device
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        handleUploadFromStorage();
                        setShowUploadOptions(false);
                      }}
                      className="w-full justify-start text-xs h-8 rounded-xl hover:bg-muted/80"
                      disabled={isLoading}
                    >
                      <Search size={12} className="mr-2" />
                      Upload from Storage
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Send button */}
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
              disabled={
                (!isTranscriptionModel && input.length === 0) ||
                (isTranscriptionModel && !audioFile) ||
                !model ||
                isLoading
              }>
              <AiOutlineEnter size={16} />
            </Button>
          </div>

          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 w-full pl-10">
              {attachments.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setPreviewFileId(a.id)}
                  className="group inline-flex items-center max-w-full rounded-full border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs hover:bg-muted transition-colors"
                  title={a.name}
                >
                  <svg viewBox="0 0 24 24" className="mr-1.5 h-3.5 w-3.5 opacity-70" aria-hidden>
                    <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z M14,9V3.5L19.5,9H14Z" />
                  </svg>

                  <span className="truncate max-w-[16rem]">{truncate(a.name)}</span>
                  {typeof a.size === "number" && (
                    <span className="ml-2 tabular-nums text-muted-foreground">{prettyBytes(a.size)}</span>
                  )}

                  <span
                    onClick={(e) => { e.stopPropagation(); removeAttachment(a.id); }}
                    className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/10"
                    aria-label={`Remove ${a.name}`}
                  >
                    ✕
                  </span>
                </button>
              ))}
            </div>
          )}

          {audioFile && (
            <div className="mt-2 flex flex-wrap gap-2 w-full pl-10">
              <div className="inline-flex items-center max-w-full rounded-full border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs">
                <Mic className="mr-1.5 h-3.5 w-3.5 opacity-70" />
                <span className="truncate max-w-[16rem]">{truncate(audioFile.name)}</span>
                <span className="ml-2 tabular-nums text-muted-foreground">{prettyBytes(audioFile.size)}</span>
                <span
                  onClick={removeAudioFile}
                  className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/10 cursor-pointer"
                  aria-label={`Remove ${audioFile.name}`}
                >
                  ✕
                </span>
              </div>
            </div>
          )}

          <FilePreviewModal fileId={previewFileId} onClose={() => setPreviewFileId(null)} />

          {/* Mode selector dropdown */}
          {showModeSelector && (
            <div className="absolute bottom-full mb-2 left-2 bg-popover/95 backdrop-blur-sm border border-border/50 rounded-2xl shadow-xl p-3 z-20 min-w-[280px]">
              <div className="grid grid-cols-2 gap-2">
                {modes.map((mode) => {
                  const Icon = mode.icon;
                  return (
                    <Button
                      key={mode.id}
                      variant={selectedMode === mode.id ? "default" : "ghost"}
                      size="sm"
                      onClick={() => handleModeSelect(mode.id)}
                      className="flex items-center gap-2 justify-start text-xs h-9 rounded-xl hover:bg-muted/80 transition-colors"
                      disabled={isLoading}
                    >
                      <Icon size={12} />
                      <span>{mode.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Storage file selector */}
          {showStorageSelector && (
            <div className="absolute bottom-full mb-2 right-0 bg-popover/95 backdrop-blur-sm border border-border/50 rounded-2xl shadow-xl p-3 z-20 min-w-[320px] max-h-[300px] overflow-y-auto">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Select from Storage</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowStorageSelector(false)}
                    className="h-6 w-6 p-0"
                  >
                    <X size={12} />
                  </Button>
                </div>

                {/* Folders option */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowFilesDialog(true);
                    setShowStorageSelector(false);
                  }}
                  className="w-full justify-start text-xs h-8 rounded-lg hover:bg-muted/80"
                  disabled={isLoading}
                >
                  <svg viewBox="0 0 24 24" className="mr-2 h-3.5 w-3.5 opacity-70" aria-hidden>
                    <path fill="currentColor" d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,8V18H4V6H10V4Z" />
                  </svg>
                  <span className="text-muted-foreground">Folders</span>
                </Button>

                {storageFiles.length > 0 ? (
                  <div className="space-y-1">
                    {storageFiles.map((file) => (
                      <Button
                        key={file.id}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSelectStorageFile(file)}
                        className="w-full justify-start text-xs h-8 rounded-lg hover:bg-muted/80"
                        disabled={isLoading}
                      >
                        <svg viewBox="0 0 24 24" className="mr-2 h-3.5 w-3.5 opacity-70" aria-hidden>
                          <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z M14,9V3.5L19.5,9H14Z" />
                        </svg>
                        <div className="flex-1 text-left">
                          <div className="truncate max-w-[200px]">{file.name}</div>
                          <div className="text-xs text-muted-foreground">{prettyBytes(file.size)}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No files uploaded yet
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="p-2 text-center text-xs text-zinc-400">
          Brought to you by{" "}
          <a
            target="_blank"
            rel="noopener noreferrer"
            className="md:hover:text-nvidia underline underline-offset-2 transition-all duration-150 ease-linear"
            href="https://github.com/Divith123/LoRA-The-Second-Brain">
            LoRA Team
          </a>
        </p>
      </div>

      <SeeAllFilesDialog
        open={showFilesDialog}
        onOpenChange={setShowFilesDialog}
        onFileSelect={(file) => {
          setAttachments(prev => [...prev, file]);
          setShowFilesDialog(false);
        }}
      />
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useDeepSecure } from "@/components/app-content";
import Image from "next/image";
import { toast } from "sonner";

export default function DeepSecureAIPage() {
  const { mediaType } = useDeepSecure();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<{ label: 'Real' | 'Fake'; confidence: number } | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ time: string; label: 'Real' | 'Fake'; confidence: number; name: string }>>([]);

  function formatBytes(bytes?: number) {
    if (!bytes || bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  useEffect(() => {
    // Clear file/preview/result when media type changes
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
  }, [mediaType]);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let createdUrl: string | null = null;

    async function ensureHeicLoaded() {
      if ((window as any).heic2any) return;
      return new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/heic2any/dist/heic2any.min.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(new Error('Failed to load heic2any'));
        document.head.appendChild(s);
      });
    }

    async function prepare() {
      if (!file) return;
      const f = file;
      setPreviewError(null);
      const name = f.name.toLowerCase();
      const isHeic = f.type === 'image/heic' || f.type === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif');

      if (isHeic) {
        setIsConverting(true);
        try {
          await ensureHeicLoaded();
          // @ts-ignore runtime lib
          const blob = await (window as any).heic2any({ blob: f, toType: 'image/jpeg', quality: 0.9 });
          if (cancelled) return;
          createdUrl = URL.createObjectURL(blob as Blob);
          setPreviewUrl(createdUrl);
        } catch (e) {
          // fallback to raw URL — browser may not render but at least user can download
          createdUrl = URL.createObjectURL(f);
          setPreviewUrl(createdUrl);
          setPreviewError('Preview not supported for this image format in your browser. You can download the file to view it.');
        } finally {
          setIsConverting(false);
        }
      } else {
        createdUrl = URL.createObjectURL(f);
        setPreviewUrl(createdUrl);
      }
    }

    prepare();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file]);

  const handleFileChange = (f?: File) => {
    if (!f) return;
    setFile(f);
    setResult(null);
  };

  // Real detection using Hugging Face API
  const runDetection = async () => {
    if (!file) return;
    setIsDetecting(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mediaType', mediaType);

      console.log('Sending request to backend with mediaType:', mediaType, 'file:', file.name);

      const response = await fetch('/api/DeepSecureAI', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Backend error response:', errorData);
        throw new Error(errorData.error || errorData.details || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Backend response:', data);

      // Validate response format
      if (!data.label || !['Real', 'Fake'].includes(data.label)) {
        throw new Error('Invalid response format from backend');
      }

      setResult({
        label: data.label,
        confidence: data.confidence || 0
      });

      // Add to logs
      setLogs(prev => [...prev, {
        time: new Date().toLocaleTimeString(),
        label: data.label,
        confidence: data.confidence || 0,
        name: file.name
      }]);

      toast.success(`Detection complete: ${data.label} (${data.confidence || 0}% confidence)`);

    } catch (error) {
      console.error('Detection error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to run detection';
      toast.error(`Detection failed: ${errorMessage}`);
    } finally {
      setIsDetecting(false);
    }
  };

  const quickSamples = {
    image: [
      { name: 'person_real.jpg', url: '/samples/person_real.jpg' },
      { name: 'person_deepfake.jpg', url: '/samples/person_fake.jpg' }
    ],
    video: [
      { name: 'clip_real.mp4', url: '/samples/clip_real.mp4' },
      { name: 'clip_fake.mp4', url: '/samples/clip_fake.mp4' }
    ],
    audio: [
      { name: 'voice_real.flac', url: '/samples/voice_real.flac' },
      { name: 'voice_fake.flac', url: '/samples/voice_fake.flac' }
    ],
    'ai-generated-image': [
      { name: 'ai_generated.jpg', url: '/samples/ai_generated.jpg' },
      { name: 'human_created.jpg', url: '/samples/human_created.jpg' }
    ]
  } as const;

  const handleLoadDemo = async (sampleUrl: string, sampleName: string) => {
    try {
      const resp = await fetch(sampleUrl);
      const blob = await resp.blob();
      const f = new File([blob], sampleName, { type: blob.type });
      handleFileChange(f);
    } catch (e) {
      console.error('Failed to load demo sample', e);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="pt-20 mx-auto max-w-6xl w-full px-4">
        
          <h1 className="text-2xl font-semibold">DeepSecureAI</h1>
          <p className="mt-2 text-sm text-muted-foreground">Deepfake detection — upload one file at a time and run detection.</p>

          <div className="mt-6 grid grid-cols-12 gap-6">
            {/* Left: Upload + Preview */}
            <div className="col-span-12 md:col-span-5">
              {/* Make the left card stretch to match the right panel height */}
              <div className="rounded-lg border bg-card p-4 space-y-4 flex flex-col h-full">
                <h3 className="font-medium">Upload & Preview</h3>
                <div className="border border-dashed rounded-md p-4 flex flex-col items-center justify-center gap-3 flex-1 w-full">
                  {!previewUrl ? (
                    <div className="text-sm text-muted-foreground">No file selected</div>
                  ) : isConverting ? (
                    <div className="text-sm text-muted-foreground">Converting image for preview…</div>
                  ) : (
                    <div className="w-full flex items-center justify-center">
                      {/* Fixed-size preview box to avoid layout shifts from large/small media; use flex-1 to match right panel */}
                      <div className="w-full max-w-full h-80 md:h-72 flex items-center justify-center bg-muted/5 rounded overflow-hidden">
                        { (mediaType === 'image' || mediaType === 'ai-generated-image') && previewUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previewUrl} alt="preview" className="max-w-full max-h-full object-contain" />
                        )}
                        {mediaType === 'video' && previewUrl && (
                          <video src={previewUrl} controls className="max-w-full max-h-full object-contain" />
                        )}
                        {mediaType === 'audio' && previewUrl && (
                          <div className="w-full px-4">
                            <audio src={previewUrl} controls className="w-full" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {previewError && (
                    <div className="mt-2 text-xs text-destructive">{previewError} <a className="underline" href={previewUrl || '#'} target="_blank" rel="noreferrer">Download</a></div>
                  )}

                  <div className="flex w-full gap-2">
                    <label className="flex-1">
                      <input
                        type="file"
                        accept={(mediaType === 'image' || mediaType === 'ai-generated-image') ? 'image/*' : mediaType === 'video' ? 'video/*' : 'audio/*'}
                        onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : undefined)}
                        className="sr-only"
                      />
                      <div className="w-full text-center rounded-md border px-3 py-2 cursor-pointer hover:bg-muted">Choose file</div>
                    </label>
                    <button className="px-3 py-2 rounded-md border" onClick={() => { setFile(null); setPreviewUrl(null); setResult(null); }}>Clear</button>
                  </div>

                  <div className="w-full text-xs text-muted-foreground">
                    <div>Selected type: <strong className="capitalize">{mediaType}</strong></div>
                    <div className="mt-1">Single file only — one upload at a time.</div>
                  </div>
                </div>

                <div className="mt-2 w-full">
                  <button
                    className="w-full bg-primary text-white rounded-md px-3 py-2 disabled:opacity-60"
                    disabled={!file || isDetecting}
                    onClick={runDetection}
                  >
                    {isDetecting ? 'Detecting…' : 'Run Detection'}
                  </button>
                </div>
                {/* Quick demo samples moved inside the upload card for better discoverability */}
                <div className="mt-4 rounded-lg border bg-card p-4 w-full">
                  <h4 className="font-medium">Quick demo samples</h4>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {quickSamples[mediaType].map(s => (
                      <button key={s.name} onClick={() => handleLoadDemo(s.url, s.name)} className="text-sm rounded-md border px-2 py-1 text-left hover:bg-muted">{s.name}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Output */}
            <div className="col-span-12 md:col-span-7">
              <div className="rounded-lg border bg-card p-4 h-full flex flex-col">
                <div className="flex items-start justify-between">
                  <h3 className="font-medium">Detection Output</h3>
                  <div className="text-sm text-muted-foreground">Confidence</div>
                </div>

                <div className="mt-4 flex-1 flex flex-col gap-4">
                  {/* Primary result summary */}
                  <div className="rounded-md p-4 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold">{result ? result.label : '—'}</div>
                        <div className="text-sm text-muted-foreground">{result ? `${result.confidence}% confidence` : 'No detection run'}</div>
                      </div>
                      <div className="w-1/2">
                        <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                          <div className={`${result && result.label === 'Fake' ? 'bg-red-500' : 'bg-green-500'} h-4`} style={{ width: `${result ? result.confidence : 0}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Powered by Hugging Face deepfake detection models for accurate analysis.</div>
                  </div>

                  {/* File metadata and actions */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-md border p-3">
                      <div className="text-sm text-muted-foreground">File</div>
                      <div className="font-medium">{file ? file.name : '—'}</div>
                      <div className="text-xs mt-1">Type: <strong>{file ? file.type || 'unknown' : '—'}</strong></div>
                      <div className="text-xs">Size: <strong>{file ? formatBytes(file.size) : '—'}</strong></div>
                    </div>

                    <div className="rounded-md border p-3 flex flex-col justify-between">
                      <div>
                        <div className="text-sm text-muted-foreground">Actions</div>
                        <div className="mt-2 flex gap-2">
                          <a className={`px-3 py-2 rounded-md border text-sm ${!previewUrl ? 'opacity-60 pointer-events-none' : ''}`} href={previewUrl || '#'} download={file ? file.name : undefined}>Download</a>
                          <button className="px-3 py-2 rounded-md border text-sm" onClick={() => {
                            if (!file) return;
                            // Themed toast acknowledging feedback (no persistent storage)
                            toast.success('Thanks for the feedback, we will work on it');
                          }}>Report</button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">Tip: Download the original file or report suspicious content.</div>
                    </div>
                  </div>

                  {/* Explainability + next steps panel (no persistent history) */}
                  <div className="flex-1 overflow-auto rounded-md border p-3 bg-card/50">
                    <div className="text-sm font-medium">Explainability</div>
                    <div className="mt-2 text-xs text-muted-foreground">This analysis uses advanced deepfake detection models trained on large datasets to identify manipulated media. Results include confidence scores based on multiple detection techniques.</div>

                    <div className="mt-4">
                      <div className="text-sm font-medium">Next steps</div>
                      <ul className="mt-2 list-disc list-inside text-xs space-y-1 text-muted-foreground">
                        <li>Run multiple analyses with different models for consensus.</li>
                        <li>Upload higher-resolution samples for improved detection.</li>
                        <li>Export the file and submit to a specialist for manual review.</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-muted-foreground">
                  <div>Tip: Use the quick samples on the left to try image/video/audio detection instantly.</div>
                </div>
              </div>
            </div>
          </div>
        
      </main>
    </div>
  );
}

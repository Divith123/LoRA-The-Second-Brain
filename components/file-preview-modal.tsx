"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  fileId: string | null;
  onClose: () => void;
};

export default function FilePreviewModal({ fileId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      setText(null);
      setObjectUrl(null);
      try {
        const res = await fetch(`/api/files/${fileId}`);
        if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
        const ct = res.headers.get("content-type") || "";
        if (!mounted) return;
        setContentType(ct);

        if (ct.startsWith("text/") || ct.includes("json") || ct.includes("csv")) {
          const t = await res.text();
          if (!mounted) return;
          setText(t);
        } else {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          if (!mounted) return;
          setObjectUrl(url);
        }
      } catch (e: any) {
        console.error(e);
        if (!mounted) return;
        setError(e?.message || "Failed to load preview");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  if (!fileId) return null;

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 max-h-[85vh] w-[90vw] md:w-[80vw] lg:w-[70vw] bg-popover rounded-lg p-4 overflow-auto shadow-xl">
        <button
          onClick={onClose}
          aria-label="Close preview"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/30"
        >
          ✕
        </button>

        <div className="mb-4">
          <h3 className="text-sm font-medium">File preview</h3>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading preview...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !error && (
          <div>
            {text && (
              <pre className="whitespace-pre-wrap text-sm leading-relaxed">{text}</pre>
            )}

            {!text && objectUrl && contentType && (
              <div className="w-full">
                {contentType.includes("pdf") ? (
                  <iframe src={objectUrl} className="w-full h-[75vh]" title="pdf-preview" />
                ) : contentType.startsWith("image/") ? (
                  <img src={objectUrl} alt="preview" className="max-w-full max-h-[75vh]" />
                ) : (
                  <p className="text-sm">Preview not available for this file type. You can download it <a className="underline" href={`/api/files/${fileId}`} target="_blank">here</a>.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof window === "undefined") return null;
  return createPortal(modal, document.body);
}

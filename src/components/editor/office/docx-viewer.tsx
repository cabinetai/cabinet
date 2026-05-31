"use client";

import { useEffect, useRef, useState } from "react";
import { OfficeChrome } from "./office-chrome";
import { Loader2 } from "lucide-react";

interface Props {
  path: string;
  title: string;
}

export function DocxViewer({ path, title }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    // Clear any previous render
    container.innerHTML = "";

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ renderAsync }, res] = await Promise.all([
          import("docx-preview"),
          fetch(`/api/assets/${path}`),
        ]);
        if (cancelled) return;
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        await renderAsync(blob, container, undefined, {
          className: "docx-rendered",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          experimental: true,
          useBase64URL: true,
        });
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render document");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <OfficeChrome path={path} title={title} extLabel="DOCX" />
      <div className="flex-1 overflow-y-auto bg-muted/30">
        {loading && !error && (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Rendering document…
          </div>
        )}
        {error && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground">
                Try downloading the file and opening it externally.
              </p>
            </div>
          </div>
        )}
        <div ref={containerRef} className="docx-viewer-body mx-auto max-w-5xl py-6 px-4" />
      </div>
    </div>
  );
}

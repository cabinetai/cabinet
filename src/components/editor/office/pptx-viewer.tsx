"use client";

import { useEffect, useRef, useState } from "react";
import { OfficeChrome } from "./office-chrome";
import { Loader2 } from "lucide-react";

interface Props {
  path: string;
  title: string;
}

export function PptxViewer({ path, title }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    let previewer: { destroy?: () => void } | null = null;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ init }, res] = await Promise.all([
          import("pptx-preview"),
          fetch(`/api/assets/${path}`),
        ]);
        if (cancelled) return;
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;

        const width = container.clientWidth || 960;
        const height = Math.round((width * 9) / 16);
        previewer = init(container, { width, height, mode: "list" }) as unknown as {
          destroy?: () => void;
          preview: (buf: ArrayBuffer) => Promise<unknown>;
        };
        await (previewer as unknown as { preview: (b: ArrayBuffer) => Promise<unknown> }).preview(
          buf
        );
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render presentation");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        previewer?.destroy?.();
      } catch {
        /* ignore */
      }
    };
  }, [path]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <OfficeChrome path={path} title={title} extLabel="PPTX" />
      <div className="flex-1 overflow-auto bg-muted/30 py-4">
        {loading && !error && (
          <div className="h-[60vh] flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Rendering slides…
          </div>
        )}
        {error && (
          <div className="h-[60vh] flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground">
                Try downloading the file and opening it externally.
              </p>
            </div>
          </div>
        )}
        <div ref={containerRef} className="pptx-viewer-body mx-auto max-w-5xl px-4" />
      </div>
    </div>
  );
}

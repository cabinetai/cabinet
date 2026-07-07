"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Download, Code2, Eye, Copy, Check, ZoomIn, ZoomOut, Maximize, FileCode, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { ToolbarButton } from "@/components/layout/toolbar-button";
import { useLocale } from "@/i18n/use-locale";
import { SplitScreenIcon } from "./editor-toolbar";

interface MermaidViewerProps {
  path: string;
  title: string;
}

export function MermaidViewer({ path, title }: MermaidViewerProps) {
  const { t } = useLocale();
  const [source, setSource] = useState("");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"source" | "rendered">("source");
  const [splitMode, setSplitMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const editContentRef = useRef<string>("");
  const [debouncedSource, setDebouncedSource] = useState("");
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const renderIdRef = useRef(0);

  const ZOOM_STEP = 0.25;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 5;

  const zoomIn = () => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX));
  const zoomOut = () => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((z) => Math.min(Math.max(z + delta, ZOOM_MIN), ZOOM_MAX));
    }
  }, []);

  // Pan via mouse drag
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  }, [isPanning]);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const assetUrl = `/api/assets/${path}`;

  const fetchAndRender = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(assetUrl);
      if (!res.ok) throw new Error("Failed to fetch file");
      const text = await res.text();
      setSource(text);
      setDebouncedSource(text);
      editContentRef.current = text;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diagram");
    } finally {
      setLoading(false);
    }
  }, [assetUrl]);

  useEffect(() => {
    void fetchAndRender();
  }, [fetchAndRender]);

  // Debounced compilation when user edits source
  const handleSourceChange = (val: string) => {
    editContentRef.current = val;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedSource(val);
    }, 300);
  };

  const handleSave = useCallback(async () => {
    const newContent = editContentRef.current;
    if (newContent === source) return;
    setSaving(true);
    try {
      const bridge = (window as unknown as {
        CabinetDesktop?: {
          writeFile?: (p: string, c: string) => Promise<{ ok: boolean; error?: string }>;
        };
      }).CabinetDesktop;
      if (bridge?.writeFile) {
        const result = await bridge.writeFile(path, newContent);
        if (!result.ok) throw new Error(result.error || "Failed to save");
      } else {
        const res = await fetch(assetUrl, {
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          body: newContent,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      setSource(newContent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [source, path, assetUrl]);

  useEffect(() => {
    if (!debouncedSource.trim()) return;
    const renderDiagram = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
          securityLevel: "loose",
          suppressErrorRendering: true,
        });

        // Validate syntax first to avoid mermaid injecting error SVGs into the DOM
        await mermaid.parse(debouncedSource.trim());

        const id = `mermaid-${++renderIdRef.current}`;
        const { svg: rendered } = await mermaid.render(id, debouncedSource.trim());
        setSvg(rendered);
        setError("");
      } catch (err) {
        // Clean up any error elements mermaid may have injected into the DOM
        document.querySelectorAll('[id^="dmermaid-"], [id^="d"]:has(> .error-icon)').forEach(el => el.remove());
        setError(err instanceof Error ? err.message : "Failed to render diagram");
      }
    };
    void renderDiagram();
  }, [debouncedSource]);

  const copySource = () => {
    navigator.clipboard.writeText(source);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ViewerLayout
      toolbar={
        <ViewerToolbar path={path} badge="MERMAID">
        {(splitMode || mode === "source") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={saving || source === editContentRef.current}
            className="h-7 gap-1.5 text-xs"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        )}

        {!splitMode && mode === "rendered" && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode("source");
                setSplitMode(false);
              }}
              title="Edit Source"
              className="h-7 w-7 p-0"
            >
              <FileCode className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode("source");
                setSplitMode(true);
              }}
              title="Split Screen"
              className="h-7 w-7 p-0"
            >
              <SplitScreenIcon className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        {!splitMode && mode === "source" && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode("rendered");
                setSplitMode(false);
              }}
              className="gap-1.5 h-7 text-xs"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode("source");
                setSplitMode(true);
              }}
              title="Split Screen"
              className="h-7 w-7 p-0"
            >
              <SplitScreenIcon className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        {splitMode && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode("source");
                setSplitMode(false);
              }}
              title="Edit Source Only"
              className="h-7 w-7 p-0"
            >
              <FileCode className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode("rendered");
                setSplitMode(false);
              }}
              title="Preview Only"
              className="h-7 w-7 p-0"
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={copySource}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>

        {svg && (splitMode || mode === "rendered") && !error && (
          <>
            <div className="h-4 w-px bg-border mx-0.5" />
            <ToolbarButton icon={ZoomOut} label={t("mermaidViewer:zoomOut")} iconOnly onClick={zoomOut} />
            <span className="text-[11px] text-muted-foreground/70 tabular-nums w-10 text-center select-none">
              {Math.round(zoom * 100)}%
            </span>
            <ToolbarButton icon={ZoomIn} label={t("mermaidViewer:zoomIn")} iconOnly onClick={zoomIn} />
            <ToolbarButton icon={Maximize} label={t("mermaidViewer:resetView")} iconOnly onClick={resetView} />
            <div className="h-4 w-px bg-border mx-0.5" />
          </>
        )}
        {svg && (
          <ToolbarButton icon={Download} label="SVG" onClick={downloadSvg} />
        )}
        </ViewerToolbar>
      }
    >
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading diagram...
          </div>
        ) : (
          <div className="flex-1 flex h-full overflow-hidden bg-background">
            {/* LEFT: SOURCE CODE EDITOR */}
            {(splitMode || mode === "source") && (
              <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-200">
                <textarea
                  defaultValue={source}
                  onChange={(e) => handleSourceChange(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                      e.preventDefault();
                      void handleSave();
                    }
                  }}
                  spellCheck={false}
                  className="w-full h-full bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-100 outline-none resize-none"
                  style={{ minHeight: "100%" }}
                />
              </div>
            )}

            {/* RIGHT: DIAGRAM PREVIEW */}
            {(splitMode || mode === "rendered") && (
              <div className="flex-1 flex flex-col overflow-hidden border-l border-border bg-background relative animate-in fade-in duration-200">
                {error ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-sm p-8 bg-background overflow-y-auto">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                        <Code2 className="h-5 w-5 text-red-500" />
                      </div>
                      <p className="text-red-500 font-medium">{t("mermaidViewer:syntaxError")}</p>
                    </div>
                    <pre className="text-muted-foreground text-xs max-w-lg text-left bg-muted/50 rounded-md p-3 overflow-auto whitespace-pre-wrap font-mono">{error}</pre>
                    {!splitMode && (
                      <Button variant="outline" size="sm" onClick={() => setMode("source")}>
                        View source to fix
                      </Button>
                    )}
                  </div>
                ) : (
                  <div
                    ref={viewportRef}
                    className="relative w-full h-full overflow-hidden"
                    style={{ cursor: isPanning ? "grabbing" : "grab" }}
                    onWheel={handleWheel}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <div
                      ref={containerRef}
                      className="flex items-center justify-center p-8 min-h-full [&_svg]:max-w-full origin-center select-none"
                      style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      }}
                      dangerouslySetInnerHTML={{ __html: svg }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </ViewerLayout>
  );
}

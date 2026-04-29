"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Download, Code2, Eye, Copy, Check, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";

interface MermaidViewerProps {
  path: string;
  title: string;
}

export function MermaidViewer({ path, title }: MermaidViewerProps) {
  const [source, setSource] = useState("");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showSource, setShowSource] = useState(false);
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
  const filename = path.split("/").pop() || path;

  const fetchAndRender = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(assetUrl);
      if (!res.ok) throw new Error("Failed to fetch file");
      const text = await res.text();
      setSource(text);

      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
        securityLevel: "loose",
        suppressErrorRendering: true,
      });

      // Validate syntax first to avoid mermaid injecting error SVGs into the DOM
      await mermaid.parse(text.trim());

      const id = `mermaid-${++renderIdRef.current}`;
      const { svg: rendered } = await mermaid.render(id, text.trim());
      setSvg(rendered);
    } catch (err) {
      // Clean up any error elements mermaid may have injected into the DOM
      document.querySelectorAll('[id^="dmermaid-"], [id^="d"]:has(> .error-icon)').forEach(el => el.remove());
      setError(err instanceof Error ? err.message : "Failed to render diagram");
    } finally {
      setLoading(false);
    }
  }, [assetUrl]);

  useEffect(() => {
    void fetchAndRender();
  }, [fetchAndRender]);

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
    <div className="flex-1 flex flex-col overflow-hidden">
      <ViewerToolbar path={path} badge="MERMAID">
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 text-xs ${showSource ? "bg-muted" : ""}`}
          onClick={() => setShowSource((v) => !v)}
        >
          {showSource ? <Eye className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
          {showSource ? "Diagram" : "Code"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={copySource}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {svg && !showSource && (
          <>
            <div className="h-4 w-px bg-border mx-0.5" />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={zoomOut} title="Zoom out">
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-center select-none">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={zoomIn} title="Zoom in">
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={resetView} title="Reset view">
              <Maximize className="h-3.5 w-3.5" />
            </Button>
            <div className="h-4 w-px bg-border mx-0.5" />
          </>
        )}
        {svg && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={downloadSvg}
          >
            <Download className="h-3.5 w-3.5" />
            SVG
          </Button>
        )}
      </ViewerToolbar>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Rendering diagram...
          </div>
        ) : showSource ? (
          <pre className="p-4 text-[13px] leading-relaxed font-mono bg-[#1e1e1e]">
            <code>
              {source.split("\n").map((line, i) => (
                <div key={i} className="flex">
                  <span className="inline-block w-12 pr-4 text-right text-[#858585] select-none shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-[#d4d4d4] flex-1">{line || "\n"}</span>
                </div>
              ))}
            </code>
          </pre>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-sm p-8">
            <div className="flex flex-col items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <Code2 className="h-5 w-5 text-red-500" />
              </div>
              <p className="text-red-500 font-medium">Diagram syntax error</p>
            </div>
            <pre className="text-muted-foreground text-xs max-w-lg text-left bg-muted/50 rounded-md p-3 overflow-auto whitespace-pre-wrap">{error}</pre>
            <Button variant="outline" size="sm" onClick={() => setShowSource(true)}>
              View source to fix
            </Button>
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
    </div>
  );
}

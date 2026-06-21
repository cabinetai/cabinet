"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Download, Code2, Eye, Save, AlertCircle, Loader2, RefreshCw, Columns2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";

interface TypstViewerProps {
  path: string;
  title?: string;
}

export function TypstViewer({ path }: TypstViewerProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  // splitMode controls side-by-side split screen. Defaults to true.
  const [splitMode, setSplitMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("typst-editor-split-mode");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });

  // viewMode controls single-panel view when splitMode is false:
  // "source" (edit only) or "preview" (compiled PDF only)
  const [viewMode, setViewMode] = useState<"source" | "preview">("source");

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const editContentRef = useRef<string>("");
  const compileTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const assetUrl = `/api/assets/${path.split("/").map(encodeURIComponent).join("/")}`;
  const filename = path.split("/").pop() || path;

  // Compile the Typst source code to a PDF blob
  const compileTypst = useCallback(async (codeToCompile: string) => {
    if (!codeToCompile.trim()) return;
    setCompiling(true);
    setCompileError(null);
    try {
      const res = await fetch("/api/export/typst/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeToCompile }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const newUrl = URL.createObjectURL(blob);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return newUrl;
      });
    } catch (e: any) {
      setCompileError(e.message || "Failed to compile Typst document");
    } finally {
      setCompiling(false);
    }
  }, []);

  // Fetch file content on load
  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(assetUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setContent(text);
      editContentRef.current = text;
      void compileTypst(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load .typ file");
    } finally {
      setLoading(false);
    }
  }, [assetUrl, compileTypst]);

  useEffect(() => {
    void fetchContent();
    return () => {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [fetchContent]);

  // Debounced compilation when user edits source
  const handleSourceChange = (val: string) => {
    editContentRef.current = val;
    
    if (compileTimeoutRef.current) {
      clearTimeout(compileTimeoutRef.current);
    }
    
    // Compile 500ms after typing stops
    compileTimeoutRef.current = setTimeout(() => {
      void compileTypst(val);
    }, 500);
  };

  // Toggle split screen mode
  const toggleSplitMode = () => {
    const val = !splitMode;
    setSplitMode(val);
    localStorage.setItem("typst-editor-split-mode", String(val));
  };

  // Save changes to disk
  const handleSave = useCallback(async () => {
    const newContent = editContentRef.current;
    if (newContent === content) return;
    
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
      setContent(newContent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [content, path, assetUrl]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ViewerToolbar path={path} badge="TYPST" sublabel={filename}>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={saving || content === editContentRef.current}
          className="gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSplitMode}
          className={`gap-1.5 ${splitMode ? "bg-accent text-foreground" : "text-muted-foreground"}`}
          title="Toggle Split Screen"
        >
          <Columns2 className="h-3.5 w-3.5" />
          Split Screen
        </Button>

        {!splitMode && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("source")}
              className={`gap-1.5 ${viewMode === "source" ? "bg-accent text-foreground" : "text-muted-foreground"}`}
            >
              <Code2 className="h-3.5 w-3.5" />
              Source
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("preview")}
              className={`gap-1.5 ${viewMode === "preview" ? "bg-accent text-foreground" : "text-muted-foreground"}`}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => void fetchContent()}
          disabled={loading || compiling}
          className="gap-1.5"
          title="Reload file from disk"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${(loading || compiling) ? "animate-spin" : ""}`} />
          Refresh
        </Button>

        <a
          href={assetUrl}
          download={filename}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </ViewerToolbar>

      {error && (
        <div className="flex items-center justify-center p-4 bg-red-50 text-red-700 border-b border-red-100 text-sm gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Typst file…
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: SOURCE CODE EDITOR */}
          {(splitMode || viewMode === "source") && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <textarea
                defaultValue={content}
                onChange={(e) => handleSourceChange(e.target.value)}
                onBlur={handleSave}
                spellCheck={false}
                className="w-full h-full bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-100 outline-none resize-none"
                style={{ minHeight: "100%" }}
              />
            </div>
          )}

          {/* RIGHT: PDF PREVIEW */}
          {(splitMode || viewMode === "preview") && (
            <div className="flex-1 flex flex-col overflow-hidden border-l border-border bg-zinc-100 dark:bg-zinc-900 relative">
              {compiling && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-background/80 backdrop-blur px-2.5 py-1 rounded-md text-[11px] text-muted-foreground shadow-sm z-10">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  Compiling…
                </div>
              )}
              {compileError ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-sm text-amber-700 dark:text-amber-400 gap-2 overflow-y-auto">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p className="font-semibold">Compilation Error</p>
                  <p className="max-w-md text-xs font-mono text-left bg-muted p-3 rounded-md border border-border mt-2 whitespace-pre-wrap">
                    {compileError}
                  </p>
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  className="w-full h-full border-none"
                  title="Typst PDF Preview"
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  Waiting for compilation output…
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

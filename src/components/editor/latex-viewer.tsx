"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Editor, { loader } from "@monaco-editor/react";
import { useTheme } from "@/components/theme-provider";
import { useEditorSettings } from "@/hooks/use-editor-settings";

if (typeof window !== "undefined") {
  loader.config({ paths: { vs: "/monaco/vs" } });
}

import { ExternalLink, Download, Eye, Save, AlertCircle, Loader2, Info, RefreshCw, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { renderLatexToHtml } from "./latex-render";
import { SplitScreenIcon } from "./editor-toolbar";
import { useSplitResize } from "@/hooks/use-split-resize";
import { SplitRuler } from "./split-ruler";

interface LatexViewerProps {
  path: string;
  title?: string;
}

type ViewMode = "rendered" | "source";

export function LatexViewer({ path }: LatexViewerProps) {
  const { resolvedTheme } = useTheme();
  const settings = useEditorSettings();
  const [content, setContent] = useState("");
  const [localContent, setLocalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("rendered");
  const [splitMode, setSplitMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const split = useSplitResize("kb-latex-viewer-split-ratio");

  const editContentRef = useRef<string>("");
  const [previewContent, setPreviewContent] = useState("");
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const rendered = useMemo(() => (previewContent ? renderLatexToHtml(previewContent) : null), [previewContent]);

  const assetUrl = `/api/assets/${path.split("/").map(encodeURIComponent).join("/")}`;
  const filename = path.split("/").pop() || path;

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `no-store` prevents the browser from serving a stale copy when the
      // file is replaced at the same path (the asset URL doesn't change).
      const res = await fetch(assetUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setContent(text);
      setLocalContent(text);
      setPreviewContent(text);
      editContentRef.current = text;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load .tex file");
    } finally {
      setLoading(false);
    }
  }, [assetUrl]);

  useEffect(() => {
    void fetchContent();
  }, [fetchContent]);

  useEffect(() => {
    setMode("rendered");
    setSplitMode(false);
  }, [path]);

  // Re-fetch when the user returns to the window/tab — picks up a file that
  // was replaced on disk while this viewer stayed mounted on the same path.
  // Skip while editing source so we never clobber unsaved changes.
  useEffect(() => {
    if (mode === "source" || splitMode) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") void fetchContent();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [fetchContent, mode, splitMode]);

  const handleSourceChange = (val: string) => {
    editContentRef.current = val;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      setPreviewContent(val);
    }, 300);
  };

  const handleSave = useCallback(async () => {
    const newContent = editContentRef.current;
    if (newContent === content) {
      return;
    }
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
      setLocalContent(newContent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [content, path, assetUrl]);

  return (
    <ViewerLayout
      toolbar={
        <ViewerToolbar path={path} badge="TEX" sublabel={filename}>
        {(splitMode || mode === "source") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={saving || content === editContentRef.current}
            className="h-7 w-7 p-0"
            title={saving ? "Saving…" : "Save"}
          >
            <Save className="h-3.5 w-3.5" />
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
              className="h-7 w-7 p-0"
              title="Preview"
            >
              <Eye className="h-3.5 w-3.5" />
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

        {(splitMode || mode === "rendered") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchContent()}
            disabled={loading}
            className="h-7 w-7 p-0"
            title="Reload the file from disk"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        )}
        <a
          href={assetUrl}
          download={filename}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
        <a
          href={assetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </ViewerToolbar>
      }
    >

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading LaTeX…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-sm text-red-600 dark:text-red-400 gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : (
          <div ref={split.containerRef} className="relative flex-1 flex h-full overflow-hidden">
            {/* LEFT: SOURCE CODE EDITOR */}
            {(splitMode || mode === "source") && (
              <div
                className="flex flex-col overflow-hidden min-w-0 animate-in fade-in duration-200"
                style={splitMode ? { width: `${split.leftPct}%`, flex: "none" } : { flex: "1 1 0%" }}
              >
                <Editor
                  height="100%"
                  language="latex"
                  theme={settings.theme === "app" ? (resolvedTheme === "dark" ? "vs-dark" : "light") : settings.theme}
                  value={localContent}
                  onChange={(val) => {
                    const value = val || "";
                    setLocalContent(value);
                    handleSourceChange(value);
                  }}
                  onMount={(editor, monaco) => {
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                      void handleSave();
                    });
                  }}
                  options={{
                    minimap: { enabled: true },
                    fontFamily: settings.fontFamily,
                    fontSize: settings.fontSize,
                    fontLigatures: settings.fontLigatures,
                    lineHeight: settings.lineHeight,
                    fontWeight: settings.fontWeight,
                    wordWrap: "on",
                    automaticLayout: true,
                  }}
                />
              </div>
            )}

            {/* Divider */}
            {splitMode && (
              <div
                role="separator"
                aria-orientation="vertical"
                onPointerDown={split.startResize}
                onDoubleClick={split.resetWidth}
                className="relative w-px shrink-0 cursor-col-resize bg-border before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:content-[''] hover:bg-primary/50"
              />
            )}

            {/* RIGHT: RENDERED PREVIEW */}
            {(splitMode || mode === "rendered") && (
              <div className="flex-1 min-w-0 overflow-auto bg-background animate-in fade-in duration-200">
                {rendered && rendered.ok ? (
                  <div className="mx-auto max-w-3xl px-6 py-8">
                    {rendered.unsupported.length > 0 && (
                      <div className="mb-6 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <div>
                          <span className="font-medium">Some LaTeX features aren&apos;t supported by the preview</span> and were
                          approximated or skipped:{" "}
                          <span className="font-mono">{rendered.unsupported.slice(0, 12).join(", ")}</span>
                          {rendered.unsupported.length > 12 ? ` (+${rendered.unsupported.length - 12} more)` : ""}.
                        </div>
                      </div>
                    )}
                    <article
                      className="latex-rendered prose prose-zinc max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: rendered.html }}
                    />
                  </div>
                ) : (
                  <div className="flex h-full flex-col">
                    <div className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <span className="font-medium">This document couldn&apos;t be rendered.</span> It likely uses LaTeX
                        packages or macros the in-app preview doesn&apos;t support
                        {rendered && rendered.unsupported.length > 0 ? (
                          <>
                            {" "}(<span className="font-mono">{rendered.unsupported.slice(0, 8).join(", ")}</span>)
                          </>
                        ) : null}
                        . Showing the source instead.
                      </div>
                    </div>
                    <pre className="flex-1 overflow-auto bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-100">
                      {previewContent}
                    </pre>
                  </div>
                )}
              </div>
            )}
            {/* Drag ruler */}
            {splitMode && split.resizing && (
              <SplitRuler leftPct={split.leftPct} />
            )}
          </div>
        )}
      </div>
    </ViewerLayout>
  );
}

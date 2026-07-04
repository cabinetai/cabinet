"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { ExternalLink, Download, Code2, Eye, Save, AlertCircle, Loader2, Info, RefreshCw } from "lucide-react";
import { ToolbarButton } from "@/components/layout/toolbar-button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { renderLatexToHtml } from "./latex-render";

interface LatexViewerProps {
  path: string;
  title?: string;
}

type ViewMode = "rendered" | "source";

export function LatexViewer({ path }: LatexViewerProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  // Load failures block the viewer (there's nothing to show); save failures
  // must NOT — the editor has to stay open so the user can retry/copy.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("rendered");
  const [saving, setSaving] = useState(false);

  const editContentRef = useRef<string>("");
  // Guards against overlapping writes — handleSave can fire from both the
  // textarea's onBlur and the toolbar button click at nearly the same time.
  const savingRef = useRef(false);

  const rendered = useMemo(() => (content ? renderLatexToHtml(content) : null), [content]);

  const assetUrl = `/api/assets/${path.split("/").map(encodeURIComponent).join("/")}`;
  const filename = path.split("/").pop() || path;

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // `no-store` prevents the browser from serving a stale copy when the
      // file is replaced at the same path (the asset URL doesn't change).
      const res = await fetch(assetUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setContent(text);
      editContentRef.current = text;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load .tex file");
    } finally {
      setLoading(false);
    }
  }, [assetUrl]);

  useEffect(() => {
    void fetchContent();
  }, [fetchContent]);

  // Re-fetch when the user returns to the window/tab — picks up a file that
  // was replaced on disk while this viewer stayed mounted on the same path.
  // Skip while editing source so we never clobber unsaved changes.
  useEffect(() => {
    if (mode === "source") return;
    const onFocus = () => {
      if (document.visibilityState === "visible") void fetchContent();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [fetchContent, mode]);

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;
    const newContent = editContentRef.current;
    if (newContent === content) {
      setMode("rendered");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
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
      setMode("rendered");
    } catch (e) {
      // Keep the editor open (mode stays "source") and surface the error as a
      // non-blocking banner so the user can retry without losing their edits.
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [content, path, assetUrl]);

  return (
    <ViewerLayout
      toolbar={
        <ViewerToolbar path={path} badge="TEX" sublabel={filename}>
        <ToolbarButton
          icon={mode === "source" ? Save : Code2}
          label={mode === "source" ? (saving ? "Saving…" : "Save & Render") : "Edit Source"}
          active={mode === "source"}
          disabled={mode === "source" && saving}
          onClick={() => {
            if (mode === "source") {
              handleSave();
            } else {
              setMode("source");
            }
          }}
        />
        {mode === "source" && (
          <ToolbarButton icon={Eye} label="Preview" onClick={() => setMode("rendered")} />
        )}
        {mode === "rendered" && (
          <ToolbarButton
            icon={RefreshCw}
            label="Refresh"
            title="Reload the file from disk"
            disabled={loading}
            onClick={() => void fetchContent()}
          />
        )}
        <ToolbarButton icon={Download} label="Download" iconOnly href={assetUrl} download={filename} />
        <ToolbarButton icon={ExternalLink} label="Open raw" iconOnly href={assetUrl} target="_blank" />
        </ViewerToolbar>
      }
    >
      {saveError && (
        <div className="flex items-start gap-2 border-b border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Couldn&apos;t save: {saveError}</span>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading LaTeX…
          </div>
        ) : loadError ? (
          <div className="flex items-center justify-center h-full text-sm text-red-600 dark:text-red-400 gap-2">
            <AlertCircle className="h-4 w-4" />
            {loadError}
          </div>
        ) : mode === "source" ? (
          <textarea
            defaultValue={content}
            onChange={(e) => {
              editContentRef.current = e.target.value;
            }}
            onBlur={handleSave}
            spellCheck={false}
            className="block w-full h-full bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-100 outline-none resize-none"
            style={{ minHeight: "100%" }}
          />
        ) : rendered && rendered.ok ? (
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
              {content}
            </pre>
          </div>
        )}
      </div>
    </ViewerLayout>
  );
}

"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ExternalLink, Download, WrapText, Copy, Check, Save, Code2, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { common, createLowlight } from "lowlight";
import { toHtml } from "hast-util-to-html";
import { useLocale } from "@/i18n/use-locale";
import { SplitScreenIcon } from "./editor-toolbar";
import { useSplitResize } from "@/hooks/use-split-resize";
import { SplitRuler } from "./split-ruler";

interface SourceViewerProps {
  path: string;
  title: string;
}

const lowlight = createLowlight(common);

const EXT_TO_LANG: Record<string, string> = {
  ".js": "javascript", ".cjs": "javascript", ".mjs": "javascript",
  ".ts": "typescript", ".tsx": "typescript", ".jsx": "javascript",
  ".py": "python", ".rb": "ruby", ".php": "php",
  ".sh": "bash", ".bash": "bash", ".zsh": "bash", ".ps1": "powershell",
  ".css": "css", ".scss": "scss", ".html": "xml",
  ".json": "json", ".jsonc": "json",
  ".yaml": "yaml", ".yml": "yaml", ".toml": "ini", ".ini": "ini",
  ".xml": "xml", ".sql": "sql", ".graphql": "graphql", ".gql": "graphql",
  ".go": "go", ".rs": "rust", ".swift": "swift",
  ".java": "java", ".kt": "kotlin", ".kts": "kotlin",
  ".c": "c", ".cpp": "cpp", ".h": "c",
  ".env": "bash",
  ".txt": "", ".text": "", ".log": "", ".rst": "",
  ".mdx": "markdown",
};

function detectLanguage(filename: string): string {
  const ext = filename.includes(".") ? "." + filename.split(".").pop()!.toLowerCase() : "";
  return EXT_TO_LANG[ext] ?? "";
}

function formatBadge(filename: string): string {
  const ext = filename.includes(".") ? filename.split(".").pop()!.toUpperCase() : "TEXT";
  return ext;
}

export function SourceViewer({ path }: SourceViewerProps) {
  const { t } = useLocale();
  const filename = path.split("/").pop() || path;
  const isHtml = filename.toLowerCase().endsWith(".html");

  const [content, setContent] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sourceMode, setSourceMode] = useState(isHtml);
  const [splitMode, setSplitMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editOverlayRef = useRef<HTMLDivElement | null>(null);
  const split = useSplitResize("kb-source-viewer-split-ratio");

  const assetUrl = `/api/assets/${path}`;
  const language = detectLanguage(filename);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(assetUrl);
      if (res.ok) {
        const text = await res.text();
        setContent(text);
        setRawText(text);
        setDirty(false);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [assetUrl]);

  useEffect(() => {
    void fetchContent();
  }, [fetchContent]);

  const highlightedLines = useMemo(() => {
    if (!content) return [];
    try {
      const tree = language
        ? lowlight.highlight(language, content)
        : lowlight.highlightAuto(content);
      const html = toHtml(tree);
      return html.split("\n");
    } catch {
      return content.split("\n").map((line) =>
        line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      );
    }
  }, [content, language]);

  const editHighlightedLines = useMemo(() => {
    if (!rawText) return [" "];
    try {
      const tree = language
        ? lowlight.highlight(language, rawText)
        : lowlight.highlightAuto(rawText);
      const html = toHtml(tree);
      return html.split("\n");
    } catch {
      return rawText.split("\n").map((line) =>
        line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      );
    }
  }, [rawText, language]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(assetUrl, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: rawText,
      });
      if (!res.ok) {
        throw new Error(`Save failed: ${res.status}`);
      }
      setContent(rawText);
      setDirty(false);
      if (!isHtml) {
        setSourceMode(false);
      }
    } catch {
    }
    setSaving(false);
  };

  const toggleSourceMode = () => {
    if (sourceMode) {
      setSourceMode(false);
      return;
    }
    setRawText(content || "");
    setSourceMode(true);
  };

  const copyToClipboard = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ViewerToolbar path={path} badge={formatBadge(filename)} sublabel={language || undefined}>
        {dirty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        )}
        {isHtml ? (
          <>
            {splitMode ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSplitMode(false)}
                title="Edit Single Page"
                className="h-7 w-7 p-0"
              >
                <FileCode className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSplitMode(true)}
                title="Split Screen"
                className="h-7 w-7 p-0"
              >
                <SplitScreenIcon className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={toggleSourceMode}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md transition-colors border border-border ${
                sourceMode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Code2 className="h-3 w-3" />
              {sourceMode ? "Preview" : "Edit"}
            </button>
            {!sourceMode && (
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 gap-1.5 text-xs ${wrap ? "bg-muted" : ""}`}
                onClick={() => setWrap((v) => !v)}
                title={wrap ? "Disable line wrap" : "Enable line wrap"}
              >
                <WrapText className="h-3.5 w-3.5" />
                Wrap
              </Button>
            )}
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={copyToClipboard}
          title={t("sourceViewer:copyContents")}
        >
          {copied
            ? <Check className="h-3.5 w-3.5 text-green-500" />
            : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => {
            const a = document.createElement("a");
            a.href = assetUrl;
            a.download = filename;
            a.click();
          }}
          title={t("sourceViewer:downloadFile")}
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => window.open(assetUrl, "_blank")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Raw
        </Button>
      </ViewerToolbar>
      <div className="flex-1 flex flex-col min-h-0 source-viewer-code bg-[#1e1e1e]">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading...
          </div>
        ) : isHtml ? (
          <div ref={split.containerRef} className="relative flex-1 flex h-full overflow-hidden">
            {/* LEFT: HTML EDITOR */}
            {(splitMode || sourceMode) && (
              <div
                className="relative h-full min-h-0 overflow-auto p-0 animate-in fade-in duration-200"
                style={splitMode ? { width: `${split.leftPct}%`, flex: "none" } : { flex: "1 1 0%" }}
              >
                <div
                  ref={editOverlayRef}
                  className="pointer-events-none absolute inset-0 overflow-auto"
                >
                  <div className="relative min-h-full">
                    <pre className="absolute inset-y-0 left-0 m-0 w-16 select-none bg-[#1e1e1e] pr-4 text-right font-mono text-[13px] leading-relaxed text-[#858585]">{Array.from({ length: editHighlightedLines.length }, (_, i) => i + 1).join("\n")}</pre>
                    <pre
                      className="m-0 min-h-full whitespace-pre bg-transparent p-0 pl-16 font-mono text-[13px] leading-relaxed text-[#d4d4d4]"
                      dangerouslySetInnerHTML={{ __html: editHighlightedLines.join("\n") }}
                    />
                  </div>
                </div>
                <textarea
                  ref={editInputRef}
                  value={rawText}
                  onChange={(e) => {
                    setRawText(e.target.value);
                    setDirty(true);
                  }}
                  onBlur={handleSave}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                      e.preventDefault();
                      void handleSave();
                    }
                  }}
                  onScroll={(e) => {
                    const target = e.currentTarget;
                    if (editOverlayRef.current) {
                      editOverlayRef.current.scrollTop = target.scrollTop;
                      editOverlayRef.current.scrollLeft = target.scrollLeft;
                    }
                  }}
                  className="absolute inset-y-0 left-16 right-0 z-10 min-h-[calc(100vh-12rem)] resize-none bg-transparent p-0 font-mono text-[13px] leading-relaxed text-transparent caret-[#d4d4d4] focus:outline-none"
                  wrap="off"
                  spellCheck={false}
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

            {/* RIGHT: HTML PREVIEW */}
            {splitMode && (
              <div className="flex-1 flex flex-col overflow-hidden bg-white relative animate-in fade-in duration-200">
                <iframe
                  src={assetUrl}
                  className="w-full h-full border-none bg-white"
                  title="HTML Preview"
                  key={content || ""}
                />
              </div>
            )}
            {/* Drag ruler */}
            {splitMode && split.resizing && (
              <SplitRuler leftPct={split.leftPct} />
            )}
          </div>
        ) : sourceMode ? (
          <div className="relative h-full min-h-0 overflow-auto p-0">
            <div
              ref={editOverlayRef}
              className="pointer-events-none absolute inset-0 overflow-auto"
            >
              <div className="relative min-h-full">
                <pre className="absolute inset-y-0 left-0 m-0 w-16 select-none bg-[#1e1e1e] pr-4 text-right font-mono text-[13px] leading-relaxed text-[#858585]">{Array.from({ length: editHighlightedLines.length }, (_, i) => i + 1).join("\n")}</pre>
                <pre
                  className="m-0 min-h-full whitespace-pre bg-transparent p-0 pl-16 font-mono text-[13px] leading-relaxed text-[#d4d4d4]"
                  dangerouslySetInnerHTML={{ __html: editHighlightedLines.join("\n") }}
                />
              </div>
            </div>
            <textarea
              ref={editInputRef}
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setDirty(true);
              }}
              onScroll={(e) => {
                const target = e.currentTarget;
                if (editOverlayRef.current) {
                  editOverlayRef.current.scrollTop = target.scrollTop;
                  editOverlayRef.current.scrollLeft = target.scrollLeft;
                }
              }}
              className="absolute inset-y-0 left-16 right-0 z-10 min-h-[calc(100vh-12rem)] resize-none bg-transparent p-0 font-mono text-[13px] leading-relaxed text-transparent caret-[#d4d4d4] focus:outline-none"
              wrap="off"
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-[13px] leading-relaxed font-mono">
              <tbody>
                {highlightedLines.map((lineHtml, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="w-12 pr-4 text-right text-[#858585] select-none align-top sticky left-0 bg-[#1e1e1e]">
                      {i + 1}
                    </td>
                    <td
                      className={`text-[#d4d4d4] pl-2 ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}
                      dangerouslySetInnerHTML={{ __html: lineHtml || " " }}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

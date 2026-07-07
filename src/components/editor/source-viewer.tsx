"use client";

import { useEffect, useState, useCallback } from "react";
import { ExternalLink, Download, WrapText, Copy, Check, Save, Code2, FileCode, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { useLocale } from "@/i18n/use-locale";
import Editor, { loader } from "@monaco-editor/react";
import { useTheme } from "@/components/theme-provider";
import { useEditorSettings } from "@/hooks/use-editor-settings";

if (typeof window !== "undefined") {
  loader.config({ paths: { vs: "/monaco/vs" } });
}
import { SplitScreenIcon } from "./editor-toolbar";
import { useSplitResize } from "@/hooks/use-split-resize";
import { SplitRuler } from "./split-ruler";

interface SourceViewerProps {
  path: string;
  title: string;
}

const EXT_TO_LANG: Record<string, string> = {
  ".js": "javascript", ".cjs": "javascript", ".mjs": "javascript",
  ".ts": "typescript", ".tsx": "typescript", ".jsx": "javascript",
  ".py": "python", ".rb": "ruby", ".php": "php",
  ".sh": "bash", ".bash": "bash", ".zsh": "bash", ".ps1": "powershell",
  ".css": "css", ".scss": "scss", ".html": "html",
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
  const { resolvedTheme } = useTheme();
  const settings = useEditorSettings();
  const filename = path.split("/").pop() || path;
  const isHtml = filename.toLowerCase().endsWith(".html");

  const [content, setContent] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sourceMode, setSourceMode] = useState(!isHtml);
  const [splitMode, setSplitMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const split = useSplitResize("kb-source-viewer-split-ratio");

  const assetUrl = `/api/assets/${path.split("/").map(encodeURIComponent).join("/")}`;
  const language = detectLanguage(filename);

  const editorTheme = settings.theme === "app"
    ? (resolvedTheme === "dark" ? "vs-dark" : "light")
    : settings.theme;

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

  useEffect(() => {
    setSourceMode(!isHtml);
    setSplitMode(false);
  }, [path, isHtml]);

  const handleSave = async (valueToSave?: string) => {
    setSaving(true);
    const text = typeof valueToSave === "string" ? valueToSave : rawText;
    try {
      const res = await fetch(assetUrl, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: text,
      });
      if (!res.ok) {
        throw new Error(`Save failed: ${res.status}`);
      }
      setContent(text);
      setRawText(text);
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
            onClick={() => void handleSave()}
            disabled={saving}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        )}
        {isHtml ? (
          <>
            {!splitMode && !sourceMode && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSourceMode(true);
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
                    setSourceMode(true);
                    setSplitMode(true);
                  }}
                  title="Split Screen"
                  className="h-7 w-7 p-0"
                >
                  <SplitScreenIcon className="h-3.5 w-3.5" />
                </Button>
              </>
            )}

            {!splitMode && sourceMode && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSourceMode(false);
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
                    setSourceMode(true);
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
                    setSourceMode(true);
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
                    setSourceMode(false);
                    setSplitMode(false);
                  }}
                  title="Preview Only"
                  className="h-7 w-7 p-0"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </>
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
      <div className={`flex-grow flex flex-col min-h-0 source-viewer-code ${isHtml && !sourceMode && !splitMode ? "bg-transparent" : "bg-background"}`}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading...
          </div>
        ) : isHtml ? (
          <div ref={split.containerRef} className="relative flex-1 flex h-full overflow-hidden">
            {/* LEFT: HTML EDITOR */}
            {(splitMode || sourceMode) && (
              <div
                className="relative h-full min-h-0 overflow-hidden p-0 animate-in fade-in duration-200"
                style={splitMode ? { width: `${split.leftPct}%`, flex: "none" } : { flex: "1 1 0%" }}
              >
                <Editor
                  height="100%"
                  language="html"
                  theme={editorTheme}
                  value={rawText}
                  onChange={(val) => {
                    setRawText(val || "");
                    setDirty(val !== content);
                  }}
                  onMount={(editor, monaco) => {
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                      void handleSave(editor.getValue());
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

            {/* RIGHT: HTML PREVIEW */}
            {(splitMode || !sourceMode) && (
              <div className={`flex-grow flex flex-col min-h-0 bg-transparent relative animate-in fade-in duration-200 ${!splitMode ? "p-4" : "overflow-hidden w-full h-full"}`}>
                <div className={`relative flex-grow flex flex-col min-h-0 bg-transparent w-full h-full ${!splitMode ? "rounded-[20px] overflow-hidden" : ""}`}>
                  <iframe
                    src={assetUrl}
                    className="w-full h-full border-none bg-transparent"
                    title="HTML Preview"
                    key={content || ""}
                  />
                </div>
              </div>
            )}
            {/* Drag ruler */}
            {splitMode && split.resizing && (
              <SplitRuler leftPct={split.leftPct} />
            )}
          </div>
        ) : sourceMode ? (
          <div className="relative h-full min-h-0 overflow-hidden p-0">
            <Editor
              height="100%"
              language={language || "plaintext"}
              theme={editorTheme}
              value={rawText}
              onChange={(val) => {
                setRawText(val || "");
                setDirty(val !== content);
              }}
              onMount={(editor, monaco) => {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                  void handleSave(editor.getValue());
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
        ) : (
          <div className="relative h-full min-h-0 overflow-hidden p-0">
            <Editor
              height="100%"
              language={language || "plaintext"}
              theme={editorTheme}
              value={content || ""}
              options={{
                readOnly: true,
                minimap: { enabled: true },
                fontFamily: settings.fontFamily,
                fontSize: settings.fontSize,
                fontLigatures: settings.fontLigatures,
                lineHeight: settings.lineHeight,
                fontWeight: settings.fontWeight,
                wordWrap: wrap ? "on" : "off",
                automaticLayout: true,
                domReadOnly: true,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

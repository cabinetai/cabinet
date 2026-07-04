"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ExternalLink, Download, WrapText, Copy, Check, Code2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { ToolbarButton } from "@/components/layout/toolbar-button";
import { common, createLowlight } from "lowlight";
import { toHtml } from "hast-util-to-html";
import { useLocale } from "@/i18n/use-locale";
import {
  HTML_VIEW_EVENT,
  getHtmlViewMode,
  isHtmlPath,
  setHtmlViewMode,
  type HtmlViewModeDetail,
} from "@/lib/ui/html-view-mode";

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
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);

  const assetUrl = `/api/assets/${path}`;
  const filename = path.split("/").pop() || path;
  const language = detectLanguage(filename);

  // Lone .html/.htm files can render as a live webpage. The choice persists
  // per-file and can be flipped here or from the sidebar right-click menu.
  const isHtml = isHtmlPath(path);
  const [mode, setMode] = useState<"preview" | "source">(() =>
    isHtml ? getHtmlViewMode(path) : "source"
  );
  useEffect(() => {
    setMode(isHtml ? getHtmlViewMode(path) : "source");
  }, [path, isHtml]);
  useEffect(() => {
    if (!isHtml) return;
    const onExternalChange = (e: Event) => {
      const detail = (e as CustomEvent<HtmlViewModeDetail>).detail;
      if (detail?.path === path) setMode(detail.mode);
    };
    window.addEventListener(HTML_VIEW_EVENT, onExternalChange);
    return () => window.removeEventListener(HTML_VIEW_EVENT, onExternalChange);
  }, [path, isHtml]);
  const showPreview = isHtml && mode === "preview";

  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(assetUrl);
      if (res.ok) {
        const text = await res.text();
        setContent(text);
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
      // Split by newlines while preserving HTML tags that span lines
      return html.split("\n");
    } catch {
      // Fallback: no highlighting
      return content.split("\n").map((line) =>
        line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      );
    }
  }, [content, language]);

  const copyToClipboard = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ViewerLayout
      toolbar={
        <ViewerToolbar path={path} badge={showPreview ? "HTML" : formatBadge(filename)} sublabel={showPreview ? "webpage" : language || undefined}>
        {isHtml && (
          // Source ⇄ Preview segmented toggle for lone HTML files. Persists the
          // choice per-file (and honors the sidebar right-click menu).
          <div className="mr-1 inline-flex items-center rounded-md border border-border p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 gap-1 px-2 text-xs ${showPreview ? "bg-muted text-foreground" : "text-muted-foreground"}`}
              onClick={() => setHtmlViewMode(path, "preview")}
              title="Render as a webpage"
              aria-pressed={showPreview}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 gap-1 px-2 text-xs ${!showPreview ? "bg-muted text-foreground" : "text-muted-foreground"}`}
              onClick={() => setHtmlViewMode(path, "source")}
              title="Show the HTML source"
              aria-pressed={!showPreview}
            >
              <Code2 className="h-3.5 w-3.5" />
              Source
            </Button>
          </div>
        )}
        {!showPreview && (
          <ToolbarButton
            icon={WrapText}
            label="Wrap"
            active={wrap}
            onClick={() => setWrap((v) => !v)}
            title={wrap ? "Disable line wrap" : "Enable line wrap"}
          />
        )}
        {!showPreview && (
          <ToolbarButton
            icon={copied ? Check : Copy}
            label={copied ? "Copied" : "Copy"}
            onClick={copyToClipboard}
            title={t("sourceViewer:copyContents")}
          />
        )}
        <ToolbarButton
          icon={Download}
          label="Download"
          title={t("sourceViewer:downloadFile")}
          onClick={() => {
            const a = document.createElement("a");
            a.href = assetUrl;
            a.download = filename;
            a.click();
          }}
        />
        <ToolbarButton
          icon={ExternalLink}
          label="Raw"
          onClick={() => window.open(assetUrl, "_blank")}
        />
        </ViewerToolbar>
      }
    >
      {showPreview ? (
        <iframe
          src={assetUrl}
          title={filename}
          className="flex-1 w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"
        />
      ) : (
      <div className="flex-1 overflow-auto source-viewer-code bg-[#1e1e1e]">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading...
          </div>
        ) : (
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
        )}
      </div>
      )}
    </ViewerLayout>
  );
}

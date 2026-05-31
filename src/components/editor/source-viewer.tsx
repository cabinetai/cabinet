"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ExternalLink, Download, WrapText, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { common, createLowlight } from "lowlight";
import { toHtml } from "hast-util-to-html";
import { useLocale } from "@/i18n/use-locale";

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
    <div className="flex-1 flex flex-col overflow-hidden">
      <ViewerToolbar path={path} badge={formatBadge(filename)} sublabel={language || undefined}>
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
    </div>
  );
}

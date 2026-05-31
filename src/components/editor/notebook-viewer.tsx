"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ExternalLink, Download, Copy, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { common, createLowlight } from "lowlight";
import { toHtml } from "hast-util-to-html";
import { markdownToHtml } from "@/lib/markdown/to-html";
import { useLocale } from "@/i18n/use-locale";

interface NotebookViewerProps {
  path: string;
  title: string;
}

// Minimal nbformat v4 typing — only what we render.
type StringOrLines = string | string[];

interface NotebookOutputBase {
  output_type: string;
}
interface StreamOutput extends NotebookOutputBase {
  output_type: "stream";
  name: "stdout" | "stderr";
  text: StringOrLines;
}
interface DataOutput extends NotebookOutputBase {
  output_type: "execute_result" | "display_data";
  execution_count?: number | null;
  data: Record<string, StringOrLines>;
}
interface ErrorOutput extends NotebookOutputBase {
  output_type: "error";
  ename: string;
  evalue: string;
  traceback: string[];
}
type NotebookOutput = StreamOutput | DataOutput | ErrorOutput;

interface NotebookCellBase {
  cell_type: "code" | "markdown" | "raw";
  source: StringOrLines;
  metadata?: Record<string, unknown>;
}
interface CodeCell extends NotebookCellBase {
  cell_type: "code";
  execution_count?: number | null;
  outputs?: NotebookOutput[];
}
interface MarkdownCell extends NotebookCellBase {
  cell_type: "markdown";
}
interface RawCell extends NotebookCellBase {
  cell_type: "raw";
}
type NotebookCell = CodeCell | MarkdownCell | RawCell;

interface Notebook {
  cells?: NotebookCell[];
  metadata?: {
    kernelspec?: { name?: string; display_name?: string };
    language_info?: { name?: string };
  };
}

const lowlight = createLowlight(common);

function joinSource(s: StringOrLines): string {
  return Array.isArray(s) ? s.join("") : s ?? "";
}

// Strip ANSI escape sequences from stream output / tracebacks.
// Pure literal regex over control-char range — terse, no eval.
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function highlightCode(code: string, language: string): string {
  try {
    const tree = language
      ? lowlight.highlight(language, code)
      : lowlight.highlightAuto(code);
    return toHtml(tree);
  } catch {
    return code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}

function CellOutput({ output }: { output: NotebookOutput }) {
  const { t } = useLocale();
  if (output.output_type === "stream") {
    const text = stripAnsi(joinSource(output.text));
    const isErr = output.name === "stderr";
    return (
      <pre
        className={`whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed px-4 py-3 rounded-md ${
          isErr
            ? "bg-[rgba(139,46,62,0.06)] text-[#8B2E3E]"
            : "bg-[#F5EEDC] text-[#2A221B]"
        }`}
      >
        {text}
      </pre>
    );
  }

  if (output.output_type === "error") {
    const tb = output.traceback.map(stripAnsi).join("\n");
    return (
      <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed px-4 py-3 rounded-md bg-[rgba(139,46,62,0.08)] text-[#8B2E3E] border border-[rgba(139,46,62,0.18)]">
        <span className="font-semibold">{output.ename}: {output.evalue}</span>
        {tb ? "\n\n" + tb : ""}
      </pre>
    );
  }

  // execute_result | display_data — pick best MIME
  const data = output.data || {};
  if (data["image/png"]) {
    const src = `data:image/png;base64,${joinSource(data["image/png"]).replace(/\s/g, "")}`;
    return <img src={src} alt="output" className="max-w-full rounded-md bg-white p-2" />;
  }
  if (data["image/jpeg"]) {
    const src = `data:image/jpeg;base64,${joinSource(data["image/jpeg"]).replace(/\s/g, "")}`;
    return <img src={src} alt="output" className="max-w-full rounded-md bg-white p-2" />;
  }
  if (data["image/svg+xml"]) {
    const svg = joinSource(data["image/svg+xml"]);
    return (
      <div
        className="max-w-full rounded-md bg-white p-2 overflow-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  if (data["text/html"]) {
    // Sandbox arbitrary HTML (pandas, plotly) so scripts can't escape.
    const html = joinSource(data["text/html"]);
    return (
      <iframe
        srcDoc={`<!doctype html><html><head><base target="_blank"><style>body{margin:0;padding:8px;font-family:-apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif;background:#FFF9E9;color:#2A221B;font-size:13px}table{border-collapse:collapse}th,td{border:1px solid #D4C4B0;padding:4px 8px;text-align:left}thead{background:#EFE5CC}</style></head><body>${html}</body></html>`}
        sandbox="allow-scripts"
        className="w-full bg-[#FFF9E9] rounded-md border border-[#E8DDC5]"
        style={{ height: 360 }}
      />
    );
  }
  if (data["text/plain"]) {
    return (
      <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed px-4 py-3 rounded-md bg-[#F5EEDC] text-[#2A221B]">
        {stripAnsi(joinSource(data["text/plain"]))}
      </pre>
    );
  }
  return null;
}

function CodeCellView({ cell, language }: { cell: CodeCell; language: string }) {
  const source = joinSource(cell.source);
  const html = useMemo(() => highlightCode(source, language), [source, language]);
  const count = cell.execution_count ?? " ";
  const hasOutputs = (cell.outputs?.length ?? 0) > 0;

  return (
    <div className="grid grid-cols-[60px_1fr] gap-3 mb-5">
      <div className="text-right pt-3 select-none font-mono text-[11px] text-[#8B5E3C]">
        In&nbsp;[{count}]:
      </div>
      <div>
        <pre className="whitespace-pre overflow-x-auto font-mono text-[13px] leading-relaxed px-4 py-3 rounded-md bg-[#FFF9E9] border border-[#E8DDC5] text-[#2A221B]">
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>

        {hasOutputs && (
          <div className="mt-2 grid grid-cols-[60px_1fr] gap-3">
            <div className="text-right pt-3 select-none font-mono text-[11px] text-[#8B2E3E]">
              Out[{count}]:
            </div>
            <div className="space-y-2">
              {cell.outputs!.map((output, i) => (
                <CellOutput key={i} output={output} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MarkdownCellView({ cell }: { cell: MarkdownCell }) {
  const [html, setHtml] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    void markdownToHtml(joinSource(cell.source)).then((h) => {
      if (!cancelled) setHtml(h);
    });
    return () => {
      cancelled = true;
    };
  }, [cell.source]);
  return (
    <div
      className="prose prose-sm max-w-none mb-5 px-1 [&_h1]:font-serif [&_h2]:font-serif [&_h3]:font-serif [&_a]:text-[#8B5E3C] [&_a:hover]:underline [&_code]:bg-[#F5EEDC] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[#8B2E3E]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function RawCellView({ cell }: { cell: RawCell }) {
  return (
    <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed px-4 py-3 rounded-md bg-[#F5EEDC] text-[#2A221B] mb-5">
      {joinSource(cell.source)}
    </pre>
  );
}

export function NotebookViewer({ path }: NotebookViewerProps) {
  const { t } = useLocale();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const assetUrl = `/api/assets/${path}`;
  const filename = path.split("/").pop() || path;

  const fetchNotebook = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(assetUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Notebook;
      setNotebook(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notebook");
    } finally {
      setLoading(false);
    }
  }, [assetUrl]);

  useEffect(() => {
    void fetchNotebook();
  }, [fetchNotebook]);

  const language =
    notebook?.metadata?.language_info?.name ||
    notebook?.metadata?.kernelspec?.name ||
    "python";

  const cellCount = notebook?.cells?.length ?? 0;
  const codeCellCount = notebook?.cells?.filter((c) => c.cell_type === "code").length ?? 0;
  const hasAnyOutputs =
    notebook?.cells?.some(
      (c) => c.cell_type === "code" && (c.outputs?.length ?? 0) > 0
    ) ?? false;

  const copyJupyterCommand = () => {
    navigator.clipboard.writeText(`jupyter lab ${path}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ViewerToolbar
        path={path}
        badge="IPYNB"
        sublabel={`${cellCount} cells · ${codeCellCount} code · ${language}`}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={copyJupyterCommand}
          title={t("editorExtras:jupyterLab")}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy run cmd"}
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
          Raw JSON
        </Button>
      </ViewerToolbar>

      <div className="flex-1 overflow-auto bg-[#F5EEDC]">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[#7A6B5D] text-sm">
            Loading notebook…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-[#8B2E3E] text-sm gap-2">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        ) : notebook ? (
          <div className="max-w-[1100px] mx-auto py-8 px-6">
            {!hasAnyOutputs && codeCellCount > 0 && (
              <div className="mb-6 rounded-md border border-[#E8DDC5] bg-[#FFF9E9] px-4 py-3 text-[13px] text-[#7A6B5D]">
                <span className="font-semibold text-[#2A221B]">
                  This notebook hasn&apos;t been run yet.
                </span>{" "}
                Code and markdown cells display below; outputs appear once the
                author runs the notebook in Jupyter (or you do, then re-save).
              </div>
            )}

            {notebook.cells?.map((cell, i) => {
              if (cell.cell_type === "markdown")
                return <MarkdownCellView key={i} cell={cell} />;
              if (cell.cell_type === "raw")
                return <RawCellView key={i} cell={cell} />;
              return <CodeCellView key={i} cell={cell} language={language} />;
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

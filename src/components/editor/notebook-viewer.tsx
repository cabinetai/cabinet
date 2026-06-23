"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ExternalLink, Download, Copy, Check, AlertCircle, Save, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { common, createLowlight } from "lowlight";
import { toHtml } from "hast-util-to-html";
import { markdownToHtml } from "@/lib/markdown/to-html";
import { useLocale } from "@/i18n/use-locale";
import {
  type Notebook,
  type NotebookCell as NbCell,
  type CodeCell,
  type MarkdownCell,
  type RawCell,
  type NotebookOutput,
  joinSource,
  stripAnsi,
} from "@/lib/notebook/types";
import {
  CodeOutput,
  DataFrame,
  PlotlyChart,
  ImageOutput,
  ErrorOutput,
} from "@/components/notebook/notebook-components";

interface NotebookViewerProps {
  path: string;
  title: string;
}

const lowlight = createLowlight(common);

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

/** Render a code block with syntax highlighting. */
function CodeBlockView({ code, language }: { code: string; language: string }) {
  const html = useMemo(() => highlightCode(code, language), [code, language]);
  return (
    <pre className="whitespace-pre-wrap wrap-break-word font-mono text-[13px] leading-relaxed px-4 py-3 rounded-md bg-[#FFF9E9] border border-[#E8DDC5] text-[#2A221B]">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

/** Editable code cell — textarea with auto-resize. */
function EditableCodeCell({
  code,
  onChange,
}: {
  code: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const adjustHeight = () => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };
  useEffect(adjustHeight, [code]);
  return (
    <textarea
      ref={ref}
      value={code}
      onChange={(e) => {
        onChange(e.target.value);
        adjustHeight();
      }}
      spellCheck={false}
      className="w-full font-mono text-[13px] leading-relaxed px-4 py-3 rounded-md bg-[#FFF9E9] border border-[#E8DDC5] text-[#2A221B] outline-none focus:ring-2 focus:ring-[#8B5E3C]/30 resize-none overflow-hidden"
    />
  );
}

/**
 * Preprocess notebook markdown cell source for preview rendering:
 * 1. Extract YAML frontmatter (--- delimited block at the start) and wrap
 *    it in a ```yaml code fence so remark doesn't interpret `---` as a
 *    thematic break.
 * 2. Convert single newlines to markdown hard breaks (two trailing spaces +
 *    newline) so consecutive lines render as separate lines in the preview,
 *    matching the expectation for notebook markdown cells. Skips code fences
 *    and blank-line paragraph breaks.
 */
function preprocessNotebookMarkdown(source: string): string {
  let md = source;
  let frontmatter = "";

  // Extract YAML frontmatter
  const fmMatch = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  if (fmMatch) {
    frontmatter = "```yaml\n" + fmMatch[1] + "\n```\n\n";
    md = md.slice(fmMatch[0].length);
  }

  // Convert single newlines to hard breaks, but not inside code fences
  // and not when there's already a blank line (paragraph break).
  const lines = md.split("\n");
  const result: string[] = [];
  let inCodeFence = false;
  let fenceChar = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Track code fence state
    if (!inCodeFence && /^(```|~~~)/.test(trimmed)) {
      inCodeFence = true;
      fenceChar = trimmed[0];
      result.push(line);
      continue;
    }
    if (inCodeFence && fenceChar && trimmed.startsWith(fenceChar.repeat(3))) {
      inCodeFence = false;
      result.push(line);
      continue;
    }
    if (inCodeFence) {
      result.push(line);
      continue;
    }

    // Check if this line ends a paragraph (blank line, heading, list item, etc.)
    const isBlockStart = /^(#|>|- |\* |\d+\.|\s*$)/.test(trimmed);
    const nextLine = lines[i + 1];
    const isLastLine = i === lines.length - 1;
    const nextIsBlank = !nextLine || nextLine.trim() === "";
    const nextIsBlockStart = nextLine && /^(#|>|- |\* |\d+\.|```|~~~)/.test(nextLine.trimStart());

    if (isLastLine || isBlockStart || nextIsBlank || nextIsBlockStart) {
      result.push(line);
    } else {
      // Add hard break (two trailing spaces)
      result.push(line.replace(/\s*$/, "") + "  ");
    }
  }

  return frontmatter + result.join("\n");
}

/** Editable markdown cell — textarea with preview toggle. */
function EditableMarkdownCell({
  source,
  onChange,
}: {
  source: string;
  onChange: (value: string) => void;
}) {
  const [preview, setPreview] = useState(false);
  const [html, setHtml] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    const processed = preprocessNotebookMarkdown(source);
    void markdownToHtml(processed).then((h) => {
      if (!cancelled) setHtml(h);
    });
    return () => { cancelled = true; };
  }, [source, preview]);

  const adjustHeight = () => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };
  // Re-run on source changes AND when returning from preview (the textarea is
  // unmounted in preview mode, so it needs its height recalculated on remount).
  useEffect(adjustHeight, [source, preview]);

  if (preview) {
    return (
      <div className="relative mb-5 group">
        <button
          onClick={() => setPreview(false)}
          className="absolute top-2 right-2 z-10 rounded p-1 bg-[#FFF9E9] text-[#7A6B5D] hover:text-[#2A221B] border border-[#E8DDC5] opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <div
          className="prose prose-sm max-w-none px-1 [&_h1]:font-serif [&_h2]:font-serif [&_h3]:font-serif [&_a]:text-[#8B5E3C] [&_a:hover]:underline [&_code]:bg-[#F5EEDC] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[#8B2E3E] [&_pre]:bg-[#FFF9E9] [&_pre]:border [&_pre]:border-[#E8DDC5] [&_pre]:text-[#2A221B] [&_pre_code]:bg-transparent [&_pre_code]:text-[#2A221B] [&_pre_code]:p-0 cursor-pointer"
          dangerouslySetInnerHTML={{ __html: html }}
          onDoubleClick={() => setPreview(false)}
        />
      </div>
    );
  }

  return (
    <div className="relative mb-5">
      <button
        onClick={() => setPreview(true)}
        className="absolute top-2 right-2 z-10 rounded p-1 text-[#7A6B5D] hover:text-[#2A221B] hover:bg-[#E8DDC5]"
        title="Preview"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      <textarea
        ref={ref}
        value={source}
        onChange={(e) => {
          onChange(e.target.value);
          adjustHeight();
        }}
        spellCheck={false}
        className="w-full text-sm leading-relaxed px-4 py-3 pr-10 rounded-md bg-white border border-[#E8DDC5] text-[#2A221B] outline-none focus:ring-2 focus:ring-[#8B5E3C]/30 resize-none overflow-hidden"
      />
    </div>
  );
}

/**
 * Render a single notebook output using the notebook component library.
 * Routes through the same MDX components as the MDAST pipeline.
 */
function CellOutputView({ output }: { output: NotebookOutput }) {
  if (output.output_type === "stream") {
    return (
      <CodeOutput
        type="stream"
        name={output.name}
        text={stripAnsi(joinSource(output.text))}
      />
    );
  }
  if (output.output_type === "error") {
    return (
      <ErrorOutput
        ename={output.ename}
        evalue={output.evalue}
        traceback={output.traceback.map(stripAnsi).join("\n")}
      />
    );
  }
  const data = output.data || {};
  const plotlyData = data["application/vnd.plotly.v1+json"];
  let plotlySpec: string | null = null;
  if (plotlyData) {
    try {
      plotlySpec = JSON.stringify(JSON.parse(joinSource(plotlyData)));
    } catch { /* fall through */ }
  }
  if (plotlySpec) return <PlotlyChart data={plotlySpec} />;
  const htmlData = data["text/html"];
  if (htmlData) {
    const html = joinSource(htmlData);
    if (html.includes("<table") && html.includes("dataframe"))
      return <DataFrame html={html} />;
    return <CodeOutput type="html" html={html} />;
  }
  if (data["image/png"])
    return <ImageOutput mime="image/png" src={joinSource(data["image/png"]).replace(/\s/g, "")} />;
  if (data["image/jpeg"])
    return <ImageOutput mime="image/jpeg" src={joinSource(data["image/jpeg"]).replace(/\s/g, "")} />;
  if (data["image/svg+xml"])
    return <ImageOutput mime="image/svg+xml" data={joinSource(data["image/svg+xml"])} />;
  if (data["text/plain"])
    return <CodeOutput type="text" text={stripAnsi(joinSource(data["text/plain"]))} />;
  return null;
}

/** Render a code cell with edit mode and outputs. */
function CodeCellView({
  cell,
  language,
  onEdit,
}: {
  cell: CodeCell;
  language: string;
  onEdit: (source: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const source = joinSource(cell.source);
  const count = cell.execution_count ?? " ";
  const hasOutputs = (cell.outputs?.length ?? 0) > 0;

  return (
    <div className="mb-5">
      <div className="grid grid-cols-[60px_1fr] gap-3">
        <div className="text-right pt-3 select-none font-mono text-[11px] text-[#8B5E3C]">
          In&nbsp;[{count}]:
        </div>
        <div className="min-w-0">
          <div className="relative group">
            {editing ? (
              <EditableCodeCell
                code={source}
                onChange={onEdit}
              />
            ) : (
              <div
                className="cursor-pointer"
                onDoubleClick={() => setEditing(true)}
              >
                <CodeBlockView code={source} language={language} />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditing(true)}
                    className="rounded p-1 bg-[#FFF9E9] text-[#7A6B5D] hover:text-[#2A221B] border border-[#E8DDC5]"
                    title="Edit cell"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
            {editing && (
              <button
                onClick={() => setEditing(false)}
                className="absolute top-2 right-2 z-10 rounded p-1 bg-[#FFF9E9] text-[#7A6B5D] hover:text-[#2A221B] border border-[#E8DDC5]"
                title="Done editing"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {hasOutputs && (
        <div className="mt-2 grid grid-cols-[60px_1fr] gap-3">
          <div className="text-right pt-3 select-none font-mono text-[11px] text-[#8B2E3E]">
            Out[{count}]:
          </div>
          <div className="min-w-0 space-y-2">
            {cell.outputs!.map((output, i) => (
              <CellOutputView key={i} output={output} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Render a markdown cell with edit/preview toggle. */
function MarkdownCellView({
  cell,
  onEdit,
}: {
  cell: MarkdownCell;
  onEdit: (source: string) => void;
}) {
  return <EditableMarkdownCell source={joinSource(cell.source)} onChange={onEdit} />;
}

/** Render a raw cell as read-only. */
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
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
      setDirty(false);
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
  const codeCellCount =
    notebook?.cells?.filter((c) => c.cell_type === "code").length ?? 0;
  const hasAnyOutputs =
    notebook?.cells?.some(
      (c) => c.cell_type === "code" && (c.outputs?.length ?? 0) > 0
    ) ?? false;

  const updateCellSource = (index: number, source: string) => {
    setNotebook((prev) => {
      if (!prev?.cells) return prev;
      const cells = [...prev.cells];
      const cell = cells[index];
      if (!cell) return prev;
      cells[index] = { ...cell, source } as NbCell;
      return { ...prev, cells };
    });
    setDirty(true);
  };

  const saveNotebook = async () => {
    if (!notebook) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(assetUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notebook, null, 1),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDirty(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

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
        {dirty && (
          <span className="text-xs text-amber-600 mr-1">●</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={saveNotebook}
          disabled={!dirty || saving}
          title="Save notebook"
        >
          {saving ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </Button>
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
          <div className="max-w-275 mx-auto py-8 px-6">
            {saveError && (
              <div className="mb-4 rounded-md border border-[rgba(139,46,62,0.18)] bg-[rgba(139,46,62,0.06)] px-4 py-2 text-sm text-[#8B2E3E]">
                Save error: {saveError}
              </div>
            )}
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
                return (
                  <MarkdownCellView
                    key={i}
                    cell={cell}
                    onEdit={(src) => updateCellSource(i, src)}
                  />
                );
              if (cell.cell_type === "raw")
                return <RawCellView key={i} cell={cell} />;
              return (
                <CodeCellView
                  key={i}
                  cell={cell}
                  language={language}
                  onEdit={(src) => updateCellSource(i, src)}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

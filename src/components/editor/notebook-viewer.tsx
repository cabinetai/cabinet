"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Download,
  Copy,
  Check,
  AlertCircle,
  Save,
  Pencil,
  Eye,
  EyeOff,
  Play,
  RefreshCw,
  Square,
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  LayoutGrid,
  Columns,
  Share2,
  FileText,
  ChevronDown,
  Code2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { common, createLowlight } from "lowlight";
import { toHtml } from "hast-util-to-html";
import { markdownToHtml } from "@/lib/markdown/to-html";
import katex from "katex";
import "../notebook/notebook-preview-styles.css";
import { useSplitResize } from "@/hooks/use-split-resize";
import { SplitRuler } from "./split-ruler";
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface JupyterMessage {
  header: { msg_type: string };
  parent_header?: { msg_id?: string };
  content: {
    text?: string | string[];
    name?: string;
    data?: Record<string, string | string[]>;
    execution_count?: number | null;
    ename?: string;
    evalue?: string;
    traceback?: string[];
    execution_state?: string;
  };
}

interface JupyterSession {
  path?: string;
  kernel: { id: string };
}

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

/** Helper to render LaTeX math segments in HTML output */
function renderMathInHtml(html: string): string {
  if (!html) return html;
  
  // 1. Render display math: $$ ... $$
  let rendered = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `<code class="latex-math-error">${math}</code>`;
    }
  });

  // 2. Render inline math: $ ... $ (avoiding double matching)
  rendered = rendered.replace(/\$([^$\n]+?)\$/g, (orig, math) => {
    if (math.includes("class=\"katex\"") || math.includes("class='katex'")) {
      return orig;
    }
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `<code class="latex-math-error">${math}</code>`;
    }
  });

  return rendered;
}

const PREVIEW_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&display=swap');
.preview-container { font-variant-ligatures: common-ligatures; margin: 0 auto; max-width: 100%; box-sizing: border-box; overflow-x: auto; overflow-y: hidden; background-color: #F5F2EB; }
.preview-container pre, .code-cell-preview pre { background-color: #1e293b !important; color: #f8fafc !important; border: 1px solid #334155 !important; border-radius: 6px !important; font-family: "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; font-size: 10pt !important; padding: 12px 16px !important; margin: 1.25rem 0 !important; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow-x: hidden !important; white-space: pre-wrap !important; overflow-wrap: break-word !important; }
.preview-container code, .code-cell-preview code { font-family: "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; font-size: 10pt !important; background: transparent !important; color: inherit !important; padding: 0 !important; border-radius: 0 !important; white-space: pre-wrap !important; overflow-wrap: break-word !important; }
.preview-container pre code .hljs-keyword, .preview-container pre code .hljs-selector-tag, .preview-container pre code .hljs-built_in, .code-cell-preview pre code .hljs-keyword, .code-cell-preview pre code .hljs-selector-tag, .code-cell-preview pre code .hljs-built_in { color: #38bdf8 !important; font-weight: 600; }
.preview-container pre code .hljs-string, .preview-container pre code .hljs-attr, .code-cell-preview pre code .hljs-string, .code-cell-preview pre code .hljs-attr { color: #34d399 !important; }
.preview-container pre code .hljs-number, .preview-container pre code .hljs-literal, .code-cell-preview pre code .hljs-number, .code-cell-preview pre code .hljs-literal { color: #fb923c !important; }
.preview-container pre code .hljs-comment, .code-cell-preview pre code .hljs-comment { color: #64748b !important; font-style: italic; }
.preview-container pre code .hljs-function, .preview-container pre code .hljs-title, .code-cell-preview pre code .hljs-function, .code-cell-preview pre code .hljs-title { color: #818cf8 !important; }
.preview-container pre code .hljs-type, .preview-container pre code .hljs-class, .code-cell-preview pre code .hljs-type, .code-cell-preview pre code .hljs-class { color: #2dd4bf !important; }
.preview-container pre code .hljs-params, .preview-container pre code .hljs-variable, .code-cell-preview pre code .hljs-params, .code-cell-preview pre code .hljs-variable { color: #cbd5e1 !important; }
.preview-container pre code .hljs-meta, .code-cell-preview pre code .hljs-meta { color: #f43f5e !important; }
.preview-substack { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.62; font-size: 17px; padding: 2rem 1.5rem; max-width: 720px; color: #292929; background: #F5F2EB; }
.preview-substack h1, .preview-substack h2, .preview-substack h3 { font-family: Georgia, Cambria, "Times New Roman", Times, serif; font-weight: 700; color: #1a1a1a; margin-top: 1.8rem; margin-bottom: 0.8rem; line-height: 1.25; }
.preview-substack h1 { font-size: 32px; letter-spacing: -0.015em; }
.preview-substack h2 { font-size: 24px; }
.preview-substack p { margin-bottom: 1.25rem; }
.preview-substack a { color: #ff6719; text-decoration: underline; text-underline-offset: 3px; }
.preview-substack blockquote { border-left: 3px solid #1a1a1a; padding-left: 1.25rem; font-style: italic; font-size: 19px; color: #555555; margin: 1.5rem 0; }
.preview-substack code { background: #f3f3f3; color: #e01e5a; padding: 0.15em 0.3em; border-radius: 3px; }
.preview-substack pre { background-color: #f8f9fa; border: 1px solid #e1e4e8; border-radius: 4px; padding: 1rem; overflow-x: hidden; white-space: pre-wrap; overflow-wrap: break-word; margin: 1.5rem 0; }

.preview-medium { font-family: Georgia, Cambria, "Times New Roman", Times, serif; line-height: 1.58; font-size: 18px; padding: 2.5rem 2rem; max-width: 680px; color: #292929; background: #F5F2EB; }
.preview-medium h1, .preview-medium h2, .preview-medium h3 { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-weight: 700; color: #292929; line-height: 1.15; letter-spacing: -0.02em; margin-top: 2rem; margin-bottom: 0.75rem; }
.preview-medium h1 { font-size: 34px; }
.preview-medium h2 { font-size: 26px; }
.preview-medium p { margin-bottom: 1.5rem; }
.preview-medium a { color: #1a8917; text-decoration: underline; }
.preview-medium blockquote { border-left: 3px solid #292929; padding-left: 1.5rem; font-style: italic; color: #666666; margin: 1.8rem 0; }
.preview-medium code { background-color: rgba(242, 242, 242, 1); color: rgba(41, 41, 41, 1); padding: 2px 4px; }
.preview-medium pre { background-color: #f2f2f2; padding: 1.2rem; margin: 1.8rem 0; overflow-x: hidden; white-space: pre-wrap; overflow-wrap: break-word; }

.preview-markdown { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; font-size: 16px; padding: 2rem; max-width: 800px; color: #090909; background: #F5F2EB; }
.preview-markdown h1, .preview-markdown h2 { font-weight: 800; border-bottom: 1px solid #eef0f1; padding-bottom: 0.3em; margin-top: 1.5rem; margin-bottom: 0.75rem; }
.preview-markdown h1 { font-size: 30px; }
.preview-markdown h2 { font-size: 24px; }
.preview-markdown p { margin-bottom: 1rem; }
.preview-markdown a { color: #3b49df; font-weight: 500; }
.preview-markdown blockquote { border-left: 4px solid #d6d6d7; padding-left: 1rem; color: #575757; margin: 1rem 0; }
.preview-markdown code { background: rgba(0, 0, 0, 0.05); padding: 2px 4px; border-radius: 4px; }
.preview-markdown pre { background-color: #0e1117; color: #c9d1d9; border-radius: 6px; padding: 1rem; margin: 1.2rem 0; overflow-x: hidden; white-space: pre-wrap; overflow-wrap: break-word; }

.preview-default { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.7; font-size: 16px; padding: 2.5rem; max-width: 800px; color: #1f2937; background: #F5F2EB; }
.preview-default h1, .preview-default h2 { font-weight: 700; color: #111827; margin-top: 2rem; margin-bottom: 0.75rem; }
.preview-default h1 { font-size: 2.25rem; }
.preview-default h2 { font-size: 1.75rem; }
.preview-default p { margin-bottom: 1.25rem; }
.preview-default a { color: #25633b; }
.preview-default blockquote { border-left: 4px solid #e5e7eb; padding-left: 1.25rem; color: #4b5563; font-style: italic; margin: 1.5rem 0; }
.preview-default code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 0.25rem; font-size: 0.875rem; }
.preview-default pre { background-color: #1f2937; color: #f9fafb; border-radius: 0.5rem; padding: 1.25rem; margin: 1.5rem 0; overflow-x: hidden; white-space: pre-wrap; overflow-wrap: break-word; }
`;

/** Render a code block with syntax highlighting. */
function CodeBlockView({
  code,
  language,
  theme = "parchment",
}: {
  code: string;
  language: string;
  theme?: "parchment" | "slate";
}) {
  const html = useMemo(() => highlightCode(code, language), [code, language]);
  const bgClass =
    theme === "parchment"
      ? "bg-[#FFF9E9] border-[#E8DDC5] text-[#2A221B] dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100"
      : "bg-[#1e293b] border-[#334155] text-[#f8fafc]";

  return (
    <pre
      className={`whitespace-pre-wrap wrap-break-word px-4 py-3 rounded-md border ${bgClass}`}
      style={{
        fontFamily: '"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: "10pt",
        overflowX: "hidden",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word"
      }}
    >
      <code
        dangerouslySetInnerHTML={{ __html: html }}
        style={{
          fontFamily: "inherit",
          fontSize: "inherit",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word"
        }}
      />
    </pre>
  );
}

/** Editable code cell — textarea with auto-resize. */
function EditableCodeCell({
  code,
  onChange,
  onRun,
}: {
  code: string;
  onChange: (value: string) => void;
  onRun?: () => void;
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
      onKeyDown={(e) => {
        if (onRun && e.key === "Enter" && (e.ctrlKey || e.shiftKey)) {
          e.preventDefault();
          onRun();
        }
      }}
      spellCheck={false}
      className="w-full px-4 py-3 rounded-md bg-[#FFF9E9] border border-[#E8DDC5] text-[#2A221B] caret-[#2A221B] dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100 dark:caret-slate-100 outline-none focus:ring-2 focus:ring-[#8B5E3C]/30 resize-none overflow-hidden"
      style={{ fontFamily: '"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: "10pt" }}
    />
  );
}

/** Preprocess notebook markdown cell source for preview rendering */
function preprocessNotebookMarkdown(source: string): string {
  let md = source;
  let frontmatter = "";

  const fmMatch = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  if (fmMatch) {
    frontmatter = "```yaml\n" + fmMatch[1] + "\n```\n\n";
    md = md.slice(fmMatch[0].length);
  }

  const lines = md.split("\n");
  const result: string[] = [];
  let inCodeFence = false;
  let fenceChar = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

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

    const isBlockStart = /^(#|>|- |\* |\d+\.|\s*$)/.test(trimmed);
    const nextLine = lines[i + 1];
    const isLastLine = i === lines.length - 1;
    const nextIsBlank = !nextLine || nextLine.trim() === "";
    const nextIsBlockStart = nextLine && /^(#|>|- |\* |\d+\.|```|~~~)/.test(nextLine.trimStart());

    if (isLastLine || isBlockStart || nextIsBlank || nextIsBlockStart) {
      result.push(line);
    } else {
      result.push(line.replace(/\s*$/, "") + "  ");
    }
  }

  return frontmatter + result.join("\n");
}

/** Editable markdown cell — textarea with preview toggle. */
function EditableMarkdownCell({
  source,
  onChange,
  onDelete,
  preview,
  setPreview,
}: {
  source: string;
  onChange: (value: string) => void;
  onDelete?: () => void;
  preview: boolean;
  setPreview: (preview: boolean) => void;
}) {
  const [html, setHtml] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    const processed = preprocessNotebookMarkdown(source);
    void markdownToHtml(processed).then((h) => {
      if (!cancelled) setHtml(renderMathInHtml(h));
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
  useEffect(adjustHeight, [source, preview]);

  if (preview) {
    return (
      <div className="relative mb-5 group">
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button
            onClick={() => setPreview(false)}
            className="rounded p-1 bg-[#FFF9E9] dark:bg-slate-900 text-[#7A6B5D] hover:text-[#2A221B] dark:hover:text-white border border-[#E8DDC5] dark:border-slate-800"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded p-1 bg-[#FFF9E9] dark:bg-slate-900 text-[#8B2E3E] hover:bg-[rgba(139,46,62,0.06)] border border-[#E8DDC5] dark:border-slate-800"
              title="Delete cell"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div
          className="prose prose-sm max-w-none px-1 dark:prose-invert [&_h1]:font-serif [&_h2]:font-serif [&_h3]:font-serif [&_a]:text-[#8B5E3C] [&_a:hover]:underline [&_code]:bg-[#F5EEDC] dark: [&_code]:dark:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[#8B2E3E] [&_pre]:bg-[#FFF9E9] dark: [&_pre]:dark:bg-slate-900 [&_pre]:border [&_pre]:border-[#E8DDC5] dark: [&_pre]:dark:border-slate-800 [&_pre]:text-[#2A221B] dark: [&_pre]:dark:text-slate-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0 cursor-pointer"
          dangerouslySetInnerHTML={{ __html: html }}
          onDoubleClick={() => setPreview(false)}
        />
      </div>
    );
  }

  return (
    <div className="relative mb-5 group">
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button
          onClick={() => setPreview(true)}
          className="rounded p-1 bg-[#FFF9E9] dark:bg-slate-900 text-[#7A6B5D] hover:text-[#2A221B] dark:hover:text-white border border-[#E8DDC5] dark:border-slate-800"
          title="Preview"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="rounded p-1 bg-[#FFF9E9] dark:bg-slate-900 text-[#8B2E3E] hover:bg-[rgba(139,46,62,0.06)] border border-[#E8DDC5] dark:border-slate-800"
            title="Delete cell"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <textarea
        ref={ref}
        value={source}
        onChange={(e) => {
          onChange(e.target.value);
          adjustHeight();
        }}
        spellCheck={false}
        className="w-full text-sm leading-relaxed px-4 py-3 pr-10 rounded-md bg-white dark:bg-slate-905 border border-[#E8DDC5] dark:border-slate-800 text-[#2A221B] dark:text-slate-100 outline-none focus:ring-2 focus:ring-[#8B5E3C]/30 resize-none overflow-hidden"
      />
    </div>
  );
}

/** Render a single notebook output using the notebook component library. */
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

interface SortableCellWrapperProps {
  id: string;
  children: (props: {
    dragHandleProps: React.HTMLAttributes<HTMLElement>;
    isDragging: boolean;
  }) => React.ReactNode;
}

function SortableCellWrapper({ id, children }: SortableCellWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const dragHandleProps = {
    ...attributes,
    ...listeners,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-50" : ""}>
      {children({ dragHandleProps, isDragging })}
    </div>
  );
}

/** Cell metadata tags editor overlay */
function CellTagsEditor({
  tags,
  onToggleTag,
}: {
  tags: string[];
  onToggleTag: (tag: "hide-input" | "hide-output" | "hide-cell") => void;
}) {
  const hasInput = tags.includes("hide-input");
  const hasOutput = tags.includes("hide-output");
  const hasCell = tags.includes("hide-cell");

  return (
    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onToggleTag("hide-input")}
        className={`h-6 px-2 text-[10px] gap-1 font-medium ${
          hasInput
            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800"
            : "text-muted-foreground hover:bg-[#E8DDC5]/40"
        }`}
        title="Toggle hide code input in preview"
      >
        <Code2 className="h-3 w-3" />
        {hasInput ? "Code Hidden" : "Hide Code"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onToggleTag("hide-output")}
        className={`h-6 px-2 text-[10px] gap-1 font-medium ${
          hasOutput
            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800"
            : "text-muted-foreground hover:bg-[#E8DDC5]/40"
        }`}
        title="Toggle hide output in preview"
      >
        <Play className="h-3 w-3" />
        {hasOutput ? "Output Hidden" : "Hide Output"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onToggleTag("hide-cell")}
        className={`h-6 px-2 text-[10px] gap-1 font-medium ${
          hasCell
            ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-800"
            : "text-muted-foreground hover:bg-[#E8DDC5]/40"
        }`}
        title="Toggle hide entire cell in preview"
      >
        <EyeOff className="h-3 w-3" />
        {hasCell ? "Cell Hidden" : "Hide Cell"}
      </Button>
    </div>
  );
}

/** Render a code cell with edit mode and outputs. */
function CodeCellView({
  cell,
  cellId,
  language,
  onEdit,
  jupyterAvailable,
  runningCellId,
  runCell,
  onDelete,
  dragHandleProps,
  showDragHandle,
  onToggleTag,
}: {
  cell: CodeCell;
  cellId: string;
  language: string;
  onEdit: (source: string) => void;
  jupyterAvailable: boolean;
  runningCellId: string | null;
  runCell: (id: string) => void;
  onDelete?: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLElement>;
  showDragHandle: boolean;
  onToggleTag: (tag: "hide-input" | "hide-output" | "hide-cell") => void;
}) {
  const [editing, setEditing] = useState(false);
  const source = joinSource(cell.source);
  const count = cell.execution_count ?? " ";
  const hasOutputs = (cell.outputs?.length ?? 0) > 0;
  const tags = (cell.metadata?.tags as string[]) || [];

  return (
    <div className="mb-5 border-b border-[#E8DDC5]/30 dark:border-slate-800/30 pb-4">
      <div className="grid grid-cols-[80px_1fr] gap-3">
        <div className="select-none font-mono text-[11px] text-[#8B5E3C] flex flex-col items-end gap-1 pt-1.5 pr-1">
          <div className="flex items-center gap-1">
            {/* Drag Handle - Only shown in Editor Mode */}
            {showDragHandle && (
              <div
                {...dragHandleProps}
                className="p-1 hover:bg-[#E8DDC5] dark:hover:bg-slate-800 rounded text-[#8B5E3C]/50 hover:text-[#2A221B] dark:hover:text-white cursor-grab active:cursor-grabbing transition-colors"
                title="Drag to reorder cell"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </div>
            )}

            {jupyterAvailable ? (
              <div className="flex items-center gap-1">
                {runningCellId === cellId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8B5E3C]" />
                ) : (
                  <button
                    onClick={() => runCell(cellId)}
                    className="p-1 hover:bg-[#E8DDC5] dark:hover:bg-slate-800 hover:text-[#2A221B] dark:hover:text-white rounded text-[#8B5E3C] transition-colors"
                    title="Run cell (Ctrl+Enter)"
                  >
                    <Play className="h-3 w-3 fill-current" />
                  </button>
                )}
                <span className="text-[10px] text-[#8B5E3C]/70 min-w-8 text-left">
                  In [{count}]
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-[#8B5E3C]/70">In [{count}]</span>
            )}
          </div>
          {/* Metadata Indicator Badges */}
          {tags.length > 0 && (
            <div className="flex flex-col gap-0.5 mt-1 items-end">
              {tags.map((t) => (
                <span
                  key={t}
                  className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-sans border border-amber-200 dark:border-amber-900 leading-none"
                >
                  {t.replace("hide-", "no-")}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="relative group">
            {editing ? (
              <EditableCodeCell
                code={source}
                onChange={onEdit}
                onRun={() => runCell(cellId)}
              />
            ) : (
              <div
                className="cursor-pointer"
                onDoubleClick={() => setEditing(true)}
              >
                <CodeBlockView code={source} language={language} />
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={() => setEditing(true)}
                    className="rounded p-1 bg-[#FFF9E9] dark:bg-slate-900 text-[#7A6B5D] hover:text-[#2A221B] dark:hover:text-white border border-[#E8DDC5] dark:border-slate-800"
                    title="Edit cell"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  {onDelete && (
                    <button
                      onClick={onDelete}
                      className="rounded p-1 bg-[#FFF9E9] dark:bg-slate-900 text-[#8B2E3E] hover:bg-[rgba(139,46,62,0.06)] border border-[#E8DDC5] dark:border-slate-800"
                      title="Delete cell"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )}
            {editing && (
              <div className="absolute top-2 right-2 z-10 flex gap-1">
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="rounded p-1 bg-[#FFF9E9] dark:bg-slate-900 text-[#8B2E3E] hover:bg-[rgba(139,46,62,0.06)] border border-[#E8DDC5] dark:border-slate-800"
                    title="Delete cell"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setEditing(false)}
                  className="rounded p-1 bg-[#FFF9E9] dark:bg-slate-900 text-[#7A6B5D] hover:text-[#2A221B] dark:hover:text-white border border-[#E8DDC5] dark:border-slate-800"
                  title="Done editing"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          {/* Tag Visibility Editor */}
          <CellTagsEditor tags={tags} onToggleTag={onToggleTag} />
        </div>
      </div>

      {hasOutputs && (
        <div className="mt-2 grid grid-cols-[80px_1fr] gap-3">
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
  onDelete,
  dragHandleProps,
  preview,
  setPreview,
  showDragHandle,
  onToggleTag,
}: {
  cell: MarkdownCell;
  onEdit: (source: string) => void;
  onDelete?: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLElement>;
  preview: boolean;
  setPreview: (preview: boolean) => void;
  showDragHandle: boolean;
  onToggleTag: (tag: "hide-input" | "hide-output" | "hide-cell") => void;
}) {
  const tags = (cell.metadata?.tags as string[]) || [];
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3 mb-5 border-b border-[#E8DDC5]/30 dark:border-slate-800/30 pb-4">
      <div className="select-none font-mono text-[11px] text-[#8B5E3C] flex flex-col items-end gap-1 pt-2 pr-1">
        <div className="flex items-center gap-1">
          {/* Drag Handle - Only shown in Editor Mode */}
          {showDragHandle && (
            <div
              {...dragHandleProps}
              className="p-1 hover:bg-[#E8DDC5] dark:hover:bg-slate-800 rounded text-[#8B5E3C]/50 hover:text-[#2A221B] dark:hover:text-white cursor-grab active:cursor-grabbing transition-colors"
              title="Drag to reorder cell"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          )}
          <span className="text-[10px] text-[#8B5E3C]/50">M↓</span>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-1 items-end">
            {tags.map((t) => (
              <span
                key={t}
                className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-sans border border-red-200 dark:border-red-900 leading-none"
              >
                hidden
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <EditableMarkdownCell
          source={joinSource(cell.source)}
          onChange={onEdit}
          onDelete={onDelete}
          preview={preview}
          setPreview={setPreview}
        />
        <CellTagsEditor tags={tags} onToggleTag={onToggleTag} />
      </div>
    </div>
  );
}

/** Render a raw cell as read-only. */
function RawCellView({
  cell,
  onDelete,
  dragHandleProps,
  showDragHandle,
  onToggleTag,
}: {
  cell: RawCell;
  onDelete?: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLElement>;
  showDragHandle: boolean;
  onToggleTag: (tag: "hide-input" | "hide-output" | "hide-cell") => void;
}) {
  const tags = (cell.metadata?.tags as string[]) || [];
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3 mb-5 border-b border-[#E8DDC5]/30 dark:border-slate-800/30 pb-4">
      <div className="select-none font-mono text-[11px] text-[#8B5E3C] flex flex-col items-end gap-1 pt-2 pr-1">
        <div className="flex items-center gap-1">
          {/* Drag Handle */}
          {showDragHandle && (
            <div
              {...dragHandleProps}
              className="p-1 hover:bg-[#E8DDC5] dark:hover:bg-slate-800 rounded text-[#8B5E3C]/50 hover:text-[#2A221B] dark:hover:text-white cursor-grab active:cursor-grabbing transition-colors"
              title="Drag to reorder cell"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          )}
          <span className="text-[10px] text-[#8B5E3C]/50">Raw</span>
        </div>
      </div>
      <div className="min-w-0 relative group">
        <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed px-4 py-3 rounded-md bg-[#F5EEDC] dark:bg-slate-900 text-[#2A221B] dark:text-slate-100">
          {joinSource(cell.source)}
        </pre>
        {onDelete && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onDelete}
              className="rounded p-1 bg-[#FFF9E9] dark:bg-slate-900 text-[#8B2E3E] hover:bg-[rgba(139,46,62,0.06)] border border-[#E8DDC5] dark:border-slate-800"
              title="Delete cell"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
        <CellTagsEditor tags={tags} onToggleTag={onToggleTag} />
      </div>
    </div>
  );
}

const generateUuid = () => {
  if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export function NotebookViewer({ path }: NotebookViewerProps) {
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Jupyter Integration State
  const [jupyterAvailable, setJupyterAvailable] = useState(false);
  const [kernelStatus, setKernelStatus] = useState<string>("disconnected");
  const [runningCellId, setRunningCellId] = useState<string | null>(null);

  // Markdown Cell Preview State
  const [markdownPreviews, setMarkdownPreviews] = useState<Record<string, boolean>>({});

  // red-designed split screen modes & templates
  const [viewMode, setViewMode] = useState<"editor" | "split" | "preview">("split");
  const split = useSplitResize("kb-notebook-viewer-split-ratio");
  const [previewTemplate, setPreviewTemplate] = useState<"default" | "substack" | "medium" | "markdown">("default");
  const [globalHideCode, setGlobalHideCode] = useState(false);
  const [globalHideOutput, setGlobalHideOutput] = useState(false);

  const [copiedHTML, setCopiedHTML] = useState(false);
  const [copiedMD, setCopiedMD] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const kernelIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(generateUuid());
  const pendingRequestsRef = useRef<Map<string, (msg: JupyterMessage) => void>>(new Map());
  const activeResolvesRef = useRef<Map<string, () => void>>(new Map());

  // Cached compiled markdown preview HTML blocks for the preview pane
  const [previewHtmls, setPreviewHtmls] = useState<Record<string, string>>({});

  // DnD Kit sensors
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 6,
    },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(pointerSensor, keyboardSensor);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setNotebook((prev) => {
      if (!prev || !prev.cells) return prev;
      const oldIndex = prev.cells.findIndex((cell) => cell.id === active.id);
      const newIndex = prev.cells.findIndex((cell) => cell.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return prev;

      const newCells = arrayMove(prev.cells, oldIndex, newIndex);
      return {
        ...prev,
        cells: newCells,
      };
    });
    setDirty(true);
  };

  const assetUrl = `/api/assets/${path}`;
  const filename = path.split("/").pop() || path;

  // Auto-hide code inputs for Substack/Medium
  useEffect(() => {
    if (previewTemplate === "substack" || previewTemplate === "medium") {
      setGlobalHideCode(true);
    } else {
      setGlobalHideCode(false);
    }
  }, [previewTemplate]);

  // Compile all Markdown cells whenever the notebook changes
  useEffect(() => {
    if (!notebook || !notebook.cells) return;
    
    notebook.cells.forEach((cell) => {
      if (cell.cell_type === "markdown") {
        const sourceStr = joinSource(cell.source);
        const processed = preprocessNotebookMarkdown(sourceStr);
        void markdownToHtml(processed).then((h) => {
          setPreviewHtmls((prev) => ({
            ...prev,
            [cell.id!]: renderMathInHtml(h),
          }));
        });
      }
    });
  }, [notebook]);

  const fetchNotebook = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(assetUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Notebook;
      if (json.cells) {
        json.cells = json.cells.map((cell) => ({
          ...cell,
          id: cell.id || generateUuid(),
        }));
      }
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

  const kernelName = notebook?.metadata?.kernelspec?.name;
  const setupJupyter = useCallback(async () => {
    try {
      const statusRes = await fetch("/api/jupyter/status");
      const statusData = await statusRes.json() as { available: boolean };
      if (!statusData.available) {
        setJupyterAvailable(false);
        return;
      }
      setJupyterAvailable(true);
      setKernelStatus("connecting");

      const sessionsRes = await fetch("/api/jupyter/proxy/api/sessions");
      if (!sessionsRes.ok) throw new Error("Failed to get Jupyter sessions");
      const sessions = await sessionsRes.json() as JupyterSession[];
      
      let session = sessions.find((s) => s.path === path);
      if (!session) {
        const createRes = await fetch("/api/jupyter/proxy/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: {
              path: path,
              type: "notebook",
              name: path.split("/").pop() || "notebook.ipynb",
            },
            kernel: {
              name: kernelName || "python3"
            }
          })
        });
        if (!createRes.ok) throw new Error("Failed to create Jupyter session");
        session = await createRes.json() as JupyterSession;
      }

      const kernelId = session.kernel.id;
      kernelIdRef.current = kernelId;

      const authRes = await fetch("/api/daemon/auth");
      if (!authRes.ok) throw new Error("Failed daemon authentication");
      const { token, wsOrigin } = await authRes.json();

      const wsUrl = `${wsOrigin}/api/daemon/jupyter/ws?token=${token}&kernelId=${kernelId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setKernelStatus("idle");
      };

      ws.onmessage = async (event) => {
        try {
          let textData = "";
          if (event.data instanceof Blob) {
            textData = await event.data.text();
          } else if (typeof event.data === "string") {
            textData = event.data;
          } else {
            textData = new TextDecoder().decode(event.data);
          }

          const msg = JSON.parse(textData);
          const parentMsgId = msg.parent_header?.msg_id;
          
          if (msg.header?.msg_type === "status") {
            setKernelStatus(msg.content.execution_state);
          }

          if (parentMsgId && pendingRequestsRef.current.has(parentMsgId)) {
            const callback = pendingRequestsRef.current.get(parentMsgId);
            if (callback) callback(msg);
          }
        } catch (e) {
          console.error("Error parsing Jupyter message:", e);
        }
      };

      ws.onclose = () => {
        setKernelStatus("disconnected");
      };

      ws.onerror = (err) => {
        console.error("Jupyter kernel WS proxy error:", err);
        setKernelStatus("disconnected");
      };

    } catch (e) {
      console.error("Error setting up Jupyter:", e);
      setKernelStatus("disconnected");
    }
  }, [path, kernelName]);

  const hasNotebook = !!notebook;
  useEffect(() => {
    if (hasNotebook) {
      void setupJupyter();
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [setupJupyter, hasNotebook]);

  const runCell = (cellId: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (!notebook || !notebook.cells || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        resolve();
        return;
      }
      
      const idx = notebook.cells.findIndex((c) => c.id === cellId);
      if (idx === -1) {
        resolve();
        return;
      }
      const cell = notebook.cells[idx];
      
      setRunningCellId(cellId);
      
      setNotebook((prev) => {
        if (!prev?.cells) return prev;
        const currentIdx = prev.cells.findIndex((c) => c.id === cellId);
        if (currentIdx === -1) return prev;
        const cells = [...prev.cells];
        cells[currentIdx] = {
          ...cells[currentIdx],
          execution_count: null,
          outputs: [],
        } as NbCell;
        return { ...prev, cells };
      });

      const cellCode = joinSource(cell.source);
      const msgId = generateUuid();
      
      activeResolvesRef.current.set(msgId, resolve);

      const msg = {
        header: {
          msg_id: msgId,
          username: "cabinet",
          session: sessionIdRef.current,
          msg_type: "execute_request",
          version: "5.3",
        },
        metadata: {},
        content: {
          code: cellCode,
          silent: false,
          store_history: true,
          user_expressions: {},
          allow_stdin: false,
          stop_on_error: true,
        },
        buffers: [],
        parent_header: {},
        channel: "shell",
      };

      pendingRequestsRef.current.set(msgId, (responseMsg) => {
        const msgType = responseMsg.header.msg_type;
        
        if (msgType === "stream") {
          const text = joinSource(responseMsg.content.text);
          const name = responseMsg.content.name;
          
          setNotebook((prev) => {
            if (!prev?.cells) return prev;
            const currentIdx = prev.cells.findIndex((c) => c.id === cellId);
            if (currentIdx === -1) return prev;
            const cells = [...prev.cells];
            const currentCell = cells[currentIdx] as CodeCell;
            const outputs = [...(currentCell.outputs || [])];
            
            const lastOutput = outputs[outputs.length - 1];
            if (lastOutput && lastOutput.output_type === "stream" && lastOutput.name === name) {
              const appendedText = joinSource(lastOutput.text) + text;
              outputs[outputs.length - 1] = {
                ...lastOutput,
                text: [appendedText],
              };
            } else {
              outputs.push({
                output_type: "stream",
                name: name as "stdout" | "stderr",
                text: [text],
              });
            }
            
            cells[currentIdx] = { ...currentCell, outputs } as NbCell;
            return { ...prev, cells };
          });
        }
        
        else if (msgType === "execute_result" || msgType === "display_data") {
          const data = responseMsg.content.data;
          
          setNotebook((prev) => {
            if (!prev?.cells) return prev;
            const currentIdx = prev.cells.findIndex((c) => c.id === cellId);
            if (currentIdx === -1) return prev;
            const cells = [...prev.cells];
            const currentCell = cells[currentIdx] as CodeCell;
            const outputs = [...(currentCell.outputs || [])];
            
            outputs.push({
              output_type: msgType,
              data: data || {},
              execution_count: responseMsg.content.execution_count,
            });
            
            cells[currentIdx] = { ...currentCell, outputs } as NbCell;
            return { ...prev, cells };
          });
        }
        
        else if (msgType === "error") {
          const { ename, evalue, traceback } = responseMsg.content;
          
          setNotebook((prev) => {
            if (!prev?.cells) return prev;
            const currentIdx = prev.cells.findIndex((c) => c.id === cellId);
            if (currentIdx === -1) return prev;
            const cells = [...prev.cells];
            const currentCell = cells[currentIdx] as CodeCell;
            const outputs = [...(currentCell.outputs || [])];
            
            outputs.push({
              output_type: "error",
              ename: ename || "",
              evalue: evalue || "",
              traceback: traceback || [],
            });
            
            cells[currentIdx] = { ...currentCell, outputs } as NbCell;
            return { ...prev, cells };
          });
        }
        
        else if (msgType === "execute_reply") {
          const executionCount = responseMsg.content.execution_count;
          
          setNotebook((prev) => {
            if (!prev?.cells) return prev;
            const currentIdx = prev.cells.findIndex((c) => c.id === cellId);
            if (currentIdx === -1) return prev;
            const cells = [...prev.cells];
            cells[currentIdx] = {
              ...cells[currentIdx],
              execution_count: executionCount,
            } as NbCell;
            return { ...prev, cells };
          });
          
          pendingRequestsRef.current.delete(msgId);
          setRunningCellId(null);
          setDirty(true);
          
          const resolveFn = activeResolvesRef.current.get(msgId);
          if (resolveFn) {
            resolveFn();
            activeResolvesRef.current.delete(msgId);
          }
        }
      });

      wsRef.current.send(JSON.stringify(msg));
    });
  };

  const runAllCells = async () => {
    if (!notebook || !notebook.cells) return;
    for (let i = 0; i < notebook.cells.length; i++) {
      const cell = notebook.cells[i];
      if (cell.cell_type === "code") {
        await runCell(cell.id!);
      }
    }
  };

  const restartKernel = async () => {
    if (!kernelIdRef.current) return;
    setKernelStatus("connecting");
    try {
      const res = await fetch(`/api/jupyter/proxy/api/kernels/${kernelIdRef.current}/restart`, {
        method: "POST"
      });
      if (!res.ok) throw new Error("Failed to restart kernel");
      await setupJupyter();
    } catch (e) {
      console.error("Error restarting kernel:", e);
      setKernelStatus("disconnected");
    }
  };

  const interruptKernel = async () => {
    if (!kernelIdRef.current) return;
    try {
      await fetch(`/api/jupyter/proxy/api/kernels/${kernelIdRef.current}/interrupt`, {
        method: "POST"
      });
    } catch (e) {
      console.error("Error interrupting kernel:", e);
    }
  };

  const addCell = (type: "code" | "markdown") => {
    setNotebook((prev) => {
      if (!prev) return prev;
      const cells = prev.cells ? [...prev.cells] : [];
      const newCell: NbCell = type === "code"
        ? {
            id: generateUuid(),
            cell_type: "code",
            execution_count: null,
            metadata: {},
            outputs: [],
            source: "",
          } as CodeCell
        : {
            id: generateUuid(),
            cell_type: "markdown",
            metadata: {},
            source: "",
          } as MarkdownCell;
      return { ...prev, cells: [...cells, newCell] };
    });
    setDirty(true);
  };

  const deleteCell = (cellId: string) => {
    setNotebook((prev) => {
      if (!prev?.cells) return prev;
      const idx = prev.cells.findIndex((c) => c.id === cellId);
      if (idx === -1) return prev;
      const cells = [...prev.cells];
      cells.splice(idx, 1);
      return { ...prev, cells };
    });
    setDirty(true);
  };

  const toggleCellTag = (cellId: string, tag: "hide-input" | "hide-output" | "hide-cell") => {
    setNotebook((prev) => {
      if (!prev?.cells) return prev;
      const idx = prev.cells.findIndex((c) => c.id === cellId);
      if (idx === -1) return prev;
      const cells = [...prev.cells];
      const cell = cells[idx];
      const metadata = cell.metadata ? { ...cell.metadata } : {};
      const currentTags = (metadata.tags as string[]) || [];
      const newTags = currentTags.includes(tag)
        ? currentTags.filter((t) => t !== tag)
        : [...currentTags, tag];
      
      cells[idx] = {
        ...cell,
        metadata: {
          ...metadata,
          tags: newTags,
        },
      };
      return { ...prev, cells };
    });
    setDirty(true);
  };

  const language =
    notebook?.metadata?.language_info?.name ||
    notebook?.metadata?.kernelspec?.name ||
    "python";

  const cellCount = notebook?.cells?.length ?? 0;

  const updateCellSource = (cellId: string, source: string) => {
    setNotebook((prev) => {
      if (!prev?.cells) return prev;
      const idx = prev.cells.findIndex((c) => c.id === cellId);
      if (idx === -1) return prev;
      const cells = [...prev.cells];
      cells[idx] = { ...cells[idx], source } as NbCell;
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

  // Compile publication-ready preview HTML for clipboard copying
  const compileCleanPreviewHtml = useCallback((): string => {
    if (!notebook || !notebook.cells) return "";
    
    let bodyHtml = "";
    notebook.cells.forEach((cell) => {
      const tags = (cell.metadata?.tags as string[]) || [];
      if (tags.includes("hide-cell")) return;

      if (cell.cell_type === "markdown") {
        const html = previewHtmls[cell.id!] || "";
        bodyHtml += `<div class="markdown-cell" style="margin-bottom:1.5rem">${html}</div>`;
      } else if (cell.cell_type === "code") {
        const sourceStr = joinSource(cell.source);
        const hideInput = globalHideCode || tags.includes("hide-input");
        const hideOutput = globalHideOutput || tags.includes("hide-output");

        if (!hideInput && sourceStr.trim()) {
          bodyHtml += `<pre style="font-family:monospace;padding:12px;border-radius:4px;background:#f5eeda;border:1px solid #e2d7c1;overflow-x:auto;margin-bottom:1.25rem"><code style="font-family:monospace">${escapeHtml(sourceStr)}</code></pre>`;
        }

        if (!hideOutput && cell.outputs && cell.outputs.length > 0) {
          bodyHtml += `<div class="outputs-wrapper" style="margin-bottom:1.5rem">`;
          cell.outputs.forEach((out) => {
            if (out.output_type === "stream") {
              const txt = stripAnsi(joinSource(out.text));
              bodyHtml += `<pre style="font-family:monospace;padding:10px;background:#f0ebd5;border-radius:4px;font-size:12.5px;color:#2a221b;overflow-x:auto">${escapeHtml(txt)}</pre>`;
            } else if (out.output_type === "error") {
              const trace = out.traceback.map(stripAnsi).join("\n");
              bodyHtml += `<pre style="font-family:monospace;padding:10px;background:#fce8e6;color:#a8201a;border-radius:4px;font-size:12.5px;overflow-x:auto">${escapeHtml(trace)}</pre>`;
            } else if (out.data) {
              if (out.data["image/png"]) {
                const b64 = joinSource(out.data["image/png"]).replace(/\s/g, "");
                bodyHtml += `<div style="text-align:center;margin:1.5rem 0"><img src="data:image/png;base64,${b64}" style="max-width:100%;border-radius:4px" alt="Plot" /></div>`;
              } else if (out.data["text/html"]) {
                bodyHtml += `<div style="margin:1rem 0;overflow-x:auto">${joinSource(out.data["text/html"])}</div>`;
              } else if (out.data["text/plain"]) {
                const plain = stripAnsi(joinSource(out.data["text/plain"]));
                bodyHtml += `<pre style="font-family:monospace;padding:10px;background:#f0ebd5;border-radius:4px;font-size:12.5px;overflow-x:auto">${escapeHtml(plain)}</pre>`;
              }
            }
          });
          bodyHtml += `</div>`;
        }
      }
    });

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PREVIEW_CSS}</style></head><body><div class="preview-container preview-${previewTemplate}">${bodyHtml}</div></body></html>`;
  }, [notebook, previewHtmls, previewTemplate, globalHideCode, globalHideOutput]);

  const compileCleanPreviewMarkdown = useCallback((): string => {
    if (!notebook || !notebook.cells) return "";

    let md = "";
    notebook.cells.forEach((cell) => {
      const tags = (cell.metadata?.tags as string[]) || [];
      if (tags.includes("hide-cell")) return;

      if (cell.cell_type === "markdown") {
        md += joinSource(cell.source) + "\n\n";
      } else if (cell.cell_type === "code") {
        const sourceStr = joinSource(cell.source);
        const hideInput = globalHideCode || tags.includes("hide-input");
        const hideOutput = globalHideOutput || tags.includes("hide-output");

        if (!hideInput && sourceStr.trim()) {
          md += "```" + language + "\n" + sourceStr + "\n```\n\n";
        }

        if (!hideOutput && cell.outputs && cell.outputs.length > 0) {
          cell.outputs.forEach((out) => {
            if (out.output_type === "stream") {
              md += "```\n" + stripAnsi(joinSource(out.text)) + "\n```\n\n";
            } else if (out.output_type === "error") {
              md += "```\n" + out.traceback.map(stripAnsi).join("\n") + "\n```\n\n";
            } else if (out.data && out.data["text/plain"]) {
              md += "```\n" + stripAnsi(joinSource(out.data["text/plain"])) + "\n```\n\n";
            }
          });
        }
      }
    });
    return md;
  }, [notebook, globalHideCode, globalHideOutput, language]);

  const handleCopyHTML = async () => {
    try {
      const htmlContent = compileCleanPreviewHtml();
      const plainText = compileCleanPreviewMarkdown();

      const htmlBlob = new Blob([htmlContent], { type: "text/html" });
      const textBlob = new Blob([plainText], { type: "text/plain" });

      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": textBlob,
        }),
      ]);
      setCopiedHTML(true);
      setTimeout(() => setCopiedHTML(false), 2000);
    } catch (e) {
      console.error("Clipboard copy error:", e);
      // fallback
      try {
        await navigator.clipboard.writeText(compileCleanPreviewHtml());
        setCopiedHTML(true);
        setTimeout(() => setCopiedHTML(false), 2000);
      } catch {
        alert("Failed to copy to clipboard.");
      }
    }
  };

  const handleCopyMarkdown = async () => {
    try {
      const mdContent = compileCleanPreviewMarkdown();
      await navigator.clipboard.writeText(mdContent);
      setCopiedMD(true);
      setTimeout(() => setCopiedMD(false), 2000);
    } catch {
      alert("Failed to copy markdown.");
    }
  };

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  return (
    <ViewerLayout
      toolbar={
        <ViewerToolbar
        path={path}
        badge="IPYNB"
        sublabel={`${cellCount} cells · ${language}`}
      >
        {dirty && <span className="text-xs text-amber-600 mr-1 animate-pulse">●</span>}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={saveNotebook}
          disabled={!dirty || saving}
        >
          {saving ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </Button>

        {jupyterAvailable && (
          <>
            <div className="h-4 w-px bg-border mx-1" />
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 px-1 select-none">
              {kernelStatus === "busy" ? (
                <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
              ) : kernelStatus === "idle" ? (
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              )}
              <span className="font-mono capitalize text-[10px]">{kernelStatus}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-[#8B5E3C] dark:text-slate-300 hover:bg-[#E8DDC5]/40"
              onClick={runAllCells}
              disabled={kernelStatus === "disconnected" || kernelStatus === "connecting"}
            >
              <Play className="h-3 w-3 fill-current" />
              Run All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-[#8B5E3C] dark:text-slate-300 hover:bg-[#E8DDC5]/40"
              onClick={interruptKernel}
              disabled={kernelStatus !== "busy"}
            >
              <Square className="h-3 w-3 fill-current" />
              Interrupt
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-[#8B5E3C] dark:text-slate-300 hover:bg-[#E8DDC5]/40"
              onClick={restartKernel}
              disabled={kernelStatus === "disconnected" || kernelStatus === "connecting"}
            >
              <RefreshCw className="h-3 w-3" />
              Restart
            </Button>
          </>
        )}

        <div className="h-4 w-px bg-border mx-1" />

        {/* View mode toggle group */}
        <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg border border-border select-none">
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 px-2 rounded-md text-[11px] gap-1 transition-all ${
              viewMode === "editor"
                ? "bg-white dark:bg-slate-800 text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setViewMode("editor")}
            title="Edit"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 px-2 rounded-md text-[11px] gap-1 transition-all ${
              viewMode === "split"
                ? "bg-white dark:bg-slate-800 text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setViewMode("split")}
            title="Split view"
          >
            <Columns className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 px-2 rounded-md text-[11px] gap-1 transition-all ${
              viewMode === "preview"
                ? "bg-white dark:bg-slate-800 text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setViewMode("preview")}
            title="Preview"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="h-4 w-px bg-border mx-1" />

        {/* Preview style selectors */}
        {(viewMode === "split" || viewMode === "preview") && (
          <div className="flex items-center gap-2">
            <select
              value={previewTemplate}
              onChange={(e) => setPreviewTemplate(e.target.value as "default" | "substack" | "medium" | "markdown")}
              className="h-7 rounded-md border border-border bg-white dark:bg-slate-900 text-foreground px-2 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500/30"
            >
              <option value="default">Default / Clean</option>
              <option value="substack">Substack (Serif)</option>
              <option value="medium">Medium (Serif)</option>
              <option value="markdown">Dev.to / Markdown</option>
            </select>

            {/* Visibility override checkboxes */}
            <label className="flex items-center gap-1 text-xs cursor-pointer select-none text-muted-foreground hover:text-foreground font-medium">
              <input
                type="checkbox"
                checked={globalHideCode}
                onChange={(e) => setGlobalHideCode(e.target.checked)}
                className="rounded border-border focus:ring-amber-500/30 h-3.5 w-3.5 cursor-pointer accent-[#8B5E3C]"
              />
              Hide Code
            </label>
            <label className="flex items-center gap-1 text-xs cursor-pointer select-none text-muted-foreground hover:text-foreground font-medium">
              <input
                type="checkbox"
                checked={globalHideOutput}
                onChange={(e) => setGlobalHideOutput(e.target.checked)}
                className="rounded border-border focus:ring-amber-500/30 h-3.5 w-3.5 cursor-pointer accent-[#8B5E3C]"
              />
              Hide Output
            </label>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {/* Redesigned Export Dropdown */}
          <div className="relative group">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-[#8B5E3C] dark:text-slate-300 hover:bg-[#E8DDC5]/40"
            >
              <Share2 className="h-3.5 w-3.5" />
              Build & Copy
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
            <div className="absolute right-0 top-full mt-1 w-44 rounded-md border border-border bg-popover shadow-lg py-1 z-50 hidden group-hover:block">
              <button
                onClick={handleCopyHTML}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#E8DDC5]/40 dark:hover:bg-slate-700/40 text-foreground flex items-center gap-2 font-medium"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedHTML ? "Copied!" : "Copy Styled HTML"}
              </button>
              <button
                onClick={handleCopyMarkdown}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-[#E8DDC5]/40 dark:hover:bg-slate-700/40 text-foreground flex items-center gap-2 font-medium"
              >
                <FileText className="h-3.5 w-3.5" />
                {copiedMD ? "Copied!" : "Copy Markdown"}
              </button>
            </div>
          </div>

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
          </Button>
        </div>
        </ViewerToolbar>
      }
    >

      {/* Main Workspace Frame */}
      <div ref={split.containerRef} className="flex-1 flex overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center h-full w-full text-muted-foreground text-sm">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
            Loading notebook…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full w-full text-red-500 text-sm gap-2">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        ) : notebook ? (
          <>
            {/* Editor Workspace Pane (Left) */}
            {(viewMode === "editor" || viewMode === "split") && (
              <div
                className={`notebook-editor-pane flex flex-col h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-900/10 p-6 ${
                  viewMode === "split" ? "min-w-[320px]" : "w-full"
                }`}
                style={viewMode === "split" ? { width: `${split.leftPct}%`, flex: "none" } : undefined}
              >
                {saveError && (
                  <div className="mb-4 rounded-md border border-red-200 bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700">
                    Save error: {saveError}
                  </div>
                )}
                
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={notebook.cells?.map((c) => c.id!) || []}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
                      {notebook.cells?.map((cell) => {
                        const cellId = cell.id!;
                        const showDragHandle = viewMode === "editor";
                        
                        return (
                          <SortableCellWrapper key={cellId} id={cellId}>
                            {({ dragHandleProps }) => {
                              if (cell.cell_type === "markdown")
                                return (
                                  <MarkdownCellView
                                    cell={cell}
                                    onEdit={(src) => updateCellSource(cellId, src)}
                                    onDelete={() => deleteCell(cellId)}
                                    dragHandleProps={dragHandleProps}
                                    preview={markdownPreviews[cellId] ?? false}
                                    setPreview={(preview) =>
                                      setMarkdownPreviews((prev) => ({
                                        ...prev,
                                        [cellId]: preview,
                                      }))
                                    }
                                    showDragHandle={showDragHandle}
                                    onToggleTag={(tag) => toggleCellTag(cellId, tag)}
                                  />
                                );
                              if (cell.cell_type === "raw")
                                return (
                                  <RawCellView
                                    cell={cell}
                                    onDelete={() => deleteCell(cellId)}
                                    dragHandleProps={dragHandleProps}
                                    showDragHandle={showDragHandle}
                                    onToggleTag={(tag) => toggleCellTag(cellId, tag)}
                                  />
                                );
                              return (
                                <CodeCellView
                                  cell={cell}
                                  cellId={cellId}
                                  language={language}
                                  onEdit={(src) => updateCellSource(cellId, src)}
                                  jupyterAvailable={jupyterAvailable}
                                  runningCellId={runningCellId}
                                  runCell={runCell}
                                  onDelete={() => deleteCell(cellId)}
                                  dragHandleProps={dragHandleProps}
                                  showDragHandle={showDragHandle}
                                  onToggleTag={(tag) => toggleCellTag(cellId, tag)}
                                />
                              );
                            }}
                          </SortableCellWrapper>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>

                {/* Add cell buttons in editor */}
                <div className="mt-8 flex justify-center gap-3 border-t border-border pt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs border-[#E8DDC5] hover:bg-[#E8DDC5] text-[#8B5E3C] bg-white cursor-pointer"
                    onClick={() => addCell("code")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Code Cell
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs border-[#E8DDC5] hover:bg-[#E8DDC5] text-[#8B5E3C] bg-white cursor-pointer"
                    onClick={() => addCell("markdown")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Markdown Cell
                  </Button>
                </div>
              </div>
            )}

            {/* Divider separator */}
            {viewMode === "split" && (
              <div
                role="separator"
                aria-orientation="vertical"
                onPointerDown={split.startResize}
                onDoubleClick={split.resetWidth}
                className="relative w-px shrink-0 cursor-col-resize bg-border before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:content-[''] hover:bg-primary/50"
              />
            )}

            {/* Preview Workspace Pane (Right) */}
            {(viewMode === "preview" || viewMode === "split") && (
              <div
                className={`flex flex-col h-full overflow-y-auto bg-slate-100 dark:bg-[#0b0e14] p-6 ${
                  viewMode === "split" ? "min-w-[320px]" : "w-full"
                }`}
                style={viewMode === "split" ? { width: `${100 - split.leftPct}%`, flex: "none" } : undefined}
              >
                {/* Platform container styled by preview-styles.css */}
                <div className={`preview-container preview-${previewTemplate} w-full max-w-full shadow-sm rounded-lg border border-border h-fit overflow-x-auto overflow-y-hidden shrink-0`}>
                  {notebook.cells && notebook.cells.length > 0 ? (
                    notebook.cells.map((cell) => {
                      const cellId = cell.id!;
                      const tags = (cell.metadata?.tags as string[]) || [];

                      // 1. Check if cell is globally or cell-level hidden
                      if (tags.includes("hide-cell")) return null;

                      if (cell.cell_type === "markdown") {
                        const mdHtml = previewHtmls[cellId] || "";
                        return (
                          <div
                            key={cellId}
                            className="markdown-cell-preview prose prose-sm max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: mdHtml }}
                          />
                        );
                      }

                      if (cell.cell_type === "code") {
                        const sourceStr = joinSource(cell.source);
                        const hideInput = globalHideCode || tags.includes("hide-input");
                        const hideOutput = globalHideOutput || tags.includes("hide-output");
                        const hasOuts = (cell.outputs?.length ?? 0) > 0;

                        return (
                          <div key={cellId} className="code-cell-preview my-4">
                            {/* Render code block only if not hidden */}
                            {!hideInput && sourceStr.trim() && (
                              <CodeBlockView code={sourceStr} language={language} theme="slate" />
                            )}
                            
                            {/* Render outputs only if not hidden */}
                            {!hideOutput && hasOuts && (
                              <div className="outputs-preview-wrapper mt-2 space-y-2">
                                {cell.outputs!.map((output, idx) => (
                                  <CellOutputView key={idx} output={output} />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (cell.cell_type === "raw") {
                        return (
                          <pre
                            key={cellId}
                            className="raw-cell-preview whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed p-4 rounded bg-slate-50 dark:bg-slate-900 border border-border text-foreground"
                          >
                            {joinSource(cell.source)}
                          </pre>
                        );
                      }

                      return null;
                    })
                  ) : (
                    <div className="text-center text-muted-foreground text-sm py-12">
                      Empty Notebook. Add cells in the editor.
                    </div>
                  )}
                </div>
              </div>
            )}

            {viewMode === "split" && split.resizing && (
              <SplitRuler leftPct={split.leftPct} />
            )}
          </>
        ) : null}
      </div>
    </ViewerLayout>
  );
}

"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ExternalLink, Download, Copy, Check, AlertCircle, Save, Pencil, Eye, Play, RefreshCw, Square, Loader2, Plus, Trash2, GripVertical } from "lucide-react";
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
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button
            onClick={() => setPreview(false)}
            className="rounded p-1 bg-[#FFF9E9] text-[#7A6B5D] hover:text-[#2A221B] border border-[#E8DDC5]"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded p-1 bg-[#FFF9E9] text-[#8B2E3E] hover:bg-[rgba(139,46,62,0.06)] border border-[#E8DDC5]"
              title="Delete cell"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div
          className="prose prose-sm max-w-none px-1 [&_h1]:font-serif [&_h2]:font-serif [&_h3]:font-serif [&_a]:text-[#8B5E3C] [&_a:hover]:underline [&_code]:bg-[#F5EEDC] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[#8B2E3E] [&_pre]:bg-[#FFF9E9] [&_pre]:border [&_pre]:border-[#E8DDC5] [&_pre]:text-[#2A221B] [&_pre_code]:bg-transparent [&_pre_code]:text-[#2A221B] [&_pre_code]:p-0 cursor-pointer"
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
          className="rounded p-1 bg-[#FFF9E9] text-[#7A6B5D] hover:text-[#2A221B] border border-[#E8DDC5]"
          title="Preview"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="rounded p-1 bg-[#FFF9E9] text-[#8B2E3E] hover:bg-[rgba(139,46,62,0.06)] border border-[#E8DDC5]"
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

interface SortableCellWrapperProps {
  id: string;
  children: (props: {
    dragHandleProps: any;
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
}: {
  cell: CodeCell;
  cellId: string;
  language: string;
  onEdit: (source: string) => void;
  jupyterAvailable: boolean;
  runningCellId: string | null;
  runCell: (id: string) => void;
  onDelete?: () => void;
  dragHandleProps: any;
}) {
  const [editing, setEditing] = useState(false);
  const source = joinSource(cell.source);
  const count = cell.execution_count ?? " ";
  const hasOutputs = (cell.outputs?.length ?? 0) > 0;

  return (
    <div className="mb-5">
      <div className="grid grid-cols-[80px_1fr] gap-3">
        <div className="select-none font-mono text-[11px] text-[#8B5E3C] flex items-center justify-end gap-1 pt-1.5 pr-1">
          {/* Drag Handle */}
          <div
            {...dragHandleProps}
            className="p-1 hover:bg-[#E8DDC5] rounded text-[#8B5E3C]/50 hover:text-[#2A221B] cursor-grab active:cursor-grabbing transition-colors"
            title="Drag to reorder cell"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>

          {jupyterAvailable ? (
            <div className="flex items-center gap-1">
              {runningCellId === cellId ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8B5E3C]" />
              ) : (
                <button
                  onClick={() => runCell(cellId)}
                  className="p-1 hover:bg-[#E8DDC5] hover:text-[#2A221B] rounded text-[#8B5E3C] transition-colors"
                  title="Run cell (Ctrl+Enter)"
                >
                  <Play className="h-3 w-3 fill-current" />
                </button>
              )}
              <span className="text-[10px] text-[#8B5E3C]/70 min-w-[32px] text-left">
                In [{count}]
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-[#8B5E3C]/70">In [{count}]</span>
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
                    className="rounded p-1 bg-[#FFF9E9] text-[#7A6B5D] hover:text-[#2A221B] border border-[#E8DDC5]"
                    title="Edit cell"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  {onDelete && (
                    <button
                      onClick={onDelete}
                      className="rounded p-1 bg-[#FFF9E9] text-[#8B2E3E] hover:bg-[rgba(139,46,62,0.06)] border border-[#E8DDC5]"
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
                    className="rounded p-1 bg-[#FFF9E9] text-[#8B2E3E] hover:bg-[rgba(139,46,62,0.06)] border border-[#E8DDC5]"
                    title="Delete cell"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setEditing(false)}
                  className="rounded p-1 bg-[#FFF9E9] text-[#7A6B5D] hover:text-[#2A221B] border border-[#E8DDC5]"
                  title="Done editing"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
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
}: {
  cell: MarkdownCell;
  onEdit: (source: string) => void;
  onDelete?: () => void;
  dragHandleProps: any;
  preview: boolean;
  setPreview: (preview: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3 mb-5">
      <div className="select-none font-mono text-[11px] text-[#8B5E3C] flex items-start justify-end gap-1 pt-2 pr-1">
        {/* Drag Handle */}
        <div
          {...dragHandleProps}
          className="p-1 hover:bg-[#E8DDC5] rounded text-[#8B5E3C]/50 hover:text-[#2A221B] cursor-grab active:cursor-grabbing transition-colors"
          title="Drag to reorder cell"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <span className="text-[10px] text-[#8B5E3C]/50 pt-1">M↓</span>
      </div>
      <div className="min-w-0">
        <EditableMarkdownCell
          source={joinSource(cell.source)}
          onChange={onEdit}
          onDelete={onDelete}
          preview={preview}
          setPreview={setPreview}
        />
      </div>
    </div>
  );
}

/** Render a raw cell as read-only. */
function RawCellView({
  cell,
  onDelete,
  dragHandleProps,
}: {
  cell: RawCell;
  onDelete?: () => void;
  dragHandleProps: any;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3 mb-5">
      <div className="select-none font-mono text-[11px] text-[#8B5E3C] flex items-start justify-end gap-1 pt-2 pr-1">
        {/* Drag Handle */}
        <div
          {...dragHandleProps}
          className="p-1 hover:bg-[#E8DDC5] rounded text-[#8B5E3C]/50 hover:text-[#2A221B] cursor-grab active:cursor-grabbing transition-colors"
          title="Drag to reorder cell"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <span className="text-[10px] text-[#8B5E3C]/50 pt-1">Raw</span>
      </div>
      <div className="min-w-0 relative group">
        <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed px-4 py-3 rounded-md bg-[#F5EEDC] text-[#2A221B]">
          {joinSource(cell.source)}
        </pre>
        {onDelete && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onDelete}
              className="rounded p-1 bg-[#FFF9E9] text-[#8B2E3E] hover:bg-[rgba(139,46,62,0.06)] border border-[#E8DDC5]"
              title="Delete cell"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
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
  const { t } = useLocale();
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

  const wsRef = useRef<WebSocket | null>(null);
  const kernelIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(generateUuid());
  const pendingRequestsRef = useRef<Map<string, (msg: any) => void>>(new Map());
  const activeResolvesRef = useRef<Map<string, () => void>>(new Map());

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
      const oldIndex = prev.cells.findIndex((cell) => (cell as any).id === active.id);
      const newIndex = prev.cells.findIndex((cell) => (cell as any).id === over.id);

      if (oldIndex === -1 || newIndex === -1) return prev;

      const newCells = arrayMove(prev.cells, oldIndex, newIndex);
      return {
        ...prev,
        cells: newCells,
      };
    });
    setDirty(true);
  };

  const allMarkdownCells = useMemo(() => {
    return notebook?.cells?.filter((c) => c.cell_type === "markdown") ?? [];
  }, [notebook?.cells]);

  const allInPreview = useMemo(() => {
    return allMarkdownCells.length > 0 && allMarkdownCells.every((c) => markdownPreviews[(c as any).id] === true);
  }, [allMarkdownCells, markdownPreviews]);

  const toggleAllMarkdownPreviews = useCallback(() => {
    const nextPreviewState = !allInPreview;
    const newPreviews: Record<string, boolean> = {};
    allMarkdownCells.forEach((c) => {
      newPreviews[(c as any).id] = nextPreviewState;
    });
    setMarkdownPreviews(newPreviews);
  }, [allMarkdownCells, allInPreview]);

  const assetUrl = `/api/assets/${path}`;
  const filename = path.split("/").pop() || path;

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
          id: (cell as any).id || generateUuid(),
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

  const setupJupyter = async () => {
    try {
      const statusRes = await fetch("/api/jupyter/status");
      const statusData = await statusRes.json();
      if (!statusData.available) {
        setJupyterAvailable(false);
        return;
      }
      setJupyterAvailable(true);
      setKernelStatus("connecting");

      const sessionsRes = await fetch("/api/jupyter/proxy/api/sessions");
      if (!sessionsRes.ok) throw new Error("Failed to get Jupyter sessions");
      const sessions = await sessionsRes.json();
      
      let session = sessions.find((s: any) => s.path === path);
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
              name: notebook?.metadata?.kernelspec?.name || "python3"
            }
          })
        });
        if (!createRes.ok) throw new Error("Failed to create Jupyter session");
        session = await createRes.json();
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
  };

  useEffect(() => {
    if (notebook) {
      void setupJupyter();
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [path, !!notebook]);

  const runCell = (cellId: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (!notebook || !notebook.cells || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        resolve();
        return;
      }
      
      const idx = notebook.cells.findIndex((c) => (c as any).id === cellId);
      if (idx === -1) {
        resolve();
        return;
      }
      const cell = notebook.cells[idx];
      
      setRunningCellId(cellId);
      
      setNotebook((prev) => {
        if (!prev?.cells) return prev;
        const currentIdx = prev.cells.findIndex((c) => (c as any).id === cellId);
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
            const currentIdx = prev.cells.findIndex((c) => (c as any).id === cellId);
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
                name,
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
            const currentIdx = prev.cells.findIndex((c) => (c as any).id === cellId);
            if (currentIdx === -1) return prev;
            const cells = [...prev.cells];
            const currentCell = cells[currentIdx] as CodeCell;
            const outputs = [...(currentCell.outputs || [])];
            
            outputs.push({
              output_type: msgType,
              data,
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
            const currentIdx = prev.cells.findIndex((c) => (c as any).id === cellId);
            if (currentIdx === -1) return prev;
            const cells = [...prev.cells];
            const currentCell = cells[currentIdx] as CodeCell;
            const outputs = [...(currentCell.outputs || [])];
            
            outputs.push({
              output_type: "error",
              ename,
              evalue,
              traceback,
            });
            
            cells[currentIdx] = { ...currentCell, outputs } as NbCell;
            return { ...prev, cells };
          });
        }
        
        else if (msgType === "execute_reply") {
          const executionCount = responseMsg.content.execution_count;
          
          setNotebook((prev) => {
            if (!prev?.cells) return prev;
            const currentIdx = prev.cells.findIndex((c) => (c as any).id === cellId);
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
        await runCell((cell as any).id);
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
          } as any
        : {
            id: generateUuid(),
            cell_type: "markdown",
            metadata: {},
            source: "",
          } as any;
      return { ...prev, cells: [...cells, newCell] };
    });
    setDirty(true);
  };

  const deleteCell = (cellId: string) => {
    setNotebook((prev) => {
      if (!prev?.cells) return prev;
      const idx = prev.cells.findIndex((c) => (c as any).id === cellId);
      if (idx === -1) return prev;
      const cells = [...prev.cells];
      cells.splice(idx, 1);
      return { ...prev, cells };
    });
    setDirty(true);
  };

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

  const updateCellSource = (cellId: string, source: string) => {
    setNotebook((prev) => {
      if (!prev?.cells) return prev;
      const idx = prev.cells.findIndex((c) => (c as any).id === cellId);
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
        {jupyterAvailable && (
          <>
            <div className="h-4 w-px bg-[#E8DDC5] mx-1" />
            <span className="text-xs text-[#7A6B5D] flex items-center gap-1.5 px-1 select-none">
              {kernelStatus === "busy" ? (
                <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
              ) : kernelStatus === "idle" ? (
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              )}
              <span className="font-mono capitalize text-[10px]">
                {kernelStatus}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-[#8B5E3C] hover:text-[#2A221B] hover:bg-[#E8DDC5]"
              onClick={runAllCells}
              disabled={kernelStatus === "disconnected" || kernelStatus === "connecting"}
              title="Run all code cells"
            >
              <Play className="h-3 w-3 fill-current" />
              Run All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-[#8B5E3C] hover:text-[#2A221B] hover:bg-[#E8DDC5]"
              onClick={interruptKernel}
              disabled={kernelStatus !== "busy"}
              title="Interrupt kernel execution"
            >
              <Square className="h-3 w-3 fill-current" />
              Interrupt
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-[#8B5E3C] hover:text-[#2A221B] hover:bg-[#E8DDC5]"
              onClick={restartKernel}
              disabled={kernelStatus === "disconnected" || kernelStatus === "connecting"}
              title="Restart kernel"
            >
              <RefreshCw className="h-3 w-3" />
              Restart
            </Button>
            <div className="h-4 w-px bg-[#E8DDC5] mx-1" />
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 text-xs ${
            allInPreview
              ? "bg-[#E8DDC5] text-[#2A221B]"
              : "text-[#8B5E3C] hover:text-[#2A221B] hover:bg-[#E8DDC5]"
          }`}
          onClick={toggleAllMarkdownPreviews}
          title={allInPreview ? "Edit all markdown cells" : "Preview all markdown cells"}
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
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

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={notebook.cells?.map((c) => (c as any).id) || []}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {notebook.cells?.map((cell) => {
                    const cellId = (cell as any).id;
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
                              />
                            );
                          if (cell.cell_type === "raw")
                            return (
                              <RawCellView
                                cell={cell}
                                onDelete={() => deleteCell(cellId)}
                                dragHandleProps={dragHandleProps}
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
                            />
                          );
                        }}
                      </SortableCellWrapper>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>

            <div className="mt-8 flex justify-center gap-3 border-t border-[#E8DDC5] pt-6">
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
        ) : null}
      </div>
    </div>
  );
}

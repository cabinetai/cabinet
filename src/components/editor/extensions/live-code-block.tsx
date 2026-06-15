"use client";

/**
 * Tiptap extension for live-previewed JSX code blocks.
 *
 * Renders user-authored JSX (typically Recharts charts) directly inside the
 * note editor with a toggle between a live preview and a code editor. The
 * evaluator (`live-code-eval.ts`) transpiles JSX → `React.createElement` via
 * Sucrase and executes it within a sandboxed scope that includes React,
 * Recharts, and Cabinet's shadcn chart components.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { Zap, Code, Eye } from "lucide-react";
import { evaluateLiveCode } from "@/lib/mdx/live-code-eval";
import { LIVE_CODE_SCOPE } from "@/lib/mdx/live-code-scope";

/* -------------------------------------------------------------------------- */
/*  Command type augmentation                                                 */
/* -------------------------------------------------------------------------- */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    liveCodeBlock: {
      /** Insert a live code block with the given JSX source. */
      insertLiveCodeBlock: (options: { code: string }) => ReturnType;
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Error boundary                                                            */
/* -------------------------------------------------------------------------- */

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Re-mount children when this key changes (e.g. on code edits). */
  resetKey: string;
}

interface ErrorBoundaryState {
  error: string | null;
}

/**
 * Lightweight class-based error boundary that catches render-time exceptions
 * from the evaluated JSX and displays them inline.
 */
class LiveCodeErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Reset the error when the code changes so the user sees fresh output.
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return <ErrorOverlay message={this.state.error} />;
    }
    return this.props.children;
  }
}

/* -------------------------------------------------------------------------- */
/*  Shared UI fragments                                                       */
/* -------------------------------------------------------------------------- */

/** Red-tinted error message shown when evaluation or rendering fails. */
function ErrorOverlay({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-400/60 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
      <span className="font-semibold">Error: </span>
      {message}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  NodeView component                                                        */
/* -------------------------------------------------------------------------- */

type ViewMode = "preview" | "code";

function LiveCodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const code: string = (node.attrs as { code: string }).code ?? "";
  const [mode, setMode] = useState<ViewMode>("preview");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit content whenever code or mode changes.
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta && mode === "code") {
      ta.style.height = "auto";
      ta.style.height = `${Math.max(200, ta.scrollHeight)}px`;
    }
  }, [code, mode]);

  // Evaluate the JSX code and memoize until `code` changes.
  const evalResult = useMemo(() => {
    if (!code.trim()) return null;
    return evaluateLiveCode(code, LIVE_CODE_SCOPE);
  }, [code]);

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateAttributes({ code: e.target.value });
      // Auto-resize as user types.
      const ta = e.target;
      ta.style.height = "auto";
      ta.style.height = `${Math.max(200, ta.scrollHeight)}px`;
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper className="live-code-block my-3 rounded-lg border border-border bg-card overflow-hidden">
      {/* ── Header bar ──────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30"
        contentEditable={false}
      >
        {/* Left: icon + label */}
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
          <Zap className="h-3.5 w-3.5" />
          Live Component
        </span>

        {/* Right: mode toggle buttons */}
        <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setMode("code")}
            className={`inline-flex items-center gap-1 px-2 py-1 transition-colors ${
              mode === "code"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent"
            }`}
            aria-label="Show code editor"
          >
            <Code className="h-3 w-3" />
            Code
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`inline-flex items-center gap-1 px-2 py-1 transition-colors ${
              mode === "preview"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent"
            }`}
            aria-label="Show live preview"
          >
            <Eye className="h-3 w-3" />
            Preview
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      {mode === "code" ? (
        /* Code editor — auto-sizing textarea */
        <div contentEditable={false}>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={handleCodeChange}
            spellCheck={false}
            className="block w-full bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-500 resize-none"
            placeholder="Paste JSX here — e.g. a Recharts chart…"
            style={{ minHeight: "200px" }}
          />
        </div>
      ) : (
        /* Live preview */
        <div
          className="min-h-[200px] overflow-auto p-4 resize-y"
          contentEditable={false}
        >
          {!code.trim() ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No code yet — switch to Code mode to add JSX.
            </div>
          ) : evalResult?.error ? (
            <ErrorOverlay message={evalResult.error} />
          ) : evalResult?.element ? (
            <LiveCodeErrorBoundary resetKey={code}>
              {evalResult.element}
            </LiveCodeErrorBoundary>
          ) : null}
        </div>
      )}
    </NodeViewWrapper>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tiptap Node definition                                                    */
/* -------------------------------------------------------------------------- */

export const LiveCodeBlock = Node.create({
  name: "liveCodeBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      code: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'pre[data-live-code="true"]',
        // Must be higher than CodeBlockLowlight's default (50) so this
        // rule matches `<pre data-live-code>` before the generic `<pre><code>`
        // rule claims it.
        priority: 60,
        getAttrs: (el) => {
          const element = el as HTMLElement;
          const codeEl = element.querySelector("code");
          return {
            code: codeEl?.textContent ?? element.textContent ?? "",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const code = (HTMLAttributes.code as string) ?? "";
    return [
      "pre",
      mergeAttributes({ "data-live-code": "true" }),
      ["code", {}, code],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LiveCodeBlockView);
  },

  addCommands() {
    return {
      insertLiveCodeBlock:
        ({ code }) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { code },
          }),
    };
  },
});

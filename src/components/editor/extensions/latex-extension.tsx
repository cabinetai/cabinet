"use client";

/**
 * Tiptap extension for embedding and rendering full .tex files inline.
 *
 * Recognizes the `![[file.tex]]` embed syntax. When the node mounts, it
 * resolves the file path relative to the current page and uses the Electron
 * IPC bridge (or the /api/assets endpoint as fallback) to read the .tex
 * content. The content is then rendered using LaTeX.js inside an iframe
 * so that the generated DOM, CSS, and fonts are fully isolated.
 *
 * Interaction pattern:
 *  - Rendered mode: shows the compiled LaTeX document (default).
 *  - Edit mode: clicking the embed swaps to a textarea with the raw .tex
 *    source. On blur, the content is saved back to disk and re-rendered.
 *
 * Lazy loading: rendering is deferred until the node scrolls into the
 * viewport via an IntersectionObserver, so pages with many embeds stay fast.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { FileText, Code, Eye, Loader2, AlertCircle } from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface LatexEmbedAttrs {
  path: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    latexEmbed: {
      insertLatexEmbed: (options: { path: string }) => ReturnType;
    };
  }
}

type LatexFileBridge = {
  readFile?: (filePath: string) => Promise<{ ok: boolean; content?: string; error?: string }>;
  writeFile?: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string }>;
};

/* -------------------------------------------------------------------------- */
/*  Path resolution                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a .tex file path relative to the current page's directory.
 * Returns a virtual path suitable for the IPC bridge or /api/assets.
 */
function resolveTexPath(texPath: string, pagePath: string | null): string {
  // Absolute virtual path (starts with /)
  if (texPath.startsWith("/")) {
    return texPath.replace(/^\//, "");
  }
  // Already a relative path from root
  if (!pagePath) return texPath;

  // Resolve relative to the page's directory
  const pageDir = pagePath.includes("/")
    ? pagePath.substring(0, pagePath.lastIndexOf("/"))
    : "";
  return pageDir ? `${pageDir}/${texPath}` : texPath;
}

/* -------------------------------------------------------------------------- */
/*  File I/O                                                                    */
/* -------------------------------------------------------------------------- */

async function readTexFile(virtualPath: string): Promise<string> {
  const bridge = (window as unknown as { CabinetDesktop?: LatexFileBridge }).CabinetDesktop;
  if (bridge && bridge.readFile) {
    const result = await bridge.readFile(virtualPath);
    if (result.ok && result.content !== undefined) {
      return result.content;
    }
    throw new Error(result.error || "Failed to read file");
  }
  // Fallback: use the /api/assets endpoint
  const res = await fetch(`/api/assets/${virtualPath}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function writeTexFile(virtualPath: string, content: string): Promise<void> {
  const bridge = (window as unknown as { CabinetDesktop?: LatexFileBridge }).CabinetDesktop;
  if (bridge && bridge.writeFile) {
    const result = await bridge.writeFile(virtualPath, content);
    if (!result.ok) throw new Error(result.error || "Failed to write file");
    return;
  }
  // Fallback: PUT to /api/assets
  const res = await fetch(`/api/assets/${virtualPath}`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: content,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/* -------------------------------------------------------------------------- */
/*  LaTeX rendering inside an iframe                                           */
/* -------------------------------------------------------------------------- */

function buildLatexIframeDoc(texSource: string): string {
  // Safely embed the tex source as a JSON string literal inside a <script>.
  // JSON.stringify escapes quotes/backslashes/control chars; we also escape
  // < so that </script> in the source can't prematurely close the tag.
  const texJson = JSON.stringify(texSource).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 1rem; background: transparent; }
    .latex-error {
      color: #dc2626; font-family: monospace; font-size: 0.875rem;
      padding: 1rem; border: 1px solid #fca5a5; border-radius: 0.5rem;
      background: #fef2f2; white-space: pre-wrap; word-break: break-word;
    }
  </style>
</head>
<body>
  <div id="latex-output"></div>
  <script type="module">
    import { parse, HtmlGenerator } from '/latex-js/latex.mjs';
    try {
      const texSource = ${texJson};
      const generator = new HtmlGenerator({ hyphenate: true });
      const result = parse(texSource, { generator });
      const output = document.getElementById('latex-output');

      // Inject styles (katex.css, article.css) and scripts (base.js)
      output.appendChild(result.stylesAndScripts('/latex-js/'));

      // Inject the rendered DOM
      const page = document.createElement('div');
      page.setAttribute('class', 'page');
      page.appendChild(result.domFragment());
      output.appendChild(page);

      // Apply CSS custom properties for page geometry
      result.applyLengthsAndGeometryToDom(document.documentElement);

      // Also load the CMU fonts stylesheet
      const fontLink = document.createElement('link');
      fontLink.type = 'text/css';
      fontLink.rel = 'stylesheet';
      fontLink.href = '/latex-js/fonts/cmu.css';
      document.head.appendChild(fontLink);
    } catch (e) {
      const output = document.getElementById('latex-output');
      if (output) {
        output.innerHTML = '<div class="latex-error">LaTeX parse error: ' + (e.message || 'Unknown error') + '</div>';
      }
      console.error('LaTeX.js error:', e);
    }
  </script>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/*  NodeView component                                                         */
/* -------------------------------------------------------------------------- */

type ViewMode = "rendered" | "edit";

function LatexEmbedView({ node, selected }: NodeViewProps) {
  const attrs = node.attrs as LatexEmbedAttrs;
  const texPath = attrs.path;
  const pagePath = useEditorStore((s) => s.currentPath);

  const virtualPath = useMemo(
    () => resolveTexPath(texPath, pagePath),
    [texPath, pagePath]
  );

  const [mode, setMode] = useState<ViewMode>("rendered");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [visible, setVisible] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editContentRef = useRef<string>("");

  // Lazy loading: only render when scrolled into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load the .tex file when visible
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const text = await readTexFile(virtualPath);
        if (!cancelled) {
          setContent(text);
          editContentRef.current = text;
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visible, virtualPath]);

  // Update iframe srcdoc when content changes in rendered mode
  useEffect(() => {
    if (mode !== "rendered" || !visible || !content) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = buildLatexIframeDoc(content);
  }, [mode, visible, content]);

  // Auto-resize textarea in edit mode
  useEffect(() => {
    if (mode !== "edit") return;
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.max(200, ta.scrollHeight)}px`;
    }
  }, [mode, content]);

  const handleSaveAndRender = useCallback(async () => {
    const newContent = editContentRef.current;
    setMode("rendered");
    if (newContent !== content) {
      setDirty(true);
      try {
        await writeTexFile(virtualPath, newContent);
        setContent(newContent);
        setDirty(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setDirty(false);
      }
    }
  }, [content, virtualPath]);

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      editContentRef.current = e.target.value;
    },
    []
  );

  return (
    <NodeViewWrapper
      as="div"
      className="my-3"
      data-latex-embed="true"
      data-path={texPath}
    >
      <div
        ref={containerRef}
        className={`group relative rounded-lg border border-border bg-card overflow-hidden ${
          selected ? "ring-2 ring-primary" : ""
        }`}
        contentEditable={false}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
            <FileText className="h-3.5 w-3.5" />
            {texPath}
            {dirty && <span className="text-amber-500 ml-1">•</span>}
          </span>
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={`inline-flex items-center gap-1 px-2 py-1 transition-colors ${
                mode === "edit"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent"
              }`}
              aria-label="Edit LaTeX source"
            >
              <Code className="h-3 w-3" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (mode === "edit") {
                  handleSaveAndRender();
                } else {
                  setMode("rendered");
                }
              }}
              className={`inline-flex items-center gap-1 px-2 py-1 transition-colors ${
                mode === "rendered"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent"
              }`}
              aria-label="Show rendered LaTeX"
            >
              <Eye className="h-3 w-3" />
              Preview
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-30">
          {!visible ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Waiting to load…
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading LaTeX…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 p-4 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Failed to load .tex file</p>
                <p className="text-xs mt-1">{error}</p>
              </div>
            </div>
          ) : mode === "edit" ? (
            <textarea
              ref={textareaRef}
              defaultValue={content}
              onChange={handleTextareaChange}
              onBlur={handleSaveAndRender}
              spellCheck={false}
              className="block w-full bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-500 resize-none"
              placeholder="LaTeX source…"
              style={{ minHeight: "200px" }}
            />
          ) : (
            <iframe
              ref={iframeRef}
              title="LaTeX render"
              className="w-full border-0 bg-white"
              style={{ minHeight: "200px" }}
              sandbox="allow-scripts allow-same-origin"
              onLoad={() => {
                // Auto-resize iframe to fit content
                try {
                  const iframe = iframeRef.current;
                  if (iframe && iframe.contentWindow) {
                    const height = iframe.contentWindow.document.documentElement.scrollHeight;
                    if (height > 0) iframe.style.height = `${height + 32}px`;
                  }
                } catch {}
              }}
            />
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tiptap Node definition                                                     */
/* -------------------------------------------------------------------------- */

export const LatexEmbedExtension = Node.create({
  name: "latexEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      path: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-latex-embed="true"]',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          return {
            path: element.getAttribute("data-path") ?? "",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-latex-embed": "true" },
        HTMLAttributes as Record<string, unknown>
      ),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LatexEmbedView);
  },

  addCommands() {
    return {
      insertLatexEmbed:
        ({ path }) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { path },
          }),
    };
  },
});

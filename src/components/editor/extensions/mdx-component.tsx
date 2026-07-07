"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useState, useEffect, useRef } from "react";
import { Puzzle, Pencil, Check, Video, Box } from "lucide-react";
import { detectEmbed } from "@/lib/embeds/detect";
import { useEditorStore } from "@/stores/editor-store";
import {
  getMdxComponentSpec,
  isAllowedMdxComponent,
  type MdxPropSpec,
} from "@/lib/mdx/registry";
import type { MdxProps } from "@/lib/mdx/jsx";

interface MdxComponentAttrs {
  name: string;
  props: MdxProps;
  childrenString: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mdxComponent: {
      /**
       * Insert a verified MDX component at the current selection. Routed
       * through here so agents/tools never have to emit raw JSX strings.
       */
      insertMdxComponent: (options: {
        name: string;
        props?: MdxProps;
        children?: string;
      }) => ReturnType;
    };
  }
}

const CALLOUT_TONES: Record<string, string> = {
  info: "border-sky-400/60 bg-sky-50 dark:bg-sky-950/30",
  warning: "border-amber-400/60 bg-amber-50 dark:bg-amber-950/30",
  error: "border-red-400/60 bg-red-50 dark:bg-red-950/30",
  success: "border-emerald-400/60 bg-emerald-50 dark:bg-emerald-950/30",
};

function resolveAssetUrl(src: string, pagePath: string | null): string {
  if (!src) return "";
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
    return src;
  }
  if (src.startsWith("/api/assets/")) {
    return src;
  }
  
  let cleanSrc = src;
  if (src.startsWith("./")) {
    cleanSrc = src.substring(2);
  } else if (src.startsWith("/")) {
    cleanSrc = src.substring(1);
    return `/api/assets/${cleanSrc}`;
  }

  if (!pagePath) return `/api/assets/${cleanSrc}`;

  // If the path starts with the room name (first segment of pagePath),
  // it is already an absolute virtual path from the root.
  const firstSegment = pagePath.split("/")[0];
  if (firstSegment && (cleanSrc === firstSegment || cleanSrc.startsWith(firstSegment + "/"))) {
    return `/api/assets/${cleanSrc}`;
  }

  const pageDir = pagePath.includes("/")
    ? pagePath.substring(0, pagePath.lastIndexOf("/"))
    : "";
  
  const virtualPath = pageDir ? `${pageDir}/${cleanSrc}` : cleanSrc;
  return `/api/assets/${virtualPath}`;
}

function ModelViewerPreview({ src, alt, autoRotate, cameraControls, shadowIntensity }: {
  src: string;
  alt?: string;
  autoRotate?: boolean | string;
  cameraControls?: boolean | string;
  shadowIntensity?: string | number;
}) {
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    import("@google/model-viewer")
      .then(() => setLoaded(true))
      .catch((err) => console.error("Failed to load @google/model-viewer", err));
  }, []);

  // Block Prosemirror from capturing pointer / drag / selection events on the interactive 3D canvas
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const stopEvent = (e: Event) => {
      e.stopPropagation();
    };

    const events = ["mousedown", "mouseup", "mousemove", "pointerdown", "pointerup", "pointermove", "touchstart", "touchend", "touchmove", "dragstart"];
    for (const eventName of events) {
      el.addEventListener(eventName, stopEvent, { passive: false });
    }

    return () => {
      for (const eventName of events) {
        el.removeEventListener(eventName, stopEvent);
      }
    };
  }, [loaded]);

  if (!loaded) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-xs text-muted-foreground animate-pulse">
        Loading 3D Viewer...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      draggable={false}
      className="relative h-64 w-full overflow-hidden rounded-md border border-border bg-muted/10"
    >
      <model-viewer
        src={src}
        alt={alt ?? "3D Model"}
        auto-rotate={autoRotate ? "true" : undefined}
        camera-controls={cameraControls ? "true" : undefined}
        shadow-intensity={shadowIntensity !== undefined ? String(shadowIntensity) : "0.5"}
        draggable={false}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}

/** Render a best-effort preview for known components, generic fallback else. */
function ComponentPreview({ name, props, childrenString }: MdxComponentAttrs) {
  if (name === "Callout") {
    const tone = CALLOUT_TONES[String(props.type ?? "info")] ?? CALLOUT_TONES.info;
    return (
      <div className={`rounded-md border-l-4 px-3 py-2 text-sm ${tone}`}>
        {props.title && <div className="font-semibold mb-0.5">{String(props.title)}</div>}
        <div className="text-foreground/80 whitespace-pre-wrap">
          {childrenString || "Empty callout"}
        </div>
      </div>
    );
  }

  if (name === "VideoPlayer") {
    const url = String(props.url ?? "").trim();
    if (!url) {
      return (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          <Video className="h-4 w-4" />
          No video URL set — click the pencil to add one.
        </div>
      );
    }
    const detected = detectEmbed(url);
    if (detected && detected.provider !== "video") {
      return (
        <div className="aspect-video w-full overflow-hidden rounded-md border border-border">
          <iframe
            src={detected.embedUrl}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            loading="lazy"
          />
        </div>
      );
    }
    return (
      <video
        src={detected?.embedUrl ?? url}
        controls
        className="w-full rounded-md border border-border bg-black"
      />
    );
  }

  if (name === "ModelViewer") {
    const src = String(props.src ?? "").trim();
    if (!src) {
      return (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          <Box className="h-4 w-4" />
          No 3D model asset URL/path set — click the pencil to add one.
        </div>
      );
    }
    const basePath = useEditorStore((s) => s.assetBase || s.currentPath);
    const resolvedSrc = resolveAssetUrl(src, basePath);

    const autoRotate = props.autoRotate === true || props.autoRotate === "true";
    const cameraControls = props.cameraControls !== false && props.cameraControls !== "false";
    const shadowIntensity = props.shadowIntensity !== undefined ? String(props.shadowIntensity) : undefined;

    return (
      <ModelViewerPreview
        src={resolvedSrc}
        alt={props.alt ? String(props.alt) : undefined}
        autoRotate={autoRotate}
        cameraControls={cameraControls}
        shadowIntensity={shadowIntensity}
      />
    );
  }

  if (name === "NotebookCell") {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
        <span className="font-mono text-xs text-muted-foreground">
          In [{String(props.executionCount ?? " ")}]:
        </span>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-foreground/80">
          {childrenString || "[empty code cell]"}
        </pre>
      </div>
    );
  }

  if (name === "CodeOutput") {
    const type = String(props.type ?? "text");
    return (
      <pre className="whitespace-pre-wrap font-mono text-xs rounded-md border border-border bg-muted/30 px-3 py-2 text-foreground/80">
        {type === "stream"
          ? `${String(props.name ?? "stdout")}: ${String(props.text ?? "")}`
          : type === "html"
            ? "[HTML output]"
            : String(props.text ?? "[output]")}
      </pre>
    );
  }

  if (name === "DataFrame") {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        [DataFrame table]
      </div>
    );
  }

  if (name === "PlotlyChart") {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
        [Plotly chart]
      </div>
    );
  }

  if (name === "ImageOutput") {
    const mime = String(props.mime ?? "image/png");
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
        [{mime} output]
      </div>
    );
  }

  if (name === "ErrorOutput") {
    return (
      <pre className="whitespace-pre-wrap font-mono text-xs rounded-md border border-red-400/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-red-600 dark:text-red-400">
        <span className="font-semibold">
          {String(props.ename ?? "Error")}
          {props.evalue ? `: ${String(props.evalue)}` : ""}
        </span>
        {props.traceback ? `\n\n${String(props.traceback)}` : ""}
      </pre>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      {String(props.title ?? "") || childrenString || "No preview available."}
    </p>
  );
}

function MdxComponentView(props: NodeViewProps) {
  const attrs = props.node.attrs as MdxComponentAttrs;
  const [editing, setEditing] = useState(false);
  const spec = getMdxComponentSpec(attrs.name);
  const known = isAllowedMdxComponent(attrs.name);

  const setProp = (key: string, value: string) => {
    props.updateAttributes({ props: { ...attrs.props, [key]: value } });
  };

  return (
    <NodeViewWrapper
      className="mdx-component-block my-2 rounded-md border border-border bg-muted/40 p-3"
      data-mdx-name={attrs.name}
    >
      <div className="mb-2 flex items-center justify-between gap-2" contentEditable={false}>
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-primary">
          {attrs.name === "ModelViewer" ? (
            <>
              <Box className="h-3.5 w-3.5" />
              <span>3D Model Viewer</span>
            </>
          ) : (
            <>
              <Puzzle className="h-3.5 w-3.5" />
              <span>{`<${attrs.name} ${spec?.selfClosing ? "/" : ""}>`}</span>
            </>
          )}
          {!known && (
            <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] text-amber-600">
              unregistered
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent"
          aria-label={editing ? "Done editing" : "Edit component props"}
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>
      </div>

      {editing ? (
        <div className="space-y-2" contentEditable={false}>
          {(spec?.props ?? Object.keys(attrs.props).map((name) => ({ name }))).map(
            (p: MdxPropSpec) => (
              <label key={p.name} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 font-mono text-muted-foreground">
                  {p.name}
                </span>
                {"enum" in p && p.enum ? (
                  <select
                    value={String(attrs.props[p.name] ?? "")}
                    onChange={(e) => setProp(p.name, e.target.value)}
                    className="flex-1 rounded border border-border bg-background px-2 py-1"
                  >
                    <option value="">—</option>
                    {p.enum.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={String(attrs.props[p.name] ?? "")}
                    onChange={(e) => setProp(p.name, e.target.value)}
                    className="flex-1 rounded border border-border bg-background px-2 py-1"
                  />
                )}
              </label>
            )
          )}
          {!spec?.selfClosing && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-mono text-muted-foreground">children</span>
              <textarea
                value={attrs.childrenString}
                onChange={(e) =>
                  props.updateAttributes({ childrenString: e.target.value })
                }
                rows={3}
                className="rounded border border-border bg-background px-2 py-1"
              />
            </label>
          )}
        </div>
      ) : (
        <div className="component-preview" contentEditable={false}>
          <ComponentPreview {...attrs} />
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const MdxComponent = Node.create({
  name: "mdxComponent",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      name: { default: null },
      props: { default: {} },
      childrenString: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-mdx-component]",
        getAttrs: (el) => {
          const element = el as HTMLElement;
          let parsedProps: MdxProps = {};
          try {
            parsedProps = JSON.parse(element.getAttribute("data-props") || "{}");
          } catch {
            parsedProps = {};
          }
          return {
            name: element.getAttribute("data-name"),
            props: parsedProps,
            childrenString: element.getAttribute("data-children") || "",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const name = (HTMLAttributes.name as string) ?? "";
    const props = (HTMLAttributes.props as MdxProps) ?? {};
    const childrenString = (HTMLAttributes.childrenString as string) ?? "";
    return [
      "div",
      mergeAttributes(
        {
          "data-mdx-component": "true",
          "data-name": name,
          "data-props": JSON.stringify(props),
          "data-children": childrenString,
        }
      ),
      // Text content is required so turndown doesn't treat this empty <div> as
      // a "blank" node and drop it before our serialization rule runs. The data
      // we round-trip lives entirely in the attributes above; this text is
      // ignored on both export (turndown rule) and import (parseHTML getAttrs).
      name || "mdx-component",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MdxComponentView);
  },

  addCommands() {
    return {
      insertMdxComponent:
        ({ name, props = {}, children = "" }) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { name, props, childrenString: children },
          }),
    };
  },
});

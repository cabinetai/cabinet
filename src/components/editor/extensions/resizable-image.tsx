"use client";

import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import { useRef, useState, useCallback } from "react";
import { useLocale } from "@/i18n/use-locale";

interface ImageAttrs {
  src: string;
  alt?: string | null;
  title?: string | null;
  width?: string | number | null;
  align?: "left" | "center" | "right" | null;
}

function ResizableImageComponent(props: NodeViewProps) {
  const { t } = useLocale();
  const { node, updateAttributes, selected, editor } = props;
  const attrs = node.attrs as ImageAttrs;
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);

  const align = attrs.align ?? "center";

  const beginResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, anchor: "left" | "right") => {
      if (!editor.isEditable) return;
      e.preventDefault();
      e.stopPropagation();
      const img = imgRef.current;
      const wrap = wrapperRef.current;
      if (!img || !wrap) return;

      const startX = e.clientX;
      const startWidth = img.getBoundingClientRect().width;
      const containerWidth = wrap.parentElement?.getBoundingClientRect().width ?? 800;

      const onMove = (ev: PointerEvent) => {
        const delta = anchor === "right" ? ev.clientX - startX : startX - ev.clientX;
        const next = Math.max(80, Math.min(containerWidth, startWidth + delta));
        setLiveWidth(next);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setLiveWidth((curr) => {
          if (curr != null) {
            updateAttributes({ width: Math.round(curr) });
          }
          return null;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [editor.isEditable, updateAttributes]
  );

  const widthStyle = (() => {
    if (liveWidth != null) return `${Math.round(liveWidth)}px`;
    if (typeof attrs.width === "number") return `${attrs.width}px`;
    if (typeof attrs.width === "string" && attrs.width) return attrs.width;
    return undefined;
  })();

  const alignClass =
    align === "left" ? "mr-auto" : align === "right" ? "ml-auto" : "mx-auto";

  return (
    <NodeViewWrapper
      as="div"
      className={`resizable-image my-3 ${alignClass}`}
      data-align={align}
      style={{ width: widthStyle ?? "fit-content", maxWidth: "100%" }}
    >
      <div
        ref={wrapperRef}
        className={`relative group inline-block max-w-full ${selected ? "ring-2 ring-primary rounded-md" : ""}`}
        contentEditable={false}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={attrs.src}
          alt={attrs.alt ?? ""}
          title={attrs.title ?? undefined}
          className="block rounded-md max-w-full h-auto"
          style={{ width: widthStyle }}
          draggable={false}
        />
        {editor.isEditable && (
          <>
            <div
              aria-label={t("resizableImage:resizeLeft")}
              onPointerDown={(e) => beginResize(e, "left")}
              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <div className="w-1 h-8 bg-white border border-black/40 rounded-full shadow" />
            </div>
            <div
              aria-label={t("resizableImage:resizeRight")}
              onPointerDown={(e) => beginResize(e, "right")}
              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <div className="w-1 h-8 bg-white border border-black/40 rounded-full shadow" />
            </div>
            {liveWidth != null && (
              <div className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white font-mono">
                {Math.round(liveWidth)}px
              </div>
            )}
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  name: "image",
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const w = element.getAttribute("width") ?? element.style.width;
          if (!w) return null;
          const match = /^(\d+)(px)?$/.exec(w);
          return match ? Number(match[1]) : w;
        },
        renderHTML: (attributes: ImageAttrs) => {
          if (!attributes.width) return {};
          const w =
            typeof attributes.width === "number"
              ? `${attributes.width}px`
              : attributes.width;
          return { style: `width: ${w}` };
        },
      },
      align: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-align"),
        renderHTML: (attributes: ImageAttrs) => {
          if (!attributes.align) return {};
          return { "data-align": attributes.align };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

"use client";

import { type Editor } from "@tiptap/react";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  FileCode,
  CheckSquare,
  PilcrowRight,
  PilcrowLeft,
  Underline as UnderlineIcon,
  Baseline,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Superscript as SuperIcon,
  Subscript as SubIcon,
  Link as LinkIcon,
  ImageIcon,
  Video as VideoIcon,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { ColorPalette } from "./color-palette";
import { TEXT_COLORS, HIGHLIGHT_COLORS } from "./extensions/color-highlight";
import { MediaPopover, type MediaKind } from "./media-popover";
import { EmbedPopover } from "./embed-popover";
import { LinkPopover } from "./link-popover";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

interface EditorToolbarProps {
  editor: Editor | null;
}

type PopoverKind =
  | null
  | { type: "color"; anchor: { top: number; left: number }; range: { from: number; to: number } }
  | { type: "highlight"; anchor: { top: number; left: number }; range: { from: number; to: number } }
  | { type: "link"; anchor: { top: number; left: number }; range: { from: number; to: number }; existing: string }
  | { type: "media"; kind: MediaKind; anchor: { top: number; left: number } }
  | { type: "embed"; anchor: { top: number; left: number } };

interface ToolButtonProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  onAction: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Plain toolbar button that preserves the editor selection via mousedown
 * preventDefault, then invokes the action on click.
 */
function ToolButton({ label, icon: Icon, active, disabled, style, onAction }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      style={style}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onClick={(e) => {
        e.preventDefault();
        onAction(e);
      }}
      className={cn(
        "h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-foreground/80 hover:bg-accent transition-colors disabled:opacity-40",
        active && "bg-accent text-foreground ring-1 ring-inset ring-foreground/15"
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const { t } = useLocale();
  const frontmatter = useEditorStore((s) => s.frontmatter);
  const updateFrontmatter = useEditorStore((s) => s.updateFrontmatter);
  const pagePath = useEditorStore((s) => s.currentPath);
  const isRtl = frontmatter?.dir === "rtl";

  const [popover, setPopover] = useState<PopoverKind>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Force re-render on selection/transaction changes so isActive() reflects the
  // current cursor position (the editor object reference is stable so React
  // won't re-render automatically when the internal state changes).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((t) => t + 1);
    editor.on("selectionUpdate", bump);
    editor.on("transaction", bump);
    return () => {
      editor.off("selectionUpdate", bump);
      editor.off("transaction", bump);
    };
  }, [editor]);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    if (!editor) return;
    const el = scrollRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(updateScrollState);
    const onResize = () => updateScrollState();
    window.addEventListener("resize", onResize);
    el.addEventListener("scroll", updateScrollState);
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [editor, updateScrollState]);

  // Translate vertical wheel to horizontal scroll
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    // Only intercept vertical deltas; respect native horizontal wheel devices
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  };

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: "smooth" });
  };

  if (!editor) return null;

  const currentColor = editor.getAttributes("textStyle")?.color ?? null;
  const currentHighlight = editor.getAttributes("highlight")?.color ?? null;

  const captureRange = () => {
    const { from, to } = editor.state.selection;
    return { from, to };
  };

  const applyToRange = (range: { from: number; to: number }, run: () => void) => {
    editor.chain().focus().setTextSelection(range).run();
    run();
  };

  const openPopoverFromButton = (
    e: React.MouseEvent<HTMLElement>,
    build: (anchor: { top: number; left: number }, range: { from: number; to: number }) => PopoverKind
  ) => {
    const btn = e.currentTarget.getBoundingClientRect();
    const anchor = { top: btn.bottom + 6, left: btn.left };
    const range = captureRange();
    setPopover(build(anchor, range));
  };

  const toggleLink = (e: React.MouseEvent<HTMLButtonElement>) => {
    const existing = editor.getAttributes("link")?.href ?? "";
    openPopoverFromButton(e, (anchor, range) => ({
      type: "link",
      anchor,
      range,
      existing,
    }));
  };

  const applyColor = (v: string | null) => {
    if (popover?.type !== "color") return;
    applyToRange(popover.range, () => {
      if (v == null) editor.chain().focus().unsetColor().run();
      else editor.chain().focus().setColor(v).run();
    });
    setPopover(null);
  };

  const applyHighlight = (v: string | null) => {
    if (popover?.type !== "highlight") return;
    applyToRange(popover.range, () => {
      if (v == null) editor.chain().focus().unsetHighlight().run();
      else editor.chain().focus().setHighlight({ color: v }).run();
    });
    setPopover(null);
  };

  const applyLink = (url: string) => {
    if (popover?.type !== "link") return;
    applyToRange(popover.range, () => {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    });
    setPopover(null);
  };

  const removeLink = () => {
    if (popover?.type !== "link") return;
    applyToRange(popover.range, () => {
      editor.chain().focus().unsetLink().run();
    });
    setPopover(null);
  };

  const insertMedia = (
    kind: MediaKind,
    payload: { url: string; alt?: string; mimeType?: string }
  ) => {
    const { url, alt, mimeType } = payload;
    const type = mimeType ?? "";
    const isImage = kind === "image" || type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(url);
    const isVideo = kind === "video" || type.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url);
    if (isImage) {
      editor.chain().focus().setImage({ src: url, alt: alt ?? "" }).run();
    } else if (isVideo) {
      editor.chain().focus().insertContent({
        type: "embed",
        attrs: { provider: "video", src: url, originalUrl: url },
      }).run();
    } else {
      editor.chain().focus().insertContent(`<a href="${url}">${alt ?? url}</a>`).run();
    }
    setPopover(null);
  };

  const insertEmbed = (url: string) => {
    editor.commands.setEmbed({ url });
    setPopover(null);
  };

  type ButtonSpec =
    | { separator: true }
    | {
        icon: React.ComponentType<{ className?: string }>;
        action: (e: React.MouseEvent<HTMLButtonElement>) => void;
        isActive: boolean;
        label: string;
        style?: React.CSSProperties;
      };

  // Audit #012 (review feedback 2026-05-02): the heading-dropdown +
  // More-overflow refactor was reverted. User preferred the original
  // single scrollable row with gradient-fade indicators on both edges.
  // Headings live inline; alignment, sup/sub, divider, embed, video, and
  // RTL stay in the row too. The horizontal-scroll fade + ChevronLeft/
  // Right buttons handle overflow when the viewport is narrow.

  // Primary items — always visible in the toolbar
  const primaryItems: ButtonSpec[] = [
    { icon: Heading1, action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), isActive: editor.isActive("heading", { level: 1 }), label: t("editor:toolbar.heading1") },
    { icon: Heading2, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), isActive: editor.isActive("heading", { level: 2 }), label: t("editor:toolbar.heading2") },
    { icon: Heading3, action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), isActive: editor.isActive("heading", { level: 3 }), label: t("editor:toolbar.heading3") },
    { separator: true },
    { icon: Bold, action: () => editor.chain().focus().toggleBold().run(), isActive: editor.isActive("bold"), label: t("editor:toolbar.bold") },
    { icon: Italic, action: () => editor.chain().focus().toggleItalic().run(), isActive: editor.isActive("italic"), label: t("editor:toolbar.italic") },
    { icon: UnderlineIcon, action: () => editor.chain().focus().toggleUnderline().run(), isActive: editor.isActive("underline"), label: t("editor:toolbar.underline") },
    { icon: Strikethrough, action: () => editor.chain().focus().toggleStrike().run(), isActive: editor.isActive("strike"), label: t("editor:toolbar.strikethrough") },
    { icon: Code, action: () => editor.chain().focus().toggleCode().run(), isActive: editor.isActive("code"), label: t("editor:toolbar.inlineCode") },
    { icon: LinkIcon, action: toggleLink, isActive: editor.isActive("link"), label: t("editor:toolbar.link") },
    {
      icon: Baseline,
      action: (e) =>
        openPopoverFromButton(e, (anchor, range) => ({ type: "color", anchor, range })),
      isActive: currentColor != null,
      label: t("editor:toolbar.textColor"),
      style: currentColor ? { color: currentColor } : undefined,
    },
    {
      icon: Highlighter,
      action: (e) =>
        openPopoverFromButton(e, (anchor, range) => ({ type: "highlight", anchor, range })),
      isActive: currentHighlight != null || editor.isActive("highlight"),
      label: t("editor:toolbar.highlight"),
      style: currentHighlight ? { backgroundColor: currentHighlight } : undefined,
    },
    { separator: true },
    { icon: List, action: () => editor.chain().focus().toggleBulletList().run(), isActive: editor.isActive("bulletList"), label: t("editor:toolbar.bulletList") },
    { icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), isActive: editor.isActive("orderedList"), label: t("editor:toolbar.orderedList") },
    { icon: Quote, action: () => editor.chain().focus().toggleBlockquote().run(), isActive: editor.isActive("blockquote"), label: t("editor:toolbar.blockquote") },
    { icon: CheckSquare, action: () => editor.chain().focus().toggleTaskList().run(), isActive: editor.isActive("taskList"), label: t("editor:toolbar.checklist") },
    { icon: FileCode, action: () => editor.chain().focus().toggleCodeBlock().run(), isActive: editor.isActive("codeBlock"), label: t("editor:toolbar.codeBlock") },
    { icon: Minus, action: () => editor.chain().focus().setHorizontalRule().run(), isActive: false, label: t("editor:toolbar.divider") },
  ];

  // Secondary items — appended to the same scrollable row after the primary set
  const secondaryItems: ButtonSpec[] = [
    { icon: AlignLeft, action: () => editor.chain().focus().setTextAlign("left").run(), isActive: editor.isActive({ textAlign: "left" }), label: t("editor:toolbar.alignLeft") },
    { icon: AlignCenter, action: () => editor.chain().focus().setTextAlign("center").run(), isActive: editor.isActive({ textAlign: "center" }), label: t("editor:toolbar.alignCenter") },
    { icon: AlignRight, action: () => editor.chain().focus().setTextAlign("right").run(), isActive: editor.isActive({ textAlign: "right" }), label: t("editor:toolbar.alignRight") },
    { icon: AlignJustify, action: () => editor.chain().focus().setTextAlign("justify").run(), isActive: editor.isActive({ textAlign: "justify" }), label: t("editor:toolbar.justify") },
    { separator: true },
    { icon: SuperIcon, action: () => editor.chain().focus().toggleSuperscript().run(), isActive: editor.isActive("superscript"), label: t("editor:toolbar.superscript") },
    { icon: SubIcon, action: () => editor.chain().focus().toggleSubscript().run(), isActive: editor.isActive("subscript"), label: t("editor:toolbar.subscript") },
    { separator: true },
    {
      icon: ImageIcon,
      action: (e) => openPopoverFromButton(e, (anchor) => ({ type: "media", kind: "image", anchor })),
      isActive: false,
      label: t("editor:toolbar.insertImage"),
    },
    {
      icon: VideoIcon,
      action: (e) => openPopoverFromButton(e, (anchor) => ({ type: "media", kind: "video", anchor })),
      isActive: false,
      label: t("editor:toolbar.insertVideo"),
    },
    {
      icon: Sparkles,
      action: (e) => openPopoverFromButton(e, (anchor) => ({ type: "embed", anchor })),
      isActive: false,
      label: t("editor:toolbar.embed"),
    },
    { separator: true },
    { icon: Undo, action: () => editor.chain().focus().undo().run(), isActive: false, label: t("editor:toolbar.undo") },
    { icon: Redo, action: () => editor.chain().focus().redo().run(), isActive: false, label: t("editor:toolbar.redo") },
    { separator: true },
    {
      icon: isRtl ? PilcrowLeft : PilcrowRight,
      action: () => updateFrontmatter({ dir: isRtl ? undefined : "rtl" }),
      isActive: isRtl,
      label: isRtl ? t("editor:toolbar.switchToLtr") : t("editor:toolbar.switchToRtl"),
    },
  ];

  return (
    <>
      <div className="relative border-b border-border bg-background/50">
        {/* Scroll indicator arrows */}
        {canScrollLeft && (
          <button
            type="button"
            aria-label={t("editor:toolbar.scrollLeft")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => scrollBy(-1)}
            className="absolute left-0 top-0 bottom-0 w-6 z-10 flex items-center justify-start pl-0.5 bg-gradient-to-r from-background via-background/80 to-transparent text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            aria-label={t("editor:toolbar.scrollRight")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => scrollBy(1)}
            className="absolute right-0 top-0 bottom-0 w-6 z-10 flex items-center justify-end pr-0.5 bg-gradient-to-l from-background via-background/80 to-transparent text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        <div
          ref={scrollRef}
          onWheel={onWheel}
          className="flex items-center gap-0.5 px-2 pt-1 pb-1.5 overflow-x-scroll overflow-y-hidden editor-toolbar-scroll"
        >
          {[...primaryItems, { separator: true } as ButtonSpec, ...secondaryItems].map((item, i) => {
            if ("separator" in item) {
              return (
                <Separator key={i} orientation="vertical" className="mx-1 h-6 shrink-0" />
              );
            }
            return (
              <ToolButton
                key={i}
                label={item.label}
                icon={item.icon}
                active={item.isActive}
                style={item.style}
                onAction={item.action}
              />
            );
          })}
        </div>
      </div>

      {popover && (popover.type === "color" || popover.type === "highlight") && (
        <div
          data-editor-popover="true"
          style={{ position: "fixed", top: popover.anchor.top, left: popover.anchor.left, zIndex: 60 }}
        >
          <div className="bg-popover border border-border rounded-md shadow-lg">
            {popover.type === "color" ? (
              <ColorPalette
                title={t("editor:toolbar.textColor")}
                palette={TEXT_COLORS}
                current={currentColor}
                swatchType="text"
                onSelect={applyColor}
              />
            ) : (
              <ColorPalette
                title={t("editor:toolbar.background")}
                palette={HIGHLIGHT_COLORS}
                current={currentHighlight}
                swatchType="background"
                onSelect={applyHighlight}
              />
            )}
          </div>
        </div>
      )}

      {popover?.type === "link" && (
        <div
          data-editor-popover="true"
          style={{ position: "fixed", top: popover.anchor.top, left: popover.anchor.left, zIndex: 60 }}
        >
          <LinkPopover
            anchor={{ top: 0, left: 0 }}
            initialUrl={popover.existing}
            onCancel={() => setPopover(null)}
            onApply={applyLink}
            onRemove={popover.existing ? removeLink : undefined}
          />
        </div>
      )}

      {popover?.type === "media" && pagePath && (
        <div
          data-editor-popover="true"
          style={{ position: "fixed", top: popover.anchor.top, left: popover.anchor.left, zIndex: 60 }}
        >
          <MediaPopover
            kind={popover.kind}
            pagePath={pagePath}
            anchor={{ top: 0, left: 0 }}
            onCancel={() => setPopover(null)}
            onInsert={(payload) => insertMedia(popover.kind, payload)}
          />
        </div>
      )}

      {popover?.type === "embed" && (
        <div
          data-editor-popover="true"
          style={{ position: "fixed", top: popover.anchor.top, left: popover.anchor.left, zIndex: 60 }}
        >
          <EmbedPopover
            anchor={{ top: 0, left: 0 }}
            onCancel={() => setPopover(null)}
            onInsert={insertEmbed}
          />
        </div>
      )}

      {popover && <ClickOutsideClose onClose={() => setPopover(null)} />}
    </>
  );
}

function ClickOutsideClose({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    // Give the opening click a tick to settle before listening.
    const mount = window.setTimeout(() => {
      const handle = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('[data-editor-popover="true"]')) return;
        onClose();
      };
      window.addEventListener("mousedown", handle);
      // Return cleanup via outer closure: store it on element
      (window as unknown as { __cabinetPopClose?: () => void }).__cabinetPopClose = () =>
        window.removeEventListener("mousedown", handle);
    }, 10);
    return () => {
      window.clearTimeout(mount);
      const w = window as unknown as { __cabinetPopClose?: () => void };
      if (w.__cabinetPopClose) {
        w.__cabinetPopClose();
        w.__cabinetPopClose = undefined;
      }
    };
  }, [onClose]);
  return null;
}

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
  Asterisk,
  ChevronLeft,
  ChevronRight,
  Code2,
  FoldHorizontal,
  UnfoldHorizontal,
} from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ColorPalette } from "./color-palette";
import { TEXT_COLORS, HIGHLIGHT_COLORS } from "./extensions/color-highlight";
import { MediaPopover, type MediaKind } from "./media-popover";
import { EmbedPopover } from "./embed-popover";
import { LinkPopover } from "./link-popover";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";
import { DirIcon } from "@/components/ui/dir-icon";

interface EditorToolbarProps {
  editor: Editor | null;
  /** Whether the raw-markdown source view is active. */
  sourceMode: boolean;
  /** Toggle between the rich editor and the raw-markdown textarea. */
  onToggleSource: () => void;
  /** Whether the page content stretches to the full viewport width. */
  wideMode: boolean;
  /** Toggle between the default reading width and full width. */
  onToggleWide: () => void;
}

type Anchor = { top: number; left?: number; right?: number };

type PopoverKind =
  | null
  | { type: "color"; anchor: Anchor; range: { from: number; to: number } }
  | { type: "highlight"; anchor: Anchor; range: { from: number; to: number } }
  | { type: "link"; anchor: Anchor; range: { from: number; to: number }; existing: string }
  | { type: "media"; kind: MediaKind; anchor: Anchor }
  | { type: "embed"; anchor: Anchor };

interface ToolButtonProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  tabIndex?: number;
  onAction: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Plain toolbar button that preserves the editor selection via mousedown
 * preventDefault, then invokes the action on click.
 */
function ToolButton({ label, icon: Icon, active, disabled, style, tabIndex, onAction }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      style={style}
      tabIndex={tabIndex}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onClick={(e) => {
        e.preventDefault();
        onAction(e);
      }}
      className={cn(
        "h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40",
        active && "bg-accent text-foreground ring-1 ring-inset ring-foreground/15"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

export function EditorToolbar({ editor, sourceMode, onToggleSource, wideMode, onToggleWide }: EditorToolbarProps) {
  const { t, dir: uiDir } = useLocale();
  const isUiRtl = uiDir === "rtl";
  const frontmatter = useEditorStore((s) => s.frontmatter);
  const updateFrontmatter = useEditorStore((s) => s.updateFrontmatter);
  const pagePath = useEditorStore((s) => s.currentPath);
  const isRtl = frontmatter?.dir === "rtl";

  const [popover, setPopover] = useState<PopoverKind>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  // Roving tabindex: exactly one toolbar button is tabbable at a time (#018).
  const [rovingIndex, setRovingIndex] = useState(0);

  // Re-render on selection/mark changes so isActive() reflects the cursor (the
  // editor object reference is stable, so React won't re-render on its own).
  // Coalesce into one render per frame and ignore transactions that changed
  // neither the doc nor the selection — decoration / autosave / plugin meta
  // ticks fire constantly but never alter a toolbar active state, so
  // re-rendering the ~35 buttons for them is pure waste (#019).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setTick((t) => t + 1);
      });
    };
    const onSelection = () => schedule();
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) schedule();
    };
    editor.on("selectionUpdate", onSelection);
    editor.on("transaction", onTransaction);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      editor.off("selectionUpdate", onSelection);
      editor.off("transaction", onTransaction);
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

  // Steer the wheel into the strip only for a horizontal gesture on an
  // overflowing toolbar; a vertical wheel bubbles to the page scroller so it
  // scrolls the page instead of dragging the icon strip sideways (#020).
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (!canScrollLeft && !canScrollRight) return;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    el.scrollLeft += e.deltaX;
  };

  // Roving tabindex: the toolbar is a single Tab stop; Left/Right (mirrored in
  // RTL) + Home/End move focus between the icon buttons (#018).
  const onToolbarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const el = scrollRef.current;
    if (!el) return;
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("button"));
    if (buttons.length === 0) return;
    e.preventDefault();
    const current = buttons.findIndex((b) => b === document.activeElement);
    const forward = isUiRtl ? "ArrowLeft" : "ArrowRight";
    const backward = isUiRtl ? "ArrowRight" : "ArrowLeft";
    let next = current < 0 ? 0 : current;
    if (e.key === forward) next = current < 0 ? 0 : (current + 1) % buttons.length;
    else if (e.key === backward) next = current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = buttons.length - 1;
    buttons[next]?.focus();
    setRovingIndex(next);
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
    build: (anchor: Anchor, range: { from: number; to: number }) => PopoverKind
  ) => {
    const btn = e.currentTarget.getBoundingClientRect();
    // RTL: anchor the popover from the viewport's right edge so it opens
    // toward the logical start instead of running offscreen.
    const anchor: Anchor = isUiRtl
      ? { top: btn.bottom + 6, right: window.innerWidth - btn.right }
      : { top: btn.bottom + 6, left: btn.left };
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
      icon: Asterisk,
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
      <div className="relative flex w-full items-stretch">
        <div className="relative flex-1 min-w-0">
          {/* Scroll indicator arrows */}
          {!sourceMode && canScrollLeft && (
            <button
              type="button"
              aria-label={t("editor:toolbar.scrollLeft")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => scrollBy(-1)}
              className="absolute left-0 rtl:left-auto rtl:right-0 top-0 bottom-0 w-6 z-10 flex items-center justify-start rtl:justify-end ps-0.5 bg-gradient-to-r rtl:bg-gradient-to-l from-[var(--gutter)] via-[var(--gutter)]/80 to-transparent text-muted-foreground hover:text-foreground transition-colors"
            >
              <DirIcon ltr={ChevronLeft} rtl={ChevronRight} className="h-4 w-4" />
            </button>
          )}
          {!sourceMode && canScrollRight && (
            <button
              type="button"
              aria-label={t("editor:toolbar.scrollRight")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => scrollBy(1)}
              className="absolute right-0 rtl:right-auto rtl:left-0 top-0 bottom-0 w-6 z-10 flex items-center justify-end rtl:justify-start pe-0.5 bg-gradient-to-l rtl:bg-gradient-to-r from-[var(--gutter)] via-[var(--gutter)]/80 to-transparent text-muted-foreground hover:text-foreground transition-colors"
            >
              <DirIcon ltr={ChevronRight} rtl={ChevronLeft} className="h-4 w-4" />
            </button>
          )}
          {!sourceMode && (
            <div
              ref={scrollRef}
              role="toolbar"
              aria-label="Formatting"
              aria-orientation="horizontal"
              onWheel={onWheel}
              onKeyDown={onToolbarKeyDown}
              className="flex items-center gap-0.5 px-2 pt-1 pb-1.5 overflow-x-scroll overflow-y-hidden editor-toolbar-scroll [mask-image:linear-gradient(to_right,#000,#000_86%,transparent)] [-webkit-mask-image:linear-gradient(to_right,#000,#000_86%,transparent)]"
            >
              {(() => {
                let btn = -1;
                return [...primaryItems, { separator: true } as ButtonSpec, ...secondaryItems].map((item, i) => {
                  if ("separator" in item) {
                    return (
                      <Separator key={i} orientation="vertical" className="mx-1 h-5 shrink-0" />
                    );
                  }
                  btn += 1;
                  const idx = btn;
                  return (
                    <ToolButton
                      key={i}
                      label={item.label}
                      icon={item.icon}
                      active={item.isActive}
                      style={item.style}
                      tabIndex={idx === rovingIndex ? 0 : -1}
                      onAction={item.action}
                    />
                  );
                });
              })()}
            </div>
          )}
        </div>
        {/* Pinned, non-scrolling source/preview toggle — always reachable
            regardless of how far the formatting row is scrolled. */}
        <div className="shrink-0 flex items-center gap-1 ps-1 pe-2">
          <Separator orientation="vertical" className="h-5" />
          {!sourceMode && (
            <ToolButton
              label={wideMode ? t("editor:toolbar.normalWidth") : t("editor:toolbar.wideMode")}
              icon={wideMode ? FoldHorizontal : UnfoldHorizontal}
              active={wideMode}
              onAction={onToggleWide}
            />
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggleSource}
            className={cn(
              "flex items-center gap-1.5 h-7 shrink-0 px-2 text-[11px] rounded-md transition-colors",
              sourceMode
                ? "bg-accent text-foreground ring-1 ring-inset ring-foreground/15"
                : "text-muted-foreground/70 hover:bg-accent hover:text-foreground"
            )}
          >
            <Code2 className="h-3.5 w-3.5" />
            {sourceMode ? t("editor:toolbar.preview") : t("editor:toolbar.markdown")}
          </button>
        </div>
      </div>

      {popover && (popover.type === "color" || popover.type === "highlight") && (
        <PopoverContainer anchor={popover.anchor}>
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
        </PopoverContainer>
      )}

      {popover?.type === "link" && (
        <PopoverContainer anchor={popover.anchor}>
          <LinkPopover
            anchor={{ top: 0, left: 0 }}
            initialUrl={popover.existing}
            onCancel={() => setPopover(null)}
            onApply={applyLink}
            onRemove={popover.existing ? removeLink : undefined}
          />
        </PopoverContainer>
      )}

      {popover?.type === "media" && pagePath && (
        <PopoverContainer anchor={popover.anchor}>
          <MediaPopover
            kind={popover.kind}
            pagePath={pagePath}
            anchor={{ top: 0, left: 0 }}
            onCancel={() => setPopover(null)}
            onInsert={(payload) => insertMedia(popover.kind, payload)}
          />
        </PopoverContainer>
      )}

      {popover?.type === "embed" && (
        <PopoverContainer anchor={popover.anchor}>
          <EmbedPopover
            anchor={{ top: 0, left: 0 }}
            onCancel={() => setPopover(null)}
            onInsert={insertEmbed}
          />
        </PopoverContainer>
      )}

      {popover && <ClickOutsideClose onClose={() => setPopover(null)} />}
    </>
  );
}

/**
 * Fixed-position wrapper for a toolbar popover that clamps itself back inside
 * the viewport after mounting, so a popover opened from a button near the
 * right/bottom edge can't overflow offscreen and become unreachable (#021).
 */
function PopoverContainer({ anchor, children }: { anchor: Anchor; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Anchor>(anchor);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const next: Anchor = { top: anchor.top };
    if (anchor.left != null) {
      next.left = Math.max(margin, Math.min(anchor.left, vw - margin - rect.width));
    } else if (anchor.right != null) {
      next.right = Math.max(margin, Math.min(anchor.right, vw - margin - rect.width));
    }
    // Clamp up when the popover would run past the bottom edge.
    if (anchor.top + rect.height > vh - margin) {
      next.top = Math.max(margin, vh - margin - rect.height);
    }
    // Repositioning after measuring the rendered size is the entire purpose of
    // this layout effect, so the state write here is intentional, not a loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPos(next);
  }, [anchor]);
  return (
    <div
      ref={ref}
      data-editor-popover="true"
      style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right, zIndex: 60 }}
    >
      {children}
    </div>
  );
}

function ClickOutsideClose({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    // Keep the listener-remover in this effect's own closure — a shared global
    // slot would let a second popover clobber the first's cleanup (#022).
    let remove: (() => void) | null = null;
    // Give the opening click a tick to settle before listening.
    const mount = window.setTimeout(() => {
      const handle = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('[data-editor-popover="true"]')) return;
        onClose();
      };
      window.addEventListener("mousedown", handle);
      remove = () => window.removeEventListener("mousedown", handle);
    }, 10);
    return () => {
      window.clearTimeout(mount);
      remove?.();
    };
  }, [onClose]);
  return null;
}

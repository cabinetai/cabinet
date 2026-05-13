"use client";

import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Link as LinkIcon,
  Baseline,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Superscript as SuperIcon,
  Subscript as SubIcon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { ColorPalette } from "./color-palette";
import { TEXT_COLORS, HIGHLIGHT_COLORS } from "./extensions/color-highlight";
import { LinkPopover } from "./link-popover";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

interface Props {
  editor: Editor | null;
}

type OpenPopover =
  | null
  | { type: "color"; range: { from: number; to: number } }
  | { type: "highlight"; range: { from: number; to: number } }
  | { type: "align"; range: { from: number; to: number } }
  | { type: "link"; range: { from: number; to: number }; existing: string; anchor: { top: number; left: number } };

export function EditorBubbleMenu({ editor }: Props) {
  const { t } = useLocale();
  const [popover, setPopover] = useState<OpenPopover>(null);

  useEffect(() => {
    if (!popover) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-bubble-popover='true']")) return;
      setPopover(null);
    };
    const t = window.setTimeout(() => window.addEventListener("mousedown", handle), 10);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousedown", handle);
    };
  }, [popover]);

  if (!editor) return null;

  const btn = (active: boolean) =>
    cn(
      "h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-foreground/80 transition-colors",
      active && "bg-accent text-foreground"
    );

  const currentColor = editor.getAttributes("textStyle")?.color ?? null;
  const currentHighlight = editor.getAttributes("highlight")?.color ?? null;

  const captureRange = () => {
    const { from, to } = editor.state.selection;
    return { from, to };
  };

  const restore = (range: { from: number; to: number }) =>
    editor.chain().focus().setTextSelection(range).run();

  const toggleMark = (run: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    run();
  };

  const openColor = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setPopover({ type: "color", range: captureRange() });
  };
  const openHighlight = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setPopover({ type: "highlight", range: captureRange() });
  };
  const openAlign = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setPopover({ type: "align", range: captureRange() });
  };
  const openLink = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const existing = editor.getAttributes("link")?.href ?? "";
    const btnRect = e.currentTarget.getBoundingClientRect();
    setPopover({
      type: "link",
      range: captureRange(),
      existing,
      anchor: { top: btnRect.bottom + 6, left: btnRect.left },
    });
  };

  const applyColor = (v: string | null) => {
    if (popover?.type !== "color") return;
    restore(popover.range);
    if (v == null) editor.chain().focus().unsetColor().run();
    else editor.chain().focus().setColor(v).run();
    setPopover(null);
  };

  const applyHighlight = (v: string | null) => {
    if (popover?.type !== "highlight") return;
    restore(popover.range);
    if (v == null) editor.chain().focus().unsetHighlight().run();
    else editor.chain().focus().setHighlight({ color: v }).run();
    setPopover(null);
  };

  const applyAlign = (align: "left" | "center" | "right" | "justify") => {
    if (popover?.type !== "align") return;
    restore(popover.range);
    editor.chain().focus().setTextAlign(align).run();
    setPopover(null);
  };

  const applyLink = (url: string) => {
    if (popover?.type !== "link") return;
    restore(popover.range);
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setPopover(null);
  };

  const removeLink = () => {
    if (popover?.type !== "link") return;
    restore(popover.range);
    editor.chain().focus().unsetLink().run();
    setPopover(null);
  };

  return (
    <>
      <BubbleMenu
        editor={editor}
        options={{ placement: "top", offset: 8 }}
        className="flex items-center gap-0.5 px-1 py-1 bg-popover border border-border rounded-md shadow-lg"
      >
        <button
          type="button"
          className={btn(editor.isActive("bold"))}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMark(() => editor.chain().focus().toggleBold().run())}
          aria-label={t("editor:toolbar.bold")}
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className={btn(editor.isActive("italic"))}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMark(() => editor.chain().focus().toggleItalic().run())}
          aria-label={t("editor:toolbar.italic")}
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className={btn(editor.isActive("underline"))}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMark(() => editor.chain().focus().toggleUnderline().run())}
          aria-label={t("editor:toolbar.underline")}
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className={btn(editor.isActive("strike"))}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMark(() => editor.chain().focus().toggleStrike().run())}
          aria-label={t("editor:toolbar.strikethrough")}
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className={btn(editor.isActive("code"))}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMark(() => editor.chain().focus().toggleCode().run())}
          aria-label={t("editor:toolbar.inlineCode")}
        >
          <Code className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button
          type="button"
          className={btn(editor.isActive("superscript"))}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMark(() => editor.chain().focus().toggleSuperscript().run())}
          aria-label={t("editor:toolbar.superscript")}
        >
          <SuperIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className={btn(editor.isActive("subscript"))}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleMark(() => editor.chain().focus().toggleSubscript().run())}
          aria-label={t("editor:toolbar.subscript")}
        >
          <SubIcon className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <div className="relative">
          <button
            type="button"
            className={btn(currentColor != null)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openColor}
            aria-label={t("editor:toolbar.textColor")}
            style={currentColor ? { color: currentColor } : undefined}
          >
            <Baseline className="w-3.5 h-3.5" />
          </button>
          {popover?.type === "color" && (
            <div
              data-bubble-popover="true"
              className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-lg"
            >
              <ColorPalette
                title={t("editor:toolbar.textColor")}
                palette={TEXT_COLORS}
                current={currentColor}
                swatchType="text"
                onSelect={applyColor}
              />
            </div>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            className={btn(currentHighlight != null || editor.isActive("highlight"))}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openHighlight}
            aria-label={t("editor:toolbar.highlight")}
            style={currentHighlight ? { backgroundColor: currentHighlight } : undefined}
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>
          {popover?.type === "highlight" && (
            <div
              data-bubble-popover="true"
              className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-lg"
            >
              <ColorPalette
                title={t("editor:toolbar.background")}
                palette={HIGHLIGHT_COLORS}
                current={currentHighlight}
                swatchType="background"
                onSelect={applyHighlight}
              />
            </div>
          )}
        </div>
        <div className="w-px h-5 bg-border mx-1" />
        <button
          type="button"
          className={btn(editor.isActive("link"))}
          onMouseDown={(e) => e.preventDefault()}
          onClick={openLink}
          aria-label={t("editor:toolbar.link")}
        >
          <LinkIcon className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <div className="relative">
          <button
            type="button"
            className={btn(false)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openAlign}
            aria-label={t("editor:toolbar.align")}
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          {popover?.type === "align" && (
            <div
              data-bubble-popover="true"
              className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-lg p-1 flex gap-0.5"
            >
              <button type="button" className={btn(editor.isActive({ textAlign: "left" }))} onMouseDown={(e) => e.preventDefault()} onClick={() => applyAlign("left")} aria-label={t("editor:toolbar.alignLeft")}><AlignLeft className="w-3.5 h-3.5" /></button>
              <button type="button" className={btn(editor.isActive({ textAlign: "center" }))} onMouseDown={(e) => e.preventDefault()} onClick={() => applyAlign("center")} aria-label={t("editor:toolbar.alignCenter")}><AlignCenter className="w-3.5 h-3.5" /></button>
              <button type="button" className={btn(editor.isActive({ textAlign: "right" }))} onMouseDown={(e) => e.preventDefault()} onClick={() => applyAlign("right")} aria-label={t("editor:toolbar.alignRight")}><AlignRight className="w-3.5 h-3.5" /></button>
              <button type="button" className={btn(editor.isActive({ textAlign: "justify" }))} onMouseDown={(e) => e.preventDefault()} onClick={() => applyAlign("justify")} aria-label={t("editor:toolbar.justify")}><AlignJustify className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      </BubbleMenu>

      {popover?.type === "link" && (
        <div
          data-bubble-popover="true"
          style={{
            position: "fixed",
            top: popover.anchor.top,
            left: popover.anchor.left,
            zIndex: 60,
          }}
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
    </>
  );
}

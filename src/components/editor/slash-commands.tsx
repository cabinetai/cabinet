"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code,
  Quote,
  Minus,
  Table,
  ImageIcon,
  CheckSquare,
  Info,
  AlertTriangle,
  Video,
  Sparkles,
  File,
  FileText,
  Sigma,
  Smile,
  Type,
  Puzzle,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Zap,
  Workflow,
  Box,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import { useAppStore } from "@/stores/app-store";
import { useLocale } from "@/i18n/use-locale";
import { MediaPopover, type MediaKind } from "./media-popover";
import { EmbedPopover } from "./embed-popover";
import { MathPopover } from "./math-popover";
import { BubbleMenu } from "@tiptap/react/menus";

// Defer emoji-mart (~1 MB of emoji data + picker runtime) until the user
// actually opens the emoji popover from the slash menu.
const EmojiPicker = dynamic(
  () => import("./emoji-picker").then((m) => m.EmojiPicker),
  { ssr: false }
);

type PopoverKind = null | { type: "media"; kind: MediaKind } | { type: "embed" } | { type: "emoji" } | { type: "math"; initial?: string };

interface SlashCommand {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  category: "basic" | "media" | "advanced";
  /**
   * Either a direct editor action or a popover request.
   */
  action:
    | { type: "direct"; run: (editor: Editor) => void }
    | { type: "popover"; kind: Exclude<PopoverKind, null> };
}

/* -------------------------------------------------------------------------- */
/*  Live code block templates for slash commands                               */
/* -------------------------------------------------------------------------- */

const BAR_CHART_TEMPLATE = `<ChartContainer
  config={{
    revenue: { label: "Revenue", color: "var(--chart-1)" },
  }}
  className="h-75 w-full"
>
  <BarChart data={[
    { month: "Jan", revenue: 186 },
    { month: "Feb", revenue: 305 },
    { month: "Mar", revenue: 237 },
    { month: "Apr", revenue: 203 },
    { month: "May", revenue: 409 },
    { month: "Jun", revenue: 314 },
  ]}>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="month" />
    <Bar dataKey="revenue" fill="var(--chart-1)" radius={4} />
    <ChartTooltip content={<ChartTooltipContent />} />
  </BarChart>
</ChartContainer>`;

const LINE_CHART_TEMPLATE = `<ChartContainer
  config={{
    views: { label: "Page Views", color: "var(--chart-2)" },
  }}
  className="h-75 w-full"
>
  <LineChart data={[
    { day: "Mon", views: 120 },
    { day: "Tue", views: 210 },
    { day: "Wed", views: 185 },
    { day: "Thu", views: 290 },
    { day: "Fri", views: 340 },
    { day: "Sat", views: 180 },
    { day: "Sun", views: 220 },
  ]}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="day" />
    <YAxis />
    <Line type="monotone" dataKey="views" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 4 }} />
    <ChartTooltip content={<ChartTooltipContent />} />
  </LineChart>
</ChartContainer>`;

const PIE_CHART_TEMPLATE = `<ChartContainer
  config={{
    chrome: { label: "Chrome", color: "var(--chart-1)" },
    safari: { label: "Safari", color: "var(--chart-2)" },
    firefox: { label: "Firefox", color: "var(--chart-3)" },
    edge: { label: "Edge", color: "var(--chart-4)" },
    other: { label: "Other", color: "var(--chart-5)" },
  }}
  className="h-75 w-full"
>
  <PieChart>
    <Pie
      data={[
        { name: "Chrome", value: 63, fill: "var(--chart-1)" },
        { name: "Safari", value: 19, fill: "var(--chart-2)" },
        { name: "Firefox", value: 8, fill: "var(--chart-3)" },
        { name: "Edge", value: 6, fill: "var(--chart-4)" },
        { name: "Other", value: 4, fill: "var(--chart-5)" },
      ]}
      dataKey="value"
      nameKey="name"
      cx="50%"
      cy="50%"
      innerRadius={60}
      outerRadius={100}
    />
    <ChartTooltip content={<ChartTooltipContent />} />
    <ChartLegend content={<ChartLegendContent />} />
  </PieChart>
</ChartContainer>`;

const commands: SlashCommand[] = [
  // Basic
  { label: "Text", icon: Type, description: "Start writing plain text", category: "basic", action: { type: "direct", run: (editor) => editor.chain().focus().setParagraph().run() } },
  { label: "Heading 1", icon: Heading1, description: "Large section heading", category: "basic", action: { type: "direct", run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run() } },
  { label: "Heading 2", icon: Heading2, description: "Medium section heading", category: "basic", action: { type: "direct", run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() } },
  { label: "Heading 3", icon: Heading3, description: "Small section heading", category: "basic", action: { type: "direct", run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run() } },
  { label: "Bullet List", icon: List, description: "Create a bullet list", category: "basic", action: { type: "direct", run: (editor) => editor.chain().focus().toggleBulletList().run() } },
  { label: "Numbered List", icon: ListOrdered, description: "Create a numbered list", category: "basic", action: { type: "direct", run: (editor) => editor.chain().focus().toggleOrderedList().run() } },
  { label: "Checklist", icon: CheckSquare, description: "Create a task checklist", category: "basic", action: { type: "direct", run: (editor) => editor.chain().focus().toggleTaskList().run() } },
  { label: "Code Block", icon: Code, description: "Insert a code block", category: "basic", action: { type: "direct", run: (editor) => editor.chain().focus().toggleCodeBlock().run() } },
  { label: "Blockquote", icon: Quote, description: "Insert a blockquote", category: "basic", action: { type: "direct", run: (editor) => editor.chain().focus().toggleBlockquote().run() } },
  { label: "Divider", icon: Minus, description: "Insert a horizontal rule", category: "basic", action: { type: "direct", run: (editor) => editor.chain().focus().setHorizontalRule().run() } },
  { label: "Table", icon: Table, description: "Insert a 3×3 table", category: "basic", action: { type: "direct", run: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() } },

  // Media — each opens a popover with Upload + URL tabs
  { label: "Image", icon: ImageIcon, description: "Upload, paste URL, or drop an image", category: "media", action: { type: "popover", kind: { type: "media", kind: "image" } } },
  { label: "Video", icon: Video, description: "Upload or paste a video URL", category: "media", action: { type: "popover", kind: { type: "media", kind: "video" } } },
  { label: "Embed", icon: Sparkles, description: "YouTube, X, Vimeo, Loom, TikTok, Spotify…", category: "media", action: { type: "popover", kind: { type: "embed" } } },
  { label: "File", icon: File, description: "Attach any file to this page", category: "media", action: { type: "popover", kind: { type: "media", kind: "file" } } },

  // Advanced
  { label: "Callout", icon: Info, description: "Insert an info callout", category: "advanced", action: { type: "direct", run: (editor) => editor.chain().focus().wrapIn("callout", { type: "info" }).run() } },
  { label: "Warning", icon: AlertTriangle, description: "Insert a warning callout", category: "advanced", action: { type: "direct", run: (editor) => editor.chain().focus().wrapIn("callout", { type: "warning" }).run() } },
  { label: "Math", icon: Sigma, description: "Insert a LaTeX math expression", category: "advanced", action: { type: "popover", kind: { type: "math" } } },
  { label: "MDX Callout", icon: Puzzle, description: "Insert a verified MDX <Callout> component", category: "advanced", action: { type: "direct", run: (editor) => editor.chain().focus().insertMdxComponent({ name: "Callout", props: { type: "info" }, children: "Your message here." }).run() } },
  { label: "MDX Video", icon: Video, description: "Insert a verified MDX <VideoPlayer /> component", category: "advanced", action: { type: "direct", run: (editor) => editor.chain().focus().insertMdxComponent({ name: "VideoPlayer", props: { url: "" } }).run() } },
  { label: "3D", icon: Box, description: "Insert a verified MDX <ModelViewer /> component", category: "advanced", action: { type: "direct", run: (editor) => editor.chain().focus().insertMdxComponent({ name: "ModelViewer", props: { src: "" } }).run() } },
  { label: "Emoji", icon: Smile, description: "Pick an emoji", category: "advanced", action: { type: "popover", kind: { type: "emoji" } } },

  // Live code blocks — charts & dashboards
  { label: "Bar Chart", icon: BarChart3, description: "Insert a live bar chart (Recharts)", category: "advanced", action: { type: "direct", run: (editor) => editor.commands.insertLiveCodeBlock({ code: BAR_CHART_TEMPLATE }) } },
  { label: "Line Chart", icon: LineChartIcon, description: "Insert a live line chart (Recharts)", category: "advanced", action: { type: "direct", run: (editor) => editor.commands.insertLiveCodeBlock({ code: LINE_CHART_TEMPLATE }) } },
  { label: "Pie Chart", icon: PieChartIcon, description: "Insert a live pie/donut chart", category: "advanced", action: { type: "direct", run: (editor) => editor.commands.insertLiveCodeBlock({ code: PIE_CHART_TEMPLATE }) } },
  { label: "Live Code", icon: Zap, description: "Insert an empty live JSX code block", category: "advanced", action: { type: "direct", run: (editor) => editor.commands.insertLiveCodeBlock({ code: "<div className=\"p-4\">\n  <p>Hello from a live block!</p>\n</div>" }) } },
  { label: "LaTeX File", icon: FileText, description: "Embed and render a .tex file", category: "advanced", action: { type: "direct", run: (editor) => {
    const path = typeof window !== "undefined" ? window.prompt("Path to .tex file (relative to current page or cabinet root):", "document.tex") : null;
    if (path && path.trim()) {
      editor.chain().focus().insertLatexEmbed({ path: path.trim() }).run();
    } else {
      editor.chain().focus().run();
    }
  } } },
  { label: "Draw.io Diagram", icon: Workflow, description: "Insert and edit a local offline diagram", category: "advanced", action: { type: "direct", run: async (editor) => {
    const defaultName = `diagram-${Date.now()}`;
    const name = typeof window !== "undefined" ? window.prompt("Enter a name for the new diagram:", defaultName) : null;
    if (name === null) return;
    
    const sanitized = (name.trim() || defaultName)
      .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "-")
      .replace(/\.\.+/g, "-")
      .trim();
    const filename = `${sanitized}.drawio.svg`;
    const pagePath = useEditorStore.getState().currentPath;
    if (!pagePath) return;

    const blankSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="200px" height="120px" viewBox="0 0 200 120" content="&lt;mxfile host=&quot;Embed&quot; modified=&quot;2026-07-01T09:00:00.000Z&quot; agent=&quot;Cabinet&quot; version=&quot;21.6.8&quot; type=&quot;embed&quot;&gt;&lt;diagram id=&quot;blank&quot; name=&quot;Page-1&quot;&gt;&lt;mxGraphModel dx=&quot;1&quot; dy=&quot;1&quot; grid=&quot;1&quot; gridSize=&quot;10&quot; guides=&quot;1&quot; tooltips=&quot;1&quot; connect=&quot;1&quot; arrows=&quot;1&quot; fold=&quot;1&quot; page=&quot;1&quot; pageScale=&quot;1&quot; pageWidth=&quot;827&quot; pageHeight=&quot;1169&quot; math=&quot;0&quot; shadow=&quot;0&quot;&gt;&lt;root&gt;&lt;mxCell id=&quot;0&quot;/&gt;&lt;mxCell id=&quot;1&quot; parent=&quot;0&quot;/&gt;&lt;/root&gt;&lt;/mxGraphModel&gt;&lt;/diagram&gt;&lt;/mxfile&gt;"><rect width="198" height="118" x="1" y="1" fill="#fcfcfc" stroke="#dddddd" stroke-width="2" stroke-dasharray="5,5" rx="5"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="12" fill="#888888">Empty Diagram</text><g/></svg>`;

    try {
      const assetUrl = `/api/assets/${pagePath}/${filename}`;
      const res = await fetch(assetUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/svg+xml" },
        body: blankSvgContent
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Insert standard resizable image in the editor (uses relative ./ path)
      const imageUrl = `/api/assets/${pagePath}/${filename}`;
      editor.chain().focus().setImage({ src: imageUrl, alt: sanitized }).run();

      // Launch the diagram in the built-in browser
      const editorUrl = `${window.location.origin}/drawio/editor.html?path=${pagePath}/${filename}`;
      useAppStore.getState().setAppMode("browse", editorUrl);
    } catch (err) {
      console.error("Failed to create Draw.io diagram:", err);
      if (typeof window !== "undefined") {
        window.alert(`Error creating diagram: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } } },
  { label: "Excalidraw Drawing", icon: Workflow, description: "Insert and edit a local Excalidraw drawing", category: "advanced", action: { type: "direct", run: async (editor) => {
    const defaultName = `drawing-${Date.now()}`;
    const name = typeof window !== "undefined" ? window.prompt("Enter a name for the new Excalidraw drawing:", defaultName) : null;
    if (name === null) return;
    
    const sanitized = (name.trim() || defaultName)
      .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "-")
      .replace(/\.\.+/g, "-")
      .trim();
    const filename = `${sanitized}.excalidraw.svg`;
    const pagePath = useEditorStore.getState().currentPath;
    if (!pagePath) return;

    const blankSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="200px" height="120px" viewBox="0 0 200 120" data-excalidraw="true"><rect width="198" height="118" x="1" y="1" fill="#fcfcfc" stroke="#dddddd" stroke-width="2" stroke-dasharray="5,5" rx="5"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="12" fill="#888888">Empty Drawing</text></svg>`;

    try {
      const assetUrl = `/api/assets/${pagePath}/${filename}`;
      const res = await fetch(assetUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/svg+xml" },
        body: blankSvgContent
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const imageUrl = `/api/assets/${pagePath}/${filename}`;
      editor.chain().focus().setImage({ src: imageUrl, alt: sanitized }).run();

      const editorUrl = `${window.location.origin}/excalidraw/editor?path=${pagePath}/${filename}`;
      useAppStore.getState().setAppMode("browse", editorUrl);
    } catch (err) {
      console.error("Failed to create Excalidraw drawing:", err);
      if (typeof window !== "undefined") {
        window.alert(`Error creating Excalidraw drawing: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } } },
];

interface SlashCommandsProps {
  editor: Editor | null;
}

export function SlashCommands({ editor }: SlashCommandsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState<{
    top: number;
    left?: number;
    right?: number;
  }>({ top: 0, left: 0 });
  const [popover, setPopover] = useState<PopoverKind>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync popover-open state to a data attribute on the editor DOM so the
  // formatting BubbleMenu (in bubble-menu.tsx) can hide itself.
  useEffect(() => {
    const dom = editor?.view?.dom;
    if (!dom) return;
    if (popover) {
      dom.setAttribute("data-popover-open", "true");
    } else {
      dom.removeAttribute("data-popover-open");
    }
    return () => { dom.removeAttribute("data-popover-open"); };
  }, [popover, editor]);
  const pagePath = useEditorStore((s) => s.currentPath);
  const { dir } = useLocale();

  const filtered = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase())
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const handleSelect = useCallback(
    (command: SlashCommand) => {
      if (!editor) return;
      // Delete the slash and query text
      const { from } = editor.state.selection;
      let slashStart = from - query.length - 1;

      // Strip any immediately preceding '$' signs to avoid duplicate delimiters
      while (slashStart > 1 && editor.state.doc.textBetween(slashStart - 1, slashStart) === "$") {
        slashStart -= 1;
      }

      editor.chain().focus().deleteRange({ from: slashStart, to: from }).run();

      if (command.action.type === "direct") {
        command.action.run(editor);
        handleClose();
      } else {
        setPopover(command.action.kind);
        setOpen(false);
        setQuery("");
      }
    },
    [editor, query, handleClose]
  );

  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) {
        if (event.key === "/") {
          const { from } = editor.state.selection;
          const textBefore = editor.state.doc.textBetween(Math.max(0, from - 1), from);
          if (from === 1 || textBefore === "" || textBefore === "\n" || textBefore === " ") {
            const coords = editor.view.coordsAtPos(from);
            const editorRect = editor.view.dom.getBoundingClientRect();
            setPosition(
              dir === "rtl"
                ? {
                    top: coords.bottom - editorRect.top + 4,
                    // Anchor from the editor's right edge so the menu opens
                    // toward the logical start in RTL.
                    right: editorRect.right - coords.right,
                  }
                : {
                    top: coords.bottom - editorRect.top + 4,
                    left: coords.left - editorRect.left,
                  }
            );
            setOpen(true);
            setQuery("");
            setSelectedIndex(0);
          }
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (filtered[selectedIndex]) handleSelect(filtered[selectedIndex]);
      } else if (event.key === "Backspace") {
        if (query.length === 0) handleClose();
        else {
          setQuery((q) => q.slice(0, -1));
          setSelectedIndex(0);
        }
      } else if (event.key === " ") {
        handleClose();
      } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
        setQuery((q) => q + event.key);
        setSelectedIndex(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [editor, open, query, selectedIndex, filtered, handleClose, handleSelect, dir]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open, handleClose]);

  if (!editor) return null;

  const insertMedia = (kind: MediaKind, payload: { url: string; alt?: string; mimeType?: string }) => {
    if (!editor) return;
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
    if (!editor) return;
    editor.commands.setEmbed({ url });
    setPopover(null);
  };

  const insertEmoji = (native: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(native).run();
    setPopover(null);
  };

  const renderPopover = () => {
    if (!editor || !popover) return null;
    const anchor = position;
    if (popover.type === "media") {
      if (!pagePath) return null;
      return (
        <MediaPopover
          kind={popover.kind}
          pagePath={pagePath}
          anchor={anchor}
          onCancel={() => setPopover(null)}
          onInsert={(payload) => insertMedia(popover.kind, payload)}
        />
      );
    }
    if (popover.type === "embed") {
      return <EmbedPopover anchor={anchor} onCancel={() => setPopover(null)} onInsert={insertEmbed} />;
    }
    if (popover.type === "emoji") {
      return <EmojiPicker anchor={anchor} onSelect={insertEmoji} onClose={() => setPopover(null)} />;
    }
    if (popover.type === "math") {
      // Clamp the popover anchor so its bottom stays ≥10px from the viewport bottom.
      // MathPopover height is ~350px; adjust anchor.top if needed.
      const popoverHeight = 350;
      const viewportBottom = window.innerHeight;
      const editorRect = editor.view.dom.getBoundingClientRect();
      let clampedTop = anchor.top;
      const absoluteBottom = editorRect.top + anchor.top + popoverHeight;
      if (absoluteBottom > viewportBottom - 10) {
        clampedTop = Math.max(0, viewportBottom - 10 - popoverHeight - editorRect.top);
      }

      const closeMathPopover = () => {
        // Collapse the selection BEFORE clearing popover state so there is no
        // frame where data-popover-open is removed while a selection still exists.
        if (editor) {
          const pos = editor.state.selection.to;
          editor.chain().focus().setTextSelection(pos).run();
        }
        setPopover(null);
      };

      return (
        <MathPopover
          anchor={{ ...anchor, top: clampedTop }}
          onCancel={closeMathPopover}
          initialValue={popover.initial || ""}
          onInsert={(latex) => {
            editor.commands.insertContent({
              type: "inlineMath",
              attrs: {
                latex: latex,
                display: "no"
              }
            });
            closeMathPopover();
          }}
        />
      );
    }
    return null;
  };

  // Group filtered commands by category for rendering headers
  const renderAutocompleteMenu = () => {
    if (!editor || !open || filtered.length === 0) return null;

    const byCategory = new Map<string, SlashCommand[]>();
    for (const cmd of filtered) {
      const list = byCategory.get(cmd.category) ?? [];
      list.push(cmd);
      byCategory.set(cmd.category, list);
    }
    const order: { key: string; title: string }[] = [
      { key: "basic", title: "Basic" },
      { key: "media", title: "Media" },
      { key: "advanced", title: "Advanced" },
    ];

    const flatCommands: SlashCommand[] = filtered;

    return (
      <div
        ref={menuRef}
        className="absolute z-50 w-70 bg-popover border border-border rounded-lg shadow-lg py-1 overflow-hidden max-h-95 overflow-y-auto"
        style={{ top: position.top, left: position.left, right: position.right }}
      >
        {order.map((group) => {
          const items = byCategory.get(group.key);
          if (!items || items.length === 0) return null;
          return (
            <div key={group.key}>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground px-3 pt-2 pb-1">
                {group.title}
              </div>
              {items.map((cmd) => {
                const flatIndex = flatCommands.indexOf(cmd);
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.label}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(cmd);
                    }}
                    onMouseEnter={() => setSelectedIndex(flatIndex)}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-1.5 text-left transition-colors",
                      flatIndex === selectedIndex
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium truncate">{cmd.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{cmd.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {renderAutocompleteMenu()}
      {renderPopover()}

      {/* Bubble Menu for Math Nodes */}
      <BubbleMenu
        editor={editor ?? undefined}
        shouldShow={({ editor }: { editor: Editor }) =>
          editor.isActive("inlineMath") && !popover
        }
        options={{
          placement: "top",
          offset: 8,
        }}
        className="flex items-center gap-1 p-1 bg-popover border border-border rounded-md shadow-lg"
      >
        <button
          type="button"
          onClick={() => {
            if (!editor) return;
            const { from } = editor.state.selection;
            const latex = editor.getAttributes("inlineMath").latex || "";

            // Find the exact start position of inlineMath node
            const $pos = editor.state.doc.resolve(from);
            let pos = from;
            if ($pos.nodeAfter && $pos.nodeAfter.type.name === "inlineMath") {
              pos = from;
            } else if ($pos.nodeBefore && $pos.nodeBefore.type.name === "inlineMath") {
              pos = from - 1;
            } else {
              for (let i = $pos.depth; i >= 0; i--) {
                if ($pos.node(i).type.name === "inlineMath") {
                  pos = $pos.start(i) - 1;
                  break;
                }
              }
            }

            // Check if there is an immediately preceding '$' sign in the text editor to clean it up
            let selectFrom = pos;
            while (selectFrom > 1 && editor.state.doc.textBetween(selectFrom - 1, selectFrom) === "$") {
              selectFrom -= 1;
            }

            editor.chain().focus().setTextSelection({ from: selectFrom, to: pos + 1 }).run();

            const coords = editor.view.coordsAtPos(pos);
            const editorRect = editor.view.dom.getBoundingClientRect();

            setPosition({
              top: coords.bottom - editorRect.top + 4,
              left: coords.left - editorRect.left,
            });

            setPopover({ type: "math", initial: latex });
          }}
          className="flex items-center gap-1.5 px-2 py-1 text-[12px] hover:bg-accent text-foreground rounded transition-colors font-medium cursor-pointer"
        >
          <Sigma className="w-3.5 h-3.5 text-primary" /> Edit Equation
        </button>
      </BubbleMenu>
    </>
  );
}

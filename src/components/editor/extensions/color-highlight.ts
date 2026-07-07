import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TextAlign } from "@tiptap/extension-text-align";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const highlightDecorationsKey = new PluginKey("highlightDecorations");

function addHighlightDecoration(decorations: Decoration[], pos: number, attrs: Record<string, string | null | undefined>) {
  const hasNote = !!attrs["data-note"];
  const tagsVal = attrs["data-tags"];
  const tagsList = tagsVal
    ? Array.from(
        new Set(
          String(tagsVal)
            .split(/[\s,]+/)
            .map((t) => t.trim())
            .map((t) => (t.startsWith("#") ? t.slice(1) : t))
            .filter(Boolean)
        )
      )
    : [];

  if (hasNote || tagsList.length > 0) {
    const widget = () => {
      const span = document.createElement("span");
      span.className = "inline-annotation-container ml-1 select-none inline-flex items-center gap-1";
      span.setAttribute("contenteditable", "false");
      span.style.userSelect = "none";
      span.style.verticalAlign = "middle";

      if (hasNote) {
        const iconSpan = document.createElement("span");
        iconSpan.className = "inline-annotation-icon text-muted-foreground hover:text-foreground transition-colors";
        iconSpan.style.display = "inline-flex";
        iconSpan.style.alignItems = "center";
        iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: currentColor; opacity: 0.85;"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18 3a4 4 0 0 1 4 4v1"></path><path d="M16 3v5a1 1 0 0 0 1 1h5"></path></svg>`;
        span.appendChild(iconSpan);
      }

      for (const tag of tagsList) {
        const tagSpan = document.createElement("span");
        tagSpan.className = "inline-annotation-tag";
        tagSpan.style.display = "inline-flex";
        tagSpan.style.alignItems = "center";
        tagSpan.style.backgroundColor = "rgba(139, 94, 60, 0.1)";
        tagSpan.style.color = "rgb(139, 94, 60)";
        tagSpan.style.fontSize = "10px";
        tagSpan.style.fontWeight = "500";
        tagSpan.style.borderRadius = "4px";
        tagSpan.style.padding = "1px 4px";
        tagSpan.style.verticalAlign = "middle";
        tagSpan.textContent = tag;
        span.appendChild(tagSpan);
      }

      span.style.cursor = "pointer";
      span.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        span.dispatchEvent(
          new CustomEvent("open-annotate-click", {
            bubbles: true,
            detail: { pos },
          })
        );
      });

      return span;
    };

    decorations.push(
      Decoration.widget(pos, widget, {
        side: 1,
        ignoreSelection: true,
      })
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];
  let currentHighlight: { from: number; to: number; attrs: Record<string, string | null | undefined> } | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) {
      if (currentHighlight) {
        addHighlightDecoration(decorations, currentHighlight.to, currentHighlight.attrs);
        currentHighlight = null;
      }
      return;
    }

    const highlightMark = node.marks.find((m: import("@tiptap/pm/model").Mark) => m.type.name === "highlight");
    if (highlightMark) {
      if (currentHighlight) {
        if (
          currentHighlight.attrs["data-note"] === highlightMark.attrs["data-note"] &&
          currentHighlight.attrs["data-tags"] === highlightMark.attrs["data-tags"]
        ) {
          currentHighlight.to = pos + node.nodeSize;
        } else {
          addHighlightDecoration(decorations, currentHighlight.to, currentHighlight.attrs);
          currentHighlight = { from: pos, to: pos + node.nodeSize, attrs: highlightMark.attrs };
        }
      } else {
        currentHighlight = { from: pos, to: pos + node.nodeSize, attrs: highlightMark.attrs };
      }
    } else {
      if (currentHighlight) {
        addHighlightDecoration(decorations, currentHighlight.to, currentHighlight.attrs);
        currentHighlight = null;
      }
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalHighlight: any = currentHighlight;
  if (finalHighlight) {
    addHighlightDecoration(decorations, finalHighlight.to, finalHighlight.attrs);
  }

  return DecorationSet.create(doc, decorations);
}

export const HighlightDecorationsPlugin = () => {
  return new Plugin({
    key: highlightDecorationsKey,
    state: {
      init(_, { doc }) {
        return buildDecorations(doc);
      },
      apply(tr, oldState) {
        if (tr.docChanged) {
          return buildDecorations(tr.doc);
        }
        return oldState.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
};

const CustomHighlight = Highlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-note": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-note"),
        renderHTML: (attributes) => {
          if (!attributes["data-note"]) return {};
          return { "data-note": attributes["data-note"] };
        },
      },
      "data-tags": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-tags"),
        renderHTML: (attributes) => {
          if (!attributes["data-tags"]) return {};
          return { "data-tags": attributes["data-tags"] };
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const baseAttrs = {
      ...HTMLAttributes,
      style: HTMLAttributes.color ? `background-color: ${HTMLAttributes.color}; color: #0f172a;` : HTMLAttributes.style,
    };
    return ["mark", baseAttrs, 0];
  },

  parseHTML() {
    return [
      {
        tag: "mark",
      },
      {
        tag: "span.inline-annotation-tag",
        ignore: true,
      },
      {
        tag: "span.inline-annotation-icon",
        ignore: true,
      },
    ];
  },

  addProseMirrorPlugins() {
    return [HighlightDecorationsPlugin()];
  },
});

export const colorAndStyleExtensions = [
  TextStyle,
  Color,
  CustomHighlight.configure({ multicolor: true }),
  Underline,
  Subscript,
  Superscript,
  TextAlign.configure({
    types: ["heading", "paragraph"],
    alignments: ["left", "center", "right", "justify"],
  }),
];

/** Curated palette — 7 text colors + 7 backgrounds mirroring Notion's default set. */
export const TEXT_COLORS: { name: string; value: string | null }[] = [
  { name: "Default", value: null },
  { name: "Gray", value: "#6b7280" },
  { name: "Brown", value: "#92613e" },
  { name: "Orange", value: "#d97706" },
  { name: "Yellow", value: "#ca8a04" },
  { name: "Green", value: "#16a34a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#9333ea" },
  { name: "Pink", value: "#db2777" },
  { name: "Red", value: "#dc2626" },
];

export const HIGHLIGHT_COLORS: { name: string; value: string | null }[] = [
  { name: "Default", value: null },
  { name: "Gray", value: "#e5e7eb" },
  { name: "Brown", value: "#f5e6d8" },
  { name: "Orange", value: "#fed7aa" },
  { name: "Yellow", value: "#fef08a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Purple", value: "#e9d5ff" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Red", value: "#fecaca" },
];

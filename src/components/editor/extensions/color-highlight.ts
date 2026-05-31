import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TextAlign } from "@tiptap/extension-text-align";

export const colorAndStyleExtensions = [
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
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

import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import Link from "@tiptap/extension-link";
import { WikiLink } from "./wiki-link-extension";
import { CalloutExtension } from "./callout-extension";
import { ResizableImage } from "./extensions/resizable-image";
import { EmbedExtension } from "./extensions/embed-extension";
import { colorAndStyleExtensions } from "./extensions/color-highlight";
import { DragHandle } from "./extensions/drag-handle";
import { CabinetMath } from "./extensions/math-extension";
import { IconExtension } from "./extensions/icon-extension";
import { HeadingAnchors } from "./extensions/heading-anchors";
import { AutoDirection } from "./extensions/auto-direction";
import { EditorMentionExtension } from "./mention-extension";

// Curated language set: covers ~95% of real-world snippets. The full `common`
// import bundles 35+ language parsers (~70 kB gzipped) that Cabinet users
// rarely touch — swapping it for this 13-language list cuts the editor chunk
// meaningfully. Add languages as demand grows.
const lowlight = createLowlight({
  bash,
  css,
  go,
  javascript,
  json,
  markdown,
  python,
  rust,
  shell,
  sql,
  typescript,
  xml,
  yaml,
});

export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4] },
    codeBlock: false, // replaced by CodeBlockLowlight
    // StarterKit v3 bundles Link + Underline — we register our own customized
    // versions below (custom Link.extend + colorAndStyleExtensions Underline),
    // so disable the bundled copies to avoid duplicate-extension warnings.
    link: false,
    underline: false,
  }),
  CodeBlockLowlight.configure({
    lowlight,
    HTMLAttributes: {
      class: "rounded-md bg-muted p-4 font-mono text-sm",
    },
  }),
  Placeholder.configure({
    placeholder: "Start writing, or press '/' for commands...",
  }),
  ResizableImage.configure({
    HTMLAttributes: {
      class: "rounded-lg max-w-full",
    },
    allowBase64: false,
  }),
  Table.configure({
    resizable: true,
    lastColumnResizable: false,
    HTMLAttributes: {
      class: "border-collapse w-full",
    },
  }),
  TableRow,
  TableCell,
  TableHeader,
  TaskList.configure({
    HTMLAttributes: {
      class: "task-list",
    },
  }),
  TaskItem.configure({
    nested: true,
  }),
  Link.configure({
    openOnClick: false, // we handle clicks ourselves in the editor
    HTMLAttributes: {
      class: "text-primary underline cursor-pointer",
    },
  }).extend({
    // Exclude wiki-links from the Link mark — they have their own extension
    parseHTML() {
      return [
        {
          tag: 'a[href]:not([data-wiki-link="true"])',
        },
      ];
    },
    // Move the link shortcut off Mod-K — that key is owned by the global
    // search palette everywhere in the app, including inside the editor.
    addKeyboardShortcuts() {
      return {
        "Mod-e": () => {
          const { state } = this.editor;
          const { from, to } = state.selection;
          if (from === to) return false;
          const prevUrl = this.editor.getAttributes("link").href ?? "";
          const url = typeof window !== "undefined" ? window.prompt("Link URL", prevUrl) : null;
          if (url === null) return false;
          if (url === "") {
            return this.editor.chain().focus().extendMarkRange("link").unsetLink().run();
          }
          return this.editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: url })
            .run();
        },
      };
    },
  }),
  ...colorAndStyleExtensions,
  EmbedExtension,
  DragHandle,
  CabinetMath,
  IconExtension,
  WikiLink,
  CalloutExtension,
  HeadingAnchors,
  AutoDirection,
  EditorMentionExtension,
];

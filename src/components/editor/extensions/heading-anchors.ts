import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const HEADING_ANCHOR_KEY = new PluginKey("headingAnchors");

function buildDecorations(doc: Node): DecorationSet {
  const decos: Decoration[] = [];
  const seen = new Map<string, number>();
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const base = slugify(node.textContent);
    if (!base) return;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;
    decos.push(Decoration.node(pos, pos + node.nodeSize, { id }));
  });
  return DecorationSet.create(doc, decos);
}

export const HeadingAnchors = Extension.create({
  name: "headingAnchors",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: HEADING_ANCHOR_KEY,
        state: {
          init(_, { doc }) {
            return buildDecorations(doc);
          },
          apply(tr, old) {
            return tr.docChanged ? buildDecorations(tr.doc) : old;
          },
        },
        props: {
          decorations(state) {
            return HEADING_ANCHOR_KEY.getState(state) as DecorationSet;
          },
        },
      }),
    ];
  },
});

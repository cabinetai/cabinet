import { Extension } from "@tiptap/core";

/**
 * Adds `dir="auto"` to every block-level node's DOM element so the browser
 * infers reading direction from the first strong directional character.
 * Hebrew paragraphs render RTL, English paragraphs render LTR, even in the
 * same document, without the user toggling RTL per block.
 *
 * Mechanics:
 * - `dir="auto"` is HTML5; the browser runs the Unicode Bidi paragraph
 *   algorithm (rule P3) on the element's text content and sets `direction`
 *   accordingly. Affects text alignment (via `text-align: start`), list
 *   marker position, cursor placement, and assistive-tech announcements.
 * - The attribute lives in the schema, so it round-trips through Tiptap's
 *   parse/render cycle. Existing explicit `dir="rtl"` / `dir="ltr"` on
 *   incoming HTML is preserved; nodes without an explicit value default to
 *   "auto".
 * - Markdown conversion via turndown strips `dir` from blocks (it's not a
 *   CommonMark attribute), but on reload the "auto" default reapplies, so
 *   behavior is stable across save/load cycles.
 * - Code blocks are deliberately excluded — they're always LTR monospace.
 * - Frontmatter `dir` still governs the editor wrapper (scroll position,
 *   cursor home for empty paragraphs); this extension only governs the
 *   per-block inline flow.
 */
export const AutoDirection = Extension.create({
  name: "autoDirection",

  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "blockquote",
          "listItem",
          "taskItem",
          "tableCell",
          "tableHeader",
        ],
        attributes: {
          dir: {
            default: "auto",
            keepOnSplit: true,
            parseHTML: (element) => element.getAttribute("dir") || "auto",
            renderHTML: (attrs) => {
              // Honor explicit ltr/rtl that may have been set on a node;
              // otherwise emit auto so the browser infers per-block.
              const dir =
                attrs.dir === "rtl" || attrs.dir === "ltr" ? attrs.dir : "auto";
              return { dir };
            },
          },
        },
      },
    ];
  },
});

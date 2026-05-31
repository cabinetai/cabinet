import { Extension } from "@tiptap/core";

/**
 * Adds `dir="auto"` to container block nodes so the browser infers reading
 * direction from the first strong directional character. Hebrew blocks
 * render RTL, English blocks render LTR, even in the same document, without
 * the user toggling RTL per block.
 *
 * Mechanics:
 * - `dir="auto"` is HTML5; the browser runs the Unicode Bidi paragraph
 *   algorithm (rule P3) on the element's text content and sets `direction`
 *   accordingly. Affects text alignment (via `text-align: start`), list
 *   marker position, cursor placement, and assistive-tech announcements.
 * - `dir="auto"` ignores descendants that carry their own `dir`. That makes
 *   the attribute self-shadowing when nested, so we apply it only to the
 *   element whose own `direction` actually matters:
 *   - NOT on `paragraph`. A paragraph is almost always nested inside a
 *     `listItem`/`blockquote`/`tableCell`. A `<p dir="auto">` would hide its
 *     text from the parent's auto resolution, leaving e.g. a Hebrew `<li>`
 *     resolved LTR with its bullet/number stuck on the left. The paragraph's
 *     own alignment is handled by `unicode-bidi: plaintext; text-align:
 *     start` in globals.css (the primary per-block mechanism), which needs
 *     no attribute.
 *   - NOT on the `<ul>`/`<ol>` container, for the same reason — a list full
 *     of `dir`-bearing items would see no text and fall back to LTR. The
 *     inline indent lives on the `<li>` itself (see `.tiptap li` in
 *     globals.css), so each item resolves its own direction and renders its
 *     marker on the correct side — even in a list mixing Hebrew and English.
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

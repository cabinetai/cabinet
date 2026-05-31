/**
 * Canonical wiki-link helpers. Wiki-links are written `[[Page Name]]` in
 * markdown and resolve to a page by *slug* (see `findPageBySlug` in
 * `editor.tsx`): the link text is slugified and matched against a page's
 * last path segment.
 *
 * The slug rule was duplicated in four places (page-io, to-html,
 * wiki-link-extension, tree-store). Rename-reference rewriting has to match
 * that rule exactly or it would repoint the wrong links, so the canonical
 * implementation now lives here.
 */

/** Lowercase, collapse non-alphanumerics to single dashes, trim edge dashes. */
export function slugifyPageName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface WikiLinkOccurrence {
  /** Index of the leading `[[` in the source string. */
  start: number;
  /** Index just past the trailing `]]`. */
  end: number;
  /** The full matched text, e.g. `[[Page Name]]`. */
  raw: string;
  /** The text between the brackets, e.g. `Page Name`. */
  inner: string;
}

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

/** All `[[...]]` occurrences in source order. */
export function findWikiLinkOccurrences(markdown: string): WikiLinkOccurrence[] {
  const out: WikiLinkOccurrence[] = [];
  WIKI_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKI_LINK_RE.exec(markdown)) !== null) {
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      inner: m[1],
    });
  }
  return out;
}

/**
 * Rewrite the inner text of every wiki-link the predicate accepts to
 * `newName`. Rebuilds the string left-to-right so indices stay valid.
 * Returns the new string and how many occurrences were changed.
 */
export function rewriteWikiLinks(
  markdown: string,
  shouldRewrite: (occ: WikiLinkOccurrence) => boolean,
  newName: string
): { content: string; rewritten: number } {
  const occ = findWikiLinkOccurrences(markdown);
  if (occ.length === 0) return { content: markdown, rewritten: 0 };

  let result = "";
  let cursor = 0;
  let rewritten = 0;
  for (const o of occ) {
    result += markdown.slice(cursor, o.start);
    if (shouldRewrite(o)) {
      result += `[[${newName}]]`;
      rewritten += 1;
    } else {
      result += o.raw;
    }
    cursor = o.end;
  }
  result += markdown.slice(cursor);
  return { content: result, rewritten };
}

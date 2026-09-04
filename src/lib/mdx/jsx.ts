/**
 * MDX <-> Tiptap bridge utilities.
 *
 * Cabinet's editor round-trips content as Markdown <-> HTML <-> ProseMirror.
 * MDX adds JSX component tags (`<Callout type="warning">…</Callout>`) to the
 * Markdown layer. Standard Markdown parsers (remark) treat those tags as raw
 * HTML and either drop or mangle them, so we intercept registered components
 * *before* the Markdown pipeline and rewrite them into a self-contained
 * `<div data-mdx-component>` marker that the `MdxComponent` Tiptap node parses.
 *
 * Three transforms live here:
 *  - `transformMdxToHtml`   Markdown (with JSX) -> Markdown with div markers
 *  - `serializeMdxComponent` Tiptap attrs        -> JSX string (for export)
 *  - `stripMdxForPlaintext` Markdown (with JSX)  -> plain text (for RAG)
 */

import { isAllowedMdxComponent } from "./registry";

export type MdxProps = Record<string, string | number | boolean>;

export interface ParsedMdxComponent {
  name: string;
  props: MdxProps;
  children: string;
  /** Whether the source tag was self-closing (`<X />`). */
  selfClosing: boolean;
}

/** HTML-escape a string for safe use inside a double-quoted attribute. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Reverse of `escapeAttr` — used when reading raw markup outside the DOM. */
export function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/**
 * Parse a JSX opening-tag attribute string (the text between the component
 * name and the closing `>`), e.g. `type="warning" count={3} dismissable`.
 *
 * Quoted attrs become strings. `{…}` expressions are parsed as JSON when
 * possible (numbers, booleans, arrays, objects) and otherwise kept as the raw
 * expression string. A bare attribute becomes boolean `true`.
 */
export function parseJsxAttributes(raw: string): MdxProps {
  const props: MdxProps = {};
  const re =
    /([A-Za-z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\}))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const [, key, dq, sq, expr] = match;
    if (!key) continue;
    if (dq !== undefined) {
      props[key] = dq;
    } else if (sq !== undefined) {
      props[key] = sq;
    } else if (expr !== undefined) {
      const trimmed = expr.trim();
      try {
        props[key] = JSON.parse(trimmed);
      } catch {
        props[key] = trimmed;
      }
    } else {
      props[key] = true;
    }
  }
  return props;
}

/** Serialize a props object back to a JSX attribute string. */
function serializeProps(props: MdxProps): string {
  return Object.entries(props)
    .map(([key, value]) => {
      if (typeof value === "string") return `${key}="${value}"`;
      if (value === true) return key;
      return `${key}={${JSON.stringify(value)}}`;
    })
    .join(" ");
}

/**
 * Serialize a Tiptap `mdxComponent` node's attributes back to a JSX string.
 * Used by the Markdown exporter (turndown rule).
 */
export function serializeMdxComponent(
  name: string,
  props: MdxProps,
  children: string
): string {
  const propsString = serializeProps(props);
  const head = propsString ? `${name} ${propsString}` : name;
  if (children && children.trim().length > 0) {
    return `<${head}>\n${children}\n</${name}>`;
  }
  return `<${head} />`;
}

/**
 * Scan markdown for registered JSX components, returning the regions to ignore
 * (fenced code blocks) so we never rewrite tags that appear inside code.
 */
function findCodeFenceRanges(md: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function isInsideRanges(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/**
 * Locate the matching closing tag for a component, honouring nested tags of the
 * same name. `from` is the index just past the opening tag's `>`.
 * Returns `[childrenStart, childrenEnd, closeEnd]` or null if unbalanced.
 */
function findClosingTag(
  md: string,
  name: string,
  from: number
): [number, number, number] | null {
  const open = new RegExp(`<${name}(?=[\\s/>])`, "g");
  const close = new RegExp(`</${name}\\s*>`, "g");
  let depth = 1;
  let cursor = from;
  while (cursor < md.length) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const openMatch = open.exec(md);
    const closeMatch = close.exec(md);
    if (!closeMatch) return null;
    if (openMatch && openMatch.index < closeMatch.index) {
      depth += 1;
      cursor = openMatch.index + openMatch[0].length;
    } else {
      depth -= 1;
      if (depth === 0) {
        return [from, closeMatch.index, closeMatch.index + closeMatch[0].length];
      }
      cursor = closeMatch.index + closeMatch[0].length;
    }
  }
  return null;
}

interface MdxMatch {
  start: number;
  end: number;
  parsed: ParsedMdxComponent;
}

/**
 * Find every registered MDX component in `md` (outside code fences), parsed and
 * with absolute source ranges. Matches are returned in document order and do
 * not overlap (nested children are owned by their parent's `children` string).
 */
function findMdxComponents(md: string): MdxMatch[] {
  const codeRanges = findCodeFenceRanges(md);
  const matches: MdxMatch[] = [];
  const tagStart = /<([A-Z][A-Za-z0-9]*)((?:[^>"'{}]|"[^"]*"|'[^']*'|\{[\s\S]*?\})*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagStart.exec(md)) !== null) {
    const [full, name, attrRaw, slash] = m;
    if (!isAllowedMdxComponent(name)) continue;
    if (isInsideRanges(m.index, codeRanges)) continue;

    const props = parseJsxAttributes(attrRaw ?? "");
    const openEnd = m.index + full.length;

    if (slash === "/") {
      matches.push({
        start: m.index,
        end: openEnd,
        parsed: { name, props, children: "", selfClosing: true },
      });
      continue;
    }

    const closing = findClosingTag(md, name, openEnd);
    if (!closing) {
      // Unbalanced tag — treat as self-closing so we don't swallow the rest of
      // the document. The serializer will round-trip it as `<Name … />`.
      matches.push({
        start: m.index,
        end: openEnd,
        parsed: { name, props, children: "", selfClosing: true },
      });
      continue;
    }
    const [childStart, childEnd, closeEnd] = closing;
    matches.push({
      start: m.index,
      end: closeEnd,
      parsed: {
        name,
        props,
        children: md.slice(childStart, childEnd).trim(),
        selfClosing: false,
      },
    });
    // Skip past the whole element so nested same-name tags aren't double-counted.
    tagStart.lastIndex = closeEnd;
  }
  return matches;
}

/**
 * Rewrite registered MDX components into `<div data-mdx-component>` markers that
 * the `MdxComponent` Tiptap node can parse. Surrounding blank lines ensure
 * remark treats each marker as a standalone HTML block.
 */
export function transformMdxToHtml(markdown: string): string {
  const matches = findMdxComponents(markdown);
  if (matches.length === 0) return markdown;

  let out = "";
  let last = 0;
  for (const { start, end, parsed } of matches) {
    out += markdown.slice(last, start);
    const propsJson = JSON.stringify(parsed.props);
    const div =
      `<div data-mdx-component="true"` +
      ` data-name="${escapeAttr(parsed.name)}"` +
      ` data-props="${escapeAttr(propsJson)}"` +
      ` data-children="${escapeAttr(parsed.children)}"></div>`;
    out += `\n\n${div}\n\n`;
    last = end;
  }
  out += markdown.slice(last);
  return out;
}

/**
 * Replace registered MDX components with plain-text descriptions so RAG/agent
 * preprocessing focuses on semantic content rather than JSX syntax sugar, e.g.
 * `<Callout type="warning">Danger</Callout>` -> `[Callout (warning): Danger]`.
 */
export function stripMdxForPlaintext(markdown: string): string {
  const matches = findMdxComponents(markdown);
  if (matches.length === 0) return markdown;

  let out = "";
  let last = 0;
  for (const { start, end, parsed } of matches) {
    out += markdown.slice(last, start);
    const variant =
      typeof parsed.props.type === "string" ? ` (${parsed.props.type})` : "";
    const body = parsed.children
      ? `: ${stripMdxForPlaintext(parsed.children)}`
      : parsed.props.url
        ? `: ${parsed.props.url}`
        : parsed.props.src
          ? `: ${parsed.props.src}`
          : "";
    out += `[${parsed.name}${variant}${body}]`;
    last = end;
  }
  out += markdown.slice(last);
  return out;
}

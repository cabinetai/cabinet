/**
 * MDAST → MDX string serialization.
 *
 * Walks a `NotebookRoot` tree and produces an MDX string where:
 *  - standard MDAST nodes (headings, paragraphs, code blocks, …) are
 *    serialized via `remark-stringify`,
 *  - custom `mdxComponent` nodes are serialized as JSX tags
 *    (`<NotebookCell …>…</NotebookCell>`, `<CodeOutput … />`, …).
 *
 * This gives us a single intermediate representation (MDAST) that can be
 * converted to MDX for rendering, or traversed for indexing / RAG.
 */

import { unified } from "unified";
import remarkStringify from "remark-stringify";
import type { Root } from "mdast";
import { type Notebook } from "./types";
import {
  type NotebookRoot,
  type MdxNode,
  type MdxComponentNode,
  notebookToMdast,
} from "./to-mdast";

/** Reusable frozen remark-stringify processor for standard MDAST nodes. */
const stringifier = unified().use(remarkStringify).freeze();

/**
 * Serialize a list of standard MDAST nodes (no mdxComponent nodes) to
 * a Markdown string using remark-stringify.
 */
function serializeStandard(nodes: MdxNode[]): string {
  const root: Root = { type: "root", children: nodes as Root["children"] };
  const result = stringifier.stringify(root);
  return String(result);
}

/**
 * Serialize a props object to a JSX attribute string.
 * String values get double-quoted; numbers/booleans use brace expressions;
 * large string values (like base64 images or HTML) use brace expressions
 * with JSON stringification to avoid quoting issues.
 */
function serializeProps(
  props: Record<string, string | number | boolean>
): string {
  return Object.entries(props)
    .map(([key, value]) => {
      if (typeof value === "boolean") {
        return value ? key : `${key}={false}`;
      }
      if (typeof value === "number") {
        return `${key}={${value}}`;
      }
      // For strings, use brace + JSON.stringify to handle all edge cases
      // (newlines, quotes, backslashes, etc.) safely.
      return `${key}={${JSON.stringify(value)}}`;
    })
    .join(" ");
}

/**
 * Recursively serialize an mdxComponent node to a JSX string.
 */
function serializeMdxComponentNode(node: MdxComponentNode): string {
  const propsString = serializeProps(node.props);
  const head = propsString ? `${node.name} ${propsString}` : node.name;

  if (node.children.length === 0) {
    return `<${head} />`;
  }

  // Serialize children: standard nodes go through remark-stringify,
  // mdxComponent nodes are serialized recursively.
  const standardNodes: MdxNode[] = [];
  const childParts: string[] = [];

  for (const child of node.children) {
    if (child.type === "mdxComponent") {
      // Flush any accumulated standard nodes first
      if (standardNodes.length > 0) {
        childParts.push(serializeStandard(standardNodes).trim());
        standardNodes.length = 0;
      }
      childParts.push(serializeMdxComponentNode(child));
    } else {
      standardNodes.push(child);
    }
  }
  if (standardNodes.length > 0) {
    childParts.push(serializeStandard(standardNodes).trim());
  }

  const body = childParts.join("\n\n");
  return `<${head}>\n${body}\n</${node.name}>`;
}

/**
 * Serialize a full NotebookRoot to an MDX string.
 *
 * Standard MDAST nodes are batched and serialized via remark-stringify.
 * mdxComponent nodes are serialized as JSX tags inline.
 */
export function notebookRootToMdx(root: NotebookRoot): string {
  const parts: string[] = [];
  const standardBatch: MdxNode[] = [];

  for (const node of root.children) {
    if (node.type === "mdxComponent") {
      // Flush standard batch
      if (standardBatch.length > 0) {
        parts.push(serializeStandard(standardBatch).trim());
        standardBatch.length = 0;
      }
      parts.push(serializeMdxComponentNode(node));
    } else {
      standardBatch.push(node);
    }
  }
  if (standardBatch.length > 0) {
    parts.push(serializeStandard(standardBatch).trim());
  }

  return parts.join("\n\n") + "\n";
}

/**
 * Convenience: convert a notebook directly to an MDX string.
 *
 * Pipeline: ipynb JSON → NotebookRoot (MDAST) → MDX string
 */
export function notebookToMdx(notebook: Notebook): string {
  const root = notebookToMdast(notebook);
  return notebookRootToMdx(root);
}

/**
 * Convenience: parse an ipynb JSON string → MDX string.
 */
export function ipynbToMdx(ipynbJson: string): string {
  const notebook = JSON.parse(ipynbJson) as Notebook;
  return notebookToMdx(notebook);
}

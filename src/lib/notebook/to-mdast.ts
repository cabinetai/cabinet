/**
 * ipynb → MDAST conversion.
 *
 * Parses a Jupyter notebook (nbformat v4 JSON) and builds an MDAST
 * (Markdown Abstract Syntax Tree) that uses:
 *
 *  - standard MDAST nodes for markdown cells (parsed via remark),
 *  - `code` nodes for code cell source,
 *  - custom `mdxComponent` MDAST nodes for notebook outputs and cell wrappers.
 *
 * The resulting tree can be serialized to an MDX string via `toMdx()` or
 * traversed directly for indexing, summarization, or format conversion.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, Code } from "mdast";
import {
  type Notebook,
  type NotebookCell,
  type CodeCell,
  type NotebookOutput,
  joinSource,
  stripAnsi,
} from "./types";

/** Custom MDAST node representing an MDX component tag. */
export interface MdxComponentNode {
  type: "mdxComponent";
  name: string;
  props: Record<string, string | number | boolean>;
  children: MdxNode[];
}

/** Union of standard MDAST nodes plus our custom mdxComponent node. */
export type MdxNode = Root["children"][number] | MdxComponentNode;

export interface NotebookRoot {
  type: "root";
  children: MdxNode[];
  /** Original notebook metadata, preserved for round-tripping. */
  data?: {
    notebook?: Notebook;
    language?: string;
  };
}

const remarkParser = unified().use(remarkParse);

/**
 * Parse a markdown cell's source into MDAST children.
 * Returns the children of the root node (not the root itself).
 */
function markdownToMdast(source: string): MdxNode[] {
  if (!source.trim()) return [];
  const tree = remarkParser.parse(source);
  return tree.children as MdxNode[];
}

/**
 * Build a `code` MDAST node for a code cell's source.
 */
function codeToMdast(source: string, language: string): Code {
  return {
    type: "code",
    lang: language,
    value: source,
  };
}

/**
 * Build an `mdxComponent` MDAST node.
 */
function mdxComponent(
  name: string,
  props: Record<string, string | number | boolean> = {},
  children: MdxNode[] = []
): MdxComponentNode {
  return { type: "mdxComponent", name, props, children };
}

/**
 * Convert a notebook output to MDAST nodes (as MDX component tags).
 *
 * Each output type maps to a specific component:
 *  - stream      → <CodeOutput type="stream" name="stdout" />
 *  - error       → <ErrorOutput ename="..." evalue="..." />
 *  - image/png   → <ImageOutput mime="image/png" src="..." />
 *  - image/jpeg  → <ImageOutput mime="image/jpeg" src="..." />
 *  - image/svg   → <ImageOutput mime="image/svg+xml" data="..." />
 *  - text/html   → <CodeOutput type="html" html="..." />
 *  - text/plain  → <CodeOutput type="text" text="..." />
 *  - plotly      → <PlotlyChart data={...} />
 *  - pandas      → <DataFrame data={...} />
 */
function outputToMdast(output: NotebookOutput): MdxComponentNode[] {
  if (output.output_type === "stream") {
    return [
      mdxComponent("CodeOutput", {
        type: "stream",
        name: output.name,
        text: stripAnsi(joinSource(output.text)),
      }),
    ];
  }

  if (output.output_type === "error") {
    return [
      mdxComponent("ErrorOutput", {
        ename: output.ename,
        evalue: output.evalue,
        traceback: output.traceback.map(stripAnsi).join("\n"),
      }),
    ];
  }

  // execute_result | display_data
  const data = output.data || {};
  const nodes: MdxComponentNode[] = [];

  // Detect Plotly JSON in application/vnd.plotly.v1+json
  const plotlyData = data["application/vnd.plotly.v1+json"];
  if (plotlyData) {
    const raw = joinSource(plotlyData);
    try {
      const parsed = JSON.parse(raw);
      nodes.push(mdxComponent("PlotlyChart", { data: JSON.stringify(parsed) }));
    } catch {
      // If it's not valid JSON, fall through to text/html
    }
  }

  // Detect pandas DataFrame in text/html (table with data-id)
  const htmlData = data["text/html"];
  if (htmlData && !nodes.length) {
    const html = joinSource(htmlData);
    // Check if it looks like a pandas table
    if (html.includes("<table") && html.includes("dataframe")) {
      nodes.push(mdxComponent("DataFrame", { html }));
    } else {
      nodes.push(mdxComponent("CodeOutput", { type: "html", html }));
    }
  }

  if (data["image/png"] && !nodes.length) {
    const src = joinSource(data["image/png"]).replace(/\s/g, "");
    nodes.push(mdxComponent("ImageOutput", { mime: "image/png", src }));
  }
  if (data["image/jpeg"] && !nodes.length) {
    const src = joinSource(data["image/jpeg"]).replace(/\s/g, "");
    nodes.push(mdxComponent("ImageOutput", { mime: "image/jpeg", src }));
  }
  if (data["image/svg+xml"] && !nodes.length) {
    nodes.push(mdxComponent("ImageOutput", {
      mime: "image/svg+xml",
      data: joinSource(data["image/svg+xml"]),
    }));
  }
  if (data["text/plain"] && !nodes.length) {
    nodes.push(mdxComponent("CodeOutput", {
      type: "text",
      text: stripAnsi(joinSource(data["text/plain"])),
    }));
  }

  if (nodes.length === 0) {
    // Unknown output type — render as text with the output_type
    nodes.push(mdxComponent("CodeOutput", {
      type: "unknown",
      outputType: output.output_type,
    }));
  }

  return nodes;
}

/**
 * Convert a single notebook cell to MDAST nodes.
 */
function cellToMdast(
  cell: NotebookCell,
  language: string
): MdxNode[] {
  if (cell.cell_type === "markdown") {
    return markdownToMdast(joinSource(cell.source));
  }

  if (cell.cell_type === "raw") {
    return [
      {
        type: "code",
        lang: null,
        value: joinSource(cell.source),
      } as Code,
    ];
  }

  // code cell
  const codeCell = cell as CodeCell;
  const source = joinSource(codeCell.source);
  const count = codeCell.execution_count;

  // Build children: the code itself + any output components
  const children: MdxNode[] = [codeToMdast(source, language)];

  if (codeCell.outputs && codeCell.outputs.length > 0) {
    for (const output of codeCell.outputs) {
      children.push(...outputToMdast(output));
    }
  }

  // Wrap in a NotebookCell component if there are outputs
  if (codeCell.outputs && codeCell.outputs.length > 0) {
    return [
      mdxComponent(
        "NotebookCell",
        {
          language,
          executionCount: count ?? "",
        },
        children
      ),
    ];
  }

  // No outputs — just emit the code block directly
  return children;
}

/**
 * Convert a full notebook (nbformat v4 JSON) to an MDAST tree.
 *
 * Markdown cells become normal MDAST content (headings, paragraphs, lists, …).
 * Code cells become `code` nodes, optionally wrapped in a `<NotebookCell>`
 * component when they have outputs. Outputs become MDX component nodes
 * (`<CodeOutput>`, `<DataFrame>`, `<PlotlyChart>`, `<ImageOutput>`,
 * `<ErrorOutput>`).
 *
 * The original notebook is preserved in `root.data.notebook` for round-tripping.
 */
export function notebookToMdast(notebook: Notebook): NotebookRoot {
  const language =
    notebook.metadata?.language_info?.name ||
    notebook.metadata?.kernelspec?.name ||
    "python";

  const children: MdxNode[] = [];
  for (const cell of notebook.cells ?? []) {
    children.push(...cellToMdast(cell, language));
  }

  return {
    type: "root",
    children,
    data: { notebook, language },
  };
}

/**
 * Convenience: parse ipynb JSON string → MDAST tree.
 */
export function ipynbToMdast(ipynbJson: string): NotebookRoot {
  const notebook = JSON.parse(ipynbJson) as Notebook;
  return notebookToMdast(notebook);
}

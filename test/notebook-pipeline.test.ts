import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { notebookToMdast, type MdxComponentNode } from "../src/lib/notebook/to-mdast";
import { notebookRootToMdx, notebookToMdx, ipynbToMdx } from "../src/lib/notebook/to-mdx";
import type { Notebook } from "../src/lib/notebook/types";

describe("notebookToMdast", () => {
  it("converts markdown cells to MDAST nodes", () => {
    const nb: Notebook = {
      cells: [
        { cell_type: "markdown", source: ["# Title\n", "Hello **world**"] },
      ],
    };
    const root = notebookToMdast(nb);
    assert.equal(root.children.length, 2);
    assert.equal(root.children[0].type, "heading");
    assert.equal(root.children[1].type, "paragraph");
  });

  it("converts code cells without outputs to code nodes", () => {
    const nb: Notebook = {
      cells: [
        {
          cell_type: "code",
          source: ["print('hello')"],
          execution_count: 1,
          outputs: [],
        },
      ],
      metadata: { language_info: { name: "python" } },
    };
    const root = notebookToMdast(nb);
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0].type, "code");
  });

  it("wraps code cells with outputs in NotebookCell component", () => {
    const nb: Notebook = {
      cells: [
        {
          cell_type: "code",
          source: ["print('hello')"],
          execution_count: 1,
          outputs: [
            {
              output_type: "stream",
              name: "stdout",
              text: "hello\n",
            },
          ],
        },
      ],
      metadata: { language_info: { name: "python" } },
    };
    const root = notebookToMdast(nb);
    assert.equal(root.children.length, 1);
    const node = root.children[0] as MdxComponentNode;
    assert.equal(node.type, "mdxComponent");
    assert.equal(node.name, "NotebookCell");
    assert.equal(node.props.language, "python");
    assert.equal(node.props.executionCount, 1);
    // Children: code node + CodeOutput component
    assert.equal(node.children.length, 2);
    assert.equal(node.children[0].type, "code");
    const outputNode = node.children[1] as MdxComponentNode;
    assert.equal(outputNode.type, "mdxComponent");
    assert.equal(outputNode.name, "CodeOutput");
    assert.equal(outputNode.props.type, "stream");
    assert.equal(outputNode.props.name, "stdout");
    assert.equal(outputNode.props.text, "hello\n");
  });

  it("converts error outputs to ErrorOutput component", () => {
    const nb: Notebook = {
      cells: [
        {
          cell_type: "code",
          source: ["1/0"],
          execution_count: 3,
          outputs: [
            {
              output_type: "error",
              ename: "ZeroDivisionError",
              evalue: "division by zero",
              traceback: ["Traceback...", "ZeroDivisionError: division by zero"],
            },
          ],
        },
      ],
    };
    const root = notebookToMdast(nb);
    const cellNode = root.children[0] as MdxComponentNode;
    assert.equal(cellNode.name, "NotebookCell");
    const errNode = cellNode.children[1] as MdxComponentNode;
    assert.equal(errNode.name, "ErrorOutput");
    assert.equal(errNode.props.ename, "ZeroDivisionError");
    assert.equal(errNode.props.evalue, "division by zero");
  });

  it("converts image/png output to ImageOutput component", () => {
    const nb: Notebook = {
      cells: [
        {
          cell_type: "code",
          source: ["import matplotlib; plt.plot([1,2])"],
          execution_count: 1,
          outputs: [
            {
              output_type: "display_data",
              data: { "image/png": "iVBORw0KGgo=" },
            },
          ],
        },
      ],
    };
    const root = notebookToMdast(nb);
    const cellNode = root.children[0] as MdxComponentNode;
    const imgNode = cellNode.children[1] as MdxComponentNode;
    assert.equal(imgNode.name, "ImageOutput");
    assert.equal(imgNode.props.mime, "image/png");
    assert.equal(imgNode.props.src, "iVBORw0KGgo=");
  });

  it("converts pandas HTML to DataFrame component", () => {
    const html = '<table class="dataframe"><tr><td>1</td></tr></table>';
    const nb: Notebook = {
      cells: [
        {
          cell_type: "code",
          source: ["df.head()"],
          execution_count: 1,
          outputs: [
            {
              output_type: "execute_result",
              execution_count: 1,
              data: { "text/html": html },
            },
          ],
        },
      ],
    };
    const root = notebookToMdast(nb);
    const cellNode = root.children[0] as MdxComponentNode;
    const dfNode = cellNode.children[1] as MdxComponentNode;
    assert.equal(dfNode.name, "DataFrame");
    assert.equal(dfNode.props.html, html);
  });

  it("converts Plotly JSON to PlotlyChart component", () => {
    const plotlySpec = JSON.stringify({ data: [{ x: [1, 2], y: [3, 4] }] });
    const nb: Notebook = {
      cells: [
        {
          cell_type: "code",
          source: ["import plotly; fig.show()"],
          execution_count: 1,
          outputs: [
            {
              output_type: "display_data",
              data: { "application/vnd.plotly.v1+json": plotlySpec },
            },
          ],
        },
      ],
    };
    const root = notebookToMdast(nb);
    const cellNode = root.children[0] as MdxComponentNode;
    const chartNode = cellNode.children[1] as MdxComponentNode;
    assert.equal(chartNode.name, "PlotlyChart");
    assert.equal(typeof chartNode.props.data, "string");
  });

  it("preserves notebook metadata in root.data", () => {
    const nb: Notebook = {
      cells: [],
      metadata: { language_info: { name: "r" } },
    };
    const root = notebookToMdast(nb);
    assert.equal(root.data?.language, "r");
    assert.deepEqual(root.data?.notebook, nb);
  });
});

describe("notebookRootToMdx", () => {
  it("serializes markdown + code to MDX", () => {
    const nb: Notebook = {
      cells: [
        { cell_type: "markdown", source: "# Title" },
        {
          cell_type: "code",
          source: "print('hi')",
          execution_count: 1,
          outputs: [],
        },
      ],
      metadata: { language_info: { name: "python" } },
    };
    const root = notebookToMdast(nb);
    const mdx = notebookRootToMdx(root);
    assert.ok(mdx.includes("# Title"));
    assert.ok(mdx.includes("```python"));
    assert.ok(mdx.includes("print('hi')"));
  });

  it("serializes NotebookCell with outputs as JSX", () => {
    const nb: Notebook = {
      cells: [
        {
          cell_type: "code",
          source: "print('hello')",
          execution_count: 1,
          outputs: [
            { output_type: "stream", name: "stdout", text: "hello\n" },
          ],
        },
      ],
      metadata: { language_info: { name: "python" } },
    };
    const mdx = notebookToMdx(nb);
    assert.ok(mdx.includes("<NotebookCell"), `Expected NotebookCell in: ${mdx}`);
    assert.ok(mdx.includes("<CodeOutput"), `Expected CodeOutput in: ${mdx}`);
    assert.ok(mdx.includes("</NotebookCell>"), `Expected closing tag in: ${mdx}`);
  });

  it("serializes self-closing components for outputs without children", () => {
    const nb: Notebook = {
      cells: [
        {
          cell_type: "code",
          source: "x = 1/0",
          execution_count: 1,
          outputs: [
            {
              output_type: "error",
              ename: "ZeroDivisionError",
              evalue: "division by zero",
              traceback: ["trace"],
            },
          ],
        },
      ],
    };
    const mdx = notebookToMdx(nb);
    assert.ok(mdx.includes("<ErrorOutput"));
    assert.ok(mdx.includes("/>"));
  });
});

describe("ipynbToMdx (full pipeline)", () => {
  it("parses ipynb JSON string end-to-end", () => {
    const ipynb = JSON.stringify({
      cells: [
        { cell_type: "markdown", source: ["# My Notebook\n", "Some text."] },
        {
          cell_type: "code",
          source: ["print('hello')"],
          execution_count: 1,
          outputs: [{ output_type: "stream", name: "stdout", text: "hello\n" }],
        },
      ],
      metadata: { language_info: { name: "python" } },
    });
    const mdx = ipynbToMdx(ipynb);
    assert.ok(mdx.includes("# My Notebook"));
    assert.ok(mdx.includes("Some text."));
    assert.ok(mdx.includes("<NotebookCell"));
    assert.ok(mdx.includes("<CodeOutput"));
    assert.ok(mdx.includes("hello"));
  });
});

/**
 * Shared nbformat v4 types.
 *
 * These are used by both the notebook viewer and the ipynb → MDAST → MDX
 * conversion pipeline so that the two layers never drift apart.
 */

export type StringOrLines = string | string[];

export interface NotebookOutputBase {
  output_type: string;
}
export interface StreamOutput extends NotebookOutputBase {
  output_type: "stream";
  name: "stdout" | "stderr";
  text: StringOrLines;
}
export interface DataOutput extends NotebookOutputBase {
  output_type: "execute_result" | "display_data";
  execution_count?: number | null;
  data: Record<string, StringOrLines>;
}
export interface ErrorOutput extends NotebookOutputBase {
  output_type: "error";
  ename: string;
  evalue: string;
  traceback: string[];
}
export type NotebookOutput = StreamOutput | DataOutput | ErrorOutput;

export interface NotebookCellBase {
  cell_type: "code" | "markdown" | "raw";
  source: StringOrLines;
  metadata?: Record<string, unknown>;
  id?: string;
}
export interface CodeCell extends NotebookCellBase {
  cell_type: "code";
  execution_count?: number | null;
  outputs?: NotebookOutput[];
}
export interface MarkdownCell extends NotebookCellBase {
  cell_type: "markdown";
}
export interface RawCell extends NotebookCellBase {
  cell_type: "raw";
}
export type NotebookCell = CodeCell | MarkdownCell | RawCell;

export interface Notebook {
  cells?: NotebookCell[];
  metadata?: {
    kernelspec?: { name?: string; display_name?: string };
    language_info?: { name?: string };
  };
  nbformat?: number;
  nbformat_minor?: number;
}

/** Join a nbformat `source` field (which may be an array of lines) into a single string. */
export function joinSource(s: StringOrLines | undefined): string {
  if (s == null) return "";
  return Array.isArray(s) ? s.join("") : s;
}

/** Strip ANSI escape sequences from stream output / tracebacks. */
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

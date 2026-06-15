/**
 * Smart paste preprocessor for live JSX code blocks.
 *
 * When users copy-paste code from documentation or tutorials the snippet
 * typically includes module-level noise that cannot run inside a sandboxed
 * evaluator: `import` statements, `export default` wrappers, and `"use
 * client"` / `"use server"` directives.
 *
 * `stripImportsAndWrappers` removes that boilerplate and returns the bare JSX
 * expression the evaluator needs.
 */

/* -------------------------------------------------------------------------- */
/*  Regex patterns                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Matches ES module `import` declarations (single- and multi-line).
 *
 * Handles:
 *  - `import { X } from '…'`
 *  - `import X from '…'`
 *  - `import * as X from '…'`
 *  - `import '…'`  (side-effect imports)
 *  - Multi-line destructured imports
 */
const IMPORT_RE =
  /^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]*['"];?\s*$/gm;

/**
 * Matches `"use client"` and `"use server"` directives at the top of a file.
 * Supports both single and double quotes, with or without a trailing semicolon.
 */
const DIRECTIVE_RE = /^\s*["']use (?:client|server)["'];?\s*$/gm;

/**
 * Matches `export default function Name(…) { return (…) }` wrappers.
 * Captures the JSX body inside the `return (…)`.
 *
 * Group 1: the JSX body.
 */
const EXPORT_DEFAULT_FUNCTION_RE =
  /^\s*export\s+default\s+function\s+\w*\s*\([^)]*\)\s*\{[\s\S]*?return\s*\(([\s\S]*)\)\s*;?\s*\}\s*$/;

/**
 * Matches `export default () => (…)` wrappers.
 * Captures the JSX body inside the parentheses.
 *
 * Group 1: the JSX body.
 */
const EXPORT_DEFAULT_ARROW_PAREN_RE =
  /^\s*export\s+default\s+(?:const\s+\w+\s*=\s*)?\(?[^)]*\)?\s*=>\s*\(([\s\S]*)\)\s*;?\s*$/;

/**
 * Matches `export default () => <JSX…>` (arrow without parens).
 * Captures the JSX body.
 *
 * Group 1: the JSX body.
 */
const EXPORT_DEFAULT_ARROW_BARE_RE =
  /^\s*export\s+default\s+(?:const\s+\w+\s*=\s*)?\(?[^)]*\)?\s*=>\s*(<[\s\S]*>)\s*;?\s*$/;

/**
 * Matches named export + function: `export function Name() { return (…) }`
 *
 * Group 1: the JSX body.
 */
const EXPORT_NAMED_FUNCTION_RE =
  /^\s*export\s+function\s+\w+\s*\([^)]*\)\s*\{[\s\S]*?return\s*\(([\s\S]*)\)\s*;?\s*\}\s*$/;

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Strip import statements, directives, and export wrappers from a JSX snippet,
 * returning just the renderable JSX expression.
 *
 * @example
 * ```ts
 * stripImportsAndWrappers(`
 *   "use client"
 *   import { BarChart } from "recharts"
 *   export default function Chart() {
 *     return (<BarChart data={data}><Bar dataKey="v" /></BarChart>)
 *   }
 * `);
 * // => '<BarChart data={data}><Bar dataKey="v" /></BarChart>'
 * ```
 */
export function stripImportsAndWrappers(code: string): string {
  // 1. Strip directives
  let cleaned = code.replace(DIRECTIVE_RE, "");

  // 2. Strip import statements
  cleaned = cleaned.replace(IMPORT_RE, "");

  // 3. Trim leading/trailing whitespace left by removed lines
  cleaned = cleaned.trim();

  // 4. If what remains is an export wrapper, unwrap it
  const unwrapped =
    tryUnwrap(cleaned, EXPORT_DEFAULT_FUNCTION_RE) ??
    tryUnwrap(cleaned, EXPORT_NAMED_FUNCTION_RE) ??
    tryUnwrap(cleaned, EXPORT_DEFAULT_ARROW_PAREN_RE) ??
    tryUnwrap(cleaned, EXPORT_DEFAULT_ARROW_BARE_RE);

  if (unwrapped) return unwrapped.trim();

  // 5. Strip `export` keyword from remaining non-default exports.
  //    e.g. `export const chartConfig = …` → `const chartConfig = …`
  //    and  `export function Chart()` → `function Chart()`
  cleaned = cleaned.replace(/^export\s+(?!default\b)/gm, "");

  // 6. Strip metadata-only `const description = "…"` lines that some docs add.
  //    These serve no runtime purpose inside a live code block.
  cleaned = cleaned.replace(
    /^const\s+description\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`)\s*;?\s*$/gm,
    "",
  );

  // 7. Unwrap a trailing function definition that returns JSX, even when
  //    preceded by variable declarations (e.g. code pasted from shadcn docs).
  //    `const data = [...]\nfunction Chart() { return (<JSX>) }`
  //    → `const data = [...];\n<JSX>`
  //    The semicolon after the preamble is CRITICAL — without it Sucrase
  //    interprets the `<` in JSX as a less-than operator.
  const trailingFnMatch = cleaned.match(
    /^([\s\S]*?)(?:export\s+)?function\s+\w+\s*\([^)]*\)\s*\{\s*return\s*\(\s*([\s\S]*)\s*\)\s*;?\s*\}\s*$/,
  );
  if (trailingFnMatch) {
    const preamble = trailingFnMatch[1].trim();
    const jsxBody = trailingFnMatch[2].trim();
    // Semicolon ensures Sucrase treats `<Foo>` as JSX, not comparison.
    cleaned = preamble ? `${preamble};\n\n${jsxBody}` : jsxBody;
  }

  return cleaned.trim();
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Try to match `re` against `source` and return the first capture group. */
function tryUnwrap(source: string, re: RegExp): string | null {
  const m = re.exec(source);
  return m?.[1] ?? null;
}

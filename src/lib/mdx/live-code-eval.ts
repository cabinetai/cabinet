"use client";

/**
 * Live JSX evaluator for Cabinet's code blocks.
 *
 * Transforms a JSX source string into a renderable `React.ReactElement` by:
 *  1. Transpiling JSX → `React.createElement` calls via Sucrase (fast, no Babel).
 *  2. Evaluating the transpiled code inside a `new Function()` with injected
 *     scope bindings (React, Recharts, shadcn chart components, etc.).
 *
 * The function behaves like a REPL — the *last expression* in the code is
 * treated as the return value. This lets users write `<BarChart … />` without
 * an explicit `return` statement.
 *
 * All errors (syntax or runtime) are caught and returned as `{ error }` so the
 * calling component can display an inline error overlay instead of crashing.
 */

import * as React from "react";
import { transform } from "sucrase";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

/** Discriminated union returned by the evaluator. */
export type EvalResult =
  | { element: React.ReactElement; error?: undefined }
  | { error: string; element?: undefined };

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Evaluate a JSX code string and return a React element or an error.
 *
 * @param code  - Raw JSX source (post-strip, no imports / exports).
 * @param scope - Map of identifier names → values that should be available to
 *                the code at runtime (e.g. `{ React, BarChart, XAxis, … }`).
 *
 * @example
 * ```ts
 * const result = evaluateLiveCode(
 *   '<div>Hello</div>',
 *   { React, ...Recharts },
 * );
 * if (result.element) render(result.element);
 * ```
 */
export function evaluateLiveCode(
  code: string,
  scope: Record<string, unknown>,
): EvalResult {
  try {
    /* -------------------------------------------------------------------- */
    /*  1. Transpile JSX → createElement                                    */
    /* -------------------------------------------------------------------- */

    const transformed = transform(code, {
      transforms: ["jsx", "typescript"],
      jsxRuntime: "classic",
      production: true,
    }).code;

    /* -------------------------------------------------------------------- */
    /*  2. Wrap so the last expression is returned (REPL style)             */
    /* -------------------------------------------------------------------- */

    const wrapped = wrapForReturn(transformed);

    /* -------------------------------------------------------------------- */
    /*  3. Build and execute the sandboxed function                          */
    /* -------------------------------------------------------------------- */

    const scopeKeys = Object.keys(scope);
    const scopeValues = scopeKeys.map((k) => scope[k]);

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(...scopeKeys, wrapped);
    const element = fn(...scopeValues);

    /* -------------------------------------------------------------------- */
    /*  4. Validate the result                                              */
    /* -------------------------------------------------------------------- */

    if (!React.isValidElement(element)) {
      return {
        error:
          "The code did not return a valid React element. " +
          "Make sure the last expression is a JSX element like <div>…</div>.",
      };
    }

    return { element };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown evaluation error";
    return { error: message };
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Wrap transpiled code so that the last expression statement is returned.
 *
 * Sucrase preserves the original line structure, so a multi-line JSX element
 * like `<Foo>\n  <Bar />\n</Foo>` becomes a multi-line
 * `React.createElement(Foo, null,\n  React.createElement(Bar, null)\n)`.
 *
 * We cannot simply split on the last newline (that would insert `return`
 * before a closing paren, breaking the expression). Instead:
 *
 *  - **Single expression** (no declarations): wrap the entire output in
 *    `return (\n…\n)`. This is the common case for pasted JSX.
 *  - **Multi-statement** (has declarations): find the boundary after the
 *    last semicolon (or last `React.createElement` start) and `return` the
 *    trailing expression.
 *  - **Explicit top-level `return`**: leave untouched.
 */
function wrapForReturn(code: string): string {
  const trimmed = code.trimEnd();

  // Already has a top-level `return` — leave it alone.
  // Only match `return` that appears at the start of a line (not inside a
  // function body which would be indented).
  if (/^return\s/m.test(trimmed)) {
    return trimmed;
  }

  // Check for top-level variable / function / class declarations.
  const hasDeclarations =
    /^(?:const |let |var |function |class )/m.test(trimmed);

  if (!hasDeclarations) {
    // The entire code is a single expression (the common case for JSX).
    // Wrapping in parens is safe even for multi-line createElement chains.
    return `return (\n${trimmed}\n)`;
  }

  // Multi-statement code: try to split at the last semicolon.
  const lastSemi = trimmed.lastIndexOf(";");
  if (lastSemi >= 0) {
    const head = trimmed.slice(0, lastSemi + 1);
    const tail = trimmed.slice(lastSemi + 1).trim();
    if (tail && !/^(?:const |let |var |function |class )/.test(tail)) {
      return `${head}\nreturn (\n${tail}\n)`;
    }
  }

  // No semicolons — find the last top-level `React.createElement(` call.
  // This is the expression produced by Sucrase from the JSX body.
  const cePattern = /\nReact\.createElement\(/g;
  let lastCeIndex = -1;
  let m: RegExpExecArray | null;
  while ((m = cePattern.exec(trimmed)) !== null) {
    lastCeIndex = m.index + 1; // skip the leading newline
  }
  if (lastCeIndex > 0) {
    const head = trimmed.slice(0, lastCeIndex);
    const tail = trimmed.slice(lastCeIndex);
    return `${head}return (\n${tail}\n)`;
  }

  // Fallback: cannot determine what to return — execute as-is.
  return trimmed;
}

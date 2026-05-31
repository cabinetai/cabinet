/**
 * Persona templating — substitute `{{cabinet.name}}`, `{{user.name}}`, etc.
 *
 * Audit #027: persona files were being shipped with literal cabinet names
 * baked in. When the cabinet is renamed, the persona text still refers to
 * the old name. This module renders templated personas at prompt-build
 * time so that `{{cabinet.name}}` always resolves to the current value.
 *
 * The templating layer is deliberately tiny — exact-match `{{ key.path }}`
 * substitution, no expressions, no conditionals. Personas are prose, not
 * programs; anything more complex belongs in the agent's logic, not its
 * persona text.
 */

export interface PersonaTemplateContext {
  cabinet?: {
    name?: string;
    slug?: string;
    path?: string;
  };
  user?: {
    name?: string;
  };
  agent?: {
    name?: string;
    slug?: string;
  };
  /** ISO date or pretty date — interpolated as-is. Caller decides format. */
  today?: string;
}

const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

function lookup(ctx: PersonaTemplateContext, dottedKey: string): string | undefined {
  const segments = dottedKey.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = ctx;
  for (const seg of segments) {
    if (cursor == null) return undefined;
    cursor = cursor[seg];
  }
  if (cursor == null) return undefined;
  if (typeof cursor === "string") return cursor;
  if (typeof cursor === "number" || typeof cursor === "boolean") return String(cursor);
  return undefined;
}

/**
 * Substitute `{{ key }}` placeholders in `body` using `ctx`. Unknown
 * placeholders are left intact — better than silently dropping them, and
 * a clear signal to the user that a key wasn't wired up.
 */
export function renderPersonaBody(
  body: string,
  ctx: PersonaTemplateContext
): string {
  if (!body) return body;
  return body.replace(PLACEHOLDER_RE, (match, key: string) => {
    const value = lookup(ctx, key);
    return value !== undefined ? value : match;
  });
}

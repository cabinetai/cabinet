/**
 * Pure helpers for generating the Express route manifest from the Next.js
 * route-handler files under src/app/api. Side-effect free so the unit suite
 * can exercise path conversion and ordering without touching disk.
 */

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Convert a route file path (relative to the repo root) into an Express 5
 * path. Next dynamic segments map onto Express params:
 *   [id]      -> :id
 *   [...path] -> *path  (Express 5 named wildcard: matches >=1 segment and
 *                        yields string[], the same shape Next hands handlers)
 */
export function routeFileToExpressPath(routeFile: string): string {
  const relative = routeFile
    .replace(/\\/g, "/")
    .replace(/^src\/app/, "")
    .replace(/\/route\.tsx?$/, "");
  const segments = relative
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
      if (catchAll) return `*${catchAll[1]}`;
      const dynamic = segment.match(/^\[(.+)\]$/);
      if (dynamic) return `:${dynamic[1]}`;
      return segment;
    });
  return "/" + segments.join("/");
}

/** Extract the HTTP methods a route module exports (function or const form). */
export function extractMethods(source: string): HttpMethod[] {
  const found: HttpMethod[] = [];
  for (const method of HTTP_METHODS) {
    const pattern = new RegExp(
      `^export\\s+(?:async\\s+)?(?:function\\s+${method}\\b|const\\s+${method}\\s*=)`,
      "m"
    );
    if (pattern.test(source)) found.push(method);
  }
  return found;
}

/**
 * Express matches routes in registration order, so Next's static-beats-dynamic
 * precedence has to be reproduced by sorting: at each segment depth, literal
 * segments register before :params, and :params before *wildcards. Without
 * this, /api/agents/:id would swallow /api/agents/personas.
 */
function segmentRank(segment: string): number {
  if (segment.startsWith("*")) return 2;
  if (segment.startsWith(":")) return 1;
  return 0;
}

export function compareExpressPaths(a: string, b: string): number {
  const as = a.split("/").filter(Boolean);
  const bs = b.split("/").filter(Boolean);
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const sa = as[i];
    const sb = bs[i];
    if (sa === undefined) return -1;
    if (sb === undefined) return 1;
    const rank = segmentRank(sa) - segmentRank(sb);
    if (rank !== 0) return rank;
    const alpha = sa.localeCompare(sb);
    if (alpha !== 0) return alpha;
  }
  return 0;
}

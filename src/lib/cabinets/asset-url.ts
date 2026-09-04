import { isHtmlPath } from "@/lib/ui/html-view-mode";

/**
 * Data-root-relative path → the URL that serves its raw bytes.
 */
export function assetUrlFor(path: string): string {
  return `/api/assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * The URL that serves a node's *content* — markdown for pages, index.html for
 * bundled websites/apps, the raw asset for everything else. Mirrors the routing
 * the viewers use so callers (export, browse) resolve the same file. A `<name>.md`
 * page can be typed "file" yet still lives at `<name>.md`, so that case is
 * checked before directory/cabinet.
 */
export function contentUrlFor(path: string, type?: string): string {
  const base = assetUrlFor(path);
  const lower = path.toLowerCase();
  if (type === "website" || type === "app") return `${base}/index.html`;
  if ((type === "file" && !isHtmlPath(path)) || lower.endsWith(".md")) return `${base}.md`;
  if (type === "directory" || type === "cabinet") return `${base}/index.md`;
  return base;
}

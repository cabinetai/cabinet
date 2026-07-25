import path from "node:path";
import { slugifyPageName } from "./wiki-links";

export interface InternalLinkNode {
  name: string;
  path: string;
  children?: InternalLinkNode[];
}

function flattenTree(nodes: InternalLinkNode[]): InternalLinkNode[] {
  return nodes.flatMap((node) => [
    node,
    ...(node.children ? flattenTree(node.children) : []),
  ]);
}

function normalizePagePath(value: string): string {
  const withoutSuffix = value.split(/[?#]/, 1)[0].replaceAll("\\", "/");
  const withoutMarkdown = withoutSuffix
    .replace(/\/index\.md$/i, "")
    .replace(/\.md$/i, "")
    .replace(/\/+$/, "");
  return withoutMarkdown || ".";
}

export function findPageBySlug(
  slug: string,
  currentPath: string | null,
  nodes: InternalLinkNode[],
): string | null {
  const allPages = flattenTree(nodes);
  const lastSegment = (value: string) => value.split("/").pop() ?? value;
  const parentOf = (value: string) =>
    value.includes("/") ? value.substring(0, value.lastIndexOf("/")) : "";
  const matches = allPages.filter(
    (page) =>
      page.name === slug ||
      page.path.endsWith(`/${slug}`) ||
      slugifyPageName(lastSegment(page.path)) === slug,
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].path;

  if (currentPath) {
    const parentDirectory = parentOf(currentPath);
    const sibling = matches.find(
      (match) => parentOf(match.path) === parentDirectory,
    );
    if (sibling) return sibling.path;
  }
  return matches[0].path;
}

export function resolveInternalLink(
  href: string,
  currentDirectory: string | null,
  nodes: InternalLinkNode[],
): string | null {
  const rawPath = href.split(/[?#]/, 1)[0].trim();
  if (!rawPath) return null;

  const isRootRelative = rawPath.startsWith("/");
  const baseDirectory =
    !currentDirectory || currentDirectory === "."
      ? ""
      : normalizePagePath(currentDirectory);
  const joined = isRootRelative
    ? rawPath.replace(/^\/+/, "")
    : path.posix.join(baseDirectory, rawPath);
  const normalized = normalizePagePath(path.posix.normalize(joined));

  if (normalized === ".." || normalized.startsWith("../")) return null;

  return flattenTree(nodes).find((page) => page.path === normalized)?.path ?? null;
}

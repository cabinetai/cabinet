import { findWikiLinkOccurrences, slugifyPageName } from "@/lib/markdown/wiki-links";
import type { TreeNode } from "@/types";

function getNodeDisplayName(node: TreeNode): string {
  const name = node.name;
  const lastDot = name.lastIndexOf(".");
  if (lastDot > 0) {
    const ext = name.slice(lastDot);
    if (/^\.[a-zA-Z0-9]+$/.test(ext)) {
      return name.slice(0, lastDot);
    }
  }
  return name;
}

function findPageInTree(
  nodes: TreeNode[],
  slug: string
): string | null {
  for (const node of nodes) {
    const displayName = getNodeDisplayName(node);
    const nodeSlug = slugifyPageName(displayName);

    if (nodeSlug === slug && node.type === "file") {
      return `/${node.path}.md`;
    }

    if (
      nodeSlug === slug &&
      node.type === "directory" &&
      node.children?.some((child) => child.name === "index.md")
    ) {
      return `/${node.path}/index.md`;
    }

    if (node.children) {
      const found = findPageInTree(node.children, slug);
      if (found) return found;
    }
  }
  return null;
}

export function convertWikiLinksToOkf(
  markdown: string,
  tree: TreeNode[]
): { content: string; converted: number } {
  const occurrences = findWikiLinkOccurrences(markdown);
  if (occurrences.length === 0) return { content: markdown, converted: 0 };

  let result = "";
  let cursor = 0;
  let converted = 0;

  for (const occ of occurrences) {
    result += markdown.slice(cursor, occ.start);

    const pageName = occ.inner;
    const slug = slugifyPageName(pageName);
    const resolvedPath = findPageInTree(tree, slug);

    if (resolvedPath) {
      result += `[${pageName}](${resolvedPath})`;
      converted += 1;
    } else {
      result += occ.raw;
    }

    cursor = occ.end;
  }

  result += markdown.slice(cursor);
  return { content: result, converted };
}

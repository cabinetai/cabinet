import type { TreeNode } from "@/types";

export interface FlatPage {
  path: string;
  title: string;
}

export function flattenTree(nodes: TreeNode[]): FlatPage[] {
  const result: FlatPage[] = [];
  for (const node of nodes) {
    if (node.type !== "website") {
      result.push({
        path: node.path,
        title: node.frontmatter?.title || node.name,
      });
    }
    if (node.children) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

export function makePageContextLabel(
  path: string,
  pages: { path: string; title: string }[]
): string {
  return pages.find((page) => page.path === path)?.title || path;
}

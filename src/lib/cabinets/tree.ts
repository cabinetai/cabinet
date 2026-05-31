import type { TreeNode } from "@/types";

function pathMatchesNode(targetPath: string, nodePath: string): boolean {
  return targetPath === nodePath || targetPath.startsWith(`${nodePath}/`);
}

export function findRootCabinetNode(nodes: TreeNode[]): TreeNode | null {
  const root = nodes[0];
  return root?.type === "cabinet" && root.path === "." ? root : null;
}

export function findNodeByPath(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }

  return null;
}

export function findDeepestCabinetNode(
  nodes: TreeNode[],
  targetPath: string
): TreeNode | null {
  let match: TreeNode | null = null;

  for (const node of nodes) {
    if (!pathMatchesNode(targetPath, node.path)) continue;

    if (node.type === "cabinet") {
      match = node;
    }

    if (node.children) {
      const childMatch = findDeepestCabinetNode(node.children, targetPath);
      if (childMatch) {
        match = childMatch;
      }
    }
  }

  return match;
}

export function findParentCabinetNode(
  nodes: TreeNode[],
  cabinetPath: string,
  cabinetAncestor: TreeNode | null = null
): TreeNode | null {
  for (const node of nodes) {
    const nextCabinetAncestor = node.type === "cabinet" ? node : cabinetAncestor;

    if (node.path === cabinetPath) {
      return node.type === "cabinet" ? cabinetAncestor : null;
    }

    if (node.children) {
      const found = findParentCabinetNode(
        node.children,
        cabinetPath,
        nextCabinetAncestor
      );
      if (found) return found;
    }
  }

  return null;
}

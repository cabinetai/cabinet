import type { TreeNode, PageData, FrontMatter } from "@/types";
import { normalizeVirtualPath } from "@/lib/virtual-paths";
import { handleStaleResponse } from "@/lib/api/stale-process-client";

export function buildPageApiUrl(pagePath = ""): string {
  const normalized = normalizeVirtualPath(pagePath);
  if (!normalized) return "/api/pages";

  const encodedPath = normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/api/pages/${encodedPath}`;
}

export async function fetchTree(
  showHidden = false,
  fresh = false
): Promise<TreeNode[]> {
  const params = new URLSearchParams();
  if (showHidden) params.set("showHidden", "1");
  if (fresh) params.set("fresh", "1");
  const qs = params.toString();
  const res = await fetch(qs ? `/api/tree?${qs}` : "/api/tree", {
    cache: "no-store",
  });
  handleStaleResponse(res);
  if (!res.ok) throw new Error("Failed to fetch tree");
  return res.json();
}

export class FetchPageError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "FetchPageError";
  }
}

export async function fetchPage(path: string): Promise<PageData> {
  const res = await fetch(buildPageApiUrl(path));
  // A stale-process 503 means the active cabinet was switched; trigger recovery
  // (reload) and still surface the error so the editor doesn't render stale data.
  handleStaleResponse(res);
  if (!res.ok) {
    throw new FetchPageError(`Failed to fetch page: ${path}`, res.status);
  }
  return res.json();
}

export async function savePage(
  path: string,
  content: string,
  frontmatter: Partial<FrontMatter>
): Promise<void> {
  const res = await fetch(buildPageApiUrl(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, frontmatter }),
  });
  if (!res.ok) throw new Error(`Failed to save page: ${path}`);
}

export async function createPageApi(
  parentPath: string,
  title: string
): Promise<void> {
  const res = await fetch(buildPageApiUrl(parentPath), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to create page: ${parentPath}`);
}

export async function createFolderApi(
  fullPath: string,
  name: string
): Promise<void> {
  const res = await fetch(buildPageApiUrl(fullPath), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "folder", title: name }),
  });
  if (!res.ok) throw new Error(`Failed to create folder: ${fullPath}`);
}

export async function deletePageApi(path: string): Promise<void> {
  const res = await fetch(buildPageApiUrl(path), { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete page: ${path}`);
}

export async function movePageApi(
  fromPath: string,
  toParent: string,
  neighbors: { prevName?: string | null; nextName?: string | null } = {}
): Promise<string> {
  const res = await fetch(buildPageApiUrl(fromPath), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      toParent,
      prevName: neighbors.prevName ?? null,
      nextName: neighbors.nextName ?? null,
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error ? `: ${body.error}` : "";
    } catch {
      // ignore
    }
    throw new Error(`Failed to move page${detail}`);
  }
  const data = await res.json();
  return data.newPath;
}

export interface RenameReferencesSummary {
  linkCount: number;
  pageCount: number;
  undoToken: string | null;
  oldName: string;
  newName: string;
  changedPages: string[];
}

export interface RenamePageResult {
  newPath: string;
  references: RenameReferencesSummary;
}

export async function renamePageApi(
  fromPath: string,
  newName: string
): Promise<RenamePageResult> {
  const res = await fetch(buildPageApiUrl(fromPath), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rename: newName }),
  });
  if (!res.ok) throw new Error(`Failed to rename page: ${fromPath}`);
  const data = await res.json();
  return { newPath: data.newPath, references: data.references };
}

export async function undoRenameApi(
  token: string
): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch(`/api/references/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (res.ok) return { ok: true };
  let reason = "failed";
  try {
    const body = await res.json();
    if (body?.reason) reason = body.reason;
  } catch {
    // ignore
  }
  return { ok: false, reason };
}

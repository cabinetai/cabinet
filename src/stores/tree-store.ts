import { create } from "zustand";
import type { TreeNode } from "@/types";
import {
  fetchTree,
  createPageApi,
  deletePageApi,
  movePageApi,
  renamePageApi,
  undoRenameApi,
} from "@/lib/api/client";
import { useEditorStore } from "@/stores/editor-store";
import { slugifyPageName } from "@/lib/markdown/wiki-links";

export type DragZone = "before" | "into" | "after";

interface TreeState {
  nodes: TreeNode[];
  selectedPath: string | null;
  expandedPaths: Set<string>;
  loading: boolean;
  dragOverPath: string | null;
  dragOverZone: DragZone | null;
  movingPaths: Set<string>;
  showHiddenFiles: boolean;
  /** Bumped whenever we want the sidebar to scroll to + blink the selected row. */
  focusTick: number;
  /** Tree paths an agent task recently created/changed — highlighted in the
   *  sidebar (tint + dot) until the user opens them. */
  recentlyChanged: Set<string>;

  loadTree: () => Promise<void>;
  selectPage: (path: string | null) => void;
  /** Expand all ancestor paths, select the leaf, and bump focusTick. */
  focusPath: (path: string) => void;
  toggleExpand: (path: string) => void;
  expandPath: (path: string) => void;
  createPage: (parentPath: string, title: string) => Promise<void>;
  deletePage: (path: string) => Promise<void>;
  movePage: (
    fromPath: string,
    toParentPath: string,
    neighbors?: { prevName?: string | null; nextName?: string | null }
  ) => Promise<void>;
  renamePage: (path: string, newName: string) => Promise<void>;
  setDragOver: (path: string | null, zone?: DragZone | null) => void;
  setShowHiddenFiles: (show: boolean) => void;
  toggleHiddenFiles: () => void;
  /** Mark tree paths as recently changed by a task (sidebar highlight + dot). */
  markChanged: (paths: string[]) => void;
  /** Clear the "recently changed" mark for one path (e.g. when it's opened). */
  clearChanged: (path: string) => void;
}

const TREE_CACHE_KEY = "kb-tree-cache";

function loadExpandedPaths(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem("kb-expanded-paths");
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function loadShowHiddenFiles(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("kb-show-hidden-files") === "true";
  } catch {
    return false;
  }
}

function saveExpandedPaths(paths: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem("kb-expanded-paths", JSON.stringify([...paths]));
}

function loadCachedTree(showHidden: boolean): TreeNode[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TREE_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { showHidden: boolean; nodes: TreeNode[] };
    if (parsed.showHidden !== showHidden) return [];
    return Array.isArray(parsed.nodes) ? parsed.nodes : [];
  } catch {
    return [];
  }
}

function saveCachedTree(nodes: TreeNode[], showHidden: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      TREE_CACHE_KEY,
      JSON.stringify({ showHidden, nodes })
    );
  } catch {
    // quota errors are non-fatal; skip caching
  }
}

export const useTreeStore = create<TreeState>((set, get) => ({
  nodes: [],
  selectedPath: null,
  expandedPaths: loadExpandedPaths(),
  loading: false,
  dragOverPath: null,
  dragOverZone: null,
  movingPaths: new Set<string>(),
  showHiddenFiles: loadShowHiddenFiles(),
  focusTick: 0,
  recentlyChanged: new Set<string>(),

  loadTree: async () => {
    const { showHiddenFiles, nodes: existing } = get();
    // Paint instantly from cache on first load, then revalidate in the
    // background. Keeps the sidebar from flashing empty on refresh.
    if (existing.length === 0) {
      const cached = loadCachedTree(showHiddenFiles);
      if (cached.length > 0) {
        set({ nodes: cached, loading: false });
      } else {
        set({ loading: true });
      }
    }
    try {
      const nodes = await fetchTree(showHiddenFiles);
      set({ nodes, loading: false });
      saveCachedTree(nodes, showHiddenFiles);
    } catch {
      set({ loading: false });
    }
  },

  selectPage: (path: string | null) => {
    set({ selectedPath: path });
    if (path) get().clearChanged(path);
  },

  markChanged: (paths: string[]) => {
    const cur = get().recentlyChanged;
    const next = new Set(cur);
    for (const p of paths) if (p) next.add(p);
    if (next.size !== cur.size) set({ recentlyChanged: next });
  },

  clearChanged: (path: string) => {
    const cur = get().recentlyChanged;
    if (!cur.has(path)) return;
    const next = new Set(cur);
    next.delete(path);
    set({ recentlyChanged: next });
  },

  focusPath: (path: string) => {
    const { expandedPaths, focusTick } = get();
    const next = new Set(expandedPaths);
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      next.add(parts.slice(0, i).join("/"));
    }
    set({ selectedPath: path, expandedPaths: next, focusTick: focusTick + 1 });
    saveExpandedPaths(next);
  },

  toggleExpand: (path: string) => {
    const { expandedPaths } = get();
    const next = new Set(expandedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    set({ expandedPaths: next });
    saveExpandedPaths(next);
  },

  expandPath: (path: string) => {
    const { expandedPaths } = get();
    if (!expandedPaths.has(path)) {
      const next = new Set(expandedPaths);
      next.add(path);
      set({ expandedPaths: next });
      saveExpandedPaths(next);
    }
  },

  createPage: async (parentPath: string, title: string) => {
    const slug = slugifyPageName(title);
    const fullPath = parentPath ? `${parentPath}/${slug}` : slug;
    await createPageApi(fullPath, title);
    if (parentPath) {
      get().expandPath(parentPath);
    }
    await get().loadTree();
    set({ selectedPath: fullPath });
  },

  deletePage: async (path: string) => {
    await deletePageApi(path);
    const { selectedPath } = get();
    if (selectedPath === path) {
      set({ selectedPath: null });
    }
    await get().loadTree();
  },

  movePage: async (
    fromPath: string,
    toParentPath: string,
    neighbors: { prevName?: string | null; nextName?: string | null } = {}
  ) => {
    const fromParent = fromPath.split("/").slice(0, -1).join("/");
    const sameParent =
      fromParent === toParentPath &&
      neighbors.prevName === undefined &&
      neighbors.nextName === undefined;
    if (sameParent) return;

    // Re-entrancy guard: a single drop can fire the handler more than once
    // (synthetic-event quirks, a lingering native drag session) before the
    // disabled-row state takes hold. Without this, the first call moves the
    // item and the duplicates fail (the source path is gone) — surfacing a
    // stack of "Failed to move" toasts for a move that actually succeeded.
    if (get().movingPaths.has(fromPath)) return;

    set((state) => {
      const next = new Set(state.movingPaths);
      next.add(fromPath);
      return { movingPaths: next };
    });
    try {
      const newPath = await movePageApi(fromPath, toParentPath, neighbors);
      if (toParentPath) {
        get().expandPath(toParentPath);
      }
      await get().loadTree();
      set({ selectedPath: newPath });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("cabinet:toast", {
            detail: { kind: "info", message: `Moved to ${toParentPath || "root"}` },
          })
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to move page";
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("cabinet:toast", {
            detail: { kind: "error", message },
          })
        );
      }
      // Toast is the user-facing surface; no console.error so a name
      // collision (or any other server-validated message) doesn't trip
      // the Next.js dev-tools error overlay.
    } finally {
      set((state) => {
        const next = new Set(state.movingPaths);
        next.delete(fromPath);
        return { movingPaths: next };
      });
    }
  },

  renamePage: async (pagePath: string, newName: string) => {
    let result;
    try {
      result = await renamePageApi(pagePath, newName);
    } catch {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("cabinet:toast", {
            detail: { kind: "error", message: "Failed to rename" },
          })
        );
      }
      return;
    }

    const { newPath, references } = result;
    await get().loadTree();
    if (get().selectedPath === pagePath) {
      set({ selectedPath: newPath });
    }

    // --- Open-editor reconciliation -------------------------------------
    // The rename mutated files underneath the editor. Keep what's open in
    // sync without ever clobbering unsaved edits.
    const editor = useEditorStore.getState();
    if (editor.currentPath === pagePath) {
      // The renamed page itself is open → follow it to the new path.
      editor.loadPage(newPath);
    } else if (
      editor.currentPath &&
      references.changedPages.includes(editor.currentPath) &&
      !editor.isDirty
    ) {
      // An open referrer was rewritten and has no unsaved edits → reload so
      // the corrected [[New Name]] shows and a later autosave can't write
      // the stale [[Old Name]] back over the fix.
      editor.loadPage(editor.currentPath);
    }

    // --- Toast + Undo ---------------------------------------------------
    if (typeof window === "undefined") return;
    const { oldName, newName: finalName, linkCount, pageCount, undoToken } =
      references;
    const summary =
      linkCount > 0
        ? `Renamed “${oldName}” → “${finalName}” · updated ${linkCount} link${
            linkCount === 1 ? "" : "s"
          } in ${pageCount} page${pageCount === 1 ? "" : "s"}`
        : `Renamed “${oldName}” → “${finalName}”`;

    window.dispatchEvent(
      new CustomEvent("cabinet:toast", {
        detail: {
          kind: "success",
          message: summary,
          actionLabel: undoToken ? "Undo" : undefined,
          onAction: undoToken
            ? async () => {
                const res = await undoRenameApi(undoToken);
                if (!res.ok) {
                  window.dispatchEvent(
                    new CustomEvent("cabinet:toast", {
                      detail: {
                        kind: "error",
                        message:
                          res.reason === "expired"
                            ? "Too late to undo that rename"
                            : "Undo failed",
                      },
                    })
                  );
                  return;
                }
                await get().loadTree();
                if (get().selectedPath === newPath) {
                  set({ selectedPath: pagePath });
                }
                const ed = useEditorStore.getState();
                if (ed.currentPath === newPath) {
                  ed.loadPage(pagePath);
                } else if (
                  ed.currentPath &&
                  references.changedPages.includes(ed.currentPath) &&
                  !ed.isDirty
                ) {
                  ed.loadPage(ed.currentPath);
                }
                window.dispatchEvent(
                  new CustomEvent("cabinet:toast", {
                    detail: {
                      kind: "info",
                      message: `Reverted rename of “${finalName}”`,
                    },
                  })
                );
              }
            : undefined,
        },
      })
    );
  },

  setDragOver: (path: string | null, zone: DragZone | null = null) => {
    set({ dragOverPath: path, dragOverZone: path ? zone : null });
  },

  setShowHiddenFiles: (show: boolean) => {
    set({ showHiddenFiles: show });
    localStorage.setItem("kb-show-hidden-files", String(show));
    get().loadTree();
  },

  toggleHiddenFiles: () => {
    const { showHiddenFiles } = get();
    get().setShowHiddenFiles(!showHiddenFiles);
  },
}));

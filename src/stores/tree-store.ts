import { create } from "zustand";
import type { TreeNode } from "@/types";
import {
  fetchTree,
  createPageApi,
  createFolderApi,
  deletePageApi,
  movePageApi,
  renamePageApi,
  undoRenameApi,
} from "@/lib/api/client";
import { useEditorStore } from "@/stores/editor-store";
import { slugifyFileName } from "@/lib/markdown/wiki-links";

export type DragZone = "before" | "into" | "after";

interface TreeState {
  nodes: TreeNode[];
  selectedPath: string | null;
  /** The Drive node currently selected, when it's not in the local tree. */
  driveNode: TreeNode | null;
  /** True while a Drive file is loading after being clicked. */
  driveLoading: boolean;
  expandedPaths: Set<string>;
  loading: boolean;
  dragOverPath: string | null;
  dragOverZone: DragZone | null;
  movingPaths: Set<string>;
  showHiddenFiles: boolean;
  /** Sort the tree alphabetically by name instead of by manual `order`. */
  sortAlphabetical: boolean;
  /** When alphabetical sorting is on, place folders above files. */
  foldersFirst: boolean;
  /** The unsorted tree as returned by the server — `nodes` is the sorted
   *  view derived from this, so toggling sort doesn't need a server refetch. */
  rawNodes: TreeNode[];
  /** A drag-move awaiting confirmation because alphabetical sorting is on
   *  (manual ordering would otherwise be overridden by the sort). */
  pendingMove: {
    fromPath: string;
    toParentPath: string;
    neighbors?: { prevName?: string | null; nextName?: string | null };
  } | null;
  /** Bumped whenever we want the sidebar to scroll to + blink the selected row. */
  focusTick: number;
  /** Tree paths an agent task recently created/changed — highlighted in the
   *  sidebar (tint + dot) until the user opens them. */
  recentlyChanged: Set<string>;

  /** Reload the file tree. Pass `{ fresh: true }` to bypass the server's
   *  short-TTL cache — needed right after an agent task writes files. */
  setDriveNode: (node: TreeNode | null) => void;
  setDriveLoading: (loading: boolean) => void;
  loadTree: (opts?: { fresh?: boolean }) => Promise<void>;
  selectPage: (path: string | null) => void;
  /** Expand all ancestor paths, select the leaf, and bump focusTick. */
  focusPath: (path: string) => void;
  toggleExpand: (path: string) => void;
  expandPath: (path: string) => void;
  createPage: (parentPath: string, title: string) => Promise<void>;
  createFolder: (parentPath: string, name: string) => Promise<void>;
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
  setSortAlphabetical: (sort: boolean) => void;
  setFoldersFirst: (foldersFirst: boolean) => void;
  setPendingMove: (
    move: {
      fromPath: string;
      toParentPath: string;
      neighbors?: { prevName?: string | null; nextName?: string | null };
    } | null
  ) => void;
  executeMovePage: (move: {
    fromPath: string;
    toParentPath: string;
    neighbors?: { prevName?: string | null; nextName?: string | null };
  }) => Promise<void>;
  /** Mark tree paths as recently changed by a task (sidebar highlight + dot). */
  markChanged: (paths: string[]) => void;
  /** Clear the "recently changed" mark for one path (e.g. when it's opened). */
  clearChanged: (path: string) => void;
}

const TREE_CACHE_KEY = "kb-tree-cache";

function loadSortAlphabetical(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem("kb-sort-alphabetical");
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

function loadFoldersFirst(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem("kb-folders-first");
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export type CabinetPathKind = "cabinet" | "non-cabinet" | "unknown";

function findTreeNodeByPath(
  nodes: TreeNode[],
  target: string
): TreeNode | null {
  for (const node of nodes) {
    if (node.path === target) return node;
    if (node.children?.length) {
      const found = findTreeNodeByPath(node.children, target);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Classify a cabinet path against the in-memory tree, no server round trip.
 * Returns "unknown" when the tree hasn't loaded the path yet (cold deep
 * links) so callers can safely fall back to a network check. Used to gate
 * the cabinet-overview fetch: a "non-cabinet" directory carries no `.cabinet`
 * manifest and the overview route would only 404 for it.
 */
export function getCabinetPathKind(path: string): CabinetPathKind {
  const node = findTreeNodeByPath(useTreeStore.getState().rawNodes, path);
  if (!node) return "unknown";
  return node.type === "cabinet" ? "cabinet" : "non-cabinet";
}

export function sortTreeNodes(
  nodes: TreeNode[],
  sortAlphabetical: boolean,
  foldersFirst: boolean
): TreeNode[] {
  return [...nodes].map((node) => {
    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: sortTreeNodes(node.children, sortAlphabetical, foldersFirst),
      };
    }
    return node;
  }).sort((a, b) => {
    const isFolderA = a.type === "directory" || a.type === "cabinet";
    const isFolderB = b.type === "directory" || b.type === "cabinet";

    if (sortAlphabetical && foldersFirst && isFolderA !== isFolderB) {
      return isFolderA ? -1 : 1;
    }

    if (sortAlphabetical) {
      const nameA = a.frontmatter?.title || a.name;
      const nameB = b.frontmatter?.title || b.name;
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" });
    } else {
      const orderA = a.frontmatter?.order ?? Number.POSITIVE_INFINITY;
      const orderB = b.frontmatter?.order ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return orderA - orderB;
      const nameA = a.frontmatter?.title || a.name;
      const nameB = b.frontmatter?.title || b.name;
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" });
    }
  });
}

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
  rawNodes: [],
  selectedPath: null,
  driveNode: null,
  driveLoading: false,
  expandedPaths: loadExpandedPaths(),
  loading: false,
  dragOverPath: null,
  dragOverZone: null,
  movingPaths: new Set<string>(),
  showHiddenFiles: loadShowHiddenFiles(),
  sortAlphabetical: loadSortAlphabetical(),
  foldersFirst: loadFoldersFirst(),
  pendingMove: null,
  focusTick: 0,
  recentlyChanged: new Set<string>(),

  setPendingMove: (move) => set({ pendingMove: move }),

  setDriveNode: (node) => set({ driveNode: node }),
  setDriveLoading: (loading) => set({ driveLoading: loading }),

  loadTree: async (opts) => {
    const { showHiddenFiles, nodes: existing, sortAlphabetical, foldersFirst } = get();
    // Paint instantly from cache on first load, then revalidate in the
    // background. Keeps the sidebar from flashing empty on refresh.
    if (existing.length === 0) {
      const cached = loadCachedTree(showHiddenFiles);
      if (cached.length > 0) {
        const sorted = sortTreeNodes(cached, sortAlphabetical, foldersFirst);
        set({ rawNodes: cached, nodes: sorted, loading: false });
      } else {
        set({ loading: true });
      }
    }
    try {
      const nodes = await fetchTree(showHiddenFiles, opts?.fresh ?? false);
      const sorted = sortTreeNodes(nodes, sortAlphabetical, foldersFirst);
      set({ rawNodes: nodes, nodes: sorted, loading: false });
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
    const slug = slugifyFileName(title);
    const fullPath = parentPath ? `${parentPath}/${slug}` : slug;
    await createPageApi(fullPath, title);
    if (parentPath) {
      get().expandPath(parentPath);
    }
    await get().loadTree();
    set({ selectedPath: fullPath });
  },

  createFolder: async (parentPath: string, name: string) => {
    const slug = slugifyFileName(name);
    const fullPath = parentPath ? `${parentPath}/${slug}` : slug;
    await createFolderApi(fullPath, name);
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

    // The page (or its containing folder) is gone from disk. If it's open in
    // the editor, drop it — otherwise the stale currentPath survives and the
    // next autosave recreates the just-deleted file, resurrecting it on disk.
    const editor = useEditorStore.getState();
    if (
      editor.currentPath === path ||
      editor.currentPath?.startsWith(path + "/")
    ) {
      editor.clear();
    }

    await get().loadTree();
  },

  movePage: async (
    fromPath: string,
    toParentPath: string,
    neighbors: { prevName?: string | null; nextName?: string | null } = {}
  ) => {
    const { sortAlphabetical } = get();
    // Manual drag-reordering conflicts with alphabetical auto-sorting — ask
    // the user before applying the move (TreeView renders the dialog).
    if (sortAlphabetical) {
      set({ pendingMove: { fromPath, toParentPath, neighbors } });
      return;
    }
    await get().executeMovePage({ fromPath, toParentPath, neighbors });
  },

  executeMovePage: async ({ fromPath, toParentPath, neighbors = {} }) => {
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

      // The move renamed files underneath the editor. If the moved page is
      // open, follow it to the new path — otherwise the editor keeps the
      // stale path and its next autosave recreates the file at the original
      // location, leaving a real on-disk copy behind. The open page can also
      // be a descendant of a moved folder, so remap that prefix too.
      const editor = useEditorStore.getState();
      if (editor.currentPath === fromPath) {
        editor.loadPage(newPath);
      } else if (editor.currentPath?.startsWith(fromPath + "/")) {
        editor.loadPage(newPath + editor.currentPath.slice(fromPath.length));
      }

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
    } else if (editor.currentPath?.startsWith(pagePath + "/")) {
      // A folder was renamed and the open page lives inside it → remap the
      // stale prefix, otherwise a later autosave writes back to the old path.
      editor.loadPage(newPath + editor.currentPath.slice(pagePath.length));
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

  setSortAlphabetical: (sort: boolean) => {
    try {
      localStorage.setItem("kb-sort-alphabetical", String(sort));
    } catch {
      // Ignore storage failures (private mode, quota) — sort still applies.
    }
    const { rawNodes, foldersFirst } = get();
    const sorted = sortTreeNodes(rawNodes, sort, foldersFirst);
    set({ sortAlphabetical: sort, nodes: sorted });
  },

  setFoldersFirst: (foldersFirst: boolean) => {
    try {
      localStorage.setItem("kb-folders-first", String(foldersFirst));
    } catch {
      // Ignore storage failures (private mode, quota) — sort still applies.
    }
    const { rawNodes, sortAlphabetical } = get();
    const sorted = sortTreeNodes(rawNodes, sortAlphabetical, foldersFirst);
    set({ foldersFirst, nodes: sorted });
  },
}));

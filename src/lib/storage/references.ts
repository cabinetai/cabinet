/**
 * Rename-time wiki-link reference rewriting.
 *
 * When a page or folder is renamed its slug changes, so every `[[Old Name]]`
 * elsewhere stops resolving. This module finds those links and repoints them,
 * but only the ones that actually resolved to the renamed page — replaying the
 * exact resolution rule used at click time (`findPageBySlug` in `editor.tsx`)
 * so a link that legitimately targeted a *different* same-slug page is left
 * alone.
 */

import fs from "fs/promises";
import path from "path";
import { DATA_DIR, virtualPathFromFs, isHiddenEntry } from "./path-utils";
import {
  slugifyPageName,
  findWikiLinkOccurrences,
  rewriteWikiLinks,
} from "@/lib/markdown/wiki-links";

/** Minimal page descriptor — mirrors the `{ path, name }` shape that
 * `flattenTree` feeds `findPageBySlug`. `name` is the raw directory/file
 * entry name (for a page directory that equals its slug; for a standalone
 * `foo.md` it is `foo.md`, matching the tree builder). */
export interface PageRef {
  path: string;
  name: string;
}

export interface ScanResult {
  /** Every page/folder node, in deterministic (path-sorted) order. */
  pages: PageRef[];
  /** Absolute paths of every scannable markdown file. */
  markdownFiles: string[];
}

const SKIP_FILES = new Set(["CLAUDE.md", ".order.yaml", ".order.yml"]);

/**
 * One filesystem walk that yields both the page list (for slug resolution)
 * and the set of markdown files (where links live). Skips hidden/ignored
 * directories with the same rule the sidebar tree builder uses.
 */
export async function scanCabinet(): Promise<ScanResult> {
  const pages: PageRef[] = [];
  const markdownFiles: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const dirNames = new Set(
      entries.filter((e) => e.isDirectory() && !isHiddenEntry(e.name)).map((e) => e.name)
    );
    for (const e of entries) {
      if (isHiddenEntry(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // Every directory is a navigable node (folder or page-with-index.md).
        pages.push({ path: virtualPathFromFs(full), name: e.name });
        await walk(full);
        continue;
      }
      if (!e.name.endsWith(".md")) continue;
      if (SKIP_FILES.has(e.name)) continue;
      markdownFiles.push(full);
      if (e.name === "index.md") continue; // the directory already represents it
      // Standalone foo.md is its own node unless a foo/ dir shadows it.
      const base = e.name.replace(/\.md$/, "");
      if (dirNames.has(base)) continue;
      pages.push({ path: virtualPathFromFs(full).replace(/\.md$/, ""), name: e.name });
    }
  }

  await walk(DATA_DIR);
  pages.sort((a, b) => a.path.localeCompare(b.path));
  return { pages, markdownFiles };
}

/**
 * Server-side mirror of `editor.tsx#findPageBySlug`. Must stay behaviourally
 * identical: a rewrite decision that disagreed with click-time resolution
 * would corrupt links.
 */
export function resolvePageBySlug(
  slug: string,
  fromPagePath: string | null,
  pages: PageRef[]
): string | null {
  const matches = pages.filter(
    (p) => p.name === slug || p.path.endsWith("/" + slug)
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].path;
  if (fromPagePath) {
    const parentDir = fromPagePath.includes("/")
      ? fromPagePath.substring(0, fromPagePath.lastIndexOf("/"))
      : "";
    const sibling = matches.find(
      (m) => m.path === (parentDir ? parentDir + "/" + slug : slug)
    );
    if (sibling) return sibling.path;
  }
  return matches[0].path;
}

/** A file whose content was rewritten, with the bytes needed to undo it. */
export interface ChangedFile {
  /** Absolute path the *undo* should write `before` back to. For files inside
   * the renamed subtree this is the pre-rename location (undo reverses the
   * directory move first, then restores contents). */
  undoFsPath: string;
  before: string;
  /** Virtual page path (post-rename) — used for editor reconciliation. */
  virtualPagePath: string;
}

export interface RewriteResult {
  changed: ChangedFile[];
  linkCount: number;
  pageCount: number;
}

/**
 * Rewrite every wiki-link that resolved to `oldPagePath` so it points at
 * `newName`. Call this *after* the directory has been moved on disk; pass the
 * page list snapshotted *before* the move so resolution reflects the state
 * the links were authored against.
 */
export async function rewriteReferencesForRename(opts: {
  oldPagePath: string;
  newPagePath: string;
  oldResolvedDir: string;
  newResolvedDir: string;
  oldSlug: string;
  newName: string;
  preRenamePages: PageRef[];
}): Promise<RewriteResult> {
  const {
    oldPagePath,
    newPagePath,
    oldResolvedDir,
    newResolvedDir,
    oldSlug,
    newName,
    preRenamePages,
  } = opts;

  // Re-scan post-move only to enumerate markdown files; resolution uses the
  // pre-move snapshot the caller captured.
  const { markdownFiles } = await scanCabinet();

  const changed: ChangedFile[] = [];
  let linkCount = 0;

  for (const fsPath of markdownFiles) {
    let raw: string;
    try {
      raw = await fs.readFile(fsPath, "utf8");
    } catch {
      continue;
    }
    if (!raw.includes("[[")) continue;
    // Cheap pre-filter: does any occurrence even slug-match the old name?
    const occs = findWikiLinkOccurrences(raw);
    if (!occs.some((o) => slugifyPageName(o.inner) === oldSlug)) continue;

    // The virtual page path this file represents, *as it was before* the
    // rename — that is the context `findPageBySlug` was evaluated from.
    const currentVPath = virtualPathFromFs(fsPath);
    const currentPagePath = currentVPath.endsWith("/index.md")
      ? currentVPath.slice(0, -"/index.md".length)
      : currentVPath.replace(/\.md$/, "");
    const inRenamedSubtree =
      currentPagePath === newPagePath ||
      currentPagePath.startsWith(newPagePath + "/");
    const contextPagePath = inRenamedSubtree
      ? oldPagePath + currentPagePath.slice(newPagePath.length)
      : currentPagePath;

    const { content, rewritten } = rewriteWikiLinks(
      raw,
      (o) => {
        if (slugifyPageName(o.inner) !== oldSlug) return false;
        return (
          resolvePageBySlug(oldSlug, contextPagePath, preRenamePages) ===
          oldPagePath
        );
      },
      newName
    );

    if (rewritten === 0 || content === raw) continue;

    await fs.writeFile(fsPath, content, "utf8");
    linkCount += rewritten;

    // Undo writes pre-rename bytes; for files moved with the renamed subtree
    // that means the *old* absolute location (undo reverses the dir move
    // first, so the old path exists again before contents are restored).
    const undoFsPath = inRenamedSubtree
      ? path.join(oldResolvedDir, fsPath.slice(newResolvedDir.length + 1))
      : fsPath;

    changed.push({ undoFsPath, before: raw, virtualPagePath: currentPagePath });
  }

  return { changed, linkCount, pageCount: changed.length };
}

import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { CABINET_LINK_META_CANDIDATES } from "@/lib/cabinets/files";
import type { PageData, FrontMatter } from "@/types";
import { parseGoogleNative } from "@/lib/google-drive/native-docs";
import { resolveContentPath } from "./path-utils";
import {
  readFileContent,
  writeFileContent,
  ensureDirectory,
  fileExists,
  deleteFileOrDir,
  unlinkSymlink,
} from "./fs-operations";
import {
  appendOrder,
  computeInsertOrder,
  removeSidecarEntry,
  setEntryOrder,
} from "./order-store";
import {
  scanCabinet,
  rewriteReferencesForRename,
  type RewriteResult,
} from "./references";
import { recordRenameUndo } from "./rename-undo";
import { slugifyPageName } from "@/lib/markdown/wiki-links";

function defaultFrontmatter(title: string): FrontMatter {
  const now = new Date().toISOString();
  return { title, created: now, modified: now, tags: [] };
}

type ResolvedPageEntry = {
  fsPath: string;
  virtualName: string;
};

function joinVirtualPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function isDescendantPath(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function shouldFallbackMove(error: unknown): error is NodeJS.ErrnoException {
  if (!(error instanceof Error)) return false;
  return ["EXDEV", "EPERM", "EACCES"].includes(
    (error as NodeJS.ErrnoException).code ?? ""
  );
}

async function resolveExistingPageEntry(
  virtualPath: string
): Promise<ResolvedPageEntry> {
  const resolved = resolveContentPath(virtualPath);

  if (await fileExists(resolved)) {
    return {
      fsPath: resolved,
      virtualName: path.basename(resolved),
    };
  }

  const mdPath = resolved.endsWith(".md") ? resolved : `${resolved}.md`;
  if (await fileExists(mdPath)) {
    return {
      fsPath: mdPath,
      virtualName: resolved.endsWith(".md")
        ? path.basename(mdPath)
        : path.basename(mdPath, ".md"),
    };
  }

  throw new Error(`Page not found: ${virtualPath}`);
}

async function moveResolvedEntry(
  fromResolved: string,
  toResolved: string
): Promise<void> {
  try {
    await fs.rename(fromResolved, toResolved);
    return;
  } catch (error) {
    if (!shouldFallbackMove(error)) {
      throw error;
    }
  }

  const sourceStat = await fs.lstat(fromResolved);

  if (sourceStat.isSymbolicLink()) {
    const target = await fs.readlink(fromResolved);
    const symlinkTarget = path.isAbsolute(target)
      ? target
      : path.relative(
          path.dirname(toResolved),
          path.resolve(path.dirname(fromResolved), target)
        );
    const targetStat = await fs.stat(fromResolved).catch(() => null);
    const symlinkType = process.platform === "win32"
      ? (targetStat?.isDirectory() ? "junction" : "file")
      : undefined;
    await fs.symlink(symlinkTarget, toResolved, symlinkType);
    await fs.unlink(fromResolved);
    return;
  }

  await fs.cp(fromResolved, toResolved, {
    recursive: sourceStat.isDirectory(),
    errorOnExist: true,
    force: false,
    preserveTimestamps: true,
  });

  if (sourceStat.isDirectory()) {
    await fs.rm(fromResolved, { recursive: true, force: true });
  } else {
    await fs.unlink(fromResolved);
  }
}

export async function readPage(virtualPath: string): Promise<PageData> {
  const resolved = resolveContentPath(virtualPath);

  // Try directory with index.md first
  const indexPath = path.join(resolved, "index.md");
  const mdPath = resolved.endsWith(".md") ? resolved : `${resolved}.md`;

  let filePath: string | null = null;
  if (await fileExists(indexPath)) {
    filePath = indexPath;
  } else if (await fileExists(mdPath)) {
    filePath = mdPath;
  } else if (await fileExists(resolved)) {
    // Could be a raw file or a directory — check for linked-folder metadata fallback.
    const stat = await fs.stat(resolved);
    if (stat.isFile()) {
      filePath = resolved;
    }
  }

  if (filePath) {
    // Google Workspace shortcut (.gdoc/.gsheet/…) → return Google frontmatter so
    // the GoogleDocViewer renders it (e.g. native docs inside an inline mount).
    const native = await parseGoogleNative(filePath);
    if (native) {
      const nativeParent = virtualPath.includes("/")
        ? virtualPath.slice(0, virtualPath.lastIndexOf("/"))
        : "";
      return {
        path: virtualPath,
        assetBase: nativeParent,
        content: "",
        frontmatter: {
          title: path
            .basename(virtualPath)
            .replace(/\.(gdoc|gsheet|gslide|gslides|gform)$/i, ""),
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          tags: [],
          google: { kind: native.kind, url: native.url },
        },
      };
    }

    const raw = await readFileContent(filePath);
    const { data, content } = matter(raw);

    // Directory pages (index.md) keep their assets inside the directory, so
    // relative refs resolve against the page path itself. Standalone .md
    // pages keep assets as SIBLINGS of the file, so refs resolve against the
    // parent directory ("" = data root).
    const isDirectoryPage = filePath === indexPath;
    const parentDir = virtualPath.includes("/")
      ? virtualPath.slice(0, virtualPath.lastIndexOf("/"))
      : "";

    return {
      path: virtualPath,
      assetBase: isDirectoryPage ? virtualPath : parentDir,
      content: content.trim(),
      frontmatter: {
        title: data.title || path.basename(virtualPath, ".md"),
        created: data.created || new Date().toISOString(),
        modified: data.modified || new Date().toISOString(),
        tags: data.tags || [],
        icon: data.icon,
        order: data.order,
        dir: data.dir,
        google: data.google,
      },
    };
  }

  // Fallback for linked directories without index.md.
  for (const filename of CABINET_LINK_META_CANDIDATES) {
    const cabinetMetaPath = path.join(resolved, filename);
    if (!(await fileExists(cabinetMetaPath))) continue;

    const raw = await readFileContent(cabinetMetaPath);
    const meta = yaml.load(raw) as Record<string, unknown>;
    return {
      path: virtualPath,
      content:
        (meta.description as string) ||
        "This folder is linked from an external directory.",
      frontmatter: {
        title: (meta.title as string) || path.basename(virtualPath),
        created: (meta.created as string) || new Date().toISOString(),
        modified: (meta.created as string) || new Date().toISOString(),
        tags: (meta.tags as string[]) || [],
      },
    };
  }

  throw new Error(`Page not found: ${virtualPath}`);
}

/**
 * Heuristic: if a doc's text is mostly Hebrew letters, return "rtl". Used to
 * auto-set frontmatter.dir on agent-generated notes so they render RTL on
 * load. Examines the first ~600 chars to avoid scanning huge files.
 */
function inferDirFromText(content: string): "rtl" | undefined {
  const sample = content.slice(0, 600);
  // Hebrew block: U+0590–U+05FF. Stop counting at 600 chars sampled.
  const hebrewMatches = sample.match(/[֐-׿]/g);
  const letterMatches = sample.match(/[A-Za-z֐-׿]/g);
  if (!hebrewMatches || !letterMatches) return undefined;
  return hebrewMatches.length / letterMatches.length > 0.5 ? "rtl" : undefined;
}

export async function writePage(
  virtualPath: string,
  content: string,
  frontmatter: Partial<FrontMatter>
): Promise<void> {
  const resolved = resolveContentPath(virtualPath);

  const indexPath = path.join(resolved, "index.md");
  const mdPath = resolved.endsWith(".md") ? resolved : `${resolved}.md`;

  let filePath: string;
  if (await fileExists(indexPath)) {
    filePath = indexPath;
  } else if (await fileExists(mdPath)) {
    filePath = mdPath;
  } else if (await fileExists(resolved)) {
    filePath = resolved;
  } else {
    // Default: if virtual path looks like a directory, use index.md
    filePath = indexPath;
  }

  // Auto-detect RTL when the writer didn't set `dir` explicitly and the
  // content reads as Hebrew. Saves Hebrew users from manually toggling the
  // editor RTL button on every agent-generated note.
  const effectiveFrontmatter: Partial<FrontMatter> =
    frontmatter.dir === undefined
      ? { ...frontmatter, dir: inferDirFromText(content) }
      : frontmatter;

  // Strip undefined values — js-yaml cannot serialize them
  const fm = Object.fromEntries(
    Object.entries({ ...effectiveFrontmatter, modified: new Date().toISOString() })
      .filter(([, v]) => v !== undefined)
  );
  const output = matter.stringify(content, fm);
  await ensureDirectory(path.dirname(filePath));
  await writeFileContent(filePath, output);
}

/**
 * Make `dirPath` (a page's container directory, absolute) able to hold
 * sub-pages. If the page currently exists as a standalone `<name>.md`, promote
 * it to `<name>/index.md` so its content isn't orphaned once the `<name>/`
 * directory appears — the tree shadows a `<name>.md` whenever a `<name>/` dir
 * exists, so without this the original page silently vanishes. Idempotent: a
 * no-op when there's no sibling `.md` or the container already has an index.md.
 * Also heals already-broken pairs (dir present, sibling `.md`, no index.md).
 */
export async function ensureContainerDir(dirPath: string): Promise<void> {
  const mdPath = `${dirPath}.md`;
  if (!(await fileExists(mdPath))) return;
  const indexPath = path.join(dirPath, "index.md");
  if (await fileExists(indexPath)) return;
  await ensureDirectory(dirPath);
  await moveResolvedEntry(mdPath, indexPath);
}

export async function createPage(
  virtualPath: string,
  title: string
): Promise<void> {
  // A sub-page under a standalone page must first turn that page into a
  // container; otherwise the new `<parent>/` dir shadows and orphans the
  // original `<parent>.md`. Do this before creating the child directory.
  const parentVirtual = virtualPath.split("/").slice(0, -1).join("/");
  if (parentVirtual) await ensureContainerDir(resolveContentPath(parentVirtual));

  const resolved = resolveContentPath(virtualPath);
  const dirPath = resolved;
  const filePath = path.join(dirPath, "index.md");

  if (await fileExists(filePath)) {
    throw new Error(`Page already exists: ${virtualPath}`);
  }

  await ensureDirectory(dirPath);
  const order = await appendOrder(parentVirtual);
  const fm: FrontMatter & { order?: number } = {
    ...defaultFrontmatter(title),
    order,
  };
  const output = matter.stringify(`\n# ${title}\n`, fm);
  await writeFileContent(filePath, output);
}

export async function deletePage(virtualPath: string): Promise<void> {
  const resolved = resolveContentPath(virtualPath);
  const stat = await fs.lstat(resolved).catch(() => null);
  if (stat?.isSymbolicLink()) {
    await unlinkSymlink(resolved);
  } else {
    await deleteFileOrDir(resolved);
  }
}

// Hidden dirs scaffolded next to every cabinet (cabinet-scaffold.ts:95-97).
// A "hollow orphan" is a destination that contains only these dirs and they
// in turn hold zero files — the daemon's leftovers from a prior cabinet move,
// not real user content. An empty user-created folder with the same slug as
// the moving item must NOT match (no scaffolding present).
const CABINET_SCAFFOLD_NAMES = new Set([".agents", ".jobs", ".cabinet-state"]);

async function isHollowOrphanDir(dir: string): Promise<boolean> {
  let topEntries;
  try {
    topEntries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  if (topEntries.length === 0) return false;
  for (const e of topEntries) {
    if (!e.isDirectory()) return false;
    if (!CABINET_SCAFFOLD_NAMES.has(e.name)) return false;
  }
  const stack = topEntries.map((e) => path.join(dir, e.name));
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      if (e.isDirectory()) stack.push(path.join(current, e.name));
      else return false;
    }
  }
  return true;
}

export async function movePage(
  fromPath: string,
  toParentPath: string,
  options: { prevName?: string | null; nextName?: string | null } = {}
): Promise<string> {
  // resolveExistingPageEntry resolves the real on-disk source — including the
  // standalone-".md" case the tree-builder addresses extension-less (it returns
  // virtualName with ".md" stripped), and symlink-backed entries — so the move
  // below doesn't ENOENT and the returned virtual path keeps the right shape.
  const fromEntry = await resolveExistingPageEntry(fromPath);
  const toDir = toParentPath
    ? resolveContentPath(toParentPath)
    : resolveContentPath("");
  const toResolved = path.join(toDir, path.basename(fromEntry.fsPath));
  const name = fromEntry.virtualName;

  const fromParentVirtual = fromPath.split("/").slice(0, -1).join("/");
  const isReorder = fromEntry.fsPath === toResolved;

  if (!isReorder && isDescendantPath(fromEntry.fsPath, toResolved)) {
    throw new Error("Cannot move a page into itself");
  }

  if (!isReorder) {
    if (await fileExists(toResolved)) {
      // Destination may be empty .agents/ scaffolding the daemon recreated at
      // the old path after a prior cabinet move — sweep it so rename succeeds.
      if (await isHollowOrphanDir(toResolved)) {
        const fsp = await import("fs/promises");
        await fsp.rm(toResolved, { recursive: true, force: true });
      } else {
        throw new Error(
          `An item named "${name}" already exists in ${
            toParentPath ? `"${toParentPath}"` : "the root"
          }. Rename or remove it first.`
        );
      }
    }
    await ensureDirectory(toDir);
    await moveResolvedEntry(fromEntry.fsPath, toResolved);
    await removeSidecarEntry(fromParentVirtual, fromEntry.virtualName).catch(() => {});
  }

  const { prevName, nextName } = options;
  if (prevName !== undefined || nextName !== undefined) {
    const order = await computeInsertOrder(
      toParentPath,
      prevName ?? null,
      nextName ?? null,
      name
    );
    await setEntryOrder(toParentPath, name, order);
  } else if (!isReorder) {
    // Cross-dir move with no neighbors → append at end.
    const order = await appendOrder(toParentPath);
    await setEntryOrder(toParentPath, name, order);
  }

  // fromEntry.virtualName already mirrors the tree-builder shape (standalone
  // .md addressed without its extension), so join it to the destination parent.
  return joinVirtualPath(toParentPath, fromEntry.virtualName);
}

export interface RenameReferencesSummary {
  linkCount: number;
  pageCount: number;
  undoToken: string | null;
  oldName: string;
  newName: string;
  /** Virtual page paths whose markdown was rewritten (no contents) — lets the
   * client refresh an open referrer without a blocking dialog. */
  changedPages: string[];
}

export interface RenameResult {
  newPath: string;
  references: RenameReferencesSummary;
}

export async function renamePage(
  virtualPath: string,
  newName: string
): Promise<RenameResult> {
  const fromResolvedVirtual = resolveContentPath(virtualPath);
  const parentDir = path.dirname(fromResolvedVirtual);
  const parentVirtual = virtualPath.split("/").slice(0, -1).join("/");

  // Tree-builder produces three virtual-path shapes (see tree-builder.ts):
  //   • directories (page-dir, cabinet, app, website): parent/<name>
  //   • standalone .md files:                          parent/<name>      (.md stripped)
  //   • typed files (pdf, csv, docx, …):               parent/<name>.<ext>
  // Resolve which one we're actually renaming so the extension survives the
  // round-trip — otherwise foo.csv becomes "foo" and disappears from the
  // sidebar (no classifier matches an extensionless file).
  type RenameKind = "directory" | "md-file" | "typed-file";
  let kind: RenameKind;
  let fromResolved = fromResolvedVirtual;
  let preservedExt = "";

  const fsp = await import("fs/promises");
  const directStat = await fsp.lstat(fromResolvedVirtual).catch(() => null);
  if (directStat) {
    if (directStat.isDirectory()) {
      kind = "directory";
    } else {
      kind = "typed-file";
      preservedExt = path.extname(fromResolvedVirtual);
    }
  } else if (await fileExists(`${fromResolvedVirtual}.md`)) {
    // Tree-builder strips ".md" from standalone-markdown paths, so the
    // virtual path resolves to a sibling that lives at <path>.md on disk.
    fromResolved = `${fromResolvedVirtual}.md`;
    kind = "md-file";
    preservedExt = ".md";
  } else {
    throw new Error(`Page not found: ${virtualPath}`);
  }

  const slug = slugifyPageName(newName);
  if (!slug) {
    throw new Error(`Invalid name: "${newName}"`);
  }
  const targetBase = kind === "directory" ? slug : `${slug}${preservedExt}`;
  const toResolved = path.join(parentDir, targetBase);

  // Wiki-links only ever resolve to .md-backed pages, so oldSlug only needs
  // to be meaningful for directory and md-file kinds — for typed files it
  // simply won't match any link.
  const oldSlug =
    kind === "md-file"
      ? path.basename(fromResolved, ".md")
      : path.basename(fromResolvedVirtual);

  // Locate the file that carries the page's frontmatter title (index.md for
  // directory-pages, the file itself for standalone .md, nothing for typed
  // files). Snapshot its bytes for Undo and for the toast's old-name.
  const titleHostBefore =
    kind === "directory"
      ? path.join(fromResolved, "index.md")
      : kind === "md-file"
      ? fromResolved
      : null;
  let titleHostBytes: string | null = null;
  let oldName =
    kind === "typed-file"
      ? path.basename(fromResolvedVirtual, preservedExt)
      : oldSlug;
  if (titleHostBefore && (await fileExists(titleHostBefore))) {
    titleHostBytes = await readFileContent(titleHostBefore);
    const { data } = matter(titleHostBytes);
    if (typeof data.title === "string" && data.title.trim()) {
      oldName = data.title;
    }
  }

  if (fromResolved === toResolved) {
    return {
      newPath: virtualPath,
      references: {
        linkCount: 0,
        pageCount: 0,
        undoToken: null,
        oldName,
        newName,
        changedPages: [],
      },
    };
  }

  // Guard against silent overwrite: fs.rename clobbers a regular file at the
  // destination on POSIX without error. fs.rename on directories has its own
  // ENOTEMPTY/EEXIST protection — surface the same friendly error for all
  // kinds so the user sees a useful message instead of lost data.
  if (await fileExists(toResolved)) {
    throw new Error(
      `An item named "${targetBase}" already exists in ${
        parentVirtual ? `"${parentVirtual}"` : "the root"
      }. Pick a different name.`
    );
  }

  // Snapshot the page list *before* the move so wiki-link resolution reflects
  // the state the links were authored against. Typed-file renames don't touch
  // wiki-links, so skip the scan there.
  const preRenamePages =
    kind === "typed-file" ? [] : (await scanCabinet()).pages;

  await fsp.rename(fromResolved, toResolved);

  // Update frontmatter title on whichever file backs this page's title.
  const titleHostAfter =
    kind === "directory"
      ? path.join(toResolved, "index.md")
      : kind === "md-file"
      ? toResolved
      : null;
  if (titleHostAfter && (await fileExists(titleHostAfter))) {
    const raw = await readFileContent(titleHostAfter);
    const { data, content } = matter(raw);
    data.title = newName;
    data.modified = new Date().toISOString();
    const fm = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );
    const output = matter.stringify(content, fm);
    await writeFileContent(titleHostAfter, output);
  }

  // Match tree-builder's virtual-path shape: typed files keep their
  // extension, directories and standalone .md files don't.
  const newBaseVirtual = kind === "typed-file" ? `${slug}${preservedExt}` : slug;
  const newPath = parentVirtual ? `${parentVirtual}/${newBaseVirtual}` : newBaseVirtual;

  // Wiki-links can only point at .md-backed pages, so skip the rewrite scan
  // for typed files entirely.
  const rewrite: RewriteResult =
    kind === "typed-file"
      ? { changed: [], linkCount: 0, pageCount: 0 }
      : await rewriteReferencesForRename({
          oldPagePath: virtualPath,
          newPagePath: newPath,
          oldResolvedDir: fromResolved,
          newResolvedDir: toResolved,
          oldSlug,
          newName,
          preRenamePages,
        });

  // Build the undo file set. The title-host bytes (when present) are always
  // included with the true pre-rename contents so Undo restores the original
  // title even when no links changed — and take precedence over any rewrite
  // entry for the same file.
  const undoFiles = new Map<string, string>();
  for (const c of rewrite.changed) {
    undoFiles.set(c.undoFsPath, c.before);
  }
  if (titleHostBytes !== null && titleHostBefore) {
    undoFiles.set(titleHostBefore, titleHostBytes);
  }

  const undoToken = recordRenameUndo({
    dirFrom: toResolved,
    dirTo: fromResolved,
    files: Array.from(undoFiles, ([fsPath, before]) => ({ fsPath, before })),
    createdAt: Date.now(),
    oldName,
    newName,
  });

  return {
    newPath,
    references: {
      linkCount: rewrite.linkCount,
      pageCount: rewrite.pageCount,
      undoToken,
      oldName,
      newName,
      changedPages: Array.from(
        new Set(rewrite.changed.map((c) => c.virtualPagePath))
      ),
    },
  };
}

import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { CABINET_LINK_META_CANDIDATES } from "@/lib/cabinets/files";
import type { PageData, FrontMatter } from "@/types";
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

function defaultFrontmatter(title: string): FrontMatter {
  const now = new Date().toISOString();
  return { title, created: now, modified: now, tags: [] };
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
    const raw = await readFileContent(filePath);
    const { data, content } = matter(raw);

    return {
      path: virtualPath,
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

  // Strip undefined values — js-yaml cannot serialize them
  const fm = Object.fromEntries(
    Object.entries({ ...frontmatter, modified: new Date().toISOString() })
      .filter(([, v]) => v !== undefined)
  );
  const output = matter.stringify(content, fm);
  await ensureDirectory(path.dirname(filePath));
  await writeFileContent(filePath, output);
}

export async function createPage(
  virtualPath: string,
  title: string
): Promise<void> {
  const resolved = resolveContentPath(virtualPath);
  const dirPath = resolved;
  const filePath = path.join(dirPath, "index.md");

  if (await fileExists(filePath)) {
    throw new Error(`Page already exists: ${virtualPath}`);
  }

  await ensureDirectory(dirPath);
  const parentVirtual = virtualPath.split("/").slice(0, -1).join("/");
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
  const fromResolved = resolveContentPath(fromPath);
  const name = path.basename(fromResolved);
  const toDir = toParentPath
    ? resolveContentPath(toParentPath)
    : resolveContentPath("");
  const toResolved = path.join(toDir, name);

  if (toResolved.startsWith(fromResolved + "/")) {
    throw new Error("Cannot move a page into itself");
  }

  const fromParentVirtual = fromPath.split("/").slice(0, -1).join("/");
  const isReorder = fromResolved === toResolved;

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
    const fsp = await import("fs/promises");
    try {
      await fsp.rename(fromResolved, toResolved);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EXDEV") {
        // Cross-device move (e.g. linked external cabinet on another mount).
        // Fall back to recursive copy + delete.
        await fsp.cp(fromResolved, toResolved, { recursive: true });
        await fsp.rm(fromResolved, { recursive: true, force: true });
      } else if (code === "ENOTEMPTY" || code === "EEXIST") {
        // Daemon recreated scaffolding between our hollow-orphan sweep and
        // this rename. Surface the same friendly message rather than the raw
        // errno — the user's options are the same either way.
        throw new Error(
          `An item named "${name}" already exists in ${
            toParentPath ? `"${toParentPath}"` : "the root"
          }. Rename or remove it first.`
        );
      } else {
        throw err;
      }
    }
    // Clean stale sidecar entry from source dir.
    await removeSidecarEntry(fromParentVirtual, name).catch(() => {});
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

  return toParentPath ? `${toParentPath}/${name}` : name;
}

export async function renamePage(
  virtualPath: string,
  newName: string
): Promise<string> {
  const fromResolved = resolveContentPath(virtualPath);
  const parentDir = path.dirname(fromResolved);
  const slug = newName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const toResolved = path.join(parentDir, slug);

  if (fromResolved === toResolved) return virtualPath;

  const fs = await import("fs/promises");
  await fs.rename(fromResolved, toResolved);

  // Update frontmatter title
  const indexMd = path.join(toResolved, "index.md");
  if (await fileExists(indexMd)) {
    const raw = await readFileContent(indexMd);
    const { data, content } = matter(raw);
    data.title = newName;
    data.modified = new Date().toISOString();
    const fm = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );
    const output = matter.stringify(content, fm);
    await writeFileContent(indexMd, output);
  }

  const parentVirtual = virtualPath.split("/").slice(0, -1).join("/");
  return parentVirtual ? `${parentVirtual}/${slug}` : slug;
}

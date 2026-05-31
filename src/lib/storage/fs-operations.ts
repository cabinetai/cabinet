import fs from "fs/promises";
import path from "path";
import {
  CABINET_LINK_META_CANDIDATES,
} from "@/lib/cabinets/files";
import { DATA_DIR } from "./path-utils";

export async function readFileContent(absPath: string): Promise<string> {
  return fs.readFile(absPath, "utf-8");
}

export async function writeFileContent(
  absPath: string,
  content: string
): Promise<void> {
  await fs.writeFile(absPath, content, "utf-8");
}

/**
 * Crash-safe write: write the full content to a sibling temp file, then
 * atomically rename it over the target. A process kill (OOM / long context /
 * crash after a provider error) leaves either the previous complete file or
 * the new complete file on disk — never a truncated/empty one. Used for
 * metadata (meta.json) whose corruption would make a task vanish from logs.
 */
export async function writeFileAtomic(
  absPath: string,
  content: string
): Promise<void> {
  const tmpPath = `${absPath}.tmp-${process.pid}-${Math.random()
    .toString(36)
    .slice(2)}`;
  try {
    await fs.writeFile(tmpPath, content, "utf-8");
    await fs.rename(tmpPath, absPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}

export async function deleteFileOrDir(absPath: string): Promise<void> {
  await fs.rm(absPath, { recursive: true, force: true });
}

export async function listDirectory(
  absPath: string
): Promise<{ name: string; isDirectory: boolean; isSymlink: boolean }[]> {
  const entries = await fs.readdir(absPath, { withFileTypes: true });
  return Promise.all(
    entries.map(async (entry) => {
      let isDirectory = entry.isDirectory();
      const isSymlink = entry.isSymbolicLink();

      if (!isDirectory && isSymlink) {
        try {
          const stat = await fs.stat(path.join(absPath, entry.name));
          isDirectory = stat.isDirectory();
        } catch {
          isDirectory = false;
        }
      }

      return { name: entry.name, isDirectory, isSymlink };
    })
  );
}

export async function unlinkSymlink(absPath: string): Promise<void> {
  try {
    const target = await fs.readlink(absPath);
    const resolvedTarget = path.resolve(path.dirname(absPath), target);
    for (const filename of CABINET_LINK_META_CANDIDATES) {
      await fs.unlink(path.join(resolvedTarget, filename)).catch(() => {});
    }
  } catch {
    // target may be broken — still remove the symlink
  }
  await fs.unlink(absPath);
}

export async function ensureDirectory(absPath: string): Promise<void> {
  await fs.mkdir(absPath, { recursive: true });
}

export async function fileExists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDataDir(): Promise<void> {
  await ensureDirectory(DATA_DIR);
}

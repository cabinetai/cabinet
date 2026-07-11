import fs from "fs";
import path from "path";
import { isHiddenEntry } from "./path-utils";

function resolvesToDir(p: string): boolean {
  try {
    // fs.stat follows symlinks; Dirent.isDirectory() does not.
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Count the directories a watcher would have to watch under `rootDir`, using the
 * same ignore rules as the indexer. Stops as soon as the count exceeds
 * `maxBeforeAbort`, so it stays cheap (~tens of ms) even on huge trees.
 *
 * Symlinked directories are followed, because the indexer's `walkDataDir` follows
 * them: counting only real dirs let a big tree hide behind a single symlink and
 * defeat the guard entirely (issue #131). Real paths already counted are tracked
 * so symlink cycles terminate and a tree reachable twice is only counted once.
 */
export function countWatchableDirs(rootDir: string, maxBeforeAbort: number): number {
  let count = 0;
  const visited = new Set<string>();
  const stack: string[] = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;

    let real: string;
    try {
      real = fs.realpathSync(dir);
    } catch {
      continue;
    }
    if (visited.has(real)) continue;
    visited.add(real);

    count += 1;
    if (count > maxBeforeAbort) return count;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (isHiddenEntry(entry.name)) continue;
      const childPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(childPath);
      } else if (entry.isSymbolicLink() && resolvesToDir(childPath)) {
        stack.push(childPath);
      }
    }
  }
  return count;
}

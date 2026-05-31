import chokidar, { type FSWatcher } from "chokidar";
import path from "path";
import { DATA_DIR, isHiddenEntry } from "../../src/lib/storage/path-utils";
import { buildPageRecord, SearchIndex, virtualPathFor } from "./index-builder";

export interface WatcherOptions {
  onIndexing?: () => void;
  onIndexed?: (info: { path: string; kind: "add" | "change" | "remove" }) => void;
}

const DEBOUNCE_MS = 150;

function insideHiddenDir(fsPath: string): boolean {
  const rel = fsPath.slice(DATA_DIR.length).replace(/^\//, "");
  const segments = rel.split("/");
  segments.pop();
  return segments.some((seg) => isHiddenEntry(seg));
}

export function startWatcher(
  index: SearchIndex,
  opts: WatcherOptions = {}
): FSWatcher {
  const watcher = chokidar.watch(DATA_DIR, {
    ignoreInitial: true,
    // Do NOT follow symlinks. A symlinked cabinet root can point into a tree
    // full of dev repos (node_modules, .git, …); chokidar opens fds across the
    // whole symlink target *before* `ignored` can prune it, so a single linked
    // root can blow past macOS's per-process fd cap (kern.maxfilesperproc,
    // ~10240) and the watcher dies with EMFILE. With followSymlinks off,
    // chokidar honors `ignored` during descent and only watches real dirs under
    // DATA_DIR. Symlinked roots are still picked up by the initial walkDataDir
    // index (and on restart); they just won't live-reindex on every keystroke.
    followSymlinks: false,
    ignored: (p: string) => {
      const rel = p.slice(DATA_DIR.length).replace(/^\//, "");
      if (!rel) return false;
      const segments = rel.split("/");
      for (const seg of segments) {
        if (isHiddenEntry(seg)) return true;
      }
      const leaf = segments[segments.length - 1];
      // Only follow directories and *.md files into chokidar's stat pipeline.
      if (leaf.includes(".") && !leaf.endsWith(".md")) return true;
      return false;
    },
  });

  const pending = new Map<string, { kind: "add" | "change" | "remove"; timer: NodeJS.Timeout }>();

  const schedule = (fsPath: string, kind: "add" | "change" | "remove") => {
    const existing = pending.get(fsPath);
    if (existing) clearTimeout(existing.timer);
    opts.onIndexing?.();
    const timer = setTimeout(() => {
      pending.delete(fsPath);
      void process(fsPath, kind);
    }, DEBOUNCE_MS);
    pending.set(fsPath, { kind, timer });
  };

  const process = async (fsPath: string, kind: "add" | "change" | "remove") => {
    if (insideHiddenDir(fsPath)) return;
    const virtualPath = virtualPathFor(fsPath);
    if (!virtualPath) return;

    if (kind === "remove") {
      index.remove(virtualPath);
      opts.onIndexed?.({ path: virtualPath, kind });
      return;
    }

    const record = await buildPageRecord(fsPath, virtualPath);
    if (!record) return;
    if (kind === "add") index.add(record);
    else index.update(record);
    opts.onIndexed?.({ path: virtualPath, kind });
  };

  watcher.on("add", (p) => schedule(p, "add"));
  watcher.on("change", (p) => schedule(p, "change"));
  watcher.on("unlink", (p) => schedule(p, "remove"));

  // EMFILE / ENOSPC fire when the kernel runs out of file descriptors / inotify
  // watches. Without this handler, every error becomes an unhandled rejection
  // and chokidar keeps retrying — flooding the log with thousands of identical
  // traces. We log once, close the watcher, and leave the daemon up. Live
  // updates stop, but search/UI still work; the user sees a clear next step.
  let watcherFailed = false;
  watcher.on("error", (err: unknown) => {
    if (watcherFailed) return;
    watcherFailed = true;
    const code = (err as NodeJS.ErrnoException)?.code;
    const msg = err instanceof Error ? err.message : String(err);
    if (code === "EMFILE" || code === "ENOSPC") {
      console.warn(
        `[search-watcher] disabled: ${code} (file watch limit exhausted on ${DATA_DIR}).\n` +
          `  Live updates are off. Search results still work but won't auto-refresh.\n` +
          `  Cabinet uses chokidar v5, which opens one OS handle per directory, so\n` +
          `  large trees can exhaust the limit even with ulimit -n raised.\n` +
          `  Fix options:\n` +
          `    1. Pick a smaller cabinet directory:  cabinetai run --data-dir ~/Documents/Cabinet\n` +
          `    2. Forget the current binding:        cabinetai reset-config\n` +
          `    3. Raise the descriptor limit:        ulimit -n 65536  (macOS/Linux)\n` +
          `    4. Linux only: bump inotify watches: sudo sysctl fs.inotify.max_user_watches=524288`
      );
    } else {
      console.warn(`[search-watcher] disabled: ${code ?? "error"} — ${msg}`);
    }
    void watcher.close().catch(() => {
      /* already closing */
    });
  });

  return watcher;
}

/**
 * In-memory registry of recently completed renames so the toast's "Undo" can
 * fully reverse them. State is kept server-side (not shipped to the client)
 * because the `before` payloads can be large and need never round-trip.
 *
 * Bounded: last 8 renames, 10-minute TTL. An expired/used token simply can no
 * longer be undone — the UI reports that rather than leaving partial state.
 */

import fs from "fs/promises";
import path from "path";

export interface RenameUndoRecord {
  /** Directory the rename moved *to* (reverse: move it back to `dirTo`). */
  dirFrom: string;
  /** Directory the rename moved *from*. */
  dirTo: string;
  /** Pre-rename file contents, keyed by the absolute path they belong at
   * once the directory move has been reversed. */
  files: { fsPath: string; before: string }[];
  createdAt: number;
  /** Human label for the toast / messaging. */
  oldName: string;
  newName: string;
}

const TTL_MS = 10 * 60 * 1000;
const MAX_RECORDS = 8;

const registry = new Map<string, RenameUndoRecord>();

function gc() {
  const now = Date.now();
  for (const [token, rec] of registry) {
    if (now - rec.createdAt > TTL_MS) registry.delete(token);
  }
  while (registry.size > MAX_RECORDS) {
    const oldest = registry.keys().next().value;
    if (oldest === undefined) break;
    registry.delete(oldest);
  }
}

export function recordRenameUndo(rec: RenameUndoRecord): string {
  gc();
  const token = `rnu_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  registry.set(token, rec);
  return token;
}

export interface UndoOutcome {
  ok: boolean;
  reason?: "expired";
  oldName?: string;
  newName?: string;
  restoredFiles?: number;
}

/**
 * Reverse a rename: move the directory back, then restore every rewritten
 * file's original bytes. Consumes the token (single use).
 */
export async function undoRename(token: string): Promise<UndoOutcome> {
  gc();
  const rec = registry.get(token);
  if (!rec) return { ok: false, reason: "expired" };
  registry.delete(token);

  // 1. Reverse the directory move so original file paths exist again.
  if (rec.dirFrom !== rec.dirTo) {
    await fs.rename(rec.dirFrom, rec.dirTo);
  }

  // 2. Restore every rewritten file's pre-rename content.
  let restoredFiles = 0;
  for (const f of rec.files) {
    try {
      await fs.mkdir(path.dirname(f.fsPath), { recursive: true });
      await fs.writeFile(f.fsPath, f.before, "utf8");
      restoredFiles += 1;
    } catch {
      // Best-effort: a single failed restore shouldn't abort the rest.
    }
  }

  return {
    ok: true,
    oldName: rec.oldName,
    newName: rec.newName,
    restoredFiles,
  };
}

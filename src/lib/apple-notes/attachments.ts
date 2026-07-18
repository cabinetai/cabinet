import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";

const execFileP = promisify(execFile);

export interface AttachmentRef {
  /** Absolute source path of the media file in the Notes group container. */
  srcPath: string;
  /** Original filename (used as the in-page asset name). */
  filename: string;
}

export class AppleNotesAttachmentsUnavailable extends Error {
  constructor(
    message: string,
    /** "fda" (Full Disk Access), "schema" (unexpected DB layout), or "none". */
    public reason: "fda" | "schema" | "none"
  ) {
    super(message);
  }
}

function groupContainer(): string {
  return path.join(
    os.homedir(),
    "Library",
    "Group Containers",
    "group.com.apple.notes"
  );
}

/** Columns this query depends on. If the schema ever drops one, we degrade. */
const REQUIRED_COLS = ["Z_PK", "ZNOTE", "ZMEDIA", "ZIDENTIFIER", "ZFILENAME"];

async function copyDb(dest: string): Promise<string> {
  const src = path.join(groupContainer(), "NoteStore.sqlite");
  const dbCopy = path.join(dest, "NoteStore.sqlite");
  try {
    // Copy the WAL/SHM too — Notes keeps the DB open, so recent rows live in
    // the -wal until a checkpoint. Missing sidecars are fine.
    await fs.copyFile(src, dbCopy);
    for (const sfx of ["-wal", "-shm"]) {
      await fs.copyFile(src + sfx, dbCopy + sfx).catch(() => {});
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === "EPERM" || e?.code === "EACCES") {
      throw new AppleNotesAttachmentsUnavailable(
        "Importing attachments needs Full Disk Access. Grant it under System Settings → Privacy & Security → Full Disk Access, then re-import. Text imported without images.",
        "fda"
      );
    }
    throw new AppleNotesAttachmentsUnavailable(
      "Apple Notes database not found. Text imported without images.",
      "none"
    );
  }
  return dbCopy;
}

async function sqlJson<T>(dbCopy: string, query: string): Promise<T[]> {
  const { stdout } = await execFileP("sqlite3", ["-json", dbCopy, query], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(stdout.trim() || "[]") as T[];
}

async function resolveMediaFile(mediaId: string, filename: string): Promise<string | null> {
  // On disk: Accounts/<acctUUID>/Media/<mediaId>/<filename>. The account FK
  // column in the DB drifts across macOS versions, so we glob accounts instead
  // of joining to it. ponytail: scan Accounts/* — robust to that column rename.
  const accountsRoot = path.join(groupContainer(), "Accounts");
  let accounts: string[];
  try {
    accounts = await fs.readdir(accountsRoot);
  } catch {
    return null;
  }
  for (const acct of accounts) {
    const candidate = path.join(accountsRoot, acct, "Media", mediaId, filename);
    if (await fs.stat(candidate).then((s) => s.isFile()).catch(() => false)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Map note rowids → their on-disk attachment files. Best-effort and read-only:
 * copies the NoteStore DB to a temp dir, joins attachment→media rows, then
 * locates each media file in the group container's Accounts/ tree.
 *
 * Throws AppleNotesAttachmentsUnavailable (with a reason) when the data can't
 * be read — the caller degrades to a text-only import. Notes' Core Data schema
 * is version-fragile; we verify the required columns up front and bail to
 * "schema" rather than crash.
 * ponytail: hardcodes ZNOTE/ZMEDIA/ZIDENTIFIER/ZFILENAME (stable on macOS
 * 12–15). If a future macOS renames them, upgrade to PRAGMA-based discovery.
 */
export async function collectNoteAttachments(
  noteRowids: number[]
): Promise<Map<number, AttachmentRef[]>> {
  const byNote = new Map<number, AttachmentRef[]>();
  if (process.platform !== "darwin" || noteRowids.length === 0) return byNote;

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-notes-db-"));
  try {
    const dbCopy = await copyDb(tmp);

    const cols = await sqlJson<{ name: string }>(
      dbCopy,
      "PRAGMA table_info(ZICCLOUDSYNCINGOBJECT);"
    ).catch(() => []);
    const have = new Set(cols.map((c) => c.name));
    if (have.size === 0 || !REQUIRED_COLS.every((c) => have.has(c))) {
      throw new AppleNotesAttachmentsUnavailable(
        "Apple Notes uses an unfamiliar database layout on this macOS version. Text imported without images.",
        "schema"
      );
    }

    const ids = noteRowids.filter((r) => Number.isInteger(r)).join(",");
    const rows = await sqlJson<{ noteId: number; mediaId: string; filename: string }>(
      dbCopy,
      `SELECT att.ZNOTE AS noteId, m.ZIDENTIFIER AS mediaId, m.ZFILENAME AS filename
       FROM ZICCLOUDSYNCINGOBJECT att
       JOIN ZICCLOUDSYNCINGOBJECT m ON att.ZMEDIA = m.Z_PK
       WHERE att.ZNOTE IN (${ids})
         AND m.ZFILENAME IS NOT NULL AND m.ZIDENTIFIER IS NOT NULL;`
    );

    for (const row of rows) {
      const src = await resolveMediaFile(row.mediaId, row.filename);
      if (!src) continue; // sketches/locked/cloud-only attachments have no local file
      const list = byNote.get(row.noteId) ?? [];
      list.push({ srcPath: src, filename: row.filename });
      byNote.set(row.noteId, list);
    }
    return byNote;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

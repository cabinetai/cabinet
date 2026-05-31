import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "@/lib/storage/path-utils";

export const ALLOWED_AVATAR_EXT = new Set(["png", "jpg", "jpeg", "svg"]);
export const MAX_AVATAR_BYTES = 1024 * 1024; // 1 MB

export type AvatarExt = "png" | "jpg" | "svg";

export function extFromMime(mime: string): AvatarExt | null {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/svg+xml") return "svg";
  return null;
}

export function contentTypeForExt(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "svg") return "image/svg+xml";
  return "image/jpeg";
}

/** Ensures `resolved` is inside DATA_DIR; throws otherwise. */
export function assertInsideDataDir(resolved: string): void {
  const root = path.resolve(DATA_DIR);
  if (!resolved.startsWith(root)) {
    throw new Error("Path traversal detected");
  }
}

/** Remove every `<dir>/<prefix>.<ext>` variant so at most one avatar file remains. */
export async function clearAvatarFiles(
  dir: string,
  prefix: string
): Promise<void> {
  for (const e of ALLOWED_AVATAR_EXT) {
    await fs.unlink(
      path.join(
        /*turbopackIgnore: true*/ dir,
        /*turbopackIgnore: true*/ `${prefix}.${e}`
      )
    ).catch(() => {});
  }
}

/** Read `<dir>/<prefix>.<ext>` and return its buffer, or null if missing. */
export async function readAvatarFile(
  dir: string,
  prefix: string,
  ext: string
): Promise<Buffer | null> {
  if (!ALLOWED_AVATAR_EXT.has(ext)) return null;
  try {
    return await fs.readFile(
      path.join(
        /*turbopackIgnore: true*/ dir,
        /*turbopackIgnore: true*/ `${prefix}.${ext}`
      )
    );
  } catch {
    return null;
  }
}

/** Validate + write `<dir>/<prefix>.<ext>`. Clears prior variants first. */
export async function writeAvatarFile(
  dir: string,
  prefix: string,
  file: File
): Promise<{ ok: true; ext: AvatarExt } | { ok: false; status: number; error: string }> {
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, status: 413, error: "File too large (max 1 MB)" };
  }
  const ext = extFromMime(file.type);
  if (!ext) {
    return { ok: false, status: 415, error: "Unsupported type" };
  }
  await fs.mkdir(dir, { recursive: true });
  await clearAvatarFiles(dir, prefix);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(
    path.join(
      /*turbopackIgnore: true*/ dir,
      /*turbopackIgnore: true*/ `${prefix}.${ext}`
    ),
    buf
  );
  return { ok: true, ext };
}

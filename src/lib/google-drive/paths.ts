/** Prefix used for all Google Drive node paths. No :// to avoid Next.js routing issues. */
export const GDRIVE_PREFIX = "gdrive:";

/** Encode an absolute filesystem path as a Drive node path. */
export function encodeDrivePath(absPath: string): string {
  return `${GDRIVE_PREFIX}${absPath}`;
}

/**
 * Decode a Drive node path back to an absolute filesystem path.
 * Returns null if the path is not a Drive path.
 */
export function decodeDrivePath(nodePath: string): string | null {
  if (!nodePath.startsWith(GDRIVE_PREFIX)) return null;
  const suffix = nodePath.slice(GDRIVE_PREFIX.length);
  return suffix || null;
}

/**
 * Kept for legacy imports, but Optale Observatory does not download upstream
 * Cabinet templates.
 */
export async function downloadRegistryTemplate(
  _slug: string,
  _targetDir: string
): Promise<void> {
  void _slug;
  void _targetDir;
  throw new Error("Template registry imports are disabled in Optale Observatory.");
}

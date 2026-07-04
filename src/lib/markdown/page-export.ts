import { markdownToHtml } from "@/lib/markdown/to-html";

/**
 * Page export/download actions, shared by the editor toolbar's Export menu and
 * the sidebar right-click "Download" submenu. Each takes already-loaded markdown
 * `content` (the toolbar passes live editor content; the sidebar fetches the
 * saved file) so the two entry points stay in sync.
 */

export function copyMarkdown(content: string): Promise<void> {
  return navigator.clipboard.writeText(content);
}

/** Copy the page as an LLM-friendly document; returns the byte size copied. */
export async function copyForLlm(
  content: string,
  path: string,
  title: string
): Promise<number> {
  const body = content.replace(
    /\]\((\.\/)?([^)\s]+\.md)\)/g,
    "]($2 — also in this cabinet)"
  );
  const out = `# ${title}\n\nSource: cabinet://${path}\n\n---\n\n${body}`;
  await navigator.clipboard.writeText(out);
  return new TextEncoder().encode(out).length;
}

/** Copy the page rendered to HTML (relative image/link URLs resolved via `path`). */
export async function copyAsHtml(content: string, path: string): Promise<void> {
  const html = await markdownToHtml(content, path || undefined);
  await navigator.clipboard.writeText(html);
}

export function downloadMarkdown(content: string, title: string): void {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download any file straight from its asset URL (no transform). */
export function downloadRawFile(assetUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = assetUrl;
  a.download = filename;
  a.click();
}

/** Human byte size for the copied-for-LLM toast. */
export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

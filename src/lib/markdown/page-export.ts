import { markdownToHtml } from "@/lib/markdown/to-html";

/**
 * Page export/download actions, shared by the editor toolbar's Export menu and
 * the sidebar right-click "Download" submenu. Each takes already-loaded markdown
 * `content` (the toolbar passes live editor content; the sidebar fetches the
 * saved file) so the two entry points stay in sync.
 */

export interface MarkdownImageExportResult {
  content: string;
  failedImages: number;
}

type ImageFetcher = (url: string) => Promise<Blob>;
type ImageReference = { source: string; start: number; end: number };

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

export function findMarkdownImageReferences(content: string): ImageReference[] {
  const references: ImageReference[] = [];
  const markdownImage = /!\[[^\]]*\]\(\s*(?:<([^>\r\n]+)>|([^\s)]+))/g;
  const htmlImage = /<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi;

  for (const match of content.matchAll(markdownImage)) {
    const source = match[1] || match[2];
    if (!source || match.index === undefined) continue;
    const offset = match[0].lastIndexOf(source);
    references.push({
      source,
      start: match.index + offset,
      end: match.index + offset + source.length,
    });
  }

  for (const match of content.matchAll(htmlImage)) {
    const source = match[2];
    if (!source || match.index === undefined) continue;
    const offset = match[0].lastIndexOf(source);
    references.push({
      source,
      start: match.index + offset,
      end: match.index + offset + source.length,
    });
  }

  return references.sort((a, b) => a.start - b.start);
}

export function resolveMarkdownImageUrl(
  source: string,
  assetBase: string,
  origin = typeof window === "undefined" ? "http://localhost" : window.location.origin
): string | null {
  const value = source.trim();
  if (!value || /^(?:data|blob|https?|file):/i.test(value) || value.startsWith("//")) {
    return null;
  }
  if (value.startsWith("/api/assets/")) return new URL(value, origin).toString();
  if (value.startsWith("/")) return null;
  const base = assetBase.replace(/^\/+|\/+$/g, "");
  const assetPath = `/api/assets/${base ? `${base}/` : ""}${value}`;
  return new URL(assetPath, origin).toString();
}

function applyReplacements(
  content: string,
  replacements: Array<ImageReference & { replacement: string }>
): string {
  return [...replacements]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (result, item) =>
        `${result.slice(0, item.start)}${item.replacement}${result.slice(item.end)}`,
      content
    );
}

async function defaultImageFetcher(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image request failed with status ${response.status}`);
  return response.blob();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

export async function embedMarkdownImages(
  content: string,
  assetBase: string,
  fetchImage: ImageFetcher = defaultImageFetcher
): Promise<MarkdownImageExportResult> {
  const references = findMarkdownImageReferences(content);
  const fetched = new Map<string, Promise<string>>();
  const localReferences = references.flatMap((reference) => {
    const url = resolveMarkdownImageUrl(reference.source, assetBase);
    return url ? [{ reference, url }] : [];
  });
  const replacements: Array<ImageReference & { replacement: string }> = [];
  let failedImages = 0;

  for (const { url } of localReferences) {
    if (!fetched.has(url)) fetched.set(url, fetchImage(url).then(blobToDataUrl));
  }
  for (const { reference, url } of localReferences) {
    try {
      replacements.push({ ...reference, replacement: await fetched.get(url)! });
    } catch {
      failedImages += 1;
    }
  }

  return { content: applyReplacements(content, replacements), failedImages };
}

function safeAssetFilename(source: string, index: number): string {
  let name = source.split(/[?#]/, 1)[0].split("/").pop() || `image-${index}`;
  try {
    name = decodeURIComponent(name);
  } catch {}
  name = name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
  return `${String(index).padStart(2, "0")}-${name || "image"}`;
}

function safeDownloadTitle(title: string): string {
  return title.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "page";
}

export function markdownBundleFilename(title: string): string {
  return `${safeDownloadTitle(title)}.zip`;
}

export async function buildMarkdownBundle(
  content: string,
  title: string,
  assetBase: string,
  fetchImage: ImageFetcher = defaultImageFetcher
): Promise<{ blob: Blob; failedImages: number }> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const references = findMarkdownImageReferences(content);
  const assets = new Map<string, { path: string; data: Promise<ArrayBuffer> }>();
  const localReferences = references.flatMap((reference) => {
    const url = resolveMarkdownImageUrl(reference.source, assetBase);
    return url ? [{ reference, url }] : [];
  });
  const replacements: Array<ImageReference & { replacement: string }> = [];
  let failedImages = 0;

  for (const { reference, url } of localReferences) {
    if (!assets.has(url)) {
      const path = `assets/${safeAssetFilename(reference.source, assets.size + 1)}`;
      assets.set(url, { path, data: fetchImage(url).then((blob) => blob.arrayBuffer()) });
    }
  }
  for (const { reference, url } of localReferences) {
    const asset = assets.get(url)!;
    try {
      await asset.data;
      replacements.push({ ...reference, replacement: `./${asset.path}` });
    } catch {
      failedImages += 1;
    }
  }

  for (const asset of assets.values()) {
    try {
      zip.file(asset.path, await asset.data);
    } catch {}
  }
  const safeTitle = safeDownloadTitle(title);
  zip.file(`${safeTitle}.md`, applyReplacements(content, replacements));
  return {
    blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }),
    failedImages,
  };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadMarkdown(
  content: string,
  title: string,
  assetBase: string
): Promise<MarkdownImageExportResult> {
  const result = await embedMarkdownImages(content, assetBase);
  downloadBlob(new Blob([result.content], { type: "text/markdown" }), `${safeDownloadTitle(title)}.md`);
  return result;
}

export async function downloadMarkdownBundle(
  content: string,
  title: string,
  assetBase: string
): Promise<{ failedImages: number }> {
  const result = await buildMarkdownBundle(content, title, assetBase);
  downloadBlob(result.blob, markdownBundleFilename(title));
  return { failedImages: result.failedImages };
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

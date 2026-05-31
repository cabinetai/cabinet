import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { detectEmbed } from "@/lib/embeds/detect";
import { slugifyPageName } from "@/lib/markdown/wiki-links";

/**
 * Pre-process markdown to convert [[Wiki Links]] to HTML anchors
 * before the remark pipeline (which doesn't understand wiki-link syntax).
 */
function convertWikiLinks(markdown: string): string {
  return markdown.replace(/\[\[([^\]]+)\]\]/g, (_match, pageName: string) => {
    const slug = slugifyPageName(pageName);
    return `<a data-wiki-link="true" data-page-name="${pageName}" href="#page:${slug}" class="wiki-link">${pageName}</a>`;
  });
}

/**
 * Post-process HTML to fix task list structure for Tiptap compatibility.
 * remark-gfm outputs: <li><input type="checkbox" ...> text</li>
 * Tiptap expects:     <li data-type="taskItem" data-checked="..."><label><input ...></label><div><p>text</p></div></li>
 * And the parent <ul> needs class="task-list" and data-type="taskList".
 */
function fixTaskListHtml(html: string): string {
  // Convert task list <ul> with contains-task-list class
  html = html.replace(
    /<ul class="contains-task-list">/g,
    '<ul data-type="taskList" class="task-list">'
  );

  // Convert each task list item to Tiptap's expected structure
  html = html.replace(
    /<li class="task-list-item">\s*<input type="checkbox"([^>]*)>\s*([\s\S]*?)(?=<\/li>)/g,
    (_match, attrs: string, content: string) => {
      const checked = attrs.includes("checked");
      const cleanContent = content.trim();
      return `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"${checked ? " checked" : ""}></label><div><p>${cleanContent}</p></div>`;
    }
  );

  return html;
}

/**
 * Add `dir="auto"` to each list *item* (never the `<ul>`/`<ol>`) so a Hebrew
 * item infers RTL and, with `padding-inline-start` on the `<li>` (see
 * `.rtl-aware li` in globals.css), renders its bullet/number on the right.
 * `dir="auto"` ignores descendants that carry their own `dir`, so putting it
 * on the container would make a list full of `dir`-bearing items resolve LTR
 * and pin every marker left. Mirrors the editor's AutoDirection extension.
 * Skips items that already carry an explicit dir (e.g. task-list markup from
 * fixTaskListHtml).
 */
function addListAutoDir(html: string): string {
  return html.replace(
    /<li((?:\s[^>]*)?)>/gi,
    (match, attrs: string) =>
      /\bdir=/i.test(attrs) ? match : `<li${attrs} dir="auto">`
  );
}

/**
 * Upgrade broken `<video src="https://youtu.be/...">` (or any non-file video URL
 * that points at a known embed provider) into a real iframe embed block.
 *
 * This heals content written before we had proper embed support, and also any
 * time the TipTap schema round-trip collapsed an iframe into a video tag.
 */
function upgradeProviderVideos(html: string): string {
  return html.replace(
    /<video\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/video>/gi,
    (match, before: string, src: string, after: string) => {
      const detected = detectEmbed(src);
      if (!detected || detected.provider === "video") return match;

      const aspect = detected.aspectRatio
        ? ` data-aspect-ratio="${detected.aspectRatio}"`
        : "";
      return (
        `<div data-embed="true" data-provider="${detected.provider}"` +
        ` data-src="${detected.embedUrl}"` +
        ` data-original-url="${detected.originalUrl}"${aspect}>` +
        `<iframe src="${detected.embedUrl}"` +
        ` data-embed-provider="${detected.provider}"` +
        ` allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"` +
        ` allowfullscreen loading="lazy" frameborder="0"></iframe>` +
        `</div>`
      );
    }
  );
}

/**
 * Rewrite relative URLs (./file.pdf, ./image.png) to /api/assets/{pagePath}/file
 * and convert PDF links to inline embedded viewers.
 * Applies to href, src, and data-src attributes (the last is used by embed blocks).
 */
function resolveRelativeUrls(html: string, pagePath: string): string {
  const dirPath = pagePath;

  html = html.replace(
    /href="\.\/([^"]+)"/g,
    (_match, file: string) => `href="/api/assets/${dirPath}/${file}"`
  );

  html = html.replace(
    /src="\.\/([^"]+)"/g,
    (_match, file: string) => `src="/api/assets/${dirPath}/${file}"`
  );

  html = html.replace(
    /data-src="\.\/([^"]+)"/g,
    (_match, file: string) => `data-src="/api/assets/${dirPath}/${file}"`
  );

  // Mark PDF links with a data attribute so the editor can handle them
  html = html.replace(
    /<a([^>]*?)href="(\/api\/assets\/[^"]+\.pdf)"([^>]*?)>/gi,
    (_match, before: string, url: string, after: string) => {
      return `<a${before}href="${url}"${after} data-pdf-link="true">`;
    }
  );

  return html;
}

// Unified's plugin resolution + processor freeze runs on every `unified()`
// call. Reuse a single frozen pipeline across every page render so
// navigation doesn't pay that cost on the hot path.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true })
  .freeze();

export async function markdownToHtml(markdown: string, pagePath?: string): Promise<string> {
  // Pre-process wiki-links before remark (which would treat [[ as text)
  const preprocessed = convertWikiLinks(markdown);

  const result = await processor.process(preprocessed);

  let html = String(result);

  // Post-process task lists for Tiptap compatibility
  html = fixTaskListHtml(html);

  // Let Hebrew lists infer RTL so markers sit on the right
  html = addListAutoDir(html);

  // Heal <video src="youtube-url"> into real iframe embeds
  html = upgradeProviderVideos(html);

  // Resolve relative URLs if page path is provided
  if (pagePath) {
    html = resolveRelativeUrls(html, pagePath);
  }

  return html;
}

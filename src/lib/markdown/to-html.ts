import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import type { Schema } from "hast-util-sanitize";
import { detectEmbed } from "@/lib/embeds/detect";
import { slugifyPageName } from "@/lib/markdown/wiki-links";
import { addHeadingIds } from "@/lib/markdown/heading-slug";

/**
 * Pre-process markdown to convert ![[file.tex]] embeds into
 * <div data-latex-embed> markers before the remark pipeline.
 * Only matches .tex files so wiki-link-style image embeds for other
 * types are unaffected.
 */
function convertLatexEmbeds(markdown: string): string {
  return markdown.replace(
    /!\[\[([^\]]+\.(?:tex|latex))\]\]/gi,
    (_match, path: string) => {
      // Escape the path before it lands in the data-path attribute so a name
      // containing `"`, `<`, `>` or `&` can't break out and inject markup.
      const safePath = path
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<div data-latex-embed="true" data-path="${safePath}"></div>`;
    }
  );
}

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
 * Pre-process markdown to URL-encode spaces in file:// link URLs.
 * CommonMark terminates a bare URL at the first whitespace, so
 * [text](file:///path/My File.pdf) is not parsed as a link. This encodes
 * spaces in the path so the remark pipeline sees a valid URL.
 */
function encodeFileUrls(markdown: string): string {
  return markdown.replace(
    /\]\((file:\/\/[^)]+)\)/g,
    (_match, url: string) => `](${url.replace(/ /g, "%20")})`
  );
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

  // Agents routinely write bare relative refs (`![x](image.jpg)`, no `./`).
  // Rewrite those for src/data-src too — a relative media src can only mean a
  // page asset. Skip schemes (https:, data:), absolute paths (incl. already
  // rewritten /api/assets/…), protocol-relative URLs, anchors, and queries.
  // href is deliberately NOT given this treatment: a bare relative href is
  // usually a page-to-page link, not an asset.
  html = html.replace(
    /(?<![\w-])(src|data-src)="(?![a-z][a-z0-9+.-]*:)(?![/#?])([^"]+)"/gi,
    (_match, attr: string, file: string) => `${attr}="/api/assets/${dirPath}/${file}"`
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

// Sanitization schema (#66): the pipeline used to trust raw HTML pass-through
// and stringify it verbatim, which meant any agent output containing markup
// like `<img src=x onerror=…>` or `<a href="javascript:…">` executed inside
// Cabinet's origin — where the daemon auth token and `/api/daemon/pty` live.
// Extend hast-util-sanitize's default allowlist to cover the markup this
// pipeline legitimately produces (GFM task lists, wiki-link/LaTeX/embed
// data-attributes, the `<video>` tags that `upgradeProviderVideos` heals
// downstream) while leaving event handlers, `javascript:` URLs, `<script>`,
// `<style>`, and `<iframe>` for the raw-HTML path stripped out.
//
// Trusted post-processing (task-list transform, video→iframe upgrade, heading
// ids, PDF-link marker, relative-URL resolution) runs AFTER sanitize on
// already-sanitized HTML, so nothing it adds needs to survive the allowlist.
const sanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "mark",
    "kbd",
    "video",
  ],
  attributes: {
    ...defaultSchema.attributes,
    // Any `data-*` attribute survives — the pipeline itself and downstream
    // React components rely on data-latex-embed, data-wiki-link, data-embed,
    // data-provider, data-src, etc. These are inert as far as HTML execution
    // is concerned; scripting attributes like `on*` are still stripped by
    // the default deny-list.
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "dir", "data*"],
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      ["type", "checkbox"],
      "checked",
      "disabled",
    ],
    // `<video src=…>` is a legitimate authoring shape that the healer in
    // upgradeProviderVideos turns into a trusted embed iframe. Allow the
    // source URL through so healing can inspect it, and cap the protocols
    // to http(s) so raw HTML can't smuggle a `javascript:` src.
    video: ["src", "controls", "width", "height", "poster"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto", "tel"],
    src: ["http", "https"],
  },
};

// Unified's plugin resolution + processor freeze runs on every `unified()`
// call. Reuse a single frozen pipeline across every page render so
// navigation doesn't pay that cost on the hot path.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeStringify)
  .freeze();

export async function markdownToHtml(markdown: string, pagePath?: string): Promise<string> {
  // Encode spaces in file:// link URLs before remark (which terminates
  // bare URLs at whitespace)
  const withFileUrls = encodeFileUrls(markdown);
  // Convert ![[file.tex]] LaTeX embeds to HTML markers before remark
  const withLatex = convertLatexEmbeds(withFileUrls);
  // Pre-process wiki-links before remark (which would treat [[ as text)
  const preprocessed = convertWikiLinks(withLatex);

  const result = await processor.process(preprocessed);

  let html = String(result);

  // Post-process task lists for Tiptap compatibility
  html = fixTaskListHtml(html);

  // Let Hebrew lists infer RTL so markers sit on the right
  html = addListAutoDir(html);

  // Heal <video src="youtube-url"> into real iframe embeds
  html = upgradeProviderVideos(html);

  // Add heading ids so #section anchors work in previews/agent messages too
  // (PRD §11), matching the editor's HeadingAnchors slug scheme.
  html = addHeadingIds(html);

  // Resolve relative URLs if page path is provided
  if (pagePath) {
    html = resolveRelativeUrls(html, pagePath);
  }

  return html;
}

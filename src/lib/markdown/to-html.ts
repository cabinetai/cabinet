import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { detectEmbed } from "@/lib/embeds/detect";
import { slugifyPageName } from "@/lib/markdown/wiki-links";
import { addHeadingIds } from "@/lib/markdown/heading-slug";
import { transformMdxToHtml } from "@/lib/mdx/jsx";

/**
 * HTML-escape a string for safe embedding inside a `<code>` element.
 * Prevents the remark pipeline from interpreting the code content as markup.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Pre-process markdown to convert ```jsx live (or ~~~jsx live) fenced code
 * blocks into `<pre data-live-code="true"><code>…</code></pre>` markers
 * before the remark pipeline. Without this, remark treats them as ordinary
 * code blocks and strips the `live` qualifier from the info string, losing
 * the round-trip signal for the LiveCodeBlock Tiptap node.
 *
 * Applied BEFORE `transformMdxToHtml` so the regex doesn't collide with
 * MDX component rewriting.
 */
function transformLiveCodeBlocks(markdown: string): string {
  // Match ``` or ~~~ with info string "jsx live", followed by content, then
  // the same fence character. The regex uses backreference \1 so the closing
  // fence matches the opening one.
  const LIVE_CODE_FENCE =
    /^(```|~~~)jsx\s+live[ \t]*\n([\s\S]*?)^\1[ \t]*$/gm;

  return markdown.replace(
    LIVE_CODE_FENCE,
    (_match, _fence: string, code: string) => {
      // Trim one trailing newline that the fence syntax includes
      const trimmed = code.replace(/\n$/, "");
      return `\n\n<pre data-live-code="true"><code>${escapeHtml(trimmed)}</code></pre>\n\n`;
    }
  );
}

/**
 * Pre-process markdown to convert dollar-delimited math expressions into
 * <span data-type="inlineMath"> HTML markers that the Tiptap math extension
 * can parse when loaded via setContent().
 *
 * Without this step, remark passes dollar-delimited math through as plain
 * text and Tiptap never creates math nodes on page load.
 *
 * Handles:
 * - Block/display math: $$...$$
 * - Inline math: $...$
 * - Malformed legacy: $$...$ (double-start, single-end from past bugs)
 */
function convertDollarMath(markdown: string): string {
  // 1. Block/display math: $$...$$ (may span lines)
  markdown = markdown.replace(
    /\$\$([\s\S]+?)\$\$/g,
    (_match, latex: string) => {
      const attr = escapeHtml(latex.trim());
      return `<span data-type="inlineMath" data-latex="${attr}" data-display="yes" data-evaluate="no">$$${latex}$$</span>`;
    }
  );

  // 2. Inline math: $...$ and malformed $$...$
  // \${1,2} at start handles both single and legacy double-dollar openings;
  // (?!\$) at end prevents matching block math endings that were already handled.
  markdown = markdown.replace(
    /(?<!\$)\${1,2}(?![$\s,.])((?:[^$\\]|\\\$|\\)+?(?<![\\\s(["]))\$(?!\$)/g,
    (_match, latex: string) => {
      const attr = escapeHtml(latex);
      return `<span data-type="inlineMath" data-latex="${attr}" data-display="no" data-evaluate="no">$${latex}$</span>`;
    }
  );

  return markdown;
}

/**
 * Pre-process markdown to URL-encode spaces in file:// link URLs.
 * CommonMark terminates a bare URL at the first whitespace, so
 * [text](file:///path/My File.pdf) is not parsed as a link. This encodes
 * spaces (and other unsafe chars) in the path so the remark pipeline sees
 * a valid URL.
 */
function encodeFileUrls(markdown: string): string {
  return markdown.replace(
    /\]\((file:\/\/[^)]+)\)/g,
    (_match, url: string) => `](${url.replace(/ /g, "%20")})`
  );
}

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
    (match, before: string, src: string) => {
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

function transformMystAdmonitions(markdown: string): string {
  const ADMONITION_REGEX = /^(\`{3,}|:{3,})(\{?)([a-zA-Z0-9_-]+)(\}?)(?:\s+([^\n]+))?\n([\s\S]*?)\n\1[ \t]*$/gm;

  return markdown.replace(
    ADMONITION_REGEX,
    (match, fence: string, hasOpen: string, type: string, hasClose: string, title: string | undefined, content: string) => {
      // If it's a backtick fence, it MUST have both braces to be a MyST directive (avoiding code block collision)
      if (fence.startsWith("`") && (!hasOpen || !hasClose)) {
        return match;
      }

      const knownAdmonitions = [
        "note", "warning", "error", "success", "info", "tip", "important",
        "caution", "danger", "attention", "admonition", "hint", "seealso"
      ];

      const directiveType = type.toLowerCase();
      if (!knownAdmonitions.includes(directiveType)) {
        return match;
      }

      // Map directive name to Cabinet callout type
      const typeMap: Record<string, string> = {
        note: "info",
        info: "info",
        tip: "info",
        important: "info",
        hint: "info",
        seealso: "info",
        warning: "warning",
        caution: "warning",
        attention: "warning",
        error: "error",
        danger: "error",
        success: "success",
        done: "success",
      };

      const calloutType = typeMap[directiveType] || "info";
      const cleanTitle = title ? title.trim() : "";
      const titlePrefix = cleanTitle ? `**${cleanTitle}**\n\n` : "";

      return `\n\n<div data-callout="true" data-callout-type="${calloutType}">\n\n${titlePrefix}${content.trim()}\n\n</div>\n\n`;
    }
  );
}

function transformMystRoles(markdown: string): string {
  const ROLE_REGEX = /\{([a-zA-Z0-9_-]+)\}(`{1,2})([\s\S]*?)\2/g;

  return markdown.replace(
    ROLE_REGEX,
    (match, role: string, _backticks: string, content: string) => {
      const roleName = role.toLowerCase();
      if (roleName === "sub") {
        return `<sub>${content}</sub>`;
      }
      if (roleName === "sup") {
        return `<sup>${content}</sup>`;
      }
      if (roleName === "math") {
        return `$${content}$`;
      }
      return match;
    }
  );
}

function decorateHighlights(html: string): string {
  return html.replace(/<mark\b([^>]*?)>([\s\S]*?)<\/mark>/gi, (match, attrs, content) => {
    const noteMatch = attrs.match(/data-note=["']([^"']+)["']/i);
    const hasNote = !!noteMatch;
    
    const tagsMatch = attrs.match(/data-tags=["']([^"']+)["']/i);
    const tagsVal = tagsMatch ? tagsMatch[1] : null;
    const tagsList = tagsVal
      ? Array.from(
          new Set(
            tagsVal
              .split(/[\s,]+/)
              .map((t: string) => t.trim())
              .map((t: string) => (t.startsWith("#") ? t.slice(1) : t))
              .filter(Boolean)
          )
        )
      : [];
    
    if (!hasNote && tagsList.length === 0) {
      return match;
    }
    
    let suffix = "";
    if (hasNote) {
      suffix += `<span class="inline-annotation-icon" style="display: inline-flex; align-items: center; margin-left: 4px; vertical-align: middle;">` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: currentColor; opacity: 0.85;">` +
        `<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>` +
        `<path d="M18 3a4 4 0 0 1 4 4v1"></path>` +
        `<path d="M16 3v5a1 1 0 0 0 1 1h5"></path>` +
        `</svg></span>`;
    }
    
    for (const tag of tagsList) {
      suffix += `<span class="inline-annotation-tag" style="display: inline-flex; align-items: center; background-color: rgba(139, 94, 60, 0.1); color: rgb(139, 94, 60); font-size: 10px; font-weight: 500; border-radius: 4px; padding: 1px 4px; margin-left: 4px; vertical-align: middle;">${tag}</span>`;
    }
    
    return `<mark${attrs}>${content}</mark>${suffix}`;
  });
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
  const withMystAdmonitions = transformMystAdmonitions(markdown);
  const withMystRoles = transformMystRoles(withMystAdmonitions);
  // Rewrite ```jsx live fenced code blocks into <pre data-live-code> markers
  // before any other transform, so the remark pipeline preserves them as-is.
  const withLiveCode = transformLiveCodeBlocks(withMystRoles);
  // Rewrite registered MDX components (<Callout>, <VideoPlayer/>, …) into
  // <div data-mdx-component> markers before remark sees them — otherwise the
  // Markdown parser mangles the JSX into broken paragraphs.
  const withMdx = transformMdxToHtml(withLiveCode);
  // Encode spaces in file:// link URLs before remark (which terminates
  // bare URLs at whitespace)
  const withFileUrls = encodeFileUrls(withMdx);
  // Convert ![[file.tex]] LaTeX embeds to HTML markers before remark
  const withLatex = convertLatexEmbeds(withFileUrls);
  // Pre-process wiki-links before remark (which would treat [[ as text)
  const preprocessed = convertWikiLinks(withLatex);
  // Convert $...$ and $$...$$ math to <span data-type="inlineMath"> markers
  // so Tiptap creates proper math nodes on setContent.
  const withMath = convertDollarMath(preprocessed);

  const result = await processor.process(withMath);

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

  // Decorate highlight marks with inline annotations and tags
  html = decorateHighlights(html);

  // Strip the trailing newline from code blocks that rehype/unified automatically appends
  html = html.replace(/<pre\b([^>]*)><code\b([^>]*)>([\s\S]*?)\n<\/code><\/pre>/gi, "<pre$1><code$2>$3</code></pre>");

  return html;
}

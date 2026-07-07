import TurndownService from "turndown";
// @ts-expect-error — no types available for this package
import { gfm } from "turndown-plugin-gfm";
import { detectEmbed } from "@/lib/embeds/detect";
import { serializeMdxComponent, type MdxProps } from "@/lib/mdx/jsx";

const turndown = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  fence: "```",
  emDelimiter: "*",
  strongDelimiter: "**",
});

// Add GFM support (tables, strikethrough, task lists)
turndown.use(gfm);

// Drop the DocumentProperties panel — frontmatter is owned by the editor store
// and serialized into the YAML block by page-io, so it must never leak into the
// markdown body.
turndown.addRule("documentProperties", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).getAttribute("data-document-properties") === "true",
  replacement: () => "",
});

// Serialize live code blocks back to ```jsx live fenced blocks.
// Must be registered BEFORE the generic codeBlock rule so it matches first.
turndown.addRule("liveCodeBlock", {
  filter: (node) => {
    return (
      node.nodeName === "PRE" &&
      (node as HTMLElement).getAttribute("data-live-code") === "true"
    );
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const code = el.querySelector("code");
    const text = code?.textContent ?? el.textContent ?? "";
    return `\n\`\`\`jsx live\n${text}\n\`\`\`\n`;
  },
});

// Task items, the Tiptap way. Tiptap (and our markdownToHtml) render a task
// item as `<li data-type="taskItem" data-checked="…"><label><input></label>
// <div><p>text</p></div></li>`. turndown-plugin-gfm's task rule only fires when
// the checkbox `<input>` sits *directly* under the `<li>`, so the `<label>`
// wrapper makes it miss — the checkbox is dropped and `- [ ]` degrades to a
// plain bullet on every save. Match the `<li>` itself and re-emit the GFM
// marker from `data-checked`, keeping the item on one line.
turndown.addRule("taskItem", {
  filter: (node) =>
    node.nodeName === "LI" &&
    (node as HTMLElement).getAttribute("data-type") === "taskItem",
  replacement: (content, node) => {
    const checked = (node as HTMLElement).getAttribute("data-checked") === "true";
    const body = content
      .replace(/^\n+/, "")
      .replace(/\n+$/, "")
      .replace(/\n/g, "\n    "); // indent continuation / nested lines under the item
    return `- [${checked ? "x" : " "}] ${body}${node.nextSibling ? "\n" : ""}`;
  },
});

// Preserve line breaks in code blocks
turndown.addRule("codeBlock", {
  filter: (node) => {
    return (
      node.nodeName === "PRE" &&
      node.firstChild !== null &&
      node.firstChild.nodeName === "CODE" &&
      // Skip live code blocks — handled by the liveCodeBlock rule above.
      (node as HTMLElement).getAttribute("data-live-code") !== "true"
    );
  },
  replacement: (_content, node) => {
    const code = node.firstChild as HTMLElement;
    const lang = code.getAttribute("class")?.replace("language-", "") || "";
    const text = code.textContent || "";
    return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
  },
});

// Convert wiki-links back to [[Page Name]] syntax
turndown.addRule("wikiLink", {
  filter: (node) => {
    return (
      node.nodeName === "A" &&
      node.getAttribute("data-wiki-link") === "true"
    );
  },
  replacement: (content, node) => {
    const pageName =
      (node as HTMLElement).getAttribute("data-page-name") || content;
    return `[[${pageName}]]`;
  },
});

// Completely drop inline annotation tags/icons during HTML-to-markdown serialization
turndown.addRule("ignoreAnnotationTag", {
  filter: (node) =>
    node.nodeName === "SPAN" &&
    (node as HTMLElement).classList.contains("inline-annotation-tag"),
  replacement: () => "",
});

turndown.addRule("ignoreAnnotationIcon", {
  filter: (node) =>
    node.nodeName === "SPAN" &&
    (node as HTMLElement).classList.contains("inline-annotation-icon"),
  replacement: () => "",
});

// Preserve inline styled spans (text color, background color, font weight, etc.)
// so colors and highlights survive markdown roundtrip.
turndown.addRule("styledSpan", {
  filter: (node) =>
    node.nodeName === "SPAN" && !!(node as HTMLElement).getAttribute("style"),
  replacement: (content, node) => {
    const style = (node as HTMLElement).getAttribute("style") ?? "";
    return `<span style="${style}">${content}</span>`;
  },
});

// Lucide icon node — serialize as a clean `<span data-lucide="…" data-color="…">`
// stub. The editor's IconExtension rebuilds the colored SVG on load.
turndown.addRule("lucideIcon", {
  filter: (node) =>
    node.nodeName === "SPAN" &&
    (node as HTMLElement).hasAttribute("data-lucide"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const name = el.getAttribute("data-lucide") ?? "file";
    const color = el.getAttribute("data-color") ?? "gray";
    return `<span data-lucide="${name}" data-color="${color}">&nbsp;</span>`;
  },
});

// Preserve <mark> with any attributes (highlight extension writes data-color + style).
turndown.addRule("mark", {
  filter: "mark" as never,
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const attrs: string[] = [];
    for (const attr of Array.from(el.attributes)) {
      attrs.push(`${attr.name}="${attr.value.replace(/"/g, "&quot;")}"`);
    }
    return `<mark${attrs.length ? " " + attrs.join(" ") : ""}>${content}</mark>`;
  },
});

// Preserve <u>, <sub>, <sup> (underline, subscript, superscript).
for (const tag of ["u", "sub", "sup"] as const) {
  turndown.addRule(tag, {
    filter: tag as never,
    replacement: (content) => `<${tag}>${content}</${tag}>`,
  });
}

// Preserve <video> tags with all attrs (file-uploaded videos).
// If the src points at a known embed provider (YouTube, Vimeo, Loom, …),
// upgrade it to a proper embed block instead of preserving a tag that
// browsers can't render.
turndown.addRule("video", {
  filter: "video" as never,
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const src = el.getAttribute("src") ?? "";
    const detected = src ? detectEmbed(src) : null;
    if (detected && detected.provider !== "video") {
      const aspect = detected.aspectRatio
        ? ` data-aspect-ratio="${detected.aspectRatio}"`
        : "";
      return (
        `\n<div data-embed="true" data-provider="${detected.provider}"` +
        ` data-src="${detected.embedUrl}"` +
        ` data-original-url="${detected.originalUrl}"${aspect}>` +
        `<iframe src="${detected.embedUrl}"` +
        ` data-embed-provider="${detected.provider}"` +
        ` allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"` +
        ` allowfullscreen loading="lazy" frameborder="0"></iframe>` +
        `</div>\n`
      );
    }

    const attrs: string[] = [];
    for (const attr of Array.from(el.attributes)) {
      attrs.push(`${attr.name}="${attr.value.replace(/"/g, "&quot;")}"`);
    }
    return `<video${attrs.length ? " " + attrs.join(" ") : ""}></video>`;
  },
});

// Serialize MDX component markers back to JSX. The editor stores each verified
// component as <div data-mdx-component data-name data-props data-children>;
// turndown turns it back into `<Name …/>` or `<Name …>children</Name>`.
turndown.addRule("mdxComponent", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).hasAttribute("data-mdx-component"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const name = el.getAttribute("data-name") ?? "";
    if (!name) return "";
    let props: MdxProps = {};
    try {
      props = JSON.parse(el.getAttribute("data-props") || "{}");
    } catch {
      props = {};
    }
    const children = el.getAttribute("data-children") ?? "";
    return `\n${serializeMdxComponent(name, props, children)}\n`;
  },
});

// Serialize callout blocks back to MyST admonition directives.
turndown.addRule("callout", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).getAttribute("data-callout") === "true",
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const type = el.getAttribute("data-callout-type") || "info";
    
    // Map callout type back to MyST admonition directive name
    const typeMap: Record<string, string> = {
      info: "note",
      warning: "warning",
      error: "error",
      success: "success",
    };
    const directive = typeMap[type] || "note";
    
    return `\n\n\`\`\`{${directive}}\n${content.trim()}\n\`\`\`\n\n`;
  },
});

// Preserve embed blocks (YouTube/Vimeo/Loom/X/Facebook/Instagram/etc.) as HTML.
turndown.addRule("embedBlock", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).getAttribute("data-embed") === "true",
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const provider = el.getAttribute("data-provider") ?? "iframe";
    const src = el.getAttribute("data-src") ?? "";
    const originalUrl = el.getAttribute("data-original-url") ?? "";
    const aspect = el.getAttribute("data-aspect-ratio") ?? "";

    if (provider === "video") {
      return `\n<video src="${src}" controls></video>\n`;
    }

    const attrs = [
      `data-embed="true"`,
      `data-provider="${provider}"`,
      `data-src="${src}"`,
      originalUrl ? `data-original-url="${originalUrl}"` : "",
      aspect ? `data-aspect-ratio="${aspect}"` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `\n<div ${attrs}><iframe src="${src}" data-embed-provider="${provider}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen loading="lazy" frameborder="0"></iframe></div>\n`;
  },
});

// Preserve Twitter/X embeds as <blockquote class="twitter-tweet">…
turndown.addRule("twitterEmbed", {
  filter: (node) =>
    node.nodeName === "BLOCKQUOTE" &&
    (node as HTMLElement).classList.contains("twitter-tweet"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const a = el.querySelector("a");
    const href = a?.getAttribute("href") ?? "";
    return `\n<blockquote class="twitter-tweet" data-theme="auto"><a href="${href}">${href}</a></blockquote>\n`;
  },
});

// Serialize LaTeX embed blocks back to ![[file.tex]] syntax.
turndown.addRule("latexEmbed", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).getAttribute("data-latex-embed") === "true",
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const path = el.getAttribute("data-path") ?? "";
    return `\n![[${path}]]\n`;
  },
});

// Preserve images that have inline width/align data. Turndown's default image
// rule emits `![]()`, losing size info — so when the <img> has width, align, or
// wraps in a resizable-image div we emit the raw HTML instead.
turndown.addRule("sizedImage", {
  filter: (node) => {
    if (node.nodeName !== "IMG") return false;
    const el = node as HTMLElement;
    const width = el.getAttribute("width") ?? el.style.width;
    const align = el.getAttribute("data-align");
    return !!(width || align);
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const attrs: string[] = [];
    for (const attr of Array.from(el.attributes)) {
      attrs.push(`${attr.name}="${attr.value.replace(/"/g, "&quot;")}"`);
    }
    return `<img ${attrs.join(" ")} />`;
  },
});

// Preserve the resizable-image wrapper so align info survives.
turndown.addRule("resizableImageWrapper", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).classList.contains("resizable-image"),
  replacement: (content) => content,
});

// Math extension renders <span data-type="inlineMath" data-latex="..."> etc.
turndown.addRule("inlineMath", {
  filter: (node) => {
    const el = node as HTMLElement;
    if (el.nodeName !== "SPAN") return false;
    const dataType = el.getAttribute("data-type");
    return dataType === "inline-math" || dataType === "inlineMath";
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const latex = el.getAttribute("data-latex") ?? "";
    const display = el.getAttribute("data-display");
    if (display === "yes") {
      return `\n\n$$${latex}$$\n\n`;
    }
    return `$${latex}$`;
  },
});

// Preserve aligned blocks (paragraphs/headings with inline text-align style).
// Default turndown serializers lose the style attr; we emit raw HTML when a
// block has non-default alignment.
turndown.addRule("alignedBlock", {
  filter: (node) => {
    if (!["P", "H1", "H2", "H3", "H4", "H5", "H6"].includes(node.nodeName)) return false;
    const style = (node as HTMLElement).getAttribute("style") ?? "";
    return /text-align:\s*(center|right|justify)/.test(style);
  },
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const tag = el.nodeName.toLowerCase();
    const style = el.getAttribute("style") ?? "";
    return `\n<${tag} style="${style}">${content}</${tag}>\n`;
  },
});

// Serialize LaTeX embed blocks back to ![[file.tex]] syntax.
turndown.addRule("latexEmbed", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).getAttribute("data-latex-embed") === "true",
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const path = el.getAttribute("data-path") ?? "";
    return `\n![[${path}]]\n`;
  },
});

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function htmlToMarkdown(html: string, pagePath?: string | null, assetBase?: string | null): string {
  let md = turndown.turndown(html);
  const base = assetBase || pagePath;
  if (base) {
    const escapedBase = base.split("/").map(encodeURIComponent).join("/");
    const p1 = escapeRegExp(base);
    const p2 = escapeRegExp(escapedBase);

    // Replace "/api/assets/base/filename" with "./filename"
    // 1. Markdown image syntax: ![alt](/api/assets/path/file.ext)
    const markdownImgRegex = new RegExp(`!\\\[(.*?)\\\]\\(/api/assets/(?:${p1}|${p2})/([^)]+)\\)`, "g");
    md = md.replace(markdownImgRegex, "![$1](./$2)");

    // 2. Markdown link syntax: [text](/api/assets/path/file.ext)
    const markdownLinkRegex = new RegExp(`\\\[(.*?)\\\]\\(/api/assets/(?:${p1}|${p2})/([^)]+)\\)`, "g");
    md = md.replace(markdownLinkRegex, "[$1](./$2)");

    // 3. HTML src attribute: src="/api/assets/path/file.ext"
    const srcRegex = new RegExp(`src="/api/assets/(?:${p1}|${p2})/([^"]+)"`, "g");
    md = md.replace(srcRegex, `src="./$1"`);

    // 4. HTML data-src attribute: data-src="/api/assets/path/file.ext"
    const dataSrcRegex = new RegExp(`data-src="/api/assets/(?:${p1}|${p2})/([^"]+)"`, "g");
    md = md.replace(dataSrcRegex, `data-src="./$1"`);

    // 5. HTML href attribute: href="/api/assets/path/file.ext"
    const hrefRegex = new RegExp(`href="/api/assets/(?:${p1}|${p2})/([^"]+)"`, "g");
    md = md.replace(hrefRegex, `href="./$1"`);
  }
  return md;
}

import TurndownService from "turndown";
// @ts-expect-error — no types available for this package
import { gfm } from "turndown-plugin-gfm";
import { detectEmbed } from "@/lib/embeds/detect";

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

// Preserve line breaks in code blocks
turndown.addRule("codeBlock", {
  filter: (node) => {
    return (
      node.nodeName === "PRE" &&
      node.firstChild !== null &&
      node.firstChild.nodeName === "CODE"
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
    const latex = (node as HTMLElement).getAttribute("data-latex") ?? "";
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

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

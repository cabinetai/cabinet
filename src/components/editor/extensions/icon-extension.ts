import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Inline Lucide icon node. Embedded in docs tables so users can reference the
 * sidebar file-type glyphs without screenshots. Markdown source looks like:
 *
 *   <span data-lucide="file-text" data-color="gray">&nbsp;</span>
 *
 * The extension renders it to HTML with an inline SVG data: URI, so the icon
 * draws correctly in the editor AND in any downstream markdown renderer that
 * passes through raw HTML.
 */

export const ICON_COLOR_NAMES = [
  "gray",
  "green",
  "red",
  "violet",
  "pink",
  "cyan",
  "amber",
  "blue",
  "orange",
] as const;

export type IconColorName = (typeof ICON_COLOR_NAMES)[number];

const ICON_COLORS: Record<IconColorName, string> = {
  gray: "#6b7280",
  green: "#16a34a",
  red: "#dc2626",
  violet: "#8b5cf6",
  pink: "#ec4899",
  cyan: "#06b6d4",
  amber: "#d97706",
  blue: "#2563eb",
  orange: "#ea580c",
};

/** Lucide icon paths, verbatim from lucide-react@0.577. */
const ICON_PATHS: Record<string, string> = {
  "file-text":
    '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  table:
    '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  "file-type":
    '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M11 18h2"/><path d="M12 12v6"/><path d="M9 13v-.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v.5"/>',
  "git-branch":
    '<path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>',
  image:
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  video:
    '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  music:
    '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  "app-window":
    '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/><path d="M6 4v4"/>',
  "link-2":
    '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
  file: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>',
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  "file-spreadsheet":
    '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  presentation:
    '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
};

function base64(str: string): string {
  if (typeof btoa !== "undefined") return btoa(str);
  // Node / SSR fallback
  return Buffer.from(str, "utf8").toString("base64");
}

export function lucideDataUri(name: string, color: string): string {
  const body = ICON_PATHS[name];
  if (!body) return "";
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml;base64,${base64(xml)}`;
}

export const IconExtension = Node.create({
  name: "lucideIcon",
  inline: true,
  group: "inline",
  atom: true,
  selectable: false,
  marks: "",

  addAttributes() {
    return {
      name: {
        default: "file",
        parseHTML: (el) => el.getAttribute("data-lucide"),
        renderHTML: (attrs) => ({ "data-lucide": attrs.name }),
      },
      color: {
        default: "gray",
        parseHTML: (el) => el.getAttribute("data-color") ?? "gray",
        renderHTML: (attrs) => ({ "data-color": attrs.color }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-lucide]",
        priority: 1100,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const name = String(HTMLAttributes["data-lucide"] ?? "file");
    const colorName = (String(HTMLAttributes["data-color"] ?? "gray") as IconColorName);
    const hex = ICON_COLORS[colorName] ?? ICON_COLORS.gray;
    const uri = lucideDataUri(name, hex);
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        style: `display:inline-block;width:18px;height:18px;vertical-align:-4px;background:url('${uri}') center/contain no-repeat`,
      }),
      "\u00a0",
    ];
  },
});

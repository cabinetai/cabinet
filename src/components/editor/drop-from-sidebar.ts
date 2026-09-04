import type { Editor } from "@tiptap/react";
import { parseCsv, csvToMarkdownTable } from "@/lib/csv/parse";
import { markdownToHtml } from "@/lib/markdown/to-html";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { findNodeByPath } from "@/lib/cabinets/tree";
import type { TreeNode } from "@/types";

const CABINET_MIME = "application/x-cabinet-node";

interface SidebarDragPayload {
  path: string;
  type: TreeNode["type"];
  name: string;
  hasRepo?: boolean;
  isLinked?: boolean;
}

function assetUrlFor(path: string): string {
  return `/api/assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function titleFromNode(node: SidebarDragPayload): string {
  const base = node.name.replace(/\.[^.]+$/, "");
  return base || node.name;
}

function linkMarkdown(node: SidebarDragPayload): string {
  const title = titleFromNode(node);
  return `[${title}](${node.path})`;
}

/**
 * Convert a small markdown fragment (link, table, list) into HTML that
 * Tiptap can parse into proper schema nodes. Inserting nodes — instead of
 * raw markdown text — lets the editor's html→markdown round-trip write the
 * original markdown syntax back to the page source on save.
 * No pagePath is passed so internal link hrefs are left untouched.
 */
async function markdownFragmentToHtml(md: string): Promise<string> {
  return markdownToHtml(md);
}

/**
 * Build Tiptap-insertable content for the given sidebar node — either a
 * node JSON object or an HTML string (converted from a markdown fragment).
 * Returns `null` when the type is not handled.
 */
async function buildDropContent(
  node: SidebarDragPayload
): Promise<unknown | null> {
  switch (node.type) {
    // ── Plain links ──────────────────────────────────────────────
    case "file":
    case "directory":
    case "cabinet":
    case "pdf":
    case "code":
    case "latex":
    case "typst":
    case "notebook":
    case "docx":
    case "xlsx":
    case "pptx":
    case "unknown":
    case "website":
    case "app":
      return markdownFragmentToHtml(linkMarkdown(node));

    // ── CSV → markdown table ─────────────────────────────────────
    case "csv": {
      try {
        const res = await fetch(assetUrlFor(node.path));
        const text = await res.text();
        const rows = parseCsv(text);
        const md = csvToMarkdownTable(rows);
        return markdownFragmentToHtml(md || linkMarkdown(node));
      } catch {
        return markdownFragmentToHtml(linkMarkdown(node));
      }
    }

    // ── Mermaid → fenced code block ──────────────────────────────
    case "mermaid": {
      try {
        const res = await fetch(assetUrlFor(node.path));
        const text = await res.text();
        return {
          type: "codeBlock",
          attrs: { language: "mermaid" },
          content: [{ type: "text", text }],
        };
      } catch {
        return markdownFragmentToHtml(linkMarkdown(node));
      }
    }

    // ── Images ───────────────────────────────────────────────────
    case "image":
      return {
        type: "image",
        attrs: { src: assetUrlFor(node.path), alt: titleFromNode(node) },
      };

    // ── Video embed ──────────────────────────────────────────────
    case "video": {
      const src = assetUrlFor(node.path);
      return {
        type: "embed",
        attrs: { provider: "video", src, originalUrl: src },
      };
    }

    // ── Audio embed ──────────────────────────────────────────────
    case "audio": {
      const src = assetUrlFor(node.path);
      return {
        type: "embed",
        attrs: { provider: "audio", src, originalUrl: src },
      };
    }

    // ── Drawio / Excalidraw ──────────────────────────────────────
    case "drawio":
    case "excalidraw": {
      // .drawio.svg / .excalidraw.svg → inline image (bubble menu handles editing)
      if (node.path.endsWith(".svg")) {
        return {
          type: "image",
          attrs: { src: assetUrlFor(node.path), alt: titleFromNode(node) },
        };
      }
      // Plain source (.drawio, .excalidraw) → link
      return markdownFragmentToHtml(linkMarkdown(node));
    }

    // ── 3D model (.glb) → ModelViewer MDX component ──────────────
    case "model3d":
      return {
        type: "mdxComponent",
        attrs: {
          name: "ModelViewer",
          props: {
            src: node.path,
            alt: titleFromNode(node),
            cameraControls: true,
          },
          childrenString: "",
        },
      };

    default:
      return null;
  }
}

/**
 * Build a bullet list of first-level children for a linked directory.
 */
function buildChildList(node: TreeNode): string | null {
  if (!node.children || node.children.length === 0) return null;
  const items = node.children
    .map((child) => {
      const title = child.name.replace(/\.[^.]+$/, "") || child.name;
      return `- [${title}](${child.path})`;
    })
    .join("\n");
  return items;
}

/**
 * Handle a drop from the sidebar onto the Tiptap editor.
 *
 * Returns `true` if the drop was handled (the caller should preventDefault),
 * `false` if the caller should fall through to default handling.
 */
export function handleSidebarDrop(
  editor: Editor,
  event: DragEvent,
  view: { posAtCoords: (coords: { left: number; top: number }) => { pos: number; inside: number } | null }
): boolean {
  const mime = event.dataTransfer?.getData(CABINET_MIME);
  if (!mime) return false;

  const payload: SidebarDragPayload = JSON.parse(mime);

  // Read-only mounts: don't insert
  const treeNodes = useTreeStore.getState().nodes;
  const currentPage = useEditorStore.getState().currentPath;
  if (currentPage) {
    const pageNode = findNodeByPath(treeNodes, currentPage);
    if (pageNode?.knowledgePolicy === "read-only") return false;
  }

  event.preventDefault();

  // Compute insertion position from pointer
  const coords = view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  });
  const insertPos = coords?.pos ?? null;

  // Linked directory without repo → bullet list of children
  if (payload.isLinked && !payload.hasRepo && payload.type === "directory") {
    const fullNode = findNodeByPath(treeNodes, payload.path);
    if (fullNode) {
      const list = buildChildList(fullNode);
      if (list) {
        markdownFragmentToHtml(list).then((html) => {
          if (insertPos !== null) {
            editor.chain().focus().insertContentAt(insertPos, html).run();
          } else {
            editor.chain().focus().insertContent(html).run();
          }
        });
        return true;
      }
    }
  }

  // Build content asynchronously
  buildDropContent(payload).then((content) => {
    if (!content) return;
    if (insertPos !== null) {
      editor.chain().focus().insertContentAt(insertPos, content).run();
    } else {
      editor.chain().focus().insertContent(content).run();
    }
  });

  return true;
}

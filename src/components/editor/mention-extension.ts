import Mention from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { useTreeStore } from "@/stores/tree-store";
import type { TreeNode } from "@/types";

export type MentionItem = {
  type: "agent" | "page";
  id: string;
  label: string;
  sublabel?: string;
};

export type MentionPickerState = {
  open: boolean;
  items: MentionItem[];
  selectedIndex: number;
  clientRect: DOMRect | null;
  command: ((item: { id: string; label: string }) => void) | null;
};

// Module-level singleton — avoids a Zustand store for this narrow use case.
let _state: MentionPickerState = {
  open: false,
  items: [],
  selectedIndex: 0,
  clientRect: null,
  command: null,
};

export function getMentionPickerState(): MentionPickerState {
  return _state;
}

export function setMentionPickerState(next: Partial<MentionPickerState>) {
  _state = { ..._state, ...next };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cabinet:mention-picker-update"));
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function flattenTree(nodes: TreeNode[]): { path: string; name: string }[] {
  const result: { path: string; name: string }[] = [];
  for (const node of nodes) {
    if (node.type === "file" || node.type === "directory") {
      result.push({ path: node.path, name: node.name });
    }
    if (node.children) result.push(...flattenTree(node.children));
  }
  return result;
}

function queryItems(query: string): MentionItem[] {
  const q = query.toLowerCase().trim();

  // Pages from tree store
  const treeNodes = useTreeStore.getState().nodes;
  const allPages = flattenTree(treeNodes);
  const pageItems: MentionItem[] = allPages
    .filter(
      (p) =>
        q === "" ||
        p.name.toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q)
    )
    .slice(0, 8)
    .map((p) => ({
      type: "page" as const,
      id: p.path,
      label: p.name,
      sublabel: p.path,
    }));

  // TODO: wire up agents cache once a shared agents store is introduced.
  // For now agents are fetched per-workspace component; we return [] to avoid
  // a fetch side-effect inside an extension.
  const agentItems: MentionItem[] = [];

  return [...agentItems, ...pageItems];
}

// ──────────────────────────────────────────────
// Extension
// ──────────────────────────────────────────────

const MentionPluginKey = new PluginKey("cabinet-mention");

export const EditorMentionExtension = Mention.configure({
  HTMLAttributes: {
    class: "editor-mention",
  },

  renderText({ node }) {
    return `@${node.attrs.label ?? node.attrs.id}`;
  },

  renderHTML({ node }) {
    return [
      "span",
      { class: "editor-mention", "data-type": "mention", "data-id": node.attrs.id, "data-label": node.attrs.label },
      `@${node.attrs.label ?? node.attrs.id}`,
    ];
  },

  suggestion: {
    pluginKey: MentionPluginKey,
    char: "@",
    allowSpaces: false,

    items({ query }: { query: string }): MentionItem[] {
      return queryItems(query);
    },

    command({
      editor,
      range,
      props,
    }: {
      editor: import("@tiptap/core").Editor;
      range: import("@tiptap/core").Range;
      props: { id: string | null; label?: string | null };
    }) {
      // Insert the mention node, then move cursor past it.
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "mention",
            attrs: { id: props.id, label: props.label },
          },
          { type: "text", text: " " },
        ])
        .run();
    },

    render(): {
      onStart: (props: SuggestionProps<MentionItem, { id: string; label: string }>) => void;
      onUpdate: (props: SuggestionProps<MentionItem, { id: string; label: string }>) => void;
      onExit: (props: SuggestionProps<MentionItem, { id: string; label: string }>) => void;
      onKeyDown: (props: SuggestionKeyDownProps) => boolean;
    } {
      return {
        onStart(props) {
          setMentionPickerState({
            open: true,
            items: props.items,
            selectedIndex: 0,
            clientRect: props.clientRect ? props.clientRect() : null,
            command: props.command,
          });
        },

        onUpdate(props) {
          setMentionPickerState({
            open: true,
            items: props.items,
            selectedIndex: 0,
            clientRect: props.clientRect ? props.clientRect() : null,
            command: props.command,
          });
        },

        onExit() {
          setMentionPickerState({
            open: false,
            items: [],
            selectedIndex: 0,
            clientRect: null,
            command: null,
          });
        },

        onKeyDown({ event }: SuggestionKeyDownProps): boolean {
          if (
            event.key === "ArrowUp" ||
            event.key === "ArrowDown" ||
            event.key === "Enter" ||
            event.key === "Escape"
          ) {
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("cabinet:mention-keydown", { detail: { key: event.key } })
              );
            }
            // Return true so ProseMirror knows we handled it.
            return true;
          }
          return false;
        },
      };
    },
  },
});

"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import { useState, type ReactNode } from "react";
import {
  Type,
  Tags as TagsIcon,
  Calendar,
  Hash,
  ArrowLeftRight,
  Smile,
  ChevronDown,
  ChevronRight,
  X,
  SlidersHorizontal,
  FileType,
  Plus,
  Text,
} from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import type { FrontMatter } from "@/types";

type PropertiesData = Partial<FrontMatter>;

// HTML-escape a string destined for a double-quoted attribute value. setContent
// parses the markup back through parseHTML, where getAttribute auto-unescapes.
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}

/**
 * Build the HTML stub that, when fed to editor.setContent, parses into a
 * DocumentProperties node carrying the page frontmatter. Prepended to the page
 * body so the properties panel sits at the very top of the editor canvas.
 */
export function buildDocumentPropertiesHtml(frontmatter: FrontMatter): string {
  const json = JSON.stringify(frontmatter ?? {});
  return `<div data-document-properties="true" data-frontmatter="${escapeAttr(json)}"></div>`;
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <div className="flex items-center gap-1.5 w-32 shrink-0 pt-1 text-xs text-muted-foreground">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

const inputClass =
  "w-full bg-transparent text-sm text-foreground rounded px-1.5 py-1 hover:bg-muted focus:bg-muted focus:outline-none";

const RESERVED = new Set([
  "type",
  "title",
  "tags",
  "dir",
  "icon",
  "order",
  "created",
  "modified",
  "google",
]);

function CustomPropertyRow({
  propKey,
  value,
  onRename,
  onChangeValue,
  onRemove,
}: {
  propKey: string;
  value: unknown;
  onRename: (next: string) => void;
  onChangeValue: (next: unknown) => void;
  onRemove: () => void;
}) {
  const [keyDraft, setKeyDraft] = useState(propKey);
  const isArray = Array.isArray(value);

  return (
    <div className="flex items-start gap-2 py-0.5 group">
      <div className="flex items-center gap-1.5 w-32 shrink-0 pt-1 text-xs text-muted-foreground">
        <Text className="w-3.5 h-3.5 shrink-0" />
        <input
          className="min-w-0 flex-1 bg-transparent text-xs text-muted-foreground rounded px-1 py-0.5 hover:bg-muted focus:bg-muted focus:text-foreground focus:outline-none"
          value={keyDraft}
          onChange={(e) => setKeyDraft(e.target.value)}
          onBlur={() => {
            const next = keyDraft.trim();
            if (next && next !== propKey) onRename(next);
            else setKeyDraft(propKey);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-1">
        <input
          className={inputClass}
          value={isArray ? (value as unknown[]).join(", ") : String(value ?? "")}
          placeholder="Empty"
          onChange={(e) =>
            onChangeValue(
              isArray
                ? e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : e.target.value
            )
          }
        />
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
          aria-label={`Remove property ${propKey}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function DocumentPropertiesView(props: NodeViewProps) {
  const data = (props.node.attrs.data ?? {}) as PropertiesData;
  const [collapsed, setCollapsed] = useState(true);
  const [tagInput, setTagInput] = useState("");
  const [addingKey, setAddingKey] = useState(false);
  const [newKey, setNewKey] = useState("");

  // Edits flow two ways: updateAttributes keeps the ProseMirror node in sync
  // (so the doc round-trips), updateFrontmatter pushes into the editor store
  // which owns serialization back to the YAML file on disk. A patch value of
  // undefined removes that key from the frontmatter.
  const update = (patch: Record<string, unknown>) => {
    const nextData: Record<string, unknown> = { ...data, ...patch };
    for (const key of Object.keys(patch)) {
      if (patch[key] === undefined) delete nextData[key];
    }
    props.updateAttributes({ data: nextData });
    useEditorStore.getState().updateFrontmatter(patch as Partial<FrontMatter>);
  };

  const tags = Array.isArray(data.tags) ? data.tags : [];
  const customKeys = Object.keys(data).filter((k) => !RESERVED.has(k));

  const addCustomProperty = () => {
    const key = newKey.trim();
    setNewKey("");
    setAddingKey(false);
    if (!key || RESERVED.has(key) || key in data) return;
    update({ [key]: "" });
  };

  const addTag = (raw: string) => {
    const tag = raw.replace(/,$/, "").trim();
    setTagInput("");
    if (!tag || tags.includes(tag)) return;
    update({ tags: [...tags, tag] });
  };
  const removeTag = (tag: string) => update({ tags: tags.filter((t) => t !== tag) });

  return (
    <NodeViewWrapper
      as="div"
      data-document-properties="true"
      className="not-prose mb-6 border border-border rounded-lg bg-muted/30"
    >
      <div contentEditable={false}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Properties</span>
        </button>

        {!collapsed && (
          <div className="px-3 pb-3 space-y-0.5">
            <PropertyRow icon={<Type className="w-3.5 h-3.5" />} label="title">
              <input
                className={inputClass}
                value={data.title ?? ""}
                placeholder="Untitled"
                onChange={(e) => update({ title: e.target.value })}
              />
            </PropertyRow>

            <PropertyRow icon={<FileType className="w-3.5 h-3.5" />} label="type">
              <input
                className={inputClass}
                value={data.type ?? "Untyped"}
                placeholder="Untyped"
                onChange={(e) => update({ type: e.target.value })}
              />
            </PropertyRow>

            <PropertyRow icon={<TagsIcon className="w-3.5 h-3.5" />} label="tags">
              <div className="flex flex-wrap items-center gap-1.5 px-1.5 py-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs rounded px-1.5 py-0.5"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-foreground"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  className="flex-1 min-w-[6rem] bg-transparent text-sm text-foreground focus:outline-none"
                  value={tagInput}
                  placeholder={tags.length ? "" : "Add tag…"}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(tagInput);
                    } else if (e.key === "Backspace" && !tagInput && tags.length) {
                      removeTag(tags[tags.length - 1]);
                    }
                  }}
                  onBlur={() => tagInput && addTag(tagInput)}
                />
              </div>
            </PropertyRow>

            <PropertyRow
              icon={<ArrowLeftRight className="w-3.5 h-3.5" />}
              label="direction"
            >
              <select
                className={inputClass}
                value={data.dir ?? "ltr"}
                onChange={(e) =>
                  update({ dir: e.target.value as "ltr" | "rtl" })
                }
              >
                <option value="ltr">Left to right</option>
                <option value="rtl">Right to left</option>
              </select>
            </PropertyRow>

            {data.icon !== undefined && (
              <PropertyRow icon={<Smile className="w-3.5 h-3.5" />} label="icon">
                <input
                  className={inputClass}
                  value={data.icon ?? ""}
                  onChange={(e) => update({ icon: e.target.value })}
                />
              </PropertyRow>
            )}

            {data.order !== undefined && (
              <PropertyRow icon={<Hash className="w-3.5 h-3.5" />} label="order">
                <input
                  type="number"
                  className={inputClass}
                  value={data.order ?? 0}
                  onChange={(e) => update({ order: Number(e.target.value) })}
                />
              </PropertyRow>
            )}

            <PropertyRow
              icon={<Calendar className="w-3.5 h-3.5" />}
              label="created"
            >
              <span className="block px-1.5 py-1 text-sm text-muted-foreground">
                {formatDate(data.created) || "—"}
              </span>
            </PropertyRow>

            <PropertyRow
              icon={<Calendar className="w-3.5 h-3.5" />}
              label="modified"
            >
              <span className="block px-1.5 py-1 text-sm text-muted-foreground">
                {formatDate(data.modified) || "—"}
              </span>
            </PropertyRow>

            {customKeys.map((key) => (
              <CustomPropertyRow
                key={key}
                propKey={key}
                value={(data as Record<string, unknown>)[key]}
                onRename={(next) =>
                  update({ [key]: undefined, [next]: (data as Record<string, unknown>)[key] })
                }
                onChangeValue={(next) => update({ [key]: next })}
                onRemove={() => update({ [key]: undefined })}
              />
            ))}

            <div className="pt-1">
              {addingKey ? (
                <input
                  autoFocus
                  className="w-full bg-transparent text-sm text-foreground rounded px-1.5 py-1 border border-border focus:outline-none"
                  value={newKey}
                  placeholder="Property name…"
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomProperty();
                    } else if (e.key === "Escape") {
                      setNewKey("");
                      setAddingKey(false);
                    }
                  }}
                  onBlur={addCustomProperty}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingKey(true)}
                  className="flex items-center gap-1.5 px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add property</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const DocumentProperties = Node.create({
  name: "documentProperties",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      data: {
        default: {},
        parseHTML: (el) => {
          try {
            return JSON.parse(
              (el as HTMLElement).getAttribute("data-frontmatter") || "{}"
            );
          } catch {
            return {};
          }
        },
        renderHTML: (attrs) => ({
          "data-frontmatter": JSON.stringify(attrs.data ?? {}),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-document-properties="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-document-properties": "true" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DocumentPropertiesView);
  },
});

"use client";

import { ArrowUpRight, Bell, BellOff, X, Highlighter, Tags, Link2, Loader2, FileText } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTreeStore } from "@/stores/tree-store";
import { cn } from "@/lib/utils";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { TaskConversationPage } from "@/components/tasks/conversation/task-conversation-page";
import { TaskComposeBody } from "@/components/tasks/task-compose-body";
import { SideDrawer } from "@/components/ui/side-drawer";
import { useSideDrawer } from "@/hooks/use-side-drawer";
import { Button } from "@/components/ui/button";
import { setConversationMuted } from "@/components/tasks/board/board-actions";
import { useLocale } from "@/i18n/use-locale";

const HIGHLIGHT_COLOR_MAP: Record<string, string> = {
  gray: "#e5e7eb",
  brown: "#f5e6d8",
  orange: "#fed7aa",
  yellow: "#fef08a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  purple: "#e9d5ff",
  pink: "#fbcfe8",
  red: "#fecaca",
};

/**
 * The single task side-drawer, opened from the task rail, the sidebar, and the
 * kanban board alike (all dispatch `setTaskPanelConversation`). It is a thin
 * frame: the embedded `TaskConversationPage` (compact variant) owns the whole
 * header — title, status, runtime, Stop/Done/Compact/menu — and this panel only
 * injects its own frame controls (Mute · Enlarge · Close) via `chromeActions`.
 * "Enlarge" navigates to the full `/tasks/[id]` page rather than an in-place
 * fullscreen overlay, so there are exactly two surfaces: this drawer and the
 * full page.
 */
function renderNoteContent(noteText: string) {
  const lines = noteText.split("\n");
  const elements: React.ReactNode[] = [];
  
  let currentList: { type: "ol" | "ul"; items: string[] } | null = null;
  
  const flushList = (key: number) => {
    if (!currentList) return null;
    const ListTag = currentList.type;
    const listEl = (
      <ListTag key={`list-${key}`} className={currentList.type === "ol" ? "list-decimal pl-4 space-y-0.5 my-1" : "list-disc pl-4 space-y-0.5 my-1"}>
        {currentList.items.map((item, idx) => (
          <li key={idx} className="text-xs text-slate-800">{item}</li>
        ))}
      </ListTag>
    );
    currentList = null;
    return listEl;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    const ulMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    const olMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    
    if (ulMatch) {
      if (currentList && currentList.type !== "ul") {
        elements.push(flushList(i));
      }
      if (!currentList) {
        currentList = { type: "ul", items: [] };
      }
      currentList.items.push(ulMatch[1]);
    } else if (olMatch) {
      if (currentList && currentList.type !== "ol") {
        elements.push(flushList(i));
      }
      if (!currentList) {
        currentList = { type: "ol", items: [] };
      }
      currentList.items.push(olMatch[2]);
    } else {
      if (currentList) {
        elements.push(flushList(i));
      }
      if (trimmed) {
        elements.push(
          <p key={`p-${i}`} className="text-xs text-slate-800 leading-normal mb-1">
            {line}
          </p>
        );
      } else if (i > 0 && i < lines.length - 1) {
        elements.push(<div key={`spacer-${i}`} className="h-1" />);
      }
    }
  }
  
  if (currentList) {
    elements.push(flushList(lines.length));
  }
  
  return elements;
}

export function TaskDetailPanel() {
  const { t } = useLocale();
  const conversation = useAppStore((s) => s.taskPanelConversation);
  const section = useAppStore((s) => s.section);
  const pushSection = useAppStore((s) => s.pushSection);
  const taskPanelOpen = useAppStore((s) => s.taskPanelOpen);
  const taskPanelMode = useAppStore((s) => s.taskPanelMode);
  const composeContext = useAppStore((s) => s.taskPanelComposeContext);
  const closeTaskPanel = useAppStore((s) => s.closeTaskPanel);
  const setSection = useAppStore((s) => s.setSection);

  const contentStore = useEditorStore((s) => s.content);
  const currentPath = useEditorStore((s) => s.currentPath);
  const loadPage = useEditorStore((s) => s.loadPage);
  const selectPage = useTreeStore((s) => s.selectPage);

  const [activeTab, setActiveTab] = useState<"chat" | "highlights" | "tags" | "links">("chat");
  const [links, setLinks] = useState<{ incoming: { path: string; title: string }[]; outgoing: { path: string; title: string }[] } | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const updateFrontmatter = useEditorStore((s) => s.updateFrontmatter);
  const frontmatter = useEditorStore((s) => s.frontmatter);
  const tags = frontmatter && Array.isArray(frontmatter.tags) ? frontmatter.tags : [];

  const drawer = useSideDrawer({
    isOpen: taskPanelOpen,
    storageKey: "cabinet-task-panel-width",
  });

  useEffect(() => {
    if (!currentPath || activeTab !== "links") return;
    let active = true;
    setLoadingLinks(true);
    fetch(`/api/pages/links?path=${encodeURIComponent(currentPath)}`)
      .then((r) => r.json())
      .then((data) => {
        if (active) {
          setLinks(data);
          setLoadingLinks(false);
        }
      })
      .catch(() => {
        if (active) {
          setLinks({ incoming: [], outgoing: [] });
          setLoadingLinks(false);
        }
      });
    return () => {
      active = false;
    };
  }, [currentPath, activeTab]);

  const highlights = useMemo(() => {
    if (!currentPath || !contentStore) return [];
    const matches = [...contentStore.matchAll(/<mark\b([^>]*?)>([\s\S]*?)<\/mark>/gi)];
    return matches
      .map((m, idx) => {
        const attrs = m[1];
        const text = m[2].replace(/<[^>]*>/g, "").trim();
        
        // Robust color extraction from data-color, color, or style attributes
        let color: string | null = null;
        // Capture everything inside single/double quotes to support values with spaces like rgb(...)
        const colorMatch = attrs.match(/(?:data-color|color)=["']([^"']+)["']/i) || attrs.match(/(?:data-color|color)=([^"'\s>]+)/i);
        if (colorMatch) {
          color = colorMatch[1].trim();
        } else {
          const styleMatch = attrs.match(/style=["']([^"']+)["']/i);
          if (styleMatch) {
            const bgMatch = styleMatch[1].match(/(?:background-color|background)\s*:\s*([^;]+)/i);
            if (bgMatch) {
              color = bgMatch[1].trim();
            }
          }
        }

        // Extract custom note and tags attributes from mark tag
        const noteMatch = attrs.match(/data-note=["']([^"']+)["']/i);
        const note = noteMatch ? noteMatch[1] : null;

        const tagsMatch = attrs.match(/data-tags=["']([^"']+)["']/i);
        const tagsVal = tagsMatch ? tagsMatch[1] : null;
        const tagsList = tagsVal
          ? Array.from(
              new Set(
                tagsVal
                  .split(/[\s,]+/)
                  .map((t) => t.trim())
                  .map((t) => (t.startsWith("#") ? t.slice(1) : t))
                  .filter(Boolean)
              )
            )
          : [];
        
        return { id: idx, text, color, note, tags: tagsList };
      })
      .filter((h) => h.text.length > 0);
  }, [contentStore, currentPath]);

  const inlineTags = useMemo(() => {
    const allTags = new Set<string>();
    for (const h of highlights) {
      if (h.tags) {
        for (const tag of h.tags) {
          allTags.add(tag);
        }
      }
    }
    return Array.from(allTags).sort();
  }, [highlights]);

  // Mute is a per-conversation setting; the store snapshot can be stale, so
  // track it locally and flip optimistically on toggle.
  const [muted, setMuted] = useState(!!conversation?.muted);
  const [muting, setMuting] = useState(false);
  const conversationId = conversation?.id ?? null;
  useEffect(() => {
    setMuted(!!conversation?.muted);
  }, [conversationId, conversation?.muted]);

  if (!drawer.shouldRender) return null;

  const isCompose = taskPanelMode === "compose" || !conversation;

  const openFullPage = () => {
    if (!conversation) return;
    closeTaskPanel();
    // pushSection records `returnTo`, so the full page shows a Back chip into
    // wherever the drawer was opened from (board, tasks list, …).
    pushSection(
      {
        type: "task",
        taskId: conversation.id,
        cabinetPath: conversation.cabinetPath,
      },
      section
    );
  };

  async function toggleMuted() {
    if (!conversation || muting) return;
    const next = !muted;
    setMuting(true);
    setMuted(next); // optimistic
    try {
      await setConversationMuted(conversation.id, next, conversation.cabinetPath);
    } catch (err) {
      console.error("[task-panel] mute toggle failed", err);
      setMuted(!next); // revert
    } finally {
      setMuting(false);
    }
  }

  // Frame controls owned by the drawer (not the conversation page) so they're
  // reachable in every conversation-page state — including the terminal/loading
  // early-returns and on desktop where the drawer has no scrim to dismiss it.
  const frameControls = conversation ? (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
        disabled={muting}
        onClick={toggleMuted}
        title={muted ? t("taskDetail:unmuteTask") : t("taskDetail:muteTask")}
        aria-label={muted ? t("taskDetail:unmuteTask") : t("taskDetail:muteTask")}
      >
        {muted ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
        onClick={openFullPage}
        title={t("tinyExtras:openFullTaskViewer")}
      >
        <ArrowUpRight className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0"
        onClick={closeTaskPanel}
        title={t("taskDetail:close")}
      >
        <X className="size-4" />
      </Button>
    </>
  ) : null;
  const chatContent =
    isCompose || !conversation ? (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-end px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            onClick={closeTaskPanel}
            title={t("taskDetail:close")}
          >
            <X className="size-4" />
          </Button>
        </div>
        <TaskComposeBody context={composeContext} />
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Frame controls (mute · enlarge · close) are handed to the
            conversation page as `chromeActions` so they share the one header
            row with Mark done / ⋯ instead of a separate strip above it. */}
        <TaskConversationPage
          taskId={conversation.id}
          cabinetPath={conversation.cabinetPath}
          variant="compact"
          chromeActions={frameControls}
          returnContext={{
            type: "task",
            taskId: conversation.id,
            cabinetPath: conversation.cabinetPath,
          }}
        />
      </div>
    );

  const getHighlightBgColor = (color: string | null): string => {
    if (!color) return "#fef08a";
    const clean = color.trim().toLowerCase();
    if (clean === "default" || clean === "none") return "#fef08a";
    if (HIGHLIGHT_COLOR_MAP[clean]) return HIGHLIGHT_COLOR_MAP[clean];
    if (
      clean.startsWith("#") ||
      clean.startsWith("rgb") ||
      clean.startsWith("hsl") ||
      clean.startsWith("var")
    ) {
      return color;
    }
    return "#fef08a";
  };

  const highlightsContent = (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 space-y-4">
      {!currentPath ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <Highlighter className="size-8 text-muted-foreground/50 mb-3" />
          <p className="text-xs text-muted-foreground">Select a page to see highlights</p>
        </div>
      ) : highlights.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <Highlighter className="size-8 text-muted-foreground/50 mb-3" />
          <p className="text-xs text-muted-foreground">No highlights on this page</p>
        </div>
      ) : (
        <div className="space-y-3">
          {highlights.map((h) => (
            <div
              key={h.id}
              className="p-3 rounded-md border border-border/40 text-[13px] leading-relaxed break-words font-medium space-y-2 flex flex-col"
              style={{
                backgroundColor: getHighlightBgColor(h.color),
                color: "#0f172a",
              }}
            >
              <div className="flex-1">{h.text}</div>
              
              {/* Highlight Note / Annotation */}
              {h.note && (
                <div className="mt-1 pt-1.5 border-t border-slate-900/10 text-xs text-slate-800 italic leading-normal">
                  {renderNoteContent(h.note)}
                </div>
              )}
              
              {/* Highlight Tags */}
              {h.tags && h.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {h.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block bg-slate-950/10 text-slate-900 text-[10px] rounded px-1 py-0.5 font-semibold"
                    >
                      {tag.startsWith("#") ? tag.slice(1) : tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (!tags.includes(trimmed)) {
      updateFrontmatter({ tags: [...tags, trimmed] });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    updateFrontmatter({ tags: tags.filter((t) => t !== tag) });
  };

  const tagsContent = (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 space-y-4">
      {!currentPath ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <Tags className="size-8 text-muted-foreground/50 mb-3" />
          <p className="text-xs text-muted-foreground">Select a page to see tags</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Page Tags ({tags.length})
            </h3>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 py-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs rounded px-2 py-1 font-medium"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-foreground cursor-pointer text-primary/70"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/75 py-1">No tags on this page.</p>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-border/40">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Highlight Tags ({inlineTags.length})
            </h3>
            {inlineTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 py-1">
                {inlineTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs rounded px-2 py-1 font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/75 py-1">No highlight tags on this page.</p>
            )}
          </div>

          <div className="pt-2 space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Add New Tag
            </h4>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                value={tagInput}
                placeholder="Tag name…"
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
              />
              <Button
                size="sm"
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
                className="h-8 text-xs cursor-pointer"
              >
                Add
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const cabinetPath =
    ("cabinetPath" in section && section.cabinetPath) || ROOT_CABINET_PATH;

  const handleLinkClick = (path: string) => {
    selectPage(path);
    void loadPage(path);
    setSection({ type: "page", cabinetPath });
  };

  const linksContent = (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 space-y-6">
      {!currentPath ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <Link2 className="size-8 text-muted-foreground/50 mb-3" />
          <p className="text-xs text-muted-foreground">Select a page to see links</p>
        </div>
      ) : loadingLinks ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground mb-3" />
          <p className="text-xs text-muted-foreground">Loading links…</p>
        </div>
      ) : (
        <>
          {/* Incoming Links (Backlinks) */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Incoming Links ({links?.incoming.length ?? 0})
            </h3>
            {links?.incoming && links.incoming.length > 0 ? (
              <div className="space-y-1.5">
                {links.incoming.map((link) => (
                  <button
                    key={link.path}
                    onClick={() => handleLinkClick(link.path)}
                    className="flex w-full items-center gap-2 p-2 rounded-md hover:bg-accent text-left text-[13px] font-medium text-foreground transition-colors cursor-pointer group"
                  >
                    <FileText className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                    <span className="truncate flex-1">{link.title}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/75 px-1 py-1">No incoming links to this page.</p>
            )}
          </div>

          {/* Outgoing Links */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Outgoing Links ({links?.outgoing.length ?? 0})
            </h3>
            {links?.outgoing && links.outgoing.length > 0 ? (
              <div className="space-y-1.5">
                {links.outgoing.map((link) => (
                  <button
                    key={link.path}
                    onClick={() => handleLinkClick(link.path)}
                    className="flex w-full items-center gap-2 p-2 rounded-md hover:bg-accent text-left text-[13px] font-medium text-foreground transition-colors cursor-pointer group"
                  >
                    <FileText className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                    <span className="truncate flex-1">{link.title}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/75 px-1 py-1">No outgoing links from this page.</p>
            )}
          </div>
        </>
      )}
    </div>
  );

  const tabs = [
    { id: "chat", label: "Chat" },
    { id: "highlights", label: "Highlights & Notes" },
    { id: "tags", label: "Tags" },
    { id: "links", label: "Links" },
  ] as const;

  const content = (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {/* Top Tab Strip & Panel Controls */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/70 bg-background px-3 py-1.5">
        <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          {activeTab === "chat" && conversation ? (
            frameControls
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              onClick={closeTaskPanel}
              title={t("taskDetail:close")}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Pane Content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === "chat" && chatContent}
        {activeTab === "highlights" && highlightsContent}
        {activeTab === "tags" && tagsContent}
        {activeTab === "links" && linksContent}
      </div>
    </div>
  );

  return (
    <SideDrawer drawer={drawer} onScrimClick={closeTaskPanel}>
      {content}
    </SideDrawer>
  );
}

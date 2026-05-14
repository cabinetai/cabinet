"use client";

import { useEffect, useState } from "react";
import { FileText, Plus, Repeat, Zap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import {
  StartWorkDialog,
  type StartWorkMode,
} from "@/components/composer/start-work-dialog";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import type { CabinetAgentSummary } from "@/types/cabinets";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/use-locale";

/**
 * Shared "+ ▾" create button used in nav bars outside the Tasks board (KB
 * pages via ViewerToolbar, Agents workspace, etc.). Audit #014: the previous
 * filled brand-orange "+ New Task" pulled the eye away from the actual
 * primary action on whatever surface the user was on. Now: neutral icon-only
 * trigger with a context-aware popover. Filled brand color is reserved for
 * the surface's main CTA (e.g., the AI input's Send button).
 *
 * The dialog is mounted locally so opening it doesn't yank the user out of
 * their current surface — the previous implementation routed to
 * section=tasks first, which left users stranded on the tasks board if they
 * dismissed the composer (audit #130).
 */
export function NewTaskButton() {
  const { t } = useLocale();
  const section = useAppStore((s) => s.section);
  const setSection = useAppStore((s) => s.setSection);
  const setTaskPanelConversation = useAppStore(
    (s) => s.setTaskPanelConversation
  );
  const cabinetVisibilityModes = useAppStore((s) => s.cabinetVisibilityModes);

  const cabinetPath =
    ("cabinetPath" in section && section.cabinetPath) || ROOT_CABINET_PATH;
  const visibilityMode = cabinetVisibilityModes[cabinetPath] || "own";

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<StartWorkMode>("now");
  const [agents, setAgents] = useState<CabinetAgentSummary[]>([]);

  const createPage = useTreeStore((s) => s.createPage);
  const selectPage = useTreeStore((s) => s.selectPage);
  const selectedPath = useTreeStore((s) => s.selectedPath);
  const loadPage = useEditorStore((s) => s.loadPage);

  const [pageDialogOpen, setPageDialogOpen] = useState(false);
  const [pageTitle, setPageTitle] = useState("");
  const [creatingPage, setCreatingPage] = useState(false);

  // Context-aware: when on a page, the parent folder is the page's directory.
  // selectedPath is the page path like "data/foo/bar"; the parent is the
  // path with the last segment dropped.
  const pageParentPath = (() => {
    if (section.type !== "page") return null;
    if (!selectedPath) return null;
    const lastSlash = selectedPath.lastIndexOf("/");
    return lastSlash > 0 ? selectedPath.slice(0, lastSlash) : "";
  })();
  const pageParentLabel = (() => {
    if (pageParentPath == null) return null;
    if (!pageParentPath) return "Data";
    const last = pageParentPath.split("/").pop() || pageParentPath;
    return last;
  })();

  // Fetch agents on first open (and refetch if the cabinet changes between
  // opens). The overview client dedupes inflight requests and caches for 3s,
  // so this is cheap when other surfaces have already loaded the cabinet.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCabinetOverviewClient(cabinetPath, visibilityMode);
        if (!cancelled) setAgents(data?.agents || []);
      } catch {
        if (!cancelled) setAgents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, cabinetPath, visibilityMode]);

  const launch = (initialMode: StartWorkMode) => {
    setMode(initialMode);
    setOpen(true);
  };

  const submitPage = async () => {
    const title = pageTitle.trim();
    if (!title || pageParentPath == null) return;
    setCreatingPage(true);
    try {
      await createPage(pageParentPath, title);
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const nextPath = pageParentPath ? `${pageParentPath}/${slug}` : slug;
      selectPage(nextPath);
      await loadPage(nextPath);
      setSection({ type: "page", cabinetPath });
      setPageTitle("");
      setPageDialogOpen(false);
    } catch (error) {
      console.error("Failed to create page:", error);
    } finally {
      setCreatingPage(false);
    }
  };

  // Order of menu items is context-aware. On a page surface, "New page in
  // <folder>" sits first because it's the action the user is most likely to
  // want next. Everywhere else, "New task" leads.
  const showPageItem = pageParentPath != null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-card/60 px-2 text-foreground/80 transition-colors hover:bg-accent hover:text-foreground hover:border-border data-[popup-open]:bg-accent data-[popup-open]:text-foreground"
          title={t("newTaskButton:createNew")}
          aria-label={t("newTaskButton:createNew")}
        >
          <Plus className="size-3.5" />
          <span className="text-[12px] font-medium">New</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[240px]">
          {showPageItem && (
            <DropdownMenuItem
              onClick={() => {
                setPageTitle("");
                setPageDialogOpen(true);
              }}
              className="flex items-start gap-2 py-2"
            >
              <FileText className="mt-0.5 size-3.5 text-foreground/70" />
              <div className="flex flex-col">
                <span className="text-[13px] font-medium">
                  New page in {pageParentLabel}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Sibling of the current page
                </span>
              </div>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => launch("now")}
            className="flex items-start gap-2 py-2"
          >
            <Zap className="mt-0.5 size-3.5 text-foreground/70" />
            <div className="flex flex-col">
              <span className="text-[13px] font-medium">{t("newTaskButton:newTask")}</span>
              <span className="text-[11px] text-muted-foreground">
                Run once, right now
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => launch("recurring")}
            className="flex items-start gap-2 py-2"
          >
            <Repeat className="mt-0.5 size-3.5 text-indigo-500" />
            <div className="flex flex-col">
              <span className="text-[13px] font-medium">{t("newTaskButton:newRoutine")}</span>
              <span className="text-[11px] text-muted-foreground">
                Run this prompt on a schedule
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pageDialogOpen} onOpenChange={setPageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              New page in &ldquo;{pageParentLabel}&rdquo;
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitPage();
            }}
            className="flex gap-2"
          >
            <Input
              placeholder={t("composerExtras:pageTitlePlaceholder")}
              value={pageTitle}
              onChange={(e) => setPageTitle(e.target.value)}
              autoFocus
              disabled={creatingPage}
            />
            <Button type="submit" disabled={!pageTitle.trim() || creatingPage}>
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <StartWorkDialog
        open={open}
        onOpenChange={setOpen}
        cabinetPath={cabinetPath}
        agents={agents}
        initialMode={mode}
        onStarted={async (conversationId, conversationCabinetPath) => {
          // Per audit #131: open the new task in the global side panel
          // instead of routing the user to the tasks board. The panel slides
          // in on the right of whatever surface they launched from.
          try {
            const params = new URLSearchParams();
            if (conversationCabinetPath) {
              params.set("cabinetPath", conversationCabinetPath);
            }
            const res = await fetch(
              `/api/agents/conversations/${encodeURIComponent(conversationId)}${
                params.toString() ? `?${params.toString()}` : ""
              }`
            );
            if (!res.ok) return;
            const data = await res.json();
            if (data?.meta) {
              setTaskPanelConversation(data.meta);
            }
          } catch {
            /* non-fatal — the task is created, we just couldn't open the panel */
          }
        }}
      />
    </>
  );
}

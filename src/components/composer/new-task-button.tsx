"use client";

import { useEffect, useState } from "react";
import { ChevronDown, FileText, Plus, Repeat, Zap } from "lucide-react";
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
 * pages via ViewerToolbar, Agents workspace, etc.).
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
    if (section.type !== "page") return "";
    if (!selectedPath) return "";
    const lastSlash = selectedPath.lastIndexOf("/");
    return lastSlash > 0 ? selectedPath.slice(0, lastSlash) : "";
  })();
  const pageParentLabel = (() => {
    if (!pageParentPath) return "Data";
    const last = pageParentPath.split("/").pop() || pageParentPath;
    return last;
  })();

  // Fetch agents on first open
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
    if (!title) return;
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

  return (
    <>
      <DropdownMenu>
        {/* Split button: the primary half (+ icon) launches New Task; the
            chevron half opens the create menu (New page / New task / New routine). */}
        <div className="inline-flex h-6 items-stretch overflow-hidden rounded-md">
          <button
            type="button"
            onClick={() => launch("now")}
            title={t("newTaskButton:newTask", "New task")}
            aria-label={t("newTaskButton:newTask", "New task")}
            className="inline-flex items-center justify-center bg-primary px-1.5 text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="size-3" />
          </button>
          <div className="w-px bg-primary-foreground/20" aria-hidden />
          <DropdownMenuTrigger
            className="inline-flex items-center justify-center bg-[#D3BEAA] px-1.5 text-white transition-colors hover:bg-[#c4ad98] data-[state=open]:bg-[#c4ad98]"
            title={t("newTaskButton:createNew", "Create new")}
            aria-label={t("newTaskButton:createNew", "Create new")}
          >
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
        </div>
        <DropdownMenuContent align="end" className="min-w-[240px]">
          <DropdownMenuItem
            onClick={() => {
              setPageTitle("");
              setPageDialogOpen(true);
            }}
            className="flex items-start gap-2 py-2 cursor-pointer"
          >
            <FileText className="mt-0.5 size-3.5 text-foreground/70" />
            <div className="flex flex-col">
              <span className="text-[13px] font-medium">New page</span>
              <span className="text-[11px] text-muted-foreground">
                Create a new page
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => launch("now")}
            className="flex items-start gap-2 py-2 cursor-pointer"
          >
            <Zap className="mt-0.5 size-3.5 text-foreground/70" />
            <div className="flex flex-col">
              <span className="text-[13px] font-medium">New task</span>
              <span className="text-[11px] text-muted-foreground">
                Ask an agent to act now
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => launch("recurring")}
            className="flex items-start gap-2 py-2 cursor-pointer"
          >
            <Repeat className="mt-0.5 size-3.5 text-foreground/70" />
            <div className="flex flex-col">
              <span className="text-[13px] font-medium">New routine</span>
              <span className="text-[11px] text-muted-foreground">
                Ask an agent to act later
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

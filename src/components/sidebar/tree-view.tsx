"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { useAppStore } from "@/stores/app-store";
import { useRoomsStore } from "@/stores/rooms-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TreeNode } from "./tree-node";
import { SidebarSearch } from "./sidebar-search";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LinkRepoDialog } from "./link-repo-dialog";
import { ConnectDriveDialog } from "./connect-drive-dialog";
import { ConnectKnowledgeDialog } from "./connect-knowledge-dialog";
import { ConnectGithubDialog } from "./connect-github-dialog";
import { NotionConnectDialog } from "./notion-connect-dialog";
import { AppleNotesConnectDialog } from "./apple-notes-connect-dialog";
import type { KnowledgeProviderId } from "@/lib/knowledge-sources/store";
import { NewFileDialog } from "./new-file-dialog";
import { MoveToDialog } from "./move-to-dialog";
import { RecentTasks } from "./recent-tasks";
import type { TreeNode as TreeNodeType } from "@/types";
import {
  CornerLeftUp,
  Plus,
  BookOpen,
  Users,
  SquareKanban,
  Pencil,
  FilePlus,
  FilePlus2,
  UserPlus,
  ListPlus,
  FolderOpen,
  GitBranch,
  ClipboardCopy,
  Copy,
  Trash2,
  TriangleAlert,
  RefreshCw,
  Settings,
} from "lucide-react";
import { GoogleDriveTreeSection } from "./google-drive-tree";
import { cn } from "@/lib/utils";
import { AgentAvatar, getAgentDisplayName } from "@/components/agents/agent-avatar";
import { EditAgentIdentityDialog } from "@/components/agents/edit-agent-identity-dialog";
import {
  findNodeByPath,
  findParentCabinetNode,
  findRootCabinetNode,
} from "@/lib/cabinets/tree";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import { getDataDir } from "@/lib/data-dir-cache";
import { DepthDropdown } from "@/components/cabinets/depth-dropdown";
import { isMacPlatform, formatShortcut } from "@/lib/keys";
import { useLocale } from "@/i18n/use-locale";

interface AgentSummary {
  scopedId?: string;
  name: string;
  slug: string;
  emoji: string;
  active: boolean;
  runningCount?: number;
  jobCount?: number;
  taskCount?: number;
  heartbeat?: string;
  cabinetPath?: string;
  cabinetName?: string;
  inherited?: boolean;
  displayName?: string;
  iconKey?: string;
  color?: string;
  avatar?: string;
  avatarExt?: string;
  role?: string;
}

/* ── item style matching TreeNode exactly ──────────────────── */

const itemClass = (active: boolean) =>
  cn(
    "flex items-center gap-2 w-full text-left py-0.5 px-2 text-[12px] text-foreground/75 rounded-md transition-colors cursor-pointer",
    "hover:bg-foreground/[0.03] hover:text-foreground",
    active && "bg-accent text-accent-foreground font-medium"
  );

export function TreeView() {
  const { t } = useLocale();
  const {
    nodes,
    loading,
    pendingMove,
    setPendingMove,
    executeMovePage,
    setSortAlphabetical,
  } = useTreeStore();
  const selectPage = useTreeStore((s) => s.selectPage);
  const createPage = useTreeStore((s) => s.createPage);
  const deletePage = useTreeStore((s) => s.deletePage);
  const loadPage = useEditorStore((s) => s.loadPage);
  const section = useAppStore((s) => s.section);
  const setSection = useAppStore((s) => s.setSection);
  const cabinetVisibilityModes = useAppStore((s) => s.cabinetVisibilityModes);
  const setCabinetVisibilityMode = useAppStore((s) => s.setCabinetVisibilityMode);
  const activeDrawer = useAppStore((s) => s.sidebarDrawer);
  const setActiveDrawer = useAppStore((s) => s.setSidebarDrawer);
  const isMac = useMemo(isMacPlatform, []);

  const [cabinetExpanded, setCabinetExpanded] = useState(true);

  // Cabinet-drawer UI: the sidebar exposes three "drawers" — Agents, Tasks, and
  // Data — as a horizontal tab row. Only one is open at a time. The previous
  // vertical-accordion `agentsExpanded` / `tasksExpanded` / `kbExpanded` flags
  // are now derived from `activeDrawer` for minimal downstream churn. The
  // active drawer lives in the app-store so the sidebar footer (which renders
  // tab-specific quick actions) can stay in sync.
  type DrawerId = "agents" | "tasks" | "data";

  // When the route changes under us (hash nav, shortcut, etc.), auto-open the
  // matching drawer so the sidebar and main are always in sync.
  useEffect(() => {
    if (section.type === "agent" || section.type === "agents") {
      setActiveDrawer("agents");
    } else if (section.type === "task" || section.type === "tasks") {
      setActiveDrawer("tasks");
    }
    // Other section types keep the user's last manual choice.
  }, [section.type, setActiveDrawer]);

  const agentsExpanded = activeDrawer === "agents";
  const tasksExpanded = activeDrawer === "tasks";
  const kbExpanded = activeDrawer === "data";
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [cabinetAgentScopeName, setCabinetAgentScopeName] = useState<string | null>(() => {
    // Audit #027: seed from localStorage on first paint so we don't flash
    // the bare "Cabinet" placeholder before the cabinet-overview API
    // responds. The active cabinet path isn't known here yet (depends on
    // section state), so we read root's name as the initial fallback.
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(`cabinet.name.${ROOT_CABINET_PATH}`);
    } catch {
      return null;
    }
  });
  const [kbSubPageOpen, setKbSubPageOpen] = useState(false);
  const [kbSubPageTitle, setKbSubPageTitle] = useState("");
  const [cabinetDeleteOpen, setCabinetDeleteOpen] = useState(false);
  const [kbCreating, setKbCreating] = useState(false);
  const [linkRepoOpen, setLinkRepoOpen] = useState(false);
  const [connectDriveOpen, setConnectDriveOpen] = useState(false);
  const [connectKnowledgeOpen, setConnectKnowledgeOpen] = useState(false);
  const [githubConnectOpen, setGithubConnectOpen] = useState(false);
  const [notionConnectOpen, setNotionConnectOpen] = useState(false);
  const [appleNotesConnectOpen, setAppleNotesConnectOpen] = useState(false);
  const [driveProvider, setDriveProvider] = useState<KnowledgeProviderId>("google-drive");
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [moveToOpen, setMoveToOpen] = useState(false);
  const [moveToSource, setMoveToSource] = useState<TreeNodeType | null>(null);
  const [editingAgent, setEditingAgent] = useState<{ slug: string; cabinetPath?: string } | null>(null);

  const requestMoveTo = useCallback((node: TreeNodeType) => {
    setMoveToSource(node);
    setMoveToOpen(true);
  }, []);

  const rootCabinet = useMemo(() => findRootCabinetNode(nodes), [nodes]);
  const routeCabinetPath = section.cabinetPath;
  const activeCabinet = useMemo(() => {
    if (!routeCabinetPath) return null;
    // Only an actual cabinet scopes the tree to its contents. A plain
    // directory route (e.g. a folder the user opened a page inside of) must
    // not scope — otherwise that folder is hidden and only its children show.
    const node = findNodeByPath(nodes, routeCabinetPath);
    return node?.type === "cabinet" ? node : null;
  }, [nodes, routeCabinetPath]);
  const parentCabinet = useMemo(() => {
    if (!activeCabinet) return null;
    return findParentCabinetNode(nodes, activeCabinet.path);
  }, [activeCabinet, nodes]);
  const effectiveCabinetPath = activeCabinet?.path || ROOT_CABINET_PATH;
  const cabinetVisibilityMode =
    cabinetVisibilityModes[effectiveCabinetPath] || "own";

  // Rooms are the top-level cabinets. When you're in the root/home room, hide
  // the *other* rooms from its tree so they don't appear nested underneath it
  // (you switch into them via the room switcher). Sub-rooms already scope to
  // their own subtree via `activeCabinet.children`.
  const rooms = useRoomsStore((s) => s.rooms);
  const defaultRoom = useRoomsStore((s) => s.defaultRoom);
  const loadRooms = useRoomsStore((s) => s.load);
  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);
  const subRoomPaths = useMemo(
    () => new Set(rooms.filter((r) => !r.isRoot).map((r) => r.path)),
    [rooms]
  );
  const atRoot = !activeCabinet || activeCabinet.path === ROOT_CABINET_PATH;
  const visibleTreeNodes = useMemo(() => {
    const base = activeCabinet?.children || rootCabinet?.children || nodes;
    if (atRoot && subRoomPaths.size > 0) {
      return base.filter((node) => !subRoomPaths.has(node.path));
    }
    return base;
  }, [activeCabinet, rootCabinet, nodes, atRoot, subRoomPaths]);
  // Name the real destination the sub-page lands in (the active room/cabinet),
  // not the literal drawer word. Mirrors the drawer header at #487 so the
  // dialog title and the header always agree.
  const kbSectionLabel =
    cabinetAgentScopeName ||
    activeCabinet?.frontmatter?.title ||
    activeCabinet?.name ||
    "Data";

  /* ── agent polling ─────────────────────────────────────────── */

  const loadAgents = useCallback(async () => {
    try {
      const data = await fetchCabinetOverviewClient(
        activeCabinet?.path || ROOT_CABINET_PATH,
        cabinetVisibilityMode,
        { force: true }
      );
      if (!data) {
        setAgents([]);
        return;
      }
      // Audit #027: cache the resolved name so the next cold paint can
      // skip the "Cabinet" flicker before the API responds.
      const resolved = data.cabinet.name || "Cabinet";
      try {
        if (resolved && resolved !== "Cabinet") {
          localStorage.setItem(`cabinet.name.${activeCabinet?.path || ROOT_CABINET_PATH}`, resolved);
        }
      } catch { /* ignore storage failures */ }
      setCabinetAgentScopeName(resolved);
      setAgents(
        (data.agents || []).map((agent) => ({
          scopedId: agent.scopedId,
          name: agent.name,
          slug: agent.slug,
          emoji: agent.emoji,
          active: agent.active,
          runningCount: agent.runningCount || 0,
          jobCount: agent.jobCount || 0,
          taskCount: agent.taskCount || 0,
          heartbeat: agent.heartbeat || "",
          cabinetPath: agent.cabinetPath,
          cabinetName: agent.cabinetName,
          inherited: agent.inherited,
          displayName: agent.displayName,
          iconKey: agent.iconKey,
          color: agent.color,
          avatar: agent.avatar,
          avatarExt: agent.avatarExt,
          role: agent.role,
        }))
      );
    } catch {
      if (activeCabinet) {
        setCabinetAgentScopeName(
          activeCabinet.frontmatter?.title || activeCabinet.name
        );
        setAgents([]);
        return;
      }

      setCabinetAgentScopeName(null);
    }
  }, [activeCabinet, cabinetVisibilityMode]);

  // Load once on mount and whenever the window regains focus, so the cabinet
  // scope name + agent list stay fresh regardless of which drawer is open.
  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadAgents();
    }, 0);
    window.addEventListener("focus", loadAgents);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("focus", loadAgents);
    };
  }, [loadAgents]);

  // Only *poll* while the TEAM (agents) drawer is actually visible. Each tick
  // force-refetches the overview, which walks the server-side cabinet tree —
  // pointless (and a constant background CPU/IO drain) for a drawer nobody is
  // looking at. Poll gently (20s) even when it is open; also pause when the tab
  // is hidden.
  useEffect(() => {
    if (activeDrawer !== "agents") return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAgents();
    }, 20000);
    return () => window.clearInterval(interval);
  }, [loadAgents, activeDrawer]);

  // Cmd+Shift+M to open Move To… for the currently selected node
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        const { selectedPath, nodes } = useTreeStore.getState();
        if (!selectedPath) return;
        const node = findNodeByPath(nodes, selectedPath);
        if (!node) return;
        e.preventDefault();
        requestMoveTo(node);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestMoveTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  // depth-based padding matching TreeNode: depth * 16 + 8
  const pad = (depth: number) => ({ paddingLeft: `${depth * 16 + 8}px` });
  const cabinetPath = activeCabinet?.path || rootCabinet?.path || ROOT_CABINET_PATH;
  // The folder that empty-space create actions (Add Sub Page / Create New File
  // / Connect Knowledge) target. In rooms-v3 you are always inside a room, so
  // this must resolve to the active *room*, never the neutral home container —
  // otherwise new files/symlinks land as siblings of the room and vanish from
  // its tree. Mirror the sidebar footer's robust fallback chain
  // (activeCabinet → route cabinetPath → defaultRoom) so a not-yet-resolved
  // `activeCabinet` can't silently drop the target back to "" (the container).
  const dataRootPath =
    activeCabinet && activeCabinet.path !== ROOT_CABINET_PATH
      ? activeCabinet.path
      : routeCabinetPath && routeCabinetPath !== ROOT_CABINET_PATH
        ? routeCabinetPath
        : defaultRoom && defaultRoom !== ROOT_CABINET_PATH
          ? defaultRoom
          : "";
  const selectedAgentScopedId =
    section.agentScopedId ||
    (section.type === "agent" && section.cabinetPath && section.slug
      ? `${section.cabinetPath}::agent::${section.slug}`
      : null);

  const openCabinetOverview = (targetCabinetPath = cabinetPath) => {
    selectPage(targetCabinetPath);
    void loadPage(targetCabinetPath);
    setSection({
      type: "cabinet",
      cabinetPath: targetCabinetPath,
    });
  };

  const openCabinetDataPage = (targetCabinetPath = cabinetPath, restoreLastPage = false) => {
    if (restoreLastPage) {
      // When switching back to the Data drawer in-session, preserve the last
      // open page rather than jumping to the cabinet root. selectedPath is
      // never cleared on section switch, so it still holds the last page.
      const currentSelected = useTreeStore.getState().selectedPath;
      if (currentSelected && currentSelected !== targetCabinetPath) {
        setSection({ type: "page", cabinetPath: targetCabinetPath });
        void loadPage(currentSelected);
        return;
      }
    }
    selectPage(targetCabinetPath);
    void loadPage(targetCabinetPath);
    setSection({
      type: "page",
      cabinetPath: targetCabinetPath,
    });
  };

  const renderAgentRow = (
    key: string,
    agent: {
      slug: string;
      cabinetPath?: string;
      displayName?: string;
      name?: string;
      iconKey?: string;
      color?: string;
      avatar?: string;
      avatarExt?: string;
    },
    opts: {
      selected: boolean;
      onClick: () => void;
      activeDot?: boolean;
      editable?: { slug: string; cabinetPath?: string };
    }
  ) => {
    const row = (
      <button
        onClick={opts.onClick}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-foreground/[0.03]",
          opts.selected && "bg-accent text-accent-foreground"
        )}
        style={pad(1)}
      >
        <AgentAvatar
          agent={{
            slug: agent.slug,
            cabinetPath: agent.cabinetPath,
            displayName: agent.displayName,
            iconKey: agent.iconKey,
            color: agent.color,
            avatar: agent.avatar,
            avatarExt: agent.avatarExt,
          }}
          size="sm"
          shape="square"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/75">
          {getAgentDisplayName(agent)}
        </span>
        {typeof opts.activeDot === "boolean" && (
          <span
            className={cn(
              "ms-auto h-1.5 w-1.5 shrink-0 rounded-full",
              opts.activeDot ? "bg-green-500" : "bg-muted-foreground/30"
            )}
          />
        )}
      </button>
    );

    if (!opts.editable) return <div key={key}>{row}</div>;

    const editable = opts.editable;
    return (
      <ContextMenu key={key}>
        <ContextMenuTrigger>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setEditingAgent(editable)}>
            <Pencil className="me-2 h-3.5 w-3.5" />
            Edit agent
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  // A top-level room's only "parent" is the neutral home container (".").
  // That isn't a navigable destination — you're always inside a room and
  // switch between rooms via the home switcher — so never go up into it.
  const parentIsHome =
    !parentCabinet || parentCabinet.path === ROOT_CABINET_PATH;

  const openParentCabinet = () => {
    if (parentIsHome || !parentCabinet) return;
    openCabinetOverview(parentCabinet.path);
  };

  return (
    <>
    <ScrollArea className="flex-1 min-h-0 [&_[data-slot=scroll-area-scrollbar]]:w-1.5 [&_[data-slot=scroll-area-scrollbar]]:py-0 [&_[data-slot=scroll-area-scrollbar]]:pe-0 [&_[data-slot=scroll-area-scrollbar]]:ps-0.5 [&_[data-slot=scroll-area-scrollbar]]:border-s-0 [&_[data-slot=scroll-area-scrollbar]]:opacity-0 [&_[data-slot=scroll-area-scrollbar]]:transition-opacity [&_[data-slot=scroll-area-scrollbar]]:duration-300 [&_[data-slot=scroll-area-scrollbar][data-hovering]]:opacity-100 [&_[data-slot=scroll-area-scrollbar][data-scrolling]]:opacity-100">
      <div className="flex min-h-full flex-col py-1">
        {/* ── Back to parent cabinet (never up into the home container) ── */}
        {activeCabinet && parentCabinet && !parentIsHome ? (
          <button
            onClick={openParentCabinet}
            className="flex w-full items-center gap-1 px-3 pt-2 pb-1 text-left text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-foreground/80"
            style={pad(0)}
            title={`Back to ${parentCabinet.frontmatter?.title || parentCabinet.name}`}
          >
            <CornerLeftUp className="h-2.5 w-2.5 shrink-0 relative -top-px" />
            Back
          </button>
        ) : null}

        {/* ── Cabinet header + drawer tabs (H variant) ─────
             Header rail (always) + drawer-tab strip (flush below) wrapped
             in one `px-2 pt-3` column. Strip is `mx-[9px]`-inset so the
             header reads as a wider crown over the drawer frame. */}
        <div className="px-2 pt-2">
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1 ring-1 ring-border/60 hover:bg-muted/80 transition-colors">
          <ContextMenu>
          <ContextMenuTrigger>
          <button
            onClick={() => openCabinetOverview(activeCabinet?.path || cabinetPath)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {/*
             * Audit #008 (review feedback 2026-05-02): match the drawer
             * tabs' uppercase treatment so the cabinet name reads as a
             * "header" of the same family. Slightly looser tracking
             * because the name is wider than the 4-letter tab labels.
             */}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {cabinetAgentScopeName || activeCabinet?.frontmatter?.title || activeCabinet?.name || "Cabinet"}
            </span>
          </button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {cabinetPath !== ROOT_CABINET_PATH && (
              <ContextMenuItem onClick={() => navigator.clipboard.writeText(cabinetPath)}>
                <Copy className="h-4 w-4 me-2" />
                Copy Relative Path
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={async () => {
              const dir = await getDataDir();
              navigator.clipboard.writeText(
                cabinetPath === ROOT_CABINET_PATH ? dir : `${dir}/${cabinetPath}`
              );
            }}>
              <ClipboardCopy className="h-4 w-4 me-2" />
              Copy Full Path
            </ContextMenuItem>
            <ContextMenuItem onClick={() => {
              fetch("/api/system/open-data-dir", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  subpath: cabinetPath === ROOT_CABINET_PATH ? "" : cabinetPath,
                }),
              });
            }}>
              <FolderOpen className="h-4 w-4 me-2" />
              Open in Finder
            </ContextMenuItem>
            {cabinetPath !== ROOT_CABINET_PATH && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="text-destructive"
                  onClick={() => setCabinetDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  Delete
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
          </ContextMenu>

          <DepthDropdown
            mode={cabinetVisibilityMode}
            onChange={(mode) =>
              setCabinetVisibilityMode(effectiveCabinetPath, mode)
            }
            compact
            className="ms-auto"
          />
        </div>

        {cabinetExpanded && (
          /* ── Cabinet drawers ───────────────────────────────
             Three drawer-pull tabs (Data · Agents · Tasks) flush against the
             header above, inset by mx-[9px] so the header reads as a crown. */
          <div
            role="tablist"
            aria-label={t("treeView:drawersAriaLabel")}
            className="mx-[5px] mt-1 grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-0.5 pt-1.5 border border-border/60"
          >
                {([
                  {
                    id: "data" as DrawerId,
                    label: t("sidebar:drawerData") || "Data",
                    addLabel: t("sidebar:newPage"),
                    icon: BookOpen,
                    addIcon: FilePlus,
                    onOpen: () => {
                      if (activeCabinet) {
                        openCabinetDataPage(activeCabinet.path, true);
                        return;
                      }
                      if (
                        section.type !== "home" &&
                        section.type !== "page" &&
                        section.type !== "cabinet"
                      ) {
                        setSection({ type: "home" });
                      }
                    },
                    onAdd: () => {
                      if (activeCabinet) {
                        setKbSubPageOpen(true);
                      } else {
                        const btn = document.querySelector<HTMLButtonElement>(
                          "[data-new-page-trigger]"
                        );
                        btn?.click();
                      }
                    },
                  },
                  {
                    id: "agents" as DrawerId,
                    label: t("sidebar:drawerAgents") || "Team",
                    addLabel: t("sidebar:newAgent"),
                    icon: Users,
                    addIcon: UserPlus,
                    onOpen: () =>
                      setSection({
                        type: "agents",
                        cabinetPath: activeCabinet?.path || ROOT_CABINET_PATH,
                      }),
                    onAdd: () => {
                      setSection({
                        type: "agents",
                        cabinetPath: activeCabinet?.path || ROOT_CABINET_PATH,
                      });
                      setTimeout(() => {
                        window.dispatchEvent(
                          new CustomEvent("cabinet:open-add-agent")
                        );
                      }, 100);
                    },
                  },
                  {
                    id: "tasks" as DrawerId,
                    label: t("sidebar:drawerTasks") || "Tasks",
                    addLabel: t("sidebar:newTask"),
                    icon: SquareKanban,
                    addIcon: ListPlus,
                    onOpen: () =>
                      setSection({
                        type: "tasks",
                        cabinetPath: activeCabinet?.path || ROOT_CABINET_PATH,
                      }),
                    onAdd: () => {
                      setSection({
                        type: "tasks",
                        cabinetPath: activeCabinet?.path || ROOT_CABINET_PATH,
                      });
                      setTimeout(() => {
                        window.dispatchEvent(
                          new CustomEvent("cabinet:open-create-task")
                        );
                      }, 100);
                    },
                  },
                ] as const).map((drawer, drawerIdx) => {
                  const Icon = drawer.icon;
                  const AddIcon = drawer.addIcon;
                  const active = activeDrawer === drawer.id;
                  const shortcutNum = drawerIdx + 1;
                  // Platform-correct hint (⌘1 on macOS, Ctrl+1 elsewhere) — the
                  // binding fires on metaKey||ctrlKey, so a hardcoded ⌘ lies on
                  // Windows/Linux.
                  const shortcutHint = formatShortcut(["cmd", String(shortcutNum)], isMac);
                  return (
                    <div key={drawer.id} className="relative group">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-label={`${drawer.label} drawer (${shortcutHint})`}
                        title={`${drawer.label} — ${shortcutHint}`}
                        onClick={() => {
                          setActiveDrawer(drawer.id);
                          drawer.onOpen();
                        }}
                        className={cn(
                          "relative flex w-full flex-col items-center gap-0.5 rounded-md px-1.5 pt-2 pb-1.5 transition-all duration-150",
                          active
                            ? "-translate-y-px bg-[#E4D1B7] text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                            : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                        )}
                      >
                        {/* drawer pull handle */}
                        <span
                          aria-hidden
                          className={cn(
                            "absolute inset-x-0 top-1 mx-auto h-0.5 w-4 rounded-full transition-colors",
                            active ? "bg-amber-400/50" : "bg-muted-foreground/30"
                          )}
                        />
                        <Icon className="h-4 w-4 shrink-0" />
                        {/*
                         * Audit #008 (review feedback 2026-05-02): user
                         * preferred the original ALL CAPS treatment. Restored
                         * uppercase + wider tracking; font-semibold keeps the
                         * active tab's weight emphasis.
                         */}
                        <span className="text-[10px] font-semibold uppercase tracking-wider">
                          {drawer.label}
                        </span>
                      </button>
                      {active && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            drawer.onAdd();
                          }}
                          title={drawer.addLabel}
                          aria-label={drawer.addLabel}
                          className="absolute end-0.5 top-0.5 inline-flex size-6 items-center justify-center rounded text-muted-foreground/60 transition-colors duration-150 hover:bg-muted hover:text-foreground"
                        >
                          <AddIcon className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
          </div>
        )}
        </div>

        {cabinetExpanded && (
          <div className="flex flex-1 min-h-0 flex-col">
            {agentsExpanded && (
              <ContextMenu>
                <ContextMenuTrigger className="flex flex-1 flex-col">
                  <div
                    key="drawer-agents"
                    className="flex flex-1 flex-col pt-1 animate-in fade-in slide-in-from-top-1 duration-200 ease-out"
                  >
                {[
                  ...agents.filter((a) => a.slug === "editor"),
                  ...agents.filter((a) => a.slug !== "editor"),
                ].map((agent, i) => {
                  const cabinetPathForAgent =
                    agent.cabinetPath ||
                    activeCabinet?.path ||
                    ROOT_CABINET_PATH;
                  const scopedId =
                    agent.scopedId ||
                    `${cabinetPathForAgent}::agent::${agent.slug}`;
                  return (
                    <div
                      key={agent.scopedId || agent.slug}
                      className="animate-in fade-in slide-in-from-top-1 duration-200 ease-out"
                      style={{ animationDelay: `${Math.min(i, 10) * 20}ms`, animationFillMode: "backwards" }}
                    >
                      {renderAgentRow(
                        agent.scopedId || agent.slug,
                        agent,
                        {
                          selected:
                            selectedAgentScopedId === scopedId ||
                            (section.type === "agent" &&
                              section.slug === agent.slug),
                          activeDot: (agent.runningCount || 0) > 0,
                          onClick: () =>
                            setSection({
                              type: "agent",
                              slug: agent.slug,
                              cabinetPath: cabinetPathForAgent,
                              agentScopedId: scopedId,
                            }),
                          editable: {
                            slug: agent.slug,
                            cabinetPath: cabinetPathForAgent,
                          },
                        }
                      )}
                    </div>
                  );
                })}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() => {
                      setSection({
                        type: "agents",
                        cabinetPath: activeCabinet?.path || ROOT_CABINET_PATH,
                      });
                      setTimeout(() => {
                        window.dispatchEvent(
                          new CustomEvent("cabinet:open-add-agent")
                        );
                      }, 100);
                    }}
                  >
                    <UserPlus className="h-4 w-4 me-2" />
                    New Agent
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )}

            {tasksExpanded && (
              <ContextMenu>
                <ContextMenuTrigger className="flex flex-1 flex-col">
                  <div
                    key="drawer-tasks"
                    className="flex flex-1 flex-col pt-1 animate-in fade-in slide-in-from-top-1 duration-200 ease-out"
                  >
                    <RecentTasks
                      active
                      padStyle={pad(1)}
                      itemClass={itemClass}
                      cabinetPath={activeCabinet?.path}
                      agents={agents}
                    />
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() => {
                      setSection({
                        type: "tasks",
                        cabinetPath: activeCabinet?.path || ROOT_CABINET_PATH,
                      });
                      setTimeout(() => {
                        window.dispatchEvent(
                          new CustomEvent("cabinet:open-create-task")
                        );
                      }, 100);
                    }}
                  >
                    <ListPlus className="h-4 w-4 me-2" />
                    New Task
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )}

            {kbExpanded && (
              <ContextMenu>
                <ContextMenuTrigger className="flex flex-1 flex-col">
                  <div
                    key="drawer-data"
                    className="flex flex-1 flex-col pt-1 animate-in fade-in slide-in-from-top-1 duration-200 ease-out"
                  >
              <SidebarSearch>
                {visibleTreeNodes.length === 0 ? (
                  <button
                    onClick={() => {
                      if (activeCabinet) {
                        setKbSubPageOpen(true);
                      } else {
                        const btn = document.querySelector<HTMLButtonElement>(
                          "[data-new-page-trigger]"
                        );
                        btn?.click();
                      }
                    }}
                    className={itemClass(false)}
                    style={pad(1)}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {activeCabinet ? "Add cabinet data" : "Add your first page"}
                  </button>
                ) : (
                  // Each row carries its own context menu (rename, copy path,
                  // Open in Finder, delete). Without this stopPropagation a
                  // right-click on a row bubbles to the data-drawer trigger
                  // above and opens *that* menu instead — same fix the Drive
                  // section uses below.
                  <div onContextMenu={(e) => e.stopPropagation()}>
                    {visibleTreeNodes.map((node, index) => (
                      <TreeNode
                        key={node.path}
                        node={node}
                        depth={1}
                        contextCabinetPath={activeCabinet?.path || null}
                        siblings={visibleTreeNodes}
                        onMoveToRequest={requestMoveTo}
                        animationDelayMs={index * 22}
                      />
                    ))}
                  </div>
                )}
                {/* Mounted Drive folders flow inline right after the cabinet
                    files. Rendered inside SidebarSearch so they sit with the
                    file list rather than below its flex-1 slack (which would
                    pin them to the bottom when collapsed). stopPropagation keeps
                    a right-click on a Drive node from also opening the cabinet
                    context menu. */}
                <div onContextMenu={(e) => e.stopPropagation()}>
                  <GoogleDriveTreeSection key={dataRootPath} depth={1} padFn={pad} itemClass={itemClass} cabinetPath={dataRootPath} />
                </div>
              </SidebarSearch>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => setKbSubPageOpen(true)}>
                    <FilePlus className="h-4 w-4 me-2" />
                    {t("treeNode:addSubPage")}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => setNewFileOpen(true)}>
                    <FilePlus2 className="h-4 w-4 me-2" />
                    {t("treeNode:createFile")}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => setConnectKnowledgeOpen(true)}>
                    <GitBranch className="h-4 w-4 me-2" />
                    {t("treeNode:connectKnowledge")}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={async () => {
                      const dir = await getDataDir();
                      navigator.clipboard.writeText(
                        dataRootPath ? `${dir}/${dataRootPath}` : dir
                      );
                    }}
                  >
                    <ClipboardCopy className="h-4 w-4 me-2" />
                    {t("treeNode:copyFullPath")}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      fetch("/api/system/open-data-dir", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ subpath: dataRootPath }),
                      });
                    }}
                  >
                    <FolderOpen className="h-4 w-4 me-2" />
                    {t("treeNode:openInFinder")}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )}
          </div>
        )}
      </div>
    </ScrollArea>

    <Dialog open={kbSubPageOpen} onOpenChange={setKbSubPageOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Add Sub Page to &ldquo;{kbSectionLabel}&rdquo;
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!kbSubPageTitle.trim()) return;
            setKbCreating(true);
            try {
              await createPage(dataRootPath, kbSubPageTitle.trim());
              const slug = kbSubPageTitle
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
              const nextPath = dataRootPath ? `${dataRootPath}/${slug}` : slug;
              selectPage(nextPath);
              await loadPage(nextPath);
              setSection(
                activeCabinet
                  ? {
                      type: "page",
                      cabinetPath: activeCabinet.path,
                    }
                  : { type: "page" }
              );
              setKbSubPageTitle("");
              setKbSubPageOpen(false);
            } catch (error) {
              console.error("Failed to create sub page:", error);
            } finally {
              setKbCreating(false);
            }
          }}
          className="flex gap-2"
        >
          <Input
            placeholder={t("treeView:pageTitlePlaceholder")}
            value={kbSubPageTitle}
            onChange={(e) => setKbSubPageTitle(e.target.value)}
            autoFocus
          />
          <Button type="submit" disabled={!kbSubPageTitle.trim() || kbCreating}>
            {kbCreating ? "Creating..." : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>

    <LinkRepoDialog
      open={linkRepoOpen}
      onOpenChange={setLinkRepoOpen}
      parentPath={dataRootPath}
    />

    <ConnectGithubDialog
      open={githubConnectOpen}
      onOpenChange={setGithubConnectOpen}
      parentPath={dataRootPath}
    />

    <ConnectKnowledgeDialog
      open={connectKnowledgeOpen}
      onOpenChange={setConnectKnowledgeOpen}
      onLocal={() => {
        setConnectKnowledgeOpen(false);
        setLinkRepoOpen(true);
      }}
      onCloud={(provider) => {
        setConnectKnowledgeOpen(false);
        setDriveProvider(provider);
        setConnectDriveOpen(true);
      }}
      onNotion={() => setNotionConnectOpen(true)}
      onAppleNotes={() => setAppleNotesConnectOpen(true)}
      onGithub={() => {
        setGithubConnectOpen(true);
      }}
    />

    <NotionConnectDialog
      open={notionConnectOpen}
      onOpenChange={setNotionConnectOpen}
      targetPath={dataRootPath}
    />

    <AppleNotesConnectDialog
      open={appleNotesConnectOpen}
      onOpenChange={setAppleNotesConnectOpen}
      targetPath={dataRootPath}
    />

    <ConnectDriveDialog
      open={connectDriveOpen}
      onOpenChange={setConnectDriveOpen}
      cabinetPath={dataRootPath}
      provider={driveProvider}
      // From the room root, every provider connects into the per-room cloud
      // browser (the dedicated section); per-node connects mount inline.
    />

    <NewFileDialog
      open={newFileOpen}
      onOpenChange={setNewFileOpen}
      parentPath={dataRootPath}
      contextCabinetPath={activeCabinet?.path || null}
    />

    <MoveToDialog
      open={moveToOpen}
      onOpenChange={setMoveToOpen}
      source={moveToSource}
    />

    <EditAgentIdentityDialog
      target={editingAgent}
      onOpenChange={(open) => {
        if (!open) setEditingAgent(null);
      }}
      onSaved={() => {
        void loadAgents();
      }}
    />

    <Dialog open={cabinetDeleteOpen} onOpenChange={setCabinetDeleteOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <TriangleAlert className="h-4 w-4 text-destructive" />
            </div>
            <div className="flex flex-col gap-1">
              <DialogTitle>
                Delete Cabinet &ldquo;{activeCabinet?.frontmatter?.title || activeCabinet?.name || cabinetPath}&rdquo;
              </DialogTitle>
              <DialogDescription>
                This will permanently delete the cabinet and everything inside it — all pages, agents, jobs, and tasks. This cannot be undone.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => setCabinetDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await deletePage(cabinetPath);
              setCabinetDeleteOpen(false);
              setSection({ type: "home" });
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!pendingMove} onOpenChange={(open) => !open && setPendingMove(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disable Alphabetical Sorting?</DialogTitle>
          <DialogDescription>
            You are manually reordering files or folders, but alphabetical auto-sorting is currently enabled.
            Would you like to disable alphabetical sorting to apply your manual ordering?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2 flex gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => setPendingMove(null)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (pendingMove) {
                const move = pendingMove;
                setPendingMove(null);
                await executeMovePage(move);
              }
            }}
          >
            Keep Auto-Sorting
          </Button>
          <Button
            variant="default"
            onClick={async () => {
              if (pendingMove) {
                const move = pendingMove;
                setPendingMove(null);
                setSortAlphabetical(false);
                await executeMovePage(move);
              }
            }}
          >
            Disable Auto-Sorting &amp; Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    </>
  );
}

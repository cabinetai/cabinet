"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Archive,
  Blocks,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  Plus,
  RefreshCw,
  Settings,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { NavArrows } from "@/components/layout/nav-arrows";
import { RoomSwitcher } from "./room-switcher";
import { TreeView } from "./tree-view";
import { NewPageDialog } from "./new-page-dialog";
import { NewCabinetDialog } from "./new-cabinet-dialog";
import { useAppStore } from "@/stores/app-store";
import { useRoomsStore } from "@/stores/rooms-store";
import { useTreeStore } from "@/stores/tree-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import type { TreeNode } from "@/types";
import { useLocale } from "@/i18n/use-locale";

function collectPaths(nodes: TreeNode[], out: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    out.add(n.path);
    if (n.children?.length) collectPaths(n.children, out);
  }
  return out;
}

function useIsMobile() {
  const isMobile = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      return () => window.removeEventListener("resize", onChange);
    },
    () => window.innerWidth < 768,
    () => false
  );

  return isMobile;
}

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 280;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function Sidebar() {
  const { t, locale } = useLocale();
  const isMobile = useIsMobile();
  const brandWord = locale === "en" ? "" : t("sidebar:brandWord");
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const section = useAppStore((s) => s.section);
  const setSection = useAppStore((s) => s.setSection);
  const sidebarDrawer = useAppStore((s) => s.sidebarDrawer);
  const defaultRoom = useRoomsStore((s) => s.defaultRoom);
  // The cabinet new pages/cabinets should be created *inside* (a child of the
  // cabinet you're currently in). The data-dir root (".") is the neutral home
  // container, not a cabinet, so treat it as "use the default room" — otherwise
  // new items land at the home root as siblings of the rooms.
  const currentCabinetParent =
    section.cabinetPath && section.cabinetPath !== ROOT_CABINET_PATH
      ? section.cabinetPath
      : defaultRoom || "";
  const [refreshing, setRefreshing] = useState(false);
  // Footer "New" split button drives both create dialogs in controlled mode.
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newCabinetOpen, setNewCabinetOpen] = useState(false);
  const lastRefreshAtRef = useRef(0);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
    const storedWidth = window.localStorage.getItem("cabinet-sidebar-width");
    const parsedWidth = storedWidth ? Number(storedWidth) : NaN;
    return Number.isFinite(parsedWidth)
      ? clamp(parsedWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
      : SIDEBAR_DEFAULT_WIDTH;
  });
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("cabinet-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!dragStateRef.current) return;
      const nextWidth =
        dragStateRef.current.startWidth + (event.clientX - dragStateRef.current.startX);
      setSidebarWidth(clamp(nextWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH));
    }

    function handlePointerUp() {
      dragStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    if (isMobile) setCollapsed(true);
  }, [isMobile, setCollapsed]);

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    dragStateRef.current = { startX: event.clientX, startWidth: sidebarWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  async function refreshTree() {
    const now = Date.now();
    if (refreshing) return;
    if (now - lastRefreshAtRef.current < 1000) return;
    lastRefreshAtRef.current = now;
    setRefreshing(true);
    try {
      const before = collectPaths(useTreeStore.getState().nodes);
      await useTreeStore.getState().loadTree();
      const after = collectPaths(useTreeStore.getState().nodes);
      let added = 0;
      let removed = 0;
      after.forEach((p) => {
        if (!before.has(p)) added++;
      });
      before.forEach((p) => {
        if (!after.has(p)) removed++;
      });
      const message =
        added === 0 && removed === 0
          ? t("sidebar:refreshedNoChanges")
          : t("sidebar:refreshedWithChanges", { added, removed });
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: { kind: "success", message },
        })
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: { kind: "error", message: t("sidebar:refreshFailed") },
        })
      );
    } finally {
      setRefreshing(false);
    }
  }

  // The expanded panel width. Kept constant on the inner wrapper so the
  // tree never reflows mid-animation — only the <aside> width animates and
  // clips it (overflow-hidden). Animating the heavy tree's layout every
  // frame was what made collapse/expand feel slow.
  const panelWidth = isMobile ? 280 : sidebarWidth;

  return (
    <>
      {isMobile && !collapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={() => setCollapsed(true)}
        />
      )}

      <aside
        suppressHydrationWarning
        className={cn(
          "flex bg-[var(--gutter)] h-full overflow-hidden transition-[width] duration-200 will-change-[width] [&_button]:cursor-pointer",
          isMobile && "fixed inset-y-0 start-0 z-40",
          !isMobile && !collapsed && "shrink-0"
        )}
        style={{ width: collapsed ? 0 : panelWidth }}
      >
        <div
          className="flex h-full flex-col"
          style={{ width: panelWidth }}
        >
        <div className="sidebar-header flex items-center justify-between gap-1 px-3 py-2">
          <div className="flex min-w-0 items-center gap-1">
            <button
              onClick={() => setSection({ type: "home" })}
              className="group flex shrink-0 items-center gap-1.5 rounded px-1 font-logo text-[22px] italic tracking-[-0.01em] text-foreground hover:text-foreground/80 hover:bg-accent/60 transition-colors cursor-pointer"
              title={t("sidebar:goHome")}
              aria-label={t("sidebar:goHome")}
            >
              <span className="brand-en">cabinet</span>
              {brandWord && (
                <span
                  className={cn(
                    // Same wordmark face as the help-page titles
                    // (`.font-logo italic` → Cardo in Hebrew/RTL).
                    "font-logo italic tracking-tight",
                    // CJK glyphs render visually larger / denser than the
                    // Latin logo, so dial the size down for those scripts.
                    locale.startsWith("zh") ? "text-[14px]" : "text-[19px]"
                  )}
                  style={{ color: "#8B5E3C" }}
                >
                  {brandWord}
                </span>
              )}
            </button>
            {/* The room switcher shows the current room's icon + name next to
                the logo; the name truncates on narrow rails. */}
            <RoomSwitcher />
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <NavArrows />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("sidebar:refresh")}
              title={t("sidebar:refreshDescription")}
              className="h-7 w-7 text-muted-foreground/60 hover:text-muted-foreground"
              onClick={refreshTree}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("sidebar:collapseSidebar")}
              title={t("sidebar:collapseSidebar")}
              className="h-7 w-7 text-muted-foreground/60 hover:text-muted-foreground"
              onClick={() => setCollapsed(true)}
            >
              <PanelLeftClose className="h-3.5 w-3.5 rtl:rotate-180" />
            </Button>
          </div>
        </div>
        <TreeView />

        <div className="p-2 flex items-center gap-1">
          {sidebarDrawer === "data" && (
            <div className="min-w-0 flex-1">
              {/* One "New" split button instead of two truncating labels. Page
                  and cabinet are both created *inside* the current cabinet (a
                  child), not at the data-dir (home) root. New top-level rooms
                  come from the home switcher's "Add room". */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  title={t("sidebar:new")}
                  className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate">{t("sidebar:new")}</span>
                  <ChevronDown className="ms-auto h-3 w-3 shrink-0 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top">
                  <DropdownMenuItem onClick={() => setNewPageOpen(true)}>
                    <Plus className="h-4 w-4" />
                    {t("sidebar:newPage")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setNewCabinetOpen(true)}>
                    <Archive className="h-4 w-4" />
                    {t("dialogs:newCabinet.trigger")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <NewPageDialog
                parentPath={currentCabinetParent}
                open={newPageOpen}
                onOpenChange={setNewPageOpen}
                hideTrigger
              />
              <NewCabinetDialog
                parentPath={currentCabinetParent}
                open={newCabinetOpen}
                onOpenChange={setNewCabinetOpen}
              />
            </div>
          )}
          {sidebarDrawer === "agents" && (
            <button
              type="button"
              title={t("sidebar:newAgent")}
              onClick={() => {
                setSection({
                  type: "agents",
                  cabinetPath: section.cabinetPath || ROOT_CABINET_PATH,
                });
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent("cabinet:open-add-agent"));
                }, 100);
              }}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              <UserPlus className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{t("sidebar:newAgent")}</span>
            </button>
          )}
          {sidebarDrawer === "tasks" && (
            <button
              type="button"
              title={t("sidebar:newTask")}
              onClick={() => {
                setSection({
                  type: "tasks",
                  cabinetPath: section.cabinetPath || ROOT_CABINET_PATH,
                });
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent("cabinet:open-create-task"));
                }, 100);
              }}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{t("sidebar:newTask")}</span>
            </button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Integrations"
            title="Integrations"
            className={cn(
              "h-7 w-7 shrink-0 text-muted-foreground/60 hover:text-muted-foreground",
              section.type === "integrations" && "bg-accent text-foreground hover:text-foreground"
            )}
            onClick={() => setSection({ type: "integrations" })}
          >
            <Blocks className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("sidebar:settings")}
            title={t("sidebar:settings")}
            className={cn(
              "h-7 w-7 shrink-0 text-muted-foreground/60 hover:text-muted-foreground",
              section.type === "settings" && "bg-accent text-foreground hover:text-foreground"
            )}
            onClick={() => setSection({ type: "settings" })}
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
        </div>
      </aside>
      {!isMobile && !collapsed && (
        <div className="relative -ms-px h-screen w-px shrink-0 bg-border">
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("sidebar:resizeHandle")}
            title={t("sidebar:resetWidth")}
            tabIndex={0}
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuenow={sidebarWidth}
            onPointerDown={startResize}
            onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
            onKeyDown={(event) => {
              const STEP = 16;
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setSidebarWidth((w) => clamp(w - STEP, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH));
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                setSidebarWidth((w) => clamp(w + STEP, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH));
              } else if (event.key === "Home" || event.key === "Enter") {
                event.preventDefault();
                setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
              }
            }}
            className="absolute inset-y-0 inset-x-0 mx-auto w-3 cursor-col-resize bg-transparent focus-visible:outline-none focus-visible:bg-primary/40"
          />
        </div>
      )}
      {collapsed && !isMobile && (
        // Sits in the same band as the viewer toolbar (desk paddingTop 10px +
        // the h-10 toolbar row), vertically centered so it reads as the first
        // toolbar button rather than a floating orphan. ViewerToolbar reserves
        // the matching inline-start gap via --sidebar-toggle-offset.
        <div
          className="absolute top-[10px] z-20 flex h-10 items-center gap-1 animate-in fade-in zoom-in-95 duration-200"
          style={{ insetInlineStart: "calc(0.5rem + var(--traffic-clearance, 0px))" }}
        >
          {/* Brand persists when the sidebar is collapsed — it otherwise
              vanishes with the 0-width rail (and full-screen leaves the corner
              empty). Click = home, mirroring the expanded logo. ViewerToolbar
              reserves the matching width via --sidebar-toggle-offset.
              ponytail: Latin wordmark only so that reserved offset stays a
              fixed width; measure if a locale's mark needs more room. */}
          <button
            onClick={() => setSection({ type: "home" })}
            title={t("sidebar:goHome")}
            aria-label={t("sidebar:goHome")}
            className="font-logo text-[19px] italic tracking-[-0.01em] text-foreground/85 hover:text-foreground transition-colors cursor-pointer px-0.5"
          >
            <span className="brand-en">cabinet</span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("sidebar:expandSidebar")}
            title={t("sidebar:expandSidebar")}
            className="h-7 w-7 text-muted-foreground/60 hover:text-muted-foreground"
            onClick={() => setCollapsed(false)}
          >
            <PanelLeft className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </div>
      )}
    </>
  );
}

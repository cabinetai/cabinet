"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  PanelLeftClose,
  PanelLeft,
  Plus,
  RefreshCw,
  Settings,
  UserPlus,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NavArrows } from "@/components/layout/nav-arrows";
import { TreeView } from "./tree-view";
import { NewPageDialog } from "./new-page-dialog";
import { NewCabinetDialog } from "./new-cabinet-dialog";
import { useAppStore } from "@/stores/app-store";
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
  const { t } = useLocale();
  const isMobile = useIsMobile();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const section = useAppStore((s) => s.section);
  const setSection = useAppStore((s) => s.setSection);
  const sidebarDrawer = useAppStore((s) => s.sidebarDrawer);
  const [refreshing, setRefreshing] = useState(false);
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

  const desktopClass = collapsed ? "w-0 overflow-hidden" : "shrink-0";
  const mobileClass = cn(
    "fixed left-0 top-0 bottom-0 z-40",
    collapsed ? "w-0 overflow-hidden" : "w-[280px]"
  );

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
          "flex flex-col bg-sidebar transition-all duration-200 h-screen overflow-hidden [&_button]:cursor-pointer",
          isMobile ? mobileClass : desktopClass
        )}
        style={!isMobile && !collapsed ? { width: sidebarWidth } : undefined}
      >
        <div className="sidebar-header flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-1">
            <NavArrows />
            <button
              onClick={() => setSection({ type: "home" })}
              className="group ml-1 flex items-center gap-1.5 rounded px-1 font-logo text-[22px] italic tracking-[-0.01em] text-foreground hover:text-foreground/80 hover:bg-accent/60 transition-colors cursor-pointer"
              title={t("sidebar:goHome")}
              aria-label={t("sidebar:goHome")}
            >
              cabinet
              <Home className="size-3.5 not-italic opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
            </button>
          </div>
          <div className="flex items-center gap-0.5">
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
                className={cn("h-3 w-3", refreshing && "animate-spin")}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("sidebar:collapseSidebar")}
              title={t("sidebar:collapseSidebar")}
              className="h-7 w-7"
              onClick={() => setCollapsed(true)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <TreeView />

        <div className="p-2 flex items-center gap-1">
          {sidebarDrawer === "data" && (
            <>
              <div className="min-w-0 flex-1">
                <NewPageDialog />
              </div>
              <div className="min-w-0 flex-1">
                <NewCabinetDialog />
              </div>
            </>
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
            aria-label={t("sidebar:settings")}
            title={t("sidebar:settings")}
            className={cn(
              "h-7 w-7 shrink-0",
              section.type === "settings" && "bg-accent text-foreground"
            )}
            onClick={() => setSection({ type: "settings" })}
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </aside>
      {!isMobile && !collapsed && (
        <div className="relative -ml-px h-screen w-px shrink-0 bg-border">
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("sidebar:resizeHandle")}
            title={t("sidebar:resetWidth")}
            onPointerDown={startResize}
            onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
            className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 cursor-col-resize bg-transparent"
          />
        </div>
      )}
      {collapsed && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("sidebar:expandSidebar")}
          title={t("sidebar:expandSidebar")}
          className={cn(
            "absolute top-3 h-7 w-7",
            isMobile ? "left-3 z-50" : "left-2 z-20"
          )}
          onClick={() => setCollapsed(false)}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}
    </>
  );
}

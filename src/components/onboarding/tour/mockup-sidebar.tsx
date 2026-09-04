"use client";

import { type CSSProperties, type ReactNode } from "react";
import { Archive, BookOpen, Users, SquareKanban, ChevronDown, Check } from "lucide-react";
import { TOUR_PALETTE as P } from "./palette";
import { useLocale } from "@/i18n/use-locale";

export type MockupTab = "data" | "agents" | "tasks";

interface MockupSidebarProps {
  activeTab?: MockupTab | null;
  /**
   * When provided, the tabs become clickable and call this on selection.
   * Used by the onboarding rail's example preview so people can explore a
   * sample cabinet's Data / Team / Tasks. The tour leaves it undefined, so
   * the tabs stay decorative there.
   */
  onTabChange?: (tab: MockupTab) => void;
  /**
   * Tabs to mark as completed with a green check badge. Used by the onboarding
   * rail to show progress as the user names the cabinet, hires an agent, etc.
   */
  completedTabs?: MockupTab[];
  children?: ReactNode;
  /**
   * Hide the tab rail entirely. Used by the intro slide when only the
   * Cabinet header has appeared and tabs haven't populated yet.
   */
  hideTabs?: boolean;
  /**
   * Hide the tree/body area. Used by the intro slide which shows just
   * the header + tabs chrome with no content underneath.
   */
  hideBody?: boolean;
  /**
   * When true, the tab buttons start hidden and pop in with staggered
   * delay — used by the intro slide to animate tabs into an empty shell.
   */
  tabsPopIn?: boolean;
  /**
   * Base delay (ms) applied to the tabsPopIn sequence so the intro slide
   * can line it up with the width-expansion + title animations.
   */
  tabsPopInDelay?: number;
  /**
   * Cabinet header title. Defaults to "Jane's Cabinet" to match the
   * sidebar; the intro slide overrides to the generic "Cabinet".
   */
  title?: string;
  /**
   * Delay (ms) before the title text inside the header fades in. When 0
   * (default), the title is visible on first paint.
   */
  titleDelay?: number;
  /**
   * Right-side chip in the Cabinet header (e.g. "+1", "All"). Matches the
   * `DepthDropdown` slot in the real sidebar. Pass an empty string to
   * hide the chip entirely.
   */
  headerBadge?: string;
  /**
   * Shared element identity for the View Transitions API so the card can
   * morph between slide layouts.
   */
  viewTransitionName?: string;
}

const TAB_DEFS: Array<{ id: MockupTab; labelKey: string; icon: typeof BookOpen }> = [
  { id: "data", labelKey: "sidebar:drawerData", icon: BookOpen },
  { id: "agents", labelKey: "sidebar:drawerAgents", icon: Users },
  { id: "tasks", labelKey: "sidebar:drawerTasks", icon: SquareKanban },
];

export function MockupSidebar({
  activeTab,
  onTabChange,
  completedTabs,
  children,
  hideTabs = false,
  hideBody = false,
  tabsPopIn = false,
  tabsPopInDelay = 900,
  title,
  titleDelay = 0,
  headerBadge = "+1",
  viewTransitionName,
}: MockupSidebarProps) {
  const { t } = useLocale();
  const resolvedTitle = title ?? t("slideDataCopy:mockTitle");
  const rootStyle: CSSProperties = {
    color: P.text,
    ...(viewTransitionName ? { viewTransitionName } : {}),
  };

  const titleAnimStyle: CSSProperties = titleDelay
    ? {
        opacity: 0,
        animation: "cabinet-tour-fade-up 0.45s ease-out forwards",
        animationDelay: `${titleDelay}ms`,
      }
    : {};

  return (
    <div
      className="cabinet-tour-animated relative flex h-full w-full flex-col px-2 pt-3"
      aria-hidden={onTabChange ? undefined : "true"}
      style={rootStyle}
    >
      {/* ── Container 1: Cabinet header rail ─────────────────────── */}
      <div
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
        style={{
          background: P.paperWarm,
          boxShadow: `inset 0 0 0 1px ${P.border}`,
        }}
      >
        <Archive
          className="h-[18px] w-[18px] shrink-0"
          style={{ color: P.iconAmber }}
        />
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium"
          style={{ color: P.textSecondary, ...titleAnimStyle }}
        >
          {resolvedTitle}
        </span>
        {headerBadge && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px]"
            style={{ color: P.textTertiary }}
          >
            {headerBadge}
            <ChevronDown className="h-3 w-3" />
          </span>
        )}
      </div>

      {/* ── Container 2: Drawer tabs ─────────────────────────────── */}
      {!hideTabs && (
        <div
          role="tablist"
          aria-label={t("treeView:drawersAriaLabel")}
          className="mx-[5px] mt-1 grid grid-cols-3 gap-1 rounded-lg p-1 pt-2"
          style={{
            background: "rgba(243, 237, 228, 0.7)",
            boxShadow: `inset 0 0 0 1px ${P.borderLight}`,
          }}
        >
          {TAB_DEFS.map((tab, i) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;
            const completed = completedTabs?.includes(tab.id) ?? false;
            const tabClass =
              "relative flex w-full flex-col items-center gap-0.5 rounded-md px-1.5 pt-3 pb-2 transition-all duration-150";
            const tabStyle: CSSProperties = active
              ? {
                  background: P.bgCard,
                  color: P.text,
                  transform: "translateY(-1px)",
                  boxShadow: `0 1px 0 rgba(59,47,47,0.06), 0 6px 14px -10px rgba(59,47,47,0.35), 0 0 0 1px ${P.border}`,
                }
              : {
                  color: P.textSecondary,
                };
            const tabInner = (
              <>
                {/* drawer pull handle — amber when active, muted when not */}
                <span
                  aria-hidden
                  className="absolute left-1/2 top-1 h-[2px] w-4 -translate-x-1/2 rounded-full"
                  style={{
                    background: active
                      ? P.iconAmberSoft
                      : "rgba(168, 152, 136, 0.45)",
                  }}
                />
                {/* completion badge — bottom-right of the tab cell. Always
                    rendered and toggled via a bouncy scale/opacity transition so
                    it pops IN when completed and pops OUT when un-completed.
                    Inline insets so position never depends on Tailwind logical
                    inset generation. */}
                <span
                  aria-hidden={!completed}
                  className="absolute flex items-center justify-center rounded-full"
                  style={{
                    bottom: 3,
                    insetInlineEnd: 3,
                    height: 14,
                    width: 14,
                    background: "#dcfce7",
                    pointerEvents: "none",
                    transformOrigin: "center",
                    transform: completed ? "scale(1)" : "scale(0)",
                    opacity: completed ? 1 : 0,
                    transition:
                      "transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 180ms ease",
                  }}
                >
                  <Check style={{ height: 9, width: 9, color: "#16a34a" }} strokeWidth={3} />
                </span>
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[8px] font-semibold uppercase tracking-[0.1em]">
                  {t(tab.labelKey)}
                </span>
              </>
            );
            return (
              <div
                key={tab.id}
                className="relative"
                style={
                  tabsPopIn
                    ? {
                        opacity: 0,
                        animation: "cabinet-tour-pop-in 0.45s ease-out forwards",
                        animationDelay: `${tabsPopInDelay + i * 180}ms`,
                      }
                    : undefined
                }
              >
                {onTabChange ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onTabChange(tab.id)}
                    className={`${tabClass} cursor-pointer`}
                    style={tabStyle}
                  >
                    {tabInner}
                  </button>
                ) : (
                  <div className={tabClass} style={tabStyle}>
                    {tabInner}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tree / body area ─────────────────────────────────────── */}
      {!hideBody && (
        <div className="relative flex-1 overflow-hidden cabinet-tour-no-scrollbar pt-1">
          {children}
        </div>
      )}
    </div>
  );
}

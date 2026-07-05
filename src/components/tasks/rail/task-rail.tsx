"use client";

import { useCallback, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useLocale } from "@/i18n/use-locale";
import { AgentAvatar, type AgentAvatarInput } from "@/components/agents/agent-avatar";
import { useTaskRail } from "./task-rail-context";
import type { RailItem } from "./use-task-rail-data";
import type { TaskMeta } from "@/types/tasks";
import type { CabinetAgentSummary } from "@/types/cabinets";

type Translate = ReturnType<typeof useLocale>["t"];

/** Position + text for the floating themed tooltip. */
interface TipState {
  label: string;
  top: number;
  /** Exactly one of left/right is set (the other anchors to the rail). */
  left: number | null;
  right: number | null;
}

function formatRelative(iso: string | undefined, now: number): string {
  if (!iso) return "just now";
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Localised label used for both the tooltip and the aria-label. */
function describe(task: TaskMeta, now: number, t: Translate): string {
  const when = formatRelative(
    task.lastActivityAt ?? task.completedAt ?? task.startedAt,
    now
  );
  const title = task.title;
  switch (task.status) {
    case "running":
      return t("taskRail:itemRunning", { title, when });
    case "awaiting-input":
      return t("taskRail:itemNeedsReply", { title });
    case "failed":
      return t("taskRail:itemFailed", { title, when });
    case "done":
      return t("taskRail:itemDone", { title, when });
    case "archived":
      return t("taskRail:itemArchived", { title });
    default:
      return t("taskRail:itemDefault", { title, when });
  }
}

/** Bottom-end status dot colour + whether it pulses. */
function statusDot(status: TaskMeta["status"]): {
  cls: string;
  pulse: boolean;
} {
  switch (status) {
    case "running":
      return { cls: "bg-emerald-500", pulse: true };
    case "awaiting-input":
      return { cls: "bg-amber-500", pulse: false };
    case "failed":
      return { cls: "bg-red-500", pulse: false };
    case "done":
      return { cls: "bg-emerald-500", pulse: false };
    case "archived":
      return { cls: "bg-muted-foreground/30", pulse: false };
    default:
      return { cls: "bg-muted-foreground/40", pulse: false };
  }
}

/** Build the AgentAvatar input from a cabinet summary, falling back to the
 *  slug-derived glyph when the agent isn't in the loaded roster. */
function avatarInput(
  slug: string,
  cabinetPath: string | undefined,
  agent: CabinetAgentSummary | undefined
): AgentAvatarInput {
  if (!agent) return { slug, cabinetPath };
  return {
    slug: agent.slug,
    cabinetPath: agent.cabinetPath ?? cabinetPath,
    displayName: agent.displayName ?? agent.name,
    iconKey: agent.iconKey,
    color: agent.color,
    avatar: agent.avatar,
    avatarExt: agent.avatarExt,
  };
}

function RailButton({
  item,
  index,
  now,
  t,
  onShowTip,
  onHideTip,
}: {
  item: RailItem;
  /** Position in the flattened list — drives the cascade stagger. */
  index: number;
  now: number;
  t: Translate;
  onShowTip: (label: string, el: HTMLElement) => void;
  onHideTip: () => void;
}) {
  const setTaskPanelConversation = useAppStore(
    (s) => s.setTaskPanelConversation
  );
  const activeId = useAppStore((s) => s.taskPanelConversation?.id);
  const { agentsBySlug } = useTaskRail();

  const { task, meta } = item;
  const slug = task.agentSlug || "editor";
  const agent = avatarInput(slug, meta.cabinetPath, agentsBySlug.get(slug));
  const dot = statusDot(task.status);
  const label = describe(task, now, t);
  const isActive = activeId === task.id;

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => setTaskPanelConversation(meta)}
      onMouseEnter={(e) => onShowTip(label, e.currentTarget)}
      onMouseLeave={onHideTip}
      onFocus={(e) => onShowTip(label, e.currentTarget)}
      onBlur={onHideTip}
      // Same cascade the sidebar uses for files/agents: each row fades +
      // slides in, staggered by position. Stable task.id keys mean SSE
      // refreshes don't replay it — only a fresh open of the rail does.
      style={{
        animationDelay: `${Math.min(index, 12) * 22}ms`,
        animationFillMode: "backwards",
      }}
      className={cn(
        "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full",
        "transition-colors focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-ring/60",
        "animate-in fade-in slide-in-from-top-1 duration-200 ease-out",
        // No brown selection ring — just a subtle themed fill for the
        // currently-open task; hover gets the same fill.
        isActive ? "bg-accent" : "hover:bg-accent"
      )}
    >
      <span className="relative">
        <AgentAvatar agent={agent} size="sm" shape="circle" />
        <span className="absolute -bottom-0.5 -end-0.5 flex h-1.5 w-1.5">
          {dot.pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                dot.cls
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex h-1.5 w-1.5 rounded-full ring-1 ring-card",
              dot.cls
            )}
          />
        </span>
      </span>
    </button>
  );
}

/**
 * Always-available rail pinned to the inline-end edge. The avatars ride a
 * floating rounded "capsule" (a soft raised card, inset from the window edge
 * — Manila Arc) that sits in a 52px desk gutter the app reserves. Live tasks
 * (running / awaiting-input) from every cabinet sit on top, then a hairline
 * divider, then every other task newest-activity-first. There's no scrollbar —
 * the capsule simply shows as many as fit and clips the rest. Items cascade in
 * with the same fade/slide the sidebar uses for files and agents.
 * Clicking any item reopens the familiar task drawer.
 * Toggled from the status-bar button next to Help or with Cmd/Ctrl+Opt+L.
 */
export function TaskRail() {
  const { t } = useLocale();
  const open = useAppStore((s) => s.taskRailOpen);
  const toggleTaskRail = useAppStore((s) => s.toggleTaskRail);
  const { running, rest, now } = useTaskRail();
  const [tip, setTip] = useState<TipState | null>(null);

  // Anchor a single themed tooltip to the inline-start of the hovered
  // avatar so it never overlaps the rail. `fixed` escapes the rail's
  // overflow clipping; positioned from the element's live rect.
  const showTip = useCallback((label: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const rtl =
      typeof document !== "undefined" &&
      getComputedStyle(document.documentElement).direction === "rtl";
    setTip({
      label,
      top: r.top + r.height / 2,
      left: rtl ? r.right + 10 : null,
      right: rtl ? null : window.innerWidth - r.left + 10,
    });
  }, []);
  const hideTip = useCallback(() => setTip(null), []);

  if (!open) return null;

  const empty = running.length === 0 && rest.length === 0;
  const tipOnLeftOfRail = tip?.right != null;

  return (
    <aside
      aria-label={t("taskRail:title")}
      className={cn(
        // Fixed to the window's inline-end edge, full height — the app
        // reserves a matching 52px gutter so nothing renders under it and
        // the rail never moves (the task drawer opens to its left). z-40
        // sits above content/toolbars but below true modal scrims (z-50).
        // The aside is transparent; the capsule inside is the visible surface.
        "fixed inset-y-0 end-0 z-40 flex w-[52px] flex-col"
      )}
    >
      {/* Floating capsule: a soft raised card inset from the window edge, so
          the avatars read as round chips on a pill rather than squeezed flush
          to the edge. bg-card/70 lifts it off the same-coloured desk gutter. */}
      <div className="m-1.5 flex min-h-0 flex-1 flex-col rounded-[20px] bg-card/70 shadow-[0_2px_12px_rgba(0,0,0,0.10)] ring-1 ring-border/50 backdrop-blur-sm">
        <button
          type="button"
          onClick={toggleTaskRail}
          title={t("taskRail:hide")}
          aria-label={t("taskRail:hide")}
          className="flex h-6 w-full items-center justify-center rounded-t-[20px] text-foreground/50 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
        >
          {/* Chevron points toward the edge it collapses into. RTL flips it. */}
          <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </button>

        {/* No scrollbar by design: render the whole list and let the capsule
            clip whatever doesn't fit. Live work is on top, so the part you
            see is always the part that matters most. */}
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-hidden px-1 pb-1.5">
          {empty && (
            <p className="px-1 py-2 text-center text-[9px] leading-tight text-foreground/50">
              {t("taskRail:empty")}
            </p>
          )}

          {running.map((item, i) => (
            <RailButton
              key={item.task.id}
              item={item}
              index={i}
              now={now}
              t={t}
              onShowTip={showTip}
              onHideTip={hideTip}
            />
          ))}

          {running.length > 0 && rest.length > 0 && (
            <span
              aria-hidden
              className="my-0.5 h-px w-4 bg-border"
            />
          )}

          {rest.map((item, i) => (
            <RailButton
              key={item.task.id}
              item={item}
              index={running.length + i}
              now={now}
              t={t}
              onShowTip={showTip}
              onHideTip={hideTip}
            />
          ))}
        </div>
      </div>

      {/* Themed tooltip — instant (no transition), big readable row, sits
          beside the avatar (never over it). Fixed so the rail's overflow
          doesn't clip it. */}
      {tip && (
        <div
          role="tooltip"
          style={{
            position: "fixed",
            top: tip.top,
            left: tip.left ?? undefined,
            right: tip.right ?? undefined,
            transform: "translateY(-50%)",
          }}
          className="pointer-events-none z-50 whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-2 text-[12px] font-medium text-popover-foreground shadow-lg"
        >
          {tip.label}
          {/* Caret pointing at the avatar. */}
          <span
            aria-hidden
            className={cn(
              "absolute top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border bg-popover",
              tipOnLeftOfRail
                ? "end-[-4px] border-border"
                : "start-[-4px] border-border"
            )}
          />
        </div>
      )}
    </aside>
  );
}

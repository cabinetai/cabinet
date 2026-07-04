"use client";

import {
  Calendar as CalendarIcon,
  Clock3,
  Hash,
  HeartPulse,
  Loader2,
  Plus,
  Users,
} from "lucide-react";
import { ChannelsPanel } from "@/components/agents/v2/channels-panel";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";
import { DepthDropdown } from "@/components/cabinets/depth-dropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import type { CabinetAgentSummary } from "@/types/cabinets";
import { useLocale } from "@/i18n/use-locale";
import { useAgentsContext } from "./agents-context";
import { AgentsTab } from "./agents-tab";
import { RoutinesTab } from "./routines-tab";
import { HeartbeatsTab } from "./heartbeats-tab";
import { ScheduleView } from "@/components/cabinets/schedule-view";
import { ContentSheet } from "@/components/layout/content-sheet";
import { FolderTabs } from "@/components/layout/folder-tabs";
import { TaskRailToggle } from "@/components/tasks/rail/task-rail-toggle";

export type AgentsTabKey = "agents" | "routines" | "heartbeats" | "schedule" | "channels";

const TABS: { key: AgentsTabKey; label: string; icon: typeof Users }[] = [
  { key: "agents", label: "Agents", icon: Users },
  { key: "routines", label: "Routines", icon: Clock3 },
  { key: "heartbeats", label: "Heartbeats", icon: HeartPulse },
  { key: "schedule", label: "Schedule", icon: CalendarIcon },
  { key: "channels", label: "Channels", icon: Hash },
];

export function TabsLayout({
  tab,
  onTabChange,
}: {
  tab: AgentsTabKey;
  onTabChange: (next: AgentsTabKey) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar tab={tab} onTabChange={onTabChange} />
      <ContentSheet>
      {tab === "schedule" ? (
        // Full-bleed: the calendar fills the sheet below the tab bar.
        <div className="min-h-0 flex-1">
          <ScheduleMount />
        </div>
      ) : tab === "channels" ? (
        // Full-bleed: the team channels viewer fills the sheet below the tab bar.
        // ponytail: onOpenFile omitted → in-message file links are inert (add a
        // nav handler if users want to click through to KB pages).
        <div className="min-h-0 flex-1">
          <ChannelsMount />
        </div>
      ) : (
        <div className="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-x-hidden overflow-y-auto px-4 pb-8 pt-4 sm:px-6">
          {tab === "agents" && <AgentsTab />}
          {tab === "routines" && <RoutinesTab />}
          {tab === "heartbeats" && <HeartbeatsTab />}
        </div>
      )}
      </ContentSheet>
    </div>
  );
}

/** Channels tab → per-room team-chat board, scoped to the active cabinet. */
function ChannelsMount() {
  const { cabinetPath } = useAgentsContext();
  return <ChannelsPanel fill cabinetPath={cabinetPath} />;
}

/** Schedule tab → the canonical full-bleed ScheduleView, wired to the
 *  workspace's routine/heartbeat dialogs. */
function ScheduleMount() {
  const {
    agents,
    jobs,
    cabinetPath,
    refresh,
    setRoutineDialog,
    setHeartbeatDialog,
  } = useAgentsContext();
  return (
    <ScheduleView
      fullBleed
      cabinetPath={cabinetPath}
      agents={agents}
      jobs={jobs}
      onMutated={() => void refresh()}
      onJobClick={(job, agent) =>
        setRoutineDialog({
          agent: {
            slug: agent.slug,
            name: agent.name,
            role: agent.role,
            cabinetPath: agent.cabinetPath || cabinetPath,
          },
          existingJob: {
            id: job.id,
            name: job.name,
            schedule: job.schedule,
            enabled: job.enabled,
            prompt: job.prompt,
          },
        })
      }
      onHeartbeatClick={(agent) =>
        setHeartbeatDialog({
          agent: {
            slug: agent.slug,
            name: agent.name,
            role: agent.role,
            cabinetPath: agent.cabinetPath || cabinetPath,
          },
          initialHeartbeat: agent.heartbeat || undefined,
          initialEnabled: agent.heartbeatEnabled !== false,
        })
      }
    />
  );
}

function TopBar({
  tab,
  onTabChange,
}: {
  tab: AgentsTabKey;
  onTabChange: (next: AgentsTabKey) => void;
}) {
  const { loading, visibilityMode, setVisibilityMode } =
    useAgentsContext();
  return (
    <header
      className="@container flex shrink-0 flex-wrap items-end gap-x-3 gap-y-1 px-3 pt-1 transition-[padding] duration-200 md:flex-nowrap"
      style={{ paddingInlineStart: `calc(0.75rem + var(--sidebar-toggle-offset, 0px))` }}
    >
      <div className="order-2 min-w-0 flex-1 md:order-1">
        <TabStrip tab={tab} onTabChange={onTabChange} />
      </div>
      <div className="order-1 ms-auto flex items-center gap-2 mb-1.5 md:order-2">
        {loading && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}
        <DepthDropdown mode={visibilityMode} onChange={setVisibilityMode} />
        <Divider className="hidden md:block" />
        <MasterToggle />
        <NewButton tab={tab} />
        <TaskRailToggle />
      </div>
    </header>
  );
}

function Divider({ className }: { className?: string }) {
  return <div className={cn("h-3.5 w-px bg-border/60", className)} aria-hidden />;
}

/**
 * Master Switch in the top nav. Reflects "is any agent running?". Toggling
 * flips every agent on/off (which also gates their heartbeats and routines
 * via the V2 data model). Always visible on the Team section.
 *
 * Built without base-ui's Tooltip primitive on purpose: the TooltipTrigger
 * render-prop pattern swallowed the Switch's onCheckedChange (base-ui
 * merges its own props onto the rendered element, clobbering the Switch's
 * controlled-value handlers). Hover popover is CSS-only via `peer-hover`
 * — no JS handlers competing for the same element.
 */
function MasterToggle() {
  const { agents, toggleAllAgentsActive, bulkToggleInFlight } =
    useAgentsContext();
  const activeCount = agents.filter((a) => a.active).length;
  const totalCount = agents.length;
  const allActive = totalCount > 0 && activeCount === totalCount;
  const partial = activeCount > 0 && activeCount < totalCount;
  const summaryLine =
    totalCount === 0
      ? "No agents in this team"
      : activeCount === 0
        ? "Every agent is stopped"
        : `${activeCount} of ${totalCount} ${totalCount === 1 ? "agent" : "agents"} running`;
  const actionLine = allActive
    ? "Click to stop the whole team. All heartbeats and routines will be paused."
    : "Click to start the whole team. Heartbeats and routines fire on their schedule.";
  // Caption + thumb sit opposite each other. The thumb position is derived
  // from the track width (a fixed inset, or 100% minus the thumb) with
  // logical properties, so it stays flush if the pill is widened and mirrors
  // under RTL — no magic translate tied to the English caption width. Partial
  // reads as a softer green (not amber) with a paler count caption, so it
  // stays on-brand with the full-on emerald while signalling "not everyone".
  const caption = allActive
    ? "Team on"
    : partial
      ? `${activeCount}/${totalCount}`
      : "Team off";
  const thumbInsetStart = allActive
    ? "calc(100% - 1.5rem)"
    : "0.25rem";
  return (
    <div className="relative inline-flex">
      <SwitchPrimitive.Root
        checked={allActive}
        onCheckedChange={() => void toggleAllAgentsActive()}
        disabled={totalCount === 0 || bulkToggleInFlight}
        aria-label={allActive ? "Stop every agent" : "Start every agent"}
        aria-busy={bulkToggleInFlight}
        className={cn(
          "peer group/master relative inline-flex h-7 w-24 shrink-0 cursor-pointer items-center rounded-md border border-transparent transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed",
          bulkToggleInFlight ? "opacity-80" : "disabled:opacity-50",
          partial
            ? "bg-emerald-500/70"
            : "data-[checked]:bg-emerald-500 data-[unchecked]:bg-muted-foreground/30"
        )}
      >
        <span
          aria-hidden
          style={
            allActive
              ? { insetInlineStart: "0.5rem" }
              : { insetInlineEnd: "0.5rem" }
          }
          className={cn(
            "pointer-events-none absolute inset-y-0 flex items-center text-[10px] font-bold uppercase tracking-wide",
            allActive
              ? "text-white"
              : partial
                ? "text-white/80"
                : "text-muted-foreground/80"
          )}
        >
          {caption}
        </span>
        <SwitchPrimitive.Thumb
          style={{ insetInlineStart: thumbInsetStart }}
          className={cn(
            "pointer-events-none absolute inset-y-1 z-10 block aspect-square rounded bg-background shadow-sm ring-0",
            "transition-[inset-inline-start]"
          )}
        />
      </SwitchPrimitive.Root>

      {/* Pure-CSS hover/focus popover. Shows when the Switch (the peer)
          is hovered or focused. `pointer-events-none` lets the cursor
          slide off the popover without re-triggering the Switch behind
          it; we don't need the popover to be interactive. */}
      <div
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute left-1/2 top-full z-50 mt-2 w-[280px] -translate-x-1/2 rounded-md border border-border bg-popover p-3 text-left text-popover-foreground opacity-0 shadow-md transition-opacity",
          "peer-hover:visible peer-hover:opacity-100 peer-focus-visible:visible peer-focus-visible:opacity-100"
        )}
      >
        <p className="text-[12px] font-semibold">
          {allActive
            ? "Team is running"
            : partial
              ? "Team partially running"
              : "Team is stopped"}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {summaryLine}.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">{actionLine}</p>
        <p className="mt-2 text-[11px] italic text-muted-foreground/80">
          Tasks already running won&apos;t stop, only future scheduled
          runs are affected.
        </p>
      </div>
    </div>
  );
}

function TabStrip({
  tab,
  onTabChange,
}: {
  tab: AgentsTabKey;
  onTabChange: (next: AgentsTabKey) => void;
}) {
  const { agents, jobs } = useAgentsContext();
  const counts: Record<AgentsTabKey, number | undefined> = {
    agents: agents.length,
    routines: jobs.length,
    heartbeats: agents.filter((a) => !!a.heartbeat).length,
    schedule: undefined,
    channels: undefined,
  };
  return (
    <FolderTabs
      ariaLabel="Team views"
      active={tab}
      onSelect={(id) => onTabChange(id as AgentsTabKey)}
      tabs={TABS.map((t) => {
        const Icon = t.icon;
        return {
          id: t.key,
          label: (
            <span className="inline-flex items-center gap-1.5">
              <Icon className="size-3.5" />
              {/* Squeezed by open side panels the tab strip runs out of room,
                  so drop the word to an icon-only tab below ~900px of desk. */}
              <span className="@max-[900px]:hidden">{t.label}</span>
            </span>
          ),
          count: counts[t.key],
        };
      })}
    />
  );
}

function NewButton({ tab }: { tab: AgentsTabKey }) {
  const { t } = useLocale();
  const {
    agents,
    setNewAgentOpen,
    setRoutineDialog,
    setHeartbeatDialog,
    cabinetPath,
  } = useAgentsContext();

  if (tab === "agents") {
    return (
      <button
        type="button"
        onClick={() => setNewAgentOpen(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Plus className="size-3.5" />
        {t("agents:workspace.newAgent")}
      </button>
    );
  }

  if (tab === "routines") {
    return (
      <AgentPickerDropdown
        label={t("agents:workspace.newRoutine")}
        agents={agents}
        onSelect={(agent) =>
          setRoutineDialog({
            agent: {
              slug: agent.slug,
              name: agent.name,
              role: agent.role,
              cabinetPath: agent.cabinetPath || cabinetPath,
            },
            isNew: true,
          })
        }
      />
    );
  }

  if (tab === "heartbeats") {
    return (
      <AgentPickerDropdown
        label={t("agents:workspace.configureHeartbeat")}
        agents={agents}
        onSelect={(agent) =>
          setHeartbeatDialog({
            agent: {
              slug: agent.slug,
              name: agent.name,
              role: agent.role,
              cabinetPath: agent.cabinetPath || cabinetPath,
            },
            initialHeartbeat: agent.heartbeat || undefined,
            initialEnabled: agent.heartbeatEnabled !== false,
          })
        }
      />
    );
  }

  return null;
}

function AgentPickerDropdown({
  label,
  agents,
  onSelect,
}: {
  label: string;
  agents: CabinetAgentSummary[];
  onSelect: (agent: CabinetAgentSummary) => void;
}) {
  const { t } = useLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        disabled={agents.length === 0}
      >
        <Plus className="size-3.5" />
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[360px] overflow-y-auto p-1">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("agents:workspace.pickAnAgent")}
        </div>
        {agents
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((agent) => (
            <DropdownMenuItem
              key={agent.scopedId}
              onClick={() => onSelect(agent)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]"
            >
              <AgentAvatar agent={agent} shape="circle" size="md" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[12px] font-medium text-foreground">
                  {agent.name}
                </span>
                {agent.role ? (
                  <span className="truncate text-[10px] text-muted-foreground">
                    {agent.role}
                  </span>
                ) : null}
              </span>
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

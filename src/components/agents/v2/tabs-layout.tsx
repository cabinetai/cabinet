"use client";

import {
  Calendar as CalendarIcon,
  Clock3,
  Hash,
  HeartPulse,
  Loader2,
  Plus,
  RefreshCw,
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
      {tab === "schedule" ? (
        // Full-bleed: the calendar fills the area below the tab bar.
        <div className="min-h-0 flex-1">
          <ScheduleMount />
        </div>
      ) : tab === "channels" ? (
        // Full-bleed: the team channels viewer fills the area below the tab bar.
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
  const { t } = useLocale();
  const { loading, refresh, visibilityMode, setVisibilityMode } =
    useAgentsContext();
  return (
    <header
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 bg-background px-4 py-2 transition-[padding] duration-200 md:h-12 md:flex-nowrap md:py-0"
      style={{ paddingInlineStart: `calc(1rem + var(--sidebar-toggle-offset, 0px))` }}
    >
      <div className="flex items-center gap-2">
        <h1 className="font-ui text-[14px] font-semibold tracking-tight">Team</h1>
        {loading && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="order-3 w-full overflow-x-auto md:order-2 md:ms-2 md:w-auto md:overflow-visible">
        <TabStrip tab={tab} onTabChange={onTabChange} />
      </div>
      <div className="order-2 ms-auto flex items-center gap-2 md:order-3">
        <DepthDropdown mode={visibilityMode} onChange={setVisibilityMode} />
        <Divider className="hidden md:block" />
        <button
          type="button"
          onClick={() => void refresh()}
          title={t("agents:workspace.refresh")}
          aria-label={t("agents:workspace.refresh")}
          className="hidden md:inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <RefreshCw className="size-3.5" />
        </button>
        <Divider className="hidden md:block" />
        <MasterToggle />
        <NewButton tab={tab} />
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
  const anyActive = agents.some((a) => a.active);
  const activeCount = agents.filter((a) => a.active).length;
  const totalCount = agents.length;
  const summaryLine = anyActive
    ? `${activeCount} of ${totalCount} ${totalCount === 1 ? "agent" : "agents"} running`
    : totalCount === 0
      ? "No agents in this team"
      : "Every agent is stopped";
  const actionLine = anyActive
    ? "Click to stop the whole team. All heartbeats and routines will be paused."
    : "Click to start the whole team. Heartbeats and routines fire on their schedule.";
  return (
    <div className="relative inline-flex">
      <SwitchPrimitive.Root
        checked={anyActive}
        onCheckedChange={() => void toggleAllAgentsActive()}
        disabled={totalCount === 0 || bulkToggleInFlight}
        aria-label={anyActive ? "Stop every agent" : "Start every agent"}
        aria-busy={bulkToggleInFlight}
        className={cn(
          "peer group/master relative inline-flex h-7 w-[5.5rem] shrink-0 cursor-pointer items-center rounded-md border border-transparent transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed",
          bulkToggleInFlight ? "opacity-80" : "disabled:opacity-50",
          "data-[checked]:bg-emerald-500 data-[unchecked]:bg-muted-foreground/30"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-2 flex items-center text-[10.5px] font-bold uppercase tracking-wider text-white transition-opacity",
            "opacity-0 group-data-[checked]/master:opacity-100"
          )}
        >
          Team on
        </span>
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-2 flex items-center text-[9px] font-bold uppercase tracking-wide text-muted-foreground/80 transition-opacity",
            "opacity-100 group-data-[checked]/master:opacity-0"
          )}
        >
          Team off
        </span>
        <SwitchPrimitive.Thumb
          className={cn(
            "pointer-events-none relative z-10 block size-5 rounded bg-background shadow-sm ring-0 transition-transform",
            "data-[checked]:translate-x-16 data-[unchecked]:translate-x-1"
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
          {anyActive ? "Team is running" : "Team is stopped"}
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
    <nav
      className="flex h-7 items-center rounded-lg border border-border/60 p-0.5"
      role="tablist"
    >
      {TABS.map((t) => {
        const active = tab === t.key;
        const Icon = t.icon;
        const count = counts[t.key];
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(t.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {t.label}
            {typeof count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[9.5px] font-semibold tabular-nums",
                  active
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground/80"
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
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

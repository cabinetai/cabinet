"use client";

import {
  Calendar as CalendarIcon,
  Clock3,
  HeartPulse,
  Loader2,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";
import { DepthDropdown } from "@/components/cabinets/depth-dropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import type { CabinetAgentSummary } from "@/types/cabinets";
import { useAgentsContext } from "./agents-context";
import { AgentsTab } from "./agents-tab";
import { RoutinesTab } from "./routines-tab";
import { HeartbeatsTab } from "./heartbeats-tab";
import { ScheduleTab } from "./schedule-tab";

export type AgentsTabKey = "agents" | "routines" | "heartbeats" | "schedule";

const TABS: { key: AgentsTabKey; label: string; icon: typeof Users }[] = [
  { key: "agents", label: "Agents", icon: Users },
  { key: "routines", label: "Routines", icon: Clock3 },
  { key: "heartbeats", label: "Heartbeats", icon: HeartPulse },
  { key: "schedule", label: "Schedule", icon: CalendarIcon },
];

export function TabsLayout({
  tab,
  onTabChange,
}: {
  tab: AgentsTabKey;
  onTabChange: (next: AgentsTabKey) => void;
}) {
  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col">
        <TopBar tab={tab} onTabChange={onTabChange} />
        <div className="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-hidden px-6 pb-8 pt-4">
          {tab === "agents" && <AgentsTab />}
          {tab === "routines" && <RoutinesTab />}
          {tab === "heartbeats" && <HeartbeatsTab />}
          {tab === "schedule" && <ScheduleTab />}
        </div>
      </div>
    </TooltipProvider>
  );
}

function TopBar({
  tab,
  onTabChange,
}: {
  tab: AgentsTabKey;
  onTabChange: (next: AgentsTabKey) => void;
}) {
  const { loading, refresh, visibilityMode, setVisibilityMode } =
    useAgentsContext();
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 bg-background px-4">
      <h1 className="text-[14px] font-semibold tracking-tight">Team</h1>
      {loading && (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      )}
      <div className="ml-2 flex items-center gap-2">
        <TabStrip tab={tab} onTabChange={onTabChange} />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <DepthDropdown mode={visibilityMode} onChange={setVisibilityMode} />
        <Divider />
        <button
          type="button"
          onClick={() => void refresh()}
          title="Refresh"
          aria-label="Refresh"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <RefreshCw className="size-3.5" />
        </button>
        <Divider />
        <MasterToggle />
        <NewButton tab={tab} />
      </div>
    </header>
  );
}

function Divider() {
  return <div className="h-3.5 w-px bg-border/60" aria-hidden />;
}

/**
 * Master Switch in the top nav. Reflects "is any agent running?". Toggling
 * flips every agent on/off (which also gates their heartbeats and routines
 * via the V2 data model). Always visible on the Team section so users can
 * pause everything regardless of which tab they're on.
 *
 * Renders a larger-than-default switch inline (not the shared `<Switch>`
 * primitive) so the prominent on/off control reads at a glance from
 * across the room. Wrapped in a Tooltip for the long-form explanation.
 */
function MasterToggle() {
  const { agents, toggleAllAgentsActive } = useAgentsContext();
  const anyActive = agents.some((a) => a.active);
  const activeCount = agents.filter((a) => a.active).length;
  const totalCount = agents.length;
  const summaryLine = anyActive
    ? `${activeCount} of ${totalCount} ${totalCount === 1 ? "agent" : "agents"} running`
    : totalCount === 0
      ? "No agents in this team"
      : "Every agent is stopped";
  const actionLine = anyActive
    ? "Click to stop the whole team — all heartbeats and routines pause."
    : "Click to start the whole team — heartbeats and routines fire on their schedule.";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          /* Span wrapper carries the tooltip's hover/focus listeners; the
             Switch.Root inside owns click handling. Rendering Switch.Root
             directly as the trigger caused base-ui to overwrite its
             onCheckedChange handler with its own merged props. */
          <span className="inline-flex">
            <SwitchPrimitive.Root
              checked={anyActive}
              onCheckedChange={() => void toggleAllAgentsActive()}
              disabled={totalCount === 0}
              aria-label={anyActive ? "Stop every agent" : "Start every agent"}
              className={cn(
                "group/master peer relative inline-flex h-7 w-[5.5rem] shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-50",
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
                  "pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground/80 transition-opacity",
                  "opacity-100 group-data-[checked]/master:opacity-0"
                )}
              >
                Team off
              </span>
              <SwitchPrimitive.Thumb
                className={cn(
                  "pointer-events-none relative z-10 block size-5 rounded-full bg-background shadow-sm ring-0 transition-transform",
                  "data-[checked]:translate-x-16 data-[unchecked]:translate-x-1"
                )}
              />
            </SwitchPrimitive.Root>
          </span>
        }
      />
      <TooltipContent
        side="bottom"
        variant="themed"
        className="flex max-w-[280px] flex-col items-start gap-1 p-3 text-left"
      >
        <p className="text-[12px] font-semibold">
          {anyActive ? "Team is running" : "Team is stopped"}
        </p>
        <p className="text-[11px] text-muted-foreground">{summaryLine}.</p>
        <p className="text-[11px] text-muted-foreground">{actionLine}</p>
        <p className="text-[11px] italic text-muted-foreground/80">
          Tasks already running won&apos;t be interrupted — only future
          fires are affected.
        </p>
      </TooltipContent>
    </Tooltip>
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
        New Agent
      </button>
    );
  }

  if (tab === "routines") {
    return (
      <AgentPickerDropdown
        label="New Routine"
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
        label="Configure heartbeat"
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
          Pick an agent
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

"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowRight,
  BarChart3,
  Bot,
  Boxes,
  BrainCircuit,
  BriefcaseBusiness,
  ChevronDown,
  Circle,
  ClipboardCheck,
  Code2,
  Command,
  Database,
  FileText,
  Filter,
  GitBranch,
  ListChecks,
  LockKeyhole,
  MessageSquare,
  Network,
  PanelRight,
  RefreshCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  SquareKanban,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MockupId =
  | "onboarding"
  | "tour"
  | "command"
  | "objects"
  | "actions"
  | "agents"
  | "observatory";

type MockupNavItem = {
  id: MockupId;
  label: string;
  detail: string;
  icon: LucideIcon;
};

type Metric = {
  label: string;
  value: string;
  tone?: "good" | "warn" | "info";
};

const MOCKUPS: MockupNavItem[] = [
  {
    id: "onboarding",
    label: "Onboarding",
    detail: "workspace setup",
    icon: BriefcaseBusiness,
  },
  {
    id: "tour",
    label: "Tour",
    detail: "product intro",
    icon: PanelRight,
  },
  {
    id: "command",
    label: "Command",
    detail: "chat first",
    icon: MessageSquare,
  },
  {
    id: "objects",
    label: "Objects",
    detail: "registry",
    icon: Boxes,
  },
  {
    id: "actions",
    label: "Actions",
    detail: "review lane",
    icon: ListChecks,
  },
  {
    id: "agents",
    label: "Agents",
    detail: "one roster",
    icon: Bot,
  },
  {
    id: "observatory",
    label: "Observatory",
    detail: "visibility",
    icon: BrainCircuit,
  },
];

const OBJECT_ROWS = [
  {
    name: "Acme rollout",
    type: "Project",
    owner: "Delivery",
    status: "At risk",
    updated: "12 min",
    evidence: "8 sources",
  },
  {
    name: "Northstar account",
    type: "Account",
    owner: "Revenue",
    status: "Healthy",
    updated: "1 hr",
    evidence: "14 sources",
  },
  {
    name: "DPA approval",
    type: "Policy",
    owner: "Compliance",
    status: "Review",
    updated: "Today",
    evidence: "5 sources",
  },
  {
    name: "Implementation checkpoint",
    type: "Action",
    owner: "Ops",
    status: "Pending",
    updated: "Today",
    evidence: "3 sources",
  },
];

const ACTION_ITEMS = [
  {
    label: "Approve rollout summary",
    detail: "Customer onboarding brief references 8 evidence sources.",
    owner: "Operator",
    risk: "Medium",
    state: "Pending",
  },
  {
    label: "Satisfy implementation checkpoint",
    detail: "Deployment readiness requires owner note before execution.",
    owner: "Delivery",
    risk: "High",
    state: "Checkpoint",
  },
  {
    label: "Deny stale CRM merge",
    detail: "Relationship confidence below policy threshold.",
    owner: "Reviewer",
    risk: "Low",
    state: "Review",
  },
];

const AGENT_ROWS = [
  {
    name: "Command Lead",
    role: "plans and delegates operating work",
    state: "Ready",
    icon: Command,
  },
  {
    name: "Research Analyst",
    role: "collects source-backed context",
    state: "Ready",
    icon: Search,
  },
  {
    name: "Code Specialist",
    role: "ships scoped implementation work",
    state: "Paused",
    icon: Code2,
  },
  {
    name: "Policy Reviewer",
    role: "checks actions before execution",
    state: "Watching",
    icon: ShieldCheck,
  },
];

const OBSERVATORY_SOURCES = [
  {
    label: "Vault Sources",
    detail: "files, docs, notes",
    state: "6 indexed",
    icon: Archive,
  },
  {
    label: "Object Graph",
    detail: "entities, relationships",
    state: "70 nodes",
    icon: Network,
  },
  {
    label: "Action Evidence",
    detail: "runs, policy, audit",
    state: "11 actions",
    icon: GitBranch,
  },
  {
    label: "Harness Reviews",
    detail: "approvals, checkpoints",
    state: "pending",
    icon: ClipboardCheck,
  },
];

export function OptaleCommandUxAlignment() {
  const [activeMockup, setActiveMockup] = useState<MockupId>("onboarding");
  const active = useMemo(
    () => MOCKUPS.find((item) => item.id === activeMockup) ?? MOCKUPS[0],
    [activeMockup]
  );

  return (
    <main className="min-h-screen bg-[#1a1c1d] text-[#ebe9df]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[300px] shrink-0 border-r border-white/10 bg-[#0b0e13] p-4 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <div className="grid size-9 place-items-center rounded-md border border-[#abc275]/45 bg-[#abc275]/10 text-[#abc275]">
              <Command className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Optale Command</div>
              <div className="text-xs text-[#b1b3b5]">UX alignment route</div>
            </div>
          </div>

          <nav className="mt-4 space-y-1" aria-label="Mockup pages">
            {MOCKUPS.map((item) => {
              const Icon = item.icon;
              const selected = activeMockup === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveMockup(item.id)}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-md px-3 text-left transition-colors",
                    selected
                      ? "bg-[#ebe9df] text-[#0b0e13]"
                      : "text-[#b1b3b5] hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span
                      className={cn(
                        "block text-xs",
                        selected ? "text-[#45413b]" : "text-[#8a8c8e]"
                      )}
                    >
                      {item.detail}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-[#b1b3b5]">
            Design target only. Production data wiring and Agent Harness files stay out of this slice.
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-16 items-center justify-between border-b border-white/10 px-4 md:px-6">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#abc275]">
                {active.detail}
              </div>
              <h1 className="truncate text-xl font-semibold md:text-2xl">
                {active.label}
              </h1>
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-[#b1b3b5] md:flex">
              <Circle className="size-2 fill-[#abc275] text-[#abc275]" />
              mockup only
            </div>
          </header>

          <div className="border-b border-white/10 px-3 py-2 lg:hidden">
            <div className="flex gap-2 overflow-x-auto">
              {MOCKUPS.map((item) => {
                const selected = activeMockup === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveMockup(item.id)}
                    className={cn(
                      "h-9 shrink-0 rounded-md border px-3 text-xs font-semibold",
                      selected
                        ? "border-[#abc275] bg-[#abc275] text-[#070808]"
                        : "border-white/10 bg-white/[0.035] text-[#b1b3b5]"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
            {activeMockup === "onboarding" ? <OnboardingMockup /> : null}
            {activeMockup === "tour" ? <TourMockup /> : null}
            {activeMockup === "command" ? <CommandMockup /> : null}
            {activeMockup === "objects" ? <ObjectsMockup /> : null}
            {activeMockup === "actions" ? <ActionsMockup /> : null}
            {activeMockup === "agents" ? <AgentsMockup /> : null}
            {activeMockup === "observatory" ? <ObservatoryMockup /> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function OnboardingMockup() {
  return (
    <MockupFrame>
      <div className="min-h-[760px] bg-[#1a1c1d] px-5 py-6 text-[#ebe9df] md:px-8 md:py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          <div className="flex items-center justify-between gap-4">
            <BrandMark />
            <StepRail active={1} total={6} />
          </div>

          <div className="grid min-h-[610px] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="border border-[#ebe9df]/14 bg-[#232527] p-7 shadow-[0_20px_70px_rgba(0,0,0,0.28)] md:p-9">
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_140px]">
                <div>
                  <h2 className="max-w-[520px] text-5xl font-semibold leading-[0.98] md:text-6xl">
                    Optale
                    <br />
                    Command
                  </h2>
                  <p className="mt-5 font-mono text-xs uppercase text-[#8a8c8e]">
                    operational control plane
                  </p>
                </div>
                <div className="pt-2 font-mono text-xs leading-6 text-[#b1b3b5] md:text-right">
                  spaces
                  <br />
                  brain
                  <br />
                  evals
                </div>
              </div>

              <ol className="mt-10 divide-y divide-[#ebe9df]/10 text-[15px] leading-7">
                <IntroLine
                  index="1."
                  body="A governed workspace for agents, jobs, files, MCP clients, and shared memory."
                  quote="open the product space and review the active agents"
                />
                <IntroLine
                  index="2."
                  label="observability"
                  body="Trace what agents touched, which tools they used, and where policy stopped them."
                  quote="inspect MCP activity and eval drift before the next rollout"
                />
                <IntroLine
                  index="3."
                  label="optale"
                  body="The administrative app for Optale spaces, brain sources, governance, traces, and evals."
                  quote="turn the brain on, connect the client, then run the check"
                />
              </ol>
            </section>

            <section className="flex flex-col items-start gap-6 lg:pl-2">
              <h3 className="text-4xl font-semibold leading-[1.05] md:text-5xl">
                Your spaces.
                <br />
                <span className="text-[#abc275]">Your operating view.</span>
              </h3>
              <p className="max-w-xs text-sm leading-6 text-[#b1b3b5]">
                Set up the operating workspace, then configure roles, runtime
                access, and launch checks.
              </p>
              <button
                type="button"
                className="inline-flex h-11 items-center gap-2 bg-[#abc275] px-5 text-sm font-semibold text-[#070808] transition-colors hover:bg-[#b8cd87]"
              >
                Get started
                <ArrowRight className="size-4" />
              </button>
            </section>
          </div>
        </div>
      </div>
    </MockupFrame>
  );
}

function IntroLine({
  index,
  label,
  body,
  quote,
}: {
  index: string;
  label?: string;
  body: string;
  quote: string;
}) {
  return (
    <li className="grid gap-3 py-5 md:grid-cols-[42px_1fr]">
      <span className="font-mono text-sm text-[#abc275]">{index}</span>
      <div>
        <p className="text-[#b1b3b5]">
          {label ? (
            <span className="mr-2 font-mono text-[11px] uppercase text-[#abc275]">
              {label}
            </span>
          ) : null}
          {body}
        </p>
        <p className="mt-2 font-mono text-xs text-[#8a8c8e]">
          &quot;{quote}&quot;
        </p>
      </div>
    </li>
  );
}

function TourMockup() {
  return (
    <MockupFrame>
      <div className="grid min-h-[760px] bg-[#080a0e] p-5 xl:grid-cols-[260px_1fr]">
        <aside className="rounded-md border border-white/10 bg-[#0e1218] p-3">
          <BrandMark />
          <div className="mt-6 space-y-1">
            {[
              ["Command", MessageSquare],
              ["Objects", Boxes],
              ["Actions", ListChecks],
              ["Observatory", BrainCircuit],
            ].map(([label, Icon], index) => {
              const ItemIcon = Icon as LucideIcon;
              return (
                <div
                  key={label as string}
                  className={cn(
                    "flex h-11 items-center gap-2 rounded-md px-3 text-sm",
                    index === 0
                      ? "bg-[#ebe9df] text-[#070808]"
                      : "text-[#b1b3b5]"
                  )}
                >
                  <ItemIcon className="size-4" />
                  {label as string}
                </div>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0 p-0 xl:pl-5">
          <div className="grid h-full grid-rows-[auto_1fr] rounded-md border border-white/10 bg-[#0e1218]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <div className="text-xs font-semibold text-[#abc275]">guided tour</div>
                <h2 className="text-2xl font-semibold">Command operating view</h2>
              </div>
              <StepRail active={1} total={4} />
            </div>

            <div className="grid gap-4 p-5 xl:grid-cols-[1fr_360px]">
              <div className="grid content-start gap-4">
                <TourPanel title="Customer rollout brief" icon={FileText}>
                  <div className="space-y-3">
                    <SignalRow label="Risk summary" value="3 open risks" tone="warn" />
                    <SignalRow label="Evidence" value="8 linked sources" />
                    <SignalRow label="Next action" value="approval required" tone="info" />
                  </div>
                </TourPanel>
                <div className="grid gap-4 md:grid-cols-2">
                  <TourPanel title="Pipeline forecast" icon={BarChart3}>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {[62, 74, 48, 82].map((height, index) => (
                        <div key={index} className="flex h-24 items-end rounded-md bg-white/[0.04] p-2">
                          <div
                            className="w-full rounded-sm bg-[#abc275]"
                            style={{ height: `${height}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </TourPanel>
                  <TourPanel title="Object schema" icon={Network}>
                    <MiniGraph />
                  </TourPanel>
                </div>
              </div>

              <TourPanel title="Controls" icon={SlidersHorizontal}>
                <div className="space-y-3">
                  <ControlLine label="Runtime" value="Azure managed" />
                  <ControlLine label="MCP context" value="Sources + OAG" />
                  <ControlLine label="Policy" value="review gated" />
                  <ControlLine label="Memory" value="Company Brain" />
                </div>
              </TourPanel>
            </div>
          </div>
        </section>
      </div>
    </MockupFrame>
  );
}

function CommandMockup() {
  return (
    <CommandShell active="Command">
      <div className="flex min-h-[760px] flex-col bg-[#0b0e13]">
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-5 py-10">
          <div className="mb-5 text-center">
            <div className="text-xs font-semibold text-[#abc275]">Optale Command</div>
            <h2 className="mt-2 text-3xl font-semibold">What should Command inspect?</h2>
          </div>

          <div className="rounded-md border border-white/10 bg-[#11161d] p-3 shadow-2xl shadow-black/35">
            <textarea
              className="h-28 w-full resize-none bg-transparent p-2 text-base text-[#ebe9df] outline-none placeholder:text-[#746e66]"
              placeholder="Ask Command to review, draft, inspect, or prepare an action..."
              readOnly
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
              <ContextChip icon={Bot} label="Agent" value="Command Lead" />
              <ContextChip icon={Database} label="MCP" value="Sources + OAG" />
              <ContextChip icon={LockKeyhole} label="Scope" value="Company Brain" />
              <button
                type="button"
                className="ml-auto inline-flex h-10 items-center gap-2 rounded-md bg-[#ebe9df] px-4 text-sm font-semibold text-[#070808]"
              >
                <Send className="size-4" />
                Send
              </button>
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 text-sm text-[#b1b3b5]"
            >
              <ListChecks className="size-4" />
              Open prompt library
              <ChevronDown className="size-4" />
            </button>
          </div>
        </div>

        <section className="border-t border-white/10 px-5 py-5">
          <div className="grid gap-3 md:grid-cols-3">
            <VisibilityTile icon={Boxes} label="Objects" value="41 mapped" />
            <VisibilityTile icon={ListChecks} label="Actions" value="3 pending" />
            <VisibilityTile icon={BrainCircuit} label="Observatory" value="4 signals" />
          </div>
        </section>
      </div>
    </CommandShell>
  );
}

function ObjectsMockup() {
  return (
    <CommandShell active="Objects">
      <div className="grid min-h-[760px] bg-[#0b0e13] xl:grid-cols-[1fr_360px]">
        <section className="min-w-0 border-r border-white/10">
          <SurfaceHeader
            label="Object Registry"
            detail="Business objects, relationships, evidence, and OAG schema."
            icon={Boxes}
          />
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <SearchBox placeholder="Search objects" />
              <FilterButton label="All types" />
              <FilterButton label="At risk" />
              <FilterButton label="Owner" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs text-[#8a8c8e]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Owner</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Evidence</th>
                  <th className="px-5 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {OBJECT_ROWS.map((row, index) => (
                  <tr
                    key={row.name}
                    className={cn(
                      "border-b border-white/10",
                      index === 0 ? "bg-[#abc275]/10" : "hover:bg-white/[0.03]"
                    )}
                  >
                    <td className="px-5 py-4 font-semibold">{row.name}</td>
                    <td className="px-3 py-4 text-[#b1b3b5]">{row.type}</td>
                    <td className="px-3 py-4 text-[#b1b3b5]">{row.owner}</td>
                    <td className="px-3 py-4">
                      <StatusPill value={row.status} />
                    </td>
                    <td className="px-3 py-4 text-[#b1b3b5]">{row.evidence}</td>
                    <td className="px-5 py-4 text-[#8a8c8e]">{row.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <InspectorPanel />
      </div>
    </CommandShell>
  );
}

function ActionsMockup() {
  return (
    <CommandShell active="Actions">
      <div className="min-h-[760px] bg-[#0b0e13]">
        <SurfaceHeader
          label="Review Queue"
          detail="Approvals, checkpoints, and governed actions before execution."
          icon={ListChecks}
        />
        <div className="grid gap-4 border-b border-white/10 px-5 py-4 md:grid-cols-4">
          <MetricCard label="Pending" value="3" tone="warn" />
          <MetricCard label="Checkpoints" value="1" tone="info" />
          <MetricCard label="Executed today" value="8" />
          <MetricCard label="Denied" value="0" />
        </div>
        <div className="flex flex-wrap gap-2 border-b border-white/10 px-5 py-3">
          {["Review", "Runs", "Policy", "Lineage", "Audit", "Catalog"].map((tab, index) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "h-9 rounded-md border px-3 text-sm font-semibold",
                index === 0
                  ? "border-[#abc275] bg-[#abc275] text-[#070808]"
                  : "border-white/10 bg-white/[0.035] text-[#b1b3b5]"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="grid gap-3 p-5">
          {ACTION_ITEMS.map((item) => (
            <ActionReviewRow key={item.label} item={item} />
          ))}
        </div>
      </div>
    </CommandShell>
  );
}

function AgentsMockup() {
  return (
    <CommandShell active="Agents">
      <div className="grid min-h-[760px] bg-[#0b0e13] xl:grid-cols-[1fr_360px]">
        <section className="min-w-0 border-r border-white/10">
          <SurfaceHeader
            label="Agent Roster"
            detail="Operating roles, schedules, and runtime readiness in one place."
            icon={Bot}
          />
          <div className="grid gap-3 border-b border-white/10 px-5 py-4 md:grid-cols-3">
            <MetricCard label="Agents" value="13" />
            <MetricCard label="Active" value="4" tone="good" />
            <MetricCard label="Schedules" value="6" tone="info" />
          </div>
          <div className="grid gap-3 p-5">
            {AGENT_ROWS.map((agent) => (
              <AgentRosterRow key={agent.name} agent={agent} />
            ))}
          </div>
        </section>

        <aside className="p-5">
          <h3 className="text-lg font-semibold">Today</h3>
          <div className="mt-4 space-y-3">
            <ScheduleBlock time="09:00" label="Daily command review" owner="Command Lead" />
            <ScheduleBlock time="11:30" label="Source evidence sweep" owner="Research Analyst" />
            <ScheduleBlock time="15:00" label="Approval queue check" owner="Policy Reviewer" />
          </div>
          <div className="mt-6 rounded-md border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Settings2 className="size-4 text-[#abc275]" />
              Operator diagnostics
            </div>
            <p className="mt-2 text-sm leading-5 text-[#b1b3b5]">
              Harness projection tables live behind admin detail views, not the roster overview.
            </p>
          </div>
        </aside>
      </div>
    </CommandShell>
  );
}

function ObservatoryMockup() {
  return (
    <CommandShell active="Observatory">
      <div className="min-h-[760px] bg-[#0b0e13]">
        <SurfaceHeader
          label="Observatory"
          detail="Sources, graph, approvals, checkpoints, policy, and traces."
          icon={BrainCircuit}
        />
        <div className="flex flex-wrap gap-2 border-b border-white/10 px-5 py-3">
          {["Sources", "Graph", "Review", "Policy", "Traces"].map((tab, index) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "h-9 rounded-md border px-3 text-sm font-semibold",
                index === 1
                  ? "border-[#abc275] bg-[#abc275] text-[#070808]"
                  : "border-white/10 bg-white/[0.035] text-[#b1b3b5]"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="grid gap-4 p-5 xl:grid-cols-[1fr_360px]">
          <section className="rounded-md border border-white/10 bg-[#11161d] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Knowledge graph</h3>
                <p className="text-sm text-[#b1b3b5]">
                  Entity and object relationships from Sources and OAG.
                </p>
              </div>
              <StatusPill value="Live preview" />
            </div>
            <div className="mt-5 min-h-[360px] rounded-md border border-white/10 bg-[#090c11] p-4">
              <LargeGraph />
            </div>
          </section>

          <aside className="space-y-3">
            {OBSERVATORY_SOURCES.map((source) => (
              <SourceTile key={source.label} source={source} />
            ))}
          </aside>
        </div>
      </div>
    </CommandShell>
  );
}

function CommandShell({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}) {
  const sections = [
    ["Command", MessageSquare],
    ["Tasks", SquareKanban],
    ["Objects", Boxes],
    ["Actions", ListChecks],
    ["Observatory", BrainCircuit],
    ["Agents", Bot],
  ] as const;

  return (
    <MockupFrame>
      <div className="flex min-h-[760px] bg-[#0b0e13]">
        <aside className="hidden w-[260px] shrink-0 border-r border-white/10 bg-[#0e1218] p-3 md:block">
          <BrandMark />
          <div className="mt-5 grid grid-cols-2 gap-2">
            {sections.map(([label, Icon]) => (
              <button
                key={label}
                type="button"
                className={cn(
                  "min-h-14 rounded-md border px-3 text-left",
                  active === label
                    ? "border-[#abc275]/55 bg-[#abc275]/12 text-white"
                    : "border-white/10 bg-white/[0.025] text-[#b1b3b5]"
                )}
              >
                <Icon className="mb-1 size-4" />
                <span className="block text-xs font-semibold">{label}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-md border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Archive className="size-4 text-[#abc275]" />
              Sources
            </div>
            <div className="mt-3 space-y-2 text-sm text-[#b1b3b5]">
              <div>Vault sources</div>
              <div>Agent roster</div>
              <div>Task lanes</div>
            </div>
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </MockupFrame>
  );
}

function MockupFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1440px] overflow-hidden rounded-[2px] border border-white/10 bg-[#0b0e13] shadow-2xl shadow-black/40">
      {children}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 place-items-center rounded-md border border-[#abc275]/45 bg-[#abc275]/10 text-[#abc275]">
        <Command className="size-4" />
      </div>
      <div>
        <div className="text-sm font-semibold text-white">Optale</div>
        <div className="text-xs text-[#8a8c8e]">Command</div>
      </div>
    </div>
  );
}

function StepRail({ active, total }: { active: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label="Progress">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 w-8 rounded-[1px]",
            index < active ? "bg-[#abc275]" : "bg-white/12"
          )}
        />
      ))}
    </div>
  );
}

function TourPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-[#abc275]" />
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SignalRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | "info";
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-[#0b0e13] px-3 py-2 text-sm">
      <span className="text-[#b1b3b5]">{label}</span>
      <span
        className={cn(
          "font-semibold",
          tone === "warn" ? "text-[#f2c16b]" : tone === "info" ? "text-[#9ab8ff]" : "text-white"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ControlLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-[#0b0e13] p-3">
      <div className="text-xs text-[#8a8c8e]">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function MiniGraph() {
  return (
    <div className="relative h-40 rounded-md bg-[#0b0e13]">
      <GraphNode className="left-[8%] top-[40%]" label="Account" />
      <GraphNode className="left-[46%] top-[14%]" label="Project" />
      <GraphNode className="left-[58%] top-[62%]" label="Action" />
      <GraphLine className="left-[24%] top-[45%] w-[34%] rotate-[-22deg]" />
      <GraphLine className="left-[55%] top-[45%] w-[24%] rotate-[58deg]" />
    </div>
  );
}

function LargeGraph() {
  return (
    <div className="relative min-h-[330px]">
      <GraphNode className="left-[8%] top-[42%]" label="Account" large />
      <GraphNode className="left-[34%] top-[18%]" label="Rollout" large />
      <GraphNode className="left-[36%] top-[66%]" label="Source" />
      <GraphNode className="left-[68%] top-[34%]" label="Action" large />
      <GraphNode className="left-[72%] top-[70%]" label="Policy" />
      <GraphLine className="left-[20%] top-[42%] w-[24%] rotate-[-28deg]" />
      <GraphLine className="left-[20%] top-[55%] w-[24%] rotate-[28deg]" />
      <GraphLine className="left-[48%] top-[32%] w-[25%] rotate-[16deg]" />
      <GraphLine className="left-[50%] top-[72%] w-[25%] rotate-[0deg]" />
    </div>
  );
}

function GraphNode({
  className,
  label,
  large,
}: {
  className?: string;
  label: string;
  large?: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute z-10 grid place-items-center rounded-md border border-[#abc275]/55 bg-[#11161d] px-3 py-2 text-xs font-semibold shadow-lg shadow-black/30",
        large ? "min-h-16 min-w-28" : "min-h-11 min-w-24",
        className
      )}
    >
      {label}
    </div>
  );
}

function GraphLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "absolute h-px origin-left bg-[#abc275]/45",
        className
      )}
    />
  );
}

function ContextChip({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-[#0b0e13] px-3 text-left"
    >
      <Icon className="size-4 text-[#abc275]" />
      <span>
        <span className="block text-[10px] text-[#8a8c8e]">{label}</span>
        <span className="block text-xs font-semibold text-[#ebe9df]">{value}</span>
      </span>
      <ChevronDown className="size-3.5 text-[#8a8c8e]" />
    </button>
  );
}

function VisibilityTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <Icon className="size-4 text-[#abc275]" />
      <div className="mt-3 text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs text-[#b1b3b5]">{value}</div>
    </div>
  );
}

function SurfaceHeader({
  label,
  detail,
  icon: Icon,
}: {
  label: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <header className="flex min-h-24 items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#abc275]">
          <Icon className="size-3.5" />
          Optale Command
        </div>
        <h2 className="mt-2 text-2xl font-semibold">{label}</h2>
        <p className="mt-1 max-w-2xl text-sm text-[#b1b3b5]">{detail}</p>
      </div>
      <button
        type="button"
        className="hidden h-10 items-center gap-2 rounded-md border border-white/10 px-3 text-sm text-[#b1b3b5] md:inline-flex"
      >
        <RefreshCcw className="size-4" />
        Refresh
      </button>
    </header>
  );
}

function SearchBox({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex h-10 min-w-[260px] flex-1 items-center gap-2 rounded-md border border-white/10 bg-[#11161d] px-3 text-sm text-[#8a8c8e]">
      <Search className="size-4" />
      {placeholder}
    </div>
  );
}

function FilterButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 text-sm text-[#b1b3b5]"
    >
      <Filter className="size-4" />
      {label}
    </button>
  );
}

function StatusPill({ value }: { value: string }) {
  const lower = value.toLowerCase();
  const tone =
    lower.includes("risk") || lower.includes("checkpoint")
      ? "warn"
      : lower.includes("healthy") || lower.includes("live")
        ? "good"
        : lower.includes("review") || lower.includes("pending")
          ? "info"
          : "default";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border px-2 text-xs font-semibold",
        tone === "warn"
          ? "border-[#f2c16b]/35 bg-[#f2c16b]/10 text-[#f2c16b]"
          : tone === "good"
            ? "border-[#9bd9b1]/35 bg-[#9bd9b1]/10 text-[#9bd9b1]"
            : tone === "info"
              ? "border-[#9ab8ff]/35 bg-[#9ab8ff]/10 text-[#9ab8ff]"
              : "border-white/10 bg-white/[0.04] text-[#b1b3b5]"
      )}
    >
      {value}
    </span>
  );
}

function InspectorPanel() {
  return (
    <aside className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-[#abc275]">Inspector</div>
          <h3 className="mt-2 text-xl font-semibold">Acme rollout</h3>
          <p className="mt-1 text-sm text-[#b1b3b5]">Project object</p>
        </div>
        <StatusPill value="At risk" />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <MetricCard label="Sources" value="8" />
        <MetricCard label="Actions" value="3" tone="warn" />
      </div>

      <div className="mt-5 flex gap-2">
        {["Overview", "Relations", "Schema", "Activity"].map((tab, index) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "h-8 rounded-md px-2 text-xs font-semibold",
              index === 1 ? "bg-[#abc275] text-[#070808]" : "bg-white/[0.05] text-[#b1b3b5]"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <RelationRow label="Northstar account" meta="customer account" />
        <RelationRow label="DPA approval" meta="required policy" />
        <RelationRow label="Implementation checkpoint" meta="pending action" />
      </div>
    </aside>
  );
}

function MetricCard({ label, value, tone }: Metric) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div
        className={cn(
          "text-2xl font-semibold",
          tone === "warn" ? "text-[#f2c16b]" : tone === "good" ? "text-[#9bd9b1]" : tone === "info" ? "text-[#9ab8ff]" : "text-white"
        )}
      >
        {value}
      </div>
      <div className="text-xs text-[#b1b3b5]">{label}</div>
    </div>
  );
}

function RelationRow({ label, meta }: { label: string; meta: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs text-[#b1b3b5]">{meta}</div>
    </div>
  );
}

function ActionReviewRow({
  item,
}: {
  item: {
    label: string;
    detail: string;
    owner: string;
    risk: string;
    state: string;
  };
}) {
  return (
    <div className="grid gap-4 rounded-md border border-white/10 bg-white/[0.035] p-4 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{item.label}</h3>
          <StatusPill value={item.state} />
          <StatusPill value={item.risk} />
        </div>
        <p className="mt-2 text-sm text-[#b1b3b5]">{item.detail}</p>
        <div className="mt-3 text-xs text-[#8a8c8e]">Owner: {item.owner}</div>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <button
          type="button"
          className="h-9 rounded-md border border-white/10 px-3 text-sm text-[#b1b3b5]"
        >
          Deny
        </button>
        <button
          type="button"
          className="h-9 rounded-md bg-[#abc275] px-3 text-sm font-semibold text-[#070808]"
        >
          Approve
        </button>
      </div>
    </div>
  );
}

function AgentRosterRow({
  agent,
}: {
  agent: {
    name: string;
    role: string;
    state: string;
    icon: LucideIcon;
  };
}) {
  const Icon = agent.icon;
  return (
    <div className="grid gap-3 rounded-md border border-white/10 bg-white/[0.035] p-4 md:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-md border border-[#abc275]/35 bg-[#abc275]/10 text-[#abc275]">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold">{agent.name}</div>
          <div className="mt-1 text-sm text-[#b1b3b5]">{agent.role}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <StatusPill value={agent.state} />
        <button
          type="button"
          className="h-9 rounded-md border border-white/10 px-3 text-sm text-[#b1b3b5]"
        >
          Details
        </button>
      </div>
    </div>
  );
}

function ScheduleBlock({
  time,
  label,
  owner,
}: {
  time: string;
  label: string;
  owner: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="text-xs text-[#abc275]">{time}</div>
      <div className="mt-1 text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs text-[#b1b3b5]">{owner}</div>
    </div>
  );
}

function SourceTile({
  source,
}: {
  source: {
    label: string;
    detail: string;
    state: string;
    icon: LucideIcon;
  };
}) {
  const Icon = source.icon;
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Icon className="mt-0.5 size-4 shrink-0 text-[#abc275]" />
          <div className="min-w-0">
            <div className="font-semibold">{source.label}</div>
            <div className="mt-1 text-sm text-[#b1b3b5]">{source.detail}</div>
          </div>
        </div>
        <span className="shrink-0 text-xs text-[#abc275]">{source.state}</span>
      </div>
    </div>
  );
}

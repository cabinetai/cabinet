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
  FileCheck2,
  FileText,
  Filter,
  GitBranch,
  Handshake,
  ListChecks,
  LockKeyhole,
  MessageSquare,
  MessagesSquare,
  Network,
  PanelRight,
  RefreshCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  SquareKanban,
  Wrench,
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

const PLAYBOOKS = [
  {
    label: "Customer Onboarding",
    detail: "rollout, owners, evidence",
    icon: Handshake,
  },
  {
    label: "Compliance Review",
    detail: "policy, audit, decisions",
    icon: ShieldCheck,
  },
  {
    label: "Revenue Operations",
    detail: "pipeline, risks, next actions",
    icon: BarChart3,
  },
  {
    label: "Source Evidence Desk",
    detail: "citations, files, lineage",
    icon: FileCheck2,
  },
  {
    label: "Action Approval Queue",
    detail: "review, satisfy, execute",
    icon: ClipboardCheck,
  },
  {
    label: "Implementation Control",
    detail: "scope, blockers, readiness",
    icon: Network,
  },
];

const ROLE_GROUPS = [
  {
    label: "Operations",
    roles: [
      { label: "Command Lead", icon: Command, active: true, required: true },
      { label: "Delivery Owner", icon: BriefcaseBusiness, active: true },
      { label: "Policy Reviewer", icon: ShieldCheck, active: true, required: true },
    ],
  },
  {
    label: "Context",
    roles: [
      { label: "Research Analyst", icon: Search, active: true },
      { label: "Source Curator", icon: FileText, active: true },
      { label: "Memory Steward", icon: Database, active: false },
    ],
  },
  {
    label: "Execution",
    roles: [
      { label: "Workflow Builder", icon: Wrench, active: false },
      { label: "Code Specialist", icon: Code2, active: true },
      { label: "Partner Comms", icon: MessagesSquare, active: false },
    ],
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
    <main className="min-h-screen bg-[#07090c] text-[#f7f4ee]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[300px] shrink-0 border-r border-white/10 bg-[#0b0e13] p-4 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <div className="grid size-9 place-items-center rounded-md border border-[#d7b56d]/45 bg-[#d7b56d]/10 text-[#d7b56d]">
              <Command className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">Optale Command</div>
              <div className="text-xs text-[#b5aea2]">UX alignment route</div>
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
                      ? "bg-[#f7f4ee] text-[#0b0e13]"
                      : "text-[#d7d2ca] hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span
                      className={cn(
                        "block text-xs",
                        selected ? "text-[#45413b]" : "text-[#8e887f]"
                      )}
                    >
                      {item.detail}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto rounded-md border border-white/10 bg-white/[0.035] p-3 text-xs leading-5 text-[#b5aea2]">
            Design target only. Production data wiring and Agent Harness files stay out of this slice.
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex min-h-16 items-center justify-between border-b border-white/10 px-4 md:px-6">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#d7b56d]">
                {active.detail}
              </div>
              <h1 className="truncate text-xl font-semibold md:text-2xl">
                {active.label}
              </h1>
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-[#d7d2ca] md:flex">
              <Circle className="size-2 fill-[#d7b56d] text-[#d7b56d]" />
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
                        ? "border-[#d7b56d] bg-[#d7b56d] text-[#11100d]"
                        : "border-white/10 bg-white/[0.035] text-[#d7d2ca]"
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
      <div className="grid min-h-[760px] grid-rows-[auto_1fr_auto] bg-[#0b0e13]">
        <div className="border-b border-white/10 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <BrandMark />
            <StepRail active={2} total={5} />
          </div>
        </div>

        <div className="grid gap-6 p-5 xl:grid-cols-[380px_1fr]">
          <section className="flex flex-col justify-center">
            <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-md border border-[#d7b56d]/35 bg-[#d7b56d]/10 px-3 py-1 text-xs font-semibold text-[#d7b56d]">
              <BriefcaseBusiness className="size-3.5" />
              business workspace
            </div>
            <h2 className="max-w-sm text-4xl font-semibold leading-tight">
              Configure operating roles.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-[#b5aea2]">
              Start with a controlled business roster. Required roles are included in
              the launch count and every role maps to a reviewable capability set.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-2">
              <MetricTile label="roles" value="6" />
              <MetricTile label="required" value="2" tone="warn" />
              <MetricTile label="playbooks" value="12" tone="info" />
            </div>
          </section>

          <section className="min-w-0">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {PLAYBOOKS.map((playbook, index) => (
                <PlaybookTile
                  key={playbook.label}
                  active={index === 0}
                  icon={playbook.icon}
                  label={playbook.label}
                  detail={playbook.detail}
                />
              ))}
            </div>

            <div className="mt-6 grid gap-3 xl:grid-cols-3">
              {ROLE_GROUPS.map((group) => (
                <RoleGroup key={group.label} label={group.label} roles={group.roles} />
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
          <button
            type="button"
            className="h-10 rounded-md border border-white/10 px-4 text-sm text-[#d7d2ca]"
          >
            Back
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#d7b56d] px-5 text-sm font-semibold text-[#11100d]"
          >
            Continue
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </MockupFrame>
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
                      ? "bg-[#f7f4ee] text-[#11100d]"
                      : "text-[#b5aea2]"
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
                <div className="text-xs font-semibold text-[#d7b56d]">guided tour</div>
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
                            className="w-full rounded-sm bg-[#d7b56d]"
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
            <div className="text-xs font-semibold text-[#d7b56d]">Optale Command</div>
            <h2 className="mt-2 text-3xl font-semibold">What should Command inspect?</h2>
          </div>

          <div className="rounded-md border border-white/10 bg-[#11161d] p-3 shadow-2xl shadow-black/35">
            <textarea
              className="h-28 w-full resize-none bg-transparent p-2 text-base text-[#f7f4ee] outline-none placeholder:text-[#746e66]"
              placeholder="Ask Command to review, draft, inspect, or prepare an action..."
              readOnly
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
              <ContextChip icon={Bot} label="Agent" value="Command Lead" />
              <ContextChip icon={Database} label="MCP" value="Sources + OAG" />
              <ContextChip icon={LockKeyhole} label="Scope" value="Company Brain" />
              <button
                type="button"
                className="ml-auto inline-flex h-10 items-center gap-2 rounded-md bg-[#f7f4ee] px-4 text-sm font-semibold text-[#11100d]"
              >
                <Send className="size-4" />
                Send
              </button>
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 text-sm text-[#d7d2ca]"
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
              <thead className="border-b border-white/10 text-xs text-[#8e887f]">
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
                      index === 0 ? "bg-[#d7b56d]/10" : "hover:bg-white/[0.03]"
                    )}
                  >
                    <td className="px-5 py-4 font-semibold">{row.name}</td>
                    <td className="px-3 py-4 text-[#d7d2ca]">{row.type}</td>
                    <td className="px-3 py-4 text-[#d7d2ca]">{row.owner}</td>
                    <td className="px-3 py-4">
                      <StatusPill value={row.status} />
                    </td>
                    <td className="px-3 py-4 text-[#d7d2ca]">{row.evidence}</td>
                    <td className="px-5 py-4 text-[#8e887f]">{row.updated}</td>
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
                  ? "border-[#d7b56d] bg-[#d7b56d] text-[#11100d]"
                  : "border-white/10 bg-white/[0.035] text-[#d7d2ca]"
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
              <Settings2 className="size-4 text-[#d7b56d]" />
              Operator diagnostics
            </div>
            <p className="mt-2 text-sm leading-5 text-[#b5aea2]">
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
                  ? "border-[#d7b56d] bg-[#d7b56d] text-[#11100d]"
                  : "border-white/10 bg-white/[0.035] text-[#d7d2ca]"
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
                <p className="text-sm text-[#b5aea2]">
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
                    ? "border-[#d7b56d]/55 bg-[#d7b56d]/12 text-white"
                    : "border-white/10 bg-white/[0.025] text-[#b5aea2]"
                )}
              >
                <Icon className="mb-1 size-4" />
                <span className="block text-xs font-semibold">{label}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-md border border-white/10 bg-white/[0.035] p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Archive className="size-4 text-[#d7b56d]" />
              Sources
            </div>
            <div className="mt-3 space-y-2 text-sm text-[#b5aea2]">
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
    <div className="mx-auto max-w-[1440px] overflow-hidden rounded-md border border-white/10 bg-[#0b0e13] shadow-2xl shadow-black/40">
      {children}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 place-items-center rounded-md border border-[#d7b56d]/45 bg-[#d7b56d]/10 text-[#d7b56d]">
        <Command className="size-4" />
      </div>
      <div>
        <div className="text-sm font-semibold text-white">Optale</div>
        <div className="text-xs text-[#8e887f]">Command</div>
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
            "h-1.5 w-8 rounded-full",
            index < active ? "bg-[#d7b56d]" : "bg-white/12"
          )}
        />
      ))}
    </div>
  );
}

function MetricTile({ label, value, tone }: Metric) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div
        className={cn(
          "text-xs",
          tone === "warn" ? "text-[#f2c16b]" : tone === "info" ? "text-[#9ab8ff]" : "text-[#b5aea2]"
        )}
      >
        {label}
      </div>
    </div>
  );
}

function PlaybookTile({
  active,
  icon: Icon,
  label,
  detail,
}: {
  active?: boolean;
  icon: LucideIcon;
  label: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "min-h-[118px] rounded-md border p-4 text-left transition-colors",
        active
          ? "border-[#d7b56d]/65 bg-[#d7b56d]/12"
          : "border-white/10 bg-white/[0.035] hover:bg-white/[0.06]"
      )}
    >
      <Icon className="size-5 text-[#d7b56d]" />
      <div className="mt-4 text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs leading-5 text-[#b5aea2]">{detail}</div>
    </button>
  );
}

function RoleGroup({
  label,
  roles,
}: {
  label: string;
  roles: Array<{
    label: string;
    icon: LucideIcon;
    active: boolean;
    required?: boolean;
  }>;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="mb-3 text-xs font-semibold text-[#d7b56d]">{label}</div>
      <div className="space-y-2">
        {roles.map((role) => {
          const Icon = role.icon;
          return (
            <button
              key={role.label}
              type="button"
              className={cn(
                "flex min-h-10 w-full items-center gap-2 rounded-md border px-3 text-left text-sm",
                role.active
                  ? "border-[#d7b56d]/55 bg-[#d7b56d]/10 text-white"
                  : "border-white/10 bg-[#0b0e13] text-[#b5aea2]"
              )}
            >
              <Icon className="size-4 shrink-0 text-[#d7b56d]" />
              <span className="min-w-0 flex-1 truncate">{role.label}</span>
              {role.required ? (
                <span className="text-[10px] font-semibold text-[#d7b56d]">
                  required
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
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
        <Icon className="size-4 text-[#d7b56d]" />
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
      <span className="text-[#b5aea2]">{label}</span>
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
      <div className="text-xs text-[#8e887f]">{label}</div>
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
        "absolute z-10 grid place-items-center rounded-md border border-[#d7b56d]/55 bg-[#11161d] px-3 py-2 text-xs font-semibold shadow-lg shadow-black/30",
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
        "absolute h-px origin-left bg-[#d7b56d]/45",
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
      <Icon className="size-4 text-[#d7b56d]" />
      <span>
        <span className="block text-[10px] text-[#8e887f]">{label}</span>
        <span className="block text-xs font-semibold text-[#f7f4ee]">{value}</span>
      </span>
      <ChevronDown className="size-3.5 text-[#8e887f]" />
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
      <Icon className="size-4 text-[#d7b56d]" />
      <div className="mt-3 text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs text-[#b5aea2]">{value}</div>
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
        <div className="flex items-center gap-2 text-xs font-semibold text-[#d7b56d]">
          <Icon className="size-3.5" />
          Optale Command
        </div>
        <h2 className="mt-2 text-2xl font-semibold">{label}</h2>
        <p className="mt-1 max-w-2xl text-sm text-[#b5aea2]">{detail}</p>
      </div>
      <button
        type="button"
        className="hidden h-10 items-center gap-2 rounded-md border border-white/10 px-3 text-sm text-[#d7d2ca] md:inline-flex"
      >
        <RefreshCcw className="size-4" />
        Refresh
      </button>
    </header>
  );
}

function SearchBox({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex h-10 min-w-[260px] flex-1 items-center gap-2 rounded-md border border-white/10 bg-[#11161d] px-3 text-sm text-[#8e887f]">
      <Search className="size-4" />
      {placeholder}
    </div>
  );
}

function FilterButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 text-sm text-[#d7d2ca]"
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
              : "border-white/10 bg-white/[0.04] text-[#d7d2ca]"
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
          <div className="text-xs font-semibold text-[#d7b56d]">Inspector</div>
          <h3 className="mt-2 text-xl font-semibold">Acme rollout</h3>
          <p className="mt-1 text-sm text-[#b5aea2]">Project object</p>
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
              index === 1 ? "bg-[#d7b56d] text-[#11100d]" : "bg-white/[0.05] text-[#d7d2ca]"
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
      <div className="text-xs text-[#b5aea2]">{label}</div>
    </div>
  );
}

function RelationRow({ label, meta }: { label: string; meta: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs text-[#b5aea2]">{meta}</div>
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
        <p className="mt-2 text-sm text-[#b5aea2]">{item.detail}</p>
        <div className="mt-3 text-xs text-[#8e887f]">Owner: {item.owner}</div>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <button
          type="button"
          className="h-9 rounded-md border border-white/10 px-3 text-sm text-[#d7d2ca]"
        >
          Deny
        </button>
        <button
          type="button"
          className="h-9 rounded-md bg-[#d7b56d] px-3 text-sm font-semibold text-[#11100d]"
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
        <div className="grid size-10 shrink-0 place-items-center rounded-md border border-[#d7b56d]/35 bg-[#d7b56d]/10 text-[#d7b56d]">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold">{agent.name}</div>
          <div className="mt-1 text-sm text-[#b5aea2]">{agent.role}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <StatusPill value={agent.state} />
        <button
          type="button"
          className="h-9 rounded-md border border-white/10 px-3 text-sm text-[#d7d2ca]"
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
      <div className="text-xs text-[#d7b56d]">{time}</div>
      <div className="mt-1 text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs text-[#b5aea2]">{owner}</div>
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
          <Icon className="mt-0.5 size-4 shrink-0 text-[#d7b56d]" />
          <div className="min-w-0">
            <div className="font-semibold">{source.label}</div>
            <div className="mt-1 text-sm text-[#b5aea2]">{source.detail}</div>
          </div>
        </div>
        <span className="shrink-0 text-xs text-[#d7b56d]">{source.state}</span>
      </div>
    </div>
  );
}

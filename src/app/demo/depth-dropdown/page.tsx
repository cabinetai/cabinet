"use client";

import { useState } from "react";
import {
  Archive,
  BookOpen,
  Users,
  SquareKanban,
  ChevronDown,
  Layers,
  Layers3,
  FolderTree,
  ListTree,
  Network,
  Boxes,
  Telescope,
  Focus,
  ScanSearch,
  Workflow,
  Check,
  Plus,
  Bot,
  Clock3,
  HeartPulse,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CABINET_VISIBILITY_OPTIONS } from "@/lib/cabinets/visibility";
import type { CabinetVisibilityMode } from "@/types/cabinets";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────── */
/* Shared menu content — same for every variant                   */
/* ────────────────────────────────────────────────────────────── */
function DepthMenuItems({
  mode,
  onChange,
}: {
  mode: CabinetVisibilityMode;
  onChange: (mode: CabinetVisibilityMode) => void;
}) {
  return (
    <>
      {CABINET_VISIBILITY_OPTIONS.map((opt) => {
        const active = opt.value === mode;
        return (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="flex items-center justify-between gap-3 py-1.5"
          >
            <span className="flex items-center gap-2">
              <span className="inline-flex w-6 shrink-0 justify-center text-[11px] font-semibold tabular-nums text-muted-foreground">
                {opt.shortLabel}
              </span>
              <span className="text-[12.5px]">{opt.label}</span>
            </span>
            {active && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Trigger variants — same dropdown, different trigger looks      */
/* ────────────────────────────────────────────────────────────── */

/** A — Bordered pill (current tasks-board DepthDropdown, unchanged) */
function TriggerA({ mode, compact }: { mode: CabinetVisibilityMode; compact?: boolean }) {
  const current =
    CABINET_VISIBILITY_OPTIONS.find((o) => o.value === mode) ??
    CABINET_VISIBILITY_OPTIONS[0];
  return (
    <DropdownMenuTrigger
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/60 font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]"
      )}
      title={current.label}
    >
      <Layers className={compact ? "size-3" : "size-3.5"} />
      <span className="tabular-nums">{current.shortLabel}</span>
      <ChevronDown className="size-3 opacity-60" />
    </DropdownMenuTrigger>
  );
}

/** B — Ghost minimal (no border, hover-bg only) */
function TriggerB({ mode, compact }: { mode: CabinetVisibilityMode; compact?: boolean }) {
  const current =
    CABINET_VISIBILITY_OPTIONS.find((o) => o.value === mode) ??
    CABINET_VISIBILITY_OPTIONS[0];
  return (
    <DropdownMenuTrigger
      className={cn(
        "inline-flex items-center gap-1 rounded font-medium text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground data-[popup-open]:bg-muted/60 data-[popup-open]:text-foreground",
        compact ? "px-1 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[11px]"
      )}
      title={current.label}
    >
      <Layers className={compact ? "size-3" : "size-3.5"} />
      <span className="tabular-nums">{current.shortLabel}</span>
      <ChevronDown className="size-3 opacity-60" />
    </DropdownMenuTrigger>
  );
}

/** C — Text chip (no icon, uppercase shortLabel + chevron) */
function TriggerC({ mode, compact }: { mode: CabinetVisibilityMode; compact?: boolean }) {
  const current =
    CABINET_VISIBILITY_OPTIONS.find((o) => o.value === mode) ??
    CABINET_VISIBILITY_OPTIONS[0];
  return (
    <DropdownMenuTrigger
      className={cn(
        "inline-flex items-center gap-0.5 rounded font-semibold uppercase tracking-wide text-muted-foreground/70 transition-colors hover:bg-muted/50 hover:text-foreground data-[popup-open]:bg-muted/60 data-[popup-open]:text-foreground",
        compact ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]"
      )}
      title={current.label}
    >
      <span className="tabular-nums">{current.shortLabel}</span>
      <ChevronDown className="size-3 opacity-70" />
    </DropdownMenuTrigger>
  );
}

/** D — Soft capsule (rounded-full pill with muted bg) */
function TriggerD({ mode, compact }: { mode: CabinetVisibilityMode; compact?: boolean }) {
  const current =
    CABINET_VISIBILITY_OPTIONS.find((o) => o.value === mode) ??
    CABINET_VISIBILITY_OPTIONS[0];
  return (
    <DropdownMenuTrigger
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted/50 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ring-1 ring-border/40",
        compact ? "px-1.5 py-[1px] text-[10px]" : "px-2 py-0.5 text-[11px]"
      )}
      title={current.label}
    >
      <Layers className={compact ? "size-3" : "size-3.5"} />
      <span className="tabular-nums">{current.shortLabel}</span>
      <ChevronDown className="size-3 opacity-60" />
    </DropdownMenuTrigger>
  );
}

/** E — Labeled (shows "Depth: +1" with icon, most explicit) */
function TriggerE({ mode, compact }: { mode: CabinetVisibilityMode; compact?: boolean }) {
  const current =
    CABINET_VISIBILITY_OPTIONS.find((o) => o.value === mode) ??
    CABINET_VISIBILITY_OPTIONS[0];
  return (
    <DropdownMenuTrigger
      className={cn(
        "inline-flex items-center gap-1 rounded font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
        compact ? "px-1 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[11px]"
      )}
      title={current.label}
    >
      <Layers className={compact ? "size-3" : "size-3.5"} />
      <span className="text-muted-foreground/70">Depth</span>
      <span className="tabular-nums text-foreground">{current.shortLabel}</span>
      <ChevronDown className="size-3 opacity-60" />
    </DropdownMenuTrigger>
  );
}

type Variant = {
  id: string;
  title: string;
  summary: string;
  Trigger: React.ComponentType<{
    mode: CabinetVisibilityMode;
    compact?: boolean;
  }>;
};

const VARIANTS: Variant[] = [
  {
    id: "a",
    title: "A — Bordered pill (current tasks board)",
    summary:
      "The live DepthDropdown from tasks board, unchanged: `rounded-md border border-border/60`, Layers icon + shortLabel + chevron. Most structural/visible.",
    Trigger: TriggerA,
  },
  {
    id: "b",
    title: "B — Ghost minimal",
    summary:
      "No border, transparent. Hover fills with `bg-muted/50`, open state stays filled. Same content (Layers + shortLabel + chevron). Lowest visual weight.",
    Trigger: TriggerB,
  },
  {
    id: "c",
    title: "C — Text chip (no icon)",
    summary:
      "Matches the current sidebar's micro-uppercase treatment: no Layers icon, `font-semibold uppercase tracking-wide`. Tightest footprint; best if icon feels redundant.",
    Trigger: TriggerC,
  },
  {
    id: "d",
    title: "D — Soft capsule",
    summary:
      "Rounded-full pill with `bg-muted/50` + thin ring. Layers + shortLabel + chevron. Reads as a persistent chip / filter indicator even when not hovered.",
    Trigger: TriggerD,
  },
  {
    id: "e",
    title: "E — Labeled (Depth: +1)",
    summary:
      "Ghost style but with a `Depth` word label next to the shortLabel. Most explicit — no title attribute needed — but takes the most horizontal space.",
    Trigger: TriggerE,
  },
];

/* ────────────────────────────────────────────────────────────── */
/* Sidebar mock (H cabinet rail, identical to the real sidebar)   */
/* ────────────────────────────────────────────────────────────── */
function SidebarMock({
  children,
  active,
}: {
  children: React.ReactNode;
  active: "data" | "agents" | "tasks";
}) {
  return (
    <div className="w-[280px] bg-sidebar pb-3">
      <div className="px-2 pt-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 ring-1 ring-border/60">
          <Archive className="h-[18px] w-[18px] shrink-0 text-amber-400" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
            ASDF
          </span>
          {children}
        </div>
        <div
          role="tablist"
          className="mx-[9px] grid grid-cols-3 gap-1 rounded-b-lg bg-muted/40 p-1 pt-2 border border-border/60"
        >
          {[
            { id: "data", label: "Data", Icon: BookOpen },
            { id: "agents", label: "Agents", Icon: Users },
            { id: "tasks", label: "Tasks", Icon: SquareKanban },
          ].map(({ id, label, Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                type="button"
                className={cn(
                  "relative flex w-full flex-col items-center gap-0.5 rounded-md px-1.5 pt-3 pb-2 transition-all duration-150",
                  isActive
                    ? "-translate-y-px bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                    : "text-muted-foreground"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-1/2 top-1 h-[2px] w-4 -translate-x-1/2 rounded-full",
                    isActive ? "bg-amber-400/50" : "bg-muted-foreground/30"
                  )}
                />
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[8px] font-semibold uppercase tracking-[0.1em]">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Tasks-board mock (matches the real header closely)             */
/* ────────────────────────────────────────────────────────────── */
function TasksBoardMock({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background">
      <header className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
        <h1 className="text-[14px] font-semibold tracking-tight">Tasks</h1>
        <div className="ml-4 flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-md bg-muted/40 p-0.5 ring-1 ring-border/50">
            <span className="rounded bg-background px-1.5 py-0.5 text-[10.5px] font-medium text-foreground shadow-sm">
              Kanban
            </span>
            <span className="px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
              List
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {children}
          <div className="h-3.5 w-px bg-border/60" />
          <div className="flex items-center gap-1">
            <Chip tone="primary" active>
              All <span className="ml-1 tabular-nums opacity-80">142</span>
            </Chip>
            <Chip tone="sky" icon={<Bot className="size-3" />}>
              Manual
            </Chip>
            <Chip tone="emerald" icon={<Clock3 className="size-3" />}>
              Jobs
            </Chip>
            <Chip tone="pink" icon={<HeartPulse className="size-3" />}>
              Heartbeat
            </Chip>
          </div>
          <div className="h-3.5 w-px bg-border/60" />
          <button className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground">
            <Plus className="size-3.5" /> New Task
          </button>
        </div>
      </header>
    </div>
  );
}

function Chip({
  children,
  tone,
  icon,
  active,
}: {
  children: React.ReactNode;
  tone: "primary" | "sky" | "emerald" | "pink";
  icon?: React.ReactNode;
  active?: boolean;
}) {
  const toneClass =
    tone === "primary"
      ? active
        ? "bg-primary text-primary-foreground ring-primary"
        : "text-muted-foreground ring-border/60"
      : active
      ? "bg-sky-50 text-sky-700 ring-sky-300"
      : "text-muted-foreground ring-border/60";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1",
        toneClass
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Variant card — renders one trigger in both contexts            */
/* ────────────────────────────────────────────────────────────── */
function VariantCard({ variant }: { variant: Variant }) {
  const [mode, setMode] = useState<CabinetVisibilityMode>("children-1");
  const { Trigger } = variant;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{variant.title}</h2>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          {variant.summary}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-[280px_1fr]">
        {/* Sidebar context */}
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Sidebar (compact)
          </div>
          <SidebarMock active="tasks">
            <DropdownMenu>
              <Trigger mode={mode} compact />
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <DepthMenuItems mode={mode} onChange={setMode} />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMock>
        </div>

        {/* Tasks-board context */}
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Tasks nav bar (normal)
          </div>
          <TasksBoardMock>
            <DropdownMenu>
              <Trigger mode={mode} />
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <DepthMenuItems mode={mode} onChange={setMode} />
              </DropdownMenuContent>
            </DropdownMenu>
          </TasksBoardMock>
        </div>
      </div>
    </article>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Icon alternates — swap the Layers icon for other candidates    */
/* ────────────────────────────────────────────────────────────── */
const ICON_OPTIONS: Array<{
  name: string;
  Icon: React.ComponentType<{ className?: string }>;
  note: string;
}> = [
  {
    name: "Layers",
    Icon: Layers,
    note: "Current. Abstract stacked sheets — reads as 'levels'.",
  },
  {
    name: "Layers3",
    Icon: Layers3,
    note: "Three-layer variant of the above; reads more clearly as discrete stack.",
  },
  {
    name: "FolderTree",
    Icon: FolderTree,
    note: "Literal folder hierarchy — matches the cabinet-tree metaphor directly.",
  },
  {
    name: "ListTree",
    Icon: ListTree,
    note: "Tree with leaves — the most common 'nested list' icon. Slightly busy.",
  },
  {
    name: "Network",
    Icon: Network,
    note: "Parent→children connector. Reads as a data tree / org chart.",
  },
  {
    name: "Boxes",
    Icon: Boxes,
    note: "Stacked cubes. Thematic for a 'Cabinet' app, less semantic for depth.",
  },
  {
    name: "Workflow",
    Icon: Workflow,
    note: "Connected blocks. Reads as 'flow', not 'depth'. Probably wrong fit.",
  },
  {
    name: "Focus",
    Icon: Focus,
    note: "Crosshair / scope. Reads as 'what you're looking at', not hierarchy.",
  },
  {
    name: "ScanSearch",
    Icon: ScanSearch,
    note: "Scope-with-magnifier. Similar vibe to Focus, less tool-ish.",
  },
  {
    name: "Telescope",
    Icon: Telescope,
    note: "'How far you're looking'. Poetic but non-obvious at 3.5px.",
  },
];

function IconAlternatesSection() {
  const [mode, setMode] = useState<CabinetVisibilityMode>("children-1");
  const current =
    CABINET_VISIBILITY_OPTIONS.find((o) => o.value === mode) ??
    CABINET_VISIBILITY_OPTIONS[0];
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold text-foreground">Icon alternates</h2>
      <p className="mt-1 max-w-2xl text-[12px] leading-snug text-muted-foreground">
        The trigger above uses <code className="font-mono text-xs">Layers</code> by default.
        Here&apos;s the same trigger (Variant B — ghost minimal) swapped across other
        lucide icons that could represent &ldquo;depth of view into a cabinet hierarchy&rdquo;.
        Click any to open its menu and feel how it reads at the target size.
      </p>

      <div className="mt-4 rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          {ICON_OPTIONS.map(({ name, Icon, note }) => (
            <div key={name} className="flex flex-col gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground data-[popup-open]:bg-muted/60 data-[popup-open]:text-foreground"
                  title={current.label}
                >
                  <Icon className="size-3.5" />
                  <span className="tabular-nums">{current.shortLabel}</span>
                  <ChevronDown className="size-3 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[220px]">
                  <DepthMenuItems mode={mode} onChange={setMode} />
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex flex-col">
                <span className="font-mono text-[10px] text-foreground">{name}</span>
                <span className="max-w-[180px] text-[10.5px] leading-tight text-muted-foreground">
                  {note}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Page                                                           */
/* ────────────────────────────────────────────────────────────── */
export default function DepthDropdownDemoPage() {
  return (
    <div className="min-h-screen bg-background px-8 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Depth dropdown — unified trigger variants
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Today the depth selector (<span className="tabular-nums">Own / +1 / +2 / All</span>) renders as a
            base-ui <code className="font-mono text-xs">Select</code> in the sidebar cabinet rail
            and as a custom <code className="font-mono text-xs">DepthDropdown</code> in the tasks nav bar.
            These variants propose a single shared design that scales between
            the two contexts. Click any trigger to open its menu.
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground/80">
            Open direction: all variants use <code className="font-mono text-xs">side=&quot;bottom&quot;</code>.
            When ported to production, the chosen variant will also pass{" "}
            <code className="font-mono text-xs">collisionAvoidance={`{{ side: "none" }}`}</code> to
            base-ui&apos;s positioner so it never flips upward.
          </p>
        </header>

        <section className="flex flex-col gap-6">
          {VARIANTS.map((v) => (
            <VariantCard key={v.id} variant={v} />
          ))}
        </section>

        <IconAlternatesSection />
      </div>
    </div>
  );
}

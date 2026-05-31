"use client";

import { useState } from "react";
import {
  Archive,
  BookOpen,
  Users,
  SquareKanban,
  ListChecks,
  ClipboardList,
  Plus,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DrawerId = "data" | "agents" | "tasks";

interface DrawerDef {
  id: DrawerId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DRAWERS: DrawerDef[] = [
  { id: "data", label: "Data", icon: BookOpen },
  { id: "agents", label: "Agents", icon: Users },
  { id: "tasks", label: "Tasks", icon: SquareKanban },
];

const CABINET_NAME = "ASDF";

/* ────────────────────────────────────────────────────────────── */
/* Baseline — what's in the sidebar today                         */
/* ────────────────────────────────────────────────────────────── */
function VariantBaseline() {
  const [active, setActive] = useState<DrawerId>("tasks");
  return (
    <div>
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 w-full">
        <button className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex min-w-0 flex-1 items-center gap-2 text-left hover:text-foreground/80">
          <Archive className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          {CABINET_NAME}
        </button>
        <span className="ml-auto inline-flex items-center gap-0.5 rounded px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
          ALL <ChevronDown className="h-3 w-3" />
        </span>
      </div>
      <div className="px-2 pt-2 pb-1">
        <div
          role="tablist"
          className="grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-1 ring-1 ring-border/60"
        >
          {DRAWERS.map((d) => {
            const Icon = d.icon;
            const isActive = active === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                className={cn(
                  "flex w-full flex-col items-center gap-0.5 rounded-md px-1.5 py-2 transition-all duration-150",
                  isActive
                    ? "-translate-y-px bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wide">
                  {d.label}
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
/* A — Cabinet plaque (one container, brass-plate header)         */
/* ────────────────────────────────────────────────────────────── */
function VariantA() {
  const [active, setActive] = useState<DrawerId>("tasks");
  return (
    <div className="px-2 pt-3">
      <div className="overflow-hidden rounded-lg bg-muted/40 ring-1 ring-border/60">
        <div className="flex items-center gap-2 bg-muted/60 px-2.5 py-1.5 border-b border-border/50">
          <Archive className="h-4 w-4 shrink-0 text-amber-400" />
          <button className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-foreground hover:text-foreground/80">
            {CABINET_NAME}
          </button>
          <span className="inline-flex items-center gap-0.5 rounded px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
            ALL <ChevronDown className="h-3 w-3" />
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1 p-1">
          {DRAWERS.map((d) => {
            const Icon = d.icon;
            const isActive = active === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                className={cn(
                  "flex w-full flex-col items-center gap-0.5 rounded-md px-1.5 py-2 transition-all duration-150",
                  isActive
                    ? "-translate-y-px bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[9px] font-semibold uppercase tracking-wide">
                  {d.label}
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
/* B — Drawer face (single card, bigger title, hairline seam)     */
/* ────────────────────────────────────────────────────────────── */
function VariantB() {
  const [active, setActive] = useState<DrawerId>("tasks");
  return (
    <div className="px-2 pt-3">
      <div className="rounded-xl bg-muted/35 ring-1 ring-border/60 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
          <Archive className="h-5 w-5 shrink-0 text-amber-400" />
          <button className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground hover:text-foreground/80">
            {CABINET_NAME}
          </button>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-background/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground ring-1 ring-border/60">
            ALL <ChevronDown className="h-3 w-3" />
          </span>
        </div>
        <div className="mx-2 border-t border-border/50" />
        <div className="grid grid-cols-3 gap-1 p-1.5">
          {DRAWERS.map((d) => {
            const Icon = d.icon;
            const isActive = active === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-md px-1.5 py-2 transition-all duration-150",
                  isActive
                    ? "bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[9px] font-semibold uppercase tracking-[0.08em]">
                  {d.label}
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
/* C — Heading + shelf (typographic, active-only label)           */
/* ────────────────────────────────────────────────────────────── */
function VariantC() {
  const [active, setActive] = useState<DrawerId>("tasks");
  return (
    <div>
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <Archive className="h-4 w-4 shrink-0 text-amber-400" />
        <button className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold text-foreground hover:text-foreground/80">
          {CABINET_NAME}
        </button>
        <span className="inline-flex items-center gap-0.5 rounded px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 hover:text-foreground/80">
          ALL <ChevronDown className="h-3 w-3" />
        </span>
      </div>
      <div className="px-2 pb-1">
        <div
          role="tablist"
          className="grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-1 ring-1 ring-border/60"
        >
          {DRAWERS.map((d) => {
            const Icon = d.icon;
            const isActive = active === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                title={d.label}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md px-1.5 py-2 transition-all duration-150",
                  isActive
                    ? "bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {isActive && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide">
                    {d.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* D — Labelled dock (title rail fuses into tab strip)            */
/* ────────────────────────────────────────────────────────────── */
function VariantD() {
  const [active, setActive] = useState<DrawerId>("tasks");
  return (
    <div className="px-2 pt-3">
      <div>
        <button className="flex w-full items-center gap-2 rounded-t-lg bg-muted/60 px-2.5 py-1.5 text-left ring-1 ring-border/60 hover:bg-muted/80 transition-colors">
          <Archive className="h-[18px] w-[18px] shrink-0 text-amber-400" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {CABINET_NAME}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
            ALL <ChevronDown className="h-3 w-3" />
          </span>
        </button>
        <div className="grid grid-cols-3 gap-1 rounded-b-lg bg-muted/40 p-1 border border-t-0 border-border/60">
          {DRAWERS.map((d) => {
            const Icon = d.icon;
            const isActive = active === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                className={cn(
                  "flex w-full flex-col items-center gap-0.5 rounded-md px-1.5 py-2 transition-all duration-150",
                  isActive
                    ? "-translate-y-px bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[9px] font-semibold uppercase tracking-wide">
                  {d.label}
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
/* E — Drawer pulls (D + handle bars on each tab, smaller labels) */
/* ────────────────────────────────────────────────────────────── */
function VariantE() {
  const [active, setActive] = useState<DrawerId>("tasks");
  return (
    <div className="px-2 pt-3">
      <div>
        <button className="flex w-full items-center gap-2 rounded-t-lg bg-muted/60 px-2.5 py-1.5 text-left ring-1 ring-border/60 hover:bg-muted/80 transition-colors">
          <Archive className="h-[18px] w-[18px] shrink-0 text-amber-400" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {CABINET_NAME}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
            ALL <ChevronDown className="h-3 w-3" />
          </span>
        </button>
        <div className="grid grid-cols-3 gap-1 rounded-b-lg bg-muted/40 p-1 pt-2 border border-t-0 border-border/60">
          {DRAWERS.map((d) => {
            const Icon = d.icon;
            const isActive = active === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                className={cn(
                  "relative flex w-full flex-col items-center gap-0.5 rounded-md px-1.5 pt-3 pb-2 transition-all duration-150",
                  isActive
                    ? "-translate-y-px bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                {/* drawer pull handle */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-1/2 top-1 h-[3px] w-4 -translate-x-1/2 rounded-full transition-colors",
                    isActive
                      ? "bg-amber-400/80 shadow-[0_1px_0_rgba(0,0,0,0.15)]"
                      : "bg-muted-foreground/30"
                  )}
                />
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[8px] font-semibold uppercase tracking-[0.1em]">
                  {d.label}
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
/* F — Crown dock (E + muted title + inset drawer frame)          */
/* ────────────────────────────────────────────────────────────── */
function VariantF() {
  const [active, setActive] = useState<DrawerId>("tasks");
  return (
    <div className="px-2 pt-3">
      <div>
        <button className="flex w-full items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-left ring-1 ring-border/60 hover:bg-muted/80 transition-colors">
          <Archive className="h-[18px] w-[18px] shrink-0 text-amber-400" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
            {CABINET_NAME}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
            ALL <ChevronDown className="h-3 w-3" />
          </span>
        </button>
        <div className="mx-1 mt-1 grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-1 pt-2 border border-border/60">
          {DRAWERS.map((d) => {
            const Icon = d.icon;
            const isActive = active === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                className={cn(
                  "relative flex w-full flex-col items-center gap-0.5 rounded-md px-1.5 pt-3 pb-2 transition-all duration-150",
                  isActive
                    ? "-translate-y-px bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                {/* drawer pull handle */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-1/2 top-1 h-[3px] w-4 -translate-x-1/2 rounded-full transition-colors",
                    isActive
                      ? "bg-amber-400/80 shadow-[0_1px_0_rgba(0,0,0,0.15)]"
                      : "bg-muted-foreground/30"
                  )}
                />
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[8px] font-semibold uppercase tracking-[0.1em]">
                  {d.label}
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
/* G — Crown dock, refined pulls (F + thinner + foreground hue)   */
/* ────────────────────────────────────────────────────────────── */
function VariantG() {
  const [active, setActive] = useState<DrawerId>("tasks");
  return (
    <div className="px-2 pt-3">
      <div>
        <button className="flex w-full items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-left ring-1 ring-border/60 hover:bg-muted/80 transition-colors">
          <Archive className="h-[18px] w-[18px] shrink-0 text-amber-400" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
            {CABINET_NAME}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
            ALL <ChevronDown className="h-3 w-3" />
          </span>
        </button>
        <div className="mx-1 mt-1 grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-1 pt-2 border border-border/60">
          {DRAWERS.map((d) => {
            const Icon = d.icon;
            const isActive = active === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                className={cn(
                  "relative flex w-full flex-col items-center gap-0.5 rounded-md px-1.5 pt-3 pb-2 transition-all duration-150",
                  isActive
                    ? "-translate-y-px bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                {/* drawer pull handle — thinner, soft amber */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-1/2 top-1 h-[2px] w-4 -translate-x-1/2 rounded-full transition-colors",
                    isActive ? "bg-amber-400/50" : "bg-muted-foreground/30"
                  )}
                />
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[8px] font-semibold uppercase tracking-[0.1em]">
                  {d.label}
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
/* H — Seamless crown (G + header and drawer-frame touching)      */
/* ────────────────────────────────────────────────────────────── */
function VariantH() {
  const [active, setActive] = useState<DrawerId>("tasks");
  return (
    <div className="px-2 pt-3">
      <div>
        <button className="flex w-full items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-left ring-1 ring-border/60 hover:bg-muted/80 transition-colors">
          <Archive className="h-[18px] w-[18px] shrink-0 text-amber-400" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
            {CABINET_NAME}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
            ALL <ChevronDown className="h-3 w-3" />
          </span>
        </button>
        <div className="mx-[9px] grid grid-cols-3 gap-1 rounded-b-lg bg-muted/40 p-1 pt-2 border border-border/60">
          {DRAWERS.map((d) => {
            const Icon = d.icon;
            const isActive = active === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                className={cn(
                  "relative flex w-full flex-col items-center gap-0.5 rounded-md px-1.5 pt-3 pb-2 transition-all duration-150",
                  isActive
                    ? "-translate-y-px bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                {/* drawer pull handle — thinner, soft amber */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-1/2 top-1 h-[2px] w-4 -translate-x-1/2 rounded-full transition-colors",
                    isActive ? "bg-amber-400/50" : "bg-muted-foreground/30"
                  )}
                />
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[8px] font-semibold uppercase tracking-[0.1em]">
                  {d.label}
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
/* I — H with full-strength title (recommended)                   */
/* ────────────────────────────────────────────────────────────── */
function VariantI() {
  const [active, setActive] = useState<DrawerId>("tasks");
  return (
    <div className="px-2 pt-3">
      <div>
        <button className="flex w-full items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-left ring-1 ring-border/60 hover:bg-muted/80 transition-colors">
          <Archive className="h-[18px] w-[18px] shrink-0 text-amber-400" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {CABINET_NAME}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
            ALL <ChevronDown className="h-3 w-3" />
          </span>
        </button>
        <div className="mx-[9px] grid grid-cols-3 gap-1 rounded-b-lg bg-muted/40 p-1 pt-2 border border-border/60">
          {DRAWERS.map((d) => {
            const Icon = d.icon;
            const isActive = active === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setActive(d.id)}
                className={cn(
                  "relative flex w-full flex-col items-center gap-0.5 rounded-md px-1.5 pt-3 pb-2 transition-all duration-150",
                  isActive
                    ? "-translate-y-px bg-background text-foreground shadow-[0_1px_0_rgba(0,0,0,0.06),0_6px_14px_-10px_rgba(0,0,0,0.35)] ring-1 ring-border/70"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                {/* drawer pull handle — thinner, soft amber */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-1/2 top-1 h-[2px] w-4 -translate-x-1/2 rounded-full transition-colors",
                    isActive ? "bg-amber-400/50" : "bg-muted-foreground/30"
                  )}
                />
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[8px] font-semibold uppercase tracking-[0.1em]">
                  {d.label}
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
/* Tasks icon alternates                                          */
/* ────────────────────────────────────────────────────────────── */
function TasksIconRow() {
  const options = [
    { name: "SquareKanban (current)", Icon: SquareKanban },
    { name: "ListChecks", Icon: ListChecks },
    { name: "ClipboardList", Icon: ClipboardList },
  ];
  return (
    <div className="flex items-center gap-6">
      {options.map(({ name, Icon }) => (
        <div key={name} className="flex flex-col items-center gap-1.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted/40 ring-1 ring-border/60">
            <Icon className="h-[22px] w-[22px] text-foreground" />
          </div>
          <span className="text-[10px] text-muted-foreground">{name}</span>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Page                                                           */
/* ────────────────────────────────────────────────────────────── */
interface Variant {
  id: string;
  title: string;
  summary: string;
  Component: React.ComponentType;
}

const VARIANTS: Variant[] = [
  {
    id: "baseline",
    title: "Baseline (current)",
    summary:
      "Header row + separate tab pill group. Amber Archive 3.5px, 11px uppercase name, ALL chip on the right.",
    Component: VariantBaseline,
  },
  {
    id: "a",
    title: "A — Cabinet plaque",
    summary:
      "One rounded container; brass-plate header strip above the tabs (shared ring, inner divider). 13px title, icon h-4.",
    Component: VariantA,
  },
  {
    id: "b",
    title: "B — Drawer face",
    summary:
      "Single card, hairline seam between title and tabs. Title 14px semibold, h-5 icon, ALL becomes a pill chip.",
    Component: VariantB,
  },
  {
    id: "c",
    title: "C — Heading + shelf",
    summary:
      "Typographic hierarchy: title 15px, icons-only tabs with the active tab showing its label. Most minimal.",
    Component: VariantC,
  },
  {
    id: "d",
    title: "D — Labelled dock",
    summary:
      "Title rail with rounded-top corners fuses into the tab strip (rounded-bottom). Title 14px medium, h-[18px] icon.",
    Component: VariantD,
  },
  {
    id: "e",
    title: "E — Drawer pulls (D + handles)",
    summary:
      "Same dock as D, but each tab grows a small amber handle bar at the top like a physical drawer pull. Active pull goes gold, inactive stays muted. Labels shrink to 8px with wider tracking.",
    Component: VariantE,
  },
  {
    id: "f",
    title: "F — Crown dock (E + muted title)",
    summary:
      "Same pulls as E, but the cabinet name drops to `text-muted-foreground` to match inactive tab labels, and the drawer frame is inset `mx-1` so the header plate reads like a slightly wider crown over the drawers.",
    Component: VariantF,
  },
  {
    id: "g",
    title: "G — Crown dock, soft amber pulls",
    summary:
      "F with subtler handles: height drops from 3px to 2px and the active handle is `bg-amber-400/50` — still amber to keep the cabinet/brass vibe, but softer. Inactive pulls stay muted.",
    Component: VariantG,
  },
  {
    id: "h",
    title: "H — Flush crown (G, touching)",
    summary:
      "Exactly G with three changes: removed the `mt-1` gap so the drawer frame sits flush against the header; frame corners go `rounded-lg` → `rounded-b-lg` (flat top, rounded bottom); frame horizontal inset is `mx-[9px]` so it's 5px narrower per side than G — gives a modest crown/lip.",
    Component: VariantH,
  },
  {
    id: "i",
    title: "I — H + full-strength title (recommended)",
    summary:
      "Identical to H, but the cabinet name returns from `text-muted-foreground` to `text-foreground` so it reads clearly at a glance — amber icon stays as the accent, not the sole anchor. The ALL chip keeps its muted tone.",
    Component: VariantI,
  },
];

export default function CabinetHeaderDemoPage() {
  return (
    <div className="min-h-screen bg-background px-8 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Cabinet header + drawer-tab variants
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Five options for tying the cabinet name to the Data / Agents / Tasks
            drawer row. Each preview is rendered inside a 280px panel with the
            real <code className="font-mono text-xs">bg-sidebar</code> background
            so spacing and color match production. Click any tab to see the
            active state.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {VARIANTS.map((v) => {
            const { Component } = v;
            return (
              <article
                key={v.id}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
              >
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    {v.title}
                  </h2>
                  <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                    {v.summary}
                  </p>
                </div>
                <div className="flex-1 bg-sidebar pb-6">
                  <div className="w-[280px]">
                    <Component />
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-foreground">
            Tasks icon alternates
          </h2>
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
            The default view is now Kanban, so <code className="font-mono text-xs">SquareKanban</code>{" "}
            still matches the destination view. Swap to <code className="font-mono text-xs">ListChecks</code>{" "}
            or <code className="font-mono text-xs">ClipboardList</code> if you want it to read more as
            task-items than a board.
          </p>
          <div className="mt-4 rounded-xl border border-border bg-card p-6">
            <TasksIconRow />
          </div>
        </section>
      </div>
    </div>
  );
}

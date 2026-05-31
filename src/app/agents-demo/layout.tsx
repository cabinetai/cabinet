"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  Clock3,
  HeartPulse,
  Loader2,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentsDemoProvider, useAgentsDemo } from "./store";

// Order: Agents (entities) → Routines (familiar concept) → Heartbeats
// (novel concept, needs the metaphor) → Schedule (cross-cutting view).
const TABS = [
  { href: "/agents-demo/agents", label: "Agents", icon: Users },
  { href: "/agents-demo/routines", label: "Routines", icon: Clock3 },
  { href: "/agents-demo/heartbeats", label: "Heartbeats", icon: HeartPulse },
  { href: "/agents-demo/schedule", label: "Schedule", icon: CalendarIcon },
] as const;

// Context-aware "+ New" button per tab. Schedule has no creation action.
const NEW_BUTTON: Record<string, string | null> = {
  "/agents-demo/agents": "New Agent",
  "/agents-demo/routines": "New Routine",
  "/agents-demo/heartbeats": "Configure heartbeat",
  "/agents-demo/schedule": null,
};

export default function AgentsDemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <AgentsDemoProvider>
      <div className="flex h-dvh flex-col">
        <TopBar />
        <div className="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-hidden px-6 pb-8 pt-4">
          {children}
        </div>
      </div>
    </AgentsDemoProvider>
  );
}

function TopBar() {
  const { loading } = useAgentsDemo();
  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-b border-border/70 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <h1 className="text-[14px] font-semibold tracking-tight">Team</h1>
      {loading && (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      )}
      <div className="ml-2 flex items-center gap-2">
        <TabStrip />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <ScopePicker />
        <Divider />
        <RefreshButton />
        <NewButton />
      </div>
    </header>
  );
}

function Divider() {
  return <div className="h-3.5 w-px bg-border/60" aria-hidden />;
}

function TabStrip() {
  const pathname = usePathname();
  const { agents, jobs } = useAgentsDemo();
  const counts: Record<string, number> = {
    "/agents-demo/agents": agents.length,
    "/agents-demo/routines": jobs.length,
    "/agents-demo/heartbeats": agents.filter((a) => !!a.heartbeat).length,
  };
  return (
    <nav
      className="flex h-7 items-center rounded-lg border border-border/60 p-0.5"
      role="tablist"
    >
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname?.startsWith(tab.href + "/");
        const Icon = tab.icon;
        const count = counts[tab.href];
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {tab.label}
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
          </Link>
        );
      })}
    </nav>
  );
}

function ScopePicker() {
  // Demo: stub. In production this is the real cabinet visibility picker
  // (Own / All / This cabinet only / Children) wired to the store.
  return (
    <button
      type="button"
      title="Cabinet scope (demo: not wired)"
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
    >
      <span className="size-3 rounded-sm border border-current" />
      Own
      <ChevronDown className="size-3" />
    </button>
  );
}

function RefreshButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      title="Refresh"
      aria-label="Refresh"
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
    >
      <RefreshCw className="size-3.5" />
    </button>
  );
}

function NewButton() {
  const pathname = usePathname() ?? "";
  const label = NEW_BUTTON[pathname];
  if (!label) return null;
  return (
    <button
      type="button"
      title={label}
      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
    >
      <Plus className="size-3.5" />
      {label}
    </button>
  );
}

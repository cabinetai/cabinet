"use client";

import {
  Bot,
  Cloud,
  Code2,
  GitBranch,
  PanelRight,
  Settings2,
  ShieldCheck,
  TerminalSquare,
  UserRound,
  X,
} from "lucide-react";
import type { OptaleIdentitySnapshot } from "@/lib/optale/identity-shared";
import { cn } from "@/lib/utils";
import { CONSOLE_MODULES, MODULE_SUBPAGES } from "./console-config";
import {
  identityNameLabel,
  identityRoleLabel,
  identitySourceLabel,
} from "./identity-labels";
import { StatusLine } from "./primitives";
import type {
  ConsoleModuleId,
  WorkspaceTerminalPosition,
} from "./types";

type DesktopRuntime = {
  runtime?: string;
  startMode?: string;
  cloudOrigin?: string;
};

export function ConsoleSidebar({
  activeModule,
  onModuleChange,
  identity,
}: {
  activeModule: ConsoleModuleId;
  onModuleChange: (moduleId: ConsoleModuleId) => void;
  identity: OptaleIdentitySnapshot | null;
}) {
  return (
    <aside className="flex w-full shrink-0 flex-col border-white/10 bg-[#191b1d] lg:h-screen lg:w-[232px] lg:border-r">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
        <button
          type="button"
          className="min-w-0 text-left"
          aria-label="Optale Console"
        >
          <span className="block text-[18px] font-semibold leading-none text-white">
            Optale
          </span>
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-[#8f9498]">
            Console
          </span>
        </button>
      </div>

      <nav
        aria-label="Optale Console modules"
        className="flex gap-1 overflow-x-auto border-b border-white/10 p-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:border-b-0"
      >
        {CONSOLE_MODULES.map((module) => {
          const Icon = module.icon;
          const selected = module.id === activeModule;
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => onModuleChange(module.id)}
              className={cn(
                "flex min-w-28 items-center gap-2.5 border-l-2 px-3 py-2 text-left text-sm transition-colors lg:min-w-0",
                selected
                  ? "border-[#b8d47a] bg-[#b8d47a]/12 text-white"
                  : "border-transparent text-[#b5b8bb] hover:bg-white/[0.05] hover:text-white",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate font-medium">{module.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="hidden border-t border-white/10 p-3 lg:block">
        <div className="space-y-2 text-xs text-[#8f9498]">
          <StatusLine
            icon={ShieldCheck}
            label="Role"
            value={identityRoleLabel(identity)}
            tone="good"
          />
          <StatusLine
            icon={UserRound}
            label="Identity"
            value={identitySourceLabel(identity)}
            tone="info"
          />
          <StatusLine icon={Cloud} label="Azure" value="Live" tone="info" />
          <StatusLine
            icon={Bot}
            label="Slack agent"
            value="Live"
            tone="good"
          />
        </div>
      </div>
    </aside>
  );
}

export function ConsoleHeader({
  moduleLabel,
  subpage,
  identity,
}: {
  moduleLabel: string;
  subpage: string;
  identity: OptaleIdentitySnapshot | null;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 lg:px-5">
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-base font-semibold text-white">
            {moduleLabel}
          </h1>
          <span className="hidden truncate font-mono text-[10px] uppercase tracking-[0.2em] text-[#8f9498] sm:inline">
            {moduleLabel.toLowerCase()} / {subpage.toLowerCase()}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="hidden max-w-44 truncate text-xs text-[#aeb3b7] md:inline">
          {identityNameLabel(identity)}
        </span>
        <span className="hidden items-center gap-1.5 text-xs text-[#b8d47a] sm:inline-flex">
          <span className="size-1.5 rounded-full bg-[#b8d47a]" />
          Enforce
        </span>
      </div>
    </header>
  );
}

export function SubpageStrip({
  moduleId,
  activeSubpage,
  onSubpageChange,
}: {
  moduleId: ConsoleModuleId;
  activeSubpage: string;
  onSubpageChange: (subpage: string) => void;
}) {
  return (
    <div className="shrink-0 overflow-x-auto border-b border-white/10 bg-[#15171b] px-3 py-2">
      <div className="flex gap-1">
        {MODULE_SUBPAGES[moduleId].map((subpage) => {
          const selected = subpage === activeSubpage;
          return (
            <button
              key={subpage}
              type="button"
              onClick={() => onSubpageChange(subpage)}
              className={cn(
                "h-7 whitespace-nowrap px-2.5 text-xs font-medium transition-colors",
                selected
                  ? "bg-white text-[#141619]"
                  : "text-[#aeb3b7] hover:bg-white/[0.06] hover:text-white",
              )}
            >
              {subpage}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WorkspaceStatusBar({
  desktopRuntime,
  terminalOpen,
  terminalPosition,
  onTerminalToggle,
  onPositionToggle,
  onSettingsOpen,
}: {
  desktopRuntime: DesktopRuntime | null;
  terminalOpen: boolean;
  terminalPosition: WorkspaceTerminalPosition;
  onTerminalToggle: () => void;
  onPositionToggle: () => void;
  onSettingsOpen: () => void;
}) {
  const runtimeLabel = desktopRuntime
    ? desktopRuntime.startMode === "cloud"
      ? "desktop cloud"
      : "desktop local"
    : "web";
  const cloudLabel =
    desktopRuntime?.startMode === "cloud"
      ? desktopRuntime.cloudOrigin || "console.optale.com"
      : "console.optale.com";

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 overflow-x-auto border-t border-white/10 bg-[#191b1d] px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8f9498]">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[#b8d47a]">
        <span className="size-1.5 rounded-full bg-[#b8d47a]" />
        {runtimeLabel}
      </span>
      <span className="hidden shrink-0 items-center gap-1.5 md:inline-flex">
        <GitBranch className="size-3" />
        optale-console
      </span>
      <span className="hidden shrink-0 items-center gap-1.5 sm:inline-flex">
        <Cloud className="size-3" />
        {cloudLabel.replace(/^https?:\/\//, "")}
      </span>
      <span className="ml-auto inline-flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onTerminalToggle}
          aria-pressed={terminalOpen}
          className={cn(
            "inline-flex h-6 items-center gap-1 px-1.5 transition-colors hover:text-white",
            terminalOpen && "text-[#b8d47a]",
          )}
        >
          <TerminalSquare className="size-3" />
          Terminal
          {terminalOpen ? (
            <span className="text-[#8f9498]">{terminalPosition}</span>
          ) : null}
        </button>
        {terminalOpen ? (
          <button
            type="button"
            onClick={onPositionToggle}
            className="inline-flex h-6 items-center gap-1 px-1.5 transition-colors hover:text-white"
          >
            <PanelRight className="size-3" />
            Move
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSettingsOpen}
          className="inline-flex h-6 items-center gap-1 px-1.5 transition-colors hover:text-white"
          aria-label="Open settings"
        >
          <Settings2 className="size-3" />
        </button>
      </span>
    </footer>
  );
}

export function WorkspaceTerminalPanel({
  position,
  onClose,
}: {
  position: WorkspaceTerminalPosition;
  onClose: () => void;
}) {
  return (
    <aside
      className={cn(
        "shrink-0 border-white/10 bg-[#080a0d]",
        position === "bottom"
          ? "h-72 border-t"
          : "hidden w-[min(520px,38vw)] border-l xl:block",
      )}
    >
      <div className="flex h-9 items-center justify-between border-b border-white/10 px-3">
        <div className="flex items-center gap-2 text-xs text-[#aeb3b7]">
          <Code2 className="size-3.5 text-[#b8d47a]" />
          <span>codex</span>
          <span className="text-[#8f9498]">workspace terminal</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[#8f9498] transition-colors hover:text-white"
          aria-label="Close terminal"
        >
          <X className="size-4" />
        </button>
      </div>
      <pre className="h-[calc(100%-2.25rem)] overflow-auto p-3 font-mono text-[12px] leading-5 text-[#b8d47a]">
        {`thor@optale:~/cabinet-optale-lab-shell-default
$ codex
ready for governed workspace execution`}
      </pre>
    </aside>
  );
}

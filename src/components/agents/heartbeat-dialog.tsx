"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, HeartPulse, Loader2, Play, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { SchedulePicker } from "@/components/mission-control/schedule-picker";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { useAppStore } from "@/stores/app-store";
import type { NewRoutineDialogAgent } from "@/components/agents/new-routine-dialog";

const DEFAULT_HEARTBEAT = "0 9 * * 1-5";

/**
 * Shared heartbeat editor used on the agents workspace, cabinet page, and
 * tasks-board schedule view. Edits the agent persona's heartbeat cron + active
 * flag and can run the heartbeat manually. Also exposes a link to the agent
 * detail page so users can edit the persona instructions that drive what the
 * heartbeat actually does.
 */
export function HeartbeatDialog({
  open,
  onOpenChange,
  agent,
  initialHeartbeat,
  initialEnabled,
  missedRun,
  onSaved,
  onRanNow,
  onToggledEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: NewRoutineDialogAgent;
  initialHeartbeat?: string;
  /** Heartbeat-specific enable. Independent from the agent's master `active`. */
  initialEnabled?: boolean;
  missedRun?: { scheduledAt: string };
  onSaved?: () => void;
  onRanNow?: (sessionId: string | null) => void;
  /** Fired when the user toggles the heartbeat enable from inside the dialog
   *  without saving/closing. Lets the parent update its list without tearing
   *  down the open dialog. */
  onToggledEnabled?: (enabled: boolean) => void;
}) {
  const [heartbeat, setHeartbeat] = useState(initialHeartbeat || DEFAULT_HEARTBEAT);
  const [enabled, setEnabled] = useState(initialEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Reseed when the dialog opens so we always reflect the latest persona.
  useEffect(() => {
    if (!open) return;
    setHeartbeat(initialHeartbeat || DEFAULT_HEARTBEAT);
    setEnabled(initialEnabled ?? true);
  }, [open, initialHeartbeat, initialEnabled]);

  const setSection = useAppStore((s) => s.setSection);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/personas/${agent.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heartbeat,
          heartbeatEnabled: enabled,
          cabinetPath: agent.cabinetPath,
        }),
      });
      if (!res.ok) return;
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const res = await fetch(`/api/agents/personas/${agent.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", cabinetPath: agent.cabinetPath }),
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as { sessionId?: string } | null;
      onRanNow?.(data?.sessionId ?? null);
    } finally {
      setRunning(false);
    }
  }

  async function toggleEnabled() {
    setToggling(true);
    try {
      const next = !enabled;
      const res = await fetch(`/api/agents/personas/${agent.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heartbeat,
          heartbeatEnabled: next,
          cabinetPath: agent.cabinetPath,
        }),
      });
      if (!res.ok) return;
      setEnabled(next);
      onToggledEnabled?.(next);
    } finally {
      setToggling(false);
    }
  }

  function openAgentPage() {
    const cabinetPath = agent.cabinetPath || ".";
    setSection({
      type: "agent",
      slug: agent.slug,
      cabinetPath,
      agentScopedId: `${cabinetPath}::agent::${agent.slug}`,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="gap-2">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="space-y-2">
              <DialogTitle className="flex items-center gap-3 text-[22px] font-semibold leading-none tracking-tight text-foreground">
                <AgentAvatar
                  agent={agent}
                  shape="circle"
                  size="lg"
                />
                <span className="flex min-w-0 flex-col gap-1 leading-tight">
                  <span className="inline-flex items-center gap-2">
                    <HeartPulse className="size-5 text-pink-400" />
                    Heartbeat
                  </span>
                  <span className="text-[13px] font-normal text-muted-foreground">
                    for{" "}
                    <span className="font-medium text-foreground">{agent.name}</span>
                    {agent.role ? ` · ${agent.role}` : ""}
                  </span>
                </span>
              </DialogTitle>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-[12px]"
                onClick={() => void runNow()}
                disabled={running || !enabled}
                title={
                  enabled
                    ? "Run heartbeat now (one-off, outside its schedule)"
                    : "Enable the heartbeat to run it"
                }
              >
                {running ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Run now
              </Button>
              <label
                className={cn(
                  "inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-md border border-input px-3 text-[12px] font-medium transition-colors hover:bg-accent/40",
                  toggling && "opacity-60"
                )}
                title={
                  enabled
                    ? "Disable the heartbeat — it won't fire on its schedule"
                    : "Enable the heartbeat so it fires on its schedule"
                }
              >
                <Switch
                  checked={enabled}
                  onCheckedChange={() => void toggleEnabled()}
                  disabled={toggling}
                  aria-label={enabled ? "Disable heartbeat" : "Enable heartbeat"}
                />
                <span>{enabled ? "On" : "Off"}</span>
              </label>
            </div>
          </div>
          <DialogDescription className="text-[13px] leading-6">
            A heartbeat wakes this agent on its own rhythm. Each time it
            fires, the agent checks in and decides what to work on — driven by
            its persona instructions. Set how often it should wake up here; to
            change what it does each time, open the agent page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {missedRun ? <MissedRunBanner scheduledAt={missedRun.scheduledAt} /> : null}

          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Schedule
            </span>
            <SchedulePicker value={heartbeat} onChange={setHeartbeat} />
            <p className="text-[11px] text-muted-foreground/80">
              This is how often the heartbeat wakes up.
            </p>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 text-[12px]"
              onClick={openAgentPage}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Edit agent
            </Button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-[13px]"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-9 gap-1.5 text-[13px] font-semibold"
                onClick={() => void save()}
                disabled={saving}
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MissedRunBanner({ scheduledAt }: { scheduledAt: string }) {
  const when = new Date(scheduledAt);
  const label = `${when.toLocaleDateString()} ${when.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="space-y-0.5">
        <p className="font-medium">This run did not execute at {label}.</p>
        <p className="text-[11px] opacity-80">
          Possible causes: the Cabinet daemon was not running, the heartbeat
          was disabled at that time, or the run failed to start before it was
          recorded.
        </p>
      </div>
    </div>
  );
}

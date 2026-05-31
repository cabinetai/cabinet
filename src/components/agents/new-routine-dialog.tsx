"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Play, Save, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SchedulePicker } from "@/components/mission-control/schedule-picker";
import { TaskRuntimePicker } from "@/components/composer/task-runtime-picker";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { useAppStore } from "@/stores/app-store";
import { resolveAdapterTypeForProvider } from "@/lib/agents/adapter-options";
import type { JobConfig } from "@/types/jobs";
import { useLocale } from "@/i18n/use-locale";

/**
 * Shape of the target agent for a routine dialog. We only need identity +
 * provider defaults here; the dialog doesn't fetch persona data itself.
 */
export interface NewRoutineDialogAgent {
  slug: string;
  name: string;
  role?: string;
  cabinetPath?: string;
  provider?: string;
  adapterType?: string;
  displayName?: string;
  iconKey?: string | null;
  color?: string | null;
  avatar?: string | null;
  avatarExt?: string | null;
}

/**
 * Shared routine editor. Used by the agents workspace ("Add routine")
 * and by the single-agent detail page. Handles both create (existingJob
 * undefined) and edit flows. Save/run/delete call the job API directly;
 * callers receive the canonical job back via `onSaved` and refresh their
 * local state.
 */
export function NewRoutineDialog({
  open,
  onOpenChange,
  agent,
  existingJob,
  onSaved,
  onDeleted,
  onToggled,
  missedRun,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: NewRoutineDialogAgent;
  /** Either a full JobConfig (edit mode) or a partial with id/name/schedule/prompt
   *  (from a lightweight source like `CabinetJobSummary`). Missing fields are
   *  back-filled from sensible defaults; the PUT only writes what was changed. */
  existingJob?: Partial<JobConfig> | null;
  onSaved?: (job: JobConfig) => void;
  onDeleted?: (id: string) => void;
  /** Fired when the user toggles enabled/disabled from inside the dialog
   *  without saving/closing. Lets the parent refresh its list without
   *  tearing down the open dialog. */
  onToggled?: (job: JobConfig) => void;
  /** Optional "this run did not execute" banner (from cabinet-view's
   *  scheduled-but-missing-conversation flow). */
  missedRun?: { scheduledAt: string };
}) {
  const { t } = useLocale();
  const providers = useAppStore((s) => s.providers);
  const defaultProviderId = useAppStore((s) => s.defaultProviderId);
  const fallbackProvider =
    agent.provider || defaultProviderId || "claude-code";

  const [draft, setDraft] = useState<JobConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEdit = !!existingJob?.id;

  // Reseed the draft whenever the dialog opens (so a fresh create doesn't
  // inherit the last edit's fields, and an edit always shows current values).
  useEffect(() => {
    if (!open) return;
    const now = new Date().toISOString();
    const base: JobConfig = {
      id: "",
      name: "",
      enabled: true,
      schedule: "0 9 * * 1-5",
      provider: fallbackProvider,
      adapterType:
        agent.adapterType ||
        resolveAdapterTypeForProvider(
          providers,
          fallbackProvider,
          undefined,
          defaultProviderId || undefined
        ),
      agentSlug: agent.slug,
      prompt: "",
      timeout: 600,
      cabinetPath: agent.cabinetPath,
      createdAt: now,
      updatedAt: now,
    };
    if (existingJob) {
      setDraft({ ...base, ...existingJob } as JobConfig);
      return;
    }
    setDraft(base);
  }, [
    open,
    existingJob,
    agent.slug,
    agent.adapterType,
    agent.cabinetPath,
    fallbackProvider,
    providers,
    defaultProviderId,
  ]);

  const cabinetQuery = agent.cabinetPath
    ? `?cabinetPath=${encodeURIComponent(agent.cabinetPath)}`
    : "";

  const canSave = useMemo(() => {
    if (!draft) return false;
    return (
      draft.name.trim().length > 0 &&
      draft.prompt.trim().length > 0 &&
      draft.id.trim().length > 0
    );
  }, [draft]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const url = isEdit
        ? `/api/agents/${agent.slug}/jobs/${draft.id}${cabinetQuery}`
        : `/api/agents/${agent.slug}/jobs${cabinetQuery}`;
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          id: draft.id || undefined,
          cabinetPath: agent.cabinetPath,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as
        | { job?: JobConfig }
        | null;
      const savedJob = (data?.job || draft) as JobConfig;
      onSaved?.(savedJob);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (!draft?.id) return;
    setRunning(true);
    try {
      await fetch(`/api/agents/${agent.slug}/jobs/${draft.id}${cabinetQuery}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", cabinetPath: agent.cabinetPath }),
      });
    } finally {
      setRunning(false);
    }
  }

  async function toggleEnabled() {
    if (!draft?.id) return;
    setToggling(true);
    try {
      const res = await fetch(
        `/api/agents/${agent.slug}/jobs/${draft.id}${cabinetQuery}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "toggle",
            cabinetPath: agent.cabinetPath,
          }),
        }
      );
      if (!res.ok) return;
      const nextEnabled = !draft.enabled;
      const nextDraft: JobConfig = { ...draft, enabled: nextEnabled };
      setDraft(nextDraft);
      onToggled?.(nextDraft);
    } finally {
      setToggling(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/agents/${agent.slug}/jobs/${draft.id}${cabinetQuery}`,
        { method: "DELETE" }
      );
      if (!res.ok) return;
      onDeleted?.(draft.id);
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDraft(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-5xl">
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
                  <span>{isEdit ? "Edit routine" : "New routine"}</span>
                  <span className="text-[13px] font-normal text-muted-foreground">
                    for{" "}
                    <span className="font-medium text-foreground">
                      {agent.name}
                    </span>
                    {agent.role ? ` · ${agent.role}` : ""}
                  </span>
                </span>
              </DialogTitle>
              <DialogDescription className="text-[13px]">
                {isEdit
                  ? "Changes take effect on the next run."
                  : "A routine is a prompt this agent runs on a schedule. Write the prompt once, pick when it should run, and let the agent take it from there."}
              </DialogDescription>
            </div>
            {isEdit ? (
              <div className="flex shrink-0 gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-[12px]"
                  onClick={() => void runNow()}
                  disabled={running}
                  title={t("agents:routine.runNowTitle")}
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
                    draft?.enabled === false
                      ? "Enable this routine so it runs on its schedule"
                      : "Disable this routine — it stays saved but won't fire on its schedule"
                  }
                >
                  <Switch
                    checked={draft?.enabled !== false}
                    onCheckedChange={() => void toggleEnabled()}
                    disabled={toggling}
                    aria-label={draft?.enabled === false ? "Enable routine" : "Disable routine"}
                  />
                  <span>{draft?.enabled === false ? "Off" : "On"}</span>
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 text-[12px] text-destructive hover:text-destructive"
                  onClick={() => void remove()}
                  disabled={deleting}
                  title={t("agents:routine.deletePermanently")}
                >
                  {deleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
        </DialogHeader>

        {draft ? (
          <div className="space-y-4">
            {missedRun ? <MissedRunBanner scheduledAt={missedRun.scheduledAt} /> : null}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Prompt
                </span>
                <textarea
                  value={draft.prompt}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, prompt: event.target.value } : current
                    )
                  }
                  className="h-[55vh] w-full resize-none rounded-lg bg-muted/60 px-3.5 py-3 text-[14px] leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:bg-muted"
                  placeholder={t("agents:routine.promptPlaceholder")}
                />
              </div>
              <div className="grid content-start gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:col-span-2">
                  <span>{t("agents:routine.jobName")}</span>
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => {
                        if (!current) return current;
                        const next = { ...current, name: event.target.value };
                        // Auto-derive a slug id when the user hasn't overridden it
                        // (only on create — we don't want to rename existing jobs).
                        if (!isEdit) {
                          const derived = slugify(event.target.value);
                          if (
                            !current.id ||
                            current.id === slugify(current.name)
                          ) {
                            next.id = derived;
                          }
                        }
                        return next;
                      })
                    }
                    className="w-full rounded-lg bg-muted/60 px-3 py-2.5 text-[14px] font-normal normal-case tracking-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:bg-muted"
                    placeholder={t("agents:routine.jobNamePlaceholder")}
                  />
                </label>
                <label className="space-y-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:col-span-2">
                  <span>{t("agents:routine.jobId")}</span>
                  <input
                    value={draft.id}
                    disabled={isEdit}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, id: slugify(event.target.value) } : current
                      )
                    }
                    className="w-full rounded-lg bg-muted/60 px-3 py-2.5 font-mono text-[13px] normal-case tracking-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:bg-muted disabled:opacity-60"
                    placeholder="weekly-strategy-digest"
                  />
                </label>
                <div className="space-y-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:col-span-2">
                  <span>{t("agents:routine.schedule")}</span>
                  <SchedulePicker
                    value={draft.schedule || "0 9 * * 1-5"}
                    onChange={(cron) =>
                      setDraft((current) =>
                        current ? { ...current, schedule: cron } : current
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:col-span-2">
                  <span>{t("agents:routine.model")}</span>
                  <TaskRuntimePicker
                    value={{
                      providerId: draft.provider,
                      adapterType: draft.adapterType,
                      model:
                        typeof draft.adapterConfig?.model === "string"
                          ? (draft.adapterConfig.model as string)
                          : undefined,
                      effort:
                        typeof draft.adapterConfig?.effort === "string"
                          ? (draft.adapterConfig.effort as string)
                          : undefined,
                    }}
                    onChange={(next) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              provider: next.providerId || current.provider,
                              adapterType: next.adapterType ?? current.adapterType,
                              adapterConfig: {
                                ...(current.adapterConfig || {}),
                                model: next.model,
                                effort: next.effort,
                              },
                            }
                          : current
                      )
                    }
                    align="start"
                    className="h-10 w-full justify-start gap-2 rounded-lg bg-muted/60 px-3 text-[13px] normal-case tracking-normal"
                  />
                </div>
                <label className="space-y-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <span>Timeout (s)</span>
                  <input
                    type="number"
                    value={draft.timeout || 600}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              timeout: parseInt(event.target.value || "600", 10),
                            }
                          : current
                      )
                    }
                    className="w-full rounded-lg bg-muted/60 px-3 py-2.5 text-[14px] normal-case tracking-normal text-foreground outline-none transition-colors focus:bg-muted"
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, enabled: event.target.checked }
                          : current
                      )
                    }
                    className="size-4"
                  />
                  <span>{t("agents:routine.enabled")}</span>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
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
                disabled={saving || !canSave}
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : isEdit ? "Save" : "Create routine"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
          Possible causes: the Cabinet daemon was not running, the schedule
          was disabled at that time, or the run failed to start before it was
          recorded.
        </p>
      </div>
    </div>
  );
}

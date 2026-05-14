"use client";

import { ExternalLink, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchedulePicker } from "@/components/mission-control/schedule-picker";
import { useLocale } from "@/i18n/use-locale";

/**
 * Shared form controls used by both the unified `StartWorkDialog` (create path)
 * and the in-place edit dialogs (`NewRoutineDialog`, `HeartbeatDialog`) so
 * both flows stay visually identical.
 */

export interface RoutineDraft {
  name: string;
  id: string;
  schedule: string;
  timeout: number;
  enabled: boolean;
}

export interface HeartbeatDraft {
  schedule: string;
  active: boolean;
}

export function slugifyId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function RoutineFields({
  draft,
  onChange,
  isEdit,
  showAdvanced = false,
}: {
  draft: RoutineDraft;
  onChange: (next: RoutineDraft) => void;
  /** When editing an existing routine, the id is frozen. */
  isEdit?: boolean;
  /** Show the id field and timeout (hidden on create by default). */
  showAdvanced?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="grid content-start gap-3 sm:grid-cols-2">
      <label className="space-y-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:col-span-2">
        <span>Name</span>
        <input
          value={draft.name}
          onChange={(event) => {
            const name = event.target.value;
            const next: RoutineDraft = { ...draft, name };
            if (!isEdit) {
              const derivedFromOld = slugifyId(draft.name);
              if (!draft.id || draft.id === derivedFromOld) {
                next.id = slugifyId(name);
              }
            }
            onChange(next);
          }}
          className="w-full rounded-lg bg-muted/60 px-3 py-2.5 text-[14px] font-normal normal-case tracking-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:bg-muted"
          placeholder={t("schedulingFields:jobNamePlaceholder")}
        />
      </label>

      <div className="space-y-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:col-span-2">
        <span>{t("schedulingFields:schedule")}</span>
        <SchedulePicker
          value={draft.schedule || "0 9 * * 1-5"}
          onChange={(cron) => onChange({ ...draft, schedule: cron })}
        />
      </div>

      {showAdvanced ? (
        <>
          <label className="space-y-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:col-span-2">
            <span>{t("schedulingFields:jobId")}</span>
            <input
              value={draft.id}
              disabled={isEdit}
              onChange={(event) =>
                onChange({ ...draft, id: slugifyId(event.target.value) })
              }
              className="w-full rounded-lg bg-muted/60 px-3 py-2.5 font-mono text-[13px] normal-case tracking-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:bg-muted disabled:opacity-60"
              placeholder="weekly-strategy-digest"
            />
          </label>
          <label className="space-y-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <span>Timeout (s)</span>
            <input
              type="number"
              value={draft.timeout || 600}
              onChange={(event) =>
                onChange({
                  ...draft,
                  timeout: parseInt(event.target.value || "600", 10),
                })
              }
              className="w-full rounded-lg bg-muted/60 px-3 py-2.5 text-[14px] normal-case tracking-normal text-foreground outline-none transition-colors focus:bg-muted"
            />
          </label>
        </>
      ) : null}

      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground sm:col-span-2">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
          className="size-4"
        />
        <span>{t("schedulingFields:enabled")}</span>
      </label>
    </div>
  );
}

export function HeartbeatFields({
  draft,
  onChange,
  onEditPersona,
}: {
  draft: HeartbeatDraft;
  onChange: (next: HeartbeatDraft) => void;
  /** When present, shows an "Edit agent instructions" affordance. */
  onEditPersona?: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-pink-500/30 bg-pink-500/5 px-3.5 py-3 text-[12px] leading-5 text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
          <HeartPulse className="size-3.5 text-pink-400" />
          Heartbeats run the agent&apos;s persona instructions.
        </div>
        <p>
          Each time it fires, the agent checks in and decides what to work on —
          driven by its persona. Set how often it should wake up here; to
          change what it does, edit the agent instructions.
        </p>
      </div>

      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Schedule
        </span>
        <SchedulePicker
          value={draft.schedule}
          onChange={(cron) => onChange({ ...draft, schedule: cron })}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(event) => onChange({ ...draft, active: event.target.checked })}
          className="size-4"
        />
        <span>{t("composerExtras:active")}</span>
      </label>

      {onEditPersona ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-[12px]"
          onClick={onEditPersona}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Edit agent instructions
        </Button>
      ) : null}
    </div>
  );
}

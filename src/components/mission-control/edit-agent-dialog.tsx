"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SchedulePicker } from "./schedule-picker";
import { cn } from "@/lib/utils";
import { Plus, X, Save, Trash2 } from "lucide-react";
import type { GoalMetric, ProviderInfo } from "@/types/agents";
import {
  formatAdapterOptionLabel,
  getAdapterOptionsForProvider,
  getDefaultAdapterTypeForProviderInfo,
  resolveAdapterTypeForProvider,
} from "@/lib/agents/adapter-options";
import { useLocale } from "@/i18n/use-locale";

interface GoalInput {
  metric: string;
  target: number;
  unit: string;
  period: string;
  floor?: number;
}

interface EditAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  onSaved?: () => void;
}

const EMOJI_OPTIONS = [
  "🤖", "👑", "📝", "🎯", "🔍", "🛡️", "🚀", "💼",
  "📊", "🧠", "⚡", "🔧", "📣", "🎨", "📈", "🌐",
  "👔", "🛠", "⚙️", "🔬", "✏️", "💡", "🎓", "🏢",
];

const DEPARTMENTS = ["marketing", "sales", "engineering", "research", "operations", "content", "support", "general"];

export function EditAgentDialog({ open, onOpenChange, slug, onSaved }: EditAgentDialogProps) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [emoji, setEmoji] = useState("🤖");
  const [department, setDepartment] = useState("general");
  const [type, setType] = useState<"specialist" | "lead">("specialist");
  const [heartbeat, setHeartbeat] = useState("0 */4 * * *");
  const [provider, setProvider] = useState("claude-code");
  const [adapterType, setAdapterType] = useState<string | undefined>(undefined);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [defaultProvider, setDefaultProvider] = useState("claude-code");
  const [goals, setGoals] = useState<GoalInput[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const adapterOptions = getAdapterOptionsForProvider(
    providers,
    provider || defaultProvider,
    defaultProvider
  );

  // Load agent data when dialog opens
  useEffect(() => {
    if (!open || !slug) return;
    setLoading(true);
    setDirty(false);

    fetch("/api/agents/providers")
      .then((r) => r.json())
      .then((data) => {
        const nextProviders = (data.providers || []).filter(
          (entry: ProviderInfo) => entry.type === "cli" && entry.enabled
        );
        setProviders(nextProviders);
        setDefaultProvider(data.defaultProvider || "claude-code");
      })
      .catch(() => {});

    fetch(`/api/agents/personas/${slug}`)
      .then((r) => r.json())
      .then((agentData) => {
        const p = agentData.persona || agentData;
        setName(p.name || "");
        setRole(p.role || "");
        setEmoji(p.emoji || "🤖");
        setDepartment(p.department || "general");
        setType(p.type || "specialist");
        setHeartbeat(p.heartbeat || "0 */4 * * *");
        setProvider(p.provider || defaultProvider);
        setAdapterType(p.adapterType || undefined);
        setChannels(p.channels || ["general"]);
        setBody(p.body || "");
        setGoals(
          (p.goals || []).map((g: GoalMetric) => ({
            metric: g.metric,
            target: g.target,
            unit: g.unit || "count",
            period: g.period || "weekly",
            floor: g.floor,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, slug, defaultProvider]);

  const markDirty = () => setDirty(true);

  const handleSave = async () => {
    setSaving(true);
    try {
      const goalsFmt = goals
        .filter((g) => g.metric.trim() && g.target > 0)
        .map((g) => ({
          metric: g.metric.trim().replace(/\s+/g, "_").toLowerCase(),
          target: g.target,
          current: 0, // preserve existing progress — server merges
          unit: g.unit.trim() || "count",
          period: g.period,
          ...(g.floor && g.floor > 0 ? { floor: g.floor } : {}),
        }));

      const update = {
        name: name.trim(),
        role: role.trim(),
        emoji,
        department,
        type,
        heartbeat,
        provider,
        adapterType,
        goals: goalsFmt,
        channels,
        body,
      };

      const res = await fetch(`/api/agents/personas/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });

      if (res.ok) {
        setDirty(false);
        onOpenChange(false);
        onSaved?.();
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const addGoal = () => {
    markDirty();
    setGoals((prev) => [...prev, { metric: "", target: 10, unit: "count", period: "weekly" }]);
  };

  const updateGoal = (i: number, field: keyof GoalInput, value: string | number) => {
    markDirty();
    setGoals((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const removeGoal = (i: number) => {
    markDirty();
    setGoals((prev) => prev.filter((_, j) => j !== i));
  };

  if (loading && open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <div className="flex items-center justify-center py-8 text-muted-foreground/50 text-[13px]">
            Loading agent...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{emoji}</span>
            Edit Agent
          </DialogTitle>
          <DialogDescription>
            Modify agent configuration. Changes are saved to the agent&apos;s markdown file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Identity */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              Identity
            </div>

            {/* Emoji picker */}
            <div className="space-y-1">
              <label className="text-[12px] font-medium">{t("agents:dialog.avatar")}</label>
              <div className="flex flex-wrap gap-1">
                {EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { setEmoji(e); markDirty(); }}
                    className={cn(
                      "w-7 h-7 rounded-md text-sm flex items-center justify-center transition-colors",
                      emoji === e
                        ? "bg-primary/20 ring-1 ring-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[12px] font-medium">Name</label>
                <Input
                  value={name}
                  onChange={(e) => { setName(e.target.value); markDirty(); }}
                  placeholder={t("agents:dialog.namePlaceholder")}
                  className="text-[12px] h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[12px] font-medium">Role</label>
                <Input
                  value={role}
                  onChange={(e) => { setRole(e.target.value); markDirty(); }}
                  placeholder={t("agents:dialog.rolePlaceholder")}
                  className="text-[12px] h-8"
                />
              </div>
            </div>
          </div>

          {/* Configuration */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              Configuration
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[12px] font-medium">{t("agents:dialog.department")}</label>
                <select
                  value={department}
                  onChange={(e) => { setDepartment(e.target.value); markDirty(); }}
                  className="w-full h-8 text-[12px] rounded-md border border-input bg-background px-2 capitalize"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[12px] font-medium">Type</label>
                <select
                  value={type}
                  onChange={(e) => { setType(e.target.value as "specialist" | "lead"); markDirty(); }}
                  className="w-full h-8 text-[12px] rounded-md border border-input bg-background px-2"
                >
                  <option value="specialist">{t("agents:dialog.specialist")}</option>
                  <option value="lead">{t("agents:dialog.departmentLead")}</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[12px] font-medium">{t("agents:dialog.provider")}</label>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setAdapterType(
                    resolveAdapterTypeForProvider(
                      providers,
                      e.target.value,
                      undefined,
                      defaultProvider
                    )
                  );
                  markDirty();
                }}
                className="w-full h-8 text-[12px] rounded-md border border-input bg-background px-2"
              >
                {(providers.length > 0
                  ? providers
                  : [{ id: defaultProvider, name: defaultProvider, type: "cli", available: true } as ProviderInfo]
                ).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}{entry.available ? "" : " (not installed)"}
                  </option>
                ))}
              </select>
            </div>
            {adapterOptions.length > 0 ? (
              <div className="space-y-1">
                <label className="text-[12px] font-medium">{t("agents:dialog.runtime")}</label>
                <select
                  value={
                    adapterType ||
                    getDefaultAdapterTypeForProviderInfo(
                      providers,
                      provider,
                      defaultProvider
                    ) ||
                    ""
                  }
                  onChange={(e) => {
                    setAdapterType(e.target.value);
                    markDirty();
                  }}
                  className="w-full h-8 text-[12px] rounded-md border border-input bg-background px-2"
                >
                  {adapterOptions.map((adapter) => (
                    <option key={adapter.type} value={adapter.type}>
                      {formatAdapterOptionLabel(adapter)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {/* Schedule */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              Heartbeat Schedule
            </div>
            <SchedulePicker
              value={heartbeat}
              onChange={(v) => { setHeartbeat(v); markDirty(); }}
            />
          </div>

          {/* Goals */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                Goals ({goals.length})
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] gap-1"
                onClick={addGoal}
              >
                <Plus className="h-3 w-3" />
                Add Goal
              </Button>
            </div>

            {goals.length === 0 && (
              <p className="text-[12px] text-muted-foreground/50">
                No goals defined. Goals drive autonomous agent behavior.
              </p>
            )}

            {goals.map((g, i) => (
              <div key={i} className="space-y-2 rounded-lg bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground/70">
                    Goal {i + 1}
                  </span>
                  <button
                    onClick={() => removeGoal(i)}
                    className="text-muted-foreground/40 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground/50">{t("agents:metric.name")}</label>
                    <Input
                      value={g.metric}
                      onChange={(e) => updateGoal(i, "metric", e.target.value)}
                      placeholder={t("agents:metric.namePlaceholder")}
                      className="text-[12px] h-7 font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50">{t("agents:metric.target")}</label>
                      <Input
                        type="number"
                        value={g.target}
                        onChange={(e) => updateGoal(i, "target", parseInt(e.target.value) || 0)}
                        className="text-[12px] h-7"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground/50">{t("agents:metric.floor")}</label>
                      <Input
                        type="number"
                        value={g.floor || ""}
                        onChange={(e) => updateGoal(i, "floor", parseInt(e.target.value) || 0)}
                        placeholder="—"
                        className="text-[12px] h-7"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground/50">Unit</label>
                    <Input
                      value={g.unit}
                      onChange={(e) => updateGoal(i, "unit", e.target.value)}
                      placeholder="replies"
                      className="text-[12px] h-7"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground/50">{t("agents:metric.period")}</label>
                    <select
                      value={g.period}
                      onChange={(e) => updateGoal(i, "period", e.target.value)}
                      className="w-full h-7 text-[12px] rounded-md border border-input bg-background px-2"
                    >
                      <option value="daily">{t("agents:metric.daily")}</option>
                      <option value="weekly">{t("agents:metric.weekly")}</option>
                      <option value="monthly">{t("agents:metric.monthly")}</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* System Prompt */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              System Prompt
            </div>
            <textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); markDirty(); }}
              rows={6}
              placeholder={t("agents:dialog.promptPlaceholder")}
              className="w-full text-[12px] rounded-md border border-input bg-background px-3 py-2 resize-y leading-relaxed font-mono placeholder:text-muted-foreground/30"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-[12px]"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-[12px] gap-1.5"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            <Save className="h-3 w-3" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

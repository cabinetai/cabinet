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
import { Plus, X } from "lucide-react";
import type { ProviderInfo } from "@/types/agents";
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
}

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const EMOJI_OPTIONS = [
  "🤖", "👑", "📝", "🎯", "🔍", "🛡️", "🚀", "💼",
  "📊", "🧠", "⚡", "🔧", "📣", "🎨", "📈", "🌐",
];

const DEPARTMENTS = ["marketing", "sales", "engineering", "research", "operations", "content", "support", "general"];

export function CreateAgentDialog({ open, onOpenChange, onCreated }: CreateAgentDialogProps) {
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
  const [creating, setCreating] = useState(false);
  const adapterOptions = getAdapterOptionsForProvider(
    providers,
    provider || defaultProvider,
    defaultProvider
  );

  useEffect(() => {
    if (!open) return;

    fetch("/api/agents/providers")
      .then((r) => r.json())
      .then((data) => {
        const nextProviders = (data.providers || []).filter(
          (entry: ProviderInfo) => entry.type === "cli" && entry.enabled
        );
        setProviders(nextProviders);
        const nextDefault = data.defaultProvider || "claude-code";
        setDefaultProvider(nextDefault);
        setProvider(nextDefault);
        setAdapterType(
          getDefaultAdapterTypeForProviderInfo(
            nextProviders,
            nextDefault,
            nextDefault
          )
        );
      })
      .catch(() => {});
  }, [open]);

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-|-$/g, "");

  const handleCreate = async () => {
    if (!name.trim() || !slug) return;
    setCreating(true);

    try {
      const goalsFmt = goals
        .filter((g) => g.metric.trim() && g.target > 0)
        .map((g) => ({
          metric: g.metric.trim().replace(/\s+/g, "_").toLowerCase(),
          target: g.target,
          current: 0,
          unit: g.unit.trim() || "count",
          period: g.period,
        }));

      const body = {
        name: name.trim(),
        role: role.trim(),
        emoji,
        department,
        type,
        heartbeat,
        provider,
        adapterType,
        budget: 200,
        active: false,
        workdir: "/data",
        goals: goalsFmt,
        channels: [department === "general" ? "general" : department, "general"],
        tags: [department],
        focus: [],
        body: `You are ${name.trim()}. ${role.trim()}\n\nYour department: ${department}\nYour role type: ${type}`,
      };

      const res = await fetch(`/api/agents/personas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });

      if (res.ok) {
        onOpenChange(false);
        resetForm();
        onCreated?.();
      }
    } catch {
      /* ignore */
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setName("");
    setRole("");
    setEmoji("🤖");
    setDepartment("general");
    setType("specialist");
    setHeartbeat("0 */4 * * *");
    setProvider(defaultProvider);
    setAdapterType(
      getDefaultAdapterTypeForProviderInfo(providers, defaultProvider, defaultProvider)
    );
    setGoals([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("agents:dialog.createAgent")}</DialogTitle>
          <DialogDescription>
            Define a new agent with its identity, schedule, and goals.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Identity */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
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
                    onClick={() => setEmoji(e)}
                    className={cn(
                      "w-8 h-8 rounded-md text-base flex items-center justify-center transition-colors",
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
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("agents:dialog.namePlaceholder")}
                  className="text-[12px] h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[12px] font-medium">Role</label>
                <Input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder={t("agents:dialog.rolePlaceholder")}
                  className="text-[12px] h-8"
                />
              </div>
            </div>

            {slug && (
              <p className="text-[10px] text-muted-foreground/50">
                Slug: <code className="font-mono">{slug}</code>
              </p>
            )}
          </div>

          {/* Department & Type */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
              Organization
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[12px] font-medium">{t("agents:dialog.department")}</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full h-8 text-[12px] bg-background border border-border rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[12px] font-medium">Type</label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setType("specialist")}
                    className={cn(
                      "flex-1 h-8 text-[11px] rounded-md border transition-colors",
                      type === "specialist"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Specialist
                  </button>
                  <button
                    type="button"
                    onClick={() => setType("lead")}
                    className={cn(
                      "flex-1 h-8 text-[11px] rounded-md border transition-colors",
                      type === "lead"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Lead
                  </button>
                </div>
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
                }}
                className="w-full h-8 text-[12px] bg-background border border-border rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring"
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
                  onChange={(e) => setAdapterType(e.target.value)}
                  className="w-full h-8 text-[12px] bg-background border border-border rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring"
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
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
              Heartbeat Schedule
            </div>
            <SchedulePicker
              value={heartbeat}
              onChange={setHeartbeat}
            />
          </div>

          {/* Goals */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
                Goals ({goals.length})
              </div>
              <button
                type="button"
                onClick={() => setGoals((prev) => [...prev, { metric: "", target: 10, unit: "", period: "weekly" }])}
                className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add Goal
              </button>
            </div>
            {goals.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/40">
                Goals define what success looks like. Agents track progress toward these metrics.
              </p>
            ) : (
              <div className="space-y-2">
                {goals.map((g, i) => (
                  <div key={i} className="flex items-start gap-1.5 p-2 rounded-md bg-muted/20 border border-border/30">
                    <div className="flex-1 grid grid-cols-2 gap-1.5">
                      <Input
                        value={g.metric}
                        onChange={(e) => setGoals((prev) => prev.map((goal, idx) => idx === i ? { ...goal, metric: e.target.value } : goal))}
                        placeholder={t("agents:metric.namePlaceholder")}
                        className="text-[11px] h-7 col-span-2"
                      />
                      <Input
                        type="number"
                        value={g.target || ""}
                        onChange={(e) => setGoals((prev) => prev.map((goal, idx) => idx === i ? { ...goal, target: parseInt(e.target.value) || 0 } : goal))}
                        placeholder="50"
                        className="text-[11px] h-7"
                      />
                      <Input
                        value={g.unit}
                        onChange={(e) => setGoals((prev) => prev.map((goal, idx) => idx === i ? { ...goal, unit: e.target.value } : goal))}
                        placeholder={t("agents:metric.targetPlaceholder")}
                        className="text-[11px] h-7"
                      />
                      <select
                        value={g.period}
                        onChange={(e) => setGoals((prev) => prev.map((goal, idx) => idx === i ? { ...goal, period: e.target.value } : goal))}
                        className="text-[11px] h-7 bg-background border border-border rounded-md px-1.5 focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
                      >
                        <option value="daily">{t("agents:metric.daily")}</option>
                        <option value="weekly">{t("agents:metric.weekly")}</option>
                        <option value="monthly">{t("agents:metric.monthly")}</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGoals((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-1 text-muted-foreground/40 hover:text-red-500 transition-colors mt-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="text-[12px]"
          >
            {creating ? "Creating..." : "Create Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

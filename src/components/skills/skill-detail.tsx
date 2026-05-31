"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Loader2,
  Save,
  ShieldAlert,
  Shield,
  Trash2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  SkillBundle,
  SkillOrigin,
} from "@/lib/agents/skills/types";
import type { AuditSummary } from "@/lib/agents/skills/audits";
import { useLocale } from "@/i18n/use-locale";

const ORIGIN_LABEL: Record<SkillOrigin, string> = {
  "cabinet-scoped": "Cabinet (scoped)",
  "cabinet-root": "Cabinet (root)",
  "linked-repo": "Linked repo",
  system: "System",
  "legacy-home": "Legacy ~/.cabinet",
};

function SafetyCheck({
  ok,
  okLabel,
  warnLabel,
}: {
  ok: boolean;
  okLabel: string;
  warnLabel: string;
}) {
  const { t } = useLocale();
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[11px]",
        ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
      )}
    >
      {ok ? <Check className="size-3" /> : <ShieldAlert className="size-3" />}
      <span>{ok ? okLabel : warnLabel}</span>
    </div>
  );
}

interface SkillDetailProps {
  skillKey: string;
  cabinetPath?: string;
  /**
   * Called when the user successfully deletes the skill. Hosts (e.g. the
   * Dialog inside SkillLibrary) use this to dismiss the surrounding chrome.
   * If omitted, the component just clears local state on delete.
   */
  onClose?: () => void;
}

export function SkillDetail({ skillKey, cabinetPath, onClose }: SkillDetailProps) {
  const { t } = useLocale();
  const [bundle, setBundle] = useState<SkillBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  // Editable fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allowedTools, setAllowedTools] = useState("");
  const [body, setBody] = useState("");
  const [audits, setAudits] = useState<AuditSummary | null>(null);
  const [skillsShPath, setSkillsShPath] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cabinetPath) params.set("cabinet", cabinetPath);
      const res = await fetch(`/api/agents/skills/${encodeURIComponent(skillKey)}?${params}`);
      if (!res.ok) throw new Error(`load failed: ${res.statusText}`);
      const data = (await res.json()) as {
        skill: SkillBundle;
        audits?: AuditSummary | null;
        skillsShPath?: string | null;
      };
      setBundle(data.skill);
      setName(data.skill.name);
      setDescription(data.skill.description ?? "");
      setAllowedTools(data.skill.allowedTools.join("\n"));
      setBody(data.skill.body);
      setAudits(data.audits ?? null);
      setSkillsShPath(data.skillsShPath ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, [skillKey, cabinetPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = useCallback(async () => {
    if (!bundle) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      const params = new URLSearchParams();
      if (cabinetPath) params.set("cabinet", cabinetPath);
      const frontmatter: Record<string, unknown> = { name, description };
      const tools = allowedTools
        .split(/[\n,]/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (tools.length > 0) frontmatter["allowed-tools"] = tools.join(", ");
      const res = await fetch(`/api/agents/skills/${encodeURIComponent(skillKey)}?${params}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, frontmatter }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `save failed: ${res.statusText}`);
      }
      setSaveStatus("saved");
      await refresh();
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }, [bundle, skillKey, cabinetPath, name, description, allowedTools, body, refresh]);

  const handleDelete = useCallback(async () => {
    if (!bundle) return;
    if (!confirm(`Delete skill "${bundle.key}"? Files will be removed from disk.`)) return;
    const params = new URLSearchParams();
    if (cabinetPath) params.set("cabinet", cabinetPath);
    const res = await fetch(`/api/agents/skills/${encodeURIComponent(skillKey)}?${params}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert(`Delete failed: ${(await res.json().catch(() => ({}))).error || res.statusText}`);
      return;
    }
    onClose?.();
  }, [bundle, skillKey, cabinetPath, onClose]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-8">
        <Loader2 className="size-3.5 animate-spin" /> Loading…
      </div>
    );
  }
  if (error || !bundle) {
    return (
      <div className="p-8 text-sm text-destructive flex items-start gap-2">
        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
        {error ?? "Skill not found."}
      </div>
    );
  }

  const readOnly = !bundle.editable;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h2 className="text-sm font-semibold truncate">{bundle.name}</h2>
          <code className="text-[11px] text-muted-foreground font-mono shrink-0">{bundle.key}</code>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
            {ORIGIN_LABEL[bundle.origin]}
          </span>
          {readOnly && (
            <Lock
              className="size-3.5 text-muted-foreground shrink-0"
              aria-label={`Read-only — origin ${bundle.origin}`}
            />
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!readOnly && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                aria-label={t("tinyExtras:deleteSkill")}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="size-3.5 mr-1 animate-spin" />
                ) : saveStatus === "saved" ? (
                  <Check className="size-3.5 mr-1" />
                ) : (
                  <Save className="size-3.5 mr-1" />
                )}
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 border-r border-border overflow-y-auto">
          <div className="p-4 flex flex-col gap-4 h-full">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
              Body (markdown)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={readOnly}
              spellCheck={false}
              className={cn(
                "block w-full flex-1 min-h-[40vh] font-mono text-xs p-3 bg-card border border-border rounded-md resize-none",
                "focus:outline-none focus:ring-2 focus:ring-ring",
                readOnly && "cursor-not-allowed opacity-70",
              )}
            />
          </div>
        </div>

        <div className="w-80 shrink-0 overflow-y-auto">
          <div className="p-4 flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Name
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
            </section>

            <section className="flex flex-col gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Description (routing logic)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={readOnly}
                rows={4}
                className={cn(
                  "w-full text-xs p-2 bg-card border border-border rounded-md",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  readOnly && "cursor-not-allowed opacity-70",
                )}
              />
            </section>

            <section className="flex flex-col gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Allowed tools (one per line)
              </label>
              <textarea
                value={allowedTools}
                onChange={(e) => setAllowedTools(e.target.value)}
                disabled={readOnly}
                rows={4}
                placeholder={"Bash(git status)\nBash(npm *)"}
                className={cn(
                  "w-full font-mono text-[11px] p-2 bg-card border border-border rounded-md",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  readOnly && "cursor-not-allowed opacity-70",
                )}
              />
            </section>

            <AuditsSection audits={audits} bundle={bundle} skillsShPath={skillsShPath} />

            {bundle.fileInventory.some((f) => f.path.startsWith("evals/")) && (
              <section className="border-t border-border pt-3">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <ClipboardCheck className="size-3" />
                  Evals
                </label>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  This skill ships{" "}
                  {bundle.fileInventory.filter((f) => f.path.startsWith("evals/")).length}{" "}
                  evaluation file
                  {bundle.fileInventory.filter((f) => f.path.startsWith("evals/")).length === 1
                    ? ""
                    : "s"}{" "}
                  under{" "}
                  <code className="font-mono text-[10px]">evals/</code>. A built-in
                  &quot;Run evals&quot; runner is on the roadmap; for now, run them
                  manually against your CLI when adopting a third-party skill.
                </p>
              </section>
            )}

            {bundle.fileInventory.length > 0 && (
              <section className="border-t border-border pt-3">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Bundle ({bundle.fileInventory.length})
                </label>
                <div className="mt-1.5 flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {bundle.fileInventory.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center justify-between text-[10px] font-mono"
                    >
                      <span className="text-muted-foreground truncate">{file.path}</span>
                      <span className="text-muted-foreground/60 ml-2">{file.kind}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const AUDIT_SOURCES = [
  { key: "ath", label: "ATH" },
  { key: "socket", label: "Socket" },
  { key: "snyk", label: "Snyk" },
  { key: "zeroleaks", label: "zeroleaks" },
] as const;

const PASSING_RISK = new Set(["safe", "low", "none"]);

function AuditsSection({
  audits,
  bundle,
  skillsShPath,
}: {
  audits: AuditSummary | null;
  bundle: SkillBundle;
  /**
   * `<owner>/<repo>/<skill>` segment, used to deep-link each audit pill to
   * its full report on skills.sh. Null when the skill wasn't installed from
   * a github source we can resolve to a public skills.sh page.
   */
  skillsShPath: string | null;
}) {
  const scriptCount = bundle.fileInventory.filter((f) => f.kind === "script").length;
  const hasCatchAll = bundle.allowedTools.some((t) => /\(\s*\*\s*\)/.test(t));

  return (
    <section className="border-t border-border pt-3">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Shield className="size-3" />
        Security
        {audits?.available && audits.total > 0 && (
          <span className="ml-auto text-muted-foreground/70 normal-case">
            audits {audits.passed}/{audits.total} passed
          </span>
        )}
      </label>
      <div className="mt-1.5 flex flex-col gap-1">
        <SafetyCheck
          ok={scriptCount === 0}
          okLabel="No executable scripts"
          warnLabel={`${scriptCount} executable script${scriptCount === 1 ? "" : "s"}`}
        />
        <SafetyCheck
          ok={!hasCatchAll}
          okLabel="No catch-all tool grants"
          warnLabel="Catch-all tool grant (e.g. Bash(*))"
        />
      </div>
      {!audits || !audits.available ? (
        <p className="text-[11px] text-muted-foreground/70 mt-2">
          Audits unavailable — no upstream source recorded.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {AUDIT_SOURCES.map(({ key, label }) => {
            const block = audits.raw[key];
            // Build the deep-link to skills.sh's audit page when we have the
            // upstream provenance. Falls back to a non-interactive span when
            // the skill wasn't installed from a resolvable github source.
            const href = skillsShPath
              ? `https://skills.sh/${skillsShPath}/security/${key}`
              : null;
            if (!block?.risk) {
              const inactiveClass =
                "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground/60";
              const inactiveTitle = `${label}: no signal${href ? " (open report on skills.sh)" : ""}`;
              const inactiveContent = (
                <>
                  <span className="font-medium">{label}</span>
                  <span>—</span>
                </>
              );
              return href ? (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(inactiveClass, "hover:bg-muted/80 hover:text-muted-foreground")}
                  title={inactiveTitle}
                >
                  {inactiveContent}
                </a>
              ) : (
                <span key={key} className={inactiveClass} title={inactiveTitle}>
                  {inactiveContent}
                </span>
              );
            }
            const passed = PASSING_RISK.has(block.risk.toLowerCase());
            const activeClass = cn(
              "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full",
              passed
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400",
            );
            const activeTitle = `${label}: ${block.risk}${
              block.alerts != null ? ` · ${block.alerts} alerts` : ""
            }${href ? " — open full report on skills.sh" : ""}`;
            const activeContent = (
              <>
                {passed ? (
                  <Check className="size-2.5" />
                ) : (
                  <ShieldAlert className="size-2.5" />
                )}
                <span className="font-medium">{label}</span>
                <span className="opacity-70">{block.risk}</span>
              </>
            );
            return href ? (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  activeClass,
                  passed
                    ? "hover:bg-emerald-500/20"
                    : "hover:bg-red-500/20",
                )}
                title={activeTitle}
              >
                {activeContent}
              </a>
            ) : (
              <span key={key} className={activeClass} title={activeTitle}>
                {activeContent}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}

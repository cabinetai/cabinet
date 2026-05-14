"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Library,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldAlert,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SkillEntry, SkillOrigin } from "@/lib/agents/skills/types";
import { SkillAddDialog } from "./skill-add-dialog";
import { SkillDetail } from "./skill-detail";
import { useLocale } from "@/i18n/use-locale";

interface ScanResult {
  path: string;
  key: string;
  name: string;
  source: string;
  workspace: string;
}

interface SkillEntryWithStats extends SkillEntry {
  stats: { lastOfferedAt: string; offerCount: number } | null;
  upstream: { source: string; stars: number | null; installs: number | null } | null;
}

type DiscoverState =
  | { status: "idle" }
  | { status: "importing" }
  | { status: "imported" }
  | { status: "error"; message: string };

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const ORIGIN_LABEL: Record<SkillOrigin, string> = {
  "cabinet-scoped": "Cabinet (scoped)",
  "cabinet-root": "Cabinet (root)",
  "linked-repo": "Linked repo",
  system: "System",
  "legacy-home": "Legacy ~/.cabinet",
};

const ORIGIN_TINT: Record<SkillOrigin, string> = {
  "cabinet-scoped": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "cabinet-root": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "linked-repo": "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  system: "bg-muted text-muted-foreground",
  "legacy-home": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function pluginBadgeLabel(skill: SkillEntryWithStats): string | null {
  if (!skill.pluginSource) return null;
  const { marketplace, plugin, external } = skill.pluginSource;
  const label = marketplace === plugin ? marketplace : `${marketplace}/${plugin}`;
  return external ? `${label} (external)` : label;
}

function SkillCard({
  skill,
  onDelete,
  onOpen,
}: {
  skill: SkillEntryWithStats;
  onDelete?: (key: string) => void;
  /** When provided, the card becomes a button that opens the skill detail dialog. */
  onOpen?: (key: string) => void;
}) {
  const { t } = useLocale();
  const pluginLabel = pluginBadgeLabel(skill);
  const inner = (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-[13px] font-semibold truncate">{skill.name}</h3>
            <span
              className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                ORIGIN_TINT[skill.origin],
              )}
              title={`Origin: ${ORIGIN_LABEL[skill.origin]}`}
            >
              {ORIGIN_LABEL[skill.origin]}
            </span>
            {pluginLabel && (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400"
                title={`Claude Code plugin: ${pluginLabel}`}
              >
                {pluginLabel}
              </span>
            )}
            {!skill.editable && (
              <Lock
                className="size-3 text-muted-foreground"
                aria-label={t("skillLibrary:readOnly")}
              />
            )}
          </div>
          <code className="text-[11px] text-muted-foreground font-mono">{skill.key}</code>
          {skill.description && (
            <p className="text-[12px] text-muted-foreground mt-1.5 line-clamp-2">
              {skill.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-1">
        {skill.upstream && skill.upstream.stars != null ? (
          <div
            className="flex items-center gap-1 text-[10px] text-muted-foreground"
            title={`${skill.upstream.stars.toLocaleString()} stars on ${skill.upstream.source}`}
          >
            <Star className="size-3" />
            {formatCount(skill.upstream.stars)}
          </div>
        ) : null}
        {skill.upstream && skill.upstream.installs != null ? (
          <div
            className="flex items-center gap-1 text-[10px] text-muted-foreground"
            title={`${skill.upstream.installs.toLocaleString()} installs on skills.sh`}
          >
            <Download className="size-3" />
            {formatCount(skill.upstream.installs)}
          </div>
        ) : null}
        {!skill.upstream && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
            title={t("skillLibrary:noUpstream")}
          >
            Custom
          </span>
        )}
        {skill.trustLevel === "scripts_executables" && (
          <div
            className="flex items-center gap-1 text-[10px] text-amber-500"
            title={t("skillLibrary:executableWarning")}
          >
            <ShieldAlert className="size-3" />
            scripts
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          {skill.allowedTools.length > 0 && (
            <div
              className="text-[10px] text-muted-foreground truncate min-w-0"
              title={skill.allowedTools.join(", ")}
            >
              tools: {skill.allowedTools.length}
            </div>
          )}
          {skill.stats && (
            <div
              className="text-[10px] text-muted-foreground"
              title={`Offered ${skill.stats.offerCount} time${
                skill.stats.offerCount === 1 ? "" : "s"
              } · last ${skill.stats.lastOfferedAt}`}
            >
              {formatRelative(skill.stats.lastOfferedAt)}
            </div>
          )}
          {onDelete && skill.editable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(skill.key);
              }}
              aria-label={`Delete ${skill.key}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (onOpen) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(skill.key)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(skill.key);
          }
        }}
        className="block text-left w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      >
        {inner}
      </div>
    );
  }
  return inner;
}

interface SkillLibraryProps {
  cabinetPath?: string;
}

export function SkillLibrary({ cabinetPath }: SkillLibraryProps = {}) {
  const { t } = useLocale();
  const [entries, setEntries] = useState<SkillEntryWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemOpen, setSystemOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [openSkillKey, setOpenSkillKey] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<ScanResult[]>([]);
  const [discoverState, setDiscoverState] = useState<Record<string, DiscoverState>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cabinetPath) params.set("cabinet", cabinetPath);
      const [libRes, scanRes] = await Promise.all([
        fetch(`/api/agents/skills?${params}`),
        fetch(`/api/agents/skills/scan?${params}`),
      ]);
      if (!libRes.ok) throw new Error("failed to load skills");
      const libData = (await libRes.json()) as { entries: SkillEntryWithStats[] };
      setEntries(libData.entries || []);

      // Auto-discover: any skill found in conventional competitor dirs
      // (.cursor/skills, .windsurf/skills, etc.) that isn't already managed
      // by Cabinet shows up in the "Discoverable" section. The library walks
      // cabinet-root + system origins natively — we only highlight what
      // *isn't* yet under Cabinet management.
      if (scanRes.ok) {
        const scanData = (await scanRes.json()) as { results: ScanResult[] };
        const managedKeys = new Set((libData.entries || []).map((e) => e.key));
        const managedPaths = new Set((libData.entries || []).map((e) => e.path));
        const undiscovered = (scanData.results || []).filter(
          (r) => !managedKeys.has(r.key) && !managedPaths.has(r.path),
        );
        setDiscovered(undiscovered);
      } else {
        setDiscovered([]);
      }
    } finally {
      setLoading(false);
    }
  }, [cabinetPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDiscoveredImport = useCallback(
    async (entry: ScanResult) => {
      setDiscoverState((prev) => ({ ...prev, [entry.path]: { status: "importing" } }));
      try {
        const scope = cabinetPath ? `cabinet:${cabinetPath}` : "root";
        const res = await fetch("/api/agents/skills/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: `local:${entry.path}`, scope }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `import failed (${res.status})`);
        }
        setDiscoverState((prev) => ({ ...prev, [entry.path]: { status: "imported" } }));
        // Re-fetch the library so the imported skill moves into the managed list.
        await refresh();
      } catch (err) {
        setDiscoverState((prev) => ({
          ...prev,
          [entry.path]: {
            status: "error",
            message: err instanceof Error ? err.message : "failed",
          },
        }));
      }
    },
    [cabinetPath, refresh],
  );

  const { managed, system } = useMemo(() => {
    const managed: SkillEntryWithStats[] = [];
    const system: SkillEntryWithStats[] = [];
    for (const entry of entries) {
      if (entry.origin === "system" || entry.origin === "legacy-home") {
        system.push(entry);
      } else {
        managed.push(entry);
      }
    }
    return { managed, system };
  }, [entries]);

  const handleDelete = useCallback(
    async (key: string) => {
      if (!confirm(`Delete skill "${key}"? Files will be removed from disk.`)) return;
      const params = new URLSearchParams();
      if (cabinetPath) params.set("cabinet", cabinetPath);
      const res = await fetch(`/api/agents/skills/${encodeURIComponent(key)}?${params}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert(`Delete failed: ${(await res.json().catch(() => ({}))).error || res.statusText}`);
        return;
      }
      await refresh();
    },
    [cabinetPath, refresh],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Library className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{t("skillLibrary:skills")}</h2>
          <span className="text-xs text-muted-foreground">({managed.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
            aria-label={t("skillLibraryPlus:refresh")}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5 mr-1" />
            Add Skill
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 flex flex-col gap-2">
          {loading && entries.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-8">Loading…</div>
          )}
          {!loading && managed.length === 0 && system.length === 0 && (
            <div className="text-center py-12 flex flex-col items-center gap-2">
              <Library className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t("skillLibraryPlus:noSkills")}</p>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                Add your first skill
              </Button>
            </div>
          )}

          {managed.map((entry) => (
            <SkillCard
              key={entry.path}
              skill={entry}
              onDelete={handleDelete}
              onOpen={setOpenSkillKey}
            />
          ))}

          {discovered.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setDiscoverOpen((v) => !v)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-2 w-full"
              >
                {discoverOpen ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
                <Download className="size-3" />
                Discoverable in your workspace ({discovered.length}) — click to import
              </button>
              {discoverOpen && (
                <div className="flex flex-col gap-1.5 mt-1 pl-2 border-l border-border">
                  {discovered.map((entry) => {
                    const state = discoverState[entry.path] ?? { status: "idle" };
                    const isImporting = state.status === "importing";
                    const isImported = state.status === "imported";
                    const isError = state.status === "error";
                    return (
                      <div
                        key={entry.path}
                        className={cn(
                          "flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-card",
                          isImported && "border-emerald-500/40 bg-emerald-500/5",
                          isError && "border-destructive/40",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <code className="text-[11px] font-mono">{entry.key}</code>
                            <span className="text-[10px] text-muted-foreground">
                              {entry.source}
                            </span>
                          </div>
                          {isError && (
                            <div className="text-[10px] text-destructive mt-0.5">
                              {state.message}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={isImported ? "ghost" : "outline"}
                          disabled={isImporting || isImported}
                          onClick={() => handleDiscoveredImport(entry)}
                          className="shrink-0 h-7"
                        >
                          {isImporting ? (
                            <Loader2 className="size-3 mr-1 animate-spin" />
                          ) : isImported ? (
                            <Check className="size-3 mr-1" />
                          ) : null}
                          {isImported ? "Imported" : isImporting ? "Importing…" : "Import"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {system.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setSystemOpen((v) => !v)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-2 w-full"
              >
                {systemOpen ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
                <ExternalLink className="size-3" />
                Also available from your local install ({system.length})
              </button>
              {systemOpen && (
                <div className="flex flex-col gap-2 mt-1 pl-2 border-l border-border">
                  {system.map((entry) => (
                    <SkillCard
                      key={entry.path}
                      skill={entry}
                      onOpen={setOpenSkillKey}
                    />
                  ))}
                  <p className="text-[10px] text-muted-foreground/80 px-1 py-2 flex items-start gap-1">
                    <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                    These skills are loaded by your local Claude/Codex install. Cabinet doesn&apos;t
                    manage them and they won&apos;t be bundled when this cabinet is exported.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {addOpen && (
        <SkillAddDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          cabinetPath={cabinetPath}
          onImported={async () => {
            await refresh();
            setAddOpen(false);
          }}
        />
      )}

      <Dialog
        open={openSkillKey !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenSkillKey(null);
            // Re-fetch on close so any edits made in the detail dialog
            // (description, body, trust-policy) refresh the library cards.
            void refresh();
          }
        }}
      >
        <DialogContent
          className="w-[92vw] max-w-5xl sm:max-w-5xl p-0 gap-0 h-[85vh] flex flex-col overflow-hidden"
        >
          <DialogTitle className="sr-only">
            Skill detail{openSkillKey ? `: ${openSkillKey}` : ""}
          </DialogTitle>
          {openSkillKey && (
            <SkillDetail
              skillKey={openSkillKey}
              cabinetPath={cabinetPath}
              onClose={() => {
                setOpenSkillKey(null);
                void refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

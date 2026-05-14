"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  Star,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SkillCatalogBrowser } from "./skill-catalog-browser";
import { useLocale } from "@/i18n/use-locale";

interface RepoMeta {
  owner: string;
  repo: string;
  stars: number;
  forks: number;
  lastCommitISO: string | null;
  lastCommitAgeDays: number | null;
  defaultBranch: string;
  description: string | null;
  topics: string[];
}

interface AuditSummary {
  passed: number;
  total: number;
  available: boolean;
}

interface SkillMeta {
  key: string;
  name: string;
  description: string | null;
  path: string;
}

interface SkillAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cabinetPath?: string;
  onImported?: (key: string) => Promise<void> | void;
  /**
   * Pre-seed the source field (e.g. when invoked from a persona's
   * "Suggested for this role" pill). When set, the dialog jumps straight to
   * the preview pane on open; the catalog browser stays accessible behind it.
   */
  initialSource?: string;
  /**
   * Agent slugs to attach the imported skill to after successful import.
   * Used by the agent-detail "install + attach" flow.
   */
  attachToAgents?: string[];
}

function parsePreviewSource(raw: string): { owner: string; repo: string; skill?: string } | null {
  // Strip `npx skills add ...` / `skills add ...` prefix and pull a
  // `--skill <name>` flag out into a trailing `@<skill>` filter so the
  // existing patterns below match the result.
  let trimmed = raw.trim().replace(/^(?:npx\s+)?skills\s+add\s+/i, "");
  const flagMatch = trimmed.match(/\s+--skill[=\s]+([^\s]+)/);
  let flagSkill: string | undefined;
  if (flagMatch) {
    flagSkill = flagMatch[1];
    trimmed = trimmed.replace(flagMatch[0], "").trim();
  }
  const skillsSh = trimmed.match(/^https?:\/\/skills\.sh\/([^/]+)\/([^/]+)(?:\/([^/?#]+))?/);
  if (skillsSh) return { owner: skillsSh[1], repo: skillsSh[2], skill: skillsSh[3] ?? flagSkill };
  const gh = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/);
  if (gh) return { owner: gh[1], repo: gh[2], skill: flagSkill };
  // github:owner/repo@skill (CLI-style filter) or github:owner/repo/skill (path)
  const shorthandAt = trimmed.match(/^github:([^/]+)\/([^/@]+)@([^/?#]+)$/);
  if (shorthandAt) return { owner: shorthandAt[1], repo: shorthandAt[2], skill: shorthandAt[3] };
  const shorthand = trimmed.match(/^github:([^/]+)\/([^/]+)(?:\/([^/]+))?$/);
  if (shorthand) return { owner: shorthand[1], repo: shorthand[2], skill: shorthand[3] ?? flagSkill };
  return null;
}

export function SkillAddDialog({
  open,
  onOpenChange,
  cabinetPath,
  onImported,
  initialSource,
  attachToAgents,
}: SkillAddDialogProps) {
  const { t } = useLocale();
  const [source, setSource] = useState(initialSource ?? "");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<RepoMeta | null>(null);
  const [previewAudits, setPreviewAudits] = useState<AuditSummary | null>(null);
  const [previewSkillMeta, setPreviewSkillMeta] = useState<SkillMeta | null>(null);
  const [previewRequestedSkill, setPreviewRequestedSkill] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handlePreview = useCallback(async (override?: string) => {
    // Accept an optional source override so callers that just set the source
    // (e.g. catalog pick, initialSource auto-preview) don't race the render
    // and read a stale `source` value.
    const raw = (override ?? source).trim();
    setPreview(null);
    setPreviewAudits(null);
    setPreviewSkillMeta(null);
    setPreviewRequestedSkill(null);
    setPreviewError(null);
    const parsed = parsePreviewSource(raw);
    if (!parsed) {
      setPreviewError(
        "Unrecognized format. Try `github:owner/repo`, a github.com URL, or a skills.sh URL.",
      );
      return;
    }
    setPreviewing(true);
    try {
      const params = new URLSearchParams({ owner: parsed.owner, repo: parsed.repo });
      if (parsed.skill) params.set("skill", parsed.skill);
      const res = await fetch(`/api/agents/skills/catalog?${params}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `couldn't fetch ${parsed.owner}/${parsed.repo}`);
      }
      const data = (await res.json()) as {
        skill?: RepoMeta;
        audits?: AuditSummary | null;
        skillMeta?: SkillMeta | null;
        requestedSkill?: string | null;
      };
      if (data.skill) {
        setPreview(data.skill);
        setPreviewAudits(data.audits ?? null);
        setPreviewSkillMeta(data.skillMeta ?? null);
        setPreviewRequestedSkill(data.requestedSkill ?? parsed.skill ?? null);
      } else {
        setPreviewError("No metadata returned for that repo.");
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }, [source]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    setImportError(null);
    try {
      const scope = cabinetPath ? `cabinet:${cabinetPath}` : "root";
      const body: Record<string, unknown> = { source, scope };
      if (attachToAgents && attachToAgents.length > 0) {
        body.attachToAgents = attachToAgents;
      }
      const res = await fetch("/api/agents/skills/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; key?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "import failed");
      if (onImported && data.key) await onImported(data.key);
      setSource("");
      setPreview(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }, [source, cabinetPath, onImported, attachToAgents]);

  const [tab, setTab] = useState<"browse" | "paste">(
    initialSource ? "paste" : "browse",
  );

  // When the dialog opens with a pre-seeded source (from a "Suggested for
  // this role" pill), jump to the paste tab and auto-trigger a preview so
  // the user lands directly on the install button.
  useEffect(() => {
    if (open && initialSource) {
      setSource(initialSource);
      setTab("paste");
      void handlePreview(initialSource);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSource]);

  const handleCatalogPick = useCallback(
    (next: string) => {
      setSource(next);
      setTab("paste");
      setPreview(null);
      setPreviewAudits(null);
      setPreviewSkillMeta(null);
      setPreviewRequestedSkill(null);
      setPreviewError(null);
      // Auto-trigger the preview so the user doesn't have to click Preview
      // a second time after picking a result from the Browse tab.
      void handlePreview(next);
    },
    [handlePreview],
  );

  // Trust signals: prefer audit data when available; fall back to repo meta.
  const audited =
    previewAudits != null && previewAudits.available && previewAudits.total > 0;
  const allAuditsPass = audited && previewAudits.passed === previewAudits.total;
  const stale =
    preview?.lastCommitAgeDays != null && preview.lastCommitAgeDays > 365
      ? "red"
      : preview?.lastCommitAgeDays != null && preview.lastCommitAgeDays > 180
      ? "yellow"
      : null;
  const lowStars = preview != null && preview.stars < 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("skillAdd:addSkill")}</DialogTitle>
          <DialogDescription>
            Paste a skills.sh URL, GitHub URL, or `github:owner/repo[/skill]` shortcode.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex gap-1 border-b border-border">
            <button
              type="button"
              onClick={() => {
                // Going back to Browse: drop any preview/source carried over
                // from a Paste URL roundtrip so the user lands on a clean
                // search surface.
                setTab("browse");
                setSource("");
                setPreview(null);
                setPreviewAudits(null);
                setPreviewSkillMeta(null);
                setPreviewRequestedSkill(null);
                setPreviewError(null);
                setImportError(null);
              }}
              className={cn(
                "px-3 py-1.5 text-xs border-b-2 -mb-px",
                tab === "browse"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              Browse skills.sh
            </button>
            <button
              type="button"
              onClick={() => setTab("paste")}
              className={cn(
                "px-3 py-1.5 text-xs border-b-2 -mb-px",
                tab === "paste"
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              Paste URL
            </button>
          </div>

          {tab === "browse" ? (
            <SkillCatalogBrowser onPick={handleCatalogPick} />
          ) : (
            <div className="flex gap-2">
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="https://skills.sh/anthropics/skills/release"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePreview();
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePreview()}
                disabled={!source.trim() || previewing}
              >
                {previewing ? <Loader2 className="size-3.5 animate-spin" /> : "Preview"}
              </Button>
            </div>
          )}

          {tab === "paste" && previewError && (
            <div className="text-xs text-destructive flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              {previewError}
            </div>
          )}

          {tab === "paste" && preview && (
            <div className="border border-border rounded-md p-3 flex flex-col gap-2 bg-muted/30">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">
                  {previewSkillMeta?.name ?? previewRequestedSkill ?? `${preview.owner}/${preview.repo}`}
                </span>
                {audited ? (
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[10px] font-medium",
                      allAuditsPass
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400",
                    )}
                    title={t("skillAdd:auditTooltip")}
                  >
                    {allAuditsPass ? (
                      <ShieldCheck className="size-3" />
                    ) : (
                      <ShieldAlert className="size-3" />
                    )}
                    {previewAudits.passed}/{previewAudits.total} audits passed
                  </span>
                ) : (
                  <span
                    className="flex items-center gap-1 text-[10px] text-muted-foreground/70"
                    title={t("skillAdd:auditUnavailable")}
                  >
                    <Shield className="size-3" />
                    audits unavailable
                  </span>
                )}
              </div>
              {(previewSkillMeta?.description ?? (previewRequestedSkill ? null : preview.description)) && (
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {previewSkillMeta?.description ?? preview.description}
                </p>
              )}
              {previewRequestedSkill && !previewSkillMeta && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                  <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                  Couldn&apos;t find <code className="font-mono">{previewRequestedSkill}</code> in this repo&apos;s file tree — install will still attempt a recursive search.
                </p>
              )}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="text-muted-foreground/70">
                  from <code className="font-mono">{preview.owner}/{preview.repo}</code>
                </span>
                <span className="flex items-center gap-1">
                  <Star className="size-3" />
                  {preview.stars.toLocaleString()}
                </span>
                {preview.lastCommitAgeDays != null && (
                  <span
                    className={cn(
                      "flex items-center gap-1",
                      stale === "red" && "text-red-500",
                      stale === "yellow" && "text-amber-500",
                    )}
                  >
                    <Clock className="size-3" />
                    {preview.lastCommitAgeDays}d ago
                  </span>
                )}
              </div>
              {(stale || lowStars || (audited && !allAuditsPass)) && (
                <div className="flex flex-col gap-1 mt-1">
                  {audited && !allAuditsPass && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                      <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                      {previewAudits.total - previewAudits.passed} of {previewAudits.total}{" "}
                      external audits flagged risk — review source before installing.
                    </div>
                  )}
                  {lowStars && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                      <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                      Few stars — this skill has limited community adoption.
                    </div>
                  )}
                  {stale === "red" && (
                    <div className="text-[11px] text-red-500 flex items-start gap-1.5">
                      <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                      Stale — last commit over a year ago. May be unmaintained.
                    </div>
                  )}
                  {stale === "yellow" && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                      <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                      Last commit over 6 months ago.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {importError && (
            <div className="text-xs text-destructive flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              {importError}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">{t("skillAddPlus:cancel")}</Button>} />
          <Button
            onClick={handleImport}
            disabled={tab !== "paste" || !source.trim() || importing}
          >
            {importing ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : null}
            Install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

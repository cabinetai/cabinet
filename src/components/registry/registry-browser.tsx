"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Archive,
  Bot,
  Clock,
  Download,
  FolderTree,
  FolderOpen,
  Loader2,
  Search,
  ChevronRight,
  Star,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTreeStore } from "@/stores/tree-store";
import { useAppStore } from "@/stores/app-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import type { RegistryTemplate } from "@/lib/registry/registry-manifest";
import { useLocale } from "@/i18n/use-locale";

/* ─── Parchment palette ─── */
const P = {
  bg:             "#FAF6F1",
  bgWarm:         "#F3EDE4",
  bgCard:         "#FFFFFF",
  textPrimary:    "#3B2F2F",
  textSecondary:  "#6B5B4F",
  textTertiary:   "#A89888",
  textMuted:      "#D4C8BB",
  accent:         "#8B5E3C",
  accentWarm:     "#7A4F30",
  accentBg:       "#F5E6D3",
  accentBgSubtle: "#FAF2EA",
  border:         "#E8DDD0",
  borderDark:     "#D4C4B0",
} as const;

/* ─── Types (mirrors the API response) ─── */
interface AgentInfo {
  name: string;
  slug: string;
  emoji: string;
  type: string;
  department: string;
  role: string;
  heartbeat: string;
}

interface JobInfo {
  id: string;
  name: string;
  description: string;
  ownerAgent: string;
  enabled: boolean;
  schedule: string;
}

interface ChildInfo {
  path: string;
  name: string;
  agents: AgentInfo[];
  jobs: JobInfo[];
}

interface RegistryDetail {
  slug: string;
  meta: { name: string; description: string; version: string };
  agents: AgentInfo[];
  jobs: JobInfo[];
  children: ChildInfo[];
  readme: string;
  readmeHtml: string;
  tags: string[];
  domain: string;
  coverUrl: string | null;
  stats: { totalAgents: number; totalJobs: number; totalCabinets: number };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Org chart components
───────────────────────────────────────────────────────────────────────────── */

function VLine({ height = 16 }: { height?: number }) {
  return (
    <div
      className="mx-auto"
      style={{ width: 1.5, height, background: P.accent, opacity: 0.35 }}
    />
  );
}

function HBranch({ count }: { count: number }) {
  if (count <= 1) return <VLine height={16} />;
  const edgeInset = count <= 2 ? 25 : count <= 3 ? 16.67 : 12.5;
  const spacing = (100 - edgeInset * 2) / (count - 1);
  return (
    <div className="relative h-4 mx-4">
      <div
        className="absolute top-0"
        style={{
          left: `${edgeInset}%`, right: `${edgeInset}%`,
          height: 1.5, background: P.accent, opacity: 0.35,
        }}
      />
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${edgeInset + i * spacing}%`, top: 0,
            width: 1.5, height: 16, background: P.accent, opacity: 0.35,
          }}
        />
      ))}
    </div>
  );
}

function OrgRootNode({ name, childCount }: { name: string; childCount: number }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 mx-auto"
      style={{ borderColor: "rgba(139,94,60,0.3)", backgroundColor: P.accentBg }}
    >
      <FolderTree className="w-5 h-5 shrink-0" style={{ color: P.accent }} />
      <div>
        <p className="text-base font-bold" style={{ color: P.accentWarm }}>{name}</p>
        {childCount > 0 && (
          <p className="text-[10px] font-mono" style={{ color: `${P.accent}99` }}>
            {childCount} child cabinet{childCount > 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function OrgDeptNode({ name }: { name: string }) {
  return (
    <div
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 mx-auto"
      style={{ borderColor: "rgba(139,94,60,0.25)", backgroundColor: P.accentBgSubtle }}
    >
      <FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color: P.accent }} />
      <span className="text-xs font-semibold font-mono" style={{ color: P.accentWarm }}>{name}</span>
    </div>
  );
}

function OrgAgentNode({ agent }: { agent: AgentInfo }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5 w-full max-w-[170px]"
      style={{ borderColor: "rgba(139,94,60,0.2)", backgroundColor: P.bgCard }}
    >
      <span className="text-base shrink-0">{agent.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold truncate leading-tight" style={{ color: P.textPrimary }}>
          {agent.name}
        </p>
        <p className="text-[9px] truncate leading-tight font-mono mt-0.5" style={{ color: P.textTertiary }}>
          .agents/{agent.slug}/
        </p>
      </div>
    </div>
  );
}

function OrgJobNode({ job }: { job: JobInfo }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-lg border px-2 py-1 w-full max-w-[170px]"
      style={{ borderColor: "rgba(139,94,60,0.15)", backgroundColor: P.bgCard }}
    >
      <Clock className="w-3 h-3 shrink-0" style={{ color: P.accent }} />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium truncate leading-tight" style={{ color: P.textPrimary }}>
          {job.name}
        </p>
        <p className="text-[8px] truncate leading-tight font-mono" style={{ color: `${P.accent}80` }}>
          {job.schedule}
        </p>
      </div>
    </div>
  );
}

function OrgChildCabinetNode({ name, agentCount }: { name: string; agentCount: number }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5 w-full max-w-[170px]"
      style={{ borderColor: "rgba(139,94,60,0.2)", backgroundColor: P.bgCard }}
    >
      <FolderTree className="w-3.5 h-3.5 shrink-0" style={{ color: P.accent }} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold truncate leading-tight" style={{ color: P.textPrimary }}>
          {name}
        </p>
        <p className="text-[9px] truncate leading-tight font-mono mt-0.5" style={{ color: P.textTertiary }}>
          {agentCount} agent{agentCount !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

function OrgTreeLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-mono uppercase tracking-[0.15em] font-semibold mt-2.5 mb-1" style={{ color: `${P.accent}99` }}>
      {children}
    </p>
  );
}

function groupAgentsByDepartment(agents: AgentInfo[]): Record<string, AgentInfo[]> {
  const groups: Record<string, AgentInfo[]> = {};
  for (const agent of agents) {
    const dept = agent.department || "general";
    if (!groups[dept]) groups[dept] = [];
    groups[dept].push(agent);
  }
  return groups;
}

function OrgChart({ detail }: { detail: RegistryDetail }) {
  const allAgents = [...detail.agents, ...detail.children.flatMap((c) => c.agents)];
  const allJobs = [...detail.jobs, ...detail.children.flatMap((c) => c.jobs)];
  const departments = groupAgentsByDepartment(allAgents);
  const deptNames = Object.keys(departments);
  const maxCols = Math.min(deptNames.length, 4);
  const gridCols =
    maxCols <= 1 ? "grid-cols-1" :
    maxCols <= 2 ? "grid-cols-2" :
    maxCols <= 3 ? "grid-cols-3" : "grid-cols-4";

  const getAgentJobs = (slug: string) => allJobs.filter((j) => j.ownerAgent === slug);

  const renderDeptColumn = (dept: string) => {
    const agents = departments[dept];
    return (
      <div key={dept} className="flex flex-col items-center">
        <OrgDeptNode name={dept} />
        <VLine height={10} />
        <OrgTreeLabel>agents</OrgTreeLabel>
        <div className="space-y-1.5 w-full flex flex-col items-center">
          {agents.map((agent) => {
            const agentJobs = getAgentJobs(agent.slug);
            return (
              <div key={agent.slug} className="w-full flex flex-col items-center">
                <OrgAgentNode agent={agent} />
                {agentJobs.length > 0 && (
                  <div className="mt-1 space-y-1 w-full flex flex-col items-center">
                    {agentJobs.map((job) => <OrgJobNode key={job.id} job={job} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className="rounded-xl border p-3 sm:p-6 overflow-x-auto"
      style={{ borderColor: P.border, backgroundColor: P.bgCard }}
    >
      <div className="w-full min-w-[320px] max-w-[720px] mx-auto">
        {/* Root */}
        <div className="flex justify-center">
          <OrgRootNode name={detail.meta.name} childCount={detail.children.length} />
        </div>

        <VLine height={20} />
        <HBranch count={maxCols} />

        {/* First row of departments (max 4) */}
        <div className={`grid ${gridCols} gap-3`}>
          {deptNames.slice(0, 4).map(renderDeptColumn)}
        </div>

        {/* Overflow departments */}
        {deptNames.length > 4 && (
          <>
            <VLine height={16} />
            <HBranch count={Math.min(deptNames.length - 4, 4)} />
            <div className={`grid ${
              deptNames.length - 4 <= 2 ? "grid-cols-2" :
              deptNames.length - 4 <= 3 ? "grid-cols-3" : "grid-cols-4"
            } gap-3`}>
              {deptNames.slice(4, 8).map(renderDeptColumn)}
            </div>
          </>
        )}

        {/* Child cabinets */}
        {detail.children.length > 0 && (
          <>
            <div className="flex justify-center mt-6">
              <OrgTreeLabel>child cabinets</OrgTreeLabel>
            </div>
            <div className="flex justify-center gap-3 flex-wrap mt-1">
              {detail.children.map((child) => (
                <OrgChildCabinetNode key={child.path} name={child.name} agentCount={child.agents.length} />
              ))}
            </div>
          </>
        )}

        {/* Stats footer */}
        <div
          className="flex justify-center gap-6 mt-6 pt-4 border-t"
          style={{ borderColor: P.border }}
        >
          {[
            { val: allAgents.length, label: "Agents" },
            { val: allJobs.length, label: "Jobs" },
            { val: deptNames.length, label: "Depts" },
            { val: detail.stats.totalCabinets, label: "Cabinets" },
          ].map(({ val, label }) => (
            <div key={label} className="text-center">
              <p className="text-lg font-bold" style={{ color: P.accent }}>{val}</p>
              <p className="text-[9px] font-mono uppercase tracking-wider" style={{ color: P.textTertiary }}>{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Section label
───────────────────────────────────────────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-mono uppercase tracking-[0.2em] font-semibold mb-4" style={{ color: P.accent }}>
      {children}
    </p>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Agent card (matches website)
───────────────────────────────────────────────────────────────────────────── */
function RegistryAgentCard({ agent }: { agent: AgentInfo }) {
  return (
    <div
      className="rounded-lg border p-4 transition-all duration-200 hover:shadow-sm"
      style={{ borderColor: P.border, backgroundColor: P.bgCard }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{agent.emoji}</span>
        <span className="font-medium text-sm" style={{ color: P.textPrimary }}>{agent.name}</span>
        <span
          className="ms-auto rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={agent.type === "lead"
            ? { backgroundColor: P.accentBg, color: P.accent }
            : { backgroundColor: P.bgWarm, color: P.textTertiary }}
        >
          {agent.type}
        </span>
      </div>
      <p className="text-xs line-clamp-2" style={{ color: P.textSecondary }}>
        {agent.role}
      </p>
      {agent.heartbeat && (
        <div className="mt-2 flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500/60" />
          <span className="text-[10px] font-mono" style={{ color: P.textTertiary }}>
            {agent.heartbeat}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Job card (matches website)
───────────────────────────────────────────────────────────────────────────── */
function RegistryJobCard({ job }: { job: JobInfo }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <Clock className="h-4 w-4 shrink-0" style={{ color: P.textTertiary }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-sm" style={{ color: P.textPrimary }}>{job.name}</span>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={job.enabled
              ? { backgroundColor: "#f0fdf4", color: "#15803d" }
              : { backgroundColor: P.bgWarm, color: P.textTertiary }}
          >
            {job.enabled ? "active" : "paused"}
          </span>
        </div>
        <p className="text-xs line-clamp-1" style={{ color: P.textSecondary }}>
          {job.description}
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-3 text-[11px] shrink-0 font-mono" style={{ color: P.textTertiary }}>
        <span>{job.schedule}</span>
        <span style={{ color: P.textMuted }}>|</span>
        <span>@{job.ownerAgent}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Tag badge
───────────────────────────────────────────────────────────────────────────── */
function TagBadge({ tag, active, onClick }: { tag: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-all duration-150"
      style={active
        ? { backgroundColor: P.accent, color: "#fff", cursor: "pointer" }
        : { backgroundColor: P.accentBg, color: P.accent, cursor: onClick ? "pointer" : "default" }}
    >
      {tag}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Registry list item
───────────────────────────────────────────────────────────────────────────── */
const DOMAIN_COLORS: Record<string, { bg: string; text: string }> = {
  Software:               { bg: "#fff7ed", text: "#c2410c" },
  "Professional Services":{ bg: "#ecfeff", text: "#0e7490" },
  Operations:             { bg: "#f8fafc", text: "#475569" },
  Media:                  { bg: "#faf5ff", text: "#7c3aed" },
  "E-commerce":           { bg: "#f0fdf4", text: "#15803d" },
  Sales:                  { bg: "#fff1f2", text: "#be123c" },
  Education:              { bg: "#f0fdfa", text: "#0f766e" },
  Lifestyle:              { bg: "#fdf4ff", text: "#a21caf" },
  Other:                  { bg: "#f5f5f4", text: "#57534e" },
};

function ListItem({ template, onClick }: { template: RegistryTemplate; onClick: () => void }) {
  const domainStyle = DOMAIN_COLORS[template.domain] || { bg: P.bgWarm, text: P.textTertiary };
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-4 w-full rounded-xl border px-4 py-3 text-left transition-all duration-200 hover:shadow-sm"
      style={{ borderColor: P.border, backgroundColor: P.bgCard }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = P.borderDark; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = P.border; }}
    >
      <div
        className="shrink-0 h-14 w-20 rounded-lg overflow-hidden border"
        style={{
          borderColor: P.border,
          backgroundColor: P.bgWarm,
          backgroundImage: template.coverUrl ? `url(${template.coverUrl})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        aria-hidden
      >
        {!template.coverUrl && (
          <div className="h-full w-full flex items-center justify-center text-lg" style={{ color: P.textMuted }}>
            <Archive className="h-5 w-5" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-semibold truncate transition-colors duration-150" style={{ color: P.textPrimary }}>
            {template.name}
          </h3>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: domainStyle.bg, color: domainStyle.text }}
          >
            {template.domain}
          </span>
        </div>
        <p className="text-sm line-clamp-1" style={{ color: P.textSecondary }}>
          {template.description}
        </p>
      </div>

      <div className="hidden sm:flex items-center gap-4 text-xs shrink-0" style={{ color: P.textTertiary }}>
        <span className="flex items-center gap-1"><Bot className="h-3.5 w-3.5" />{template.agentCount}</span>
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{template.jobCount}</span>
        {template.childCount > 0 && (
          <span className="flex items-center gap-1"><FolderTree className="h-3.5 w-3.5" />{template.childCount}</span>
        )}
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 transition-colors duration-150" style={{ color: P.textMuted }} />
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Detail view
───────────────────────────────────────────────────────────────────────────── */
function DetailView({
  slug,
  onBack,
  onImported,
}: {
  slug: string;
  onBack: () => void;
  onImported?: (template: RegistryTemplate, importedName: string) => void;
}) {
  const { t } = useLocale();
  const [detail, setDetail] = useState<RegistryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const loadTree = useTreeStore((s) => s.loadTree);
  // Install the template inside the cabinet the import was launched from (set on
  // the section when opening the registry). "." (home) means install top-level.
  const sectionCabinetPath = useAppStore((s) => s.section.cabinetPath);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/registry/${slug}`)
      .then((r) => { if (!r.ok) throw new Error("Failed to load"); return r.json(); })
      .then((data: RegistryDetail) => {
        if (!cancelled) {
          setDetail(data);
          setImportName(data.meta.name);
        }
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [slug]);

  const handleImport = async () => {
    if (!detail || importing) return;
    setImporting(true);
    setImportError(null);
    setImportOpen(false);

    try {
      const targetPath =
        sectionCabinetPath && sectionCabinetPath !== ROOT_CABINET_PATH
          ? sectionCabinetPath
          : undefined;
      const res = await fetch("/api/registry/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: detail.slug,
          name: importName.trim() !== detail.meta.name ? importName.trim() : undefined,
          targetPath,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setImportError((data as { error?: string }).error || "Import failed");
        setImporting(false);
        setImportOpen(true);
        return;
      }

      await res.json();
      if (onImported) {
        const tpl: RegistryTemplate = {
          slug: detail.slug,
          name: detail.meta.name,
          description: detail.meta.description,
          domain: detail.domain,
          version: detail.meta.version || "0.1.0",
          cover: null,
          coverUrl: detail.coverUrl ?? null,
          agentCount: detail.stats.totalAgents,
          jobCount: detail.stats.totalJobs,
          childCount: detail.stats.totalCabinets > 1 ? detail.stats.totalCabinets - 1 : 0,
          tags: detail.tags,
        };
        onImported(tpl, importName.trim() || detail.meta.name);
        setImporting(false);
        return;
      }
      await loadTree();
      window.location.reload();
    } catch {
      setImportError("Import failed. Check your internet connection.");
      setImporting(false);
      setImportOpen(true);
    }
  };

  const allAgents = detail ? [...detail.agents, ...detail.children.flatMap((c) => c.agents)] : [];
  const allJobs = detail ? [...detail.jobs, ...detail.children.flatMap((c) => c.jobs)] : [];

  return (
    <>
      {/* Fullscreen importing overlay */}
      {importing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: P.accent }} />
          <p className="mt-4 text-sm font-medium" style={{ color: P.textPrimary }}>
            Importing {detail?.meta.name || "cabinet"}...
          </p>
          <p className="mt-1 text-xs" style={{ color: P.textSecondary }}>
            Downloading agents, jobs, and content from the registry
          </p>
          <p className="mt-3 text-[11px]" style={{ color: P.textTertiary }}>
            Please do not refresh the page while importing
          </p>
        </div>
      )}

      <div className="flex flex-col h-full" style={{ backgroundColor: P.bg }}>
        {/* Top bar: back + import button */}
        <div
          className="flex items-center justify-between border-b px-6 py-3 shrink-0"
          style={{ borderColor: P.border, backgroundColor: P.bgWarm }}
        >
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm transition-colors duration-150"
            style={{ color: P.textTertiary }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = P.accent; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = P.textTertiary; }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to registry
          </button>
          {detail && (
            <button
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90"
              style={{ backgroundColor: P.accent }}
              onClick={() => { setImportName(detail.meta.name); setImportOpen(true); }}
            >
              <Download className="h-4 w-4" />
              Import Cabinet
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: P.textTertiary }} />
              <span className="ml-3 text-sm" style={{ color: P.textTertiary }}>{t("registry:loading")}</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-sm" style={{ color: "#dc2626" }}>{error}</p>
              <button
                className="mt-4 rounded-lg border px-4 py-2 text-sm transition-colors hover:opacity-80"
                style={{ borderColor: P.border, color: P.textPrimary }}
                onClick={onBack}
              >
                Back to list
              </button>
            </div>
          ) : detail ? (
            <>
              {/* Header section — warm background strip */}
              <div className="border-b" style={{ backgroundColor: P.bgWarm, borderColor: P.border }}>
                {detail.coverUrl && (
                  <div className="mx-auto max-w-4xl px-6 pt-8">
                    <div
                      className="relative w-full overflow-hidden rounded-xl border"
                      style={{
                        aspectRatio: "16 / 6",
                        borderColor: P.border,
                        backgroundColor: P.bgCard,
                        backgroundImage: `url(${detail.coverUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                      aria-hidden
                    />
                  </div>
                )}
                <div className="mx-auto max-w-4xl px-6 py-8">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: P.textPrimary }}>
                        {detail.meta.name}
                      </h1>
                      <span
                        className="rounded-full border px-2.5 py-0.5 text-xs font-mono"
                        style={{ borderColor: P.border, color: P.textTertiary }}
                      >
                        v{detail.meta.version}
                      </span>
                      {detail.domain && (() => {
                        const ds = DOMAIN_COLORS[detail.domain] || { bg: P.bgWarm, text: P.textTertiary };
                        return (
                          <span
                            className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: ds.bg, color: ds.text }}
                          >
                            {detail.domain}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-base max-w-2xl" style={{ color: P.textSecondary }}>
                      {detail.meta.description}
                    </p>
                    {detail.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {detail.tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex flex-wrap items-center gap-4 mt-5 text-sm" style={{ color: P.textTertiary }}>
                    <span className="flex items-center gap-1.5"><Bot className="h-4 w-4" />{detail.stats.totalAgents} agents</span>
                    <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{detail.stats.totalJobs} jobs</span>
                    <span className="flex items-center gap-1.5"><FolderTree className="h-4 w-4" />{detail.stats.totalCabinets} cabinet{detail.stats.totalCabinets !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>

              {/* Main content */}
              <div className="mx-auto max-w-4xl px-6 py-10 space-y-12">

                {/* Import CTA banner */}
                <div
                  className="rounded-xl border-2 border-dashed p-6 flex items-center justify-between gap-4"
                  style={{ borderColor: `${P.accent}55`, backgroundColor: P.accentBgSubtle }}
                >
                  <div>
                    <p className="font-semibold" style={{ color: P.textPrimary }}>{t("registry:readyToImport")}</p>
                    <p className="text-sm mt-1" style={{ color: P.textSecondary }}>
                      All {detail.stats.totalAgents} agents and {detail.stats.totalJobs} jobs will be set up automatically.
                    </p>
                  </div>
                  <button
                    className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shrink-0 transition-all hover:opacity-90"
                    style={{ backgroundColor: P.accent }}
                    onClick={() => { setImportName(detail.meta.name); setImportOpen(true); }}
                  >
                    <Download className="h-4 w-4" />
                    Import Cabinet
                  </button>
                </div>

                {/* Organization section */}
                <section>
                  <SectionLabel>{t("registry:organization")}</SectionLabel>
                  <OrgChart detail={detail} />
                </section>

                {/* Agents section */}
                {allAgents.length > 0 && (
                  <section>
                    <SectionLabel>{t("registry:agents")}</SectionLabel>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {allAgents.map((agent, i) => (
                        <RegistryAgentCard key={`${agent.slug}-${i}`} agent={agent} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Jobs section */}
                {allJobs.length > 0 && (
                  <section>
                    <SectionLabel>{t("registry:scheduledJobs")}</SectionLabel>
                    <div
                      className="rounded-xl border divide-y overflow-hidden"
                      style={{ borderColor: P.border, backgroundColor: P.bgCard }}
                    >
                      {allJobs.map((job) => (
                        <RegistryJobCard key={job.id} job={job} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Readme */}
                {detail.readmeHtml && (
                  <section>
                    <SectionLabel>{t("registry:about")}</SectionLabel>
                    <div
                      className="rounded-xl border p-6"
                      style={{ borderColor: P.border, backgroundColor: P.bgCard }}
                    >
                      <div
                        className="registry-prose"
                        style={
                          {
                            "--prose-body": P.textSecondary,
                            "--prose-heading": P.textPrimary,
                            "--prose-code-bg": P.bgWarm,
                            "--prose-border": P.border,
                            "--prose-link": P.accent,
                          } as React.CSSProperties
                        }
                        dangerouslySetInnerHTML={{ __html: detail.readmeHtml }}
                      />
                    </div>
                  </section>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={(v) => { if (!importing) setImportOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import {detail?.meta.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{detail?.meta.description}</p>
            {detail && (
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{detail.stats.totalAgents} agents</span>
                <span>{detail.stats.totalJobs} jobs</span>
                {detail.stats.totalCabinets > 1 && <span>{detail.stats.totalCabinets} cabinets</span>}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("registry:cabinetName")}</label>
              <Input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder={t("registry:cabinetNamePlaceholder")}
              />
              <p className="text-[11px] text-muted-foreground/70">
                Cabinet names can&apos;t be renamed later (for now). Choose wisely.
              </p>
            </div>
            {importError && <p className="text-xs text-destructive">{importError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleImport()}
                disabled={!importName.trim() || importing}
              >
                {importing ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="me-2 h-4 w-4" />
                )}
                Import
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main RegistryBrowser
───────────────────────────────────────────────────────────────────────────── */
export function RegistryBrowser({
  onImported,
}: {
  onImported?: (template: RegistryTemplate, importedName: string) => void;
} = {}) {
  const { t } = useLocale();
  const [templates, setTemplates] = useState<RegistryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/registry?limit=100")
      .then((r) => r.json())
      .then((data: { templates?: RegistryTemplate[] }) => { if (data.templates) setTemplates(data.templates); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => { if (t.domain) set.add(t.domain); });
    return Array.from(set).sort();
  }, [templates]);

  const filtered = useMemo(() => {
    let result = templates;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.domain.toLowerCase().includes(q)
      );
    }
    if (activeTags.length > 0) {
      result = result.filter((t) => activeTags.includes(t.domain));
    }
    return result;
  }, [templates, query, activeTags]);

  if (selectedSlug) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: P.bg }}>
        <DetailView
          slug={selectedSlug}
          onBack={() => setSelectedSlug(null)}
          onImported={onImported}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: P.bg }}>
      {/* Header */}
      <div className="border-b px-6 py-5 shrink-0" style={{ borderColor: P.border, backgroundColor: P.bgWarm }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-baseline gap-2">
              <Archive className="h-5 w-5 shrink-0 self-center" style={{ color: P.accent }} />
              <span
                className="font-logo italic tracking-[-0.01em] text-2xl"
                style={{ color: P.accent }}
              >
                Cabinets
              </span>
              <span
                className="text-sm font-normal"
                style={{ color: P.textSecondary }}
              >
                AI teams, off the shelf
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* cabinets.sh */}
            <a
              href="https://cabinets.sh"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                borderColor: P.borderDark,
                backgroundColor: P.accentBg,
                color: P.accent,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = P.accentBgSubtle;
                e.currentTarget.style.borderColor = P.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = P.accentBg;
                e.currentTarget.style.borderColor = P.borderDark;
              }}
            >
              <Globe className="h-3.5 w-3.5" />
              cabinets.sh
            </a>

            {/* GitHub star — filled accent */}
            <a
              href="https://github.com/hilash/cabinets"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                borderColor: P.accent,
                backgroundColor: P.accent,
                color: "#fff",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = P.accentWarm;
                e.currentTarget.style.borderColor = P.accentWarm;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = P.accent;
                e.currentTarget.style.borderColor = P.accent;
              }}
            >
              <Star className="h-3.5 w-3.5" />
              Star us
            </a>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: P.textTertiary }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("registry:searchPlaceholder")}
              className="w-full rounded-lg border ps-9 pe-4 py-2.5 text-sm outline-none transition-colors"
              style={{
                borderColor: P.border,
                backgroundColor: P.bgCard,
                color: P.textPrimary,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = P.accent; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = P.border; }}
            />
          </div>

          {/* Domain filter tags */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-6">
              {allTags.map((tag) => (
                <TagBadge
                  key={tag}
                  tag={tag}
                  active={activeTags.includes(tag)}
                  onClick={() =>
                    setActiveTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                    )
                  }
                />
              ))}
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: P.textTertiary }} />
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((template) => (
                <ListItem
                  key={template.slug}
                  template={template}
                  onClick={() => setSelectedSlug(template.slug)}
                />
              ))}
              {filtered.length === 0 && (
                <div className="py-12 text-center">
                  <p style={{ color: P.textTertiary }}>{t("registry:noResults")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

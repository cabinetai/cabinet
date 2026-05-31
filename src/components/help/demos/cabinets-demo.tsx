"use client";

import {
  Archive,
  ArrowDown,
  Briefcase,
  Check,
  ChevronDown,
  Code2,
  FileText,
  FolderTree,
  Megaphone,
  Search,
  Users,
} from "lucide-react";
import { TOUR_PALETTE as P } from "@/components/onboarding/tour/palette";
import { DemoSlideShell, type DemoConfig } from "../demo-modal";
import { useLocale } from "@/i18n/use-locale";

function CardChrome({ width = 320, children }: { width?: number; children: React.ReactNode }) {
  const { t } = useLocale();
  return (
    <div
      className="rounded-2xl"
      style={{
        width,
        background: P.bgCard,
        border: `1px solid ${P.border}`,
        boxShadow: `0 1px 0 rgba(59,47,47,0.04), 0 24px 48px -28px rgba(59,47,47,0.4)`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Slide 1: Nested teams ───────────────────────────────────────────── */
function SlideNested() {
  const { t } = useLocale();
  type Node = { label: string; depth: number; emphasis?: boolean; sub?: boolean; muted?: boolean };
  const tree: Node[] = [
    { label: "My Cabinet", depth: 0, emphasis: true },
    { label: "Marketing", depth: 1 },
    { label: "Brand", depth: 2, muted: true },
    { label: "Growth", depth: 2, muted: true },
    { label: "Engineering", depth: 1 },
    { label: "Backend", depth: 2, muted: true },
    { label: "Frontend", depth: 2, muted: true },
    { label: "Operations", depth: 1, sub: true },
  ];

  return (
    <DemoSlideShell
      title={
        <>
          A team of <span style={{ color: P.accent }}>{t("demosExtras:aiTeams")}</span>.
        </>
      }
      description={
        <>
          A cabinet is a self-contained AI team. Nest cabinets inside cabinets
          and you have a whole org chart of teams — each with their own
          agents, their own data, their own way of working.
        </>
      }
    >
      <div className="space-y-1.5" style={{ width: 360 }}>
        {tree.map((node, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-md px-3 py-2 opacity-0"
            style={{
              marginLeft: node.depth * 22,
              background: node.emphasis
                ? P.bgCard
                : node.muted
                  ? P.paper
                  : P.bgCard,
              border: `1px solid ${
                node.emphasis ? P.borderDark : P.borderLight
              }`,
              animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
              animationDelay: `${300 + i * 100}ms`,
            }}
          >
            <Archive
              className="h-3.5 w-3.5 shrink-0"
              style={{
                color: node.emphasis ? P.iconAmber : P.accent,
                opacity: node.muted ? 0.55 : 1,
              }}
            />
            <span
              className="text-[11.5px]"
              style={{
                color: node.muted ? P.textTertiary : node.emphasis ? P.text : P.textSecondary,
                fontWeight: node.emphasis ? 600 : 500,
              }}
            >
              {node.label}
            </span>
          </div>
        ))}
      </div>
    </DemoSlideShell>
  );
}

/* ── Slide 2: Each one a team ────────────────────────────────────────── */
function SlideEachATeam() {
  const agents = [
    { name: "PM", icon: Briefcase, role: "Lead" },
    { name: "Backend", icon: Code2, role: "Specialist" },
    { name: "Frontend", icon: Code2, role: "Specialist" },
    { name: "Researcher", icon: Search, role: "Specialist" },
  ];
  const pages = ["roadmap.md", "architecture.mmd", "metrics.csv"];

  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Each one a <span style={{ color: P.accent }}>team</span>.
        </>
      }
      description={
        <>
          Open a cabinet and you find a real workspace — its own agents, its
          own pages, its own routines. The Engineering cabinet has different
          people doing different things than Marketing.
        </>
      }
    >
      <CardChrome width={400}>
        <div
          className="flex items-center gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <Archive className="h-4 w-4" style={{ color: P.iconAmber }} />
          <span className="text-[13px] font-semibold" style={{ color: P.text }}>
            Engineering
          </span>
          <span
            className="ml-auto text-[10px]"
            style={{ color: P.textTertiary }}
          >
            child of My Cabinet
          </span>
        </div>

        {/* Agents row */}
        <div
          className="px-4 pt-3 opacity-0"
          style={{
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "300ms",
          }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="h-3 w-3" style={{ color: P.accent }} />
            <span
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: P.textTertiary }}
            >
              Agents
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {agents.map((a) => {
              const Icon = a.icon;
              return (
                <div
                  key={a.name}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5"
                  style={{
                    background: P.paperWarm,
                    border: `1px solid ${P.borderLight}`,
                  }}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-md"
                    style={{ background: P.accentBg, color: P.accent }}
                  >
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  <span className="text-[10px] font-semibold" style={{ color: P.text }}>
                    {a.name}
                  </span>
                  <span
                    className="ml-auto text-[8.5px]"
                    style={{ color: P.textTertiary }}
                  >
                    {a.role}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pages row */}
        <div
          className="px-4 py-3 opacity-0"
          style={{
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "700ms",
          }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <FileText className="h-3 w-3" style={{ color: P.accent }} />
            <span
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: P.textTertiary }}
            >
              Pages
            </span>
          </div>
          <div className="space-y-1">
            {pages.map((p) => (
              <div
                key={p}
                className="flex items-center gap-2 rounded-md px-2 py-1.5"
                style={{
                  background: P.bgCard,
                  border: `1px solid ${P.borderLight}`,
                }}
              >
                <FileText className="h-3 w-3" style={{ color: P.textTertiary }} />
                <span className="font-mono text-[10px]" style={{ color: P.textSecondary }}>
                  {p}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 3: Visibility, your call ──────────────────────────────────── */
function SlideVisibility() {
  const options = [
    { label: "This cabinet only", short: "Own", description: "Pages, agents, and tasks from this cabinet only", selected: true },
    { label: "Include direct children", short: "+1" },
    { label: "Include two cabinet levels", short: "+2" },
    { label: "Include all descendants", short: "All" },
  ];

  return (
    <DemoSlideShell
      title={
        <>
          Visibility, <span style={{ color: P.accent }}>your call</span>.
        </>
      }
      description={
        <>
          Just like in a real org — the CEO can peek at the C-suite&apos;s
          work, then zoom all the way down to the people on the ground. You
          decide: just this cabinet&apos;s tasks and agents, the close teams,
          or everyone, all the way down.
        </>
      }
    >
      <CardChrome width={380}>
        {/* Trigger */}
        <div
          className="flex items-center gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <FolderTree className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[12px] font-semibold" style={{ color: P.text }}>
            Visibility
          </span>
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold"
            style={{ background: P.accentBg, color: P.accent }}
          >
            Own
          </span>
          <ChevronDown className="h-3 w-3" style={{ color: P.textTertiary }} />
        </div>

        {/* Menu */}
        <div className="px-2 py-2">
          {options.map((opt, i) => (
            <div
              key={opt.label}
              className="flex items-center gap-2 rounded-md px-2.5 py-2 opacity-0"
              style={{
                background: opt.selected ? P.accentBg : "transparent",
                animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                animationDelay: `${400 + i * 130}ms`,
              }}
            >
              <span
                className="flex h-4 w-4 items-center justify-center"
                style={{ color: P.accent }}
              >
                {opt.selected && <Check className="h-3 w-3" />}
              </span>
              <span
                className="text-[11px] font-semibold"
                style={{ color: opt.selected ? P.accent : P.text }}
              >
                {opt.label}
              </span>
              <span
                className="ml-auto rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold"
                style={{
                  background: P.bgCard,
                  color: P.textTertiary,
                  border: `1px solid ${P.borderLight}`,
                }}
              >
                {opt.short}
              </span>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div
          className="px-4 py-2 text-[10px] italic opacity-0"
          style={{
            color: P.textTertiary,
            borderTop: `1px solid ${P.borderLight}`,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "1100ms",
          }}
        >
          Switch any time — it&apos;s just a view setting.
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 4: Context flows down ─────────────────────────────────────── */
function SlideContextFlows() {
  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Context flows <span style={{ color: P.accent }}>down</span>.
        </>
      }
      description={
        <>
          Pages a parent cabinet shares show up read-only inside every child.
          The CEO writes the company strategy once; every department reads
          from the same source of truth.
        </>
      }
    >
      <div className="flex flex-col items-center gap-2" style={{ width: 380 }}>
        {/* Parent cabinet */}
        <CardChrome width={300}>
          <div
            className="flex items-center gap-2 px-3 pt-2.5 pb-1.5"
            style={{ borderBottom: `1px solid ${P.border}` }}
          >
            <Archive className="h-3.5 w-3.5" style={{ color: P.iconAmber }} />
            <span className="text-[11.5px] font-semibold" style={{ color: P.text }}>
              My Cabinet
            </span>
            <span
              className="ml-auto rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold"
              style={{ background: P.accentBg, color: P.accent }}
            >
              Shared
            </span>
          </div>
          <div className="space-y-1 px-3 py-2">
            {["company-strategy.md", "values.md"].map((f) => (
              <div
                key={f}
                className="flex items-center gap-2 rounded-md px-2 py-1"
                style={{ background: P.paperWarm }}
              >
                <FileText className="h-2.5 w-2.5" style={{ color: P.textTertiary }} />
                <span className="font-mono text-[10px]" style={{ color: P.textSecondary }}>
                  {f}
                </span>
              </div>
            ))}
          </div>
        </CardChrome>

        {/* Arrow */}
        <ArrowDown
          className="h-4 w-4 opacity-0"
          style={{
            color: P.accent,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "500ms",
          }}
        />

        {/* Children */}
        <div className="grid grid-cols-2 gap-2 w-full">
          {[
            { name: "Marketing", icon: Megaphone },
            { name: "Engineering", icon: Code2 },
          ].map((c, i) => {
            const Icon = c.icon;
            return (
              <CardChrome key={c.name} width={185}>
                <div
                  className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 opacity-0"
                  style={{
                    borderBottom: `1px solid ${P.border}`,
                    animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
                    animationDelay: `${750 + i * 200}ms`,
                  }}
                >
                  <Archive className="h-3 w-3" style={{ color: P.accent }} />
                  <span className="text-[11px] font-semibold" style={{ color: P.text }}>
                    {c.name}
                  </span>
                </div>
                <div className="px-3 py-2 space-y-1 opacity-0" style={{
                  animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
                  animationDelay: `${950 + i * 200}ms`,
                }}>
                  <div
                    className="flex items-center gap-1.5 rounded-md px-2 py-1"
                    style={{ background: P.accentBg, border: `1px dashed ${P.borderDark}` }}
                  >
                    <FileText className="h-2.5 w-2.5" style={{ color: P.accent }} />
                    <span className="font-mono text-[9px]" style={{ color: P.accent }}>
                      company-strategy.md
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-md px-2 py-1">
                    <Icon className="h-2.5 w-2.5" style={{ color: P.textTertiary }} />
                    <span className="text-[9.5px]" style={{ color: P.textSecondary }}>
                      + own pages
                    </span>
                  </div>
                </div>
              </CardChrome>
            );
          })}
        </div>
      </div>
    </DemoSlideShell>
  );
}

export function buildCabinetsDemo(): DemoConfig {
  return {
    id: "cabinets",
    ariaLabel: "A team of AI teams — guided demo",
    slides: [
      { id: "nested", render: () => <SlideNested /> },
      { id: "each-team", render: () => <SlideEachATeam /> },
      { id: "visibility", render: () => <SlideVisibility /> },
      { id: "context", render: () => <SlideContextFlows /> },
    ],
  };
}

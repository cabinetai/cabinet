"use client";

import {
  Activity,
  Atom,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  Cloud,
  Code2,
  Cpu,
  Gavel,
  HardHat,
  Heart,
  Megaphone,
  PenLine,
  Search,
  Sparkles,
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

/* ── Slide 1: Hire your team ─────────────────────────────────────────── */
function SlideHire() {
  const { t } = useLocale();
  const team: { name: string; role: string; icon: typeof Search; tint: string; tag: string }[] = [
    { name: "Researcher", role: "Specialist", icon: Search, tint: "#E8C896", tag: "Claude · Sonnet" },
    { name: "Editor", role: "Specialist", icon: PenLine, tint: "#D9B98A", tag: "GPT-4" },
    { name: "Engineer", role: "Specialist", icon: Code2, tint: "#C9A87A", tag: "Codex" },
    { name: "Marketing Lead", role: "Lead", icon: Megaphone, tint: "#E8C896", tag: "Claude · Opus" },
  ];

  return (
    <DemoSlideShell
      title={
        <>
          Your <span style={{ color: P.accent }}>{t("demos:aiTeam")}</span>.
        </>
      }
      description={
        <>
          Hire leads and specialists. Each one has a name, a role, a personality — and a model that fits the job.
        </>
      }
    >
      <CardChrome>
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <Users className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[12px] font-semibold tracking-wide" style={{ color: P.text }}>
            Your team
          </span>
        </div>
        <div className="space-y-1.5 px-3 pb-4">
          {team.map((t, i) => {
            const Icon = t.icon;
            return (
              <div
                key={t.name}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 opacity-0"
                style={{
                  background: P.paperWarm,
                  border: `1px solid ${P.borderLight}`,
                  animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
                  animationDelay: `${600 + i * 140}ms`,
                }}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: t.tint, color: P.accentWarm }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold" style={{ color: P.text }}>
                    {t.name}
                  </div>
                  <div className="text-[10px]" style={{ color: P.textTertiary }}>
                    {t.tag}
                  </div>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                  style={{
                    background: t.role === "Lead" ? P.accentBg : "transparent",
                    color: t.role === "Lead" ? P.accent : P.textTertiary,
                    border: t.role === "Lead" ? `1px solid ${P.borderDark}` : `1px solid ${P.borderLight}`,
                  }}
                >
                  {t.role}
                </span>
              </div>
            );
          })}
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 2: Each agent is a persona ────────────────────────────────── */
function SlidePersona() {
  const { t } = useLocale();
  const others: { label: string; icon: typeof Gavel; tint: string }[] = [
    { label: "Lead Marketer", icon: Megaphone, tint: "#E8C896" },
    { label: "Mom guidance", icon: Heart, tint: "#F0C9C0" },
    { label: "Contractor", icon: HardHat, tint: "#E8C896" },
    { label: "Salesforce expert", icon: Cloud, tint: "#C9D6E8" },
    { label: "Low-level eng.", icon: Cpu, tint: "#D4C4B0" },
    { label: "PhD physicist", icon: Atom, tint: "#D9B98A" },
  ];

  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Each agent is a <span style={{ color: P.accent }}>persona</span>.
        </>
      }
      description={
        <>
          Open any agent and edit who they are — their expertise, their voice,
          their constraints. A 30-year veteran lawyer reads contracts
          differently than a low-level systems engineer. Spin up a Lead
          Marketer, a Salesforce expert, a Mom on speed-dial — anyone you can
          describe.
        </>
      }
    >
      <div className="flex flex-col gap-3" style={{ width: 420 }}>
        {/* Agent page mockup */}
        <CardChrome width={420}>
          {/* Page header — avatar, name, status, role */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl shrink-0"
              style={{
                background: `linear-gradient(135deg, ${P.accent}, ${P.accentWarm})`,
                color: P.paper,
                boxShadow: `0 6px 16px -10px ${P.accent}`,
              }}
            >
              <Gavel className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className="text-[16px] font-semibold tracking-[-0.01em] truncate"
                  style={{ color: P.text }}
                >
                  Veteran Counsel
                </span>
                <span className="relative flex h-1.5 w-1.5 items-center justify-center">
                  <span
                    className="absolute inline-flex h-full w-full rounded-full"
                    style={{
                      background: "#5A9E7B",
                      animation:
                        "cabinet-tour-heartbeat-dot 1.4s ease-in-out infinite",
                    }}
                  />
                  <span
                    className="relative inline-flex h-1.5 w-1.5 rounded-full"
                    style={{ background: "#4A8E6B" }}
                  />
                </span>
                <span
                  className="text-[9.5px] font-semibold uppercase tracking-wider"
                  style={{ color: "#4A8E6B" }}
                >
                  Active
                </span>
              </div>
              <div
                className="mt-0.5 text-[11px] flex items-center gap-1.5"
                style={{ color: P.textTertiary }}
              >
                <span>{t("demos:specialist")}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{t("demos:legal")}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>Claude</span>
              </div>
            </div>
          </div>

          {/* Persona instructions section */}
          <div
            className="px-4 py-4"
            style={{ borderTop: `1px solid ${P.borderLight}` }}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span
                className="text-[9px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: P.textTertiary }}
              >
                Persona instructions
              </span>
              <span
                className="text-[10px] italic"
                style={{ color: P.textTertiary }}
              >
                Saved
              </span>
            </div>

            <div
              className="rounded-lg px-3 py-3 opacity-0"
              style={{
                background: P.paperWarm,
                border: `1px solid ${P.borderLight}`,
                animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
                animationDelay: "500ms",
              }}
            >
              <div
                className="font-logo italic text-[15px] mb-1.5"
                style={{ color: P.text }}
              >
                Veteran Counsel
              </div>
              <p
                className="font-body-serif text-[11.5px] leading-relaxed"
                style={{ color: P.textSecondary }}
              >
                You&apos;re a senior partner with{" "}
                <span style={{ color: P.text, fontWeight: 600 }}>
                  30 years
                </span>{" "}
                of contract law experience. Read every clause for ambiguity,
                hidden risk, and edge cases. Cite case law when relevant.
                Speak plainly to non-lawyers — but never soften a legal point.
                <span
                  className="ml-0.5 inline-block h-3 w-[1.5px] align-middle"
                  style={{
                    background: P.accent,
                    animation: "cabinet-tour-heartbeat-dot 1s ease-in-out infinite",
                  }}
                />
              </p>
            </div>
          </div>
        </CardChrome>

        {/* Other persona chips */}
        <div className="grid grid-cols-3 gap-1.5">
          {others.map((o, i) => {
            const Icon = o.icon;
            return (
              <div
                key={o.label}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 opacity-0"
                style={{
                  background: P.bgCard,
                  border: `1px solid ${P.borderLight}`,
                  animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                  animationDelay: `${1100 + i * 80}ms`,
                }}
              >
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full"
                  style={{ background: o.tint, color: P.accentWarm }}
                >
                  <Icon className="h-2.5 w-2.5" />
                </span>
                <span
                  className="text-[9.5px] font-medium"
                  style={{ color: P.textSecondary }}
                >
                  {o.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </DemoSlideShell>
  );
}

/* ── Slide 3: Departments ────────────────────────────────────────────── */
function SlideDepartments() {
  const depts: { name: string; lead: string; agents: string[]; icon: typeof Megaphone; tint: string }[] = [
    { name: "Marketing", lead: "CMO", agents: ["Writer", "Designer", "Analyst"], icon: Megaphone, tint: "#E8C896" },
    { name: "Engineering", lead: "CTO", agents: ["Backend", "Frontend", "DevOps"], icon: Code2, tint: "#C9A87A" },
    { name: "Operations", lead: "COO", agents: ["PM", "Researcher"], icon: Briefcase, tint: "#D9B98A" },
  ];

  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Group them into <span style={{ color: P.accent }}>departments</span>.
        </>
      }
      description={
        <>
          Marketing, Engineering, Operations — each department has a lead and a roster of specialists.
          The structure carries through to who can dispatch work to whom.
        </>
      }
    >
      <div className="space-y-3" style={{ width: 360 }}>
        {depts.map((d, i) => {
          const Icon = d.icon;
          return (
            <div
              key={d.name}
              className="rounded-xl p-3 opacity-0"
              style={{
                background: P.bgCard,
                border: `1px solid ${P.border}`,
                animation: "cabinet-tour-fade-up 0.45s ease-out forwards",
                animationDelay: `${500 + i * 200}ms`,
              }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: d.tint, color: P.accentWarm }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <div className="text-[12.5px] font-semibold" style={{ color: P.text }}>
                    {d.name}
                  </div>
                  <div className="text-[10px]" style={{ color: P.textTertiary }}>
                    Led by {d.lead}
                  </div>
                </div>
                <span className="text-[10px] font-medium" style={{ color: P.textSecondary }}>
                  {d.agents.length} agents
                </span>
              </div>
              <div className="mt-2 ml-10 flex flex-wrap gap-1">
                {d.agents.map((a) => (
                  <span
                    key={a}
                    className="rounded-full px-2 py-0.5 text-[9.5px] font-medium"
                    style={{
                      background: P.paperWarm,
                      color: P.textSecondary,
                      border: `1px solid ${P.borderLight}`,
                    }}
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </DemoSlideShell>
  );
}

/* ── Slide 4: Dispatch ───────────────────────────────────────────────── */
function SlideDispatch() {
  return (
    <DemoSlideShell
      title={
        <>
          Leads can <span style={{ color: P.accent }}>dispatch</span>.
        </>
      }
      description={
        <>
          The CEO dispatches to the CMO. The CMO dispatches to the writer. Each handoff is auditable, and effort is set per task.
        </>
      }
    >
      <div className="relative" style={{ width: 360, height: 320 }}>
        {/* CEO node — top */}
        <DispatchNode
          x={130}
          y={0}
          name="CEO"
          role="Lead"
          icon={Briefcase}
          delay={500}
        />
        {/* CMO node — middle */}
        <DispatchNode
          x={50}
          y={130}
          name="CMO"
          role="Lead"
          icon={Megaphone}
          delay={1100}
        />
        {/* Writer — bottom */}
        <DispatchNode
          x={210}
          y={260}
          name="Writer"
          role="Specialist"
          icon={PenLine}
          delay={1700}
        />

        {/* Lines connecting CEO → CMO → Writer */}
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          aria-hidden="true"
        >
          <DispatchEdge x1={170} y1={50} x2={110} y2={130} delay={900} />
          <DispatchEdge x1={110} y1={170} x2={250} y2={260} delay={1500} />
        </svg>

        {/* Floating "LAUNCH_TASK" pill */}
        <div
          className="absolute opacity-0 rounded-full px-2.5 py-1 text-[9px] font-semibold tracking-wider"
          style={{
            left: 90,
            top: 90,
            background: P.accent,
            color: P.paper,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "1100ms",
          }}
        >
          LAUNCH_TASK →
        </div>
        <div
          className="absolute opacity-0 rounded-full px-2.5 py-1 text-[9px] font-semibold tracking-wider"
          style={{
            left: 130,
            top: 215,
            background: P.accent,
            color: P.paper,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "1700ms",
          }}
        >
          LAUNCH_TASK →
        </div>
      </div>
    </DemoSlideShell>
  );
}

function DispatchNode({
  x,
  y,
  name,
  role,
  icon: Icon,
  delay,
}: {
  x: number;
  y: number;
  name: string;
  role: string;
  icon: typeof Briefcase;
  delay: number;
}) {
  return (
    <div
      className="absolute opacity-0 rounded-xl px-3 py-2 flex items-center gap-2"
      style={{
        left: x,
        top: y,
        width: 100,
        background: P.bgCard,
        border: `1px solid ${P.borderDark}`,
        boxShadow: "0 14px 28px -20px rgba(59,47,47,0.4)",
        animation: "cabinet-tour-fade-up 0.45s ease-out forwards",
        animationDelay: `${delay}ms`,
      }}
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-md"
        style={{ background: P.accentBg, color: P.accent }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold" style={{ color: P.text }}>
          {name}
        </div>
        <div className="text-[8.5px] uppercase tracking-wider" style={{ color: P.textTertiary }}>
          {role}
        </div>
      </div>
    </div>
  );
}

function DispatchEdge({
  x1,
  y1,
  x2,
  y2,
  delay,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  delay: number;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={P.accent}
      strokeWidth={1.5}
      strokeDasharray="4 4"
      style={{
        opacity: 0,
        animation: "cabinet-tour-fade-in 0.4s ease-out forwards",
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

/* ── Slide 5: Heartbeats ─────────────────────────────────────────────── */
function SlideHeartbeats() {
  const beats: { time: string; note: string }[] = [
    { time: "Mon · 09:00", note: "Scanned 18 articles · drafted digest" },
    { time: "Tue · 09:00", note: "Flagged 2 competitor launches" },
    { time: "Wed · 09:00", note: "Pinged Editor — needs follow-up" },
  ];

  return (
    <DemoSlideShell
      title={
        <>
          A <span style={{ color: P.accent }}>heartbeat</span>.
        </>
      }
      description={
        <>
          Pick a frequency — every minute, every hour, every weekday morning.
          On every beat, your agent re-runs its persona, scans the world, and
          proposes what&apos;s next. Example: the Researcher beats every
          weekday at 9am to read the news.
        </>
      }
    >
      <CardChrome width={360}>
        <div
          className="flex items-center gap-3 px-4 pt-4 pb-3"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: P.accentBg, color: P.accent }}
          >
            <Search className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <div className="text-[12.5px] font-semibold" style={{ color: P.text }}>
              Researcher
            </div>
            <div className="text-[10px]" style={{ color: P.textTertiary }}>
              Heartbeat · weekdays 09:00
            </div>
          </div>
          <span className="relative flex h-2 w-2 items-center justify-center">
            <span
              className="absolute inline-flex h-full w-full rounded-full"
              style={{
                background: "#5A9E7B",
                animation: "cabinet-tour-heartbeat-dot 1.4s ease-in-out infinite",
              }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: "#4A8E6B" }}
            />
          </span>
        </div>

        <div className="px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Activity className="h-3 w-3" style={{ color: P.accent }} />
            <span
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: P.textTertiary }}
            >
              Recent beats
            </span>
          </div>
          <div className="space-y-1.5">
            {beats.map((b, i) => (
              <div
                key={b.time}
                className="flex items-start gap-2 rounded-md px-2.5 py-1.5 opacity-0"
                style={{
                  background: P.paperWarm,
                  border: `1px solid ${P.borderLight}`,
                  animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
                  animationDelay: `${600 + i * 200}ms`,
                }}
              >
                <Clock
                  className="mt-0.5 h-3 w-3 shrink-0"
                  style={{ color: P.accent }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] font-semibold" style={{ color: P.text }}>
                    {b.time}
                  </div>
                  <div className="text-[10px] leading-snug" style={{ color: P.textSecondary }}>
                    {b.note}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 6: Routines & schedule ────────────────────────────────────── */
function SlideRoutines() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];

  type Routine = {
    label: string;
    cron: string;
    agent: string;
    icon: typeof Search;
    days: number[]; // 0..6 = Mon..Sun
    column: number; // visual lane 0..2
  };

  const routines: Routine[] = [
    { label: "News scan", cron: "0 9 * * 1-5", agent: "Researcher", icon: Search, days: [0, 1, 2, 3, 4], column: 0 },
    { label: "Weekly digest", cron: "0 18 * * 5", agent: "Editor", icon: PenLine, days: [4], column: 1 },
    { label: "Backlog triage", cron: "0 10 * * 1", agent: "PM", icon: Briefcase, days: [0], column: 2 },
  ];

  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Schedule the <span style={{ color: P.accent }}>team</span>.
        </>
      }
      description={
        <>
          Routines are recurring jobs. Cron syntax, natural language, or once
          next Monday — every routine across the team lands in one schedule.
          Example: News scan weekday mornings, Weekly digest Friday at 6pm,
          Backlog triage Monday 10am.
        </>
      }
    >
      <CardChrome width={400}>
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <Calendar className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[12px] font-semibold" style={{ color: P.text }}>
            This week
          </span>
        </div>

        {/* Day header */}
        <div className="grid grid-cols-7 gap-1 px-4">
          {days.map((d, i) => (
            <div
              key={i}
              className="flex h-6 items-center justify-center rounded-md text-[9px] font-semibold"
              style={{ background: P.paperWarm, color: P.textSecondary }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Routine lanes */}
        <div className="space-y-1 px-4 py-3">
          {routines.map((r, idx) => {
            const Icon = r.icon;
            return (
              <div
                key={r.label}
                className="grid grid-cols-7 gap-1 opacity-0"
                style={{
                  animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
                  animationDelay: `${500 + idx * 220}ms`,
                }}
              >
                {days.map((_, dayIdx) => {
                  const active = r.days.includes(dayIdx);
                  return (
                    <div
                      key={dayIdx}
                      className="h-7 rounded-sm"
                      style={{
                        background: active ? P.accentBg : "transparent",
                        border: active
                          ? `1px solid ${P.borderDark}`
                          : `1px dashed ${P.borderLight}`,
                      }}
                    >
                      {active && dayIdx === r.days[0] && (
                        <div className="flex h-full items-center justify-center">
                          <Icon
                            className="h-3 w-3"
                            style={{ color: P.accent }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Routine list */}
        <div
          className="space-y-1 px-4 pb-4 pt-2"
          style={{ borderTop: `1px solid ${P.borderLight}` }}
        >
          {routines.map((r, i) => {
            const Icon = r.icon;
            return (
              <div
                key={r.label}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 opacity-0"
                style={{
                  background: P.paperWarm,
                  animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
                  animationDelay: `${1100 + i * 180}ms`,
                }}
              >
                <Icon className="h-3 w-3 shrink-0" style={{ color: P.accent }} />
                <span className="text-[10.5px] font-semibold" style={{ color: P.text }}>
                  {r.label}
                </span>
                <span className="text-[10px]" style={{ color: P.textTertiary }}>
                  · {r.agent}
                </span>
                <span
                  className="ml-auto font-mono text-[9px] tracking-tight"
                  style={{ color: P.textTertiary }}
                >
                  {r.cron}
                </span>
              </div>
            );
          })}
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 7: You're in control ──────────────────────────────────────── */
function SlideApprovals() {
  return (
    <DemoSlideShell
      reversed
      title={
        <>
          You&apos;re in <span style={{ color: P.accent }}>control</span>.
        </>
      }
      description={
        <>
          Every dispatch waits for your approval. Review the action, see the cost, then say go — or decline.
        </>
      }
    >
      <CardChrome width={340}>
        <div className="flex items-center gap-2 px-4 pt-4 pb-2" style={{ borderBottom: `1px solid ${P.border}` }}>
          <CheckCircle2 className="h-4 w-4" style={{ color: P.iconAmber }} />
          <span className="text-[12px] font-semibold" style={{ color: P.text }}>
            Pending action
          </span>
          <span className="ml-auto text-[10px]" style={{ color: P.textTertiary }}>
            from CMO
          </span>
        </div>
        <div className="space-y-3 px-4 py-3">
          <div
            className="rounded-lg px-3 py-2 opacity-0"
            style={{
              background: P.paperWarm,
              border: `1px solid ${P.borderLight}`,
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "500ms",
            }}
          >
            <div
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: P.textTertiary }}
            >
              Action
            </div>
            <div className="mt-0.5 font-mono text-[11px]" style={{ color: P.text }}>
              LAUNCH_TASK
            </div>
            <div
              className="mt-2 text-[11px] leading-relaxed"
              style={{ color: P.textSecondary }}
            >
              Dispatch the writer (effort=high) to draft a launch announcement for the new feature.
            </div>
          </div>

          <div
            className="flex items-center justify-between rounded-lg px-3 py-2 opacity-0"
            style={{
              background: P.bgCard,
              border: `1px dashed ${P.borderDark}`,
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "850ms",
            }}
          >
            <div className="text-[9.5px]" style={{ color: P.textTertiary }}>
              Est. cost <span style={{ color: P.text }}>$0.04</span> · runtime{" "}
              <span style={{ color: P.text }}>~2m</span>
            </div>
          </div>

          <div
            className="flex items-center gap-2 opacity-0"
            style={{
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "1100ms",
            }}
          >
            <button
              type="button"
              tabIndex={-1}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition-transform hover:-translate-y-px"
              style={{ background: P.accent, color: P.paper }}
            >
              <Sparkles className="h-3 w-3" />
              Approve
            </button>
            <button
              type="button"
              tabIndex={-1}
              className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold"
              style={{
                background: "transparent",
                color: P.textSecondary,
                border: `1px solid ${P.borderLight}`,
              }}
            >
              Decline
            </button>
          </div>
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

export function buildAiTeamDemo(): DemoConfig {
  return {
    id: "ai-team",
    ariaLabel: "Your AI team — guided demo",
    slides: [
      { id: "hire", render: () => <SlideHire /> },
      { id: "persona", render: () => <SlidePersona /> },
      { id: "departments", render: () => <SlideDepartments /> },
      { id: "dispatch", render: () => <SlideDispatch /> },
      { id: "heartbeats", render: () => <SlideHeartbeats /> },
      { id: "routines", render: () => <SlideRoutines /> },
      { id: "approvals", render: () => <SlideApprovals /> },
    ],
  };
}


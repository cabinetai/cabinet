"use client";

import {
  Archive,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  FileText,
  Filter,
  Inbox,
  KanbanSquare,
  LayoutList,
  Loader2,
  Megaphone,
  MessageCircleQuestion,
  PenLine,
  Search,
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

const LANES = [
  { key: "inbox", label: "Inbox", icon: Inbox, count: 3 },
  { key: "needs", label: "Your turn", icon: MessageCircleQuestion, count: 1 },
  { key: "running", label: "Running", icon: Loader2, count: 2, spin: true },
  { key: "done", label: "Just Finished", icon: CheckCircle2, count: 2 },
  { key: "archive", label: "Archive", icon: Archive, count: 1 },
] as const;

/* ── Slide 1: The task board ─────────────────────────────────────────── */
function SlideBoard() {
  return (
    <DemoSlideShell
      title={
        <>
          The <span style={{ color: P.accent }}>task board</span>.
        </>
      }
      description={
        <>
          Every task your team runs lives here. Drag cards across lanes, see
          what&apos;s waiting on you, and watch the long-running jobs finish.
        </>
      }
    >
      <CardChrome width={460}>
        <div
          className="flex items-center gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <KanbanSquare className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[12px] font-semibold" style={{ color: P.text }}>
            Tasks
          </span>
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold"
            style={{ background: P.accentBg, color: P.accent }}
          >
            9 active
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5 p-2">
          {LANES.map((lane, i) => {
            const Icon = lane.icon;
            return (
              <div
                key={lane.key}
                className="rounded-lg p-1.5 opacity-0"
                style={{
                  background: P.paperWarm,
                  animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
                  animationDelay: `${300 + i * 120}ms`,
                }}
              >
                <div className="mb-1.5 flex items-center gap-1">
                  <Icon
                    className={`h-2.5 w-2.5 ${"spin" in lane && lane.spin ? "animate-spin [animation-duration:3s]" : ""}`}
                    style={{ color: P.textTertiary }}
                  />
                  <span
                    className="text-[7.5px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: P.textTertiary }}
                  >
                    {lane.label}
                  </span>
                  <span className="ml-auto text-[7.5px]" style={{ color: P.textTertiary }}>
                    {lane.count}
                  </span>
                </div>
                <div className="space-y-1">
                  {Array.from({ length: lane.count }).map((_, j) => (
                    <div
                      key={j}
                      className="rounded-sm p-1.5"
                      style={{
                        background: P.bgCard,
                        border: `1px solid ${P.borderLight}`,
                      }}
                    >
                      <div
                        className="h-1 rounded-full"
                        style={{ width: `${[60, 80, 50][j % 3]}%`, background: P.borderDark }}
                      />
                      <div
                        className="mt-1 h-0.5 rounded-full"
                        style={{ width: `${[40, 30, 55][j % 3]}%`, background: P.borderLight }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 2: Three views ────────────────────────────────────────────── */
function SlideThreeViews() {
  const views = [
    { key: "kanban", label: "Kanban", icon: KanbanSquare },
    { key: "list", label: "List", icon: LayoutList },
    { key: "schedule", label: "Schedule", icon: CalendarRange },
  ];

  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Three <span style={{ color: P.accent }}>views</span>.
        </>
      }
      description={
        <>
          Same tasks, different angles. Kanban for status flow. List for
          density and bulk actions. Schedule to see what&apos;s queued for
          today, this week, this month.
        </>
      }
    >
      <CardChrome width={420}>
        {/* View toggle */}
        <div className="flex items-center gap-1 px-3 pt-3 pb-2">
          {views.map((v, i) => {
            const Icon = v.icon;
            const active = i === 1;
            return (
              <div
                key={v.key}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5"
                style={{
                  background: active ? P.accentBg : "transparent",
                  border: active ? `1px solid ${P.borderDark}` : `1px solid transparent`,
                  color: active ? P.accent : P.textSecondary,
                }}
              >
                <Icon className="h-3 w-3" />
                <span className="text-[10px] font-semibold">{v.label}</span>
              </div>
            );
          })}
        </div>

        {/* List view body */}
        <div
          className="space-y-1 px-3 pb-3 opacity-0"
          style={{
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "400ms",
          }}
        >
          {[
            { title: "Draft launch announcement", agent: "Editor", status: "running", tint: "#5A9E7B" },
            { title: "Analyze Q2 metrics", agent: "Analyst", status: "your turn", tint: P.accent },
            { title: "Refactor auth middleware", agent: "Backend", status: "running", tint: "#5A9E7B" },
            { title: "Write competitor briefs (10×)", agent: "Researcher", status: "done", tint: P.textTertiary },
          ].map((row, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md px-2.5 py-2"
              style={{
                background: P.paperWarm,
                border: `1px solid ${P.borderLight}`,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: row.tint }}
              />
              <span
                className="flex-1 text-[11px] truncate"
                style={{ color: P.text }}
              >
                {row.title}
              </span>
              <span className="text-[9.5px]" style={{ color: P.textTertiary }}>
                {row.agent}
              </span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wider"
                style={{
                  background: P.bgCard,
                  border: `1px solid ${P.borderLight}`,
                  color: P.textSecondary,
                }}
              >
                {row.status}
              </span>
            </div>
          ))}
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 3: Schedule view ──────────────────────────────────────────── */
function SlideScheduleView() {
  type Block = {
    day: number; // 0..4 Mon..Fri
    startHour: number; // 8..18
    duration: number; // hours
    title: string;
    agent: string;
    icon: typeof Search;
    tint: string;
    status: "running" | "scheduled" | "done";
  };

  const blocks: Block[] = [
    { day: 0, startHour: 9, duration: 1, title: "News scan", agent: "Researcher", icon: Search, tint: "#E8C896", status: "done" },
    { day: 0, startHour: 11, duration: 2, title: "Q2 brief", agent: "Analyst", icon: FileText, tint: "#D9B98A", status: "running" },
    { day: 1, startHour: 9, duration: 1, title: "News scan", agent: "Researcher", icon: Search, tint: "#E8C896", status: "scheduled" },
    { day: 1, startHour: 14, duration: 1, title: "Standup", agent: "CMO", icon: Megaphone, tint: "#EDDCC4", status: "scheduled" },
    { day: 2, startHour: 9, duration: 1, title: "News scan", agent: "Researcher", icon: Search, tint: "#E8C896", status: "scheduled" },
    { day: 2, startHour: 10, duration: 3, title: "Launch post", agent: "Editor", icon: PenLine, tint: "#F0E1D0", status: "scheduled" },
    { day: 4, startHour: 18, duration: 1, title: "Digest", agent: "Editor", icon: PenLine, tint: "#F0E1D0", status: "scheduled" },
  ];

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const ROW_H = 14; // px per hour
  const GRID_HEIGHT = hours.length * ROW_H;

  return (
    <DemoSlideShell
      title={
        <>
          On the <span style={{ color: P.accent }}>calendar</span>.
        </>
      }
      description={
        <>
          Switch to Schedule and the same tasks land on a real calendar — see
          what&apos;s running now, what&apos;s queued for later today, and
          what&apos;s coming up the rest of the week.
        </>
      }
    >
      <CardChrome width={460}>
        <div
          className="flex items-center gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <CalendarRange className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[12px] font-semibold" style={{ color: P.text }}>
            Schedule · this week
          </span>
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold"
            style={{ background: P.accentBg, color: P.accent }}
          >
            7 tasks
          </span>
        </div>

        {/* Grid: hour gutter + 5 day columns */}
        <div className="px-3 py-3">
          {/* Day header */}
          <div className="grid" style={{ gridTemplateColumns: "28px repeat(5, 1fr)", gap: 4 }}>
            <div />
            {days.map((d) => (
              <div
                key={d}
                className="flex h-6 items-center justify-center rounded-md text-[9.5px] font-semibold"
                style={{ background: P.paperWarm, color: P.textSecondary }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Body grid */}
          <div
            className="mt-1 grid"
            style={{ gridTemplateColumns: "28px repeat(5, 1fr)", gap: 4 }}
          >
            {/* Hour gutter */}
            <div
              className="relative"
              style={{ height: GRID_HEIGHT }}
            >
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 text-[7.5px] font-semibold tracking-wide"
                  style={{
                    top: i * ROW_H - 4,
                    color: P.textTertiary,
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((_, dayIdx) => (
              <div
                key={dayIdx}
                className="relative rounded-md"
                style={{
                  height: GRID_HEIGHT,
                  background: P.paperWarm,
                  border: `1px solid ${P.borderLight}`,
                }}
              >
                {/* Hour grid lines */}
                {hours.map((_, i) =>
                  i === 0 ? null : (
                    <div
                      key={i}
                      className="absolute left-0 right-0"
                      style={{
                        top: i * ROW_H,
                        height: 1,
                        background: P.borderLight,
                        opacity: 0.5,
                      }}
                    />
                  ),
                )}

                {/* Now line — Tuesday 14:00 ish */}
                {dayIdx === 1 && (
                  <div
                    className="absolute left-0 right-0 z-10"
                    style={{
                      top: (14 - hours[0]) * ROW_H + ROW_H / 2,
                      height: 1,
                      background: "#D44A4A",
                    }}
                  >
                    <span
                      className="absolute -top-1 -left-1 h-2 w-2 rounded-full"
                      style={{ background: "#D44A4A" }}
                    />
                  </div>
                )}

                {/* Blocks for this day */}
                {blocks
                  .filter((b) => b.day === dayIdx)
                  .map((b, i) => {
                    const Icon = b.icon;
                    const top = (b.startHour - hours[0]) * ROW_H;
                    const height = b.duration * ROW_H - 2;
                    const isRunning = b.status === "running";
                    const isDone = b.status === "done";
                    const blockIndex = blocks.indexOf(b);
                    return (
                      <div
                        key={i}
                        className="absolute left-0.5 right-0.5 flex items-start gap-1 overflow-hidden rounded px-1 py-0.5 opacity-0"
                        style={{
                          top,
                          height,
                          background: isDone ? P.bgCard : b.tint,
                          border: `1px solid ${isRunning ? P.accent : P.borderDark}`,
                          opacity: isDone ? 0.6 : 1,
                          animation:
                            "cabinet-tour-fade-up 0.35s ease-out forwards",
                          animationDelay: `${300 + blockIndex * 90}ms`,
                          boxShadow: isRunning
                            ? `0 0 0 2px ${P.accentBg}`
                            : "none",
                        }}
                        title={`${b.title} · ${b.agent}`}
                      >
                        <Icon
                          className="h-2 w-2 shrink-0 mt-0.5"
                          style={{ color: P.accent }}
                        />
                        <span
                          className="truncate text-[7.5px] font-semibold"
                          style={{
                            color: P.text,
                            textDecoration: isDone ? "line-through" : "none",
                          }}
                        >
                          {b.title}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>

        {/* Footer legend */}
        <div
          className="flex items-center gap-3 px-4 py-2 opacity-0"
          style={{
            borderTop: `1px solid ${P.borderLight}`,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "1100ms",
          }}
        >
          <span className="flex items-center gap-1 text-[9px]" style={{ color: P.textSecondary }}>
            <span
              className="h-2 w-2 rounded-sm"
              style={{ background: "#E8C896", border: `1px solid ${P.accent}` }}
            />
            Running
          </span>
          <span className="flex items-center gap-1 text-[9px]" style={{ color: P.textSecondary }}>
            <span
              className="h-2 w-2 rounded-sm"
              style={{ background: P.bgCard, border: `1px solid ${P.borderDark}` }}
            />
            Scheduled
          </span>
          <span className="ml-auto flex items-center gap-1 text-[9px]" style={{ color: "#D44A4A" }}>
            <Clock className="h-2 w-2" />
            Now · Tue 14:00
          </span>
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 4: Filter the noise ──────────────────────────────────────── */
function SlideFilters() {
  const filters = [
    { label: "Agent: Editor", active: true },
    { label: "Status: Running", active: true },
    { label: "This week", active: false },
    { label: "High effort", active: false },
  ];

  return (
    <DemoSlideShell
      title={
        <>
          Filter the <span style={{ color: P.accent }}>noise</span>.
        </>
      }
      description={
        <>
          Narrow by agent, status, effort, schedule, or search. The board
          stays in the same view — only the cards change.
        </>
      }
    >
      <CardChrome width={420}>
        <div
          className="flex items-center gap-2 px-3 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <Filter className="h-3.5 w-3.5" style={{ color: P.accent }} />
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: P.textTertiary }}
          >
            Filters
          </span>
          <div
            className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1"
            style={{ background: P.paperWarm, border: `1px solid ${P.borderLight}` }}
          >
            <Search className="h-3 w-3" style={{ color: P.textTertiary }} />
            <span className="text-[10px]" style={{ color: P.textTertiary }}>
              Search tasks…
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 px-3 py-3">
          {filters.map((f, i) => (
            <span
              key={f.label}
              className="rounded-full px-2.5 py-1 text-[10px] font-medium opacity-0"
              style={{
                background: f.active ? P.accentBg : P.paperWarm,
                color: f.active ? P.accent : P.textSecondary,
                border: `1px solid ${f.active ? P.borderDark : P.borderLight}`,
                animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
                animationDelay: `${400 + i * 120}ms`,
              }}
            >
              {f.label}
            </span>
          ))}
        </div>

        <div
          className="space-y-1 px-3 pb-3 opacity-0"
          style={{
            animation: "cabinet-tour-fade-up 0.45s ease-out forwards",
            animationDelay: "1100ms",
          }}
        >
          {[
            "Draft launch announcement",
            "Edit weekly digest",
          ].map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md px-2.5 py-2"
              style={{
                background: P.bgCard,
                border: `1px solid ${P.borderLight}`,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "#5A9E7B" }}
              />
              <span className="flex-1 text-[11px]" style={{ color: P.text }}>
                {t}
              </span>
              <span className="text-[9.5px]" style={{ color: P.textTertiary }}>
                Editor · running
              </span>
            </div>
          ))}
          <div
            className="rounded-md px-2.5 py-2 text-center text-[9.5px]"
            style={{
              background: P.paperWarm,
              border: `1px dashed ${P.borderLight}`,
              color: P.textTertiary,
            }}
          >
            7 hidden by filters
          </div>
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 5: Pick the brain per task ────────────────────────────────── */
function SlideRuntime() {
  const providers = [
    { name: "Claude", model: "Sonnet 4.6", selected: true },
    { name: "GPT-5", model: "Pro" },
    { name: "Gemini", model: "2.5 Pro" },
    { name: "Codex", model: "" },
  ];
  const efforts = [
    { name: "Low", note: "fast & cheap" },
    { name: "Medium", note: "balanced", selected: true },
    { name: "High", note: "deep thinking" },
  ];

  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Pick the <span style={{ color: P.accent }}>brain</span> per task.
        </>
      }
      description={
        <>
          Some tasks are quick lookups; some are 20-minute deep research.
          Choose provider, model, and effort per task — or accept the
          agent&apos;s default.
        </>
      }
    >
      <CardChrome width={400}>
        <div
          className="flex items-center gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <Cpu className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[12px] font-semibold" style={{ color: P.text }}>
            Runtime
          </span>
          <ChevronDown className="ml-auto h-3 w-3" style={{ color: P.textTertiary }} />
        </div>

        <div className="px-4 py-3">
          <div
            className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: P.textTertiary }}
          >
            Provider
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {providers.map((p, i) => (
              <div
                key={p.name}
                className="rounded-md px-2.5 py-1.5 opacity-0"
                style={{
                  background: p.selected ? P.accentBg : P.paperWarm,
                  border: `1px solid ${p.selected ? P.borderDark : P.borderLight}`,
                  animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                  animationDelay: `${400 + i * 90}ms`,
                }}
              >
                <div
                  className="text-[10.5px] font-semibold"
                  style={{ color: p.selected ? P.accent : P.text }}
                >
                  {p.name}
                </div>
                {p.model && (
                  <div className="text-[9px]" style={{ color: P.textTertiary }}>
                    {p.model}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div
          className="px-4 pb-4"
          style={{ borderTop: `1px solid ${P.borderLight}` }}
        >
          <div
            className="mt-3 mb-1.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: P.textTertiary }}
          >
            Effort
          </div>
          <div className="flex gap-1.5">
            {efforts.map((e, i) => (
              <div
                key={e.name}
                className="flex-1 rounded-md px-2 py-1.5 text-center opacity-0"
                style={{
                  background: e.selected ? P.accentBg : P.paperWarm,
                  border: `1px solid ${e.selected ? P.borderDark : P.borderLight}`,
                  animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                  animationDelay: `${800 + i * 100}ms`,
                }}
              >
                <div
                  className="text-[10.5px] font-semibold"
                  style={{ color: e.selected ? P.accent : P.text }}
                >
                  {e.name}
                </div>
                <div className="text-[8.5px]" style={{ color: P.textTertiary }}>
                  {e.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 6: Inside a task ──────────────────────────────────────────── */
function SlideInside() {
  const { t } = useLocale();
  return (
    <DemoSlideShell
      title={
        <>
          Open any <span style={{ color: P.accent }}>task</span>.
        </>
      }
      description={
        <>
          Click any card to see the full transcript, the artifacts the agent
          touched, and the cost it racked up. Reassign, retry, or pick up the
          conversation.
        </>
      }
    >
      <CardChrome width={420}>
        <div
          className="px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <div
            className="text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: P.textTertiary }}
          >
            Task
          </div>
          <div className="mt-0.5 text-[13.5px] font-semibold" style={{ color: P.text }}>
            Draft launch announcement
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: P.textTertiary }}>
            <span style={{ color: "#5A9E7B" }}>● running</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{t("demos:editor")}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Claude Sonnet 4.6</span>
          </div>
        </div>

        {/* Transcript */}
        <div className="px-4 py-3 space-y-2">
          <div
            className="rounded-lg rounded-bl-sm px-3 py-2 text-[10.5px] leading-relaxed opacity-0"
            style={{
              background: P.paperWarm,
              color: P.textSecondary,
              border: `1px solid ${P.borderLight}`,
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "400ms",
            }}
          >
            Draft a 200-word launch post for the new agents page. Punchy
            headline, three bullets, soft CTA.
          </div>
          <div
            className="ml-6 rounded-lg rounded-br-sm px-3 py-2 text-[10.5px] leading-relaxed opacity-0"
            style={{
              background: P.accentBg,
              color: P.text,
              border: `1px solid ${P.borderLight}`,
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "700ms",
            }}
          >
            Drafted v1. Want me to vary the tone for the email vs the blog?
          </div>
        </div>

        {/* Artifacts */}
        <div
          className="px-4 pb-4 opacity-0"
          style={{
            borderTop: `1px solid ${P.borderLight}`,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "1000ms",
          }}
        >
          <div
            className="mt-3 mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: P.textTertiary }}
          >
            <FileText className="h-2.5 w-2.5" />
            Artifacts
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              "@Launch/post.md",
              "@Launch/email-draft.md",
              "@Launch/social.md",
            ].map((f) => (
              <span
                key={f}
                className="rounded-md px-2 py-0.5 font-mono text-[9.5px]"
                style={{
                  background: P.bgCard,
                  border: `1px solid ${P.borderLight}`,
                  color: P.textSecondary,
                }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

export function buildTaskBoardDemo(): DemoConfig {
  return {
    id: "task-board",
    ariaLabel: "The task board — guided demo",
    slides: [
      { id: "board", render: () => <SlideBoard /> },
      { id: "views", render: () => <SlideThreeViews /> },
      { id: "schedule", render: () => <SlideScheduleView /> },
      { id: "filters", render: () => <SlideFilters /> },
      { id: "runtime", render: () => <SlideRuntime /> },
      { id: "inside", render: () => <SlideInside /> },
    ],
  };
}

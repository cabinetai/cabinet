"use client";

import {
  Calendar,
  Clock,
  Code2,
  History,
  Megaphone,
  MessageSquare,
  Pause,
  PenLine,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import { TOUR_PALETTE as P } from "@/components/onboarding/tour/palette";
import { DemoSlideShell, type DemoConfig } from "../demo-modal";

function CardChrome({ width = 320, children }: { width?: number; children: React.ReactNode }) {
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

/* ── Slide 1: Three ways to schedule ─────────────────────────────────── */
function SlideThreeWays() {
  return (
    <DemoSlideShell
      title={
        <>
          Three ways to <span style={{ color: P.accent }}>schedule</span>.
        </>
      }
      description={
        <>
          Routines are tasks running on a schedule. Use cron if you speak
          cron. Plain English if you don&apos;t. Or pick a one-off date for
          &ldquo;just this once, next Monday.&rdquo; Same routine, three
          doors in.
        </>
      }
    >
      <div className="space-y-2.5" style={{ width: 380 }}>
        {/* Cron entry */}
        <CardChrome width={380}>
          <div className="px-4 py-3 opacity-0" style={{
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "300ms",
          }}>
            <div className="flex items-center gap-2 mb-1">
              <Code2 className="h-3.5 w-3.5" style={{ color: P.accent }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: P.textTertiary }}>
                Cron
              </span>
            </div>
            <div
              className="rounded-md px-3 py-2 font-mono text-[12px]"
              style={{
                background: P.paperWarm,
                color: P.text,
                border: `1px solid ${P.borderLight}`,
              }}
            >
              0 9 * * 1-5
            </div>
            <div className="mt-1 text-[10px] italic" style={{ color: P.textTertiary }}>
              Every weekday at 9:00am
            </div>
          </div>
        </CardChrome>

        {/* Natural language */}
        <CardChrome width={380}>
          <div className="px-4 py-3 opacity-0" style={{
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "650ms",
          }}>
            <div className="flex items-center gap-2 mb-1">
              <Wand2 className="h-3.5 w-3.5" style={{ color: P.accent }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: P.textTertiary }}>
                Natural language
              </span>
            </div>
            <div
              className="rounded-md px-3 py-2 font-body-serif text-[12.5px] italic"
              style={{
                background: P.paperWarm,
                color: P.text,
                border: `1px solid ${P.borderLight}`,
              }}
            >
              every Friday at 6pm
            </div>
            <div className="mt-1 text-[10px] italic" style={{ color: P.textTertiary }}>
              Cabinet figures out the cron
            </div>
          </div>
        </CardChrome>

        {/* One-off */}
        <CardChrome width={380}>
          <div className="px-4 py-3 opacity-0" style={{
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "1000ms",
          }}>
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-3.5 w-3.5" style={{ color: P.accent }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: P.textTertiary }}>
                Once
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 rounded-md px-3 py-2 text-[12px]"
                style={{
                  background: P.paperWarm,
                  color: P.text,
                  border: `1px solid ${P.borderLight}`,
                }}
              >
                Next Monday · 09:00
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-semibold"
                style={{ background: P.accentBg, color: P.accent }}
              >
                One-off
              </span>
            </div>
          </div>
        </CardChrome>
      </div>
    </DemoSlideShell>
  );
}

/* ── Slide 2: One schedule, whole team ───────────────────────────────── */
function SlideTeamSchedule() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  type Block = { day: number; agent: string; label: string; icon: typeof Search; tint: string };
  const blocks: Block[] = [
    { day: 0, agent: "Researcher", label: "9 News scan", icon: Search, tint: P.accentBg },
    { day: 1, agent: "Researcher", label: "9 News scan", icon: Search, tint: P.accentBg },
    { day: 2, agent: "Researcher", label: "9 News scan", icon: Search, tint: P.accentBg },
    { day: 3, agent: "Researcher", label: "9 News scan", icon: Search, tint: P.accentBg },
    { day: 4, agent: "Researcher", label: "9 News scan", icon: Search, tint: P.accentBg },
    { day: 0, agent: "PM", label: "10 Triage", icon: MessageSquare, tint: "#F0E1D0" },
    { day: 4, agent: "Editor", label: "18 Digest", icon: PenLine, tint: "#EDDCC4" },
    { day: 2, agent: "CMO", label: "14 Standup", icon: Megaphone, tint: "#E8D2BD" },
  ];

  return (
    <DemoSlideShell
      reversed
      title={
        <>
          One <span style={{ color: P.accent }}>schedule</span>, whole team.
        </>
      }
      description={
        <>
          Every routine across every agent lands in the same calendar. See
          who&apos;s running when, what&apos;s on tomorrow, where the gaps
          are.
        </>
      }
    >
      <CardChrome width={420}>
        <div
          className="flex items-center gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <Calendar className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[12px] font-semibold" style={{ color: P.text }}>
            This week
          </span>
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold"
            style={{ background: P.accentBg, color: P.accent }}
          >
            8 routines
          </span>
        </div>

        {/* Day header */}
        <div className="grid grid-cols-5 gap-1 px-3 pt-3">
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

        {/* Block grid */}
        <div className="grid grid-cols-5 gap-1 px-3 py-2">
          {Array.from({ length: 4 }).map((_, row) =>
            days.map((_, col) => {
              const block = blocks.find(
                (b) => b.day === col && Math.floor(blocks.indexOf(b) / 5) === row,
              );
              if (!block) {
                return (
                  <div
                    key={`${row}-${col}`}
                    className="h-7 rounded-sm"
                    style={{
                      background: "transparent",
                      border: `1px dashed ${P.borderLight}`,
                    }}
                  />
                );
              }
              const Icon = block.icon;
              const i = blocks.indexOf(block);
              return (
                <div
                  key={`${row}-${col}`}
                  className="flex h-7 items-center gap-1 rounded-sm px-1 opacity-0"
                  style={{
                    background: block.tint,
                    border: `1px solid ${P.borderDark}`,
                    animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                    animationDelay: `${400 + i * 90}ms`,
                  }}
                  title={`${block.agent} — ${block.label}`}
                >
                  <Icon
                    className="h-2.5 w-2.5 shrink-0"
                    style={{ color: P.accent }}
                  />
                  <span
                    className="truncate text-[8.5px] font-semibold"
                    style={{ color: P.text }}
                  >
                    {block.label}
                  </span>
                </div>
              );
            }),
          )}
        </div>

        {/* Legend */}
        <div
          className="flex flex-wrap gap-1.5 px-3 py-3 opacity-0"
          style={{
            borderTop: `1px solid ${P.borderLight}`,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "1300ms",
          }}
        >
          {[
            { name: "Researcher", icon: Search },
            { name: "PM", icon: MessageSquare },
            { name: "Editor", icon: PenLine },
            { name: "CMO", icon: Megaphone },
          ].map((agent) => {
            const Icon = agent.icon;
            return (
              <span
                key={agent.name}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
                style={{
                  background: P.paperWarm,
                  color: P.textSecondary,
                  border: `1px solid ${P.borderLight}`,
                }}
              >
                <Icon className="h-2.5 w-2.5" style={{ color: P.accent }} />
                {agent.name}
              </span>
            );
          })}
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 3: Pause, edit, replay ────────────────────────────────────── */
function SlideManage() {
  const runs = [
    { time: "Today · 09:00", status: "ok", note: "18 articles · digest sent" },
    { time: "Yesterday · 09:00", status: "ok", note: "14 articles · digest sent" },
    { time: "Mon · 09:00", status: "warn", note: "Skipped — agent paused" },
  ];

  return (
    <DemoSlideShell
      title={
        <>
          Pause, edit, <span style={{ color: P.accent }}>replay</span>.
        </>
      }
      description={
        <>
          Every routine has a clear control panel. Pause it for the holiday,
          edit the cron, replay a missed run, or scroll its run history to
          see exactly what happened.
        </>
      }
    >
      <CardChrome width={400}>
        <div
          className="flex items-center gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <Clock className="h-4 w-4" style={{ color: P.accent }} />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold" style={{ color: P.text }}>
              News scan
            </div>
            <div className="text-[10px]" style={{ color: P.textTertiary }}>
              Researcher · weekdays 09:00
            </div>
          </div>
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
            style={{ background: "#E8F0E8", color: "#4A8E6B" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "#4A8E6B" }}
            />
            Live
          </span>
        </div>

        {/* Action row */}
        <div
          className="flex items-center gap-1.5 px-4 py-2.5 opacity-0"
          style={{
            borderBottom: `1px solid ${P.borderLight}`,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "350ms",
          }}
        >
          {[
            { icon: Pause, label: "Pause" },
            { icon: Sparkles, label: "Run now" },
            { icon: Calendar, label: "Edit" },
            { icon: History, label: "History" },
          ].map((a) => {
            const Icon = a.icon;
            return (
              <span
                key={a.label}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold"
                style={{
                  background: P.paperWarm,
                  color: P.textSecondary,
                  border: `1px solid ${P.borderLight}`,
                }}
              >
                <Icon className="h-2.5 w-2.5" />
                {a.label}
              </span>
            );
          })}
        </div>

        {/* Run history */}
        <div className="px-4 py-3">
          <div
            className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: P.textTertiary }}
          >
            <History className="h-2.5 w-2.5" />
            Recent runs
          </div>
          <div className="space-y-1.5">
            {runs.map((r, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md px-2.5 py-1.5 opacity-0"
                style={{
                  background: P.paperWarm,
                  border: `1px solid ${P.borderLight}`,
                  animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                  animationDelay: `${700 + i * 150}ms`,
                }}
              >
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: r.status === "ok" ? "#5A9E7B" : "#D4A752",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] font-semibold" style={{ color: P.text }}>
                    {r.time}
                  </div>
                  <div className="text-[9.5px]" style={{ color: P.textSecondary }}>
                    {r.note}
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

export function buildRoutinesDemo(): DemoConfig {
  return {
    id: "routines",
    ariaLabel: "Routines & schedules — guided demo",
    slides: [
      { id: "three-ways", render: () => <SlideThreeWays /> },
      { id: "team-schedule", render: () => <SlideTeamSchedule /> },
      { id: "manage", render: () => <SlideManage /> },
    ],
  };
}

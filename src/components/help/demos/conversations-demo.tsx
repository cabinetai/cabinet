"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  DollarSign,
  FileText,
  Asterisk,
  Users,
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

/* ── Slide 1: Agents talk back ───────────────────────────────────────── */
function SlideTalkBack() {
  return (
    <DemoSlideShell
      title={
        <>
          Agents <span style={{ color: P.accent }}>talk back</span>.
        </>
      }
      description={
        <>
          Every agent has a real conversation with you. Ask a question, get a
          plan. Agree, push back, refine. Cabinet doesn&apos;t run anything
          you didn&apos;t agree to.
        </>
      }
    >
      <CardChrome width={420}>
        <div
          className="flex items-center gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <Users className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[12.5px] font-semibold" style={{ color: P.text }}>
            CMO
          </span>
          <span
            className="ms-auto text-[10px]"
            style={{ color: P.textTertiary }}
          >
            Marketing
          </span>
        </div>

        <div className="space-y-2.5 px-4 py-3">
          <div
            className="rounded-lg rounded-es-sm px-3 py-2 text-[11px] leading-relaxed opacity-0"
            style={{
              background: P.paperWarm,
              color: P.textSecondary,
              border: `1px solid ${P.borderLight}`,
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "300ms",
            }}
          >
            Plan our launch announcement for next Tuesday. Email + blog +
            three social posts.
          </div>

          <div
            className="ms-6 rounded-lg rounded-ee-sm px-3 py-2 text-[11px] leading-relaxed opacity-0"
            style={{
              background: P.accentBg,
              color: P.text,
              border: `1px solid ${P.borderLight}`,
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "700ms",
            }}
          >
            Got it. I&apos;ll dispatch the writer for the blog and three
            posts, and I&apos;ll handle the email. Want me to schedule them
            for Tuesday 10am, or send manually?
          </div>

          <div
            className="rounded-lg rounded-es-sm px-3 py-2 text-[11px] leading-relaxed opacity-0"
            style={{
              background: P.paperWarm,
              color: P.textSecondary,
              border: `1px solid ${P.borderLight}`,
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "1100ms",
            }}
          >
            Schedule them. Tuesday 10am sharp.
          </div>

          {/* Status pill */}
          <div
            className="flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 opacity-0"
            style={{
              background: "transparent",
              border: `1px dashed ${P.borderDark}`,
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "1500ms",
            }}
          >
            <Asterisk className="h-3 w-3" style={{ color: P.accent }} />
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: P.accent }}
            >
              4 actions queued, review below
            </span>
          </div>
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 2: Pending actions queue ──────────────────────────────────── */
function SlideQueue() {
  const actions: { type: string; title: string; agent: string; flag?: "warn"; icon: typeof FileText }[] = [
    { type: "LAUNCH_TASK", title: "Draft launch blog post", agent: "Writer", icon: FileText },
    { type: "LAUNCH_TASK", title: "Write 3 launch tweets", agent: "Writer", icon: FileText },
    { type: "SCHEDULE_TASK", title: "Send launch email · Tue 10:00", agent: "CMO", icon: Calendar },
    { type: "LAUNCH_TASK", title: "Generate hero image (high cost)", agent: "Designer", flag: "warn", icon: AlertTriangle },
  ];

  return (
    <DemoSlideShell
      reversed
      title={
        <>
          A <span style={{ color: P.accent }}>queue</span> of pending actions.
        </>
      }
      description={
        <>
          When agents propose actions they stack up here, and on the kanban
          they surface in the &ldquo;Your turn&rdquo; lane. Skim them,
          approve the easy ones in batch, and look twice at the ones flagged
          for cost, conflicts, or destructive changes.
        </>
      }
    >
      <CardChrome width={420}>
        <div
          className="flex items-center gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <Bell className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[12.5px] font-semibold" style={{ color: P.text }}>
            Pending actions
          </span>
          <span
            className="ms-auto rounded-full px-2 py-0.5 text-[9px] font-semibold"
            style={{ background: P.accentBg, color: P.accent }}
          >
            4 waiting
          </span>
        </div>

        <div className="space-y-1.5 px-3 py-3">
          {actions.map((a, i) => {
            const Icon = a.icon;
            const isWarn = a.flag === "warn";
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg px-3 py-2 opacity-0"
                style={{
                  background: isWarn ? "#FAEFE0" : P.paperWarm,
                  border: `1px solid ${isWarn ? "#E8C896" : P.borderLight}`,
                  animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                  animationDelay: `${300 + i * 130}ms`,
                }}
              >
                <CheckSquare
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: P.textTertiary }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Icon
                      className="h-2.5 w-2.5 shrink-0"
                      style={{ color: isWarn ? "#B8722E" : P.accent }}
                    />
                    <span
                      className="font-mono text-[8.5px] font-semibold uppercase tracking-wider"
                      style={{ color: P.textTertiary }}
                    >
                      {a.type}
                    </span>
                    {isWarn && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wider"
                        style={{ background: "#FFE4C4", color: "#B8722E" }}
                      >
                        Review
                      </span>
                    )}
                  </div>
                  <div
                    className="text-[10.5px] font-medium truncate"
                    style={{ color: P.text }}
                  >
                    {a.title}
                  </div>
                </div>
                <span
                  className="text-[9.5px]"
                  style={{ color: P.textTertiary }}
                >
                  {a.agent}
                </span>
              </div>
            );
          })}
        </div>

        {/* Batch action footer */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 opacity-0"
          style={{
            borderTop: `1px solid ${P.borderLight}`,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "1100ms",
          }}
        >
          <span className="text-[10px]" style={{ color: P.textTertiary }}>
            3 selected
          </span>
          <span
            className="ms-auto flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold"
            style={{
              background: "transparent",
              color: P.textSecondary,
              border: `1px solid ${P.borderLight}`,
            }}
          >
            Decline
          </span>
          <span
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold"
            style={{ background: P.accent, color: P.paper }}
          >
            <Asterisk className="h-2.5 w-2.5" />
            Approve 3
          </span>
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 3: One-click full audit ───────────────────────────────────── */
function SlideAudit() {
  return (
    <DemoSlideShell
      title={
        <>
          One click, <span style={{ color: P.accent }}>full audit</span>.
        </>
      }
      description={
        <>
          Tap any action to see exactly what will happen before you say yes:
          which agent, what prompt, which files it&apos;ll touch, the
          estimated cost and runtime. No surprises.
        </>
      }
    >
      <CardChrome width={420}>
        <div className="flex items-center gap-2 px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${P.border}` }}>
          <CheckCircle2 className="h-4 w-4" style={{ color: P.iconAmber }} />
          <span className="text-[12.5px] font-semibold" style={{ color: P.text }}>
            LAUNCH_TASK
          </span>
          <span className="ms-auto text-[10px]" style={{ color: P.textTertiary }}>
            from CMO
          </span>
        </div>

        <div className="px-4 py-3 space-y-2.5">
          {/* Prompt */}
          <div
            className="rounded-lg px-3 py-2 opacity-0"
            style={{
              background: P.paperWarm,
              border: `1px solid ${P.borderLight}`,
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "300ms",
            }}
          >
            <div
              className="text-[8.5px] font-semibold uppercase tracking-wider"
              style={{ color: P.textTertiary }}
            >
              Prompt
            </div>
            <div className="mt-0.5 font-body-serif text-[11px]" style={{ color: P.textSecondary }}>
              Draft a 200-word launch blog post. Punchy headline, three
              bullets, soft CTA to the waitlist.
            </div>
          </div>

          {/* Agent + runtime */}
          <div
            className="grid grid-cols-2 gap-2 opacity-0"
            style={{
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "550ms",
            }}
          >
            <div
              className="rounded-lg px-3 py-2"
              style={{
                background: P.bgCard,
                border: `1px solid ${P.borderLight}`,
              }}
            >
              <div
                className="text-[8.5px] font-semibold uppercase tracking-wider"
                style={{ color: P.textTertiary }}
              >
                Agent
              </div>
              <div className="mt-0.5 text-[10.5px] font-semibold" style={{ color: P.text }}>
                Writer
              </div>
            </div>
            <div
              className="rounded-lg px-3 py-2"
              style={{
                background: P.bgCard,
                border: `1px solid ${P.borderLight}`,
              }}
            >
              <div
                className="text-[8.5px] font-semibold uppercase tracking-wider"
                style={{ color: P.textTertiary }}
              >
                Runtime
              </div>
              <div className="mt-0.5 text-[10.5px] font-semibold" style={{ color: P.text }}>
                Claude · medium
              </div>
            </div>
          </div>

          {/* Files + cost */}
          <div
            className="flex items-center gap-3 rounded-lg px-3 py-2 opacity-0"
            style={{
              background: P.paperWarm,
              border: `1px solid ${P.borderLight}`,
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "800ms",
            }}
          >
            <div className="flex items-center gap-1.5">
              <FileText className="h-3 w-3" style={{ color: P.accent }} />
              <span className="font-mono text-[10px]" style={{ color: P.textSecondary }}>
                @Launch/post.md
              </span>
            </div>
            <span className="ms-auto flex items-center gap-1 text-[9.5px]" style={{ color: P.textTertiary }}>
              <DollarSign className="h-2.5 w-2.5" />
              ~$0.04
            </span>
            <span className="flex items-center gap-1 text-[9.5px]" style={{ color: P.textTertiary }}>
              <Clock className="h-2.5 w-2.5" />
              ~2m
            </span>
          </div>

          {/* Action row */}
          <div
            className="flex items-center gap-2 opacity-0"
            style={{
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "1100ms",
            }}
          >
            <span
              className="flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-semibold"
              style={{ background: P.accent, color: P.paper }}
            >
              <Asterisk className="h-3 w-3" />
              Approve & run
              <ArrowRight className="h-3 w-3 rtl:rotate-180" />
            </span>
            <span
              className="flex-1 rounded-lg py-2 text-center text-[11px] font-semibold"
              style={{
                background: "transparent",
                color: P.textSecondary,
                border: `1px solid ${P.borderLight}`,
              }}
            >
              Decline
            </span>
          </div>
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

export function buildConversationsDemo(): DemoConfig {
  return {
    id: "conversations",
    ariaLabel: "Conversations & approvals: guided demo",
    slides: [
      { id: "talk-back", render: () => <SlideTalkBack /> },
      { id: "queue", render: () => <SlideQueue /> },
      { id: "audit", render: () => <SlideAudit /> },
    ],
  };
}

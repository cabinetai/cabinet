"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Check,
  ClipboardCheck,
  Copy,
  Loader2,
  Rocket,
  ChevronDown,
  RefreshCw,
  Sparkles,
  Terminal,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { HomeBlueprintBackground } from "@/components/onboarding/home-blueprint-background";
import { isAgentProviderSelectable } from "@/lib/agents/provider-filters";
import { ProviderGlyph } from "@/components/agents/provider-glyph";
import type { ProviderInfo } from "@/types/agents";
import { TiltCard } from "@/components/ui/tilt-card";
import { showError } from "@/lib/ui/toast";
import {
  ROOMS,
  ROOM_TYPES,
  STARTER_TEAMS,
  type RoomType,
  type StarterTeam,
} from "@/lib/onboarding/rooms";
import { getSuggestedProviderEffort } from "@/lib/agents/runtime-options";
import { sendTelemetry } from "@/lib/telemetry/browser";
import { acknowledgeDisclaimer } from "@/components/layout/breaking-changes-warning";

type OnboardingVerifyStatus =
  | "pass"
  | "not_installed"
  | "auth_required"
  | "payment_required"
  | "quota_exceeded"
  | "other_error";

interface OnboardingVerifyResult {
  status: OnboardingVerifyStatus;
  failedStepTitle: string;
  command: string;
  exitCode: number | null;
  signal: string | null;
  output: string;
  stderr: string;
  durationMs: number;
  hint?: string;
}

type OnboardingVerifyState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; result: OnboardingVerifyResult }
  | { phase: "error"; message: string };

const ONBOARDING_VERIFY_META: Record<OnboardingVerifyStatus, { label: string; color: string; bg: string }> = {
  pass: { label: "Passed", color: "#16a34a", bg: "rgba(22,163,74,0.1)" },
  not_installed: { label: "Not installed", color: "#64748b", bg: "rgba(100,116,139,0.12)" },
  auth_required: { label: "Auth required", color: "#d97706", bg: "rgba(217,119,6,0.12)" },
  payment_required: { label: "Payment required", color: "#e11d48", bg: "rgba(225,29,72,0.12)" },
  quota_exceeded: { label: "Quota / rate limit", color: "#ea580c", bg: "rgba(234,88,12,0.12)" },
  other_error: { label: "Error", color: "#e11d48", bg: "rgba(225,29,72,0.1)" },
};

interface OnboardingAnswers {
  name: string;
  role: string;
  homeName: string;
  roomType: RoomType;
  workspaceName: string;
  description: string;
  teamSize: string;
  priority: string;
}

interface SuggestedAgent {
  slug: string;
  name: string;
  emoji: string;
  role: string;
  checked: boolean;
}

// Typewritten on the Welcome home step after the blueprint finishes drawing.
const WELCOME_PARAGRAPH =
  "Your Observatory is where spaces, agents, memory, governance, MCP access, traces, and evals come together. Set up one space now; the observability surfaces are already wired into the Optale brain.";
const WELCOME_TYPE_START_MS = 4800; // begin typing shortly after heading fades in
const WELCOME_TYPE_CHAR_MS = 32;

// Step indices after the compress pass:
// 0 intro · 1 welcome · 2 space-setup · 3 team · 4 provider · 5 launch
const STEP_COUNT = 6;
const STEP_WELCOME_HOME = 1;
const STEP_ROOM_SETUP = 2;
const STEP_TEAM = 3;
const STEP_PROVIDER = 4;
const STEP_LAUNCH = 5;

/* ─── Optale Observatory onboarding palette ─── */
const WEB = {
  bg: "#F8FAFC",
  bgWarm: "#EEF6F7",
  bgCard: "#FFFFFF",
  text: "#101820",
  textSecondary: "#475569",
  textTertiary: "#64748B",
  accent: "#0F766E",
  accentWarm: "#115E59",
  accentBg: "#DDF7F3",
  border: "#D7E3E7",
  borderLight: "#E6EEF1",
  borderDark: "#9FB6BE",
} as const;

// Agent pre-check + mandatory-lock logic is now room-aware — see getKeywordChecks
// and getAlwaysChecked below. The old KEYWORD_CHECKS / ALWAYS_CHECKED constants
// were per-room-type "office" defaults.

function getKeywordChecksForRoom(roomType: RoomType): [RegExp, string[]][] {
  return ROOMS[roomType].keywordMap;
}

function getAlwaysCheckedForRoom(roomType: RoomType): Set<string> {
  return new Set(ROOMS[roomType].mandatoryAgents);
}

// Starter teams are now defined in src/lib/onboarding/rooms.ts (STARTER_TEAMS)
// with a `rooms` field so the carousel can filter per room type.
type PreMadeTeam = StarterTeam;

function TerminalCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 mt-1.5 font-mono text-[12px]"
      style={{ background: "#1e1e1e", color: "#d4d4d4" }}
    >
      <span style={{ color: "#6A9955" }}>$</span>
      <span className="flex-1 select-all">{command}</span>
      <button
        onClick={copy}
        className="shrink-0 p-1 rounded transition-colors hover:bg-white/10"
        title="Copy to clipboard"
      >
        {copied ? (
          <ClipboardCheck className="size-3.5" style={{ color: "#6A9955" }} />
        ) : (
          <Copy className="size-3.5" style={{ color: "#808080" }} />
        )}
      </button>
    </div>
  );
}

function TeamCarousel({
  roomType,
}: {
  roomType: RoomType;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  const items: PreMadeTeam[] = STARTER_TEAMS.filter((t) => t.rooms.includes(roomType));

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let animationId: number;
    let position = 0;

    const animate = () => {
      if (!isPaused) {
        position += 1.2;
        const halfWidth = el.scrollWidth / 2;
        if (position >= halfWidth) position = 0;
        el.style.transform = `translateX(-${position}px)`;
      }
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [isPaused]);

  const doubled = [...items, ...items];

  return (
    <div
      className="tilt-carousel relative w-full py-4"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div ref={scrollRef} className="flex gap-2 will-change-transform">
        {doubled.map((item, i) => {
          const agentCount = item.agents;
          const coverUrl = null;
          return (
            <TiltCard
              key={`${item.name}-${i}`}
              className="flex-shrink-0 w-48"
            >
            <button
              className="fancy-card w-48 flex flex-col text-left"
              style={{
                border: `1px solid ${WEB.border}`,
                background: WEB.bgCard,
                cursor: "default",
              }}
              type="button"
            >
              <div
                className="relative h-20 w-full"
                style={{
                  background: coverUrl ? undefined : WEB.accentBg,
                  backgroundImage: coverUrl ? `url(${coverUrl})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
                aria-hidden
              >
                {!coverUrl && (
                  <div className="absolute inset-0 flex items-center justify-center text-xl opacity-40">
                    📦
                  </div>
                )}
              </div>
              <div className="p-2.5 flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-medium leading-tight line-clamp-1 flex-1 min-w-0" style={{ color: WEB.text }}>
                    {item.name}
                  </p>
                  <span className="text-[9px] shrink-0" style={{ color: WEB.textTertiary }}>
                    {agentCount} agents
                  </span>
                </div>
                <p className="text-[9px] leading-snug line-clamp-2" style={{ color: WEB.textSecondary }}>
                  {item.description}
                </p>
              </div>
            </button>
            </TiltCard>
          );
        })}
      </div>
    </div>
  );
}

function IntroStep({ onNext }: { onNext: () => void }) {
  const [phase, setPhase] = useState(0);
  // 0: nothing  1: card border + title  2: context
  // 3: def 1  4: def 2  5: def 3  6: tagline line 1  7: tagline line 2  8: button

  useEffect(() => {
    const delays = [300, 600, 1100, 1700, 2300, 3100, 3700, 4200];
    const timers = delays.map((ms, i) =>
      setTimeout(() => setPhase(i + 1), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const fade = (p: number): CSSProperties => ({
    opacity: phase >= p ? 1 : 0,
    transform: phase >= p ? "translateY(0)" : "translateY(14px)",
    transition: "opacity 0.6s ease, transform 0.6s ease",
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:gap-10 w-full">
        {/* Product frame */}
        <div
          className="text-left rounded-2xl px-8 py-8 md:px-10 md:py-10 flex-1"
          style={{
            background: WEB.bgCard,
            border: `1px solid ${phase >= 1 ? WEB.border : "transparent"}`,
            boxShadow: phase >= 1
              ? "0 1px 3px rgba(59, 47, 47, 0.04), 0 8px 30px rgba(59, 47, 47, 0.04)"
              : "none",
            transition: "border-color 0.5s ease, box-shadow 0.8s ease",
          }}
        >
          <div className="flex items-baseline gap-3 mb-1" style={fade(1)}>
            <h1
              className="font-sans text-4xl sm:text-5xl font-semibold tracking-normal"
              style={{ color: WEB.text }}
            >
              Optale Observatory
            </h1>
            <span
              className="font-mono text-xs"
              style={{ ...fade(2), color: WEB.textTertiary }}
            >
              spaces · brain · evals
            </span>
          </div>
          <p
            className="font-mono text-xs mb-6"
            style={{ ...fade(2), color: WEB.textTertiary }}
          >
            operational control plane
          </p>

          <ol className="space-y-5 text-[15px] leading-relaxed">
            <li className="flex gap-3" style={fade(3)}>
              <span className="font-sans text-lg font-semibold mt-[-2px] shrink-0" style={{ color: WEB.accent }}>1.</span>
              <div>
                <p style={{ color: WEB.textSecondary }}>
                  A governed workspace for agents, jobs, files, MCP clients, and shared memory.
                </p>
                <p className="font-mono text-xs mt-1.5" style={{ color: WEB.textTertiary }}>
                  &ldquo;open the product space and review the active agents&rdquo;
                </p>
              </div>
            </li>
            <li className="flex gap-3" style={fade(4)}>
              <span className="font-sans text-lg font-semibold mt-[-2px] shrink-0" style={{ color: WEB.accent }}>2.</span>
              <div>
                <p style={{ color: WEB.textSecondary }}>
                  <span
                    className="font-mono text-[11px] uppercase tracking-wider mr-1.5 px-1.5 py-0.5 rounded"
                    style={{ color: WEB.textTertiary, background: WEB.bgWarm }}
                  >
                    observability
                  </span>
                  Trace what agents touched, which tools they used, and where policy stopped them.
                </p>
                <p className="font-mono text-xs mt-1.5" style={{ color: WEB.textTertiary }}>
                  &ldquo;inspect MCP activity and eval drift before the next rollout&rdquo;
                </p>
              </div>
            </li>
            <li className="flex gap-3" style={fade(5)}>
              <span className="font-sans text-lg font-semibold mt-[-2px] shrink-0" style={{ color: WEB.accent }}>3.</span>
              <div>
                <p style={{ color: WEB.text }}>
                  <span
                    className="font-mono text-[11px] uppercase tracking-wider mr-1.5 px-1.5 py-0.5 rounded"
                    style={{ color: WEB.accent, background: WEB.accentBg }}
                  >
                    optale
                  </span>
                  The administrative app for Optale spaces, brain sources, governance, traces, and evals.
                </p>
                <p className="font-mono text-xs mt-1.5" style={{ color: WEB.textTertiary }}>
                  &ldquo;turn the brain on, connect the client, then run the check&rdquo;
                </p>
              </div>
            </li>
          </ol>
        </div>

        {/* Tagline + CTA */}
        <div className="flex flex-col items-center lg:items-start gap-6 py-6 lg:py-0 lg:max-w-xs shrink-0">
          <h2 className="text-center lg:text-left text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-normal leading-[1.1]">
            <span className="font-sans" style={{ ...fade(6), color: WEB.text, display: "inline-block" }}>
              Your spaces.
            </span>
            <br />
            <span
              className="font-sans"
              style={{
                ...fade(7),
                display: "inline-block",
                background: `linear-gradient(135deg, ${WEB.text} 0%, ${WEB.accent} 60%, #0891B2 100%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Your operating view.
            </span>
          </h2>

          <div style={fade(8)}>
            <button
              onClick={onNext}
              className="inline-flex items-center justify-center gap-2.5 rounded-full px-10 py-4 text-base font-medium text-white transition-all hover:-translate-y-0.5 shadow-sm w-full lg:w-auto"
              style={{ background: WEB.accent }}
            >
              Get started
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Welcome Back — shown when an existing local space is detected ─── */

function WelcomeBackStep({
  cabinetName,
  onNext,
}: {
  cabinetName?: string;
  onNext: () => void;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-8 animate-in fade-in duration-500">
      <div
        className="text-center space-y-3 transition-all duration-700"
        style={{ opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(12px)" }}
      >
        <CheckCircle2 className="size-10 mx-auto" style={{ color: WEB.accent }} />
        <h1 className="font-sans font-semibold text-2xl tracking-normal" style={{ color: WEB.text }}>
          Welcome back{cabinetName ? ` to ${cabinetName}` : ""}
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
          We found an existing space here. Let&apos;s finish setting it up.
        </p>
      </div>

      <button
        onClick={onNext}
        className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-medium text-white transition-all hover:-translate-y-0.5 duration-300"
        style={{
          background: WEB.accent,
          opacity: show ? 1 : 0,
          transform: show ? "translateY(0)" : "translateY(8px)",
        }}
      >
        Continue
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function TeamBuildStep({
  agentsLoading,
  suggestedAgents,
  libraryTemplates,
  launchDisabled,
  selectedCount,
  maxAgents,
  toggleAgent,
  roomType,
  mandatoryAgents,
  onBack,
  onNext,
}: {
  agentsLoading: boolean;
  suggestedAgents: SuggestedAgent[];
  libraryTemplates: LibraryTemplate[];
  launchDisabled: boolean;
  selectedCount: number;
  maxAgents: number;
  toggleAgent: (slug: string) => void;
  roomType: RoomType;
  mandatoryAgents: Set<string>;
  onBack: () => void;
  onNext: () => void;
}) {
  const [phase, setPhase] = useState(0);
  // phase 0: title
  // phase 1: "import" label
  // phase 2: carousel visible
  // phase 3: (reserved)
  // phase 4: "or pick" label + agents

  // Department-columns drag-to-scroll. The columns row has hidden scrollbars
  // by design; click-and-drag horizontally to pan. A small movement threshold
  // (DRAG_THRESHOLD_PX) keeps real clicks on column items from being eaten by
  // the drag handler — only sustained motion counts as a drag.
  const columnsScrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const DRAG_THRESHOLD_PX = 5;

  const onColumnsPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore secondary buttons and touches that aren't primary contact.
    if (e.button !== 0 && e.pointerType !== "touch") return;
    const el = columnsScrollRef.current;
    if (!el) return;
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      moved: false,
    };
  }, []);

  const onColumnsPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    const el = columnsScrollRef.current;
    if (!state || state.pointerId !== e.pointerId || !el) return;
    const dx = e.clientX - state.startX;
    if (!state.moved && Math.abs(dx) >= DRAG_THRESHOLD_PX) {
      state.moved = true;
      setIsDragging(true);
      // Capture so we keep getting move/up events even if cursor leaves the
      // container, and so text selection is suppressed for the duration.
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* some browsers reject capture on synthetic events; degrade gracefully */
      }
    }
    if (state.moved) {
      el.scrollLeft = state.startScrollLeft - dx;
    }
  }, []);

  const onColumnsPointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const wasDrag = state.moved;
    dragStateRef.current = null;
    if (wasDrag) {
      setIsDragging(false);
      // Suppress the click that would otherwise fire on whatever was under
      // the cursor at pointer-up — the user was dragging, not clicking.
      const swallow = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      // Belt-and-braces: if no click materializes (drag ended off any
      // element), drop the listener on the next frame so we don't eat a
      // legitimate click later.
      window.requestAnimationFrame(() => {
        window.removeEventListener("click", swallow, { capture: true });
      });
    }
  }, []);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(4), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* Title */}
      <div
        className="text-center space-y-2 transition-all duration-500"
        style={{ opacity: 1 }}
      >
        <h1 className="font-sans font-semibold text-2xl tracking-normal">
          Build <span style={{ color: WEB.accent }}>your</span> team
        </h1>
        <p className="text-sm" style={{ color: WEB.textSecondary }}>
          Each space is an AI team: agents, tasks, and a shared knowledge base working together.
        </p>
      </div>

      {/* Carousel section */}
      <div
        className="space-y-2 transition-all duration-700"
        style={{
          width: "100vw",
          marginLeft: "calc(-50vw + 50%)",
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? "translateY(0)" : "translateY(12px)",
        }}
      >
        <div className="flex items-center justify-center gap-3">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: WEB.textTertiary }}
          >
            Local starter patterns
          </p>
        </div>
        <div
          className="transition-opacity duration-500"
          style={{ opacity: phase >= 2 ? 1 : 0 }}
        >
          <TeamCarousel
            roomType={roomType}
          />
        </div>
      </div>

      {/* Agent selection */}
      <div
        className="transition-all duration-700"
        style={{
          width: "100vw",
          marginLeft: "calc(-50vw + 50%)",
          opacity: phase >= 4 ? 1 : 0,
          transform: phase >= 4 ? "translateY(0)" : "translateY(12px)",
        }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-wider text-center mb-2"
          style={{ color: WEB.textTertiary }}
        >
          Or pick your agents{" "}
          <span style={{ color: selectedCount >= maxAgents ? WEB.accent : WEB.textTertiary }}>
            ({selectedCount}/{maxAgents})
          </span>
        </p>
        {agentsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin" style={{ color: WEB.textTertiary }} />
          </div>
        ) : (
          <div
            ref={columnsScrollRef}
            onPointerDown={onColumnsPointerDown}
            onPointerMove={onColumnsPointerMove}
            onPointerUp={onColumnsPointerEnd}
            onPointerCancel={onColumnsPointerEnd}
            className="flex items-start justify-center gap-3 overflow-x-auto px-6 pb-2 scrollbar-hide select-none"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              cursor: isDragging ? "grabbing" : "grab",
              touchAction: "pan-y",
            } as React.CSSProperties}
          >
            {groupByDepartment(suggestedAgents, libraryTemplates, roomType).map(([label, agents]) => (
              <div
                key={label}
                className="flex flex-col rounded-xl p-3 shrink-0"
                style={{ background: WEB.bgWarm, width: 180, maxHeight: 260 }}
              >
                <p
                  className="mb-2 text-[10px] font-semibold uppercase tracking-wider shrink-0"
                  style={{ color: WEB.textTertiary }}
                >
                  {label}
                </p>
                <div className="flex flex-col gap-1.5 overflow-y-auto scrollbar-thin pr-1">
                  {agents.map((agent) => {
                    const isMandatory = mandatoryAgents.has(agent.slug);
                    const atLimit = selectedCount >= maxAgents && !agent.checked;
                    return (
                      <button
                        key={agent.slug}
                        onClick={() => toggleAgent(agent.slug)}
                        disabled={isMandatory || atLimit}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all"
                        style={{
                          border: `1px solid ${agent.checked ? WEB.accent : WEB.border}`,
                          background: agent.checked ? WEB.accentBg : WEB.bgCard,
                          opacity: atLimit ? 0.45 : 1,
                          cursor: isMandatory ? "default" : atLimit ? "not-allowed" : "pointer",
                        }}
                      >
                        <div
                          className="flex size-3.5 shrink-0 items-center justify-center rounded"
                          style={{
                            border: `1.5px solid ${agent.checked ? WEB.accent : WEB.borderDark}`,
                            background: agent.checked ? WEB.accent : "transparent",
                          }}
                        >
                          {agent.checked && (
                            <Check className="size-2 text-white" />
                          )}
                        </div>
                        <span className="text-xs">{agent.emoji}</span>
                        <p className="text-[11px] font-medium truncate" style={{ color: WEB.text }}>
                          {agent.name}
                        </p>
                        {isMandatory && (
                          <span
                            className="ml-auto text-[9px] font-medium uppercase tracking-wide shrink-0"
                            style={{ color: WEB.textTertiary }}
                          >
                            Required
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
          style={{ color: WEB.textSecondary }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={launchDisabled}
          className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
          style={{ background: WEB.accent }}
        >
          Next
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Room-aware grouping: each room has its own vocabulary for organising the
// agent picker. A department not mapped for the active room falls to "Other".
type DepartmentOrder = [string, string][];

const OFFICE_ORDER: DepartmentOrder = [
  ["leadership", "Leadership"],
  ["marketing", "Marketing"],
  ["content", "Content"],
  ["publishing", "Content"],
  ["engineering", "Engineering"],
  ["product", "Product & Design"],
  ["design", "Product & Design"],
  ["sales", "Business"],
  ["support", "Business"],
  ["analytics", "Business"],
  ["research", "Research"],
  ["finance", "Finance & Ops"],
  ["legal", "Finance & Ops"],
  ["hr", "Finance & Ops"],
  ["personal", "Personal"],
  ["household", "Personal"],
];

const STUDY_ORDER: DepartmentOrder = [
  ["leadership", "Leadership"],
  ["personal", "Second brain"],
  ["content", "Writing"],
  ["publishing", "Writing"],
  ["research", "Research"],
  ["engineering", "Tools"],
  ["household", "Life admin"],
  ["finance", "Life admin"],
  ["marketing", "From the Office"],
  ["sales", "From the Office"],
  ["support", "From the Office"],
  ["product", "From the Office"],
  ["design", "From the Office"],
  ["analytics", "From the Office"],
  ["legal", "From the Office"],
  ["hr", "From the Office"],
];

const LAB_ORDER: DepartmentOrder = [
  ["leadership", "Leadership"],
  ["research", "Research"],
  ["personal", "Writing & notes"],
  ["content", "Writing & notes"],
  ["publishing", "Writing & notes"],
  ["engineering", "Tools"],
  ["household", "Other"],
  ["finance", "Other"],
  ["marketing", "From the Office"],
  ["sales", "From the Office"],
  ["support", "From the Office"],
  ["product", "From the Office"],
  ["design", "From the Office"],
  ["analytics", "From the Office"],
  ["legal", "From the Office"],
  ["hr", "From the Office"],
];

const FAMILY_ROOM_ORDER: DepartmentOrder = [
  ["leadership", "Leadership"],
  ["household", "Household"],
  ["personal", "Admin"],
  ["finance", "Money"],
  ["engineering", "Tools"],
  ["research", "Other"],
  ["content", "Other"],
  ["publishing", "Other"],
  ["marketing", "From the Office"],
  ["sales", "From the Office"],
  ["support", "From the Office"],
  ["product", "From the Office"],
  ["design", "From the Office"],
  ["analytics", "From the Office"],
  ["legal", "From the Office"],
  ["hr", "From the Office"],
];

// Blank room has no opinion — just show everything in one flat list, leadership first.
const BLANK_ORDER: DepartmentOrder = [
  ["leadership", "Leadership"],
  ["marketing", "Marketing"],
  ["content", "Content"],
  ["publishing", "Content"],
  ["engineering", "Engineering"],
  ["product", "Product"],
  ["design", "Design"],
  ["sales", "Sales"],
  ["support", "Support"],
  ["analytics", "Analytics"],
  ["research", "Research"],
  ["finance", "Finance"],
  ["legal", "Legal"],
  ["hr", "People"],
  ["personal", "Personal"],
  ["household", "Household"],
];

const DEPARTMENT_ORDERS: Record<RoomType, DepartmentOrder> = {
  office: OFFICE_ORDER,
  study: STUDY_ORDER,
  lab: LAB_ORDER,
  "family-room": FAMILY_ROOM_ORDER,
  blank: BLANK_ORDER,
};

function getDepartmentLabel(dept: string, roomType: RoomType): string {
  const order = DEPARTMENT_ORDERS[roomType];
  const entry = order.find(([key]) => key === dept);
  return entry ? entry[1] : "Other";
}

function computeChecked(answers: OnboardingAnswers): Set<string> {
  const roomConfig = ROOMS[answers.roomType];
  const checked = new Set<string>(roomConfig.mandatoryAgents);
  // Pre-check the room's default suggestions.
  for (const s of roomConfig.suggestedAgents) checked.add(s);
  const desc = (answers.description + " " + answers.role + " " + answers.priority).toLowerCase();

  for (const [pattern, slugs] of roomConfig.keywordMap) {
    if (pattern.test(desc)) {
      for (const s of slugs) checked.add(s);
    }
  }

  return checked;
}

interface LibraryTemplate {
  slug: string;
  name: string;
  emoji: string;
  role: string;
  department: string;
  type: string;
}

function groupByDepartment(
  agents: SuggestedAgent[],
  templates: LibraryTemplate[],
  roomType: RoomType
): [string, SuggestedAgent[]][] {
  const deptMap = new Map<string, string>();
  for (const t of templates) deptMap.set(t.slug, t.department);

  const groups = new Map<string, SuggestedAgent[]>();
  for (const agent of agents) {
    const label = getDepartmentLabel(deptMap.get(agent.slug) || "general", roomType);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(agent);
  }

  // Sort groups by the predefined order. Some rooms already map departments
  // to "Other" (e.g. LAB maps household+finance → "Other"), so we must dedup
  // the final list before returning to avoid duplicate React keys.
  const order = DEPARTMENT_ORDERS[roomType];
  const seen = new Set<string>();
  const labelOrder: string[] = [];
  for (const [, label] of order) {
    if (!seen.has(label)) {
      seen.add(label);
      labelOrder.push(label);
    }
  }
  if (!seen.has("Other")) labelOrder.push("Other");

  return labelOrder
    .filter((label) => groups.has(label))
    .map((label) => [label, groups.get(label)!]);
}

/* ─── Agent Chat Preview (launch step) ─── */

function AgentChatPreview({
  agents,
  workspaceName,
  homeName,
  roomType,
}: {
  agents: SuggestedAgent[];
  workspaceName: string;
  homeName: string;
  roomType: RoomType;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build conversation script from the selected agents. The lead (first agent
  // in ROOMS[roomType].mandatoryAgents) speaks first with a room-specific
  // greeting; followups come from the specialists.
  const messages = useMemo(() => {
    const config = ROOMS[roomType];
    const leadSlug = config.mandatoryAgents[0];
    const lead = agents.find((a) => a.slug === leadSlug) || agents[0];
    const others = agents.filter((a) => a.slug !== lead?.slug);
    if (!lead) return [];

    const script: { agent: SuggestedAgent; text: string }[] = [
      { agent: lead, text: config.greetingTemplate(homeName, workspaceName) },
    ];

    const roomReplies: Record<RoomType, string[]> = {
      office: [
        "On it. I'll have a landscape overview ready by end of day.",
        "Already drafting a plan. I'll share it in #content shortly.",
        "Setting up the foundational workflows now. Looking good so far.",
      ],
      study: [
        "I'll triage the inbox and surface what needs you.",
        "Calendar looks clear until 3pm — good window for writing.",
        "I've linked three new notes to the 'Daily' index already.",
      ],
      lab: [
        "Pulling the latest paper on this now — draft summary in an hour.",
        "I'll sync the bibliography after this and flag duplicates.",
        "Lecture outline for Thursday is almost ready for review.",
      ],
      "family-room": [
        "Schedule looks clear after 4. Flagging overlapping drop-offs.",
        "Menu drafted for the week — grocery list is ready to review.",
        "Kids' activities synced. DnD night is still on for Friday.",
      ],
      blank: [
        "Got it. Ready whenever you are.",
        "Standing by.",
        "I'll wait for direction.",
      ],
    };

    const replies = roomReplies[roomType];

    const topics: Record<RoomType, string[]> = {
      office: ["competitor research", "the content calendar", "the launch plan"],
      study: ["today's inbox triage", "this week's writing", "my reading list"],
      lab: ["the lit review", "Thursday's lecture prep", "the references list"],
      "family-room": ["today's schedule", "the meal plan", "the kids' activities"],
      blank: ["the first thing", "whatever's next", "the open question"],
    };
    const topicList = topics[roomType];

    others.slice(0, 3).forEach((other, idx) => {
      const topic = topicList[idx] || "what's next";
      script.push({ agent: lead, text: `${other.name}, can you take on ${topic}?` });
      if (replies[idx]) {
        script.push({ agent: other, text: replies[idx] });
      }
    });

    const closing: Record<RoomType, string> = {
      office: "Great energy everyone. Let's make this a strong first week.",
      study: "Good. Ping me when anything needs me — otherwise I'll stay out of your way.",
      lab: "Keep me posted. I'll review whatever you push by end of day.",
      "family-room": "Thanks all. Ping me if anything shifts during the day.",
      blank: "Whenever you're ready, tell us what to do.",
    };
    script.push({ agent: lead, text: closing[roomType] });

    return script;
  }, [agents, workspaceName, homeName, roomType]);

  useEffect(() => {
    if (visibleCount >= messages.length) return;
    const timer = setTimeout(() => {
      setVisibleCount((c) => c + 1);
    }, visibleCount === 0 ? 600 : 1200 + Math.random() * 800);
    return () => clearTimeout(timer);
  }, [visibleCount, messages.length]);

  useEffect(() => {
    const el = scrollRef.current?.parentElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [visibleCount]);

  return (
    <div ref={scrollRef} className="space-y-0.5">
      {messages.slice(0, visibleCount).map((msg, i) => {
        const prevAgent = i > 0 ? messages[i - 1].agent.slug : null;
        const isConsecutive = prevAgent === msg.agent.slug;
        return (
          <div
            key={i}
            className="onboarding-chat-msg flex gap-2.5 px-1"
            style={{
              paddingTop: isConsecutive ? 1 : 8,
              animationDelay: "0s",
            }}
          >
            {/* Avatar column */}
            <div className="w-5 shrink-0 flex justify-center">
              {!isConsecutive && <span className="text-sm leading-none mt-0.5">{msg.agent.emoji}</span>}
            </div>
            {/* Message */}
            <div className="flex-1 min-w-0">
              {!isConsecutive && (
                <span
                  className="text-[11px] font-semibold block mb-0.5"
                  style={{ color: WEB.accent }}
                >
                  {msg.agent.name}
                </span>
              )}
              <p className="text-[11px] leading-relaxed" style={{ color: WEB.text }}>
                {msg.text}
              </p>
            </div>
          </div>
        );
      })}
      {/* Typing indicator */}
      {visibleCount < messages.length && visibleCount > 0 && (
        <div className="flex gap-2.5 px-1 pt-2">
          <div className="w-5 shrink-0 flex justify-center">
            <span className="text-sm leading-none mt-0.5">{messages[visibleCount]?.agent.emoji}</span>
          </div>
          <div className="flex items-center gap-1 py-1">
            <span className="onboarding-typing-dot size-1.5 rounded-full" style={{ background: WEB.textTertiary, animationDelay: "0s" }} />
            <span className="onboarding-typing-dot size-1.5 rounded-full" style={{ background: WEB.textTertiary, animationDelay: "0.15s" }} />
            <span className="onboarding-typing-dot size-1.5 rounded-full" style={{ background: WEB.textTertiary, animationDelay: "0.3s" }} />
          </div>
        </div>
      )}
      <style>{`
        @keyframes onboarding-chat-appear {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes onboarding-typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
        .onboarding-chat-msg {
          animation: onboarding-chat-appear 0.3s ease-out both;
        }
        .onboarding-typing-dot {
          animation: onboarding-typing-bounce 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

/* ─── Optale Observatory dot-grid background ─── */
const dotGridStyle: React.CSSProperties = {
  backgroundImage: `radial-gradient(circle, ${WEB.borderDark} 0.5px, transparent 0.5px)`,
  backgroundSize: "32px 32px",
};

const STEP_NAMES: Record<number, string> = {
  0: "intro",
  [STEP_WELCOME_HOME]: "welcome-home",
  [STEP_ROOM_SETUP]: "room-setup",
  [STEP_TEAM]: "team",
  [STEP_PROVIDER]: "provider",
  [STEP_LAUNCH]: "launch",
};

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const stepName = STEP_NAMES[step] ?? `step-${step}`;
    sendTelemetry("onboarding.step", { step: stepName });
  }, [step]);

  const [answers, setAnswers] = useState<OnboardingAnswers>({
    name: "",
    role: "",
    homeName: "",
    roomType: "study",
    workspaceName: "",
    description: "",
    teamSize: "",
    priority: "",
  });
  const mandatoryAgents = useMemo(
    () => new Set<string>(ROOMS[answers.roomType].mandatoryAgents),
    [answers.roomType]
  );
  const activeRoom = ROOMS[answers.roomType];
  const descriptionInputRef = useRef<HTMLInputElement>(null);

  // Welcome-home typewriter. Starts after the blueprint-draw delay so the
  // cursor begins typing inside the freshly-appeared popup.
  const [welcomeTyped, setWelcomeTyped] = useState(0);
  useEffect(() => {
    if (step !== STEP_WELCOME_HOME) {
      setWelcomeTyped(0);
      return;
    }
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = window.setTimeout(() => {
      interval = setInterval(() => {
        setWelcomeTyped((c) => {
          if (c >= WELCOME_PARAGRAPH.length) {
            if (interval) clearInterval(interval);
            return c;
          }
          return c + 1;
        });
      }, WELCOME_TYPE_CHAR_MS);
    }, WELCOME_TYPE_START_MS);
    return () => {
      window.clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [step]);
  const [suggestedAgents, setSuggestedAgents] = useState<SuggestedAgent[]>([]);
  const [libraryTemplates, setLibraryTemplates] = useState<LibraryTemplate[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [onboardingVerifyState, setOnboardingVerifyState] = useState<
    Record<string, OnboardingVerifyState>
  >({});
  const runOnboardingVerify = useCallback(async (providerId: string) => {
    setOnboardingVerifyState((prev) => ({
      ...prev,
      [providerId]: { phase: "running" },
    }));
    try {
      const res = await fetch(`/api/agents/providers/${providerId}/verify`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setOnboardingVerifyState((prev) => ({
          ...prev,
          [providerId]: {
            phase: "error",
            message: body.error || `HTTP ${res.status}`,
          },
        }));
        return;
      }
      const data = (await res.json()) as OnboardingVerifyResult;
      setOnboardingVerifyState((prev) => ({
        ...prev,
        [providerId]: { phase: "done", result: data },
      }));
    } catch (err) {
      setOnboardingVerifyState((prev) => ({
        ...prev,
        [providerId]: {
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  }, []);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedEffort, setSelectedEffort] = useState<string | null>(null);
  const [cabinetManifest, setCabinetManifest] = useState<{ name?: string; description?: string } | null>(null);
  const [isExistingCabinet, setIsExistingCabinet] = useState(false);
  const readyProviders = providers.filter((p) => p.available && p.authenticated);
  const anyProviderReady = readyProviders.length > 0;
  const sortedProviders = useMemo(() => {
    const rank = (p: ProviderInfo) =>
      p.available && p.authenticated ? 0 : p.available ? 1 : 2;
    return [...providers].sort((a, b) => rank(a) - rank(b));
  }, [providers]);
  const expandedProviderInfo = useMemo(
    () => (expandedProvider ? providers.find((p) => p.id === expandedProvider) || null : null),
    [expandedProvider, providers]
  );

  useEffect(() => {
    fetch("/api/system/cabinet-manifest")
      .then((r) => r.json())
      .then((data) => {
        if (data.exists && data.manifest) {
          setIsExistingCabinet(true);
          setCabinetManifest(data.manifest);
          if (data.manifest.name) {
            setAnswers((prev) => ({
              ...prev,
              workspaceName: prev.workspaceName || data.manifest.name,
            }));
          }
        }
      })
      .catch(() => {});
  }, []);

  const checkProvider = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const res = await fetch("/api/agents/providers");
      if (!res.ok) throw new Error("Failed to check providers");
      const data = await res.json();
      const cliProviders: ProviderInfo[] = (data.providers ?? []).filter(
        isAgentProviderSelectable
      );
      setProviders(cliProviders);
      // Auto-select first ready provider if none selected — functional setState
      // keeps this independent of `selectedProvider` so user clicks don't refire
      // the fetch via useEffect.
      const ready = cliProviders.filter((p) => p.available && p.authenticated);
      if (ready.length > 0) {
        setSelectedProvider((current) => {
          if (current) return current;
          const first = ready[0];
          const firstModelId = first.models?.[0]?.id ?? null;
          setSelectedModel(firstModelId);
          setSelectedEffort(
            getSuggestedProviderEffort(first, firstModelId || undefined)?.id || null
          );
          return first.id;
        });
      }
    } catch {
      setProviders([]);
    } finally {
      setProvidersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === STEP_PROVIDER) {
      void checkProvider();
    }
  }, [step, checkProvider]);

  const goToTeamSuggestion = async () => {
    setStep(STEP_TEAM);
    setAgentsLoading(true);
    try {
      const res = await fetch("/api/agents/library");
      const data = await res.json();
      const templates: LibraryTemplate[] = data.templates ?? [];
      setLibraryTemplates(templates);
      const checked = computeChecked(answers);
      setSuggestedAgents(
        templates.map((t) => ({
          slug: t.slug,
          name: t.name,
          emoji: t.emoji,
          role: t.role,
          checked: checked.has(t.slug),
        }))
      );
    } catch {
      // Fallback: at least offer the room's mandatory pair
      const [leadSlug, editorSlug] = ROOMS[answers.roomType].mandatoryAgents;
      setSuggestedAgents([
        { slug: leadSlug, name: leadSlug, emoji: "\u{1F916}", role: "Lead", checked: true },
        { slug: editorSlug, name: editorSlug, emoji: "\u{1F4DD}", role: "Support", checked: true },
      ]);
    } finally {
      setAgentsLoading(false);
    }
  };

  const MAX_AGENTS = 5;

  const toggleAgent = (slug: string) => {
    // The room's mandatory agents cannot be unchecked.
    if (mandatoryAgents.has(slug)) return;

    setSuggestedAgents((prev) => {
      const target = prev.find((a) => a.slug === slug);
      if (!target) return prev;

      // If trying to check and already at limit, block it
      if (!target.checked && prev.filter((a) => a.checked).length >= MAX_AGENTS) {
        return prev;
      }

      return prev.map((a) =>
        a.slug === slug ? { ...a, checked: !a.checked } : a
      );
    });
  };

  const launch = useCallback(async () => {
    setLaunching(true);
    try {
      const selected = suggestedAgents.filter((a) => a.checked).map((a) => a.slug);

      // Save provider + model preference
      if (selectedProvider) {
        await fetch("/api/agents/providers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            defaultProvider: selectedProvider,
            defaultModel: selectedModel || undefined,
            defaultEffort: selectedEffort || undefined,
          }),
        });
      }

      await fetch("/api/onboarding/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeName: answers.homeName || (answers.name ? `${answers.name}'s Home` : "Home"),
          roomType: answers.roomType,
          answers: {
            name: answers.name,
            workspaceName: answers.workspaceName,
            description: answers.description,
            teamSize: answers.teamSize,
            priority: answers.priority,
          },
          selectedAgents: selected,
        }),
      });

      sendTelemetry("onboarding.completed", {
        roomType: answers.roomType ?? null,
        provider: selectedProvider ?? null,
      });

      // Persist the disclaimer acknowledgment so the standalone
      // BreakingChangesWarning modal short-circuits on the next mount and
      // the tour can flow seamlessly after the wizard.
      acknowledgeDisclaimer();

      onComplete();
    } catch (e) {
      console.error("Setup failed:", e);
      setLaunching(false);
    }
  }, [answers, suggestedAgents, selectedProvider, selectedModel, selectedEffort, onComplete]);

  const selectedAgentCount = suggestedAgents.filter(
    (agent) => agent.checked
  ).length;
  const launchDisabled = launching || selectedAgentCount === 0;
  const finalLaunchDisabled = launchDisabled || !disclaimerAccepted;

  /* ─── Shared inline styles (website tokens) ─── */
  const inputStyle: React.CSSProperties = {
    background: WEB.bgCard,
    border: `1px solid ${WEB.border}`,
    color: WEB.text,
    borderRadius: 12,
    height: 44,
    fontSize: 15,
    padding: "0 14px",
    outline: "none",
    width: "100%",
    fontFamily: "inherit",
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: WEB.bg, color: WEB.text }}
    >
      {step === STEP_WELCOME_HOME && (
        <div className="pointer-events-none absolute inset-0">
          <HomeBlueprintBackground
            accent={WEB.accent}
            accentSoft={WEB.accentBg}
            paper={WEB.bgWarm}
          />
        </div>
      )}
      <div
        className={`relative mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center ${
          step === STEP_WELCOME_HOME ? "px-4 py-4" : "px-6 py-10"
        }`}
        style={step === STEP_WELCOME_HOME ? undefined : dotGridStyle}
      >
        <div className="w-full">
          {/* Progress indicator — hidden on Welcome home so the popup truly
              centers over the blueprint's patio. */}
          {step !== STEP_WELCOME_HOME && (
            <div className="mb-10 flex items-center justify-center gap-2">
              {Array.from({ length: STEP_COUNT }, (_, i) => i).map((i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    height: 8,
                    width: i <= step ? 40 : 24,
                    background: i <= step ? WEB.accent : WEB.borderLight,
                  }}
                />
              ))}
            </div>
          )}

          {/* Step 0: Welcome — Dictionary card */}
          {step === 0 && (
            <IntroStep onNext={() => setStep(1)} />
          )}

          {/* Step 1: Welcome home — appears after the blueprint finishes drawing */}
          {step === STEP_WELCOME_HOME && (
            <div className="relative">
              <style>{`
                @keyframes wh-popup-in {
                  from { opacity: 0; transform: translateY(14px) scale(0.96); }
                  to   { opacity: 1; transform: translateY(0)   scale(1); }
                }
                @keyframes wh-item-in {
                  from { opacity: 0; transform: translateY(6px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes wh-caret-blink {
                  0%, 100% { opacity: 1; }
                  50%      { opacity: 0; }
                }
                .wh-popup {
                  opacity: 0;
                  animation: wh-popup-in 0.75s cubic-bezier(0.2, 0.9, 0.2, 1) var(--wh-d, 4.3s) forwards;
                }
                .wh-item {
                  opacity: 0;
                  animation: wh-item-in 0.55s ease-out var(--wh-d, 4.5s) forwards;
                }
                .wh-caret {
                  display: inline-block;
                  margin-left: 1px;
                  font-weight: 400;
                  animation: wh-caret-blink 0.9s steps(2) infinite;
                }
                @media (prefers-reduced-motion: reduce) {
                  .wh-popup, .wh-item, .wh-caret { opacity: 1; transform: none; animation: none; }
                }
              `}</style>
              <div
                className="wh-popup relative z-10 mx-auto flex w-full max-w-xl flex-col gap-5 rounded-2xl px-7 py-7"
                style={{
                  background: "rgba(253, 250, 244, 0.88)",
                  backdropFilter: "blur(10px) saturate(1.2)",
                  WebkitBackdropFilter: "blur(10px) saturate(1.2)",
                  border: `1px solid ${WEB.accent}33`,
                  boxShadow:
                    "0 20px 60px -20px rgba(139, 94, 60, 0.28), 0 0 0 1px rgba(255,255,255,0.6) inset",
                  ["--wh-d" as string]: "4.3s",
                } as React.CSSProperties}
              >
                <div className="text-center space-y-2.5">
                  <h1
                    className="wh-item font-sans font-semibold text-2xl tracking-normal"
                    style={{ ["--wh-d" as string]: "4.6s" } as React.CSSProperties}
                  >
                    Welcome <span style={{ color: WEB.accent }}>home</span>
                  </h1>
                  {/* Typewriter paragraph — reserves its full final height via a
                      transparent clone of the remaining text so the layout
                      doesn't jump while characters are being revealed. */}
                  <p
                    className="text-sm leading-relaxed text-center"
                    style={{ color: WEB.textSecondary, minHeight: "5.5em" }}
                  >
                    <span>{WELCOME_PARAGRAPH.slice(0, welcomeTyped)}</span>
                    {welcomeTyped < WELCOME_PARAGRAPH.length && (
                      <span
                        className="wh-caret"
                        aria-hidden="true"
                        style={{ color: WEB.accent }}
                      >
                        |
                      </span>
                    )}
                    <span aria-hidden="true" style={{ color: "transparent" }}>
                      {WELCOME_PARAGRAPH.slice(welcomeTyped)}
                    </span>
                  </p>
                </div>

                <div
                  className="wh-item space-y-2"
                  style={{ ["--wh-d" as string]: "5.0s" } as React.CSSProperties}
                >
                  <label className="text-sm font-medium" style={{ color: WEB.text }}>
                    What&apos;s your name?
                  </label>
                  <input
                    value={answers.name}
                    onChange={(e) => setAnswers({ ...answers, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && answers.name.trim()) {
                        e.preventDefault();
                        setStep(STEP_ROOM_SETUP);
                      }
                    }}
                    placeholder="Jane"
                    style={inputStyle}
                    autoFocus
                  />
                </div>

                <div
                  className="wh-item flex items-center justify-between pt-1"
                  style={{ ["--wh-d" as string]: "5.15s" } as React.CSSProperties}
                >
                  <button
                    onClick={() => setStep(0)}
                    className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors"
                    style={{ color: WEB.textSecondary }}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <button
                    onClick={() => setStep(STEP_ROOM_SETUP)}
                    disabled={!answers.name.trim()}
                    className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                    style={{ background: WEB.accent }}
                  >
                    Next
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Pick a room + name + describe the space (merged) */}
          {step === STEP_ROOM_SETUP && (
            <div className="mx-auto flex max-w-4xl flex-col gap-7 animate-in fade-in duration-300">
              <div className="text-center space-y-2">
                <h1 className="font-sans font-semibold text-2xl tracking-normal">
                  Pick a <span style={{ color: WEB.accent }}>room</span>
                </h1>
                <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
                  What&apos;s this space for? Each room comes with its own AI team.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {ROOM_TYPES.map((id) => {
                  const room = ROOMS[id];
                  const Icon = room.icon;
                  const isSelected = answers.roomType === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setAnswers({ ...answers, roomType: id })}
                      className="group relative flex flex-col gap-2.5 rounded-xl p-4 text-left transition-all hover:-translate-y-0.5 overflow-hidden"
                      style={{
                        background: isSelected ? WEB.accentBg : WEB.bgCard,
                        border: `1px solid ${isSelected ? WEB.accent : WEB.border}`,
                        boxShadow: isSelected
                          ? "0 4px 14px rgba(139, 94, 60, 0.15)"
                          : "0 1px 2px rgba(59, 47, 47, 0.03)",
                        minHeight: 170,
                      }}
                    >
                      {/* Vague background glyph — blurred, tiny-opacity, bleeds off the card */}
                      <Icon
                        aria-hidden="true"
                        className="pointer-events-none absolute transition-opacity duration-300"
                        style={{
                          right: -40,
                          bottom: -40,
                          width: 190,
                          height: 190,
                          color: WEB.accent,
                          opacity: isSelected ? 0.09 : 0.045,
                          strokeWidth: 1,
                          filter: "blur(1.5px)",
                        }}
                      />
                      <div className="relative space-y-1">
                        <p className="text-sm font-semibold" style={{ color: WEB.text }}>
                          {room.label}
                        </p>
                        <p className="text-[11px] leading-relaxed" style={{ color: WEB.textSecondary }}>
                          {room.tagline}
                        </p>
                      </div>
                      <div
                        className="relative mt-auto flex flex-wrap items-center gap-1 pt-2"
                        style={{ borderTop: `1px solid ${WEB.borderLight}` }}
                      >
                        {room.exampleAgents.slice(0, 2).map((ex) => (
                          <span
                            key={ex}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{
                              background: isSelected ? WEB.bgCard : WEB.bgWarm,
                              color: WEB.textSecondary,
                            }}
                          >
                            {ex}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Space name + description inputs, adaptive to the active room */}
              <div
                className="space-y-5 rounded-2xl p-5"
                style={{ background: WEB.bgCard, border: `1px solid ${WEB.border}` }}
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: WEB.text }}>
                    {activeRoom.workspaceLabel}
                  </label>
                  <input
                    value={answers.workspaceName}
                    onChange={(e) =>
                      setAnswers({ ...answers, workspaceName: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        descriptionInputRef.current?.focus();
                      }
                    }}
                    placeholder={activeRoom.workspacePlaceholder}
                    style={inputStyle}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: WEB.text }}>
                    {activeRoom.descriptionLabel}
                  </label>
                  <input
                    ref={descriptionInputRef}
                    value={answers.description}
                    onChange={(e) =>
                      setAnswers({ ...answers, description: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && answers.workspaceName.trim()) {
                        e.preventDefault();
                        void goToTeamSuggestion();
                      }
                    }}
                    placeholder={activeRoom.descriptionPlaceholder}
                    style={inputStyle}
                  />
                </div>

              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setStep(STEP_WELCOME_HOME)}
                  className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: WEB.textSecondary }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                <button
                  onClick={goToTeamSuggestion}
                  disabled={!answers.workspaceName.trim()}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                  style={{ background: WEB.accent }}
                >
                  Next
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Team Suggestion — carousel + agent picker */}
          {step === STEP_TEAM && (
            <TeamBuildStep
              agentsLoading={agentsLoading}
              suggestedAgents={suggestedAgents}
              libraryTemplates={libraryTemplates}
              launchDisabled={launchDisabled}
              selectedCount={selectedAgentCount}
              maxAgents={MAX_AGENTS}
              toggleAgent={toggleAgent}
              roomType={answers.roomType}
              mandatoryAgents={mandatoryAgents}
              onBack={() => setStep(STEP_ROOM_SETUP)}
              onNext={() => setStep(STEP_PROVIDER)}
            />
          )}

          {/* Step 5: AI Provider Check */}
          {step === STEP_PROVIDER && (
            <div className="mx-auto flex max-w-xl flex-col gap-6 animate-in fade-in duration-300">
              <div className="text-center space-y-2">
                <h1 className="font-sans font-semibold text-2xl tracking-normal">
                  Agent Provider
                </h1>
                <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
                  Optale Observatory needs an AI CLI to power your agents.
                </p>
              </div>

              {/* Registered CLI providers */}
              {providersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-6 animate-spin" style={{ color: WEB.textTertiary }} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                    {sortedProviders.map((p) => {
                      const isReady = !!(p.available && p.authenticated);
                      const isInstalled = !!p.available;
                      const isSelected = selectedProvider === p.id;
                      const isExpanded = expandedProvider === p.id;
                      const verifyState =
                        onboardingVerifyState[p.id] ?? { phase: "idle" as const };
                      const verifyMeta =
                        verifyState.phase === "done"
                          ? ONBOARDING_VERIFY_META[verifyState.result.status]
                          : null;
                      const statusLabel = isReady
                        ? "Ready"
                        : isInstalled
                          ? "Log in required"
                          : "Not installed";
                      const statusColor = isReady
                        ? "#16a34a"
                        : isInstalled
                          ? "#d97706"
                          : WEB.textTertiary;
                      const statusBg = isReady
                        ? "rgba(22,163,74,0.12)"
                        : isInstalled
                          ? "rgba(217,119,6,0.12)"
                          : "rgba(100,116,139,0.12)";
                      const cardBorder = isReady
                        ? isSelected
                          ? WEB.accent
                          : WEB.borderLight
                        : isInstalled
                          ? "rgba(217,119,6,0.45)"
                          : WEB.borderLight;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            if (isReady) {
                              const nextModelId = p.models?.[0]?.id ?? null;
                              setSelectedProvider(p.id);
                              setSelectedModel(nextModelId);
                              setSelectedEffort(
                                getSuggestedProviderEffort(
                                  p,
                                  nextModelId || undefined
                                )?.id || null
                              );
                            } else {
                              setExpandedProvider(isExpanded ? null : p.id);
                            }
                          }}
                          className="group relative flex flex-col items-start gap-2 rounded-xl p-3 text-left transition-all hover:-translate-y-0.5"
                          style={{
                            background:
                              isSelected && isReady ? WEB.accentBg : WEB.bgCard,
                            border: `1px solid ${cardBorder}`,
                            boxShadow:
                              isSelected && isReady
                                ? `0 0 0 2px ${WEB.accent}22`
                                : undefined,
                            opacity: isReady ? 1 : isInstalled ? 0.95 : 0.7,
                          }}
                        >
                          {isSelected && isReady && (
                            <span
                              className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full"
                              style={{ background: WEB.accent }}
                            >
                              <Check className="size-2.5 text-white" />
                            </span>
                          )}
                          <div className="flex w-full items-center gap-2">
                            <div
                              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                              style={{
                                background: WEB.bgWarm,
                                color: WEB.accent,
                              }}
                            >
                              <ProviderGlyph icon={p.icon} className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className="truncate text-[13px] font-medium"
                                style={{ color: WEB.text }}
                              >
                                {p.name}
                              </p>
                              {isReady && p.version && (
                                <p
                                  className="truncate text-[10px]"
                                  style={{ color: WEB.textTertiary }}
                                >
                                  {p.version}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex w-full items-center justify-between gap-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ background: statusBg, color: statusColor }}
                            >
                              {verifyMeta ? verifyMeta.label : statusLabel}
                            </span>
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-medium"
                              style={{ color: WEB.textTertiary }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedProvider(isExpanded ? null : p.id);
                              }}
                              role="button"
                            >
                              {isReady
                                ? "Guide"
                                : isInstalled
                                  ? "Log in"
                                  : "Install"}
                              <ChevronDown
                                className="size-3 transition-transform"
                                style={{
                                  transform: isExpanded
                                    ? "rotate(180deg)"
                                    : "rotate(0deg)",
                                }}
                              />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={checkProvider}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all hover:-translate-y-0.5"
                    style={{ background: WEB.bgWarm, border: `1px solid ${WEB.borderLight}`, color: WEB.accent }}
                  >
                    <RefreshCw className="size-3" />
                    Re-check providers
                  </button>

                  {/* Install / verify guide drawer */}
                  {expandedProviderInfo && (() => {
                    const p = expandedProviderInfo;
                    const setupSteps: { title: string; detail: string; cmd?: string; openTerminal?: boolean; link?: { label: string; url: string } }[] = [
                      { title: "Open a terminal", detail: "You'll need a terminal to run the next steps.", openTerminal: true },
                      ...((p.installSteps || []).map((step) => ({
                        title: step.title,
                        detail: step.detail,
                        cmd: step.command,
                        link: step.link,
                      }))),
                    ];
                    const verifyState =
                      onboardingVerifyState[p.id] ?? { phase: "idle" as const };
                    const verifyResult =
                      verifyState.phase === "done" ? verifyState.result : null;
                    const verifyMeta = verifyResult
                      ? ONBOARDING_VERIFY_META[verifyResult.status]
                      : null;
                    return (
                      <div
                        className="rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200"
                        style={{
                          background: WEB.bgWarm,
                          border: `1px solid ${WEB.borderLight}`,
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="flex size-7 items-center justify-center rounded-lg"
                              style={{ background: WEB.bgCard, color: WEB.accent }}
                            >
                              <ProviderGlyph icon={p.icon} className="size-3.5" />
                            </div>
                            <p className="text-[13px] font-semibold" style={{ color: WEB.text }}>
                              {p.name} setup
                            </p>
                          </div>
                          <button
                            onClick={() => setExpandedProvider(null)}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
                            style={{ color: WEB.textTertiary }}
                          >
                            Close
                          </button>
                        </div>

                        {setupSteps.map((setupStep, i) => {
                          const isFailedStep =
                            verifyResult?.status !== undefined &&
                            verifyResult.status !== "pass" &&
                            setupStep.title.trim().toLowerCase() ===
                              verifyResult.failedStepTitle.trim().toLowerCase();
                          const isPassStep =
                            verifyResult?.status === "pass" &&
                            /verify\s+setup/i.test(setupStep.title);
                          return (
                            <div
                              key={i}
                              className="flex items-start gap-2.5 rounded-md p-1.5"
                              style={{
                                background: isFailedStep
                                  ? "rgba(225,29,72,0.08)"
                                  : isPassStep
                                    ? "rgba(22,163,74,0.08)"
                                    : "transparent",
                                boxShadow: isFailedStep
                                  ? "0 0 0 1px rgba(225,29,72,0.3) inset"
                                  : isPassStep
                                    ? "0 0 0 1px rgba(22,163,74,0.3) inset"
                                    : undefined,
                              }}
                            >
                              <span
                                className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5"
                                style={{
                                  background: isFailedStep
                                    ? "#e11d48"
                                    : isPassStep
                                      ? "#16a34a"
                                      : WEB.accent,
                                  color: "white",
                                }}
                              >
                                {isFailedStep ? "!" : isPassStep ? "✓" : i + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium" style={{ color: WEB.text }}>
                                  {setupStep.title}
                                </p>
                                <p className="text-[11px] mt-0.5" style={{ color: WEB.textSecondary }}>
                                  {setupStep.detail}
                                </p>
                                {setupStep.cmd && (
                                  <TerminalCommand command={setupStep.cmd} />
                                )}
                                {setupStep.openTerminal && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      fetch("/api/terminal/open", { method: "POST" }).catch(() => {
                                        showError("Could not open terminal automatically. Open your system terminal manually.");
                                      });
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 mt-1.5 text-[11px] font-medium transition-all hover:-translate-y-0.5"
                                    style={{ background: "#1e1e1e", color: "#d4d4d4" }}
                                  >
                                    <Terminal className="size-3" />
                                    Open terminal
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        <div
                          className="flex flex-wrap items-center gap-2 pt-2 border-t"
                          style={{ borderColor: WEB.borderLight }}
                        >
                          <button
                            onClick={() => void runOnboardingVerify(p.id)}
                            disabled={verifyState.phase === "running"}
                            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all hover:-translate-y-0.5 disabled:opacity-50"
                            style={{ background: WEB.accent, color: "white" }}
                          >
                            {verifyState.phase === "running" ? (
                              <RefreshCw className="size-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-3" />
                            )}
                            {verifyState.phase === "running"
                              ? "Verifying…"
                              : verifyState.phase === "done"
                                ? "Re-run verify"
                                : "Run verify"}
                          </button>
                          {verifyMeta && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: verifyMeta.bg, color: verifyMeta.color }}
                            >
                              {verifyMeta.label}
                            </span>
                          )}
                          {verifyResult &&
                            verifyResult.status !== "pass" &&
                            verifyResult.failedStepTitle && (
                              <span className="text-[11px]" style={{ color: WEB.textSecondary }}>
                                Failed at step:{" "}
                                <strong style={{ color: WEB.text }}>
                                  {verifyResult.failedStepTitle}
                                </strong>
                              </span>
                            )}
                          {verifyState.phase === "error" && (
                            <span className="text-[11px]" style={{ color: "#e11d48" }}>
                              {verifyState.message}
                            </span>
                          )}
                        </div>
                        {verifyResult?.hint && verifyResult.status !== "pass" && (
                          <p className="text-[11px]" style={{ color: WEB.textSecondary }}>
                            {verifyResult.hint}
                          </p>
                        )}

                        <p className="text-[11px]" style={{ color: WEB.textTertiary }}>
                          Verify runs the provider&apos;s headless prompt end-to-end and classifies any failure so you know which step to revisit.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Model + effort selectors are intentionally hidden during onboarding —
                  the provider tile click seeds the first model + suggested effort,
                  and both are refinable later from Settings → Providers. */}

              {/* Coming soon providers */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: WEB.textTertiary }}>
                  Coming soon
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { name: "Anthropic API", type: "API", icon: "api" },
                    { name: "OpenAI API", type: "API", icon: "api" },
                    { name: "Google AI API", type: "API", icon: "api" },
                    { name: "Plugin SDK", type: "SDK", icon: "terminal" },
                  ].map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center gap-3 rounded-xl px-4 py-3 opacity-40"
                      style={{
                        background: WEB.bgCard,
                        border: `1px solid ${WEB.borderLight}`,
                      }}
                    >
                      <div
                        className="flex size-8 items-center justify-center rounded-lg"
                        style={{ background: WEB.bgWarm, color: WEB.textTertiary }}
                      >
                        {p.icon === "terminal" ? (
                          <Terminal className="size-4" />
                        ) : (
                          <Zap className="size-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium" style={{ color: WEB.textSecondary }}>
                          {p.name}
                        </p>
                        <p className="text-[10px]" style={{ color: WEB.textTertiary }}>
                          {p.type} agent
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep(STEP_TEAM)}
                  className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: WEB.textSecondary }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                <button
                  onClick={() => setStep(STEP_LAUNCH)}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5"
                  style={{ background: WEB.accent }}
                >
                  {anyProviderReady ? "Next" : "Skip for now"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Launch — Summary */}
          {step === STEP_LAUNCH && (
            <div className="mx-auto flex max-w-4xl flex-col gap-6 animate-in fade-in duration-300">
              <div className="text-center space-y-2">
                <h1 className="font-sans font-semibold text-2xl tracking-normal">
                  Start your <span style={{ color: WEB.accent }}>Observatory</span>
                </h1>
              </div>

              <div
                className="rounded-2xl overflow-hidden flex flex-col lg:flex-row lg:h-[280px]"
                style={{
                  background: WEB.bgCard,
                  border: `1px solid ${WEB.border}`,
                  boxShadow: "0 1px 3px rgba(59, 47, 47, 0.04), 0 8px 30px rgba(59, 47, 47, 0.04)",
                }}
              >
                {/* Left half — Company + agents */}
                <div className="p-5 space-y-4 flex-1 overflow-y-auto scrollbar-thin">
                  <div className="space-y-1">
                    <h2 className="font-sans font-semibold text-xl tracking-normal" style={{ color: WEB.text }}>
                      {answers.workspaceName || "Your Space"}
                    </h2>
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: WEB.textTertiary }}
                    >
                      {answers.description || "Knowledge base + AI team"}
                    </p>
                  </div>

                  <div
                    className="h-px w-full"
                    style={{ background: WEB.borderLight }}
                  />

                  <div className="flex flex-col gap-1">
                    {suggestedAgents.filter((a) => a.checked).map((a) => (
                      <div
                        key={a.slug}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                        style={{ background: WEB.bgWarm }}
                      >
                        <span className="text-sm">{a.emoji}</span>
                        <p className="text-[12px] font-medium flex-1" style={{ color: WEB.text }}>
                          {a.name}
                        </p>
                        <span className="relative flex size-2.5">
                          <span
                            className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
                            style={{ background: "#22c55e" }}
                          />
                          <span
                            className="relative inline-flex size-2.5 rounded-full"
                            style={{ background: "#22c55e" }}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right half — Animated agent chat preview */}
                <div
                  className="relative flex-1 flex flex-col overflow-hidden"
                  style={{ background: WEB.bgWarm, borderLeft: `1px solid ${WEB.borderLight}` }}
                >
                  {/* Channel header */}
                  <div
                    className="shrink-0 px-4 py-2 flex items-center gap-2"
                    style={{ background: WEB.bgWarm, borderBottom: `1px solid ${WEB.borderLight}` }}
                  >
                    <span className="text-[11px] font-semibold" style={{ color: WEB.textTertiary }}>#</span>
                    <span className="text-[11px] font-semibold" style={{ color: WEB.text }}>general</span>
                  </div>
                  <div className="flex-1 overflow-y-auto scrollbar-thin p-3 pb-2 space-y-0.5">
                    <AgentChatPreview
                      agents={suggestedAgents.filter((a) => a.checked)}
                      workspaceName={answers.workspaceName}
                      homeName={answers.homeName || (answers.name ? `${answers.name}'s Home` : "Home")}
                      roomType={answers.roomType}
                    />
                  </div>
                </div>
              </div>


              <div
                className="rounded-xl p-4 space-y-3 text-sm"
                style={{
                  border: `1px solid ${WEB.border}`,
                  background: WEB.bgCard,
                }}
              >
                <p className="text-[13px] font-semibold" style={{ color: WEB.text }}>
                  Before you launch
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-3">
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full"
                      style={{ background: WEB.textTertiary }}
                      aria-hidden
                    />
                    <span style={{ color: WEB.textSecondary }}>
                      <strong className="font-medium" style={{ color: WEB.text }}>
                        Agents run with full access.
                      </strong>{" "}
                      Optale Observatory uses{" "}
                      <code
                        className="rounded px-1 py-0.5 text-[11px]"
                        style={{ background: WEB.bgWarm, color: WEB.text }}
                      >
                        --dangerously-skip-permissions
                      </code>{" "}
                      (Claude Code) and equivalent flags in other providers. This is identical
                      to running these CLI tools from your own terminal. Any MCP servers or
                      tools you&apos;ve configured may be invoked automatically by agents.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full"
                      style={{ background: WEB.textTertiary }}
                      aria-hidden
                    />
                    <span style={{ color: WEB.textSecondary }}>
                      <strong className="font-medium" style={{ color: WEB.text }}>
                        Back up your data regularly.
                      </strong>{" "}
                      Agents can read, write, and delete files across your KB and linked repos.
                      Optale Observatory is not responsible for data loss. You are responsible for the AI
                      providers you choose and their terms of service.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full"
                      style={{ background: WEB.textTertiary }}
                      aria-hidden
                    />
                    <span style={{ color: WEB.textSecondary }}>
                      <strong className="font-medium" style={{ color: WEB.text }}>
                        Beta software. Things may break.
                      </strong>{" "}
                      We ship fast. Breaking changes can land without notice.
                    </span>
                  </li>
                </ul>
                <label
                  className="flex cursor-pointer items-start gap-2 pt-1"
                  style={{ color: WEB.text }}
                >
                  <input
                    type="checkbox"
                    name="disclaimer-accept"
                    aria-label="I have read and I accept"
                    checked={disclaimerAccepted}
                    onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 rounded"
                    style={{ borderColor: WEB.border, accentColor: WEB.accent }}
                  />
                  <span>I understand and want to continue.</span>
                </label>
                <p
                  className="text-[11px]"
                  style={{ color: WEB.textTertiary }}
                >
                  By continuing you agree to our{" "}
                  <a
                    href="https://optale.com/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                    style={{ color: WEB.textSecondary }}
                  >
                    Terms
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://optale.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                    style={{ color: WEB.textSecondary }}
                  >
                    Privacy
                  </a>
                  .
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep(STEP_PROVIDER)}
                  className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: WEB.textSecondary }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                <button
                  onClick={launch}
                  disabled={finalLaunchDisabled}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                  style={{ background: WEB.accent }}
                >
                  {launching ? (
                    <>
                      <Loader2 className="animate-spin w-4 h-4" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4" />
                      Launch Observatory
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

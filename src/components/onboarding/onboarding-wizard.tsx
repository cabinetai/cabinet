"use client";

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trans } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  Check,
  ClipboardCheck,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Rocket,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Asterisk,
  Star,
  Terminal,
  Zap,
  FileText,
  HeartPulse,
} from "lucide-react";
import { HomeBlueprintBackground } from "@/components/onboarding/home-blueprint-background";
import { KnowledgeGraph } from "@/components/onboarding/knowledge-graph";
import { isAgentProviderSelectable } from "@/lib/agents/provider-filters";
import { ProviderGlyph } from "@/components/agents/provider-glyph";
import type { ProviderInfo } from "@/types/agents";
import { showError } from "@/lib/ui/toast";
import { ROOMS, type RoomType } from "@/lib/onboarding/rooms";
import { slugifyPageName } from "@/lib/markdown/wiki-links";
import { MockupSidebar, type MockupTab } from "./tour/mockup-sidebar";
import { CABINET_SHOWCASES, ShowcaseWindow } from "./cabinet-showcases";
import { Switch } from "@/components/ui/switch";
import { getSuggestedProviderEffort } from "@/lib/agents/runtime-options";
import { sendTelemetry } from "@/lib/telemetry/browser";
import {
  recordWaitlistView,
  recordWaitlistStart,
  submitWaitlistEmail,
  recordOnboardingEmail,
} from "@/lib/telemetry/waitlist-client";
import { acknowledgeDisclaimer } from "@/components/layout/breaking-changes-warning";
import { useLocale } from "@/i18n/use-locale";
import i18n from "@/i18n";
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  localeToDir,
} from "@/i18n";
import {
  detectSystemLocale,
  hasExplicitLocale,
} from "@/i18n/detect-system-locale";

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

const ONBOARDING_VERIFY_META: Record<OnboardingVerifyStatus, { labelKey: string; color: string; bg: string }> = {
  pass: { labelKey: "passed", color: "#16a34a", bg: "rgba(22,163,74,0.1)" },
  not_installed: { labelKey: "notInstalled", color: "#64748b", bg: "rgba(100,116,139,0.12)" },
  auth_required: { labelKey: "authRequired", color: "#d97706", bg: "rgba(217,119,6,0.12)" },
  payment_required: { labelKey: "paymentRequired", color: "#e11d48", bg: "rgba(225,29,72,0.12)" },
  quota_exceeded: { labelKey: "quotaExceeded", color: "#ea580c", bg: "rgba(234,88,12,0.12)" },
  other_error: { labelKey: "error", color: "#e11d48", bg: "rgba(225,29,72,0.1)" },
};

interface OnboardingAnswers {
  name: string;
  email: string;
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

// The single agent the user configures from scratch in the team step. No
// pre-made room defaults; this becomes the room's first agent on launch.
interface FirstAgentDraft {
  name: string;
  role: string;
  instructions: string;
}

interface CommunityCard {
  title: string;
  description: string;
  cta: string;
  href?: string;
  icon: ReactNode;
  iconClassName: string;
}

interface CommunityStepConfig {
  eyebrow: string;
  title: string;
  description: string;
  aside?: string;
  cards: CommunityCard[];
  nextLabel?: string;
}

const DISCORD_SUPPORT_URL = "https://discord.gg/hJa5TRTbTH";
const GITHUB_REPO_URL = "https://github.com/cabinetai/cabinet";
const GITHUB_STATS_URL = "/api/github/repo";
const GITHUB_STARS_FALLBACK = 393;
const WELCOME_TYPE_START_MS = 4800; // begin typing shortly after heading fades in
const WELCOME_TYPE_CHAR_MS = 32;

// Step indices after the compress pass:
// 0 intro · 1 welcome-home · 2 what-is-cabinet · 3 knowledge (connect your bases) ·
// 4 room-setup (pick + name + describe) · 5 provider (connect AI) ·
// 6 team (configure first agent + heartbeat) · 7 first-task ·
// 8 github · 9 discord · 10 cloud · 11 launch
const COMMUNITY_START_STEP = 8;
const COMMUNITY_END_STEP = 10;
const STEP_COUNT = 12;
const STEP_WELCOME_HOME = 1;
const STEP_WHAT_IS_CABINET = 2;
const STEP_KNOWLEDGE = 3;
const STEP_ROOM_SETUP = 4;
const STEP_PROVIDER = 5;
const STEP_TEAM = 6;
const STEP_TASK = 7;

/* ─── Colors from runcabinet.com ─── */
const WEB = {
  bg: "#FAF6F1",
  bgWarm: "#F3EDE4",
  bgCard: "#FFFFFF",
  text: "#3B2F2F",
  textSecondary: "#6B5B4F",
  textTertiary: "#A89888",
  accent: "#8B5E3C",
  accentWarm: "#7A4F30",
  accentBg: "#F5E6D3",
  border: "#E8DDD0",
  borderLight: "#F0E8DD",
  borderDark: "#D4C4B0",
} as const;

function DiscordIcon({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d="M20.32 4.37a16.4 16.4 0 0 0-4.1-1.28.06.06 0 0 0-.07.03c-.18.32-.38.73-.52 1.06a15.16 15.16 0 0 0-4.56 0c-.15-.34-.35-.74-.53-1.06a.06.06 0 0 0-.07-.03c-1.43.24-2.8.68-4.1 1.28a.05.05 0 0 0-.02.02C3.77 8.17 3.12 11.87 3.44 15.53a.06.06 0 0 0 .02.04 16.52 16.52 0 0 0 5.03 2.54.06.06 0 0 0 .07-.02c.39-.54.74-1.12 1.04-1.73a.06.06 0 0 0-.03-.08 10.73 10.73 0 0 1-1.6-.77.06.06 0 0 1-.01-.1l.32-.24a.06.06 0 0 1 .06-.01c3.35 1.53 6.98 1.53 10.29 0a.06.06 0 0 1 .06 0c.1.08.21.16.32.24a.06.06 0 0 1-.01.1c-.51.3-1.05.56-1.6.77a.06.06 0 0 0-.03.08c.3.61.65 1.19 1.04 1.73a.06.06 0 0 0 .07.02 16.42 16.42 0 0 0 5.03-2.54.06.06 0 0 0 .02-.04c.38-4.23-.64-7.9-2.89-11.14a.04.04 0 0 0-.02-.02ZM9.68 13.3c-.98 0-1.78-.9-1.78-2s.79-2 1.78-2c.99 0 1.79.9 1.78 2 0 1.1-.8 2-1.78 2Zm4.64 0c-.98 0-1.78-.9-1.78-2s.79-2 1.78-2c.99 0 1.79.9 1.78 2 0 1.1-.79 2-1.78 2Z" />
    </svg>
  );
}

function formatGithubStars(stars: number) {
  if (stars >= 10_000) return `${(stars / 1000).toFixed(1)}k`;
  return new Intl.NumberFormat("en-US").format(stars);
}

function CommunityCardTile({ card }: { card: CommunityCard }) {
  const content = (
    <>
      <div
        className="flex size-10 items-center justify-center rounded-xl border"
        style={{
          borderColor: WEB.borderLight,
          background: WEB.accentBg,
          color: WEB.accent,
        }}
      >
        {card.icon}
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <p className="text-sm font-semibold" style={{ color: WEB.text }}>
          {card.title}
        </p>
        <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
          {card.description}
        </p>
      </div>
    </>
  );

  if (!card.href) {
    return (
      <div
        className="rounded-xl p-4"
        style={{
          border: `1px solid ${WEB.border}`,
          background: WEB.bgCard,
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <a
      href={card.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group rounded-xl p-4 transition-all hover:-translate-y-0.5"
      style={{
        border: `1px solid ${WEB.border}`,
        background: WEB.bgCard,
      }}
    >
      {content}
      <div
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium"
        style={{ color: WEB.accent }}
      >
        <span>{card.cta}</span>
        <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
    </a>
  );
}

// Agent pre-check + mandatory-lock logic is now room-aware — see getKeywordChecks
// and getAlwaysChecked below. The old KEYWORD_CHECKS / ALWAYS_CHECKED constants
// were per-room-type "office" defaults.

// Distinct English department labels → kebab key. The English label remains
// the internal grouping Map key in groupByDepartment(); this only maps the
// label when it's rendered as a visible section header.
const DEPARTMENT_LABEL_KEYS: Record<string, string> = {
  Leadership: "leadership",
  Marketing: "marketing",
  Content: "content",
  Engineering: "engineering",
  "Product & Design": "product-and-design",
  Business: "business",
  Research: "research",
  "Finance & Ops": "finance-and-ops",
  Personal: "personal",
  "Second brain": "second-brain",
  Writing: "writing",
  Tools: "tools",
  "Life admin": "life-admin",
  "From the Office": "from-the-office",
  "Writing & notes": "writing-and-notes",
  Other: "other",
  Household: "household",
  Admin: "admin",
  Money: "money",
  Product: "product",
  Design: "design",
  Sales: "sales",
  Support: "support",
  Analytics: "analytics",
  Finance: "finance",
  Legal: "legal",
  People: "people",
};

function departmentLabelText(label: string): string {
  const key = DEPARTMENT_LABEL_KEYS[label];
  return key ? i18n.t(`onboarding:departments.${key}`, label) : label;
}

function getKeywordChecksForRoom(roomType: RoomType): [RegExp, string[]][] {
  return ROOMS[roomType].keywordMap;
}

function getAlwaysCheckedForRoom(roomType: RoomType): Set<string> {
  return new Set(ROOMS[roomType].mandatoryAgents);
}

function TerminalCommand({ command }: { command: string }) {
  const { t } = useLocale();
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
        title={t("tinyExtras:copyToClipboard")}
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

/**
 * Compact language switcher pinned to the wizard chrome — available from
 * the very first screen so the user can override the auto-detected locale
 * immediately. Native labels (own script) + per-locale dir, like Settings.
 */
function WizardLanguagePicker() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="absolute z-50"
      style={{ top: 16, insetInlineEnd: 16 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("settings:language.title")}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
        style={{
          background: WEB.bgCard,
          borderColor: WEB.border,
          color: WEB.textSecondary,
        }}
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="max-w-[10rem] truncate">{LOCALE_LABELS[locale]}</span>
        <ChevronDown className="h-3 w-3" style={{ color: WEB.textTertiary }} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute mt-2 max-h-[60vh] w-[min(22rem,80vw)] overflow-y-auto rounded-xl border p-1.5 shadow-lg"
          style={{
            insetInlineEnd: 0,
            background: WEB.bgCard,
            borderColor: WEB.border,
          }}
        >
          <div className="grid grid-cols-2 gap-1">
            {SUPPORTED_LOCALES.map((code) => {
              const active = code === locale;
              return (
                <button
                  key={code}
                  type="button"
                  role="option"
                  aria-selected={active}
                  dir={localeToDir(code)}
                  onClick={() => {
                    setLocale(code);
                    setOpen(false);
                  }}
                  className="truncate rounded-lg px-2.5 py-1.5 text-start text-xs transition-colors"
                  style={
                    active
                      ? {
                          background: WEB.accentBg,
                          color: WEB.accent,
                          fontWeight: 600,
                        }
                      : { color: WEB.textSecondary }
                  }
                >
                  {LOCALE_LABELS[code]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function IntroStep({ onNext }: { onNext: () => void }) {
  const { t } = useLocale();
  const [phase, setPhase] = useState(0);
  // 0: nothing  1: card border + "cabinet" title  2: pronunciation + noun
  // 3: def 1  4: def 2  5: def 3  6: tagline line 1  7: tagline line 2  8: button

  useEffect(() => {
    const delays = [80, 160, 320, 480, 640, 880, 1040, 1200];
    const timers = delays.map((ms, i) =>
      setTimeout(() => setPhase(i + 1), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const fade = (p: number): CSSProperties => ({
    opacity: phase >= p ? 1 : 0,
    transform: phase >= p ? "translateY(0)" : "translateY(14px)",
    transition: "opacity 0.4s ease, transform 0.4s ease",
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:gap-10 w-full">
        {/* Dictionary Definition Card */}
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
              className="font-logo text-4xl sm:text-5xl tracking-tight italic"
              style={{ color: WEB.text }}
            >
              cabinet
            </h1>
            <span
              className="font-mono text-xs"
              style={{ ...fade(2), color: WEB.textTertiary }}
            >
              /&#x2C8;kab.&#x26A;.n&#x259;t/
            </span>
          </div>
          <p
            className="font-mono text-xs italic mb-6"
            style={{ ...fade(2), color: WEB.textTertiary }}
          >
            noun
          </p>

          <ol className="space-y-5 text-[15px] leading-relaxed font-serif">
            <li className="flex gap-3" style={fade(3)}>
              <span className="font-logo italic text-lg mt-[-2px] shrink-0" style={{ color: WEB.accent }}>1.</span>
              <div>
                <p style={{ color: WEB.textSecondary }}>
                  A cupboard with shelves for storing things.
                </p>
                <p className="font-mono text-xs italic mt-1.5" style={{ color: WEB.textTertiary }}>
                  &ldquo;a filing cabinet&rdquo;
                </p>
              </div>
            </li>
            <li className="flex gap-3" style={fade(4)}>
              <span className="font-logo italic text-lg mt-[-2px] shrink-0" style={{ color: WEB.accent }}>2.</span>
              <div>
                <p style={{ color: WEB.textSecondary }}>
                  <span
                    className="font-mono text-[11px] uppercase tracking-wider mr-1.5 px-1.5 py-0.5 rounded"
                    style={{ color: WEB.textTertiary, background: "#F5F0EB" }}
                  >
                    politics
                  </span>
                  Senior advisors consulting on government policy.
                </p>
                <p className="font-mono text-xs italic mt-1.5" style={{ color: WEB.textTertiary }}>
                  &ldquo;a cabinet meeting&rdquo;
                </p>
              </div>
            </li>
            <li className="flex gap-3" style={fade(5)}>
              <span className="font-logo italic text-lg mt-[-2px] shrink-0" style={{ color: WEB.accent }}>3.</span>
              <div>
                <p style={{ color: WEB.text }}>
                  <span
                    className="font-mono text-[11px] uppercase tracking-wider mr-1.5 px-1.5 py-0.5 rounded"
                    style={{ color: WEB.accent, background: WEB.accentBg }}
                  >
                    software
                  </span>
                  A knowledge base where AI agents work for you 24/7. No salary needed.
                </p>
                <p className="font-mono text-xs italic mt-1.5" style={{ color: WEB.textTertiary }}>
                  &ldquo;I asked my cabinet to research the market and draft the blog post&rdquo;
                </p>
              </div>
            </li>
          </ol>
        </div>

        {/* Tagline + CTA */}
        <div className="flex flex-col items-center lg:items-start gap-6 py-6 lg:py-0 lg:max-w-xs shrink-0">
          <h2 className="text-center lg:text-left text-3xl sm:text-4xl lg:text-5xl tracking-tight leading-[1.1]">
            <span className="font-logo italic" style={{ ...fade(6), color: WEB.text, display: "inline-block" }}>
              {t("onboarding:intro.tagline1")}
            </span>
            <br />
            <span
              className="font-logo italic"
              style={{
                ...fade(7),
                display: "inline-block",
                background: "linear-gradient(135deg, #3B2F2F 0%, #8B5E3C 50%, #A0714D 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {t("onboarding:intro.tagline2")}
            </span>
          </h2>

          <div style={fade(8)}>
            <button
              onClick={onNext}
              className="inline-flex items-center justify-center gap-2.5 rounded-full px-10 py-4 text-base font-medium text-white transition-all hover:-translate-y-0.5 shadow-sm w-full lg:w-auto"
              style={{ background: WEB.accent }}
            >
              {t("onboarding:intro.getStarted")}
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Welcome Back — shown when .cabinet already exists ─── */

function WelcomeBackStep({
  cabinetName,
  onNext,
}: {
  cabinetName?: string;
  onNext: () => void;
}) {
  const { t } = useLocale();
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
        <h1 className="font-logo text-2xl tracking-tight italic" style={{ color: WEB.text }}>
          {cabinetName
            ? t("onboarding:welcomeBack.headingNamed", { cabinet: cabinetName })
            : t("onboarding:welcomeBack.heading")}
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
          {t("onboarding:welcomeBack.subtitle")}
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
        {t("onboarding:welcomeBack.continue")}
        <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
      </button>
    </div>
  );
}

// Shared Back / Next footer for the wizard step components.
function StepNav({
  onBack,
  onNext,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  const { t } = useLocale();
  return (
    <div className="flex items-center justify-between pt-1">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
        style={{ color: WEB.textSecondary }}
      >
        <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
        {t("onboarding:actions.back")}
      </button>
      <button
        onClick={onNext}
        className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5"
        style={{ background: WEB.accent }}
      >
        {nextLabel || t("onboarding:actions.next")}
        <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
      </button>
    </div>
  );
}

// "Cabinet connects all your knowledge bases" — animated radial graph step.
function KnowledgeStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-8 md:flex-row md:gap-10">
        <div className="flex-1 space-y-4 text-center md:text-start">
          <h1
            className="font-logo text-3xl italic tracking-tight md:text-4xl"
            style={{ color: WEB.text }}
          >
            {t("onboarding:knowledge.heading")}
          </h1>
          <p className="text-base leading-relaxed md:text-lg" style={{ color: WEB.textSecondary }}>
            {t("onboarding:knowledge.subtitle")}
          </p>
          <p className="text-sm" style={{ color: WEB.textTertiary }}>
            {t("onboarding:knowledge.footnote")}
          </p>
        </div>
        <div className="w-full max-w-[420px] shrink-0 md:w-[420px]">
          <KnowledgeGraph />
        </div>
      </div>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

// Small auto-scrolling (marquee) row of suggestion tags. The track holds the
// list twice so the CSS marquee loops seamlessly; it pauses on hover so a tag
// can be clicked to fill the field. Kept deliberately tiny and low-contrast.
function RotatingTags({ tags, onPick }: { tags: string[]; onPick: (tag: string) => void }) {
  const [paused, setPaused] = useState(false);
  // The track holds the list twice so translating by -50% loops seamlessly.
  const loop = [...tags, ...tags];
  return (
    <div
      className="relative overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        maskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
      }}
    >
      <div
        className="flex w-max flex-nowrap gap-1.5"
        style={{
          animation: "cabinet-marquee 32s linear infinite",
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        {loop.map((tag, i) => (
          <button
            key={`${tag}-${i}`}
            type="button"
            tabIndex={-1}
            onClick={() => onPick(tag)}
            className="shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-[11px] transition-opacity hover:opacity-70"
            style={{ background: WEB.bgWarm, color: WEB.textTertiary }}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}

// Onboarding heartbeat schedule → cron expression (the persona `heartbeat`
// field is a cron string; see persona-manager.ts).
const HEARTBEAT_CRON: Record<string, string> = {
  hourly: "0 * * * *",
  daily: "0 9 * * *",
  weekly: "0 9 * * 1",
};
function scheduleToCron(schedule: string): string {
  return HEARTBEAT_CRON[schedule] ?? HEARTBEAT_CRON.daily;
}

// Step 2 — "What is a Cabinet?" concept screen. Explains the object before we
// ask the user to create one.

function WhatIsCabinetStep({
  selected,
  onSelect,
  onBack,
  onNext,
}: {
  selected: number;
  onSelect: (index: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useLocale();
  const railRef = useRef<HTMLDivElement>(null);

  // Keep the selected showcase button scrolled into view in the horizontal rail.
  useEffect(() => {
    const el = railRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected]);

  const showcase = CABINET_SHOWCASES[selected] ?? CABINET_SHOWCASES[0];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 animate-in fade-in duration-300">
      {/* Concept — top */}
      <div className="text-center space-y-2">
        <h1 className="font-logo text-2xl tracking-tight italic" style={{ color: WEB.text }}>
          {t("onboarding:whatIsCabinet.heading")}
        </h1>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
          {t("onboarding:whatIsCabinet.body")}
        </p>
      </div>

      {/* Showcases — horizontal rail of buttons */}
      <div className="space-y-2.5">
        <p
          className="text-center text-[11px] font-semibold uppercase tracking-[0.15em]"
          style={{ color: WEB.textTertiary }}
        >
          How people use Cabinet
        </p>
        <div
          ref={railRef}
          className="flex gap-2 overflow-x-auto pb-1.5"
          style={{ scrollbarWidth: "none" }}
        >
          {CABINET_SHOWCASES.map((s, i) => {
            const on = i === selected;
            return (
              <button
                key={s.id}
                type="button"
                data-idx={i}
                onClick={() => onSelect(i)}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  background: on ? WEB.accent : WEB.bgCard,
                  color: on ? "#FFFFFF" : WEB.textSecondary,
                  border: `1px solid ${on ? WEB.accent : WEB.border}`,
                }}
              >
                <span className="text-sm leading-none">{s.emoji}</span>
                <span className="whitespace-nowrap">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Real example — full window mockup */}
      <ShowcaseWindow showcase={showcase} />

      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function FirstTaskStep({
  agentName,
  firstTask,
  setFirstTask,
  onBack,
  onNext,
}: {
  agentName: string;
  firstTask: string;
  setFirstTask: (next: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useLocale();
  const name = agentName.trim() || t("onboarding:access.defaultAgent");
  const fieldStyle: CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 12,
    border: `1px solid ${WEB.border}`,
    background: WEB.bgWarm,
    color: WEB.text,
    fontSize: 14,
    lineHeight: 1.5,
    outline: "none",
    resize: "vertical",
  };
  const examples = [
    t("onboarding:firstTask.example1"),
    t("onboarding:firstTask.example2"),
    t("onboarding:firstTask.example3"),
  ];
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-7 animate-in fade-in duration-300">
      <div className="text-center space-y-2">
        <span
          className="mx-auto flex size-12 items-center justify-center rounded-2xl"
          style={{ background: WEB.accentBg }}
        >
          <ClipboardCheck className="size-6" style={{ color: WEB.accent }} />
        </span>
        <h1 className="font-logo text-2xl tracking-tight italic" style={{ color: WEB.text }}>
          {t("onboarding:firstTask.heading")}
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
          {t("onboarding:firstTask.subtitle", { name })}
        </p>
      </div>
      <div
        className="space-y-3 rounded-2xl p-5"
        style={{ background: WEB.bgCard, border: `1px solid ${WEB.border}` }}
      >
        <label className="block text-sm font-medium" style={{ color: WEB.text }}>
          {t("onboarding:firstTask.label", { name })}
        </label>
        <textarea
          value={firstTask}
          onChange={(e) => setFirstTask(e.target.value)}
          placeholder={t("onboarding:firstTask.placeholder")}
          rows={4}
          autoFocus
          style={fieldStyle}
        />
        <div className="flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setFirstTask(ex)}
              className="rounded-full px-3 py-1 text-[12px] transition-colors hover:opacity-80"
              style={{ background: WEB.bgWarm, color: WEB.textSecondary, border: `1px solid ${WEB.border}` }}
            >
              {ex}
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: WEB.textTertiary }}>
          {t("onboarding:firstTask.note")}
        </p>
      </div>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

// Live "cabinet" left rail shown during the configuration steps. Reuses the
// tour's MockupSidebar and reflects the user's choices as they go: the title
// becomes the cabinet name, Data shows the project's files, the Team tab fills
// in once they configure their first agent, and the Tasks tab shows the first
// task they file for that agent.
function OnboardingCabinetRail({
  cabinetName,
  agentName,
  userName,
  firstTask,
  step,
  heartbeatOn,
}: {
  cabinetName: string;
  agentName: string;
  userName: string;
  firstTask: string;
  step: number;
  heartbeatOn: boolean;
}) {
  const { t } = useLocale();
  const person = userName.trim();

  const footer = (
    <div
      className="flex items-center gap-2 border-t px-3 py-2.5"
      style={{ borderColor: WEB.borderLight }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
        style={{ background: WEB.accent }}
      >
        {(person || "?").charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium" style={{ color: WEB.text }}>
        {person || t("onboarding:rail.you")}
      </span>
    </div>
  );

  const shell = (children: ReactNode) => (
    <div className="hidden lg:flex items-center w-[260px] shrink-0 self-stretch">
      <div
        className="flex h-[480px] w-full flex-col overflow-hidden rounded-2xl"
        style={{
          background: WEB.bgWarm,
          border: `1px solid ${WEB.border}`,
          boxShadow: "0 12px 32px -20px rgba(59,47,47,0.35)",
        }}
      >
        {children}
      </div>
    </div>
  );

  // The user's own cabinet taking shape as they configure it.
  const agent = agentName.trim();
  const task = firstTask.trim();
  // Data while picking the room; the Team tab opens on "Connect your AI";
  // the Tasks tab opens on the first-task step.
  const activeTab: MockupTab =
    step >= STEP_TASK ? "tasks" : step >= STEP_PROVIDER ? "agents" : "data";
  const title = cabinetName.trim() || t("onboarding:rail.untitled");
  const files = ["index.md", "Getting Started", "Notes"];
  // Progress checks: each tab gets a green tick once the user completes that
  // part (names the cabinet, hires an agent, files a task).
  const completedTabs: MockupTab[] = [
    ...(cabinetName.trim() ? (["data"] as const) : []),
    ...(agent ? (["agents"] as const) : []),
    ...(task ? (["tasks"] as const) : []),
  ];

  return shell(
    <>
      <div className="min-h-0 flex-1">
          <MockupSidebar title={title} activeTab={activeTab} completedTabs={completedTabs} headerBadge="">

            {activeTab === "data" && (
              <div className="space-y-1.5 px-3 pt-3">
                {files.map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-2 text-[12px]"
                    style={{ color: WEB.textSecondary }}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: WEB.textTertiary }} />
                    <span className="truncate">{f}</span>
                  </div>
                ))}
                <p className="pt-2 text-[11px] leading-relaxed" style={{ color: WEB.textTertiary }}>
                  {t("onboarding:rail.dataCaption")}
                </p>
              </div>
            )}
            {activeTab === "agents" && (
              <div className="space-y-2 px-3 pt-3">
                {agent ? (
                  <div
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                    style={{ background: WEB.bgCard, border: `1px solid ${WEB.border}` }}
                  >
                    <span className="text-sm">🤖</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium" style={{ color: WEB.text }}>
                      {agent}
                    </span>
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${heartbeatOn ? "cabinet-task-heartbeat" : ""}`}
                      style={{ background: "#22c55e" }}
                    />
                  </div>
                ) : (
                  <p className="text-[11px] leading-relaxed" style={{ color: WEB.textTertiary }}>
                    {t("onboarding:rail.teamEmpty")}
                  </p>
                )}
                <p className="pt-1 text-[11px] leading-relaxed" style={{ color: WEB.textTertiary }}>
                  {t("onboarding:rail.teamCaption")}
                </p>
              </div>
            )}
            {activeTab === "tasks" && (
              <div className="space-y-2 px-3 pt-3">
                {task ? (
                  <div
                    className="space-y-1 rounded-lg px-2.5 py-2"
                    style={{ background: WEB.bgCard, border: `1px solid ${WEB.border}` }}
                  >
                    <p className="text-[12px] leading-snug" style={{ color: WEB.text }}>
                      {task}
                    </p>
                    {agent && (
                      <p className="flex items-center gap-1 text-[10px]" style={{ color: WEB.textTertiary }}>
                        <span>🤖</span>
                        {t("onboarding:rail.assignedTo", { name: agent })}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] leading-relaxed" style={{ color: WEB.textTertiary }}>
                    {t("onboarding:rail.tasksEmpty")}
                  </p>
                )}
                <p className="pt-1 text-[11px] leading-relaxed" style={{ color: WEB.textTertiary }}>
                  {t("onboarding:rail.tasksCaption")}
                </p>
              </div>
            )}
          </MockupSidebar>
        </div>
        {footer}
    </>
  );
}

function TeamBuildStep({
  firstAgent,
  setFirstAgent,
  heartbeatEnabled,
  setHeartbeatEnabled,
  heartbeatSchedule,
  setHeartbeatSchedule,
  onBack,
  onNext,
}: {
  firstAgent: FirstAgentDraft;
  setFirstAgent: (next: FirstAgentDraft) => void;
  heartbeatEnabled: boolean;
  setHeartbeatEnabled: (next: boolean) => void;
  heartbeatSchedule: string;
  setHeartbeatSchedule: (next: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const fieldStyle: React.CSSProperties = {
    background: WEB.bgCard,
    border: `1px solid ${WEB.border}`,
    color: WEB.text,
    borderRadius: 12,
    fontSize: 15,
    padding: "0 14px",
    outline: "none",
    width: "100%",
    fontFamily: "inherit",
  };
  const name = firstAgent.name.trim() || "your agent";
  const schedules = [
    { key: "hourly", label: "Hourly", when: "every hour" },
    { key: "daily", label: "Daily", when: "every day at 9AM" },
    { key: "weekly", label: "Weekly", when: "Mondays at 9AM" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 animate-in fade-in duration-300">
      {/* Title */}
      <div className="text-center space-y-2">
        <h1 className="font-logo text-2xl tracking-tight italic" style={{ color: WEB.text }}>
          Hire your <span style={{ color: WEB.accent }}>AI team</span>
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
          Start with your first teammate. It works for you 24/7, getting your work
          done while you drink your coffee.
        </p>
      </div>

      {/* Questions — no container */}
      <div className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: WEB.text }}>
            Name your agent
          </label>
          <input
            value={firstAgent.name}
            onChange={(e) => setFirstAgent({ ...firstAgent, name: e.target.value })}
            placeholder="Cabi"
            style={{ ...fieldStyle, height: 44 }}
            autoFocus
          />
          <RotatingTags
            tags={[
              "Cabi",
              "CEO",
              "CTO",
              "Harry",
              "Diana",
              "Salesman",
              "Jarvis",
              "Alfred",
              "Friday",
              "Scout",
              "Ghostwriter",
              "Sherlock",
              "Nova",
              "Maestro",
              "Closer",
            ]}
            onPick={(tag) => setFirstAgent({ ...firstAgent, name: tag })}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: WEB.text }}>
            What should this agent do?
          </label>
          <textarea
            value={firstAgent.instructions}
            onChange={(e) =>
              setFirstAgent({ ...firstAgent, instructions: e.target.value })
            }
            placeholder="e.g. Every morning, scan our subreddit and write up new user complaints."
            rows={2}
            style={{ ...fieldStyle, padding: "10px 14px", resize: "vertical", lineHeight: 1.5 }}
          />
        </div>
      </div>

      {/* Heartbeat */}
      <div
        className="rounded-2xl p-4 transition-all duration-300"
        style={{
          background: WEB.bgCard,
          border: `1px solid ${heartbeatEnabled ? "rgba(34,197,94,0.4)" : WEB.border}`,
          boxShadow: heartbeatEnabled
            ? "0 0 0 4px rgba(34,197,94,0.08), 0 12px 32px -12px rgba(34,197,94,0.5)"
            : "none",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <HeartPulse
                className={`size-4 ${heartbeatEnabled ? "cabinet-task-heartbeat" : ""}`}
                style={{ color: heartbeatEnabled ? "#22c55e" : WEB.textTertiary }}
              />
              <span className="text-sm font-medium" style={{ color: WEB.text }}>
                Heartbeat
              </span>
              <span className="text-[10px]" style={{ color: WEB.textTertiary }}>
                recommended
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: WEB.textSecondary }}>
              Give {name} a heartbeat and it runs on its own on a schedule, even while you are
              away. Off means it only works when you ask.
            </p>
          </div>
          <Switch
            checked={heartbeatEnabled}
            onCheckedChange={(v) => setHeartbeatEnabled(v)}
            className="mt-0.5"
          />
        </div>

        {heartbeatEnabled && (
          <div
            className="mt-4 space-y-2 border-t pt-4 animate-in fade-in duration-200"
            style={{ borderColor: WEB.borderLight }}
          >
            <p className="text-xs font-medium" style={{ color: WEB.text }}>
              When should it run?
            </p>
            <div className="grid grid-cols-3 gap-2">
              {schedules.map(({ key, label, when }) => {
                const sel = heartbeatSchedule === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setHeartbeatSchedule(key)}
                    className="rounded-xl px-3 py-2.5 text-start transition-colors"
                    style={{
                      background: sel ? "rgba(34,197,94,0.10)" : WEB.bgWarm,
                      border: `1px solid ${sel ? "rgba(34,197,94,0.45)" : WEB.border}`,
                    }}
                  >
                    <span className="block text-[13px] font-medium" style={{ color: WEB.text }}>
                      {label}
                    </span>
                    <span
                      className="block text-[10px] leading-tight"
                      style={{ color: sel ? "#16a34a" : WEB.textTertiary }}
                    >
                      {when}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: WEB.textTertiary }}>
              Heads up: each run uses AI tokens (and your provider quota). You can change this anytime.
            </p>
          </div>
        )}
      </div>

      <StepNav onBack={onBack} onNext={onNext} />
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
  sales: OFFICE_ORDER,
  hr: OFFICE_ORDER,
  product: OFFICE_ORDER,
  rnd: OFFICE_ORDER,
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

/* ─── Knowledge-base tree (launch step) ─── */

// Animated file tree of the cabinet's starting knowledge base. Reveals line by
// line, terminal-style, so the launch screen shows the KB coming to life next
// to the AI team chat.
function LaunchKbTree({ cabinetName }: { cabinetName: string }) {
  const { t } = useLocale();
  const lines = useMemo(
    () => [
      { text: cabinetName || t("onboarding:launch.defaultCabinetName"), indent: 0, icon: "📦" },
      { text: "index.md", indent: 1, icon: "📄" },
      { text: "Getting Started", indent: 1, icon: "📖" },
      { text: "Rooms", indent: 2, icon: "🚪" },
      { text: "Skills", indent: 2, icon: "🧩" },
      { text: "Apps and Repos", indent: 2, icon: "🔌" },
    ],
    [cabinetName, t]
  );

  const [visible, setVisible] = useState(0);
  useEffect(() => {
    if (visible >= lines.length) return;
    const id = setTimeout(
      () => setVisible((c) => c + 1),
      visible === 0 ? 350 : 200
    );
    return () => clearTimeout(id);
  }, [visible, lines.length]);

  return (
    <div
      className="rounded-xl px-4 py-3 font-mono text-[12px]"
      style={{ background: WEB.bgWarm, border: `1px solid ${WEB.borderLight}`, lineHeight: 1.5 }}
    >
      {lines.map((line, i) => {
        const isVisible = i < visible;
        const isRoot = i === 0;
        let prefix = "";
        if (!isRoot && line.indent === 1) {
          const hasMore = lines.slice(i + 1).some((l) => l.indent === 1);
          prefix = hasMore ? "├─ " : "└─ ";
        } else if (line.indent === 2) {
          const hasMoreSibling = lines
            .slice(i + 1)
            .some((l, j) => l.indent === 2 && !lines.slice(i + 1, i + 1 + j).some((x) => x.indent <= 1));
          prefix = "│  " + (hasMoreSibling ? "├─ " : "└─ ");
        }
        return (
          <div
            key={i}
            className="transition-all duration-300 whitespace-pre"
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? "translateX(0)" : "translateX(-6px)",
            }}
          >
            {isRoot ? (
              <span style={{ color: WEB.accent, fontWeight: 600 }}>
                {line.icon} {line.text}
              </span>
            ) : (
              <span style={{ color: WEB.textSecondary }}>
                <span style={{ color: WEB.borderDark }}>{prefix}</span>
                {line.icon ? `${line.icon} ` : ""}
                {line.text}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
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

  // Build conversation script. The first agent leads (the user's own agent when
  // they made one), opening with a room-specific greeting; the rest are the
  // room's suggested teammates replying.
  const messages = useMemo(() => {
    const config = ROOMS[roomType];
    const lead = agents[0];
    if (!lead) return [];
    const others = agents.slice(1);

    const script: { agent: SuggestedAgent; text: string }[] = [
      {
        agent: lead,
        text: i18n.t(`onboarding:demo.greeting.${roomType}`, {
          defaultValue: config.greetingTemplate(homeName, workspaceName),
          workspace: workspaceName,
          home: homeName,
        }),
      },
    ];

    others.slice(0, 3).forEach((other, idx) => {
      const topic = i18n.t(`onboarding:demo.${roomType}.topics.${idx}`, {
        defaultValue: i18n.t("onboarding:demo.fallbackTopic", "what's next"),
      });
      script.push({
        agent: lead,
        text: i18n.t("onboarding:demo.assign", {
          defaultValue: `${other.name}, can you take on ${topic}?`,
          name: other.name,
          topic,
        }),
      });
      const reply = i18n.t(`onboarding:demo.${roomType}.replies.${idx}`, {
        defaultValue: "",
      });
      if (reply) {
        script.push({ agent: other, text: reply });
      }
    });

    script.push({
      agent: lead,
      text: i18n.t(`onboarding:demo.${roomType}.closing`, ""),
    });

    return script;
    // i18n.language is intentional: re-localize the demo when the language
    // changes. eslint's exhaustive-deps treats it as an "outer scope value",
    // but the parent (useLocale) re-renders AgentChatPreview on locale change,
    // so this dep correctly recomputes the script with the new translations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, workspaceName, homeName, roomType, i18n.language]);

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

/* ─── Dot-grid background (from runcabinet.com) ─── */
const dotGridStyle: React.CSSProperties = {
  backgroundImage: `radial-gradient(circle, ${WEB.borderDark} 0.5px, transparent 0.5px)`,
  backgroundSize: "32px 32px",
};

const STEP_NAMES: Record<number, string> = {
  0: "intro",
  [STEP_WELCOME_HOME]: "welcome-home",
  [STEP_WHAT_IS_CABINET]: "what-is-cabinet",
  [STEP_KNOWLEDGE]: "knowledge",
  [STEP_ROOM_SETUP]: "room-setup",
  [STEP_TEAM]: "team",
  [STEP_TASK]: "first-task",
  [STEP_PROVIDER]: "provider",
  [COMMUNITY_START_STEP]: "github",
  [COMMUNITY_START_STEP + 1]: "discord",
  [COMMUNITY_END_STEP]: "cloud",
  [COMMUNITY_END_STEP + 1]: "launch",
};

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const { t, locale, dir, setLocale } = useLocale();
  const welcomeParagraph = t("onboarding:welcome.paragraph");
  const [step, setStep] = useState(0);

  useEffect(() => {
    const stepName = STEP_NAMES[step] ?? `step-${step}`;
    sendTelemetry("onboarding.step", { step: stepName });
  }, [step]);

  // First-run language: match the OS keyboard / system language to a
  // shipped locale so onboarding is localized from screen 0. Only when the
  // user hasn't already chosen one — an explicit pick (this run via the
  // language button, or a prior run) always wins. Runs once; the in-flight
  // re-check guards against the async detection stomping a manual choice
  // made while it was resolving.
  const autoLocaleRan = useRef(false);
  useEffect(() => {
    if (autoLocaleRan.current) return;
    autoLocaleRan.current = true;
    if (hasExplicitLocale()) return;
    let cancelled = false;
    void detectSystemLocale().then((detected) => {
      if (cancelled || !detected || hasExplicitLocale()) return;
      setLocale(detected);
      sendTelemetry("onboarding.locale_autodetected", { locale: detected });
    });
    return () => {
      cancelled = true;
    };
  }, [setLocale]);

  // Cabinet Cloud waitlist (replaces Tally form). View event fires when the
  // cloud step is reached; start fires on first input; submit fires on success.
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudStatus, setCloudStatus] = useState<
    "idle" | "submitting" | "success" | "already" | "error"
  >("idle");
  const cloudStartedRef = useRef(false);
  const cloudViewedRef = useRef(false);
  useEffect(() => {
    if (step === COMMUNITY_END_STEP && !cloudViewedRef.current) {
      cloudViewedRef.current = true;
      recordWaitlistView("cabinet-onboarding");
    }
  }, [step]);

  // "Keep in touch" funnel (source: onboarding-welcome), so the backend's
  // Visits/Drop-offs panels have the full view -> start -> submit picture, not
  // just submits. These two are anonymous (visitId + source only); the email
  // itself is only sent on launch and only with the consent checkbox.
  const welcomeStartedRef = useRef(false);
  const welcomeViewedRef = useRef(false);
  useEffect(() => {
    if (step === STEP_WELCOME_HOME && !welcomeViewedRef.current) {
      welcomeViewedRef.current = true;
      recordWaitlistView("onboarding-welcome");
    }
  }, [step]);
  const handleCloudInput = useCallback((value: string) => {
    setCloudEmail(value);
    if (cloudStatus === "error" || cloudStatus === "already") setCloudStatus("idle");
    if (!cloudStartedRef.current && value.length > 0) {
      cloudStartedRef.current = true;
      recordWaitlistStart("cabinet-onboarding");
    }
  }, [cloudStatus]);
  const handleCloudSubmit = useCallback(async () => {
    const trimmed = cloudEmail.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setCloudStatus("error");
      return;
    }
    setCloudStatus("submitting");
    const result = await submitWaitlistEmail(trimmed, "cabinet-onboarding");
    if (!result.ok) {
      setCloudStatus("error");
      return;
    }
    setCloudStatus(result.alreadyOnList ? "already" : "success");
  }, [cloudEmail]);

  const [answers, setAnswers] = useState<OnboardingAnswers>({
    name: "",
    email: "",
    role: "",
    homeName: "",
    // The onboarding room starts blank; the user names it and gives it a
    // purpose, then adds capabilities (agents, skills, files) inside the app.
    roomType: "blank",
    workspaceName: "",
    description: "",
    teamSize: "",
    priority: "",
  });
  const mandatoryAgents = useMemo(
    () => new Set<string>(ROOMS[answers.roomType].mandatoryAgents),
    [answers.roomType]
  );
  const descriptionInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill the Cabinet Cloud waitlist field with the email entered on the
  // welcome step (if any). Only seeds while the field is still empty, so the
  // user can edit it freely afterwards.
  useEffect(() => {
    const welcome = answers.email.trim();
    if (step === COMMUNITY_END_STEP && welcome && !cloudEmail) {
      setCloudEmail(welcome);
    }
  }, [step, answers.email, cloudEmail]);

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
          if (c >= welcomeParagraph.length) {
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
  }, [step, welcomeParagraph.length]);
  const [firstAgent, setFirstAgent] = useState<FirstAgentDraft>({
    name: "",
    role: "",
    instructions: "",
  });
  // Heartbeat for the first agent (configured in the team step). Off by default;
  // the schedule becomes a cron expression on launch (see scheduleToCron).
  const [heartbeatEnabled, setHeartbeatEnabled] = useState<boolean>(false);
  const [heartbeatSchedule, setHeartbeatSchedule] = useState<string>("daily");
  // Placeholder: the first task the user files for their agent (STEP_TASK).
  const [firstTask, setFirstTask] = useState<string>("");
  // Which real-world example is being previewed in the What-is-a-Cabinet step.
  const [exampleIndex, setExampleIndex] = useState<number>(0);
  const [suggestedAgents, setSuggestedAgents] = useState<SuggestedAgent[]>([]);
  // Keep the downstream preview/count in sync with the one agent the user is
  // configuring in the team step. No pre-made room defaults.
  useEffect(() => {
    const name = firstAgent.name.trim();
    setSuggestedAgents(
      name
        ? [
            {
              slug: slugifyPageName(name) || "agent",
              name,
              emoji: "\u{1F916}",
              role: firstAgent.role.trim() || "Agent",
              checked: true,
            },
          ]
        : []
    );
  }, [firstAgent]);

  // Cast for the launch-step chat animation: the user's own agent leads (when
  // they made one), joined by a few of the room's suggested teammates so the
  // preview feels like a real team at work. These teammates are illustrative —
  // only the user's agent is actually created.
  const demoAgents = useMemo<SuggestedAgent[]>(() => {
    const config = ROOMS[answers.roomType];
    const teammateSlugs = Array.from(
      new Set([...config.mandatoryAgents, ...config.suggestedAgents])
    );
    const teammates: SuggestedAgent[] = teammateSlugs.map((slug) => ({
      slug,
      name: slug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      emoji: "\u{1F916}",
      role: "",
      checked: true,
    }));
    const name = firstAgent.name.trim();
    if (!name) return teammates.slice(0, 4);
    const lead: SuggestedAgent = {
      slug: slugifyPageName(name) || "agent",
      name,
      emoji: "\u{1F916}",
      role: firstAgent.role.trim() || "Agent",
      checked: true,
    };
    return [lead, ...teammates.filter((a) => a.slug !== lead.slug).slice(0, 3)];
  }, [answers.roomType, firstAgent]);

  const [launching, setLaunching] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  // Optional consent (not required to launch): if checked, we register the
  // welcome-step email with our backend on launch. Checked by default; the
  // user can opt out before launching.
  const [keepInTouch, setKeepInTouch] = useState(true);
  const [githubStars, setGithubStars] = useState(GITHUB_STARS_FALLBACK);
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
  const TIER_1_PROVIDER_IDS = useMemo(
    () => new Set(["gemini-cli", "claude-code", "opencode", "codex-cli"]),
    []
  );
  const tier1Providers = useMemo(
    () => sortedProviders.filter((p) => TIER_1_PROVIDER_IDS.has(p.id)),
    [sortedProviders, TIER_1_PROVIDER_IDS]
  );
  const tier2Providers = useMemo(
    () => sortedProviders.filter((p) => !TIER_1_PROVIDER_IDS.has(p.id)),
    [sortedProviders, TIER_1_PROVIDER_IDS]
  );
  const [showMoreAis, setShowMoreAis] = useState(false);
  const expandedProviderInfo = useMemo(
    () => (expandedProvider ? providers.find((p) => p.id === expandedProvider) || null : null),
    [expandedProvider, providers]
  );

  useEffect(() => {
    const controller = new AbortController();

    const fetchGitHubStats = async () => {
      try {
        const res = await fetch(GITHUB_STATS_URL, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return;

        const data = await res.json();
        if (typeof data.stars === "number") {
          setGithubStars(data.stars);
        }
      } catch {
        // ignore
      }
    };

    void fetchGitHubStats();
    return () => controller.abort();
  }, []);

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

  // After picking a room, connect the AI provider first; the agent is
  // configured next (it needs a provider to run).
  const goToProvider = () => {
    setStep(STEP_PROVIDER);
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

        // Seed the set of environments integrations install into from the CLI
        // the user just set up. The endpoint sanitizes to MCP-capable
        // providers (a no-op for non-capable ones) and the user can edit this
        // any time in Settings → Integrations. Best-effort: never block setup.
        try {
          await fetch("/api/agents/config/integration-environments", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ environments: [selectedProvider] }),
          });
        } catch {
          /* non-critical — defaults apply until edited in Settings */
        }
      }

      await fetch("/api/onboarding/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeName: answers.homeName || (answers.name ? `${answers.name}'s Home` : "Home"),
          roomType: answers.roomType,
          answers: {
            name: answers.name,
            email: answers.email.trim(),
            workspaceName: answers.workspaceName,
            description: answers.description,
            teamSize: answers.teamSize,
            priority: answers.priority,
          },
          selectedAgents: [],
          // The one agent the user configured from scratch. Created by the
          // setup route (no pre-made team). Empty name → no agent.
          firstAgent: {
            name: firstAgent.name.trim(),
            role: firstAgent.role.trim(),
            instructions: firstAgent.instructions.trim(),
            provider: selectedProvider || undefined,
            heartbeat: scheduleToCron(heartbeatSchedule),
            heartbeatEnabled,
          },
          locale,
        }),
      });

      // Only when the user opted in on the launch consent checkbox: register the
      // welcome-step email with our backend so we can keep in touch. Goes through
      // the waitlist (PII) channel, never the anonymous telemetry pipeline below.
      const welcomeEmail = answers.email.trim();
      if (
        keepInTouch &&
        welcomeEmail &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(welcomeEmail)
      ) {
        recordOnboardingEmail(welcomeEmail);
      }

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
  }, [answers, firstAgent, heartbeatEnabled, heartbeatSchedule, selectedProvider, selectedModel, selectedEffort, locale, onComplete, keepInTouch]);

  const communitySteps: CommunityStepConfig[] = [
    {
      eyebrow: "GitHub",
      title: t("onboarding:github.title"),
      description: t("onboarding:github.description"),
      aside: t("onboarding:github.aside"),
      nextLabel: t("onboarding:actions.next"),
      cards: [],
    },
    {
      eyebrow: "Discord",
      title: t("onboarding:discord.title"),
      description: t("onboarding:discord.description"),
      aside: t("onboarding:discord.aside"),
      nextLabel: t("onboarding:actions.next"),
      cards: [
        {
          title: "Join the Discord",
          description:
            "Meet the people building Cabinet, see what's shipping, and toss ideas into the fire while they are still hot.",
          cta: "Join the chat",
          href: DISCORD_SUPPORT_URL,
          icon: <DiscordIcon className="size-4" />,
          iconClassName: "",
        },
        {
          title: "Why people stay",
          description:
            "Early features, fast answers, behind-the-scenes progress, and the occasional delightful chaos of building in public.",
          cta: "",
          icon: <Asterisk className="size-4" />,
          iconClassName: "",
        },
      ],
    },
    {
      eyebrow: "Cabinet Cloud",
      title: t("onboarding:cloud.title"),
      description: t("onboarding:cloud.description"),
      aside: t("onboarding:cloud.aside"),
      cards: [
        {
          title: "Connect from anywhere",
          description:
            "One Cabinet across phone, laptop, and browser. Pick up exactly where you left off, no setup required.",
          cta: "",
          icon: <Cloud className="size-4" />,
          iconClassName: "",
        },
        {
          title: "Agents that don't sleep",
          description:
            "Your AI team keeps running 24/7 in the background. Wake up to drafts written, inboxes triaged, and research done.",
          cta: "",
          icon: <Rocket className="size-4" />,
          iconClassName: "",
        },
      ],
    },
  ];
  const communityStep =
    step >= COMMUNITY_START_STEP && step <= COMMUNITY_END_STEP
      ? communitySteps[step - COMMUNITY_START_STEP]
      : null;
  const isGitHubCommunityStep = communityStep?.eyebrow === "GitHub";
  // The agent is optional (the user can skip and add agents later), so launch
  // is only blocked while a launch is in flight.
  const launchDisabled = launching;
  const finalLaunchDisabled = launchDisabled || !disclaimerAccepted;
  // Show the live "cabinet" left rail during the configuration steps.
  // The live build rail runs from "Pick a room" through the first task. The
  // What-is-a-Cabinet step shows the full window showcases instead (no rail).
  const showRail = step >= STEP_ROOM_SETUP && step <= STEP_TASK;
  const starsLabel = t("onboarding:github.starsLabel", { stars: formatGithubStars(githubStars) });

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
      <WizardLanguagePicker />
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
        className={`relative mx-auto flex min-h-screen w-full ${
          showRail
            ? "max-w-6xl gap-10"
            : step === STEP_WHAT_IS_CABINET || step === STEP_KNOWLEDGE
              ? "max-w-4xl"
              : "max-w-3xl"
        } justify-center ${
          // The intro card and welcome popup stay vertically centered; every
          // other step top-anchors so the progress bar + title hold a steady
          // position instead of re-centering as content height changes.
          step === 0 || step === STEP_WELCOME_HOME ? "items-center" : "items-start"
        } ${
          step === STEP_WELCOME_HOME ? "px-4 py-4" : "px-6 pt-16 pb-12"
        }`}
        style={step === STEP_WELCOME_HOME ? undefined : dotGridStyle}
      >
        {showRail && (
          <OnboardingCabinetRail
            cabinetName={answers.workspaceName}
            agentName={firstAgent.name}
            userName={answers.name}
            firstTask={firstTask}
            step={step}
            heartbeatOn={heartbeatEnabled}
          />
        )}
        <div className={showRail ? "min-w-0 flex-1" : "w-full"}>
          {/* Progress indicator — hidden on the intro screen and Welcome home
              (the entry screens), so it only appears once setup begins. */}
          {step !== 0 && step !== STEP_WELCOME_HOME && (
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

          {/* Step content — re-keyed per step so each navigation eases in
              (fade + slide-up) while the progress bar above holds its place. */}
          <div key={`step-${step}`} style={{ animation: "cabinet-tour-fade-up 0.4s ease-out" }}>

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
                    className="wh-item font-logo text-2xl tracking-tight italic"
                    style={{ ["--wh-d" as string]: "4.6s" } as React.CSSProperties}
                  >
                    <Trans
                      i18nKey="onboarding:welcome.heading"
                      components={{ accent: <span style={{ color: WEB.accent }} /> }}
                    />
                  </h1>
                  {/* Typewriter paragraph — reserves its full final height via a
                      transparent clone of the remaining text so the layout
                      doesn't jump while characters are being revealed. */}
                  <p
                    className="text-sm leading-relaxed text-center"
                    style={{ color: WEB.textSecondary, minHeight: "5.5em" }}
                  >
                    <span>{welcomeParagraph.slice(0, welcomeTyped)}</span>
                    {welcomeTyped < welcomeParagraph.length && (
                      <span
                        className="wh-caret"
                        aria-hidden="true"
                        style={{ color: WEB.accent }}
                      >
                        |
                      </span>
                    )}
                    <span aria-hidden="true" style={{ color: "transparent" }}>
                      {welcomeParagraph.slice(welcomeTyped)}
                    </span>
                  </p>
                </div>

                <div
                  className="wh-item space-y-2"
                  style={{ ["--wh-d" as string]: "5.0s" } as React.CSSProperties}
                >
                  <label className="text-sm font-medium" style={{ color: WEB.text }}>
                    {t("onboarding:welcome.namePrompt")}
                  </label>
                  <input
                    value={answers.name}
                    onChange={(e) => setAnswers({ ...answers, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && answers.name.trim()) {
                        e.preventDefault();
                        setStep(STEP_WHAT_IS_CABINET);
                      }
                    }}
                    placeholder={t("tinyExtras:namePlaceholder")}
                    style={inputStyle}
                    autoFocus
                  />
                </div>

                <div
                  className="wh-item space-y-2"
                  style={{ ["--wh-d" as string]: "5.08s" } as React.CSSProperties}
                >
                  <label className="text-sm font-medium" style={{ color: WEB.text }}>
                    {"What's your email?"}
                  </label>
                  <input
                    type="email"
                    value={answers.email}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAnswers({ ...answers, email: v });
                      if (!welcomeStartedRef.current && v.length > 0) {
                        welcomeStartedRef.current = true;
                        recordWaitlistStart("onboarding-welcome");
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && answers.name.trim()) {
                        e.preventDefault();
                        setStep(STEP_WHAT_IS_CABINET);
                      }
                    }}
                    placeholder="you@example.com"
                    style={inputStyle}
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
                    <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                    {t("onboarding:actions.back")}
                  </button>
                  <button
                    onClick={() => setStep(STEP_WHAT_IS_CABINET)}
                    disabled={!answers.name.trim()}
                    className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                    style={{ background: WEB.accent }}
                  >
                    {t("onboarding:actions.next")}
                    <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: What is a Cabinet? (concept) */}
          {step === STEP_WHAT_IS_CABINET && (
            <WhatIsCabinetStep
              selected={exampleIndex}
              onSelect={setExampleIndex}
              onBack={() => setStep(STEP_WELCOME_HOME)}
              onNext={() => setStep(STEP_KNOWLEDGE)}
            />
          )}

          {/* Step 3: Cabinet connects all your knowledge bases (animated graph) */}
          {step === STEP_KNOWLEDGE && (
            <KnowledgeStep
              onBack={() => setStep(STEP_WHAT_IS_CABINET)}
              onNext={() => setStep(STEP_ROOM_SETUP)}
            />
          )}

          {/* Step 4: Pick a room + name + describe the cabinet (merged) */}
          {step === STEP_ROOM_SETUP && (
            <div className="mx-auto flex max-w-xl flex-col gap-7 animate-in fade-in duration-300">
              <div className="text-center space-y-2">
                <h1 className="font-logo text-2xl tracking-tight italic" style={{ color: WEB.text }}>
                  Create your first <span style={{ color: WEB.accent }}>Cabinet</span>
                </h1>
                <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
                  Your room is your workspace. Inside your room you have one big cabinet for a
                  single part of your work or life, where your AI team helps you get it done.
                </p>
              </div>

              {/* Frame around the real use case + the outcome, not setup. The
                  room starts blank; capabilities get added later in the app.
                  No card wrapper: the questions sit directly on the page. */}
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: WEB.text }}>
                    What is this cabinet for?
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
                    placeholder="My startup"
                    style={inputStyle}
                  />
                  <RotatingTags
                    tags={[
                      "work",
                      "startup",
                      "second brain",
                      "family os",
                      "gtm",
                      "sales",
                      "marketing",
                      "client project",
                      "repo",
                      "research",
                      "content",
                      "studies",
                    ]}
                    onPick={(tag) => setAnswers({ ...answers, workspaceName: tag })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: WEB.text }}>
                    What do you want to accomplish?
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
                        void goToProvider();
                      }
                    }}
                    placeholder="Ship my MVP and get my first 100 users"
                    style={inputStyle}
                  />
                  <RotatingTags
                    tags={[
                      "ship faster",
                      "grow my audience",
                      "get organized",
                      "save time",
                      "close deals",
                      "launch",
                      "write more",
                      "automate busywork",
                      "stay focused",
                    ]}
                    onPick={(tag) => setAnswers({ ...answers, description: tag })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setStep(STEP_KNOWLEDGE)}
                  className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: WEB.textSecondary }}
                >
                  <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                  {t("onboarding:actions.back")}
                </button>
                <button
                  onClick={goToProvider}
                  disabled={!answers.workspaceName.trim()}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                  style={{ background: WEB.accent }}
                >
                  {t("onboarding:actions.next")}
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Configure your first agent (+ heartbeat) */}
          {step === STEP_TEAM && (
            <TeamBuildStep
              firstAgent={firstAgent}
              setFirstAgent={setFirstAgent}
              heartbeatEnabled={heartbeatEnabled}
              setHeartbeatEnabled={setHeartbeatEnabled}
              heartbeatSchedule={heartbeatSchedule}
              setHeartbeatSchedule={setHeartbeatSchedule}
              onBack={() => setStep(STEP_PROVIDER)}
              onNext={() => setStep(STEP_TASK)}
            />
          )}

          {/* Step 6: File your first task for the agent (placeholder) */}
          {step === STEP_TASK && (
            <FirstTaskStep
              agentName={firstAgent.name}
              firstTask={firstTask}
              setFirstTask={setFirstTask}
              onBack={() => setStep(STEP_TEAM)}
              onNext={() => setStep(COMMUNITY_START_STEP)}
            />
          )}

          {/* Step 4: AI Provider Check */}
          {step === STEP_PROVIDER && (
            <div className="mx-auto flex max-w-3xl flex-col gap-6 animate-in fade-in duration-300">
              <div className="text-center space-y-2">
                <h1 className="font-logo text-2xl tracking-tight italic">
                  {t("onboarding:provider.heading")}
                </h1>
                <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
                  {t("onboarding:provider.subtitle")}
                </p>
              </div>

              {/* Registered CLI providers */}
              {providersLoading ? (
                <div className="space-y-2.5" aria-hidden>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl p-3.5"
                      style={{ background: WEB.bgCard, border: `1px solid ${WEB.border}` }}
                    >
                      <div
                        className="size-9 shrink-0 rounded-lg animate-pulse"
                        style={{ background: WEB.borderLight }}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3 w-28 rounded animate-pulse" style={{ background: WEB.borderLight }} />
                        <div className="h-2.5 w-44 rounded animate-pulse" style={{ background: WEB.borderLight }} />
                      </div>
                      <div className="h-6 w-16 shrink-0 rounded-full animate-pulse" style={{ background: WEB.borderLight }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col md:flex-row items-stretch md:items-start gap-3">
                    <div
                      className={`flex flex-col gap-2 transition-[flex-basis] duration-300 ease-out ${
                        expandedProvider
                          ? "hidden md:flex md:basis-[42%] md:flex-grow-0 md:flex-shrink-0"
                          : "basis-full"
                      }`}
                    >
                    {(() => {
                      const renderRow = (p: ProviderInfo) => {
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
                          ? t("onboarding:providerStatus.ready")
                          : isInstalled
                            ? t("onboarding:providerStatus.loginRequired")
                            : t("onboarding:providerStatus.notInstalled");
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
                          ? WEB.borderLight
                          : isInstalled
                            ? "rgba(217,119,6,0.35)"
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
                                if (expandedProvider !== null) {
                                  setExpandedProvider(p.id);
                                }
                              } else {
                                setExpandedProvider(isExpanded ? null : p.id);
                              }
                            }}
                            className="group w-full flex items-center gap-3 rounded-xl px-4 py-3 text-start transition-all hover:-translate-y-0.5"
                            style={{
                              background:
                                isSelected && isReady ? WEB.accentBg : WEB.bgCard,
                              border: `1px solid ${cardBorder}`,
                              boxShadow: isExpanded
                                ? `0 0 0 2px ${WEB.accent}1F`
                                : isSelected && isReady
                                  ? `0 0 0 2px ${WEB.accent}14`
                                  : undefined,
                              opacity: isReady ? 1 : isInstalled ? 0.95 : 0.7,
                            }}
                          >
                            <div
                              className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                              style={{
                                background: WEB.bgWarm,
                                color: WEB.accent,
                              }}
                            >
                              <ProviderGlyph icon={p.icon} className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1 flex items-baseline gap-2 flex-wrap">
                              <p
                                className="text-[14px] font-medium leading-tight flex items-center gap-1.5"
                                style={{ color: WEB.text }}
                              >
                                <span>{p.name}</span>
                                {isSelected && isReady && (
                                  <Check
                                    className="size-3.5 shrink-0"
                                    style={{ color: WEB.accent }}
                                  />
                                )}
                              </p>
                              {isReady && p.version && (
                                <p
                                  className="text-[11px] leading-tight truncate"
                                  style={{ color: WEB.textTertiary, opacity: 0.7 }}
                                >
                                  {p.version}
                                </p>
                              )}
                            </div>
                            <span
                              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                              style={{ background: statusBg, color: statusColor }}
                            >
                              {verifyMeta ? t(`onboarding:verify.${verifyMeta.labelKey}`) : statusLabel}
                            </span>
                            <span
                              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap transition-colors"
                              style={{
                                color: isExpanded ? WEB.accent : WEB.textTertiary,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedProvider(isExpanded ? null : p.id);
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              {isReady
                                ? t("onboarding:provider.guide")
                                : isInstalled
                                  ? t("onboarding:provider.logIn")
                                  : t("onboarding:provider.install")}
                              <ChevronRight className="size-3 rtl:rotate-180" />
                            </span>
                          </button>
                        );
                      };
                      const COMING_SOON_ITEMS: { name: string; type: string; icon: string }[] = [
                        { name: "Anthropic API", type: "API", icon: "api" },
                        { name: "OpenAI API", type: "API", icon: "api" },
                        { name: "Google AI API", type: "API", icon: "api" },
                        { name: "Plugin SDK", type: "SDK", icon: "terminal" },
                      ];
                      return (
                        <>
                          {tier1Providers.map(renderRow)}
                          <button
                            type="button"
                            onClick={() => setShowMoreAis((v) => !v)}
                            className="inline-flex items-center gap-1.5 self-start mt-3 text-[11px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
                            style={{ color: WEB.textTertiary, background: "transparent" }}
                          >
                            {t("onboarding:provider.moreModels")}
                            <ChevronDown
                              className="size-3 transition-transform"
                              style={{
                                transform: showMoreAis
                                  ? "rotate(180deg)"
                                  : "rotate(0deg)",
                              }}
                            />
                          </button>
                          {showMoreAis && (
                            <>
                              {tier2Providers.map(renderRow)}
                              {COMING_SOON_ITEMS.length > 0 && (
                                <p
                                  className="text-[11px] font-semibold uppercase tracking-wider mt-3 self-start"
                                  style={{ color: WEB.textTertiary }}
                                >
                                  {t("onboarding:provider.comingSoon")}
                                </p>
                              )}
                              {COMING_SOON_ITEMS.map((cs) => (
                                <div
                                  key={cs.name}
                                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3"
                                  style={{
                                    background: WEB.bgCard,
                                    border: `1px solid ${WEB.borderLight}`,
                                    opacity: 0.55,
                                  }}
                                >
                                  <div
                                    className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                                    style={{ background: WEB.bgWarm, color: WEB.textTertiary }}
                                  >
                                    {cs.icon === "terminal" ? (
                                      <Terminal className="size-4" />
                                    ) : (
                                      <Zap className="size-4" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
                                    <p
                                      className="text-[14px] font-medium leading-tight"
                                      style={{ color: WEB.textSecondary }}
                                    >
                                      {cs.name}
                                    </p>
                                    <p
                                      className="text-[11px] leading-tight"
                                      style={{ color: WEB.textTertiary, opacity: 0.7 }}
                                    >
                                      {t("onboarding:provider.agentType", { type: cs.type })}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </>
                          )}
                        </>
                      );
                    })()}

                    <button
                      onClick={checkProvider}
                      className="inline-flex items-center gap-1.5 self-start mt-4 text-[11px] transition-opacity hover:opacity-80"
                      style={{ color: WEB.textTertiary, background: "transparent" }}
                    >
                      <RefreshCw className="size-3" />
                      {t("onboarding:provider.recheck")}
                    </button>
                    </div>

                    {/* Install / verify guide column (slides in from the end side, RTL-aware) */}
                    {expandedProviderInfo && (
                      <div
                        key={expandedProviderInfo.id}
                        className="basis-full md:basis-[58%] md:flex-grow-0 md:flex-shrink-0"
                        style={{
                          animation: "onboarding-guide-slide-in 300ms ease-out",
                          ["--guide-slide-from" as never]: dir === "rtl" ? "-24px" : "24px",
                        }}
                      >
                        {(() => {
                    const p = expandedProviderInfo;
                    const setupSteps: { title: string; detail: string; cmd?: string; openTerminal?: boolean; link?: { label: string; url: string } }[] = [
                      { title: t("onboarding:provider.openTerminalTitle"), detail: t("onboarding:provider.openTerminalDetail"), openTerminal: true },
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
                        className="rounded-xl p-4 space-y-3"
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
                              {t("onboarding:provider.setupTitle", { name: p.name })}
                            </p>
                          </div>
                          <button
                            onClick={() => setExpandedProvider(null)}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
                            style={{ color: WEB.textTertiary }}
                          >
                            {t("onboarding:provider.close")}
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
                                        showError(t("onboarding:provider.openTerminalError"));
                                      });
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 mt-1.5 text-[11px] font-medium transition-all hover:-translate-y-0.5"
                                    style={{ background: "#1e1e1e", color: "#d4d4d4" }}
                                  >
                                    <Terminal className="size-3" />
                                    {t("onboarding:provider.openTerminalButton")}
                                  </button>
                                )}
                                {setupStep.link && (
                                  <a
                                    href={setupStep.link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-medium mt-1.5"
                                    style={{ color: WEB.accent }}
                                  >
                                    {setupStep.link.label}
                                    <ExternalLink className="size-3" />
                                  </a>
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
                              ? t("onboarding:provider.verifying")
                              : verifyState.phase === "done"
                                ? t("onboarding:provider.rerunVerify")
                                : t("onboarding:provider.runVerify")}
                          </button>
                          {verifyMeta && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ background: verifyMeta.bg, color: verifyMeta.color }}
                            >
                              {t(`onboarding:verify.${verifyMeta.labelKey}`)}
                            </span>
                          )}
                          {verifyResult &&
                            verifyResult.status !== "pass" &&
                            verifyResult.failedStepTitle && (
                              <span className="text-[11px]" style={{ color: WEB.textSecondary }}>
                                <Trans
                                  i18nKey="onboarding:provider.failedAtStep"
                                  values={{ step: verifyResult.failedStepTitle }}
                                  components={{ strong: <strong style={{ color: WEB.text }} /> }}
                                />
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
                          {t("onboarding:provider.verifyExplanation")}
                        </p>
                      </div>
                    );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Model + effort selectors are intentionally hidden during onboarding —
                  the provider tile click seeds the first model + suggested effort,
                  and both are refinable later from Settings → Providers. */}

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep(STEP_ROOM_SETUP)}
                  className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: WEB.textSecondary }}
                >
                  <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                  {t("onboarding:actions.back")}
                </button>
                <button
                  onClick={() => setStep(STEP_TEAM)}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5"
                  style={{ background: WEB.accent }}
                >
                  {anyProviderReady ? t("onboarding:actions.next") : t("onboarding:provider.skipForNow")}
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </button>
              </div>
            </div>
          )}

          {/* Steps 6-8: Community */}
          {communityStep && (
            <div className="relative mx-auto flex max-w-2xl flex-col gap-8 animate-in fade-in duration-300">
              {/* Floating emoji backdrop per community step */}
              {(() => {
                const emojiMap: Record<string, string> = {
                  "Cabinet Cloud": "☁️",
                };
                const emoji = emojiMap[communityStep.eyebrow];
                if (!emoji) return null;
                return (
                  <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
                    {[
                      { top: "-5%", left: "-8%", duration: "34s", delay: "-8s", opacity: 0.45, reverse: false },
                      { top: "5%", left: "55%", duration: "42s", delay: "-17s", opacity: 0.4, reverse: true },
                      { top: "40%", left: "-5%", duration: "38s", delay: "-12s", opacity: 0.38, reverse: true },
                      { top: "50%", left: "60%", duration: "46s", delay: "-22s", opacity: 0.4, reverse: false },
                      { top: "75%", left: "20%", duration: "40s", delay: "-5s", opacity: 0.35, reverse: false },
                    ].map((cloud, i) => (
                      <div
                        key={i}
                        className={`waitlist-cloud-row absolute ${cloud.reverse ? "waitlist-cloud-row-reverse" : ""}`}
                        style={{
                          top: cloud.top,
                          insetInlineStart: cloud.left,
                          opacity: cloud.opacity,
                          ["--cloud-row-duration" as string]: cloud.duration,
                          animationDelay: cloud.delay,
                        }}
                      >
                        <span
                          className={`select-none leading-none ${
                            communityStep.eyebrow === "Cabinet Cloud"
                              ? "text-[280px] sm:text-[400px]"
                              : "text-[180px] sm:text-[260px]"
                          }`}
                          style={{ filter: "drop-shadow(0 18px 26px rgba(214,194,160,0.22))" }}
                        >
                          {emoji}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div
                className="relative z-10 rounded-2xl p-5 sm:p-6"
                style={{
                  border: `1px solid ${WEB.border}`,
                  background: communityStep.eyebrow === "Cabinet Cloud"
                    ? `linear-gradient(180deg, rgba(252,249,244,0.96), rgba(247,241,232,0.94))`
                    : WEB.bgCard,
                  boxShadow: "0 1px 3px rgba(59, 47, 47, 0.04), 0 8px 30px rgba(59, 47, 47, 0.04)",
                }}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <h2
                        className="font-logo text-xl tracking-tight italic"
                        style={{ color: WEB.text }}
                      >
                        {communityStep.title}
                      </h2>
                      <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
                        {communityStep.description}
                      </p>
                      {communityStep.aside && (
                        <p className="text-sm leading-relaxed" style={{ color: WEB.textSecondary }}>
                          {communityStep.aside}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Big CTA buttons — same style across all community steps */}
                {isGitHubCommunityStep && (
                  <div className="pt-6">
                    <a
                      href={GITHUB_REPO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-between gap-4 rounded-full px-5 py-5 sm:px-6 sm:py-6 transition-all hover:-translate-y-0.5"
                      style={{ background: WEB.accentBg, border: `1px solid ${WEB.border}` }}
                    >
                      <span className="flex min-w-0 items-center gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full shadow-sm" style={{ background: WEB.bgCard }}>
                          <Star className="size-5 fill-current" style={{ color: WEB.accent }} />
                        </span>
                        <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                          <span className="truncate text-base font-semibold sm:text-lg" style={{ color: WEB.text }}>{t("tinyExtras:starOnGithub")}</span>
                          <span className="text-sm" style={{ color: WEB.textSecondary }}>{t("tinyExtras:helpMoreFind")}</span>
                        </span>
                      </span>
                      <span className="hidden shrink-0 rounded-full px-3 py-1 text-sm font-semibold sm:inline-flex" style={{ background: WEB.bgWarm, color: WEB.accent }}>
                        {starsLabel}
                      </span>
                    </a>
                  </div>
                )}

                {communityStep.eyebrow === "Discord" && (
                  <div className="pt-6">
                    <a
                      href={DISCORD_SUPPORT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-between gap-4 rounded-full px-5 py-5 sm:px-6 sm:py-6 transition-all hover:-translate-y-0.5"
                      style={{ background: "#ECEAFD", border: "1px solid #D8D4F7" }}
                    >
                      <span className="flex min-w-0 items-center gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full shadow-sm" style={{ background: WEB.bgCard }}>
                          <DiscordIcon className="size-5" style={{ color: "#5865F2" }} />
                        </span>
                        <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                          <span className="truncate text-base font-semibold sm:text-lg" style={{ color: WEB.text }}>{t("tinyExtras:joinDiscord")}</span>
                          <span className="text-sm" style={{ color: WEB.textSecondary }}>{t("tinyExtras:chatWithBuilders")}</span>
                        </span>
                      </span>
                      <span className="hidden shrink-0 rounded-full px-3 py-1 text-sm font-semibold sm:inline-flex" style={{ background: "#D8D4F7", color: "#5865F2" }}>
                        {t("onboarding:discord.joinBadge")}
                      </span>
                    </a>
                  </div>
                )}

                {communityStep.eyebrow === "Cabinet Cloud" && (
                  <div className="pt-6">
                    <div
                      className="flex w-full flex-col gap-3 rounded-3xl px-5 py-5 sm:px-6 sm:py-6"
                      style={{ background: WEB.accentBg, border: `1px solid ${WEB.border}` }}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full shadow-sm" style={{ background: WEB.bgCard }}>
                          <Cloud className="size-5" style={{ color: WEB.accent }} />
                        </span>
                        <div className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                          <span className="truncate text-base font-semibold sm:text-lg" style={{ color: WEB.text }}>{t("tinyExtras:joinWaitlist")}</span>
                          <span className="text-sm" style={{ color: WEB.textSecondary }}>{t("onboarding:cloud.waitlistSubtitle")}</span>
                        </div>
                      </div>
                      {cloudStatus === "success" || cloudStatus === "already" ? (
                        <div
                          className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm"
                          style={{ background: WEB.bgCard, border: `1px solid ${WEB.border}`, color: WEB.text }}
                        >
                          <CheckCircle2 className="size-4 shrink-0" style={{ color: WEB.accent }} />
                          <span>
                            {cloudStatus === "already"
                              ? t("onboarding:cloud.alreadyOnList")
                              : t("onboarding:cloud.onList")}
                          </span>
                        </div>
                      ) : (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void handleCloudSubmit();
                          }}
                          className="flex flex-col gap-2 sm:flex-row"
                        >
                          <input
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            placeholder={t("tinyExtras:emailPlaceholder")}
                            value={cloudEmail}
                            onChange={(e) => handleCloudInput(e.target.value)}
                            disabled={cloudStatus === "submitting"}
                            className="flex-1 rounded-full px-4 text-sm outline-none"
                            style={{
                              background: WEB.bgCard,
                              border: `1px solid ${cloudStatus === "error" ? "#dc2626" : WEB.border}`,
                              color: WEB.text,
                              height: 44,
                              fontFamily: "inherit",
                            }}
                          />
                          <button
                            type="submit"
                            disabled={cloudStatus === "submitting" || cloudEmail.trim().length === 0}
                            className="inline-flex items-center justify-center gap-2 rounded-full px-6 text-sm font-medium text-white transition-all disabled:opacity-60"
                            style={{ background: WEB.accent, height: 44, minWidth: 130 }}
                          >
                            {cloudStatus === "submitting" ? (
                              <>
                                <Loader2 className="size-4 animate-spin" />
                                {t("onboarding:cloud.sending")}
                              </>
                            ) : (
                              <>
                                {t("onboarding:cloud.joinWaitlist")}
                                <ArrowRight className="size-3.5 rtl:rotate-180" />
                              </>
                            )}
                          </button>
                        </form>
                      )}
                      {cloudStatus === "error" && (
                        <div className="text-xs" style={{ color: "#dc2626" }}>
                          {t("onboarding:cloud.error")}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep(step - 1)}
                  className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: WEB.textSecondary }}
                >
                  <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                  {t("onboarding:actions.back")}
                </button>
                {step < COMMUNITY_END_STEP ? (
                  <button
                    onClick={() => setStep(step + 1)}
                    disabled={launching}
                    className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5"
                    style={{ background: WEB.accent }}
                  >
                    {communityStep.nextLabel}
                    <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                  </button>
                ) : (
                  <button
                    onClick={() => setStep(COMMUNITY_END_STEP + 1)}
                    className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5"
                    style={{ background: WEB.accent }}
                  >
                    {t("onboarding:actions.next")}
                    <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 7: Launch — Summary + data directory */}
          {step === COMMUNITY_END_STEP + 1 && (
            <div className="mx-auto flex max-w-4xl flex-col gap-6 animate-in fade-in duration-300">
              <div className="text-center space-y-2">
                <h1 className="font-logo text-2xl tracking-tight italic">
                  <Trans
                    i18nKey="onboarding:launchHeading"
                    components={{ accent: <span style={{ color: WEB.accent }} /> }}
                  />
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
                    <h2 className="font-logo text-xl tracking-tight italic" style={{ color: WEB.text }}>
                      {answers.workspaceName || t("onboarding:launch.defaultCabinetName")}
                    </h2>
                    <p
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: WEB.textTertiary }}
                    >
                      {answers.description || t("onboarding:launch.defaultDescription")}
                    </p>
                  </div>

                  <div
                    className="h-px w-full"
                    style={{ background: WEB.borderLight }}
                  />

                  {/* Knowledge base — animated file tree */}
                  <div className="space-y-1.5">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: WEB.textTertiary }}
                    >
                      {t("onboarding:launch.knowledgeBaseLabel")}
                    </p>
                    <LaunchKbTree cabinetName={answers.workspaceName} />
                  </div>

                  {/* AI team */}
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: WEB.textTertiary }}
                  >
                    {t("onboarding:launch.aiTeamLabel")}
                  </p>
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
                      agents={demoAgents}
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
                  {t("onboarding:launch.beforeYouLaunch")}
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-3">
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full"
                      style={{ background: WEB.textTertiary }}
                      aria-hidden
                    />
                    <span style={{ color: WEB.textSecondary }}>
                      <Trans
                        i18nKey="onboarding:launch.disclaimerAccess"
                        components={{
                          strong: <strong className="font-medium" style={{ color: WEB.text }} />,
                          flag: (
                            <code
                              className="rounded px-1 py-0.5 text-[11px]"
                              style={{ background: WEB.bgWarm, color: WEB.text }}
                            />
                          ),
                        }}
                      />
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full"
                      style={{ background: WEB.textTertiary }}
                      aria-hidden
                    />
                    <span style={{ color: WEB.textSecondary }}>
                      <Trans
                        i18nKey="onboarding:launch.disclaimerBackup"
                        components={{
                          strong: <strong className="font-medium" style={{ color: WEB.text }} />,
                        }}
                      />
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full"
                      style={{ background: WEB.textTertiary }}
                      aria-hidden
                    />
                    <span style={{ color: WEB.textSecondary }}>
                      <Trans
                        i18nKey="onboarding:launch.disclaimerBeta"
                        components={{
                          strong: <strong className="font-medium" style={{ color: WEB.text }} />,
                        }}
                      />
                    </span>
                  </li>
                </ul>
                <label
                  className="flex cursor-pointer items-start gap-2 pt-1"
                  style={{ color: WEB.text }}
                >
                  <input
                    type="checkbox"
                    name="keep-in-touch"
                    checked={keepInTouch}
                    onChange={(e) => setKeepInTouch(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 rounded"
                    style={{ borderColor: WEB.border, accentColor: WEB.accent }}
                  />
                  <span style={{ color: WEB.textSecondary }}>
                    {t("onboarding:launch.keepInTouch")}
                  </span>
                </label>
                <label
                  className="flex cursor-pointer items-start gap-2"
                  style={{ color: WEB.text }}
                >
                  <input
                    type="checkbox"
                    name="disclaimer-accept"
                    aria-label={t("breakingChanges:iAccept")}
                    checked={disclaimerAccepted}
                    onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 rounded"
                    style={{ borderColor: WEB.border, accentColor: WEB.accent }}
                  />
                  <span>{t("breakingChangesPlus:iUnderstand")}</span>
                </label>
                <p
                  className="text-[11px]"
                  style={{ color: WEB.textTertiary }}
                >
                  <Trans
                    i18nKey="onboarding:launch.legalNotice"
                    components={{
                      terms: (
                        <a
                          href="https://runcabinet.com/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2"
                          style={{ color: WEB.textSecondary }}
                        />
                      ),
                      privacy: (
                        <a
                          href="https://runcabinet.com/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2"
                          style={{ color: WEB.textSecondary }}
                        />
                      ),
                      oss: (
                        <a
                          href="https://github.com/cabinetai/cabinet"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2"
                          style={{ color: WEB.textSecondary }}
                        />
                      ),
                    }}
                  />
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep(COMMUNITY_END_STEP)}
                  className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: WEB.textSecondary }}
                >
                  <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                  {t("onboarding:actions.back")}
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
                      {t("onboarding:launch.settingUp")}
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4" />
                      {t("onboarding:launch.launchCabinet")}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

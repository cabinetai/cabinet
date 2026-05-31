"use client";

import { KeyRound, Lock, Bot, Calendar, Image as ImageIcon } from "lucide-react";
import { TOUR_PALETTE as P } from "@/components/onboarding/tour/palette";
import { DemoSlideShell, type DemoConfig } from "../demo-modal";
import { useLocale } from "@/i18n/use-locale";

interface KeyRow {
  preset: string;
  envVar: string;
  lastFour: string;
}

const KEYS: KeyRow[] = [
  { preset: "OpenAI", envVar: "OPENAI_API_KEY", lastFour: "x9aF" },
  { preset: "Anthropic", envVar: "ANTHROPIC_API_KEY", lastFour: "k2Tn" },
  { preset: "GitHub", envVar: "GITHUB_TOKEN", lastFour: "7Jp4" },
];

/**
 * Small footnote that demotes developer-flavored details below the
 * main human-readable description. Renders inline (lives inside <p>),
 * but visually breaks to its own line.
 */
function DevFootnote({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  return (
    <span
      className="font-mono text-[11.5px] leading-relaxed"
      style={{
        display: "block",
        marginTop: 14,
        paddingTop: 10,
        borderTop: `1px dashed ${P.border}`,
        color: P.textTertiary,
      }}
    >
      <span style={{ color: P.accentWarm, fontWeight: 600 }}>
        {"// "}for developers ·{" "}
      </span>
      {children}
    </span>
  );
}

/* ── Slide 1: Plug in your AI accounts ──────────────────────────────── */

function SlideSetOnce() {
  const { t } = useLocale();
  return (
    <DemoSlideShell
      title={
        <>
          Plug in your <span style={{ color: P.accent }}>{t("demosExtras:aiAccounts")}</span>.
        </>
      }
      description={
        <>
          Pick a provider, paste your key, save. Cabinet remembers it so every
          task you run uses <em>your</em> account — you pay your own bills, use
          your own quota, no middleman.
          <DevFootnote>
            stored in{" "}
            <code style={{ background: P.paperWarm, padding: "0 4px", borderRadius: 3 }}>
              .cabinet.env
            </code>{" "}
            at the project root · mode 0600 · gitignored · plaintext never
            round-trips through the UI (only the last four show).
          </DevFootnote>
        </>
      }
    >
      <div
        className="rounded-2xl"
        style={{
          width: 420,
          background: P.bgCard,
          border: `1px solid ${P.border}`,
          boxShadow: "0 14px 32px -16px rgba(59,47,47,0.18)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <KeyRound className="h-3.5 w-3.5" style={{ color: P.textSecondary }} />
          <span className="text-[12.5px] font-semibold" style={{ color: P.text }}>
            Your AI accounts
          </span>
          <span
            className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
            style={{ background: P.accentBg, color: P.accentWarm }}
          >
            <Lock className="h-2.5 w-2.5" />
            saved locally
          </span>
        </div>

        {/* Rows */}
        <div className="divide-y" style={{ borderColor: P.borderLight }}>
          {KEYS.map((k, i) => (
            <div
              key={k.envVar}
              className="flex items-center gap-3 px-4 py-2.5 opacity-0"
              style={{
                animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                animationDelay: `${250 + i * 130}ms`,
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold" style={{ color: P.text }}>
                  {k.preset}
                </p>
                <p
                  className="text-[10px] font-mono"
                  style={{ color: P.textTertiary }}
                >
                  {k.envVar}
                </p>
              </div>
              <span
                className="font-mono text-[11.5px]"
                style={{ color: P.textSecondary, letterSpacing: 1 }}
              >
                ••••{k.lastFour}
              </span>
            </div>
          ))}
        </div>

        {/* File path footer */}
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{
            background: P.paperWarm,
            borderTop: `1px solid ${P.border}`,
            borderRadius: "0 0 16px 16px",
          }}
        >
          <span
            className="font-mono text-[10px]"
            style={{ color: P.textTertiary }}
          >
            ~/cabinet/.cabinet.env
          </span>
        </div>
      </div>
    </DemoSlideShell>
  );
}

/* ── Slide 2: Every agent uses them ──────────────────────────────────── */

function SlideUsedEverywhere() {
  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Every agent <span style={{ color: P.accent }}>just uses them</span>.
        </>
      }
      description={
        <>
          Once a key is saved, every agent and skill in Cabinet picks it up on
          its own. No copy-pasting into each task, no hunting for it later — it
          just works.
          <DevFootnote>
            merged into every CLI subprocess at spawn (Claude, Codex, Gemini
            adapters · PTY sessions · skill scripts) · shell-supplied env still
            wins, so debug overrides Just Work · no shell rc edits.
          </DevFootnote>
        </>
      }
    >
      <div className="space-y-2" style={{ width: 420 }}>
        {/* Top: env file */}
        <div
          className="rounded-xl px-4 py-3 opacity-0"
          style={{
            background: P.bgCard,
            border: `1px solid ${P.border}`,
            animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
            animationDelay: "200ms",
          }}
        >
          <p
            className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider"
            style={{ color: P.textTertiary }}
          >
            Your saved keys
          </p>
          <p className="font-mono text-[11px]" style={{ color: P.textSecondary }}>
            OPENAI_API_KEY=••••x9aF
            <br />
            GITHUB_TOKEN=••••7Jp4
          </p>
        </div>

        {/* Arrow line */}
        <div className="flex justify-center py-1">
          <span className="text-[16px]" style={{ color: P.accent }}>
            ↓
          </span>
        </div>

        {/* Bottom: spawned children — friendly labels */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <Bot className="h-3 w-3" />, label: "Editor agent" },
            { icon: <Calendar className="h-3 w-3" />, label: "Calendar agent" },
            { icon: <ImageIcon className="h-3 w-3" />, label: "Image skill" },
          ].map((c, i) => (
            <div
              key={c.label}
              className="rounded-lg px-2 py-2.5 text-center opacity-0"
              style={{
                background: P.accentBg,
                border: `1px solid ${P.borderDark}`,
                animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                animationDelay: `${600 + i * 130}ms`,
              }}
            >
              <div
                className="mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full"
                style={{ background: P.bgCard, color: P.accent }}
              >
                {c.icon}
              </div>
              <p className="text-[10.5px] font-semibold" style={{ color: P.accentWarm }}>
                {c.label}
              </p>
              <p className="mt-0.5 text-[9px]" style={{ color: P.textSecondary }}>
                uses your key
              </p>
            </div>
          ))}
        </div>
      </div>
    </DemoSlideShell>
  );
}

export function buildApiKeysDemo(): DemoConfig {
  return {
    id: "api-keys",
    ariaLabel: "API Keys — guided demo",
    slides: [
      { id: "set-once", render: () => <SlideSetOnce /> },
      { id: "used-everywhere", render: () => <SlideUsedEverywhere /> },
    ],
  };
}

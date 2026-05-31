"use client";

import {
  Brain,
  Check,
  ChevronDown,
  Cpu,
  KeyRound,
  Sparkles,
  Zap,
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

interface Provider {
  name: string;
  models: string;
  swatch: string;
  installed?: boolean;
}

const PROVIDERS: Provider[] = [
  { name: "Claude", models: "Sonnet · Opus · Haiku", swatch: "#CC785C", installed: true },
  { name: "GPT-5", models: "Pro · Standard · Mini", swatch: "#10A37F", installed: true },
  { name: "Gemini", models: "2.5 Pro · Flash", swatch: "#4285F4", installed: true },
  { name: "Grok", models: "4 · 4 mini", swatch: "#000000", installed: true },
  { name: "Codex", models: "GPT-5-Codex · o4", swatch: "#FF9900" },
  { name: "Cursor", models: "Auto · Composer", swatch: "#7C3AED" },
];

/* ── Slide 1: Bring what you already pay for ─────────────────────────── */
function SlideBring() {
  return (
    <DemoSlideShell
      title={
        <>
          Bring what you <span style={{ color: P.accent }}>already pay for</span>.
        </>
      }
      description={
        <>
          Cabinet doesn&apos;t add another subscription. Plug in the providers
          you already use — Claude, GPT, Gemini, Grok, Codex, Cursor — and
          your tokens stay yours.
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2" style={{ width: 380 }}>
        {PROVIDERS.map((p, i) => (
          <div
            key={p.name}
            className="flex items-center gap-3 rounded-xl px-3 py-3 opacity-0"
            style={{
              background: P.bgCard,
              border: `1px solid ${p.installed ? P.borderDark : P.borderLight}`,
              opacity: p.installed ? undefined : 0.85,
              animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
              animationDelay: `${300 + i * 100}ms`,
            }}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{
                background: p.swatch,
                color: "#FFFFFF",
              }}
            >
              <Cpu className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11.5px] font-semibold" style={{ color: P.text }}>
                  {p.name}
                </span>
                {p.installed && (
                  <Check className="h-2.5 w-2.5" style={{ color: "#5A9E7B" }} />
                )}
              </div>
              <div className="text-[9px] truncate" style={{ color: P.textTertiary }}>
                {p.models}
              </div>
            </div>
          </div>
        ))}
      </div>
    </DemoSlideShell>
  );
}

/* ── Slide 2: Per agent, per task ────────────────────────────────────── */
function SlidePerAgent() {
  const agents = [
    { name: "Researcher", provider: "Claude", model: "Opus", reason: "long-form synthesis", swatch: "#CC785C" },
    { name: "Writer", provider: "GPT-5", model: "Pro", reason: "punchy copy", swatch: "#10A37F" },
    { name: "Engineer", provider: "Codex", model: "GPT-5-Codex", reason: "code edits", swatch: "#FF9900" },
    { name: "Analyst", provider: "Gemini", model: "2.5 Pro", reason: "deep reasoning", swatch: "#4285F4" },
  ];

  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Per agent, <span style={{ color: P.accent }}>per task</span>.
        </>
      }
      description={
        <>
          Pick a default brain per agent — the writer gets GPT, the engineer
          gets Codex, the analyst gets Gemini. Or override on any single task
          when the job calls for it.
        </>
      }
    >
      <CardChrome width={400}>
        <div
          className="flex items-center gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <Brain className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[12px] font-semibold" style={{ color: P.text }}>
            Default brains
          </span>
          <span
            className="ml-auto text-[9.5px]"
            style={{ color: P.textTertiary }}
          >
            override per task
          </span>
        </div>

        <div className="space-y-1.5 px-3 py-3">
          {agents.map((a, i) => (
            <div
              key={a.name}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 opacity-0"
              style={{
                background: P.paperWarm,
                border: `1px solid ${P.borderLight}`,
                animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                animationDelay: `${300 + i * 130}ms`,
              }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-md shrink-0"
                style={{ background: P.bgCard, border: `1px solid ${P.borderLight}` }}
              >
                <Sparkles className="h-3 w-3" style={{ color: P.accent }} />
              </span>
              <span className="text-[11px] font-semibold" style={{ color: P.text }}>
                {a.name}
              </span>
              <span
                className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1"
                style={{
                  background: P.bgCard,
                  border: `1px solid ${P.borderLight}`,
                }}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: a.swatch }}
                />
                <span className="text-[10px] font-semibold" style={{ color: P.text }}>
                  {a.provider}
                </span>
                <span className="text-[9px]" style={{ color: P.textTertiary }}>
                  {a.model}
                </span>
                <ChevronDown className="h-2.5 w-2.5" style={{ color: P.textTertiary }} />
              </span>
            </div>
          ))}
        </div>

        <div
          className="px-4 py-2.5 text-[10px] italic opacity-0"
          style={{
            color: P.textTertiary,
            borderTop: `1px solid ${P.borderLight}`,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "1100ms",
          }}
        >
          On any task, the runtime picker lets you override these defaults.
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 3: Your keys, your tokens ─────────────────────────────────── */
function SlideKeys() {
  return (
    <DemoSlideShell
      title={
        <>
          Your keys, <span style={{ color: P.accent }}>your tokens</span>.
        </>
      }
      description={
        <>
          API keys live on your machine. Tokens go straight from your
          provider to your wallet — Cabinet never proxies, never marks up,
          never sees the conversation. Works with Claude Code subscriptions
          too, no API key required.
        </>
      }
    >
      <CardChrome width={400}>
        <div className="flex items-center gap-2 px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${P.border}` }}>
          <KeyRound className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[12px] font-semibold" style={{ color: P.text }}>
            Providers
          </span>
        </div>

        <div className="px-3 py-3 space-y-1.5">
          {[
            { name: "Claude", swatch: "#CC785C", auth: "Subscription · Claude Code", live: true },
            { name: "GPT-5", swatch: "#10A37F", auth: "API key · sk-…3f9a", live: true },
            { name: "Gemini", swatch: "#4285F4", auth: "API key · AIza…7K2x", live: true },
            { name: "Grok", swatch: "#000000", auth: "API key · xai-…b14e", live: true },
            { name: "Codex", swatch: "#FF9900", auth: "Subscription · ChatGPT Plus", live: false },
          ].map((p, i) => (
            <div
              key={p.name}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 opacity-0"
              style={{
                background: P.paperWarm,
                border: `1px solid ${P.borderLight}`,
                animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                animationDelay: `${300 + i * 130}ms`,
              }}
            >
              <span
                className="h-6 w-6 rounded-md shrink-0 flex items-center justify-center"
                style={{ background: p.swatch, color: "#FFFFFF" }}
              >
                <Zap className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold" style={{ color: P.text }}>
                  {p.name}
                </div>
                <div className="font-mono text-[9.5px]" style={{ color: P.textTertiary }}>
                  {p.auth}
                </div>
              </div>
              {p.live ? (
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
              ) : (
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-semibold"
                  style={{
                    background: P.bgCard,
                    border: `1px solid ${P.borderLight}`,
                    color: P.textTertiary,
                  }}
                >
                  Connect
                </span>
              )}
            </div>
          ))}
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

export function buildByoaiDemo(): DemoConfig {
  return {
    id: "byoai",
    ariaLabel: "BYOAI — bring your own AI — guided demo",
    slides: [
      { id: "bring", render: () => <SlideBring /> },
      { id: "per-agent", render: () => <SlidePerAgent /> },
      { id: "keys", render: () => <SlideKeys /> },
    ],
  };
}

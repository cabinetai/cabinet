"use client";

import { Archive, Check, Moon, Palette, Sun } from "lucide-react";
import { TOUR_PALETTE as P } from "@/components/onboarding/tour/palette";
import { DemoSlideShell, type DemoConfig } from "../demo-modal";

interface ThemePreview {
  name: string;
  bg: string;
  fg: string;
  accent: string;
  border: string;
  type: "light" | "dark";
}

const THEMES: ThemePreview[] = [
  { name: "Claude", bg: "#1F1A17", fg: "#EFE0CF", accent: "#CC785C", border: "#3A2E26", type: "dark" },
  { name: "Paper", bg: "#FAF6F1", fg: "#3B2F2F", accent: "#8B5E3C", border: "#E8DDD0", type: "light" },
  { name: "White", bg: "#FFFFFF", fg: "#222222", accent: "#737373", border: "#E5E5E5", type: "light" },
  { name: "Black", bg: "#0E0E10", fg: "#E5E5E5", accent: "#9CA3AF", border: "#2A2A2D", type: "dark" },
  { name: "Aurora", bg: "#0F1729", fg: "#E0E7FF", accent: "#A78BFA", border: "#252F4F", type: "dark" },
  { name: "Ember", bg: "#1A0E0A", fg: "#FFD8B5", accent: "#F97316", border: "#3A1F12", type: "dark" },
  { name: "Forest", bg: "#0F1A14", fg: "#D1E7D5", accent: "#22C55E", border: "#1F3328", type: "dark" },
  { name: "Sakura", bg: "#FFF5F7", fg: "#5C2C3C", accent: "#EC4899", border: "#FCD7E0", type: "light" },
  { name: "Cyber", bg: "#080814", fg: "#A4F8C0", accent: "#22D3EE", border: "#1F1F38", type: "dark" },
];

/* ── Slide 1: Pick a vibe ─────────────────────────────────────────────── */
function SlidePickVibe() {
  return (
    <DemoSlideShell
      title={
        <>
          Pick a <span style={{ color: P.accent }}>vibe</span>.
        </>
      }
      description={
        <>
          Cabinet ships with curated themes — a quiet Paper, a moody Claude,
          a bright Aurora, a focused Forest. Same product, your aesthetic.
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2" style={{ width: 380 }}>
        {THEMES.map((t, i) => (
          <div
            key={t.name}
            className="overflow-hidden rounded-xl opacity-0"
            style={{
              background: t.bg,
              border: `1px solid ${t.border}`,
              animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
              animationDelay: `${250 + i * 80}ms`,
              boxShadow:
                t.type === "dark"
                  ? "0 6px 16px -10px rgba(0,0,0,0.4)"
                  : "0 6px 16px -10px rgba(59,47,47,0.2)",
            }}
          >
            {/* Mini chrome */}
            <div
              className="flex items-center gap-1 px-2 py-1.5"
              style={{ borderBottom: `1px solid ${t.border}` }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: t.accent }}
              />
              <span className="text-[8.5px]" style={{ color: t.fg, opacity: 0.7 }}>
                Cabinet
              </span>
            </div>
            {/* Body lines */}
            <div className="space-y-1 px-2 py-2">
              <div
                className="h-1 rounded-full"
                style={{ width: "60%", background: t.fg, opacity: 0.85 }}
              />
              <div
                className="h-0.5 rounded-full"
                style={{ width: "85%", background: t.fg, opacity: 0.4 }}
              />
              <div
                className="h-0.5 rounded-full"
                style={{ width: "70%", background: t.fg, opacity: 0.4 }}
              />
              <div
                className="mt-1 h-3 w-12 rounded-full px-1"
                style={{ background: t.accent }}
              />
            </div>
            {/* Label */}
            <div
              className="flex items-center justify-between px-2 py-1.5"
              style={{ borderTop: `1px solid ${t.border}` }}
            >
              <span
                className="text-[9.5px] font-semibold"
                style={{ color: t.fg }}
              >
                {t.name}
              </span>
              {t.type === "dark" ? (
                <Moon className="h-2.5 w-2.5" style={{ color: t.fg, opacity: 0.6 }} />
              ) : (
                <Sun className="h-2.5 w-2.5" style={{ color: t.fg, opacity: 0.6 }} />
              )}
            </div>
          </div>
        ))}
      </div>
    </DemoSlideShell>
  );
}

/* ── Slide 2: Light or dark ──────────────────────────────────────────── */
function SlideLightDark() {
  const lights = THEMES.filter((t) => t.type === "light").slice(0, 3);
  const darks = THEMES.filter((t) => t.type === "dark").slice(0, 3);

  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Light or <span style={{ color: P.accent }}>dark</span>.
        </>
      }
      description={
        <>
          Bright papers for the morning, deep canvases for late nights. Auto
          syncs with your OS, or pin one and forget about it.
        </>
      }
    >
      <div className="space-y-3" style={{ width: 380 }}>
        {/* Light row */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sun className="h-3 w-3" style={{ color: P.accent }} />
            <span
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: P.textTertiary }}
            >
              Light
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {lights.map((t, i) => (
              <ThemeChip key={t.name} theme={t} delay={300 + i * 100} />
            ))}
          </div>
        </div>

        {/* Dark row */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <Moon className="h-3 w-3" style={{ color: P.accent }} />
            <span
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: P.textTertiary }}
            >
              Dark
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {darks.map((t, i) => (
              <ThemeChip key={t.name} theme={t} delay={700 + i * 100} />
            ))}
          </div>
        </div>
      </div>
    </DemoSlideShell>
  );
}

function ThemeChip({ theme, delay }: { theme: ThemePreview; delay: number }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg p-2 opacity-0"
      style={{
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
        animationDelay: `${delay}ms`,
      }}
    >
      <span
        className="h-3 w-3 rounded-full shrink-0"
        style={{ background: theme.accent }}
      />
      <span className="text-[10px] font-semibold" style={{ color: theme.fg }}>
        {theme.name}
      </span>
    </div>
  );
}

/* ── Slide 3: Same product, your skin ────────────────────────────────── */
function SlideSameProduct() {
  return (
    <DemoSlideShell
      title={
        <>
          Same product, <span style={{ color: P.accent }}>your skin</span>.
        </>
      }
      description={
        <>
          Themes are skin-deep — the agents, the data, the routines stay
          exactly where you left them. Switch back any time.
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3" style={{ width: 420 }}>
        <ThemedSidebar theme={THEMES[1]} delay={300} selected />
        <ThemedSidebar theme={THEMES[0]} delay={650} />
      </div>
    </DemoSlideShell>
  );
}

function ThemedSidebar({ theme, delay, selected }: { theme: ThemePreview; delay: number; selected?: boolean }) {
  return (
    <div
      className="overflow-hidden rounded-xl opacity-0"
      style={{
        background: theme.bg,
        border: `2px solid ${selected ? theme.accent : theme.border}`,
        animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
        animationDelay: `${delay}ms`,
        boxShadow: theme.type === "dark"
          ? "0 12px 28px -16px rgba(0,0,0,0.55)"
          : "0 12px 28px -16px rgba(59,47,47,0.3)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: theme.bg, borderBottom: `1px solid ${theme.border}` }}
      >
        <Archive className="h-3.5 w-3.5" style={{ color: theme.accent }} />
        <span className="text-[10.5px] font-semibold" style={{ color: theme.fg }}>
          Cabinet
        </span>
        {selected && (
          <span
            className="ml-auto flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
            style={{ background: theme.accent, color: theme.bg }}
          >
            <Check className="h-2 w-2" />
            Active
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 px-2 py-2">
        {["Data", "Agents", "Tasks"].map((t, i) => (
          <div
            key={t}
            className="flex flex-col items-center gap-0.5 rounded-md py-2"
            style={{
              background: i === 1 ? theme.accent : theme.border,
              opacity: i === 1 ? 1 : 0.4,
            }}
          >
            <div
              className="h-2 w-2 rounded-full"
              style={{ background: i === 1 ? theme.bg : theme.fg, opacity: i === 1 ? 1 : 0.7 }}
            />
            <span className="text-[7.5px] font-semibold uppercase tracking-wider" style={{ color: i === 1 ? theme.bg : theme.fg }}>
              {t}
            </span>
          </div>
        ))}
      </div>

      {/* Content lines */}
      <div className="space-y-1.5 px-3 pb-3">
        <div
          className="h-1.5 rounded-full"
          style={{ width: "70%", background: theme.fg, opacity: 0.9 }}
        />
        <div
          className="h-1 rounded-full"
          style={{ width: "85%", background: theme.fg, opacity: 0.4 }}
        />
        <div
          className="h-1 rounded-full"
          style={{ width: "60%", background: theme.fg, opacity: 0.4 }}
        />
      </div>

      {/* Theme name footer */}
      <div
        className="flex items-center gap-1 px-3 py-1.5"
        style={{ background: theme.bg, borderTop: `1px solid ${theme.border}` }}
      >
        <Palette className="h-2.5 w-2.5" style={{ color: theme.accent }} />
        <span className="text-[9px] font-semibold" style={{ color: theme.fg }}>
          {theme.name}
        </span>
      </div>
    </div>
  );
}

export function buildThemesDemo(): DemoConfig {
  return {
    id: "themes",
    ariaLabel: "Themes — guided demo",
    slides: [
      { id: "vibe", render: () => <SlidePickVibe /> },
      { id: "light-dark", render: () => <SlideLightDark /> },
      { id: "same-product", render: () => <SlideSameProduct /> },
    ],
  };
}

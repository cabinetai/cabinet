"use client";

import { TOUR_PALETTE as P } from "@/components/onboarding/tour/palette";
import { DemoSlideShell, type DemoConfig } from "../demo-modal";
import { useLocale } from "@/i18n/use-locale";

/* ─── shared kbd chip ─────────────────────────────────────────────────── */
function Kbd({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  return (
    <kbd
      className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold leading-none"
      style={{
        background: P.paperWarm,
        border: `1px solid ${P.borderDark}`,
        color: P.text,
        boxShadow: `0 1px 0 ${P.borderDark}`,
      }}
    >
      {children}
    </kbd>
  );
}

function Row({
  keys,
  label,
  delay,
}: {
  keys: React.ReactNode[];
  label: string;
  delay: number;
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-lg px-3 py-2 opacity-0"
      style={{
        background: P.bgCard,
        border: `1px solid ${P.borderLight}`,
        animation: "cabinet-tour-fade-up 0.3s ease-out forwards",
        animationDelay: `${delay}ms`,
      }}
    >
      <span className="text-[12px]" style={{ color: P.textSecondary }}>
        {label}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {keys.map((k, i) => (
          <Kbd key={i}>{k}</Kbd>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-1.5 mt-3 first:mt-0 px-1 text-[9.5px] font-semibold uppercase tracking-[0.14em]"
      style={{ color: P.textTertiary }}
    >
      {children}
    </div>
  );
}

/* ─── Slide 1: Global shortcuts ─────────────────────────────────────── */
const MOD = "⌘";

function SlideGlobal() {
  const { t } = useLocale();
  const rows: { keys: React.ReactNode[]; label: string }[] = [
    { keys: [`${MOD}⌥T`], label: "Add task to Inbox" },
    { keys: [`${MOD}⌥R`], label: "Run task now" },
    { keys: [`${MOD}K`], label: "Open search palette" },
    { keys: ["/"], label: "Open search (when idle)" },
    { keys: [`${MOD}S`], label: "Force-save page" },
    { keys: [`${MOD}⌥G`], label: "Toggle Agents view" },
    { keys: [`${MOD}⌥A`], label: "Toggle AI panel" },
    { keys: ["Ctrl`"], label: "Toggle terminal" },
    { keys: [`${MOD}1`], label: "Sidebar → Data" },
    { keys: [`${MOD}2`], label: "Sidebar → Agents" },
    { keys: [`${MOD}3`], label: "Sidebar → Tasks" },
    { keys: [`${MOD}⇧.`], label: "Show / hide hidden files" },
  ];

  return (
    <DemoSlideShell
      title={
        <>
          Navigate{" "}
          <span style={{ color: P.accent }}>fast</span>.
        </>
      }
      description="Global shortcuts work from any surface — editor, agents, tasks, terminal. No hunting through menus."
    >
      <div style={{ width: 360 }} className="space-y-1">
        <SectionLabel>{t("demos:global")}</SectionLabel>
        {rows.map((r, i) => (
          <Row key={i} keys={r.keys} label={r.label} delay={280 + i * 60} />
        ))}
      </div>
    </DemoSlideShell>
  );
}

/* ─── Slide 2: Editor shortcuts ─────────────────────────────────────── */
function SlideEditor() {
  const { t } = useLocale();
  const rows: { keys: React.ReactNode[]; label: string }[] = [
    { keys: ["/"], label: "Open slash command menu" },
    { keys: [`${MOD}E`], label: "Add / edit link" },
    { keys: [`${MOD}B`], label: "Bold" },
    { keys: [`${MOD}I`], label: "Italic" },
    { keys: [`${MOD}⌥↑`, `${MOD}⌥↓`], label: "Move block up / down" },
    { keys: ["Alt⇧↑", "Alt⇧↓"], label: "Move block (alternative)" },
  ];

  const slashRows: { trigger: string; result: string }[] = [
    { trigger: "/h1", result: "Heading 1" },
    { trigger: "/code", result: "Code block" },
    { trigger: "/table", result: "Table" },
    { trigger: "/todo", result: "Checklist" },
    { trigger: "/callout", result: "Callout box" },
  ];

  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Editor{" "}
          <span style={{ color: P.accent }}>shortcuts</span>.
        </>
      }
      description="The slash menu is the fastest way to insert any block type. Keyboard shortcuts cover formatting, links, and block reordering."
    >
      <div className="flex gap-3" style={{ width: 420 }}>
        {/* keyboard shortcuts */}
        <div className="flex-1 space-y-1">
          <SectionLabel>{t("demos:editor")}</SectionLabel>
          {rows.map((r, i) => (
            <Row key={i} keys={r.keys} label={r.label} delay={280 + i * 60} />
          ))}
        </div>

        {/* slash commands */}
        <div style={{ width: 140 }} className="space-y-1">
          <SectionLabel>{t("demos:slashMenu")}</SectionLabel>
          {slashRows.map((r, i) => (
            <div
              key={i}
              className="flex flex-col rounded-lg px-2.5 py-2 opacity-0"
              style={{
                background: P.bgCard,
                border: `1px solid ${P.borderLight}`,
                animation: "cabinet-tour-fade-up 0.3s ease-out forwards",
                animationDelay: `${320 + i * 70}ms`,
              }}
            >
              <Kbd>{r.trigger}</Kbd>
              <span
                className="mt-1 text-[10px]"
                style={{ color: P.textTertiary }}
              >
                {r.result}
              </span>
            </div>
          ))}
        </div>
      </div>
    </DemoSlideShell>
  );
}

/* ─── builder ────────────────────────────────────────────────────────── */
export function buildShortcutsDemo(): DemoConfig {
  return {
    id: "shortcuts",
    ariaLabel: "Keyboard shortcuts — reference",
    slides: [
      { id: "global", render: () => <SlideGlobal /> },
      { id: "editor", render: () => <SlideEditor /> },
    ],
  };
}

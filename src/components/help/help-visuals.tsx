"use client";

import {
  Archive,
  BookOpen,
  Calendar,
  CheckCircle2,
  Cpu,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Music,
  Notebook,
  Palette,
  Plug,
  Sparkles,
  SquareKanban,
  Users,
} from "lucide-react";
import { MockupSidebar } from "@/components/onboarding/tour/mockup-sidebar";
import { TOUR_PALETTE as P } from "@/components/onboarding/tour/palette";

const stage: React.CSSProperties = {
  background: P.paperWarm,
};

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6" style={stage}>
      {children}
    </div>
  );
}

function CardChrome({ children, width = 280 }: { children: React.ReactNode; width?: number }) {
  return (
    <div
      className="rounded-xl"
      style={{
        width,
        background: P.bgCard,
        border: `1px solid ${P.border}`,
        boxShadow: `0 1px 0 rgba(59,47,47,0.04), 0 8px 24px -16px rgba(59,47,47,0.25)`,
      }}
    >
      {children}
    </div>
  );
}

/** Cabinet sidebar mockup — reused for the intro / Meet-your-Cabinet card. */
export function CabinetVisual() {
  return (
    <Stage>
      <div style={{ width: 280 }}>
        <MockupSidebar activeTab={null} title="Cabinet" headerBadge="" hideBody />
      </div>
    </Stage>
  );
}

/** Agents — three stacked agent rows + a tiny org chip. */
export function AgentsVisual() {
  const rows: { icon: typeof Users; name: string; role: string; tint: string }[] = [
    { icon: Users, name: "PM", role: "Lead", tint: "#E8C896" },
    { icon: Users, name: "Editor", role: "Specialist", tint: "#D9B98A" },
    { icon: Users, name: "Librarian", role: "Specialist", tint: "#C9A87A" },
  ];
  return (
    <Stage>
      <CardChrome>
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: P.accent }} />
            <span className="text-[11px] font-semibold tracking-wide" style={{ color: P.text }}>
              Your team
            </span>
          </div>
        </div>
        <div className="space-y-1.5 px-2 pb-3">
          {rows.map((r) => (
            <div
              key={r.name}
              className="flex items-center gap-2 rounded-md px-2 py-1.5"
              style={{ background: P.paperWarm }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full"
                style={{ background: r.tint, color: P.accentWarm }}
              >
                <r.icon className="h-3 w-3" />
              </span>
              <span className="flex-1 text-[11px] font-medium" style={{ color: P.text }}>
                {r.name}
              </span>
              <span className="text-[9px] uppercase tracking-wider" style={{ color: P.textTertiary }}>
                {r.role}
              </span>
            </div>
          ))}
        </div>
      </CardChrome>
    </Stage>
  );
}

/** Task board — 3 mini kanban columns with task chips. */
export function TasksVisual() {
  const columns: { label: string; cards: number; done?: boolean }[] = [
    { label: "Todo", cards: 3 },
    { label: "Doing", cards: 2 },
    { label: "Done", cards: 2, done: true },
  ];
  return (
    <Stage>
      <CardChrome width={300}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <SquareKanban className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: P.text }}>
            Tasks
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 p-2">
          {columns.map((col) => (
            <div
              key={col.label}
              className="rounded-md p-1.5"
              style={{ background: P.paperWarm }}
            >
              <div
                className="mb-1.5 text-[8px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: P.textTertiary }}
              >
                {col.label}
              </div>
              <div className="space-y-1">
                {Array.from({ length: col.cards }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-sm px-1.5 py-1"
                    style={{
                      background: P.bgCard,
                      border: `1px solid ${P.borderLight}`,
                    }}
                  >
                    <div
                      className="h-1 rounded-full"
                      style={{
                        width: `${[60, 80, 50][i % 3]}%`,
                        background: col.done ? P.iconAmberSoft : P.borderDark,
                      }}
                    />
                    <div
                      className="mt-1 h-0.5 rounded-full"
                      style={{
                        width: `${[40, 30, 55][i % 3]}%`,
                        background: P.borderLight,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardChrome>
    </Stage>
  );
}

/** Knowledge base — grid of file-type chips. */
export function KnowledgeVisual() {
  const types: { icon: typeof FileText; label: string }[] = [
    { icon: FileText, label: "MD" },
    { icon: FileSpreadsheet, label: "CSV" },
    { icon: FileText, label: "PDF" },
    { icon: Notebook, label: "IPYNB" },
    { icon: ImageIcon, label: "PNG" },
    { icon: Music, label: "MP3" },
  ];
  return (
    <Stage>
      <CardChrome width={300}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <BookOpen className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: P.text }}>
            Anything goes
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 p-2 pb-3">
          {types.map((t) => (
            <div
              key={t.label}
              className="flex flex-col items-center gap-1 rounded-md py-2.5"
              style={{ background: P.paperWarm, border: `1px solid ${P.borderLight}` }}
            >
              <t.icon className="h-4 w-4" style={{ color: P.accent }} />
              <span className="text-[8px] font-semibold tracking-wider" style={{ color: P.textSecondary }}>
                {t.label}
              </span>
            </div>
          ))}
        </div>
      </CardChrome>
    </Stage>
  );
}

/** Cabinets — nested hierarchy. */
export function CabinetsVisual() {
  return (
    <Stage>
      <div className="flex flex-col gap-2" style={{ width: 280 }}>
        <CabinetRow label="Cabinet" emphasis />
        <div className="ml-5 space-y-1.5">
          <CabinetRow label="Marketing" sub />
          <CabinetRow label="Product" sub />
          <div className="ml-5 space-y-1.5">
            <CabinetRow label="Research" muted />
            <CabinetRow label="Design" muted />
          </div>
        </div>
      </div>
    </Stage>
  );
}

function CabinetRow({
  label,
  emphasis,
  sub,
  muted,
}: {
  label: string;
  emphasis?: boolean;
  sub?: boolean;
  muted?: boolean;
}) {
  const bg = emphasis ? P.bgCard : sub ? P.bgCard : P.paper;
  const border = emphasis ? P.borderDark : P.borderLight;
  const color = muted ? P.textTertiary : sub ? P.textSecondary : P.text;
  return (
    <div
      className="flex items-center gap-2 rounded-md px-2.5 py-1.5"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <Archive
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: emphasis ? P.iconAmber : P.accent, opacity: muted ? 0.6 : 1 }}
      />
      <span className="text-[11px] font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

/** Routines — calendar week + cron entries. */
export function RoutinesVisual() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const active = new Set([0, 2, 4]);
  return (
    <Stage>
      <CardChrome width={280}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <Calendar className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: P.text }}>
            Routines
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1 px-3 pb-2">
          {days.map((d, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1 rounded-md py-1"
              style={{
                background: active.has(i) ? P.accentBg : P.paperWarm,
                border: `1px solid ${P.borderLight}`,
              }}
            >
              <span className="text-[9px] font-semibold" style={{ color: P.textSecondary }}>
                {d}
              </span>
              <span
                className="h-1 w-1 rounded-full"
                style={{ background: active.has(i) ? P.accent : "transparent" }}
              />
            </div>
          ))}
        </div>
        <div className="space-y-1 px-3 pb-3">
          {[
            { cron: "0 9 * * *", label: "Daily review" },
            { cron: "0 18 * * 5", label: "Weekly digest" },
          ].map((r) => (
            <div
              key={r.cron}
              className="flex items-center justify-between rounded-md px-2 py-1.5"
              style={{ background: P.paperWarm }}
            >
              <span className="text-[10px] font-medium" style={{ color: P.text }}>
                {r.label}
              </span>
              <span
                className="font-mono text-[9px] tracking-tight"
                style={{ color: P.textTertiary }}
              >
                {r.cron}
              </span>
            </div>
          ))}
        </div>
      </CardChrome>
    </Stage>
  );
}

/** Conversations & approvals — chat bubble + pending action pill. */
export function ConversationsVisual() {
  return (
    <Stage>
      <CardChrome width={280}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <MessageCircle className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: P.text }}>
            Conversation
          </span>
        </div>
        <div className="space-y-2 px-3 pb-3">
          <div
            className="rounded-lg rounded-bl-sm px-3 py-2 text-[10px] leading-relaxed"
            style={{
              background: P.paperWarm,
              color: P.textSecondary,
              border: `1px solid ${P.borderLight}`,
            }}
          >
            Plan a 2-week Thailand trip…
          </div>
          <div
            className="ml-4 rounded-lg rounded-br-sm px-3 py-2 text-[10px] leading-relaxed"
            style={{
              background: P.accentBg,
              color: P.text,
              border: `1px solid ${P.borderLight}`,
            }}
          >
            I&apos;ll dispatch the librarian and editor.
          </div>

          <div
            className="mt-2 flex items-center justify-between rounded-md px-2.5 py-2"
            style={{ background: P.bgCard, border: `1px dashed ${P.borderDark}` }}
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" style={{ color: P.iconAmber }} />
              <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: P.textSecondary }}>
                Pending action
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
                style={{ background: P.accent, color: P.paper }}
              >
                Approve
              </span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
                style={{
                  background: "transparent",
                  color: P.textTertiary,
                  border: `1px solid ${P.borderLight}`,
                }}
              >
                Decline
              </span>
            </div>
          </div>
        </div>
      </CardChrome>
    </Stage>
  );
}

/** Themes — color swatches. */
export function ThemesVisual() {
  const swatches: { name: string; bg: string; fg: string; selected?: boolean }[] = [
    { name: "Paper", bg: "#FAF6F1", fg: "#3B2F2F", selected: true },
    { name: "Slate", bg: "#1E2530", fg: "#E2E8F0" },
    { name: "Claude", bg: "#F5E6D3", fg: "#7A4F30" },
    { name: "White", bg: "#FFFFFF", fg: "#222222" },
    { name: "Ink", bg: "#0E0E10", fg: "#E5E5E5" },
    { name: "Sage", bg: "#EDF1EC", fg: "#3F4D3A" },
  ];
  return (
    <Stage>
      <CardChrome width={280}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <Palette className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: P.text }}>
            Themes
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 p-3 pt-2">
          {swatches.map((s) => (
            <div
              key={s.name}
              className="flex flex-col items-center gap-1 rounded-md p-2"
              style={{
                background: s.bg,
                border: `1px solid ${s.selected ? P.accent : P.borderLight}`,
                boxShadow: s.selected ? `0 0 0 2px ${P.accentBg}` : undefined,
              }}
            >
              <span className="text-[10px] font-semibold" style={{ color: s.fg }}>
                Aa
              </span>
              <span className="text-[8px] tracking-wider" style={{ color: s.fg, opacity: 0.7 }}>
                {s.name}
              </span>
            </div>
          ))}
        </div>
      </CardChrome>
    </Stage>
  );
}

/** Providers — stacked provider chips. */
export function ProvidersVisual() {
  const providers = ["Claude", "GPT-4", "Gemini", "Grok", "Codex"];
  return (
    <Stage>
      <CardChrome width={260}>
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <Cpu className="h-4 w-4" style={{ color: P.accent }} />
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: P.text }}>
            Providers
          </span>
        </div>
        <div className="space-y-1.5 px-3 pb-3">
          {providers.map((name, i) => (
            <div
              key={name}
              className="flex items-center justify-between rounded-md px-2.5 py-1.5"
              style={{
                background: i === 0 ? P.accentBg : P.paperWarm,
                border: `1px solid ${i === 0 ? P.borderDark : P.borderLight}`,
              }}
            >
              <span className="text-[10px] font-semibold" style={{ color: P.text }}>
                {name}
              </span>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: i === 0 ? P.accent : P.textTertiary, opacity: i === 0 ? 1 : 0.4 }}
              />
            </div>
          ))}
        </div>
      </CardChrome>
    </Stage>
  );
}

/** Coming-soon placeholder — used for Skills and Integrations. */
export function ComingSoonVisual({ icon: Icon }: { icon: typeof Sparkles }) {
  return (
    <Stage>
      <div
        className="flex flex-col items-center gap-3 rounded-2xl p-8"
        style={{
          background: P.bgCard,
          border: `1px dashed ${P.borderDark}`,
          width: 240,
        }}
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: P.accentBg }}
        >
          <Icon className="h-6 w-6" style={{ color: P.accent }} />
        </div>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: P.textTertiary }}
        >
          Coming soon
        </span>
      </div>
    </Stage>
  );
}

export function SkillsVisual() {
  return <ComingSoonVisual icon={Sparkles} />;
}

export function IntegrationsVisual() {
  return <ComingSoonVisual icon={Plug} />;
}

/* ─── Keyboard shortcuts preview ───────────────────────────────────── */
function KbdChip({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <kbd
      className="inline-flex items-center rounded px-2 py-1 font-mono text-[11px] font-semibold leading-none opacity-0"
      style={{
        background: P.bgCard,
        border: `1px solid ${P.borderDark}`,
        color: P.text,
        boxShadow: `0 1px 0 ${P.borderDark}`,
        animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
        animationDelay: `${delay}ms`,
      }}
    >
      {children}
    </kbd>
  );
}

export function ShortcutsVisual() {
  return (
    <Stage>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <KbdChip delay={100}>⌘⌥T</KbdChip>
          <span className="text-[10px]" style={{ color: P.textTertiary }}>Add to Inbox</span>
        </div>
        <div className="flex items-center gap-2">
          <KbdChip delay={200}>⌘⌥R</KbdChip>
          <span className="text-[10px]" style={{ color: P.textTertiary }}>Run task now</span>
        </div>
        <div className="flex items-center gap-2">
          <KbdChip delay={300}>⌘K</KbdChip>
          <span className="text-[10px]" style={{ color: P.textTertiary }}>Search</span>
        </div>
        <div className="flex items-center gap-2">
          <KbdChip delay={400}>⌘⌥A</KbdChip>
          <span className="text-[10px]" style={{ color: P.textTertiary }}>AI panel</span>
        </div>
        <div className="flex items-center gap-2">
          <KbdChip delay={500}>⌘1</KbdChip>
          <KbdChip delay={580}>⌘2</KbdChip>
          <KbdChip delay={660}>⌘3</KbdChip>
          <span className="text-[10px]" style={{ color: P.textTertiary }}>Drawers</span>
        </div>
      </div>
    </Stage>
  );
}

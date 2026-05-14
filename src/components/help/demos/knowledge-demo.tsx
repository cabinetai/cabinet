"use client";

import {
  AtSign,
  BookOpen,
  Code,
  FileSpreadsheet,
  FileText,
  Folder,
  HardDrive,
  Heading1,
  Image as ImageIcon,
  List,
  Lock,
  Music,
  Notebook,
  Quote,
  Slash,
  Sparkles,
  Table,
  Video,
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

/* ── Slide 1: Anything goes ──────────────────────────────────────────── */
function SlideAnything() {
  const { t } = useLocale();
  const types: { icon: typeof FileText; label: string; ext: string }[] = [
    { icon: FileText, label: "Markdown", ext: ".md" },
    { icon: FileSpreadsheet, label: "Spreadsheets", ext: ".csv .xlsx" },
    { icon: FileText, label: "PDFs", ext: ".pdf" },
    { icon: Notebook, label: "Notebooks", ext: ".ipynb" },
    { icon: Code, label: "Source code", ext: ".ts .py .go" },
    { icon: ImageIcon, label: "Images", ext: ".png .jpg .svg" },
    { icon: Video, label: "Video", ext: ".mp4 .mov" },
    { icon: Music, label: "Audio", ext: ".mp3 .wav" },
    { icon: Sparkles, label: "Mermaid", ext: ".mmd" },
  ];

  return (
    <DemoSlideShell
      title={
        <>
          <span style={{ color: P.accent }}>{t("demosPlus:anything")}</span> goes.
        </>
      }
      description={
        <>
          Markdown, spreadsheets, PDFs, notebooks, source code, images, video,
          audio, mermaid diagrams — drop any file in your cabinet and Cabinet
          knows how to render it.
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2" style={{ width: 380 }}>
        {types.map((t, i) => {
          const Icon = t.icon;
          return (
            <div
              key={t.label}
              className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 opacity-0"
              style={{
                background: P.bgCard,
                border: `1px solid ${P.borderLight}`,
                animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                animationDelay: `${300 + i * 80}ms`,
              }}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: P.accentBg, color: P.accent }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span
                className="text-[10.5px] font-semibold"
                style={{ color: P.text }}
              >
                {t.label}
              </span>
              <span
                className="font-mono text-[8.5px]"
                style={{ color: P.textTertiary }}
              >
                {t.ext}
              </span>
            </div>
          );
        })}
      </div>
    </DemoSlideShell>
  );
}

/* ── Slide 2: Renders inline ─────────────────────────────────────────── */
function SlideRenders() {
  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Renders <span style={{ color: P.accent }}>inline</span>.
        </>
      }
      description={
        <>
          Open a CSV — see a table. Open a notebook — see the cells.
          Mermaid diagram — actual diagram. No detours, no downloads.
        </>
      }
    >
      <div className="space-y-2" style={{ width: 380 }}>
        {/* CSV preview */}
        <CardChrome width={380}>
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
            <FileSpreadsheet className="h-3 w-3" style={{ color: P.accent }} />
            <span className="font-mono text-[10px]" style={{ color: P.textSecondary }}>
              q2-metrics.csv
            </span>
          </div>
          <div className="px-3 pb-3 opacity-0" style={{
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "300ms",
          }}>
            <div
              className="grid grid-cols-3 gap-px overflow-hidden rounded-md text-[10px]"
              style={{ background: P.borderLight }}
            >
              {[
                ["Month", "MRR", "Δ"],
                ["April", "$48k", "+12%"],
                ["May", "$54k", "+13%"],
                ["June", "$61k", "+13%"],
              ].map((row, ri) => (
                row.map((cell, ci) => (
                  <div
                    key={`${ri}-${ci}`}
                    className="px-2 py-1.5"
                    style={{
                      background: ri === 0 ? P.paperWarm : P.bgCard,
                      color: ri === 0 ? P.textTertiary : P.text,
                      fontWeight: ri === 0 ? 600 : 400,
                      fontSize: ri === 0 ? 9 : 10,
                    }}
                  >
                    {cell}
                  </div>
                ))
              ))}
            </div>
          </div>
        </CardChrome>

        {/* Mermaid preview */}
        <CardChrome width={380}>
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
            <Sparkles className="h-3 w-3" style={{ color: P.accent }} />
            <span className="font-mono text-[10px]" style={{ color: P.textSecondary }}>
              org-chart.mmd
            </span>
          </div>
          <div
            className="flex items-center justify-around px-3 pb-3 opacity-0"
            style={{
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "650ms",
            }}
          >
            <svg width="320" height="84" viewBox="0 0 320 84">
              <rect x="130" y="6" width="60" height="20" rx="4" fill={P.accentBg} stroke={P.borderDark} />
              <text x="160" y="20" textAnchor="middle" fontSize="9" fill={P.text}>CEO</text>
              <line x1="160" y1="26" x2="80" y2="50" stroke={P.borderDark} strokeWidth="1" />
              <line x1="160" y1="26" x2="240" y2="50" stroke={P.borderDark} strokeWidth="1" />
              <rect x="50" y="50" width="60" height="20" rx="4" fill={P.bgCard} stroke={P.borderDark} />
              <text x="80" y="64" textAnchor="middle" fontSize="9" fill={P.text}>CMO</text>
              <rect x="210" y="50" width="60" height="20" rx="4" fill={P.bgCard} stroke={P.borderDark} />
              <text x="240" y="64" textAnchor="middle" fontSize="9" fill={P.text}>CTO</text>
            </svg>
          </div>
        </CardChrome>
      </div>
    </DemoSlideShell>
  );
}

/* ── Slide 3: Slash to compose ───────────────────────────────────────── */
function SlideSlash() {
  const items: { icon: typeof Heading1; label: string; hint: string }[] = [
    { icon: Heading1, label: "Heading 1", hint: "Large section heading" },
    { icon: List, label: "Bullet List", hint: "Create a bullet list" },
    { icon: Code, label: "Code Block", hint: "Insert a code block" },
    { icon: Quote, label: "Blockquote", hint: "Insert a blockquote" },
    { icon: Sparkles, label: "Math", hint: "Insert a LaTeX expression" },
    { icon: Table, label: "Table", hint: "Insert a 3×3 table" },
  ];

  return (
    <DemoSlideShell
      title={
        <>
          Type <span style={{ color: P.accent }}>/</span> to compose.
        </>
      }
      description={
        <>
          Slash commands let you drop in headings, lists, code blocks,
          callouts, math, embeds, and more — without taking your hands off the
          keyboard.
        </>
      }
    >
      <CardChrome width={380}>
        {/* Editor preview line with the slash cursor */}
        <div className="px-4 pt-4 pb-2">
          <div
            className="font-body-serif text-[15px]"
            style={{ color: P.text }}
          >
            Q2 review
          </div>
          <div
            className="mt-1 flex items-center gap-1 font-body-serif text-[12px]"
            style={{ color: P.textSecondary }}
          >
            <Slash className="h-3 w-3" style={{ color: P.accent }} />
            <span style={{ color: P.text }}>/</span>
            <span
              className="ml-0.5 inline-block h-3 w-[1.5px]"
              style={{
                background: P.accent,
                animation: "cabinet-tour-heartbeat-dot 1s ease-in-out infinite",
              }}
            />
          </div>
        </div>

        {/* Command palette */}
        <div
          className="mx-3 mb-3 rounded-xl"
          style={{
            background: P.paper,
            border: `1px solid ${P.borderDark}`,
            boxShadow: `0 16px 32px -20px rgba(59,47,47,0.45)`,
          }}
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            const active = i === 0;
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 px-3 py-2 opacity-0"
                style={{
                  background: active ? P.accentBg : "transparent",
                  borderBottom:
                    i < items.length - 1
                      ? `1px solid ${P.borderLight}`
                      : "none",
                  animation: "cabinet-tour-fade-up 0.3s ease-out forwards",
                  animationDelay: `${500 + i * 70}ms`,
                }}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md"
                  style={{
                    background: active ? P.bgCard : P.paperWarm,
                    color: active ? P.accent : P.textSecondary,
                    border: `1px solid ${P.borderLight}`,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[11px] font-semibold"
                    style={{ color: active ? P.accent : P.text }}
                  >
                    {item.label}
                  </div>
                  <div className="text-[9.5px]" style={{ color: P.textTertiary }}>
                    {item.hint}
                  </div>
                </div>
                {active && (
                  <span
                    className="rounded px-1.5 py-0.5 font-mono text-[8.5px]"
                    style={{
                      background: P.bgCard,
                      color: P.textTertiary,
                      border: `1px solid ${P.borderLight}`,
                    }}
                  >
                    ↵
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 4: Mention anything ───────────────────────────────────────── */
function SlideMentions() {
  return (
    <DemoSlideShell
      reversed
      title={
        <>
          Mention <span style={{ color: P.accent }}>anything</span>.
        </>
      }
      description={
        <>
          <span className="font-mono">@</span> an agent to hand off the page.
          <span className="font-mono"> [[wiki link]]</span> another page to
          weave a knowledge graph. Cabinet wires it all up for you.
        </>
      }
    >
      <CardChrome width={400}>
        <div className="px-4 pt-4 pb-2">
          <div
            className="font-body-serif text-[15px] mb-2"
            style={{ color: P.text }}
          >
            Launch retro
          </div>

          <div
            className="font-body-serif text-[12px] leading-relaxed opacity-0"
            style={{
              color: P.textSecondary,
              animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
              animationDelay: "300ms",
            }}
          >
            Hand the metric write-up to{" "}
            <span
              className="rounded-md px-1.5 py-0.5 font-mono text-[11px]"
              style={{
                background: P.accentBg,
                color: P.accent,
                border: `1px solid ${P.borderDark}`,
              }}
            >
              <AtSign className="mr-0.5 -mt-0.5 inline-block h-2.5 w-2.5" />
              analyst
            </span>{" "}
            and link the source data in{" "}
            <span
              className="rounded-md px-1.5 py-0.5 font-mono text-[11px]"
              style={{
                background: P.paperWarm,
                color: P.text,
                border: `1px solid ${P.borderDark}`,
              }}
            >
              [[Q2 metrics]]
            </span>
            .
          </div>
        </div>

        {/* Suggestion popover */}
        <div
          className="mx-4 mb-4 mt-2 rounded-xl opacity-0"
          style={{
            background: P.paper,
            border: `1px solid ${P.borderDark}`,
            boxShadow: `0 16px 32px -20px rgba(59,47,47,0.45)`,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "800ms",
          }}
        >
          <div
            className="px-3 py-1.5 text-[8.5px] font-semibold uppercase tracking-wider"
            style={{ color: P.textTertiary, borderBottom: `1px solid ${P.borderLight}` }}
          >
            Pages
          </div>
          {[
            { label: "Q2 metrics", path: "Reports / Q2 metrics" },
            { label: "Q1 retro", path: "Reports / Q1 retro" },
            { label: "Q3 plan", path: "Roadmap / Q3 plan" },
          ].map((p, i) => (
            <div
              key={p.label}
              className="flex items-center gap-2 px-3 py-1.5"
              style={{
                background: i === 0 ? P.accentBg : "transparent",
                borderBottom:
                  i < 2 ? `1px solid ${P.borderLight}` : "none",
              }}
            >
              <BookOpen
                className="h-3 w-3"
                style={{ color: i === 0 ? P.accent : P.textTertiary }}
              />
              <span
                className="text-[10.5px] font-semibold"
                style={{ color: i === 0 ? P.accent : P.text }}
              >
                {p.label}
              </span>
              <span
                className="ml-auto text-[9px]"
                style={{ color: P.textTertiary }}
              >
                {p.path}
              </span>
            </div>
          ))}
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

/* ── Slide 5: Yours, not ours ────────────────────────────────────────── */
function SlideYours() {
  const { t } = useLocale();
  const tree: { name: string; depth: number; icon: typeof Folder; isFolder?: boolean; emphasize?: boolean }[] = [
    { name: "~/Cabinet", depth: 0, icon: HardDrive, isFolder: true, emphasize: true },
    { name: "Marketing", depth: 1, icon: Folder, isFolder: true },
    { name: "Q2 review.md", depth: 2, icon: FileText },
    { name: "metrics.csv", depth: 2, icon: FileSpreadsheet },
    { name: "Engineering", depth: 1, icon: Folder, isFolder: true },
    { name: "architecture.mmd", depth: 2, icon: Sparkles },
  ];

  return (
    <DemoSlideShell
      title={
        <>
          <span style={{ color: P.accent }}>{t("demosPlus:yours")}</span>, not ours.
        </>
      }
      description={
        <>
          Every cabinet is just a folder on your machine. Plain markdown,
          plain spreadsheets, plain images. Open it in Finder. Back it up.
          Sync it your way. Cabinet never holds your data hostage.
        </>
      }
    >
      <CardChrome width={400}>
        <div
          className="flex items-center gap-2 px-4 pt-3 pb-2"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <Lock className="h-3.5 w-3.5" style={{ color: P.accent }} />
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: P.textTertiary }}
          >
            On your disk
          </span>
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[9px] font-semibold"
            style={{ background: P.accentBg, color: P.accent }}
          >
            100% local
          </span>
        </div>

        <div className="px-3 py-3">
          {tree.map((node, i) => {
            const Icon = node.icon;
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 opacity-0"
                style={{
                  marginLeft: node.depth * 14,
                  background: node.emphasize ? P.paperWarm : "transparent",
                  border: node.emphasize ? `1px solid ${P.borderLight}` : "none",
                  animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                  animationDelay: `${300 + i * 100}ms`,
                }}
              >
                <Icon
                  className="h-3.5 w-3.5 shrink-0"
                  style={{
                    color: node.isFolder ? P.accent : P.textSecondary,
                  }}
                />
                <span
                  className="font-mono text-[10.5px]"
                  style={{
                    color: node.emphasize ? P.text : P.textSecondary,
                    fontWeight: node.emphasize ? 600 : 400,
                  }}
                >
                  {node.name}
                </span>
              </div>
            );
          })}
        </div>
      </CardChrome>
    </DemoSlideShell>
  );
}

export function buildKnowledgeDemo(): DemoConfig {
  return {
    id: "knowledge",
    ariaLabel: "Your knowledge base — guided demo",
    slides: [
      { id: "anything", render: () => <SlideAnything /> },
      { id: "renders", render: () => <SlideRenders /> },
      { id: "slash", render: () => <SlideSlash /> },
      { id: "mentions", render: () => <SlideMentions /> },
      { id: "yours", render: () => <SlideYours /> },
    ],
  };
}

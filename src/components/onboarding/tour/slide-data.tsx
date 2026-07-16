"use client";

import { type CSSProperties, type ReactNode } from "react";
import {
  FileText,
  FileType,
  Image as ImageIcon,
  Video,
  Music,
  FileSpreadsheet,
  Table,
  AppWindow,
  Code,
  GitBranch,
  Folder,
  ChevronDown,
  Check,
  Maximize2,
  TrendingUp,
} from "lucide-react";
import { MockupSidebar } from "./mockup-sidebar";
import { TOUR_PALETTE as P } from "./palette";
import { useLocale } from "@/i18n/use-locale";

type IconComponent = typeof FileText;

const ICON = {
  gray: "#6B7280",
  green: "#22C55E",
  red: "#EF4444",
  violet: "#A855F7",
  pink: "#EC4899",
  cyan: "#06B6D4",
  amber: "#F59E0B",
  blue: "#3B82F6",
  orange: "#F97316",
} as const;

interface TreeRow {
  label: string;
  icon: IconComponent;
  color: string;
  indent: number;
}

interface Scene {
  id: string;
  rootIcon: IconComponent;
  rootColor: string;
  rootLabel: string;
  rows: TreeRow[];
  featuredIdx: number;
  caption: string;
  viewer: ReactNode;
}

// ── Scene viewers ──────────────────────────────────────────────

function ViewerFrame({
  title,
  icon: Icon,
  iconColor,
  badge,
  children,
}: {
  title: string;
  icon: IconComponent;
  iconColor: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-xl"
      style={{
        background: P.bgCard,
        boxShadow: `inset 0 0 0 1px ${P.border}, 0 30px 60px -25px rgba(59,47,47,0.28)`,
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: `1px solid ${P.borderLight}` }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: iconColor }} />
        <span className="flex-1 truncate text-[11px] font-medium" style={{ color: P.text }}>
          {title}
        </span>
        {badge && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em]"
            style={{ background: P.accentBg, color: P.accent }}
          >
            {badge}
          </span>
        )}
        <Maximize2 className="h-3 w-3 shrink-0" style={{ color: P.textTertiary }} />
      </div>
      <div className="relative flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function ImageViewer() {
  return (
    <ViewerFrame title={"Phuket sunset.jpg"} icon={ImageIcon} iconColor={ICON.pink}>
      <div
        className="relative h-full w-full overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #2b1d4e 0%, #6a3a72 26%, #c85a4e 52%, #ef7a3c 70%, #f6b85e 86%, #f7d28a 100%)",
        }}
      >
        {/* Sun, low over the horizon */}
        <div
          className="absolute"
          style={{
            left: "50%",
            top: "60%",
            width: 64,
            height: 64,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            background: "radial-gradient(circle, #FFF1C2 0%, #FFD27A 45%, #FFB04D 100%)",
            boxShadow: "0 0 44px 14px rgba(255, 190, 110, 0.55)",
          }}
        />
        {/* Sea */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: "34%",
            background:
              "linear-gradient(180deg, rgba(239,122,60,0.55) 0%, #6a3a72 55%, #2b1d4e 100%)",
          }}
        />
        {/* Sun reflection shimmer on the water */}
        <div
          className="absolute"
          style={{
            left: "50%",
            bottom: 0,
            width: 40,
            height: "34%",
            transform: "translateX(-50%)",
            background:
              "linear-gradient(180deg, rgba(255,220,150,0.7), rgba(255,220,150,0))",
            filter: "blur(2px)",
          }}
        />
        {/* Island + palm silhouettes on the horizon */}
        <svg
          className="absolute inset-x-0"
          viewBox="0 0 340 70"
          preserveAspectRatio="none"
          style={{ bottom: "34%", height: "26%" }}
        >
          <g fill="rgba(20,10,30,0.7)">
            <path d="M0 70 Q40 38 90 70 Z" />
            <path d="M250 70 Q290 30 340 70 Z" />
            {/* a lone palm */}
            <rect x="34" y="34" width="3" height="36" />
            <path d="M35 34 Q22 28 14 32 Q24 30 35 38 Z" />
            <path d="M35 34 Q48 28 56 32 Q46 30 35 38 Z" />
            <path d="M35 34 Q28 24 22 18 Q32 26 35 38 Z" />
          </g>
        </svg>
        {/* a few birds */}
        <svg className="absolute" style={{ left: "16%", top: "26%", width: 70, height: 24 }} viewBox="0 0 70 24">
          <g fill="none" stroke="rgba(30,15,40,0.55)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 12 Q11 6 16 12 Q21 6 26 12" />
            <path d="M40 7 Q44 2 48 7 Q52 2 56 7" />
          </g>
        </svg>
      </div>
    </ViewerFrame>
  );
}

function CalculatorAppViewer() {
  const { t } = useLocale();
  return (
    <ViewerFrame title={t("slideData:calculatorTitle")} icon={AppWindow} iconColor={ICON.green} badge={t("slideData:liveAppBadge")}>
      <div className="flex h-full flex-col gap-2.5 p-3.5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[8px] font-semibold uppercase tracking-[0.1em]" style={{ color: P.textTertiary }}>
            {t("slideData:taxEstimateLabel")}
          </span>
        </div>
        {[
          { label: t("slideData:income"), value: "$85,000" },
          { label: t("slideData:deductions"), value: "$12,000" },
          { label: t("slideData:taxBracket"), value: "22%" },
        ].map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[11px]"
            style={{ background: P.paperWarm, border: `1px solid ${P.borderLight}`, color: P.text }}
          >
            <span style={{ color: P.textSecondary }}>{row.label}</span>
            <span className="font-mono font-semibold">{row.value}</span>
          </div>
        ))}
        <div
          className="mt-1 flex items-center justify-between rounded-md px-2.5 py-2 text-[11px]"
          style={{
            background: `linear-gradient(135deg, ${P.accent}, ${P.accentWarm})`,
            color: P.paper,
          }}
        >
          <span className="font-medium">{t("slideData:estimatedTax")}</span>
          <span className="font-mono text-[13px] font-bold">$15,970</span>
        </div>
        <div className="mt-auto flex items-end gap-1.5 pt-3" style={{ borderTop: `1px solid ${P.borderLight}` }}>
          {[60, 42, 78, 55, 90, 68, 82].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t"
              style={{ height: `${h * 0.5}px`, background: i === 4 ? P.accent : P.accentBg }}
            />
          ))}
        </div>
      </div>
    </ViewerFrame>
  );
}

function CsvTableViewer() {
  const { t } = useLocale();
  // Vitamin names + dose units stay as universal scientific notation —
  // Vitamin D / 2000 IU read the same in any locale.
  const vitamins = [
    { name: "Vitamin D", dose: "2000 IU", time: "8 am", done: true },
    { name: "Iron", dose: "25 mg", time: "12 pm", done: true },
    { name: "Magnesium", dose: "400 mg", time: "8 pm", done: false },
    { name: "Vitamin C", dose: "1 g", time: "10 am", done: true },
    { name: "Omega-3", dose: "1 g", time: "8 pm", done: true },
    { name: "B-Complex", dose: "1 cap", time: "8 am", done: true },
  ];
  return (
    <ViewerFrame title={t("slideData:csvTitle")} icon={Table} iconColor={ICON.green}>
      <div className="flex h-full flex-col">
        <div
          className="grid grid-cols-[1.3fr_0.9fr_0.8fr_0.3fr] gap-2 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: P.textTertiary, borderBottom: `1px solid ${P.borderLight}`, background: P.paperWarm }}
        >
          <span>{t("slideData:csvColVitamin")}</span>
          <span>{t("slideData:csvColDose")}</span>
          <span>{t("slideData:csvColTime")}</span>
          <span className="text-right">{t("slideData:csvColDone")}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          {vitamins.map((v, i) => (
            <div
              key={v.name}
              className="grid grid-cols-[1.3fr_0.9fr_0.8fr_0.3fr] gap-2 px-3 py-1.5 text-[11px] items-center"
              style={{
                color: P.text,
                borderBottom: `1px solid ${P.borderLight}`,
                background: i % 2 === 0 ? P.bgCard : "rgba(243,237,228,0.4)",
              }}
            >
              <span className="truncate font-medium">{v.name}</span>
              <span className="font-mono" style={{ color: P.textSecondary }}>{v.dose}</span>
              <span className="font-mono" style={{ color: P.textSecondary }}>{v.time}</span>
              <span className="flex justify-end">
                {v.done ? (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ background: ICON.green }}>
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full" style={{ border: `1px solid ${P.borderDark}` }} />
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ViewerFrame>
  );
}


function CodeViewer() {
  const { t: tCode } = useLocale();
  const lines = [
    { n: 1, html: <><span style={{ color: "#B47ED8" }}>export type</span> <span style={{ color: "#D9A55E" }}>Page</span> = {"{"}</> },
    { n: 2, html: <>  path: <span style={{ color: "#7BAEDB" }}>string</span>;</> },
    { n: 3, html: <>  title: <span style={{ color: "#7BAEDB" }}>string</span>;</> },
    { n: 4, html: <>  tags: <span style={{ color: "#7BAEDB" }}>string</span>[];</> },
    { n: 5, html: <>  modified: <span style={{ color: "#7BAEDB" }}>Date</span>;</> },
    { n: 6, html: <>{"}"};</> },
    { n: 7, html: <>&nbsp;</> },
    { n: 8, html: <><span style={{ color: "#B47ED8" }}>export type</span> <span style={{ color: "#D9A55E" }}>Agent</span> = {"{"}</> },
    { n: 9, html: <>  slug: <span style={{ color: "#7BAEDB" }}>string</span>;</> },
    { n: 10, html: <>  persona: <span style={{ color: "#7BAEDB" }}>string</span>;</> },
    { n: 11, html: <>  heartbeatMs?: <span style={{ color: "#7BAEDB" }}>number</span>;</> },
    { n: 12, html: <>{"}"};</> },
  ];
  return (
    <ViewerFrame title={tCode("slideData:schemaTitle")} icon={Code} iconColor={ICON.violet} badge={tCode("slideData:tsBadge")}>
      <div
        className="h-full overflow-hidden py-2 font-mono text-[11px] leading-relaxed"
        style={{ color: P.text, background: "#FBF7F0" }}
      >
        {lines.map((ln) => (
          <div key={ln.n} className="flex gap-3 px-3">
            <span className="shrink-0 text-right tabular-nums" style={{ color: P.textTertiary, width: "1.5em" }}>
              {ln.n}
            </span>
            <span className="whitespace-pre">{ln.html}</span>
          </div>
        ))}
      </div>
    </ViewerFrame>
  );
}

// ── Scenes ────────────────────────────────────────────────────
// Cabinet-content "file" names stay in English on purpose — they're demo
// content for a fictional cabinet (Itinerary.md, Phuket sunset.jpg). Only
// the user-facing chrome (rootLabel, caption) gets translated at render
// time via the *Key fields below.
const SCENES: (Scene & { rootLabelKey: string; captionKey: string })[] = [
  {
    id: "thailand-photo",
    rootIcon: ChevronDown as IconComponent,
    rootColor: P.textTertiary,
    rootLabel: "Thailand Trip",
    rootLabelKey: "slideData:thailandRootLabel",
    rows: [
      { label: "Itinerary.md", icon: FileText, color: ICON.gray, indent: 1 },
      { label: "Phuket sunset.jpg", icon: ImageIcon, color: ICON.pink, indent: 1 },
      { label: "Chiang Mai temple.jpg", icon: ImageIcon, color: ICON.pink, indent: 1 },
      { label: "Night market.mp4", icon: Video, color: ICON.cyan, indent: 1 },
      { label: "Budget.xlsx", icon: FileSpreadsheet, color: ICON.green, indent: 1 },
      { label: "Street food notes.mp3", icon: Music, color: ICON.amber, indent: 1 },
      { label: "Flights.pdf", icon: FileType, color: ICON.red, indent: 1 },
    ],
    featuredIdx: 1,
    caption: "View all your files in one place.",
    captionKey: "slideData:thailandCaption",
    viewer: <ImageViewer />,
  },
  {
    id: "tax-webapp",
    rootIcon: ChevronDown as IconComponent,
    rootColor: P.textTertiary,
    rootLabel: "Tax 2026",
    rootLabelKey: "slideData:taxRootLabel",
    rows: [
      { label: "Calculator", icon: AppWindow, color: ICON.green, indent: 1 },
      { label: "Income.xlsx", icon: FileSpreadsheet, color: ICON.green, indent: 1 },
      { label: "Receipts.pdf", icon: FileType, color: ICON.red, indent: 1 },
      { label: "Deductions.md", icon: FileText, color: ICON.gray, indent: 1 },
      { label: "W-2 2026.pdf", icon: FileType, color: ICON.red, indent: 1 },
      { label: "CPA notes.docx", icon: FileText, color: ICON.blue, indent: 1 },
    ],
    featuredIdx: 0,
    caption: "Tax 2026: a live calculator web app, embedded right in your cabinet.",
    captionKey: "slideData:taxCaption",
    viewer: <CalculatorAppViewer />,
  },
  {
    id: "health",
    rootIcon: ChevronDown as IconComponent,
    rootColor: P.textTertiary,
    rootLabel: "Health",
    rootLabelKey: "slideData:healthRootLabel",
    rows: [
      { label: "Daily vitamins.csv", icon: Table, color: ICON.green, indent: 1 },
      { label: "Supplements.md", icon: FileText, color: ICON.gray, indent: 1 },
      { label: "Dosage schedule.xlsx", icon: FileSpreadsheet, color: ICON.green, indent: 1 },
      { label: "Lab results.pdf", icon: FileType, color: ICON.red, indent: 1 },
      { label: "Progress chart.png", icon: ImageIcon, color: ICON.pink, indent: 1 },
    ],
    featuredIdx: 0,
    caption: "Vitamins & labs: a spreadsheet that feels like a page.",
    captionKey: "slideData:healthCaption",
    viewer: <CsvTableViewer />,
  },
  {
    id: "repo",
    rootIcon: GitBranch as IconComponent,
    rootColor: ICON.orange,
    rootLabel: "cabinet-repo",
    rootLabelKey: "slideData:repoRootLabel",
    rows: [
      { label: "README.md", icon: FileText, color: ICON.gray, indent: 1 },
      { label: "package.json", icon: Code, color: ICON.violet, indent: 1 },
      { label: "src", icon: Folder, color: ICON.gray, indent: 1 },
      { label: "schema.ts", icon: Code, color: ICON.violet, indent: 1 },
      { label: ".repo.yaml", icon: GitBranch, color: ICON.orange, indent: 1 },
    ],
    featuredIdx: 3,
    caption: "Codebases: link any Git repo, searchable by your agents.",
    captionKey: "slideData:repoCaption",
    viewer: <CodeViewer />,
  },
];

export const DATA_SCENE_COUNT = SCENES.length;

const SIDEBAR_ROW_HEIGHT = 28;
const SIDEBAR_ROW_TOP_OFFSET = 50;
const CURSOR_TARGET_X = 48;

interface SlideDataProps {
  sceneIdx: number;
}

export function SlideData({ sceneIdx }: SlideDataProps) {
  const { t, dir } = useLocale();
  const clampedIdx = Math.min(Math.max(sceneIdx, 0), SCENES.length - 1);
  const scene = SCENES[clampedIdx];

  const cursorTargetY =
    SIDEBAR_ROW_TOP_OFFSET + scene.featuredIdx * SIDEBAR_ROW_HEIGHT;

  return (
    <div
      className="cabinet-tour-data-grid flex h-full flex-col items-center gap-6 md:grid md:items-center md:gap-8 lg:gap-10"
    >
      {/* ── Column 1: Sidebar + caption ─── */}
      <div className="order-2 flex h-[440px] w-full max-w-[260px] flex-col gap-3 md:order-1 md:h-[500px] md:max-w-none">
        <div
          className="h-[440px] w-full opacity-0"
          style={{ animation: "cabinet-tour-fade-up 0.4s ease-out forwards", animationDelay: "0ms" }}
        >
          <MockupSidebar activeTab="data" viewTransitionName="cabinet-card">
            <div
              key={scene.id}
              className="relative h-full px-2.5 py-2"
              style={
                {
                  animation: "cabinet-tour-fade-in 0.35s ease-out",
                  "--cursor-target-x": `${dir === "rtl" ? -CURSOR_TARGET_X : CURSOR_TARGET_X}px`,
                  "--cursor-target-y": `${cursorTargetY}px`,
                } as CSSProperties
              }
            >
              {/* Root row */}
              <div
                className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[12px] opacity-0"
                style={{
                  color: P.text,
                  animation: "cabinet-tour-fade-up 0.125s ease-out forwards",
                  animationDelay: "500ms",
                }}
              >
                {(() => {
                  const Icon = scene.rootIcon;
                  return (
                    <Icon
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: scene.rootColor }}
                    />
                  );
                })()}
                <span className="truncate font-medium">{t(scene.rootLabelKey)}</span>
              </div>

              {/* Child rows */}
              {scene.rows.map((row, i) => {
                const Icon = row.icon;
                const featured = i === scene.featuredIdx;
                return (
                  <div
                    key={row.label}
                    className="flex items-center gap-2 rounded-md py-1.5 text-[12px] opacity-0"
                    style={{
                      color: P.text,
                      paddingLeft: `${row.indent * 12 + 6}px`,
                      paddingRight: "6px",
                      background: featured ? P.accentBg : "transparent",
                      boxShadow: featured
                        ? `inset 0 0 0 1px ${P.borderDark}`
                        : "none",
                      animation: "cabinet-tour-fade-up 0.125s ease-out forwards",
                      animationDelay: `${525 + i * 20}ms`,
                    }}
                  >
                    <Icon
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: row.color }}
                    />
                    <span
                      className="truncate"
                      style={featured ? { fontWeight: 600 } : undefined}
                    >
                      {row.label}
                    </span>
                    {featured && (
                      <TrendingUp
                        className="ml-auto h-3 w-3 shrink-0"
                        style={{ color: P.accent }}
                      />
                    )}
                  </div>
                );
              })}

              {/* Click ripple — fires after all rows have appeared */}
              <span
                aria-hidden
                className="pointer-events-none absolute rounded-full opacity-0"
                style={{
                  top: `${cursorTargetY}px`,
                  [dir === "rtl" ? "right" : "left"]: `${CURSOR_TARGET_X}px`,
                  width: "44px",
                  height: "44px",
                  background: P.accent,
                  animation: "cabinet-tour-click-ripple 0.3s ease-out forwards",
                  animationDelay: "750ms",
                }}
              />
            </div>
          </MockupSidebar>
        </div>

        {/* Per-scene caption */}
        <div className="flex flex-col items-center gap-2 px-2">
          <p
            key={scene.id + "-caption"}
            className="font-body-serif text-[13px] leading-snug text-center opacity-0"
            style={{
              color: P.textSecondary,
              animation: "cabinet-tour-fade-up 0.125s ease-out forwards",
              animationDelay: "510ms",
              minHeight: "2.4em",
            }}
          >
            {t(scene.captionKey)}
          </p>
        </div>
      </div>

      {/* ── Column 2: File viewer panel — appears last ─── */}
      <div className="order-3 hidden h-[440px] w-full md:order-2 md:block">
        <div
          key={scene.id + "-viewer"}
          className="h-full w-full opacity-0"
          style={{
            animation: "cabinet-tour-fade-up 0.175s ease-out forwards",
            animationDelay: "825ms",
          }}
        >
          {scene.viewer}
        </div>
      </div>

      {/* ── Column 3: Copy — appears first ─── */}
      <div className="order-1 flex flex-col items-center gap-3 max-w-md text-center md:order-3 md:items-start md:gap-5 md:text-start">
        <span
          className="inline-block w-fit rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] opacity-0"
          style={{
            color: P.accent,
            background: P.accentBg,
            border: `1px solid ${P.borderDark}`,
            animation: "cabinet-tour-fade-up 0.3s ease-out forwards",
            animationDelay: "350ms",
          }}
        >
          {t("slideDataCopy:slideNum")}
        </span>
        <h2
          className="font-logo text-3xl italic tracking-tight opacity-0 md:text-4xl lg:text-5xl"
          style={{
            color: P.text,
            animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
            animationDelay: "500ms",
          }}
        >
          Your Cabinet is <span style={{ color: P.accent }}>one place</span> for all your
          files and dashboards
        </h2>
        <p
          className="font-body-serif text-base leading-relaxed opacity-0 lg:text-lg"
          style={{
            color: P.textSecondary,
            animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
            animationDelay: "650ms",
          }}
        >
          One place for everything, so you and your AI team read, edit, and ship from the{" "}
          <span style={{ color: P.text, fontWeight: 600 }}>same files</span>, not copies of copies.
        </p>
        <p
          className="font-body-serif text-sm leading-relaxed opacity-0 lg:text-base"
          style={{
            color: P.textSecondary,
            animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
            animationDelay: "800ms",
          }}
        >
          Markdown, PDFs, spreadsheets, slides, images, video, audio, linked repos, embedded
          web apps, Google Docs. Mention any of it with{" "}
          <span className="font-mono" style={{ color: P.accent }}>@</span>.
        </p>
      </div>
    </div>
  );
}

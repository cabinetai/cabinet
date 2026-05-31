"use client";

import {
  Sparkles,
  Github,
  ShieldCheck,
  Plus,
  Check,
  AtSign,
  Image as ImageIcon,
  Search,
  Code,
  Database,
  MessageSquare,
  Mail,
  Calendar,
  FileText,
  BarChart3,
  Wrench,
  PenLine,
  Brain,
} from "lucide-react";
import { TOUR_PALETTE as P } from "@/components/onboarding/tour/palette";
import { DemoSlideShell, type DemoConfig } from "../demo-modal";
import { useLocale } from "@/i18n/use-locale";

/* ── Slide 0: What is a skill? — floating colorful tiles ────────────── */

interface SkillTile {
  name: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  /** Position as % of the floating area. */
  x: number;
  y: number;
  rotate: number;
  /** One of three float keyframe variants — staggers the bobbing. */
  variant: "a" | "b" | "c";
}

const SKILL_TILES: SkillTile[] = [
  { name: "image-gen", Icon: ImageIcon, color: "#EC4899", x: 6, y: 10, rotate: -4, variant: "a" },
  { name: "seo-research", Icon: Search, color: "#22C55E", x: 50, y: 4, rotate: 2, variant: "b" },
  { name: "code-review", Icon: Code, color: "#3B82F6", x: 71, y: 22, rotate: -2, variant: "c" },
  { name: "sql-helper", Icon: Database, color: "#A78BFA", x: 18, y: 36, rotate: 3, variant: "b" },
  { name: "slack-ops", Icon: MessageSquare, color: "#F97316", x: 56, y: 36, rotate: -3, variant: "a" },
  { name: "gmail-triage", Icon: Mail, color: "#EF4444", x: 78, y: 50, rotate: 4, variant: "b" },
  { name: "calendar", Icon: Calendar, color: "#06B6D4", x: 4, y: 60, rotate: -2, variant: "c" },
  { name: "kb-author", Icon: FileText, color: "#6366F1", x: 36, y: 60, rotate: 1, variant: "a" },
  { name: "analytics", Icon: BarChart3, color: "#10B981", x: 62, y: 70, rotate: -3, variant: "b" },
  { name: "devops", Icon: Wrench, color: "#0EA5E9", x: 22, y: 82, rotate: 2, variant: "a" },
  { name: "copywriter", Icon: PenLine, color: "#D946EF", x: 50, y: 86, rotate: -2, variant: "c" },
  { name: "github", Icon: Github, color: "#1F2937", x: 80, y: 82, rotate: 3, variant: "a" },
  { name: "ai-tools", Icon: Brain, color: "#F59E0B", x: 32, y: 18, rotate: -3, variant: "c" },
];

function SlideWhatIsSkill() {
  const { t } = useLocale();
  return (
    <DemoSlideShell
      title={
        <>
          What&apos;s a <span style={{ color: P.accent }}>skill</span>?
        </>
      }
      description={
        <>
          A skill is a drop-in playbook your agent can pull in for a task —
          image generation, SEO research, code review, ops integrations.
          Cabinet ships a few; the rest you install from{" "}
          <code style={{ background: P.paperWarm, padding: "1px 6px", borderRadius: 4 }}>
            skills.sh
          </code>
          , GitHub, or write yourself.
        </>
      }
    >
      <style>{`
        @keyframes cabinet-skill-float-a {
          0%, 100% { transform: translate(-50%, -50%) translateY(0px); }
          50% { transform: translate(-50%, -50%) translateY(-5px); }
        }
        @keyframes cabinet-skill-float-b {
          0%, 100% { transform: translate(-50%, -50%) translateY(0px); }
          50% { transform: translate(-50%, -50%) translateY(-3px); }
        }
        @keyframes cabinet-skill-float-c {
          0%, 100% { transform: translate(-50%, -50%) translateY(0px); }
          50% { transform: translate(-50%, -50%) translateY(-7px); }
        }
        @keyframes cabinet-skill-pop-in {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
      <div
        className="relative"
        style={{
          width: 460,
          height: 360,
        }}
      >
        {/* Center halo to anchor the cloud */}
        <div
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: 200,
            height: 200,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle, ${P.accentBg} 0%, transparent 70%)`,
            opacity: 0.55,
          }}
        />

        {/* Skill tiles */}
        {SKILL_TILES.map((t, i) => {
          const delayPop = 100 + i * 65;
          const delayFloat = 800 + i * 140;
          return (
            <div
              key={t.name}
              className="absolute flex items-center gap-1.5 rounded-full px-2.5 py-1.5 shadow-sm"
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                background: `${t.color}1A`,
                border: `1px solid ${t.color}40`,
                color: t.color,
                opacity: 0,
                transformOrigin: "center",
                animation: `cabinet-skill-pop-in 0.45s ease-out ${delayPop}ms forwards, cabinet-skill-float-${t.variant} 5s ease-in-out ${delayFloat}ms infinite`,
                whiteSpace: "nowrap",
                rotate: `${t.rotate}deg`,
              }}
            >
              <t.Icon className="h-3 w-3 shrink-0" />
              <span className="text-[11px] font-semibold">{t.name}</span>
            </div>
          );
        })}

        {/* Center sparkle */}
        <div
          className="absolute left-1/2 top-1/2 flex h-12 w-12 items-center justify-center rounded-full opacity-0"
          style={{
            transform: "translate(-50%, -50%)",
            background: P.bgCard,
            border: `2px solid ${P.accent}`,
            boxShadow: `0 8px 24px -10px ${P.accent}66`,
            animation: "cabinet-skill-pop-in 0.5s ease-out 1100ms forwards",
          }}
        >
          <Sparkles className="h-5 w-5" style={{ color: P.accent }} />
        </div>
      </div>
    </DemoSlideShell>
  );
}



/* ── Slide 1: Install from skills.sh / GitHub ───────────────────────── */

interface CatalogResult {
  name: string;
  source: string;
  installs: string;
  audits: string;
  description: string;
}

const CATALOG: CatalogResult[] = [
  {
    name: "code-review-excellence",
    source: "anthropics/skills",
    installs: "12.4k",
    audits: "4/4",
    description: "Master code review practices — feedback, bug catching, refactor advice.",
  },
  {
    name: "seo-research",
    source: "skillsdotsh/seo",
    installs: "3.2k",
    audits: "3/4",
    description: "Keyword research, SERP analysis, content gap discovery.",
  },
  {
    name: "discord",
    source: "claude-plugins/discord",
    installs: "8.7k",
    audits: "4/4",
    description: "Discord ops via the message tool — channel routing, threading.",
  },
];

function SlideInstall() {
  const { t } = useLocale();
  return (
    <DemoSlideShell
      title={
        <>
          <span style={{ color: P.accent }}>{t("demosPlus:install")}</span> a skill.
        </>
      }
      description={
        <>
          Browse skills.sh, paste a GitHub URL, or run{" "}
          <code style={{ background: P.paperWarm, padding: "1px 6px", borderRadius: 4 }}>
            npx skills add
          </code>
          . Cabinet clones the bundle into{" "}
          <code style={{ background: P.paperWarm, padding: "1px 6px", borderRadius: 4 }}>
            .agents/skills/
          </code>{" "}
          and records its provenance in skills-lock.json.
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
        {/* Search bar */}
        <div
          className="flex items-center gap-2 px-3 py-2.5"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <Sparkles className="h-3.5 w-3.5" style={{ color: P.accent }} />
          <span
            className="font-mono text-[12px]"
            style={{ color: P.textSecondary }}
          >
            search skills.sh — &quot;code&quot;
          </span>
        </div>

        {/* Results */}
        <div className="divide-y" style={{ borderColor: P.borderLight }}>
          {CATALOG.map((r, i) => (
            <div
              key={r.name}
              className="flex items-start gap-2 px-3 py-2.5 opacity-0"
              style={{
                animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
                animationDelay: `${300 + i * 120}ms`,
              }}
            >
              <Sparkles
                className="h-3 w-3 mt-1 shrink-0"
                style={{ color: P.accent }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[12.5px] font-semibold truncate"
                    style={{ color: P.text }}
                  >
                    {r.name}
                  </span>
                  <span
                    className="text-[10px] font-mono"
                    style={{ color: P.textTertiary }}
                  >
                    {r.source}
                  </span>
                </div>
                <p
                  className="mt-0.5 text-[11px] leading-snug"
                  style={{ color: P.textSecondary }}
                >
                  {r.description}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                    style={{
                      background: P.accentBg,
                      color: P.accentWarm,
                    }}
                  >
                    <ShieldCheck className="h-2.5 w-2.5" />
                    {r.audits} audits
                  </span>
                  <span
                    className="text-[9.5px]"
                    style={{ color: P.textTertiary }}
                  >
                    {r.installs} installs
                  </span>
                </div>
              </div>
              {i === 0 ? (
                <button
                  className="rounded-md px-2 py-1 text-[10px] font-semibold shrink-0"
                  style={{ background: P.accent, color: P.bgCard }}
                >
                  Install
                </button>
              ) : (
                <button
                  className="rounded-md px-2 py-1 text-[10px] font-semibold shrink-0"
                  style={{
                    background: P.paperWarm,
                    color: P.textSecondary,
                    border: `1px solid ${P.border}`,
                  }}
                >
                  <Plus className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Source line */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            background: P.paperWarm,
            borderTop: `1px solid ${P.border}`,
            borderRadius: "0 0 16px 16px",
          }}
        >
          <Github className="h-3 w-3" style={{ color: P.textTertiary }} />
          <span className="text-[10px] font-mono" style={{ color: P.textTertiary }}>
            github:owner/repo · skills.sh · npx skills add
          </span>
        </div>
      </div>
    </DemoSlideShell>
  );
}

/* ── Slide 2: Attach to an agent (or @-mention) ─────────────────────── */

function SlideAttach() {
  const { t } = useLocale();
  const personaSkills = ["code-review-excellence", "seo-research"];

  return (
    <DemoSlideShell
      reversed
      title={
        <>
          <span style={{ color: P.accent }}>{t("demosPlus:attach")}</span> to an agent.
        </>
      }
      description={
        <>
          Add skills to a persona&apos;s{" "}
          <code style={{ background: P.paperWarm, padding: "1px 6px", borderRadius: 4 }}>
            skills:
          </code>{" "}
          list and they&apos;re mounted on every run. Or skip the persona —{" "}
          <code style={{ background: P.paperWarm, padding: "1px 6px", borderRadius: 4 }}>
            @
          </code>
          -mention a skill in any composer to attach it for that single run.
        </>
      }
    >
      <div
        className="rounded-2xl px-4 py-4"
        style={{
          width: 380,
          background: P.bgCard,
          border: `1px solid ${P.border}`,
          boxShadow: "0 14px 32px -16px rgba(59,47,47,0.18)",
        }}
      >
        {/* Persona header */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[18px]">🧑‍💻</span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: P.text }}>
              Code Reviewer
            </p>
            <p className="text-[11px]" style={{ color: P.textTertiary }}>
              Persona · code-reviewer
            </p>
          </div>
        </div>

        {/* Attached skills */}
        <div
          className="mb-3 px-3 py-2.5 rounded-lg"
          style={{ background: P.paperWarm, border: `1px solid ${P.borderLight}` }}
        >
          <p
            className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-wider"
            style={{ color: P.textTertiary }}
          >
            Attached skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {personaSkills.map((s, i) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] opacity-0"
                style={{
                  background: P.accentBg,
                  color: P.accentWarm,
                  animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                  animationDelay: `${300 + i * 120}ms`,
                }}
              >
                <Sparkles className="h-2.5 w-2.5" />
                {s}
                <Check className="h-2.5 w-2.5" />
              </span>
            ))}
          </div>
        </div>

        {/* Suggested */}
        <div
          className="px-3 py-2.5 rounded-lg"
          style={{ border: `1px dashed ${P.border}` }}
        >
          <p
            className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-wider"
            style={{ color: P.textTertiary }}
          >
            Suggested for this role
          </p>
          <div className="flex flex-wrap gap-1.5">
            {["pr-review-expert", "tdd-guide"].map((s, i) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] opacity-0"
                style={{
                  background: P.bgCard,
                  color: P.textSecondary,
                  border: `1px solid ${P.border}`,
                  animation: "cabinet-tour-fade-up 0.35s ease-out forwards",
                  animationDelay: `${600 + i * 120}ms`,
                }}
              >
                <Sparkles className="h-2.5 w-2.5" style={{ color: P.accent }} />
                {s}
                <Plus className="h-2.5 w-2.5" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </DemoSlideShell>
  );
}

/* ── Slide 3: @-mention in any composer ─────────────────────────────── */

function SlideMention() {
  return (
    <DemoSlideShell
      title={
        <>
          Or <span style={{ color: P.accent }}>@-mention</span> in the composer.
        </>
      }
      description={
        <>
          Type{" "}
          <code style={{ background: P.paperWarm, padding: "1px 6px", borderRadius: 4 }}>
            @
          </code>{" "}
          in any composer and pick a skill from the dropdown alongside agents
          and pages. The skill mounts for that one run only — never persisted
          to the persona, no permanent change.
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
        {/* Mention dropdown — visible above the composer */}
        <div className="px-2 py-2 border-b" style={{ borderColor: P.borderLight }}>
          <p
            className="px-2 py-1 text-[8.5px] font-semibold uppercase tracking-wider"
            style={{ color: P.textTertiary }}
          >
            Skills
          </p>
          <div className="space-y-0.5">
            {[
              { name: "code-review-excellence", desc: "Master code review practices." },
              { name: "seo-research", desc: "Keyword research, SERP analysis." },
            ].map((s, i) => (
              <div
                key={s.name}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 opacity-0"
                style={{
                  background: i === 0 ? P.accentBg : "transparent",
                  animation: "cabinet-tour-fade-up 0.3s ease-out forwards",
                  animationDelay: `${250 + i * 120}ms`,
                }}
              >
                <Sparkles
                  className="h-3 w-3 shrink-0"
                  style={{ color: P.accent }}
                />
                <span
                  className="text-[11px] font-semibold shrink-0"
                  style={{ color: P.text }}
                >
                  {s.name}
                </span>
                <span
                  className="ml-auto truncate text-[10px]"
                  style={{ color: P.textTertiary }}
                >
                  {s.desc}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Composer body */}
        <div className="px-3 py-3">
          <p className="text-[12.5px]" style={{ color: P.text }}>
            review my latest commit{" "}
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
              style={{ background: P.accentBg, color: P.accentWarm }}
            >
              <AtSign className="h-2.5 w-2.5" />
              code-review-excellence
            </span>
          </p>
        </div>

        {/* Composer chrome footer */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{
            background: P.paperWarm,
            borderTop: `1px solid ${P.border}`,
            borderRadius: "0 0 16px 16px",
          }}
        >
          <span className="text-[9.5px]" style={{ color: P.textTertiary }}>
            ⌘↵ to send · @ to mention
          </span>
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: P.accent, color: P.bgCard }}
          >
            Send
          </span>
        </div>
      </div>
    </DemoSlideShell>
  );
}

export function buildSkillsDemo(): DemoConfig {
  return {
    id: "skills",
    ariaLabel: "Skills — guided demo",
    slides: [
      { id: "what-is-skill", render: () => <SlideWhatIsSkill /> },
      { id: "install", render: () => <SlideInstall /> },
      { id: "attach", render: () => <SlideAttach /> },
      { id: "mention", render: () => <SlideMention /> },
    ],
  };
}

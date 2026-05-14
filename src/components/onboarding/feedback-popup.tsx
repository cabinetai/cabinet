"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  StarExplosion,
  formatGithubStars,
} from "@/components/layout/star-explosion";
import { useGithubStatsStore } from "@/stores/github-stats-store";
import { useLocale } from "@/i18n/use-locale";

const LAUNCH_COUNT_KEY = "cabinet.feedback.launchCount";
const PROMPTED_AT_2_KEY = "cabinet.feedback.promptedAt2";
const PROMPTED_AT_6_KEY = "cabinet.feedback.promptedAt6";
const SESSION_COUNTED_KEY = "cabinet.session.launchCounted";
const DISCORD_URL = "https://discord.gg/hJa5TRTbTH";
const GITHUB_REPO_URL = "https://github.com/hilash/cabinet";
const POPUP_DEFER_MS = 5000;
// Cabinet-backend ingestion endpoint. Best-effort forward; the local JSONL
// row is the durable copy. See cabinet-backend/FEEDBACK.md.
const FEEDBACK_FORWARD_URL = "https://reports.runcabinet.com/feedback";

type Trigger = 2 | 6;

// Free-text length caps that match the backend (cabinet-backend FEEDBACK.md):
// q1/q2 stay short enough to be readable as quotes in the dashboard, and the
// background field is the new free-text replacement for the v1 select.
const Q_MAX = 500;
const BACKGROUND_MAX = 200;

const COPY: Record<
  Trigger,
  {
    lead: string;
    q1: string;
    q1Hint: string;
    q2: string;
    q2Hint: string;
  }
> = {
  2: {
    lead:
      "You've opened Cabinet a couple of times. Thank you! Cabinet is open source and just getting started, so what you say here actually changes what gets built next.",
    q1: "What were you trying to do in Cabinet today?",
    q1Hint: "One sentence is fine. What you opened it for, not what you wished it could do.",
    q2: "Last time you wanted to do that, what did you use instead of Cabinet?",
    q2Hint: "Any tool, app, or doc, even pen and paper.",
  },
  6: {
    lead:
      "You're back, and that's the signal that matters most. I want to hear about the rough edges before you forget them.",
    q1: "What were you trying to do in Cabinet today?",
    q1Hint: "One sentence is fine.",
    q2: "What's the one thing that almost made you stop using Cabinet this week?",
    q2Hint: "The thing that bugged you most. Be specific. \"X was confusing\" beats \"the UX\".",
  },
};

// Floating background emojis. Cabinet's "your files on your disk" vibe:
// stationery, warmth, a little spark. Same animation pattern as
// `src/components/help/demos/skills-demo.tsx`.
interface FloatingEmoji {
  glyph: string;
  x: number; // % of viewport
  y: number; // % of viewport
  size: number; // px
  rotate: number;
  variant: "a" | "b" | "c";
  delay: number; // ms
}

const FLOATING_EMOJIS: FloatingEmoji[] = [
  { glyph: "✨", x: 6, y: 12, size: 64, rotate: -8, variant: "a", delay: 0 },
  { glyph: "📝", x: 18, y: 78, size: 72, rotate: 6, variant: "b", delay: 200 },
  { glyph: "💌", x: 88, y: 18, size: 68, rotate: 12, variant: "c", delay: 400 },
  { glyph: "💡", x: 10, y: 50, size: 58, rotate: -4, variant: "b", delay: 600 },
  { glyph: "☕", x: 86, y: 78, size: 76, rotate: -10, variant: "a", delay: 100 },
  { glyph: "🌱", x: 82, y: 48, size: 56, rotate: 8, variant: "c", delay: 300 },
  { glyph: "❤️", x: 50, y: 6, size: 52, rotate: -6, variant: "b", delay: 500 },
  { glyph: "🌟", x: 50, y: 92, size: 56, rotate: 10, variant: "a", delay: 250 },
];

function getCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(LAUNCH_COUNT_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function bumpLaunchCountOncePerSession(): number {
  if (typeof window === "undefined") return 0;
  try {
    if (window.sessionStorage.getItem(SESSION_COUNTED_KEY) === "1") {
      return getCount();
    }
    const next = getCount() + 1;
    window.localStorage.setItem(LAUNCH_COUNT_KEY, String(next));
    window.sessionStorage.setItem(SESSION_COUNTED_KEY, "1");
    return next;
  } catch {
    return getCount();
  }
}

function pickTrigger(count: number): Trigger | null {
  if (count >= 6 && window.localStorage.getItem(PROMPTED_AT_6_KEY) !== "1") {
    return 6;
  }
  if (count >= 2 && window.localStorage.getItem(PROMPTED_AT_2_KEY) !== "1") {
    return 2;
  }
  return null;
}

function deferIfNeeded(): boolean {
  // Modal-already-open: any Radix/Base-UI dialog is open right now.
  if (
    typeof document !== "undefined" &&
    document.querySelector('[role="dialog"], [data-state="open"][aria-modal="true"]')
  ) {
    return true;
  }
  // Browsers don't expose ongoing display capture to non-owners, so we can't
  // detect Zoom/Meet/Loom from outside their tab. Skip the heuristic in v1.
  return false;
}

interface PopupProps {
  trigger: Trigger;
  launchCount: number;
  onClose: () => void;
}

function FeedbackForm({ trigger, launchCount, onClose }: PopupProps) {
  const { t } = useLocale();
  const [rating, setRating] = useState<number>(0);
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [background, setBackground] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // GitHub stars: same shared store the status-bar uses, so a single fetch
  // services both surfaces. The count-up + burst sequence mirrors the status
  // bar's chip — when stars finally land, animate from 0 to N over 1.6s and
  // fire the StarExplosion when the count reaches the target.
  const githubStars = useGithubStatsStore((s) => s.stars);
  const fetchStars = useGithubStatsStore((s) => s.fetchStars);
  const hasFetchedStarsOnce = useGithubStatsStore((s) => s.hasFetchedOnce);
  const [displayStars, setDisplayStars] = useState<number | null>(githubStars);
  const [starsExploding, setStarsExploding] = useState(false);
  const starsAnimRef = useRef<number | null>(null);
  const starsAnimated = useRef(hasFetchedStarsOnce);

  useEffect(() => {
    if (!hasFetchedStarsOnce) void fetchStars();
  }, [fetchStars, hasFetchedStarsOnce]);

  useEffect(() => {
    if (githubStars === null) return;
    if (starsAnimated.current) {
      // Already animated once during this session — sync without re-running.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayStars(githubStars);
      return;
    }
    starsAnimated.current = true;
    const target = githubStars;
    const duration = 1600;
    const startTime = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayStars(Math.round(target * eased));
      if (progress < 1) {
        starsAnimRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayStars(target);
        setStarsExploding(true);
        window.setTimeout(() => setStarsExploding(false), 900);
      }
    };
    starsAnimRef.current = requestAnimationFrame(tick);
    return () => {
      if (starsAnimRef.current !== null) cancelAnimationFrame(starsAnimRef.current);
    };
  }, [githubStars]);

  const copy = COPY[trigger];

  const submit = async () => {
    if (rating < 1) return;
    setSubmitting(true);
    const payload = {
      rating,
      q1: q1.trim(),
      q2: q2.trim(),
      background: background || null,
      promptedAt: trigger,
      appVersion:
        typeof window !== "undefined"
          ? (window as unknown as { __CABINET_VERSION__?: string }).__CABINET_VERSION__ || null
          : null,
      platform:
        typeof navigator !== "undefined" ? navigator.platform : null,
      launchCount,
    };
    // Local-first: always write to <DATA_DIR>/.cabinet-meta/feedback.jsonl
    // via the local server, so the user keeps their own copy.
    fetch("/api/system/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
    // Best-effort forward to cabinet-backend so it shows up on
    // reports.runcabinet.com → Feedback tab. Failure is silent — the local
    // JSONL row is the durable copy. See cabinet-backend/FEEDBACK.md.
    fetch(FEEDBACK_FORWARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      mode: "cors",
    }).catch(() => {});

    try {
      window.localStorage.setItem(
        trigger === 2 ? PROMPTED_AT_2_KEY : PROMPTED_AT_6_KEY,
        "1"
      );
    } catch {
      // ignore
    }
    window.dispatchEvent(
      new CustomEvent("cabinet:toast", {
        detail: {
          kind: "success",
          message: "Thanks! That lands directly with Hila.",
        },
      })
    );
    setSubmitting(false);
    onClose();
  };

  const dismiss = () => {
    // "Maybe later" does NOT flip the prompted-at flag, so it fires again on
    // the next launch within the same trigger bracket.
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-background/70 backdrop-blur-md overflow-hidden">
      <style>{`
        @keyframes cabinet-feedback-float-a {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes cabinet-feedback-float-b {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes cabinet-feedback-float-c {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }
        @keyframes cabinet-feedback-pop-in {
          0% { opacity: 0; transform: scale(0.6); }
          100% { opacity: 0.7; transform: scale(1); }
        }
      `}</style>

      {/* Floating emoji ambiance behind the modal. Decorative only. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {FLOATING_EMOJIS.map((e, i) => (
          <span
            key={i}
            className="absolute select-none"
            style={{
              left: `${e.x}%`,
              top: `${e.y}%`,
              fontSize: e.size,
              transform: `rotate(${e.rotate}deg)`,
              opacity: 0,
              filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.05))",
              animation: `cabinet-feedback-pop-in 0.6s ease-out ${e.delay}ms forwards, cabinet-feedback-float-${e.variant} ${4 + i * 0.3}s ease-in-out ${800 + i * 120}ms infinite`,
            }}
          >
            {e.glyph}
          </span>
        ))}
      </div>

      <div className="relative max-w-lg w-[92vw] rounded-xl border border-border bg-card p-6 shadow-xl">
        <button
          type="button"
          aria-label={t("feedback:close")}
          className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4">
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/70 mb-1">
            Quick check-in from Hila
          </div>
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            {copy.lead}
          </p>
        </div>

        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <label className="block text-[12px] font-medium mb-2">
              How&apos;s it going so far?
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  className={cn(
                    "rounded-md p-1 transition-colors",
                    n <= rating
                      ? "text-amber-400 hover:text-amber-500"
                      : "text-muted-foreground/40 hover:text-muted-foreground/60"
                  )}
                >
                  <Star
                    className={cn("h-5 w-5", n <= rating && "fill-current")}
                  />
                </button>
              ))}
            </div>
          </div>
          {/* Compact GitHub-star CTA — pinned to the right of the rating row,
              with a short prompt above mirroring the rating's "How's it going
              so far?" question. Same store + count-up + burst as the
              status-bar chip. */}
          <div className="flex flex-col items-end gap-2">
            <span className="text-[12px] font-medium text-muted-foreground">
              Like Cabinet?
            </span>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              title={
                displayStars === null
                  ? "Star Cabinet on GitHub — if it's useful to you, a star really helps"
                  : `${formatGithubStars(displayStars)} GitHub stars — click to add yours`
              }
              className="relative inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-500/15 hover:border-amber-500/50"
            >
              {starsExploding && <StarExplosion />}
              <Star className="h-3 w-3 fill-current" />
              <span className="tabular-nums">
                {displayStars === null ? "Star" : formatGithubStars(displayStars)}
              </span>
            </a>
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-[12px] font-medium mb-1">
            {copy.q1}
          </label>
          <textarea
            value={q1}
            onChange={(e) => setQ1(e.target.value.slice(0, Q_MAX))}
            placeholder={copy.q1Hint}
            rows={2}
            maxLength={Q_MAX}
            className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px] resize-none focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
          <div className="mt-0.5 text-right text-[10.5px] text-muted-foreground/60">
            {q1.length} / {Q_MAX}
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-[12px] font-medium mb-1">
            {copy.q2}
          </label>
          <textarea
            value={q2}
            onChange={(e) => setQ2(e.target.value.slice(0, Q_MAX))}
            placeholder={copy.q2Hint}
            rows={2}
            maxLength={Q_MAX}
            className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px] resize-none focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
          <div className="mt-0.5 text-right text-[10.5px] text-muted-foreground/60">
            {q2.length} / {Q_MAX}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-[12px] font-medium mb-1">
            What&apos;s your background?{" "}
            <span className="text-muted-foreground/70 font-normal">
              (optional)
            </span>
          </label>
          <input
            type="text"
            value={background}
            onChange={(e) => setBackground(e.target.value.slice(0, BACKGROUND_MAX))}
            placeholder={t("feedback:rolePlaceholder")}
            maxLength={BACKGROUND_MAX}
            className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
          <div className="mt-0.5 text-right text-[10.5px] text-muted-foreground/60">
            {background.length} / {BACKGROUND_MAX}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-border/60">
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            Want to talk directly, or hang with other Cabinet members?
            {" "}
            <span className="underline">{t("feedback:joinDiscord")}</span> →
          </a>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={dismiss} disabled={submitting}>
              Maybe later
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={submitting || rating < 1}
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeedbackPopup() {
  const [trigger, setTrigger] = useState<Trigger | null>(null);

  const evaluate = useCallback(() => {
    if (typeof window === "undefined") return;
    const count = getCount();
    const t = pickTrigger(count);
    if (!t) return;
    if (deferIfNeeded()) return;
    setTrigger(t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    bumpLaunchCountOncePerSession();
    // Wait POPUP_DEFER_MS before evaluating; gives the user time to actually
    // see the app and avoids ambushing the very first thing they see.
    const t = window.setTimeout(evaluate, POPUP_DEFER_MS);
    return () => window.clearTimeout(t);
  }, [evaluate]);

  if (!trigger) return null;

  return (
    <FeedbackForm
      trigger={trigger}
      launchCount={getCount()}
      onClose={() => setTrigger(null)}
    />
  );
}

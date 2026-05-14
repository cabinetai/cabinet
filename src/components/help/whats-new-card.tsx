"use client";

import { useEffect, useState } from "react";
import { Sparkles, X, ExternalLink } from "lucide-react";
import { version as pkgVersion } from "../../../package.json";
import { useLocale } from "@/i18n/use-locale";

// Audit #057: lightweight "What's new" card for the home screen. Compares
// the current package.json version to the user's lastSeenVersion in
// localStorage and surfaces a dismissible card with that release's
// highlights. Dismissing pins lastSeenVersion to the current value so the
// card doesn't return until the next upgrade.
//
// Maintenance: when releasing a new version, prepend an entry to
// RELEASE_HIGHLIGHTS below. Keep bullets to 3–5 user-visible items; deeper
// reading lives in CHANGELOG.md / the GitHub release page.

interface ReleaseEntry {
  version: string;
  date: string;
  headline?: string;
  bullets: string[];
}

const RELEASE_HIGHLIGHTS: ReleaseEntry[] = [
  {
    version: "0.4.3",
    date: "2026-04-30",
    headline: "First fully working DMG since v0.3.4",
    bullets: [
      "🟡 Hardened-runtime entitlements unblock the daemon's native modules in signed builds",
      "🔵 Website Download links direct to the v0.4.3 DMG",
    ],
  },
  {
    version: "0.4.2",
    date: "2026-04-30",
    bullets: [
      "🟡 Daemon no longer crashes on Electron startup",
      "🟢 Settings → About → Uninstall Cabinet (macOS)",
    ],
  },
  {
    version: "0.4.1",
    date: "2026-04-30",
    bullets: [
      "🟢 AgentPicker in the home composer with an Auto sentinel",
      "🔵 Every agent dispatches by default; home shows all 9 quick-action chips",
      "🟡 /api/cabinets/overview 404 silenced; onboarding font fallback restored",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-04-30",
    headline: "Biggest release yet — 433 commits since v0.3.4",
    bullets: [
      "🟣 Skills system — installable agent skills, tiered trust, registry page",
      "🟣 Multi-provider runtime — 8 CLI providers with shared runtime picker",
      "🟢 Tasks Board v2 — drag-and-drop, undo, multi-select, lane filters",
      "🟢 Search palette — Cmd+K opens a 2-pane FlexSearch-backed surface",
      "🟢 Themes — Windows 95, Windows XP, Matrix, Apple",
    ],
  },
];

const STORAGE_KEY = "cabinet.last-seen-version";

function findReleaseFor(version: string): ReleaseEntry | null {
  return RELEASE_HIGHLIGHTS.find((r) => r.version === version) ?? null;
}

export function WhatsNewCard() {
  const { t } = useLocale();
  const [show, setShow] = useState(false);
  const [release, setRelease] = useState<ReleaseEntry | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastSeen: string | null = null;
    try {
      lastSeen = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Quota / private mode — fall through and show the card.
    }
    if (lastSeen === pkgVersion) return; // Up to date.
    const entry = findReleaseFor(pkgVersion);
    if (!entry) {
      // No bullets for the current version — silently advance the watermark
      // so we don't show an empty card after every minor patch.
      try {
        window.localStorage.setItem(STORAGE_KEY, pkgVersion);
      } catch {
        // Non-fatal.
      }
      return;
    }
    setRelease(entry);
    setShow(true);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, pkgVersion);
    } catch {
      // Non-fatal — banner stays dismissed for the session at least.
    }
  };

  if (!show || !release) return null;

  return (
    <div className="pointer-events-auto fixed right-4 bottom-12 z-40 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-3 shadow-2xl ring-1 ring-foreground/10">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold">
              What&rsquo;s new in v{release.version}
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              {release.date}
            </span>
          </div>
          {release.headline && (
            <p className="text-[12px] text-muted-foreground">
              {release.headline}
            </p>
          )}
          <ul className="mt-1 flex list-none flex-col gap-1 text-[11.5px] leading-snug">
            {release.bullets.map((b, idx) => (
              <li key={idx} className="text-foreground/85">
                {b}
              </li>
            ))}
          </ul>
          <a
            href={`https://github.com/hilash/cabinet/releases/tag/v${release.version}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 underline-offset-2 hover:underline"
          >
            Read full release notes
            <ExternalLink className="size-3" />
          </a>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("whatsNew:dismiss")}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

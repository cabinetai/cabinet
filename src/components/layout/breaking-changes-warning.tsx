"use client";

import { useEffect, useState } from "react";
import { Heart, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/use-locale";

// Bump when the disclaimer text materially changes — older acks become
// invalid and the user gets re-prompted with the new copy.
const DISCLAIMER_VERSION = "v3";
const STORAGE_KEY = `cabinet.breaking-changes-warning-ack:${DISCLAIMER_VERSION}`;
const SERVER_ENDPOINT = "/api/disclaimer";

export const DISCLAIMER_ACKED_EVENT = "cabinet:disclaimer-acked";

export function isDisclaimerAcknowledged(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return true;
  }
}

export function acknowledgeDisclaimer() {
  const acceptedAt = new Date().toISOString();
  try { localStorage.setItem(STORAGE_KEY, acceptedAt); } catch { /* noop */ }
  void fetch(SERVER_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: DISCLAIMER_VERSION, acceptedAt }),
  }).catch(() => { /* server unreachable — local ack still holds */ });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DISCLAIMER_ACKED_EVENT));
  }
}

export function BreakingChangesWarning() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Dev shortcut: ?disclaimer=1 forces the popup open regardless of ack state
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("disclaimer") === "1") {
      setOpen(true);
      return;
    }

    let local: string | null = null;
    try { local = localStorage.getItem(STORAGE_KEY); } catch { /* private mode */ }
    if (local) return;

    // No local ack — check server before showing. Survives browser-storage
    // clears and browser switches on the same install.
    void fetch(`${SERVER_ENDPOINT}?v=${DISCLAIMER_VERSION}`, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) { setOpen(true); return; }
        const data = (await res.json()) as { acked?: boolean; acceptedAt?: string };
        if (data.acked) {
          try { localStorage.setItem(STORAGE_KEY, data.acceptedAt || new Date().toISOString()); } catch { /* ignore */ }
          window.dispatchEvent(new CustomEvent(DISCLAIMER_ACKED_EVENT));
        } else {
          setOpen(true);
        }
      })
      .catch(() => { if (!cancelled) setOpen(true); });

    return () => { cancelled = true; };
  }, []);

  const acknowledge = () => {
    acknowledgeDisclaimer();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v, details) => {
        if (v) return;
        const reason = details?.reason;
        if (reason === "escape-key" || reason === "outside-press") {
          details?.cancel?.();
          return;
        }
        acknowledge();
      }}
    >
      <DialogContent className="sm:max-w-xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            Before you get started
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Cabinet is in active development. Here&apos;s what you&apos;re signing up for.
          </p>

          <ul className="space-y-3">
            <li className="flex gap-3">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/30" aria-hidden />
              <span className="text-muted-foreground">
                <strong className="font-medium text-foreground">{t("breakingChanges:agentsFullAccess")}</strong>{" "}
                Cabinet uses{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">--dangerously-skip-permissions</code>{" "}
                (Claude Code) and equivalent flags in other providers. This is identical to running these CLI
                tools from your own terminal. Any MCP servers or tools you&apos;ve configured may be
                invoked automatically by agents.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/30" aria-hidden />
              <span className="text-muted-foreground">
                <strong className="font-medium text-foreground">{t("breakingChanges:backUp")}</strong>{" "}
                Agents can read, write, and delete files across your KB and linked repos. Cabinet is
                not responsible for data loss. You are responsible for the AI providers you choose
                and their terms of service.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/30" aria-hidden />
              <span className="text-muted-foreground">
                <strong className="font-medium text-foreground">{t("breakingChanges:betaSoftware")}</strong>{" "}
                We ship fast. Breaking changes can land without notice.
              </span>
            </li>
          </ul>

          <label className="flex cursor-pointer items-start gap-2 pt-1 text-foreground">
            <input
              type="checkbox"
              name="disclaimer-accept"
              aria-label={t("breakingChanges:iAccept")}
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border border-border accent-foreground"
            />
            <span>{t("breakingChangesPlus:iUnderstand")}</span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-muted-foreground/70">
            By continuing you agree to our{" "}
            <a href="https://runcabinet.com/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">Terms</a>
            {" "}and{" "}
            <a href="https://runcabinet.com/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">Privacy</a>.
            {" "}Cabinet is an{" "}
            <a href="https://github.com/hilash/cabinet" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">open-source project</a>
            .
          </p>
          <Button onClick={acknowledge} disabled={!accepted}>
            Continue
          </Button>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60">
          Thanks for being here{" "}
          <Heart className="inline h-3 w-3 text-rose-400" fill="currentColor" />
        </p>
      </DialogContent>
    </Dialog>
  );
}

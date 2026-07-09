"use client";

import { useEffect, useState } from "react";
import { Sparkles, ExternalLink } from "lucide-react";

// Hosted-edition (CABINET_CLOUD=1) affordance: until the tenant's Claude
// credentials are provisioned, agents can't run — so prompt the user to connect
// Claude. The action opens the panel's /connect flow, which walks them through
// `claude setup-token` and writes the credential into the container via the
// host agent. Mirrors DaemonHealthBanner's placement/styling (a rounded card on
// the desk gutter, aligned to the content sheet); accent-toned instead of
// destructive because this is a setup nudge, not an error.
//
// Renders nothing outside cloud mode or once Claude is connected, so it's inert
// for every local/desktop install.
//
// i18n: cloud is an English-first beta; copy is inline for now (extract to the
// locale bundles when the hosted UI is localized).

interface CloudStatus {
  cloud: boolean;
  claudeConnected: boolean;
  panelUrl: string | null;
  tier?: "free" | "pro";
}

export function CloudConnectClaudeBanner() {
  const [status, setStatus] = useState<CloudStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/cloud/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as CloudStatus;
        if (!cancelled) setStatus(data);
      } catch {
        /* not cloud / offline — stay hidden */
      }
    };
    void check();
    // Re-check when the user returns from the panel's connect tab, so the banner
    // clears itself the moment the credential lands (no manual reload needed).
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Free tier can't run agents at all, so "connect Claude to power your agents" is both pointless and
  // contradicts the "AI is paused — upgrade" banner. Hide it; the upgrade nudge is the only CTA there.
  if (!status || !status.cloud || status.claudeConnected || status.tier === "free") return null;

  const connectHref = status.panelUrl
    ? `${status.panelUrl.replace(/\/$/, "")}/connect`
    : null;

  return (
    <div
      role="status"
      className="ms-2.5 mt-2 mb-1.5 flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/[0.06] px-3.5 py-2.5 text-[12px] text-foreground shadow-sm"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">Connect Claude to power your agents</span>
        <span className="ms-2 text-muted-foreground">
          Your agents need a Claude subscription. Connect once to start running tasks.
        </span>
      </div>
      {connectHref ? (
        <a
          href={connectHref}
          target="_blank"
          rel="noopener noreferrer"
          className="-my-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Connect Claude
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      ) : (
        // No panel URL configured — fall back to the terminal command the user
        // can run inside their cabinet to provision the token.
        <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 font-mono text-[11px] text-muted-foreground">
          claude setup-token
        </span>
      )}
    </div>
  );
}

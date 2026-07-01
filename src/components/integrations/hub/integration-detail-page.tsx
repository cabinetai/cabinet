"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, Check, Lock, Sparkles, ShieldCheck, Bell, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { showSuccess } from "@/lib/ui/toast";
import { ConnectPanel } from "@/components/integrations/hub/connect-panel";
import { AppleNotesSection } from "@/components/settings/apple-notes-section";
import { GoogleDriveSection } from "@/components/settings/google-drive-section";
import { GmailSection } from "@/components/settings/gmail-section";
import { SetupGuide } from "@/components/integrations/hub/setup-guide";
import { stepArtFor } from "@/components/integrations/hub/generic-setup-art";
import { getCatalogEntry } from "@/lib/agents/mcp-catalog";
import {
  CATEGORY_META,
  type IntegrationItem,
} from "@/lib/integrations/preview-catalog";
import {
  LogoTile,
  brandFace,
} from "@/components/integrations/hub/integration-visuals";

/**
 * Full-page configuration view for a single integration. Opened in place of
 * the browse grid (no modal) when a card is clicked.
 *
 * Built for non-developers: a high-contrast logo tile, a friendly trust note
 * (the MCP/CLI detail tucked into a "For developers" disclosure), and a
 * step-by-step setup guide with mini-mockups of the third-party UI. The static
 * connect data (steps, tier) is read straight from the MCP catalog; the
 * ConnectPanel handles the live runtime state.
 */
/** Sub-product cards that can only be delivered by a work/school account. */
const M365_WORK_ONLY_VIA = new Set(["microsoft-teams", "sharepoint"]);

/**
 * Microsoft 365 capabilities, tagged by whether they need a work/school account.
 * Rendered as the full list so the personal/work choice and its consequences are
 * visible (work-only rows show locked in Personal mode) instead of the list
 * silently changing under the user.
 */
const M365_CAPABILITIES: { label: string; workOnly: boolean }[] = [
  { label: "Outlook mail & calendar", workOnly: false },
  { label: "OneDrive files", workOnly: false },
  { label: "Teams messages", workOnly: true },
  { label: "SharePoint files", workOnly: true },
];

export function IntegrationDetailPage({
  item,
  via,
  onBack,
}: {
  item: IntegrationItem;
  /** The sub-product card the user clicked to reach this suite page, if any. */
  via?: string | null;
  onBack: () => void;
}) {
  const category = CATEGORY_META[item.category].label;
  const entry = getCatalogEntry(item.id);
  // Microsoft 365 has a personal/work toggle in the ConnectPanel; we lift it
  // here so the left-hand setup guide and capability list can react to it.
  const isM365 = item.id === "microsoft-365";
  // Teams and SharePoint are work/school-only, so a user who clicked those
  // cards should land in Work mode (Personal simply can't deliver them).
  const msWorkOnly = isM365 && !!via && M365_WORK_ONLY_VIA.has(via);
  const [msMode, setMsMode] = useState<"personal" | "work">(
    msWorkOnly ? "work" : "personal",
  );
  const m365Personal = isM365 && msMode === "personal";
  // MCP connectors get setup steps from the catalog; native integrations carry
  // their own on the catalog item.
  const setupSteps = entry?.setupSteps ?? item.setupSteps;

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Hero with brand-tinted backdrop */}
      <div className="relative border-b border-border" style={{ background: brandFace(item.brand) }}>
        <div className="mx-auto max-w-4xl px-6 pb-8 pt-5">
          <button
            type="button"
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All integrations
          </button>

          <div className="flex items-start gap-5">
            {/* White tile keeps the mark high-contrast on any brand colour. */}
            <LogoTile
              item={item}
              size={80}
              logoSize={44}
              className="rounded-3xl shadow-lg ring-1 ring-black/5"
            />

            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {item.name}
                </h1>
                {item.implemented ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" /> Available now
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-foreground/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground/80">
                    Coming soon
                  </span>
                )}
                {entry && <TierBadge tier={entry.trustTier} />}
              </div>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
                {item.blurb}
              </p>
              <p className="mt-2 text-[12px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {category}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto grid max-w-4xl gap-8 px-6 py-8 lg:grid-cols-[1fr_320px]">
        {/* Left: capabilities + guide */}
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            What your agents can do
          </h2>
          {isM365 && (
            // Tie the list explicitly to the account choice, so it's clear why a
            // row is available or locked.
            <p className="mt-1 text-[12px] text-muted-foreground">
              With a{" "}
              <span className="font-medium text-foreground">
                {m365Personal ? "personal account" : "work or school account"}
              </span>
              :
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {isM365
              ? M365_CAPABILITIES.map(({ label, workOnly }) => {
                  const locked = workOnly && m365Personal;
                  return (
                    <li key={label} className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{ background: locked ? undefined : `${item.brand}1f` }}
                      >
                        {locked ? (
                          <Lock className="h-3 w-3 text-muted-foreground/60" />
                        ) : (
                          <Check className="h-3 w-3" style={{ color: item.brand }} />
                        )}
                      </span>
                      <span
                        className={cn(
                          "flex flex-wrap items-center gap-2 text-[14px]",
                          locked ? "text-muted-foreground/70" : "text-foreground",
                        )}
                      >
                        {label}
                        {locked && (
                          <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Work / school
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })
              : item.actions.map((action) => (
                  <li key={action} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ background: `${item.brand}1f` }}
                    >
                      <Check className="h-3 w-3" style={{ color: item.brand }} />
                    </span>
                    <span className="text-[14px] text-foreground">{action}</span>
                  </li>
                ))}
          </ul>
          {m365Personal && (
            <p className="mt-3 text-[12px] text-muted-foreground">
              The locked items need a work or school account. Switch to{" "}
              <span className="font-medium text-foreground">Work / school app</span>{" "}
              to use them.
            </p>
          )}

          {m365Personal ? (
            <div className="mt-8 rounded-xl border border-border bg-card/50 p-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                No setup needed
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Personal accounts sign in straight with Microsoft. Click{" "}
                <span className="font-medium text-foreground">Sign in with Microsoft</span>,
                enter the code shown, and approve in your browser. No Azure setup
                needed. Choose{" "}
                <span className="font-medium text-foreground">Work / school app</span>{" "}
                if you need to use your organization&apos;s Azure app registration.
              </p>
            </div>
          ) : setupSteps?.length ? (
            <SetupGuide
              steps={setupSteps}
              brand={item.brand}
              art={stepArtFor({
                id: item.id,
                label: item.name,
                brand: item.brand,
                // Native integrations have no MCP catalog entry; stepArtFor
                // matches them by id (e.g. google-drive) before these fields.
                authBackend: entry?.authBackend ?? "",
                transport: entry?.transport ?? "",
                hasUrlCredential: !!entry?.urlCredentialKey,
                scopes: entry?.oauthClient?.scopes,
              })}
            />
          ) : null}

          {entry ? (
            <TrustNote
              variant={
                isM365 ? (m365Personal ? "m365-personal" : "m365-work") : "generic"
              }
            />
          ) : null}
        </div>

        {/* Right: config / status panel */}
        <aside>
          {item.id === "apple-notes" ? (
            <div className="rounded-2xl border border-border bg-card/40 p-5">
              <AppleNotesSection />
            </div>
          ) : item.id === "google-drive" ? (
            // Drive connects via Google Drive for Desktop (folder mounts), not
            // the generic MCP connect flow. OAuth support is noted as upcoming
            // inside this section.
            <div className="rounded-2xl border border-border bg-card/40 p-5">
              <GoogleDriveSection />
            </div>
          ) : item.id === "gmail" ? (
            // Gmail connects over IMAP with a Google App Password (its own
            // routes + skill), not the generic MCP connect flow.
            <div className="rounded-2xl border border-border bg-card/40 p-5">
              <GmailSection />
            </div>
          ) : item.implemented ? (
            <ConnectPanel
              item={item}
              msMode={msMode}
              onMsModeChange={setMsMode}
              msPersonalDisabled={msWorkOnly}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-5 text-center">
              <div
                className="mx-auto flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: `${item.brand}1f` }}
              >
                <Sparkles className="h-5 w-5" style={{ color: item.brand }} />
              </div>
              <h3 className="mt-3 text-[14px] font-semibold text-foreground">
                Not available yet
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                We&apos;re building this connector. Want it sooner?
              </p>
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => showSuccess(`We'll let you know when ${item.name} is ready`)}
              >
                <Bell className="mr-1.5 h-3.5 w-3.5" />
                Notify me
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Trust-tier pill shown in the hero next to the availability badge. */
function TierBadge({ tier }: { tier: string }) {
  if (tier === "official") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <ShieldCheck className="h-3 w-3" /> Official
      </span>
    );
  }
  if (tier === "cabinet") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.05] px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        <Sparkles className="h-3 w-3" /> Maintained by Cabinet
      </span>
    );
  }
  if (tier === "registry") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
        <ShieldCheck className="h-3 w-3" /> Registry-listed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-foreground/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground/80">
      Community
    </span>
  );
}

/**
 * Friendly, non-scary reassurance up front; the MCP/CLI/`.cabinet.env` detail
 * lives behind a "For developers" disclosure for the people who want it.
 */
type TrustVariant = "generic" | "m365-personal" | "m365-work";

const ENV_CODE = (
  <code className="rounded bg-foreground/[0.06] px-1 py-0.5 text-[11px]">.cabinet.env</code>
);

const TRUST_COPY: Record<TrustVariant, { title: string; body: string; dev: ReactNode }> = {
  generic: {
    title: "Your token stays on this device",
    body: "Cabinet saves it locally on your computer and never uploads it anywhere.",
    dev: (
      <>
        Cabinet registers this as an MCP server in your agent CLI&apos;s config. The
        secret is stored in {ENV_CODE} (file perms 0600) and injected into the agent
        process at spawn, never written into the config file itself.
      </>
    ),
  },
  "m365-personal": {
    title: "Your sign-in stays on this device",
    body: "Personal accounts store nothing in Cabinet. Your Microsoft token is cached on this computer by the connector and never uploaded.",
    dev: (
      <>
        Cabinet registers this as an MCP server in your agent CLI&apos;s config. Sign-in
        uses Microsoft device-code; the access/refresh token is cached by{" "}
        <code className="rounded bg-foreground/[0.06] px-1 py-0.5 text-[11px]">
          ms-365-mcp-server
        </code>{" "}
        in your OS credential store (keychain), with a local 0600 file fallback.
        Cabinet never handles the token itself.
      </>
    ),
  },
  "m365-work": {
    title: "Your credentials stay on this device",
    body: "Cabinet saves your Entra app credentials locally on your computer and never uploads them.",
    dev: (
      <>
        Your app credentials are stored in {ENV_CODE} (file perms 0600) and injected
        into the agent at spawn, never written into the CLI config. The runtime
        Microsoft token is cached by the connector in your OS keychain.
      </>
    ),
  },
};

function TrustNote({ variant = "generic" }: { variant?: TrustVariant }) {
  const [open, setOpen] = useState(false);
  const copy = TRUST_COPY[variant];
  return (
    <div className="mt-8 rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        {copy.title}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        {copy.body}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        For developers
      </button>
      {open && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          {copy.dev}
        </p>
      )}
    </div>
  );
}

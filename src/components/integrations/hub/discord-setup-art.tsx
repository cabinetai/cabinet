"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint, MockWindow } from "@/components/integrations/hub/setup-art-primitives";

/**
 * "Mini-mockups" for the Discord setup guide: tiny, theme-aware renditions of
 * the Developer Portal / client screens each step refers to, so a non-developer
 * can see exactly where to click. Pure markup — no screenshots to capture or
 * keep in sync. `step` is the 0-based index into the catalog's Discord
 * `setupSteps`; keep these aligned with that order.
 */
export function DiscordStepArt({ step, brand }: { step: number; brand: string }) {
  switch (step) {
    case 0:
      return (
        <MockWindow title="Discord Developer Portal" brand={brand}>
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">Applications</span>
            <span
              className="rounded-md px-2 py-1 text-[10px] font-semibold text-white"
              style={{ background: brand }}
            >
              + New Application
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="h-5 rounded bg-muted" />
            <div className="h-5 w-3/4 rounded bg-muted" />
          </div>
          <Hint brand={brand}>
            Click <b>New Application</b>, name it, then open the <b>Bot</b> tab.
          </Hint>
        </MockWindow>
      );

    case 1:
      return (
        <MockWindow title="Bot" brand={brand}>
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">MyBot</span>
            <span
              className="rounded-md border px-2 py-0.5 text-[10px] font-medium"
              style={{ borderColor: brand, color: brand }}
            >
              Reset Token
            </span>
          </div>
          <div className="mt-2 rounded-md bg-muted px-2 py-1.5 font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
            •••• •••• •••• ••••
          </div>
          <Hint brand={brand}>
            Click <b>Reset Token</b>, copy it, paste it into the panel on the right →
          </Hint>
        </MockWindow>
      );

    case 2:
      return (
        <MockWindow title="Privileged Gateway Intents" brand={brand}>
          <div className="space-y-1.5">
            <ToggleRow label="Presence Intent" on={false} brand={brand} />
            <ToggleRow label="Server Members Intent" on={false} brand={brand} note="leave off" />
            <ToggleRow label="Message Content Intent" on brand={brand} highlight />
          </div>
          <Hint brand={brand}>
            Turn on <b>Message Content</b> so the bot can read messages.
          </Hint>
        </MockWindow>
      );

    case 3:
      return (
        <MockWindow title="OAuth2 · URL Generator" brand={brand}>
          <SectionLabel>Scopes</SectionLabel>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <CheckPill label="bot" on brand={brand} />
            <CheckPill label="applications.commands" brand={brand} />
          </div>
          <SectionLabel className="mt-2">Bot Permissions</SectionLabel>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            <CheckPill label="View Channels" on brand={brand} />
            <CheckPill label="Send Messages" on brand={brand} />
            <CheckPill label="Create Public Threads" on brand={brand} />
            <CheckPill label="Add Reactions" on brand={brand} />
          </div>
          <div className="mt-2 truncate rounded-md bg-muted px-2 py-1 font-mono text-[9.5px] text-muted-foreground">
            https://discord.com/oauth2/authorize?client_id=…
          </div>
          {/* The consent screen you land on after opening that URL. */}
          <div className="mt-2 flex items-center justify-between rounded-md border border-border bg-card px-2 py-1.5">
            <span className="text-muted-foreground">
              Add to: <span className="font-medium text-foreground">My Server ▾</span>
            </span>
            <span
              className="rounded px-2 py-0.5 text-[10px] font-semibold text-white"
              style={{ background: brand }}
            >
              Authorize
            </span>
          </div>
          <Hint brand={brand}>
            Open the URL, pick your server, then click <b>Authorize</b>.
          </Hint>
        </MockWindow>
      );

    case 4:
      return (
        <MockWindow title="Copy your Server ID" brand={brand}>
          {/* Sub-step 1: Developer Mode must be on or "Copy Server ID" won't appear. */}
          <div className="flex items-center gap-2">
            <StepDot brand={brand}>1</StepDot>
            <span className="text-foreground">Turn on Developer Mode</span>
          </div>
          <div className="mt-1.5 pl-6">
            <div className="mb-1 text-[9.5px] text-muted-foreground">User Settings → Advanced</div>
            <ToggleRow label="Developer Mode" on brand={brand} highlight />
          </div>

          {/* Sub-step 2: now the right-click menu has the option. */}
          <div className="mt-3 flex items-center gap-2">
            <StepDot brand={brand}>2</StepDot>
            <span className="text-foreground">Right-click your server icon</span>
          </div>
          <div className="mt-1.5 flex items-start gap-3 pl-6">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold text-white"
              style={{ background: brand }}
            >
              D
            </span>
            <div className="rounded-md border border-border bg-card py-1 text-[10px] shadow-md">
              <MenuRow>Invite People</MenuRow>
              <div className="mx-1 my-1 border-t border-border" />
              <div
                className="mx-1 flex items-center gap-2 rounded px-2 py-1 font-medium"
                style={{ background: `${brand}14`, color: brand }}
              >
                Copy Server ID
              </div>
            </div>
          </div>

          <Hint brand={brand}>
            Then paste the ID into the <b>Server ID</b> box on the right →
          </Hint>
        </MockWindow>
      );

    default:
      return null;
  }
}

/* ── primitives (Discord-specific; shared ones live in setup-art-primitives) ── */

function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground", className)}>
      {children}
    </div>
  );
}

function MenuRow({ children }: { children: ReactNode }) {
  return <div className="px-3 py-1 text-muted-foreground">{children}</div>;
}

function StepDot({ brand, children }: { brand: string; children: ReactNode }) {
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
      style={{ background: brand }}
    >
      {children}
    </span>
  );
}

function ToggleRow({
  label,
  on,
  brand,
  highlight,
  note,
}: {
  label: string;
  on: boolean;
  brand: string;
  highlight?: boolean;
  note?: string;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-md px-2 py-1.5"
      style={highlight ? { background: `${brand}14` } : undefined}
    >
      <span className="text-foreground">
        {label}
        {note && <span className="ml-1 text-[9.5px] text-muted-foreground">({note})</span>}
      </span>
      <span
        className={cn("relative h-4 w-7 rounded-full transition-colors", !on && "bg-foreground/15")}
        style={on ? { background: brand } : undefined}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm",
            on ? "right-0.5" : "left-0.5",
          )}
        />
      </span>
    </div>
  );
}

function CheckPill({ label, on, brand }: { label: string; on?: boolean; brand: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]",
        !on && "border-border text-muted-foreground",
      )}
      style={on ? { borderColor: brand, color: brand, background: `${brand}10` } : undefined}
    >
      <span
        className={cn(
          "flex h-3 w-3 items-center justify-center rounded-[3px] border",
          !on && "border-current",
        )}
        style={on ? { background: brand, borderColor: brand } : undefined}
      >
        {on && <Check className="h-2 w-2 text-white" />}
      </span>
      {label}
    </span>
  );
}

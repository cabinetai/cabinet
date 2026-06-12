"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Hint, MockWindow } from "@/components/integrations/hub/setup-art-primitives";

/**
 * "Mini-mockups" for the Telegram setup guide — tiny, theme-aware renditions of
 * the @BotFather chat and the Telegram client each step refers to, so a
 * non-developer can see exactly what to do. Pure markup, no screenshots.
 * `step` is the 0-based index into the catalog's Telegram `setupSteps` — keep
 * these aligned with that order.
 */
export function TelegramStepArt({ step, brand }: { step: number; brand: string }) {
  switch (step) {
    case 0: // Create a bot with @BotFather
      return (
        <MockWindow title="@BotFather" brand={brand}>
          <div className="space-y-1.5">
            <Bubble side="right" brand={brand}>/newbot</Bubble>
            <Bubble side="left">Alright! Send me a name for your bot.</Bubble>
            <Bubble side="right" brand={brand}>Cabinet Bot</Bubble>
            <Bubble side="left">
              Done! Use this token to access the API:
              <div className="mt-1 rounded bg-background/70 px-1.5 py-0.5 font-mono text-[9.5px]">
                123456:ABC-DEF1234ghIkl…
              </div>
            </Bubble>
          </div>
          <Hint brand={brand}>
            Copy the token <b>@BotFather</b> sends — you&apos;ll paste it next.
          </Hint>
        </MockWindow>
      );

    case 1: // Paste the bot token
      return (
        <MockWindow title="Bot token" brand={brand}>
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate rounded-md bg-foreground/[0.06] px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
              123456:ABC-DEF1234ghIkl…
            </div>
            <span
              className="rounded-md px-2 py-1 text-[10px] font-semibold text-white"
              style={{ background: brand }}
            >
              Copy
            </span>
          </div>
          <Hint brand={brand}>
            Paste it into the <b>Bot token</b> field on the right →
          </Hint>
        </MockWindow>
      );

    case 2: // Add the bot to your chat
      return (
        <MockWindow title="My Team · Add members" brand={brand}>
          <div className="rounded-md bg-foreground/[0.05] px-2 py-1 text-[10px] text-muted-foreground">
            🔍 Search members
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Avatar brand={brand}>C</Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-foreground">Cabinet Bot</div>
              <div className="text-[9.5px] text-muted-foreground">@CabinetBot · bot</div>
            </div>
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ background: brand }}
            >
              Add
            </span>
          </div>
          <Hint brand={brand}>
            Add the bot. To post in a <b>channel</b>, make it an admin.
          </Hint>
        </MockWindow>
      );

    case 3: // Scope it to one chat
      return (
        <MockWindow title="Chat info" brand={brand}>
          <div className="flex items-center gap-2.5">
            <Avatar brand={brand}>M</Avatar>
            <div>
              <div className="font-medium text-foreground">My Team</div>
              <div className="text-[9.5px] text-muted-foreground">@myteam · 42 members</div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-md bg-foreground/[0.05] px-2 py-1">
            <span className="font-mono text-[10px] text-muted-foreground">-1001234567890</span>
            <span className="text-[10px] font-medium" style={{ color: brand }}>
              Copy
            </span>
          </div>
          <Hint brand={brand}>
            Channels: paste <b>@username</b>. Groups: the numeric <b>id</b> (negative).
          </Hint>
        </MockWindow>
      );

    default:
      return null;
  }
}

/* ── primitives (Telegram-specific; shared ones live in setup-art-primitives) ── */

function Bubble({
  side,
  brand,
  children,
}: {
  side: "left" | "right";
  brand?: string;
  children: ReactNode;
}) {
  const isUser = side === "right";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-2.5 py-1.5 text-[10.5px] leading-snug",
          isUser ? "rounded-br-sm text-white" : "rounded-bl-sm bg-foreground/[0.06] text-foreground",
        )}
        style={isUser ? { background: brand } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function Avatar({ brand, children }: { brand: string; children: ReactNode }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
      style={{ background: brand }}
    >
      {children}
    </span>
  );
}

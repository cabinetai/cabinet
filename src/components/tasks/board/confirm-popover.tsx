"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface PendingConfirm {
  id: string;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Hide the cancel button — use for informational popups with just an OK. */
  infoOnly?: boolean;
  /**
   * If set, the user must type this exact string into a verification input
   * before the confirm button enables. Used for high-blast-radius actions
   * (bulk delete, etc.) per audit #073.
   */
  typedConfirmation?: string;
  onConfirm: () => Promise<void> | void;
}

/**
 * Inline-feeling confirmation prompt for risky drag-and-drop actions.
 * Backdropped but small — docks near the bottom of the board so it doesn't
 * feel like a full modal interrupt. Esc or Cancel dismisses.
 */
export function ConfirmPopover({
  pending,
  onDismiss,
}: {
  pending: PendingConfirm | null;
  onDismiss: () => void;
}) {
  const [typed, setTyped] = useState("");
  const typedInputRef = useRef<HTMLInputElement | null>(null);

  // Reset the typed-confirmation buffer whenever a new prompt mounts.
  useEffect(() => {
    setTyped("");
  }, [pending?.id]);

  // Autofocus the typed-confirmation input when it appears so the user can
  // start typing immediately without an extra click.
  useEffect(() => {
    if (pending?.typedConfirmation) {
      typedInputRef.current?.focus();
    }
  }, [pending?.id, pending?.typedConfirmation]);

  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onDismiss]);

  if (!pending) return null;

  const requiresTyping = !!pending.typedConfirmation;
  const typedMatches =
    !requiresTyping || typed === pending.typedConfirmation;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-background/40 backdrop-blur-[1px]"
        onClick={onDismiss}
      />
      <div className="relative z-10 w-full max-w-sm rounded-lg border border-border/70 bg-card p-4 shadow-xl">
        <h3 className="text-[14px] font-semibold text-foreground">{pending.title}</h3>
        {pending.body && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {pending.body}
          </p>
        )}
        {requiresTyping && (
          <div className="mt-3 space-y-1.5">
            <label
              htmlFor="confirm-typed-input"
              className="block text-[11.5px] text-muted-foreground"
            >
              Type{" "}
              <span className="rounded-sm bg-muted px-1 py-px font-mono text-[11px] text-foreground">
                {pending.typedConfirmation}
              </span>{" "}
              to confirm
            </label>
            <input
              id="confirm-typed-input"
              ref={typedInputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border border-border/60 bg-background px-2 py-1 font-mono text-[12px] text-foreground focus:border-border focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          {!pending.infoOnly && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-md border border-border/60 bg-background px-3 py-1 text-[12px] font-medium text-foreground hover:bg-muted"
            >
              {pending.cancelLabel ?? "Cancel"}
            </button>
          )}
          <button
            type="button"
            disabled={!typedMatches}
            onClick={async () => {
              if (!typedMatches) return;
              try {
                await pending.onConfirm();
              } finally {
                onDismiss();
              }
            }}
            className={cn(
              "rounded-md px-3 py-1 text-[12px] font-medium",
              pending.destructive
                ? "bg-red-500 text-white hover:bg-red-600 disabled:bg-red-500/40 disabled:cursor-not-allowed"
                : "bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground/40 disabled:cursor-not-allowed"
            )}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

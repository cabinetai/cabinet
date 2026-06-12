"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error feedback (PRD §3.5): opened from the Feedback button on error
 * surfaces, pre-filled with the error context. One checkbox controls the
 * log attachment; the preview shows exactly the redacted tail that would
 * be sent. Nothing transmits without the explicit Send press.
 */

const FEEDBACK_FORWARD_URL = "https://reports.runcabinet.com/feedback";
const MESSAGE_MAX = 2000;

export interface ErrorFeedbackContext {
  errorMessage: string;
  errorScope?: string;
  conversationId?: string;
}

interface Props {
  context: ErrorFeedbackContext;
  onClose: () => void;
}

export function ErrorFeedbackDialog({ context, onClose }: Props) {
  const [message, setMessage] = useState("");
  const [attachLogs, setAttachLogs] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [tail, setTail] = useState<string | null>(null);
  const [tailLoading, setTailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch the redacted tail once the user wants it (attachment or preview).
  useEffect(() => {
    if (!attachLogs && !showPreview) return;
    if (tail !== null || tailLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTailLoading(true);
    fetch("/api/system/diagnostics/log-tail?lines=500")
      .then((res) => res.json())
      .then((data: { tail?: string }) => setTail(data.tail ?? ""))
      .catch(() => setTail(""))
      .finally(() => setTailLoading(false));
  }, [attachLogs, showPreview, tail, tailLoading]);

  const submit = async () => {
    setSubmitting(true);
    const base = {
      kind: "error" as const,
      message: message.trim(),
      errorMessage: context.errorMessage,
      errorScope: context.errorScope ?? "",
      conversationId: context.conversationId ?? null,
      logsAttached: attachLogs,
      appVersion:
        typeof window !== "undefined"
          ? (window as unknown as { __CABINET_VERSION__?: string }).__CABINET_VERSION__ || null
          : null,
      platform: typeof navigator !== "undefined" ? navigator.platform : null,
    };
    // Local-first row (flag only, never the bytes).
    fetch("/api/system/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(base),
      keepalive: true,
    }).catch(() => {});
    // Best-effort backend forward; logs ride only here, only when checked.
    fetch(FEEDBACK_FORWARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...base,
        logs: attachLogs ? (tail ?? "") : undefined,
      }),
      keepalive: true,
      mode: "cors",
    }).catch(() => {});

    window.dispatchEvent(
      new CustomEvent("cabinet:toast", {
        detail: { kind: "success", message: "Thanks. The report landed with the team." },
      })
    );
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <div className="relative max-w-lg w-[92vw] rounded-xl border border-border bg-card p-5 shadow-xl">
        <button
          type="button"
          aria-label="Close"
          className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-3">
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/70 mb-1">
            Report a problem
          </div>
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            This goes straight to the team. The error details below are
            included automatically.
          </p>
        </div>

        <div className="mb-3 rounded-md border border-red-500/25 bg-red-500/5 px-2.5 py-2">
          <div className="text-[11px] font-medium text-red-700 dark:text-red-400 break-words">
            {context.errorMessage}
          </div>
          {context.errorScope ? (
            <div className="mt-0.5 text-[10.5px] text-muted-foreground">
              in {context.errorScope}
              {context.conversationId ? ` · task ${context.conversationId.slice(0, 40)}` : ""}
            </div>
          ) : null}
        </div>

        <div className="mb-3">
          <label className="block text-[12px] font-medium mb-1">
            What were you doing when this happened?{" "}
            <span className="text-muted-foreground/70 font-normal">(optional)</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
            placeholder="One sentence is plenty."
            rows={3}
            maxLength={MESSAGE_MAX}
            className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px] resize-none focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div className="mb-3">
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={attachLogs}
              onChange={(e) => setAttachLogs(e.target.checked)}
              className="mt-[2px] h-3.5 w-3.5 accent-primary"
            />
            <span className="text-[12px]">
              Attach recent logs
              <span className="block text-[10.5px] text-muted-foreground">
                Redacted automatically (no secrets, no file contents), capped at 1 MB.{" "}
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => setShowPreview((v) => !v)}
                >
                  {showPreview ? "Hide preview" : "Preview what will be sent"}
                </button>
              </span>
            </span>
          </label>
          {showPreview ? (
            <div className="mt-2 max-h-40 overflow-auto rounded-md border border-border bg-muted/40 p-2">
              {tailLoading ? (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading logs…
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-all text-[10px] leading-snug text-muted-foreground">
                  {tail || "No log content yet."}
                </pre>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={submitting || (attachLogs && tailLoading)}>
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Send report
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * Renderer-side error capture (PRD §3.3). Hooks window.onerror,
 * unhandledrejection, and console.error; batches (max 20 entries / 10 s,
 * deduped by message) to POST /api/system/client-log. Silently drops when
 * the server is unreachable — logging must never block or break the UI.
 */

interface ClientLogEntry {
  ts: string;
  lvl: "error" | "warn";
  scope: string;
  msg: string;
  stack?: string;
  url?: string;
}

const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH = 20;
const DEDUPE_WINDOW_MS = 60_000;

/**
 * Known-benign console.error messages to swallow. Tiptap's React node-views
 * (`ReactNodeViewRenderer`) flush their portals with `flushSync`, which React
 * warns about when it coincides with a render/commit. It's a dev-only warning
 * (stripped from production builds) that doesn't affect functionality — see
 * ueberdosis/tiptap#4355. We keep a quiet console.debug trace but don't ship it
 * to the server log or let it trip the Next.js dev overlay.
 */
const IGNORED_ERROR_PATTERNS = [
  "flushSync was called from inside a lifecycle method",
];

function isIgnoredError(args: unknown[]): boolean {
  const text = args
    .map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : ""))
    .join(" ");
  return IGNORED_ERROR_PATTERNS.some((p) => text.includes(p));
}

let installed = false;
const queue: ClientLogEntry[] = [];
let flushTimer: number | null = null;
const recentMessages = new Map<string, number>();

function dedupe(msg: string): boolean {
  const now = Date.now();
  const last = recentMessages.get(msg);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return true;
  recentMessages.set(msg, now);
  if (recentMessages.size > 200) {
    for (const [k, t] of recentMessages) {
      if (now - t > DEDUPE_WINDOW_MS) recentMessages.delete(k);
    }
  }
  return false;
}

function flush(): void {
  if (!queue.length) return;
  const entries = queue.splice(0, MAX_BATCH);
  const body = JSON.stringify({ entries });
  try {
    // sendBeacon survives page unloads; fall back to fetch.
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        "/api/system/client-log",
        new Blob([body], { type: "application/json" })
      );
      if (ok) return;
    }
    void fetch("/api/system/client-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never break the page over logging
  }
}

function enqueue(entry: ClientLogEntry): void {
  if (dedupe(entry.msg)) return;
  queue.push(entry);
  if (queue.length >= MAX_BATCH) {
    flush();
    return;
  }
  if (flushTimer === null) {
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_INTERVAL_MS);
  }
}

export function installRendererLogCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    enqueue({
      ts: new Date().toISOString(),
      lvl: "error",
      scope: "window",
      msg: String(event.message || "unknown error").slice(0, 2000),
      stack: event.error instanceof Error ? event.error.stack?.slice(0, 4000) : undefined,
      url: `${event.filename || ""}:${event.lineno || 0}`,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    enqueue({
      ts: new Date().toISOString(),
      lvl: "error",
      scope: "promise",
      msg:
        reason instanceof Error
          ? reason.message.slice(0, 2000)
          : String(reason).slice(0, 2000),
      stack: reason instanceof Error ? reason.stack?.slice(0, 4000) : undefined,
      url: window.location.hash || undefined,
    });
  });

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    // Swallow known-benign upstream warnings: don't call the (possibly
    // overlay-patched) original or ship to the server log. Keep a quiet trace.
    if (isIgnoredError(args)) {
      console.debug(...args);
      return;
    }
    originalError(...args);
    try {
      let stack: string | undefined;
      const msg = args
        .map((a) => {
          if (a instanceof Error) {
            if (!stack) stack = a.stack?.slice(0, 4000);
            return a.message;
          }
          return typeof a === "string" ? a : safeInspect(a);
        })
        .join(" ")
        .slice(0, 2000);
      enqueue({
        ts: new Date().toISOString(),
        lvl: "error",
        scope: "console",
        msg,
        stack,
        url: window.location.hash || undefined,
      });
    } catch {
      // capture must never break console
    }
  };

  window.addEventListener("pagehide", flush);
}

function safeInspect(value: unknown): string {
  try {
    return JSON.stringify(value)?.slice(0, 500) ?? String(value);
  } catch {
    return String(value);
  }
}

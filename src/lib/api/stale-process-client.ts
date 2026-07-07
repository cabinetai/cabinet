import { STALE_PROCESS_HEADER } from "@/lib/api/stale-process";

/**
 * Client-side recovery for the "stale process" condition (see stale-process.ts).
 *
 * When a content endpoint answers 503 with the `x-cabinet-stale` header, the
 * active cabinet was switched on disk but this process still points at the old
 * one. The dev launchers auto-restart the server (and the desktop shell
 * relaunches), so the right client behavior is: show a brief notice, wait for a
 * FRESH (non-stale) process to come up, then reload to bind to the new cabinet.
 *
 * `/api/health` never touches `resolveContentPath`, so it keeps answering even
 * while stale — and it reports `stale` so we can tell a superseded process
 * apart from the restarted one.
 */

let recovering = false;

/**
 * Inspect a response for the stale-process signal. If present, kick off
 * recovery (idempotent) and return true so callers can short-circuit. Only
 * reads a header, so it never consumes the response body.
 */
export function handleStaleResponse(res: Response): boolean {
  if (typeof window === "undefined") return false;
  if (res.status !== 503 || !res.headers.has(STALE_PROCESS_HEADER)) return false;
  beginStaleRecovery();
  return true;
}

/**
 * Start recovery: surface a non-blocking toast, then poll `/api/health` until a
 * non-stale process answers and reload. Idempotent — repeated calls (many
 * endpoints fail at once) collapse into a single recovery cycle.
 */
export function beginStaleRecovery(): void {
  if (typeof window === "undefined" || recovering) return;
  recovering = true;

  try {
    window.dispatchEvent(
      new CustomEvent("cabinet:toast", {
        detail: {
          kind: "info",
          message: "Applying cabinet switch — restarting the server…",
        },
      })
    );
  } catch {
    // toast is best-effort
  }

  const startedAt = Date.now();
  const MAX_WAIT_MS = 60_000;

  const poll = async () => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { stale?: boolean }
          | null;
        // A fresh process reports stale:false. Older builds omit the field —
        // treat a healthy response without an explicit stale:true as ready.
        if (data && data.stale !== true) {
          window.location.reload();
          return;
        }
      }
    } catch {
      // Server is mid-restart (port briefly not listening) — keep polling.
    }

    if (Date.now() - startedAt > MAX_WAIT_MS) {
      // Give up auto-reloading after a while; leave the guidance toast so the
      // user can restart manually. Allow a later failure to retry recovery.
      recovering = false;
      return;
    }
    window.setTimeout(poll, 1000);
  };

  // Small initial delay so the (already in-flight) restart has a head start.
  window.setTimeout(poll, 800);
}

import { NextResponse } from "next/server";
import {
  STALE_PROCESS_CODE,
  STALE_PROCESS_HEADER,
  isStaleProcessError,
} from "@/lib/api/stale-process";

/**
 * If `error` is the stale-process condition, return a retryable 503 carrying a
 * machine-readable code + header so the client can recover gracefully (wait for
 * the auto-restart, then reload). Otherwise return null so the caller falls
 * through to its normal error handling.
 *
 * Mirrors the `readOnly()` helper pattern used in the pages route: call it
 * first inside a catch block.
 */
export function staleProcessResponse(error: unknown): NextResponse | null {
  if (!isStaleProcessError(error)) return null;
  return NextResponse.json(
    {
      error: error.message,
      code: STALE_PROCESS_CODE,
      requiresRestart: true,
    },
    {
      status: 503,
      headers: {
        [STALE_PROCESS_HEADER]: "1",
        // Hint conforming clients/proxies to retry shortly; the dev launchers
        // restart the process within ~1–2s of the active-cabinet change.
        "Retry-After": "2",
      },
    }
  );
}

/**
 * Shared, isomorphic definitions for the "stale process" condition — when the
 * active cabinet was switched on disk after the server booted, so the frozen
 * `DATA_DIR` (resolved once at load) no longer matches `home.json`. Content
 * routes can't safely serve from the wrong cabinet, so `resolveContentPath`
 * throws `StaleProcessError`; the API layer maps that to a retryable 503 and
 * the client recovers by waiting for the (auto-)restarted process.
 *
 * This module MUST stay free of Node/`next/server` imports so it can be shared
 * by both server routes and client recovery code.
 */

/** Machine-readable code returned in the 503 JSON body. */
export const STALE_PROCESS_CODE = "STALE_PROCESS";

/**
 * Response header set on the 503 so clients can detect the condition without
 * consuming the body (important for GET responses that are cloned/reused).
 */
export const STALE_PROCESS_HEADER = "x-cabinet-stale";

/** Human-readable message kept stable so substring detection stays reliable. */
export const STALE_PROCESS_MESSAGE =
  "Cabinet server process is stale (active cabinet changed on disk). Please restart the process to apply the cabinet switch.";

/** Typed error thrown when the process is serving a superseded active cabinet. */
export class StaleProcessError extends Error {
  readonly code = STALE_PROCESS_CODE;
  constructor(message: string = STALE_PROCESS_MESSAGE) {
    super(message);
    this.name = "StaleProcessError";
  }
}

/**
 * True for a `StaleProcessError` (or any error whose message carries the stale
 * marker, so pre-existing raw throws are still recognized).
 */
export function isStaleProcessError(error: unknown): error is Error {
  return (
    error instanceof StaleProcessError ||
    (error instanceof Error &&
      error.message.includes("active cabinet changed on disk"))
  );
}

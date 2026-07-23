import type { HermesConnectionState } from "@/lib/hermes/types";

export const HERMES_HEALTH_POLL_BASE_MS = 10_000;
export const HERMES_HEALTH_POLL_MAX_MS = 60_000;

export function nextHermesHealthPollDelay(
  status: HermesConnectionState,
  consecutiveUnconfirmed: number,
): number {
  if (status === "online") return HERMES_HEALTH_POLL_BASE_MS;
  if (status === "authentication_failure" || status === "misconfigured") {
    return HERMES_HEALTH_POLL_MAX_MS;
  }
  if (status === "offline") return 20_000;
  const exponent = Math.max(0, Math.min(consecutiveUnconfirmed - 1, 3));
  return Math.min(
    HERMES_HEALTH_POLL_BASE_MS * 2 ** exponent,
    HERMES_HEALTH_POLL_MAX_MS,
  );
}

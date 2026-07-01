/**
 * Client for the "I want this integration" signal. Fired when a user clicks a
 * coming-soon ("Soon") connector in the Integrations Hub, or types a name into
 * the "Don't see your integration?" box. The signal helps the team prioritize
 * which connector to ship next.
 *
 * Local-first, mirroring the feedback flow:
 *   1. POST to the local route (/api/system/integration-requests), which appends
 *      a durable row to <DATA_DIR>/.cabinet-meta/integration-requests.jsonl. This
 *      determines the result we return to the UI.
 *   2. Best-effort forward to the cabinet-backend so it surfaces for the team.
 *      Failure here is silent — the local JSONL row is the durable copy.
 *
 * The forward URL piggybacks off `NEXT_PUBLIC_CABINET_WAITLIST_ENDPOINT`'s
 * origin (same cabinet-backend host, different path) so dev/staging/prod
 * pickers don't have to set yet another env var — like language-request-client.
 */

const LOCAL_ENDPOINT = "/api/system/integration-requests";

const WAITLIST_ENDPOINT =
  process.env.NEXT_PUBLIC_CABINET_WAITLIST_ENDPOINT ?? "https://reports.runcabinet.com/waitlist";

function forwardEndpoint(): string {
  return WAITLIST_ENDPOINT.replace(/\/waitlist$/, "") + "/integration-requests";
}

export interface IntegrationRequestPayload {
  /** Catalog slug, e.g. "tiktok", "instagram". Omitted for free-text asks. */
  integrationId?: string;
  /** Human-readable name, e.g. "TikTok" or whatever the user typed. */
  integrationName: string;
  /** Catalog category slug when known, e.g. "social". */
  category?: string;
  /** Where the request came from: a coming-soon tile vs. the request box. */
  source?: "soon-tile" | "request-box";
  appVersion?: string;
  platform?: string;
}

export type IntegrationRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitIntegrationRequest(
  payload: IntegrationRequestPayload,
): Promise<IntegrationRequestResult> {
  if (typeof fetch === "undefined") return { ok: false, error: "no_fetch" };

  const body = JSON.stringify({
    ...payload,
    platform:
      payload.platform ??
      (typeof navigator !== "undefined" ? navigator.platform : undefined),
  });

  // Best-effort forward to the team backend — fire and forget.
  fetch(forwardEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
    mode: "cors",
  }).catch(() => {});

  // Local-first durable copy — this is what determines the UI result.
  try {
    const res = await fetch(LOCAL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
    if (!res.ok) return { ok: false, error: "status_" + res.status };
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}

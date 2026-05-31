/**
 * Client for POSTing a "I want this language" signal to the cabinet-backend
 * `/language-requests` endpoint. Fired when a user clicks an unsupported
 * locale in Settings → Language. The signal helps prioritize which
 * translation to ship next.
 *
 * Endpoint URL piggybacks off `NEXT_PUBLIC_CABINET_WAITLIST_ENDPOINT`'s
 * origin (same cabinet-backend host, different path) so dev/staging/prod
 * pickers don't have to set yet another env var.
 */

const WAITLIST_ENDPOINT =
  process.env.NEXT_PUBLIC_CABINET_WAITLIST_ENDPOINT ?? "https://reports.runcabinet.com/waitlist";

function endpoint(): string {
  return WAITLIST_ENDPOINT.replace(/\/waitlist$/, "") + "/language-requests";
}

export interface LanguageRequestPayload {
  /** BCP-47 code, e.g. "es", "zh-CN", "ar". */
  requestedLocale: string;
  /** Human-readable name in its own language, e.g. "Español". */
  localeLabel?: string;
  /** What locale the user has selected right now ("en" / "he"). */
  currentLocale?: string;
  appVersion?: string;
  platform?: string;
}

export type LanguageRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitLanguageRequest(
  payload: LanguageRequestPayload,
): Promise<LanguageRequestResult> {
  if (typeof fetch === "undefined") return { ok: false, error: "no_fetch" };
  try {
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        platform: payload.platform ?? (typeof navigator !== "undefined" ? navigator.platform : undefined),
      }),
      keepalive: true,
    });
    if (!res.ok) return { ok: false, error: "status_" + res.status };
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}

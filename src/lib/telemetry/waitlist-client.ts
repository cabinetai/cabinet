const WAITLIST_ENDPOINT =
  process.env.NEXT_PUBLIC_CABINET_WAITLIST_ENDPOINT ?? "";
const VISIT_ID_KEY = "cabinet-waitlist-visit-id";

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (very old browsers); cryptographically weak but only used as a
  // tracking id, not for security.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getVisitId(): string {
  if (typeof window === "undefined") return uuid();
  let id = sessionStorage.getItem(VISIT_ID_KEY);
  if (!id) {
    id = uuid();
    sessionStorage.setItem(VISIT_ID_KEY, id);
  }
  return id;
}

async function postJson(path: string, body: unknown): Promise<Response | null> {
  if (typeof fetch === "undefined") return null;
  if (!WAITLIST_ENDPOINT) return null;
  try {
    return await fetch(WAITLIST_ENDPOINT.replace(/\/waitlist$/, "") + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    return null;
  }
}

export function recordWaitlistView(source: string): void {
  void postJson("/waitlist/visit", { type: "view", source, visitId: getVisitId() });
}

export function recordWaitlistStart(source: string): void {
  void postJson("/waitlist/visit", { type: "start", source, visitId: getVisitId() });
}

export type WaitlistSubmitResult =
  | { ok: true; alreadyOnList: boolean }
  | { ok: false; error: string };

export async function submitWaitlistEmail(
  email: string,
  source: string,
): Promise<WaitlistSubmitResult> {
  const res = await postJson("/waitlist", { email, source, visitId: getVisitId() });
  if (!res) return { ok: false, error: "network" };
  if (!res.ok) return { ok: false, error: "status_" + res.status };
  try {
    const body = (await res.json()) as { ok?: boolean; alreadyOnList?: boolean };
    return { ok: true, alreadyOnList: Boolean(body.alreadyOnList) };
  } catch {
    return { ok: true, alreadyOnList: false };
  }
}

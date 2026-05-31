import type { EventName, EventPayload } from "./catalog";

export function sendTelemetry(name: EventName, payload: EventPayload = {}): void {
  try {
    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, payload }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* telemetry must never crash a UI flow */
  }
}

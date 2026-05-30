/**
 * Cross-window rooms invalidation channel.
 *
 * The rooms list is fetched once into `useRoomsStore` and cached; multiple
 * windows (Electron multi-window or browser tabs) and "outside" mutations
 * (the CLI, migration script, a manual `mkdir`) drift the cache out of sync
 * with disk. This module provides a tiny pub/sub on top of `BroadcastChannel`
 * so any mutation can notify *all* open windows to re-fetch — and so the
 * rooms-store can subscribe with one liner.
 *
 * Local subscribers in the same window are also notified via the same
 * `notifyRoomsChanged()` call, so callers never have to do both. Falls back
 * to a no-op outside the browser.
 */

const CHANNEL_NAME = "cabinet-rooms";

type Listener = () => void;
const localListeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;

function ensureChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event) => {
      if (event.data?.type === "rooms:invalidated") {
        for (const listener of localListeners) listener();
      }
    });
  }
  return channel;
}

/**
 * Tell every window (this one + any others on the same origin) that the
 * rooms list changed and should be re-fetched. Safe to call from any client
 * code path that mutates rooms (PATCH / POST / DELETE / soft delete).
 */
export function notifyRoomsChanged(): void {
  const ch = ensureChannel();
  // Fire local listeners synchronously; same-window subscribers get the
  // signal even if BroadcastChannel isn't available.
  for (const listener of localListeners) listener();
  if (ch) {
    try {
      ch.postMessage({ type: "rooms:invalidated", at: Date.now() });
    } catch {
      // BroadcastChannel can throw if the channel was closed by HMR; ignore.
    }
  }
}

/**
 * Subscribe to rooms-invalidated signals (from this window or others).
 * Returns an unsubscribe function. Safe to call during SSR (returns no-op).
 */
export function subscribeRoomsChanged(listener: Listener): () => void {
  ensureChannel();
  localListeners.add(listener);
  return () => {
    localListeners.delete(listener);
  };
}

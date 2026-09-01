import type { NormalizedMessage } from "./types";

export type Subscriber = (msg: NormalizedMessage) => void;
export type Unsubscribe = () => void;

/**
 * In-process fan-out for normalized messages.
 *
 * - `subscribe` registers a live listener and returns an unsubscribe handle.
 * - A bounded ring buffer keeps the most recent messages so a subscriber that
 *   connects late can be replayed a short backlog.
 *
 * Deliberately not an EventEmitter subclass: the surface is two methods, and a
 * throwing subscriber must never abort delivery to the others.
 */
export class MessageBus {
  private subscribers = new Set<Subscriber>();
  private buffer: NormalizedMessage[] = [];
  private readonly capacity: number;

  constructor(capacity = 1000) {
    this.capacity = Math.max(0, capacity);
  }

  subscribe(fn: Subscriber): Unsubscribe {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  publish(msg: NormalizedMessage): void {
    if (this.capacity > 0) {
      this.buffer.push(msg);
      if (this.buffer.length > this.capacity) {
        this.buffer.splice(0, this.buffer.length - this.capacity);
      }
    }
    for (const fn of this.subscribers) {
      try {
        fn(msg);
      } catch {
        // A bad subscriber must not stall the stream for everyone else.
      }
    }
  }

  /** Most recent buffered messages, optionally limited to `n` and an account. */
  recent(n?: number, accountId?: string): NormalizedMessage[] {
    let out = this.buffer;
    if (accountId) out = out.filter((m) => m.account_id === accountId);
    if (n !== undefined && n >= 0) out = out.slice(-n);
    return [...out];
  }
}

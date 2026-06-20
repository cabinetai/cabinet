import fs from "fs";
import path from "path";
import { DATA_DIR } from "@/lib/storage/path-utils";

// "Who is currently composing a channel reply", used to drive the
// "<agent> is typing…" indicator. The channels route (writer) and the events
// SSE route (reader) need to share this, but Next/Turbopack bundle route
// handlers as separate server entries and DON'T reliably share in-memory state
// across them — not via a shared lib import, not even via globalThis. So we
// back it with a tiny file, which both routes see no matter how they're
// bundled. It's a few bytes; the SSE tick reads it every 3s.

const FILE = path.join(DATA_DIR, ".agents", ".runtime", "responding.json");

type Entry = { channel: string; since: number };

function read(): Record<string, Entry> {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, Entry>;
  } catch {
    return {};
  }
}

function write(data: Record<string, Entry>): void {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data));
  } catch {
    /* best-effort; the indicator is non-critical */
  }
}

export function setResponding(slug: string, channel: string): void {
  const data = read();
  data[slug] = { channel, since: Date.now() };
  write(data);
}

export function clearResponding(slug: string): void {
  const data = read();
  delete data[slug];
  write(data);
}

/** Active responders, pruning anything stale (>3 min) as a safety net. */
export function getRespondingAgents(): Map<string, Entry> {
  const data = read();
  const now = Date.now();
  let changed = false;
  for (const [slug, info] of Object.entries(data)) {
    if (now - info.since > 180_000) {
      delete data[slug];
      changed = true;
    }
  }
  if (changed) write(data);
  return new Map(Object.entries(data));
}

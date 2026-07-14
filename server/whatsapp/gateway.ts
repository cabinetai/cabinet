/**
 * WhatsApp read-only gateway lifecycle (docs/WHATSAPP_CONNECTOR.md).
 *
 * Runs inside the daemon process, mirroring the Telegram gateway: a no-op
 * unless WHATSAPP_ACCOUNTS is set in .cabinet.env, a chokidar watch on that
 * file starts/stops/reconfigures the gateway live, and an owner.json marker
 * keeps a second daemon instance from fighting over the same Baileys session
 * files (WhatsApp drops duplicate device sessions).
 *
 * First slice: every inbound message is posted to a channel board on the home
 * cabinet (default channel "whatsapp") via channels-manager. No send path, no
 * routing to agent runs.
 */

import fs from "fs";
import path from "path";
import chokidar, { type FSWatcher } from "chokidar";
import { cabinetEnvPath } from "../../src/lib/runtime/cabinet-env";
import { postMessage } from "../../src/lib/agents/channels-manager";
import { DATA_DIR } from "../../src/lib/storage/path-utils";
import { MessageBus } from "./bus";
import { AccountConnection } from "./connection";
import {
  configFingerprint,
  isGatewayEnabled,
  readWhatsAppGatewayConfig,
  type WhatsAppGatewayConfig,
} from "./config";
import type { NormalizedMessage } from "./types";

const RUNTIME_DIR = path.join(DATA_DIR, ".agents", ".runtime", "whatsapp");
const OWNER_MARKER_PATH = path.join(RUNTIME_DIR, "owner.json");
// Baileys session keys are secrets and must survive restarts — they live
// outside .runtime, next to the other durable .agents state.
const STORE_DIR = path.join(DATA_DIR, ".agents", ".whatsapp", "store");

interface GatewayInstance {
  connections: AccountConnection[];
  stop: () => Promise<void>;
}

let instance: GatewayInstance | null = null;
let envWatcher: FSWatcher | null = null;
let activeFingerprint = "";
let restartTimer: NodeJS.Timeout | null = null;

function log(line: string): void {
  console.log(`[whatsapp-gateway] ${line}`);
}

// ---------------------------------------------------------------------------
// Owner marker — one gateway per data dir, across daemon instances
// ---------------------------------------------------------------------------

function readOwnerMarker(): { pid: number } | null {
  try {
    const raw = fs.readFileSync(OWNER_MARKER_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { pid?: unknown };
    return typeof parsed.pid === "number" ? { pid: parsed.pid } : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function claimOwnerMarker(): boolean {
  const existing = readOwnerMarker();
  if (existing && existing.pid !== process.pid && isPidAlive(existing.pid)) {
    return false;
  }
  fs.mkdirSync(path.dirname(OWNER_MARKER_PATH), { recursive: true });
  fs.writeFileSync(
    OWNER_MARKER_PATH,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2)
  );
  return true;
}

function releaseOwnerMarker(): void {
  const existing = readOwnerMarker();
  if (existing?.pid === process.pid) {
    try {
      fs.unlinkSync(OWNER_MARKER_PATH);
    } catch {
      /* best-effort */
    }
  }
}

// ---------------------------------------------------------------------------
// Channel-board sink
// ---------------------------------------------------------------------------

/** Render a normalized message as a channel-board line. Exported for tests. */
export function formatBoardContent(msg: NormalizedMessage): string {
  const media = msg.type === "text" ? "" : `[${msg.type}] `;
  const group = msg.is_group ? `[group ${msg.chat_jid.split("@")[0]}] ` : "";
  return `${group}${media}${msg.text}`.trim();
}

function makeSink(cfg: WhatsAppGatewayConfig) {
  const multiAccount = cfg.accounts.length > 1;
  return (msg: NormalizedMessage): void => {
    if (msg.from_me && !cfg.includeFromMe) return;
    const account = cfg.accounts.find((a) => a.id === msg.account_id);
    const suffix = multiAccount ? ` · ${account?.label ?? msg.account_id}` : "";
    void postMessage({
      channel: cfg.channel,
      agent: "whatsapp",
      emoji: "💬",
      displayName: `${msg.sender_name || msg.sender}${suffix}`,
      type: "message",
      content: formatBoardContent(msg),
      mentions: [],
      kbRefs: [],
    }).catch((err) => {
      log(`failed to post to #${cfg.channel}: ${err instanceof Error ? err.message : err}`);
    });
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Called once from the daemon's server.listen callback. Sets up the
 * .cabinet.env watcher and starts the gateway when configured.
 */
export function initWhatsAppGateway(): void {
  envWatcher = chokidar.watch(cabinetEnvPath(), { ignoreInitial: true });
  const onEnvChange = () => {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      void reconcile("config change in .cabinet.env");
    }, 500);
  };
  envWatcher.on("add", onEnvChange);
  envWatcher.on("change", onEnvChange);
  envWatcher.on("unlink", onEnvChange);
  envWatcher.on("error", () => {
    /* watch failure just means restart-to-reconfigure; not fatal */
  });

  void reconcile("daemon boot");
}

export async function shutdownWhatsAppGateway(): Promise<void> {
  if (restartTimer) clearTimeout(restartTimer);
  await envWatcher?.close().catch(() => {});
  envWatcher = null;
  await stopInstance();
}

/** Bring the running state in line with the current .cabinet.env. */
async function reconcile(reason: string): Promise<void> {
  const cfg = readWhatsAppGatewayConfig();
  const enabled = isGatewayEnabled(cfg);
  const fingerprint = configFingerprint(cfg);

  if (instance && (!enabled || fingerprint !== activeFingerprint)) {
    log(`stopping (${reason})`);
    await stopInstance();
  }
  if (!instance && enabled) {
    activeFingerprint = fingerprint;
    await startInstance(cfg).catch((err) => {
      log(`failed to start: ${err instanceof Error ? err.message : err}`);
    });
  }
  if (!enabled) {
    log("disabled: WHATSAPP_ACCOUNTS is empty");
  }
}

async function stopInstance(): Promise<void> {
  const current = instance;
  instance = null;
  if (current) await current.stop();
}

async function startInstance(cfg: WhatsAppGatewayConfig): Promise<void> {
  if (!claimOwnerMarker()) {
    log("staying down: another live daemon owns these WhatsApp sessions (owner.json)");
    return;
  }

  fs.mkdirSync(STORE_DIR, { recursive: true });

  const bus = new MessageBus();
  const unsubscribe = bus.subscribe(makeSink(cfg));

  const connections = cfg.accounts.map((acct) => new AccountConnection(acct, STORE_DIR, bus, log));

  instance = {
    connections,
    stop: async () => {
      unsubscribe();
      releaseOwnerMarker();
      await Promise.allSettled(connections.map((c) => c.stop()));
    },
  };

  // Start connections concurrently; one failing to pair must not block the rest.
  await Promise.allSettled(
    connections.map((c) =>
      c.start().catch((err) => {
        log(`[${c.id}] failed to start: ${err instanceof Error ? err.message : err}`);
      })
    )
  );

  log(
    `running — ${cfg.accounts.length} account(s) → #${cfg.channel}` +
      ` (read-only; sessions under ${STORE_DIR})`
  );
}

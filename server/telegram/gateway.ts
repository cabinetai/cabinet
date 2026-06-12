/**
 * Telegram remote-control gateway lifecycle (PRD docs/TELEGRAM_REMOTE_CONTROL_PRD.md).
 *
 * Runs inside the daemon process. Owns the bot's getUpdates long-poll
 * (single-consumer constraint, §10), guarded by an owner.json marker so a
 * second daemon instance defers instead of fighting over updates.
 *
 * Boot order: config check → daemon-URL/port self-check → getMe token check →
 * owner marker → fast-forward past the offline backlog → long-poll loop.
 * A chokidar watch on .cabinet.env starts/stops/reconfigures the gateway
 * live — the daemon itself only loads that file once at boot.
 */

import fs from "fs";
import path from "path";
import chokidar, { type FSWatcher } from "chokidar";
import { cabinetEnvPath } from "../../src/lib/runtime/cabinet-env";
import { getDaemonUrl } from "../../src/lib/agents/daemon-auth";
import { DATA_DIR } from "../../src/lib/storage/path-utils";
import type { SearchSources } from "../search/search-service";
import { BotApi, isConflictError, type TgUpdate } from "./bot-api";
import {
  configFingerprint,
  isGatewayEnabled,
  readTelegramGatewayConfig,
  type TelegramGatewayConfig,
} from "./config";
import { handleMessage, type RouterContext } from "./router";
import { splitBootBacklog } from "./parse";
import { clearAllChatState } from "./session-store";

const OWNER_MARKER_PATH = path.join(DATA_DIR, ".agents", ".runtime", "telegram", "owner.json");

export interface TelegramGatewayDeps {
  /** The port this daemon actually bound (auto-bump aware). */
  boundPort: number;
  getSearchSources: () => Promise<SearchSources>;
}

interface GatewayInstance {
  stop: () => Promise<void>;
}

let deps: TelegramGatewayDeps | null = null;
let instance: GatewayInstance | null = null;
let envWatcher: FSWatcher | null = null;
let activeFingerprint = "";
let restartTimer: NodeJS.Timeout | null = null;

function log(line: string): void {
  console.log(`[telegram-gateway] ${line}`);
}

// ---------------------------------------------------------------------------
// Owner marker — one gateway per bot, across daemon instances
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

function claimOwnerMarker(botUsername: string): boolean {
  const existing = readOwnerMarker();
  if (existing && existing.pid !== process.pid && isPidAlive(existing.pid)) {
    return false;
  }
  fs.mkdirSync(path.dirname(OWNER_MARKER_PATH), { recursive: true });
  fs.writeFileSync(
    OWNER_MARKER_PATH,
    JSON.stringify({ pid: process.pid, botUsername, startedAt: new Date().toISOString() }, null, 2)
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
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Called once from the daemon's server.listen callback. Sets up the
 * .cabinet.env watcher and starts the gateway when configured.
 */
export function initTelegramGateway(gatewayDeps: TelegramGatewayDeps): void {
  deps = gatewayDeps;

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

export async function shutdownTelegramGateway(): Promise<void> {
  if (restartTimer) clearTimeout(restartTimer);
  await envWatcher?.close().catch(() => {});
  envWatcher = null;
  await stopInstance();
  deps = null;
}

/** Bring the running state in line with the current .cabinet.env. */
async function reconcile(reason: string): Promise<void> {
  if (!deps) return;
  const cfg = readTelegramGatewayConfig();
  const enabled = isGatewayEnabled(cfg);
  const fingerprint = configFingerprint(cfg);

  if (instance && (!enabled || fingerprint !== activeFingerprint)) {
    log(`stopping (${reason})`);
    await stopInstance();
  }
  if (!instance && enabled) {
    activeFingerprint = fingerprint;
    await startInstance(cfg, deps).catch((err) => {
      log(`failed to start: ${err instanceof Error ? err.message : err}`);
    });
  }
  if (!enabled) {
    log(
      cfg.botToken
        ? "disabled: TELEGRAM_ALLOWED_USERS is empty (allowlist-fail-closed)"
        : "disabled: no TELEGRAM_BOT_TOKEN"
    );
  }
}

async function stopInstance(): Promise<void> {
  const current = instance;
  instance = null;
  if (current) await current.stop();
}

async function startInstance(cfg: TelegramGatewayConfig, d: TelegramGatewayDeps): Promise<void> {
  // Port self-check (PRD §5): startConversationRun loopback-calls the daemon
  // at getDaemonUrl(). If that resolves to a DIFFERENT daemon (dev + packaged
  // side by side, auto-bumped ports), refuse to start rather than drive it.
  let configuredPort: number | null = null;
  try {
    const url = new URL(getDaemonUrl());
    configuredPort = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  } catch {
    /* unparseable url falls through to the mismatch branch */
  }
  if (configuredPort !== d.boundPort) {
    log(
      `staying down: daemon url (${getDaemonUrl()}) doesn't resolve to this ` +
        `daemon's port ${d.boundPort} — agent runs would hit a different daemon.`
    );
    return;
  }

  const api = new BotApi(cfg.botToken!);

  let me: Awaited<ReturnType<BotApi["getMe"]>>;
  try {
    me = await api.getMe();
  } catch (err) {
    log(`staying down: token check failed (${err instanceof Error ? err.message : err})`);
    return;
  }

  if (!claimOwnerMarker(me.username ?? "bot")) {
    log("staying down: another live daemon owns this bot's getUpdates (owner.json)");
    return;
  }

  const routerCtx: RouterContext = {
    api,
    cfg,
    botUsername: me.username ?? "bot",
    getSearchSources: d.getSearchSources,
    log,
  };

  let running = true;
  let offset: number | undefined;

  // Fast-forward: drain the offline backlog without executing stale commands.
  const staleNoticeChats = new Set<number>();
  try {
    let drained: TgUpdate[] = [];
    for (;;) {
      const batch = await api.getUpdates(offset, 0);
      if (batch.length === 0) break;
      drained = drained.concat(batch);
      offset = batch[batch.length - 1].update_id + 1;
      if (batch.length < 100) break;
    }
    const { fresh, staleCount } = splitBootBacklog(drained, Date.now());
    if (staleCount > 0) {
      log(`fast-forwarded past ${staleCount} stale update(s) from the offline backlog`);
      for (const u of drained) {
        const m = u.message;
        if (
          m &&
          m.chat.type === "private" &&
          m.from &&
          cfg.allowedUserIds.includes(m.from.id) &&
          !fresh.includes(u)
        ) {
          staleNoticeChats.add(m.chat.id);
        }
      }
    }
    for (const chatId of staleNoticeChats) {
      await api
        .sendMessage(chatId, "Back online. I ignored messages sent while Cabinet was off. Resend anything still needed.", {
          disableNotification: true,
        })
        .catch(() => {});
    }
    for (const u of fresh) {
      if (u.message) void handleMessage(routerCtx, u.message).catch(() => {});
    }
  } catch (err) {
    log(`backlog drain failed (continuing): ${err instanceof Error ? err.message : err}`);
  }

  // Steady-state long-poll loop. handleMessage is deliberately NOT awaited —
  // a long agent run must never block the next getUpdates; per-chat ordering
  // is enforced by the session store's busy flag + one-deep queue.
  const loop = (async () => {
    let backoffMs = 1000;
    while (running) {
      try {
        const updates = await api.getUpdates(offset, 50);
        backoffMs = 1000;
        for (const u of updates) {
          offset = u.update_id + 1;
          if (u.message) {
            void handleMessage(routerCtx, u.message).catch((err) => {
              log(`handler error: ${err instanceof Error ? err.message : err}`);
            });
          }
        }
      } catch (err) {
        if (!running) break;
        if (isConflictError(err)) {
          log(
            "getUpdates conflict (409): another consumer is polling this bot " +
              "— is the MCP read_recent tool or a second gateway running? Backing off 60s."
          );
          await sleep(60_000);
        } else {
          await sleep(backoffMs);
          backoffMs = Math.min(backoffMs * 2, 30_000);
        }
      }
    }
  })();

  instance = {
    stop: async () => {
      running = false;
      releaseOwnerMarker();
      clearAllChatState();
      // The in-flight getUpdates long-poll resolves on its own (≤50s); we
      // don't hold shutdown hostage to it.
      void loop;
    },
  };

  log(
    `running as @${me.username ?? "?"} — ${cfg.allowedUserIds.length} allowlisted user(s), ` +
      `default agent: ${cfg.defaultAgent ?? "(auto)"}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

import fs from "node:fs";
import path from "node:path";

import {
  makeWASocket,
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
// @ts-expect-error no type declarations
import qrcode from "qrcode-terminal";

import type { MessageBus } from "./bus";
import { normalizeMessage } from "./normalize";
import type { AccountConfig, ConnectionStatus } from "./types";

// Baileys logs through a pino-shaped logger; we keep it silent so the daemon
// log only carries our own lifecycle lines.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const silentLogger: any = {
  level: "silent",
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * One read-only WhatsApp connection for a single account (Baileys).
 *
 * Wires exactly three events: `connection.update` (lifecycle + QR pairing),
 * `messages.upsert` (the inbound feed → bus), and `creds.update` (persist
 * session). There is deliberately **no send path** — this is a monitor.
 * Auto-reconnects on every disconnect except `loggedOut` (needs re-pair).
 *
 * Pairing: with no saved session the QR is printed to the daemon log and the
 * raw QR payload is mirrored to `<authDir>/../qr-<id>.txt` so a UI can render
 * it later; the file is removed once the connection opens.
 */
export class AccountConnection {
  readonly id: string;
  readonly label: string;
  private status: ConnectionStatus = "connecting";
  private readonly authDir: string;
  private readonly qrPath: string;
  private readonly statusPath: string;
  private sock: ReturnType<typeof makeWASocket> | undefined;
  private stopped = false;

  constructor(
    account: AccountConfig,
    storeDir: string,
    private readonly bus: MessageBus,
    private readonly log: (line: string) => void,
    private readonly pairingPhone?: string | null
  ) {
    this.id = account.id;
    this.label = account.label ?? account.id;
    this.authDir = path.join(storeDir, account.id);
    this.qrPath = path.join(path.dirname(this.authDir), `qr-${account.id}.txt`);
    // Manual-testing surface: mirrors status/pairing-code so the Settings UI
    // can poll instead of tailing the daemon log. Not a public feature yet.
    this.statusPath = path.join(path.dirname(this.authDir), `status-${account.id}.json`);
  }

  private writeStatusFile(extra: Record<string, unknown> = {}): void {
    try {
      fs.writeFileSync(
        this.statusPath,
        JSON.stringify({ status: this.status, updatedAt: new Date().toISOString(), ...extra }),
        { mode: 0o600 }
      );
    } catch {
      /* best-effort */
    }
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  async start(): Promise<void> {
    fs.mkdirSync(this.authDir, { recursive: true });
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearQrFile();
    try {
      this.sock?.end(undefined);
    } catch {
      // best-effort teardown
    }
  }

  private clearQrFile(): void {
    try {
      fs.unlinkSync(this.qrPath);
    } catch {
      /* absent is fine */
    }
  }

  private async connect(): Promise<void> {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Baileys API, not a React hook
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    const { version } = await fetchLatestWaWebVersion({}).catch(() => ({
      version: undefined,
    }));

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
      },
      printQRInTerminal: false,
      logger: silentLogger,
      browser: Browsers.macOS("Chrome"),
      // Receive-only: never mark chats read, never send presence.
      markOnlineOnConnect: false,
    });
    this.sock = sock;
    this.writeStatusFile();

    sock.ev.on("creds.update", saveCreds);

    // Manual-testing path: request a pairing code instead of waiting for the
    // QR event. Only meaningful on first pairing (no saved session yet).
    if (!state.creds.registered && this.pairingPhone) {
      this.status = "pairing";
      this.writeStatusFile({ method: "code" });
      sock
        .requestPairingCode(this.pairingPhone)
        .then((code) => {
          this.log(
            `[${this.id}] pairing code: ${code} — enter it in WhatsApp → ` +
              `Settings → Linked Devices → Link a Device → Link with phone number instead`
          );
          this.writeStatusFile({ method: "code", code });
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.log(`[${this.id}] failed to request pairing code: ${message}`);
          this.writeStatusFile({ method: "code", error: message });
        });
    }

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !this.pairingPhone) {
        this.status = "pairing";
        this.log(
          `[${this.id}] pairing required — scan this QR with WhatsApp ` +
            `(Settings → Linked Devices → Link a Device):`
        );
        qrcode.generate(qr, { small: true });
        try {
          fs.writeFileSync(this.qrPath, qr, { mode: 0o600 });
        } catch {
          /* QR file is a convenience for future UI; terminal print suffices */
        }
        this.writeStatusFile({ method: "qr" });
      }

      if (connection === "open") {
        this.status = "open";
        this.clearQrFile();
        this.log(`[${this.id}] connected`);
        this.writeStatusFile();
      } else if (connection === "close") {
        this.status = "close";
        const reason = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output
          ?.statusCode;
        const loggedOut = reason === DisconnectReason.loggedOut;
        this.log(`[${this.id}] connection closed (reason=${reason ?? "?"})`);
        if (this.stopped) return;
        if (loggedOut) {
          this.log(`[${this.id}] logged out — delete ${this.authDir} and re-pair`);
          this.writeStatusFile({ loggedOut: true });
          return;
        }
        this.writeStatusFile({ reason: reason ?? null });
        // Reconnect; one delayed retry if the immediate attempt throws.
        this.connect().catch(() => {
          setTimeout(() => {
            this.connect().catch((err) =>
              this.log(
                `[${this.id}] reconnect retry failed: ${err instanceof Error ? err.message : err}`
              )
            );
          }, 5000);
        });
      }
    });

    sock.ev.on("messages.upsert", ({ messages }) => {
      for (const raw of messages) {
        const msg = normalizeMessage(this.id, raw);
        if (msg) this.bus.publish(msg);
      }
    });
  }
}

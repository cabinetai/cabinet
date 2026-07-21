import WebSocket from "ws";
import type { HermesServerConfig } from "./server-config";
import { hermesGatewayWebSocketUrl } from "./server-config";
import type { HermesGatewayEvent } from "./types";

type RpcId = string;
type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type Socket = Pick<WebSocket, "on" | "send" | "close" | "readyState">;
type SocketFactory = (url: string) => Socket;

type RpcFrame = {
  id?: RpcId | null;
  method?: string;
  result?: unknown;
  error?: { code?: number; message?: string };
  params?: HermesGatewayEvent;
};

export class HermesGatewayError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "authentication"
      | "disconnect"
      | "timeout"
      | "stale_session"
      | "busy"
      | "rpc"
  ) {
    super(message);
    this.name = "HermesGatewayError";
  }
}

function classifyRpcError(code: number | undefined, message: string): HermesGatewayError {
  if (code === 4007 || /session not found/i.test(message)) {
    return new HermesGatewayError(message, "stale_session");
  }
  if (code === 4009 || /session busy/i.test(message)) {
    return new HermesGatewayError(message, "busy");
  }
  return new HermesGatewayError(message, "rpc");
}

export type HermesGatewaySession = {
  liveSessionId: string;
  sessionId: string;
  messages: unknown[];
};

export type HermesSensitiveResponseStatus = "ok" | "expired";

export type HermesStoredSession = {
  id: string;
  title: string;
  preview: string;
  startedAt: number;
  messageCount: number;
  source: string;
};

export type HermesActiveSession = {
  liveSessionId: string;
  sessionId: string;
  status: string;
  running: boolean;
};

export class HermesGatewayClient {
  private socket: Socket | null = null;
  private nextId = 0;
  private readonly pending = new Map<RpcId, PendingCall>();
  private readonly handlers = new Set<(event: HermesGatewayEvent) => void>();

  constructor(
    private readonly config: HermesServerConfig,
    private readonly socketFactory: SocketFactory = (url) => new WebSocket(url),
  ) {}

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    const socket = this.socketFactory(hermesGatewayWebSocketUrl(this.config));
    this.socket = socket;
    socket.on("message", (raw: WebSocket.RawData) => this.handleFrames(String(raw)));
    socket.on("close", () => {
      if (this.socket === socket) this.socket = null;
      this.rejectPending(new HermesGatewayError("Hermes gateway disconnected.", "disconnect"));
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(new HermesGatewayError("Hermes gateway connection timed out.", "timeout"));
      }, this.config.timeoutMs);
      socket.on("open", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on("error", (error: Error) => {
        clearTimeout(timer);
        reject(
          new HermesGatewayError(
            error.message || "Hermes gateway connection failed.",
            /401|403|unauthor/i.test(error.message) ? "authentication" : "disconnect",
          ),
        );
      });
    });
  }

  onEvent(handler: (event: HermesGatewayEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async createSession(input: { cwd: string; title?: string }): Promise<HermesGatewaySession> {
    const result = await this.request<Record<string, unknown>>("session.create", {
      cols: 100,
      cwd: input.cwd,
      title: input.title || "",
      profile: this.config.profile,
      source: "cabinet",
      close_on_disconnect: false,
    });
    return {
      liveSessionId: String(result.session_id || ""),
      sessionId: String(result.stored_session_id || ""),
      messages: Array.isArray(result.messages) ? result.messages : [],
    };
  }

  async resumeSession(sessionId: string): Promise<HermesGatewaySession> {
    const result = await this.request<Record<string, unknown>>("session.resume", {
      session_id: sessionId,
      cols: 100,
      profile: this.config.profile,
      source: "cabinet",
      close_on_disconnect: false,
    });
    return {
      liveSessionId: String(result.session_id || ""),
      sessionId: String(result.session_key || result.resumed || sessionId),
      messages: Array.isArray(result.messages) ? result.messages : [],
    };
  }

  async listSessions(limit = 200): Promise<HermesStoredSession[]> {
    const result = await this.request<Record<string, unknown>>("session.list", { limit });
    const rows = Array.isArray(result.sessions) ? result.sessions : [];
    return rows.map((value) => {
      const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      return {
        id: String(row.id || ""),
        title: String(row.title || ""),
        preview: String(row.preview || ""),
        startedAt: typeof row.started_at === "number" ? row.started_at : 0,
        messageCount: typeof row.message_count === "number" ? row.message_count : 0,
        source: String(row.source || ""),
      };
    }).filter((row) => row.id);
  }

  async listActiveSessions(): Promise<HermesActiveSession[]> {
    const result = await this.request<Record<string, unknown>>("session.active_list", {});
    const rows = Array.isArray(result.sessions) ? result.sessions : [];
    return rows.map((value) => {
      const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      return {
        liveSessionId: String(row.session_id || row.id || ""),
        sessionId: String(row.session_key || row.stored_session_id || ""),
        status: String(row.status || (row.running ? "running" : "idle")),
        running: row.running === true,
      };
    }).filter((row) => row.liveSessionId);
  }

  async renameSession(liveSessionId: string, title: string): Promise<void> {
    await this.request("session.title", { session_id: liveSessionId, title }, 30_000);
  }

  async submitPrompt(liveSessionId: string, text: string): Promise<void> {
    await this.request("prompt.submit", { session_id: liveSessionId, text });
  }

  async steer(liveSessionId: string, text: string): Promise<void> {
    await this.submitPrompt(liveSessionId, text);
  }

  async interrupt(liveSessionId: string): Promise<void> {
    await this.request("session.interrupt", { session_id: liveSessionId }, 10_000);
  }

  async respondClarification(requestId: string, answer: string): Promise<void> {
    await this.request("clarify.respond", { request_id: requestId, answer }, 30_000);
  }

  async respondApproval(
    liveSessionId: string,
    choice: "once" | "session" | "always" | "deny"
  ): Promise<{ resolved: boolean }> {
    return this.request(
      "approval.respond",
      { session_id: liveSessionId, choice },
      30_000
    );
  }

  async respondSecret(
    requestId: string,
    value: string
  ): Promise<{ status: HermesSensitiveResponseStatus }> {
    return this.request("secret.respond", { request_id: requestId, value }, 30_000);
  }

  async respondSudo(
    requestId: string,
    password: string
  ): Promise<{ status: HermesSensitiveResponseStatus }> {
    return this.request(
      "sudo.respond",
      { request_id: requestId, password },
      30_000
    );
  }

  async branch(sessionId: string): Promise<Record<string, unknown>> {
    return this.request("session.branch", {
      session_id: sessionId,
      profile: this.config.profile,
    });
  }

  async activate(liveSessionId: string): Promise<void> {
    await this.request("session.activate", { session_id: liveSessionId });
  }

  async closeSession(liveSessionId: string): Promise<void> {
    await this.request("session.close", { session_id: liveSessionId }, 10_000);
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  private request<T>(method: string, params: Record<string, unknown>, timeoutMs = 120_000): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new HermesGatewayError("Hermes gateway is not connected.", "disconnect"));
    }
    const id = `cabinet-${++this.nextId}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HermesGatewayError(`Hermes request timed out: ${method}`, "timeout"));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  private handleFrames(raw: string): void {
    for (const line of raw.split("\n").filter(Boolean)) {
      let frame: RpcFrame;
      try {
        frame = JSON.parse(line) as RpcFrame;
      } catch {
        continue;
      }
      if (frame.id != null) {
        const call = this.pending.get(frame.id);
        if (!call) continue;
        clearTimeout(call.timer);
        this.pending.delete(frame.id);
        if (frame.error) {
          call.reject(classifyRpcError(frame.error.code, frame.error.message || "Hermes RPC failed."));
        } else {
          call.resolve(frame.result);
        }
      } else if (frame.method === "event" && frame.params?.type) {
        for (const handler of this.handlers) handler(frame.params);
      }
    }
  }

  private rejectPending(error: Error): void {
    for (const [id, call] of this.pending) {
      clearTimeout(call.timer);
      call.reject(error);
      this.pending.delete(id);
    }
  }
}

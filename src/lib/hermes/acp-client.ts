import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { HermesExecutionServerConfig } from "./server-config";

const MAX_FRAME_BYTES = 1_048_576;
const SHUTDOWN_GRACE_MS = 2_000;
const IDLE_PROCESS_TTL_MS = 15 * 60 * 1_000;

type TurnState = {
  epochId: string;
  sessionId: string;
  output: string;
  seen: Set<string>;
  messageIds: Set<string>;
  toolEventCount: number;
  fatal: HermesAcpError | null;
  onDelta?: (text: string) => Promise<void> | void;
};

export class HermesAcpError extends Error {
  constructor(
    readonly kind: "configuration" | "protocol" | "session_expired" | "timeout" | "transport" | "tool_event",
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "HermesAcpError";
  }
}

export type HermesAcpTurnResult = {
  output: string;
  sessionId: string;
  stopReason: string;
  toolEventCount: number;
};

function boundedError(kind: HermesAcpError["kind"]): string {
  if (kind === "timeout") return "Hermes did not respond in time.";
  if (kind === "session_expired") return "The Hermes session is no longer available.";
  if (kind === "tool_event") return "Hermes emitted a forbidden tool event.";
  if (kind === "configuration") return "The Hermes ACP executable is unavailable.";
  if (kind === "protocol") return "Hermes returned an invalid protocol response.";
  return "The Hermes execution process disconnected.";
}

function safeEnvironment(config: HermesExecutionServerConfig): NodeJS.ProcessEnv {
  const allowed = ["HOME", "LOGNAME", "PATH", "SHELL", "TMPDIR", "USER", "LANG", "LC_ALL"];
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV || "production",
    HERMES_ACP_NO_TOOLS: "1",
    HERMES_PROFILE: config.profile,
  };
  for (const name of allowed) {
    if (process.env[name]) env[name] = process.env[name];
  }
  const credential = process.env[config.providerCredentialEnvName];
  if (!credential) {
    throw new HermesAcpError("configuration", boundedError("configuration"));
  }
  env[config.providerCredentialEnvName] = credential;
  return env;
}

function identity(config: HermesExecutionServerConfig, cwd: string): string {
  return `${config.cliPath}\0${config.profile}\0${config.providerCredentialEnvName}\0${cwd}`;
}

export async function validateHermesAcpExecutable(config: HermesExecutionServerConfig): Promise<void> {
  try {
    await fs.access(config.cliPath, fs.constants.X_OK);
  } catch {
    throw new HermesAcpError("configuration", boundedError("configuration"));
  }
}

class PersistentHermesAcpClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private connection: acp.ClientConnection | null = null;
  private context: acp.ClientContext | null = null;
  private activeTurn: TurnState | null = null;
  private protocolParseErrors = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedSessionId: string | null = null;
  private loadingSessionId: string | null = null;
  private loadIdentityMismatch = false;
  private notificationTail: Promise<void> = Promise.resolve();
  private completedMessageIds = new Map<string, Set<string>>();

  constructor(
    readonly config: HermesExecutionServerConfig,
    readonly cwd: string,
  ) {}

  get process(): ChildProcessWithoutNullStreams | null {
    return this.child;
  }

  get active(): boolean {
    return !!this.child &&
      this.child.exitCode === null &&
      this.child.signalCode === null &&
      !!this.connection &&
      !this.connection.signal.aborted;
  }

  matches(config: HermesExecutionServerConfig, cwd: string): boolean {
    return identity(this.config, this.cwd) === identity(config, cwd);
  }

  async start(onSpawn?: (child: ChildProcessWithoutNullStreams) => void): Promise<void> {
    this.clearIdleTimer();
    if (this.active && this.child) {
      onSpawn?.(this.child);
      return;
    }
    if (this.child || this.connection) {
      await this.stop();
    }

    await validateHermesAcpExecutable(this.config);
    const child = spawn(this.config.cliPath, [], {
      cwd: this.cwd,
      env: safeEnvironment(this.config),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    onSpawn?.(child);
    child.stderr.resume();

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", () => reject(
        new HermesAcpError("configuration", boundedError("configuration")),
      ));
    });

    const forbiddenClientMethod = (): never => {
      const error = new HermesAcpError("tool_event", boundedError("tool_event"));
      if (this.activeTurn) {
        this.activeTurn.toolEventCount += 1;
        this.activeTurn.fatal = error;
      }
      throw error;
    };

    const app = acp
      .client({ name: "cabinet" })
      .onRequest(acp.methods.client.session.requestPermission, () => {
        if (this.activeTurn) this.activeTurn.toolEventCount += 1;
        return { outcome: { outcome: "cancelled" as const } };
      })
      .onRequest(acp.methods.client.fs.readTextFile, forbiddenClientMethod)
      .onRequest(acp.methods.client.fs.writeTextFile, forbiddenClientMethod)
      .onRequest(acp.methods.client.terminal.create, forbiddenClientMethod)
      .onRequest(acp.methods.client.terminal.output, forbiddenClientMethod)
      .onRequest(acp.methods.client.terminal.release, forbiddenClientMethod)
      .onRequest(acp.methods.client.terminal.waitForExit, forbiddenClientMethod)
      .onRequest(acp.methods.client.terminal.kill, forbiddenClientMethod)
      .onNotification(acp.methods.client.session.update, ({ params }) => {
        this.notificationTail = this.notificationTail.then(async () => {
          if (this.loadingSessionId) {
            if (params.sessionId !== this.loadingSessionId) {
              this.loadIdentityMismatch = true;
            }
            return;
          }

          const turn = this.activeTurn;
          if (!turn || params.sessionId !== turn.sessionId) return;
          const update = params.update;
          if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
            turn.toolEventCount += 1;
            turn.fatal = new HermesAcpError("tool_event", boundedError("tool_event"));
            return;
          }
          if (update.sessionUpdate !== "agent_message_chunk" || update.content.type !== "text") return;
          if (
            update.messageId &&
            this.completedMessageIds.get(turn.sessionId)?.has(update.messageId)
          ) {
            return;
          }
          const signature = JSON.stringify(update);
          if (turn.seen.has(signature)) return;
          turn.seen.add(signature);
          if (update.messageId) turn.messageIds.add(update.messageId);
          turn.output += update.content.text;
          await turn.onDelta?.(update.content.text);
        });
        return this.notificationTail;
      });

    const input = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;
    const output = (Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>)
      .pipeThrough(this.protocolFrameGuard());
    const connection = app.connect(acp.ndJsonStream(input, output));
    this.connection = connection;
    this.context = connection.agent;
    connection.closed
      .finally(() => {
        if (this.connection === connection) {
          this.connection = null;
          this.context = null;
          this.loadedSessionId = null;
        }
      })
      .catch(() => undefined);

    try {
      const initialized = await this.withTimeout(
        connection.agent.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
          clientInfo: {
            name: "cabinet",
            title: "Cabinet",
            version: "0.5.3",
          },
        }),
        this.config.timeoutMs,
      );
      if (initialized.protocolVersion !== acp.PROTOCOL_VERSION) {
        throw new HermesAcpError("protocol", boundedError("protocol"));
      }
      if (/"terminal"|"fs"|"fileSystem"/i.test(JSON.stringify(initialized.agentCapabilities ?? {}))) {
        throw new HermesAcpError("tool_event", boundedError("tool_event"));
      }
    } catch (error) {
      await this.stop();
      throw this.normalizeError(error);
    }
  }

  async prepareSession(sessionId?: string | null): Promise<string> {
    if (sessionId) {
      if (this.loadedSessionId !== sessionId) {
        this.loadingSessionId = sessionId;
        this.loadIdentityMismatch = false;
        try {
          const loaded = await this.request(acp.methods.agent.session.load, {
            cwd: this.cwd,
            mcpServers: [],
            sessionId,
          });
          await this.drainNotifications();
          const returnedSessionId = this.loadedIdentity(loaded);
          if (
            this.loadIdentityMismatch ||
            (returnedSessionId !== null && returnedSessionId !== sessionId)
          ) {
            throw new HermesAcpError("protocol", boundedError("protocol"));
          }
        } catch (error) {
          if (error instanceof HermesAcpError && error.kind === "protocol") throw error;
          throw new HermesAcpError("session_expired", boundedError("session_expired"), error);
        } finally {
          this.loadingSessionId = null;
        }
        this.loadedSessionId = sessionId;
      }
      return sessionId;
    }
    const created = await this.request(acp.methods.agent.session.new, {
      cwd: this.cwd,
      mcpServers: [],
    });
    this.loadedSessionId = created.sessionId;
    return created.sessionId;
  }

  async prompt(
    sessionId: string,
    prompt: string,
    timeoutMs: number,
    onDelta?: (text: string) => Promise<void> | void,
  ): Promise<HermesAcpTurnResult> {
    if (this.activeTurn) {
      throw new HermesAcpError("transport", "The Hermes session is already running.");
    }
    const state: TurnState = {
      epochId: randomUUID(),
      sessionId,
      output: "",
      seen: new Set(),
      messageIds: new Set(),
      toolEventCount: 0,
      fatal: null,
      onDelta,
    };
    this.activeTurn = state;
    try {
      const response = await this.withTimeout(
        this.request(acp.methods.agent.session.prompt, {
          sessionId,
          prompt: [{ type: "text", text: prompt }],
          _meta: {
            cabinet: {
              promptEpoch: state.epochId,
            },
          },
        }),
        timeoutMs,
        async () => {
          await this.context?.notify(acp.methods.agent.session.cancel, { sessionId });
        },
      );
      await this.drainNotifications();
      if (state.fatal) throw state.fatal;
      if (!state.output.trim()) {
        throw new HermesAcpError("protocol", "Hermes completed without an assistant response.");
      }
      return {
        output: state.output,
        sessionId,
        stopReason: response.stopReason,
        toolEventCount: state.toolEventCount,
      };
    } catch (error) {
      throw this.normalizeError(error);
    } finally {
      if (state.messageIds.size > 0) {
        const completed = this.completedMessageIds.get(sessionId) ?? new Set<string>();
        for (const messageId of state.messageIds) completed.add(messageId);
        this.completedMessageIds.set(sessionId, completed);
      }
      this.activeTurn = null;
      this.scheduleIdleStop();
    }
  }

  async stop(): Promise<void> {
    this.clearIdleTimer();
    const connection = this.connection;
    const child = this.child;
    this.connection = null;
    this.context = null;
    this.child = null;
    this.loadedSessionId = null;
    connection?.close();
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        resolve();
      }, SHUTDOWN_GRACE_MS)),
    ]);
  }

  private scheduleIdleStop(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      void this.stop();
    }, IDLE_PROCESS_TTL_MS);
    this.idleTimer.unref();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private async request<Method extends acp.AgentRequestMethod>(
    method: Method,
    params: acp.AgentRequestParamsByMethod[Method],
  ): Promise<acp.AgentRequestResponsesByMethod[Method]> {
    if (!this.context) {
      throw new HermesAcpError("transport", boundedError("transport"));
    }
    try {
      return await this.context.request(method, params);
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    onTimeout?: () => Promise<void>,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void onTimeout?.().finally(() => {
          reject(new HermesAcpError("timeout", boundedError("timeout")));
        });
        if (!onTimeout) reject(new HermesAcpError("timeout", boundedError("timeout")));
      }, timeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private normalizeError(error: unknown): HermesAcpError {
    if (error instanceof HermesAcpError) return error;
    if (this.protocolParseErrors > 0) {
      return new HermesAcpError("protocol", boundedError("protocol"), error);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/session.*(not found|unknown|expired|available)/i.test(message)) {
      return new HermesAcpError("session_expired", boundedError("session_expired"), error);
    }
    if (/json|parse|invalid|schema|protocol/i.test(message)) {
      this.protocolParseErrors += 1;
      return new HermesAcpError("protocol", boundedError("protocol"), error);
    }
    return new HermesAcpError("transport", boundedError("transport"), error);
  }

  private async drainNotifications(): Promise<void> {
    // The SDK dispatches notification handlers asynchronously even though
    // NDJSON frames are parsed in wire order. Yield one event-loop turn so
    // every notification preceding the completed request can join the tail,
    // then await the handlers themselves. This is an ordering barrier, not a
    // timing assumption.
    await new Promise<void>((resolve) => setImmediate(resolve));
    await this.notificationTail;
  }

  /**
   * Hermes exposes its stable ACP identity through an optional namespaced
   * extension. ACP v1's load response has no standard session-id field, so a
   * missing extension is not an error; a present contradictory identity is.
   */
  private loadedIdentity(response: acp.LoadSessionResponse): string | null {
    const hermes = response._meta?.hermes;
    if (!hermes || typeof hermes !== "object" || Array.isArray(hermes)) return null;
    const provenance = (hermes as Record<string, unknown>).sessionProvenance;
    if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) return null;
    const value = (provenance as Record<string, unknown>).acpSessionId;
    return typeof value === "string" && value ? value : null;
  }

  private protocolFrameGuard(): TransformStream<Uint8Array, Uint8Array> {
    const decoder = new TextDecoder();
    let buffer = "";
    return new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        buffer += decoder.decode(chunk, { stream: true });
        if (Buffer.byteLength(buffer, "utf8") > MAX_FRAME_BYTES) {
          this.protocolParseErrors += 1;
          controller.error(new HermesAcpError("protocol", boundedError("protocol")));
          return;
        }
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) {
            try {
              const value: unknown = JSON.parse(line);
              if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new Error("frame is not an object");
              }
            } catch {
              this.protocolParseErrors += 1;
              controller.error(new HermesAcpError("protocol", boundedError("protocol")));
              return;
            }
          }
          newline = buffer.indexOf("\n");
        }
        controller.enqueue(chunk);
      },
      flush: (controller) => {
        buffer += decoder.decode();
        if (buffer.trim()) {
          this.protocolParseErrors += 1;
          controller.error(new HermesAcpError("protocol", boundedError("protocol")));
        }
      },
    });
  }
}

const clientsBySession = new Map<string, PersistentHermesAcpClient>();

function removeClient(client: PersistentHermesAcpClient): void {
  for (const [sessionId, candidate] of clientsBySession) {
    if (candidate === client) clientsBySession.delete(sessionId);
  }
}

export async function shutdownHermesAcpClients(): Promise<void> {
  const clients = [...new Set(clientsBySession.values())];
  clientsBySession.clear();
  await Promise.all(clients.map((client) => client.stop()));
}

export async function runHermesAcpTurn(input: {
  config: HermesExecutionServerConfig;
  cwd: string;
  prompt: string;
  sessionId?: string | null;
  timeoutMs: number;
  onDelta?: (text: string) => Promise<void> | void;
  onSpawn?: (child: ChildProcessWithoutNullStreams) => void;
}): Promise<HermesAcpTurnResult> {
  if (input.config.noTools !== true) {
    throw new HermesAcpError("configuration", boundedError("configuration"));
  }

  let client = input.sessionId ? clientsBySession.get(input.sessionId) : undefined;
  if (client && !client.matches(input.config, input.cwd)) {
    await client.stop();
    removeClient(client);
    client = undefined;
  }
  client ??= new PersistentHermesAcpClient(input.config, input.cwd);

  try {
    await client.start(input.onSpawn);
    const sessionId = await client.prepareSession(input.sessionId);
    const result = await client.prompt(sessionId, input.prompt, input.timeoutMs, input.onDelta);
    clientsBySession.set(sessionId, client);
    return result;
  } catch (error) {
    removeClient(client);
    await client.stop();
    throw error instanceof HermesAcpError
      ? error
      : new HermesAcpError("transport", boundedError("transport"), error);
  }
}

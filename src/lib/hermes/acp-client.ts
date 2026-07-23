import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import type { HermesExecutionServerConfig } from "./server-config";

const MAX_FRAME_BYTES = 1_048_576;
const SHUTDOWN_GRACE_MS = 2_000;

type JsonObject = Record<string, unknown>;

export class HermesAcpError extends Error {
  constructor(
    readonly kind: "configuration" | "protocol" | "session_expired" | "timeout" | "transport" | "tool_event",
    message: string,
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

function safeEnvironment(noTools: true): NodeJS.ProcessEnv {
  const allowed = ["HOME", "LOGNAME", "PATH", "SHELL", "TMPDIR", "USER", "LANG", "LC_ALL"];
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV || "production",
  };
  if (noTools) env.HERMES_ACP_NO_TOOLS = "1";
  for (const name of allowed) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function boundedError(kind: HermesAcpError["kind"]): string {
  if (kind === "timeout") return "Hermes did not respond in time.";
  if (kind === "session_expired") return "The Hermes session is no longer available.";
  if (kind === "tool_event") return "Hermes emitted a forbidden tool event.";
  if (kind === "configuration") return "The Hermes execution CLI is unavailable.";
  if (kind === "protocol") return "Hermes returned an invalid protocol response.";
  return "The Hermes execution process disconnected.";
}

export async function validateHermesAcpExecutable(config: HermesExecutionServerConfig): Promise<void> {
  try {
    await fs.access(config.cliPath, fs.constants.X_OK);
  } catch {
    throw new HermesAcpError("configuration", boundedError("configuration"));
  }
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
  await validateHermesAcpExecutable(input.config);

  const child = spawn(
    input.config.cliPath,
    ["-p", input.config.profile, "acp"],
    {
      cwd: input.cwd,
      env: safeEnvironment(input.config.noTools),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  input.onSpawn?.(child);

  let nextId = 1;
  let buffer = "";
  let output = "";
  let sessionId = input.sessionId?.trim() || "";
  let collecting = false;
  let toolEventCount = 0;
  let lastChunkSignature = "";
  let settled = false;
  const pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  const fail = (error: HermesAcpError) => {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  };

  const send = (payload: JsonObject) => {
    if (!child.stdin.writable) {
      throw new HermesAcpError("transport", boundedError("transport"));
    }
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  };

  const request = (method: string, params: JsonObject): Promise<unknown> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        send({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  };

  const handleMessage = async (message: unknown) => {
    if (!isRecord(message)) throw new HermesAcpError("protocol", boundedError("protocol"));
    if (typeof message.method === "string") {
      if (message.method === "session/update") {
        const params = isRecord(message.params) ? message.params : null;
        const update = params && isRecord(params.update) ? params.update : null;
        if (!params || params.sessionId !== sessionId || !update) return;
        const updateType = update.sessionUpdate;
        if (updateType === "tool_call" || updateType === "tool_call_update") {
          toolEventCount += 1;
          throw new HermesAcpError("tool_event", boundedError("tool_event"));
        }
        if (collecting && updateType === "agent_message_chunk") {
          const content = isRecord(update.content) ? update.content : null;
          const text = content?.type === "text" && typeof content.text === "string"
            ? content.text
            : "";
          if (!text) return;
          const signature = JSON.stringify(update);
          if (signature === lastChunkSignature) return;
          lastChunkSignature = signature;
          output += text;
          await input.onDelta?.(text);
        }
        return;
      }
      if ("id" in message) {
        send({
          jsonrpc: "2.0",
          id: message.id as string | number | null,
          error: { code: -32601, message: "Method not supported" },
        });
      }
      return;
    }
    if (typeof message.id !== "number") {
      throw new HermesAcpError("protocol", boundedError("protocol"));
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if ("error" in message) {
      waiter.reject(new HermesAcpError("protocol", boundedError("protocol")));
    } else {
      waiter.resolve(message.result);
    }
  };

  let processing = Promise.resolve();
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    if (Buffer.byteLength(buffer, "utf8") > MAX_FRAME_BYTES) {
      fail(new HermesAcpError("protocol", boundedError("protocol")));
      child.kill("SIGTERM");
      return;
    }
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        processing = processing.then(async () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            throw new HermesAcpError("protocol", boundedError("protocol"));
          }
          await handleMessage(parsed);
        }).catch((error) => {
          const safe = error instanceof HermesAcpError
            ? error
            : new HermesAcpError("protocol", boundedError("protocol"));
          fail(safe);
          child.kill("SIGTERM");
        });
      }
      newline = buffer.indexOf("\n");
    }
  });
  child.stderr.resume();
  child.once("error", () => fail(new HermesAcpError("transport", boundedError("transport"))));
  child.once("exit", () => {
    if (!settled) fail(new HermesAcpError("transport", boundedError("transport")));
  });

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      if (sessionId && child.stdin.writable) {
        try {
          send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
        } catch { /* shutdown below */ }
      }
      child.kill("SIGTERM");
      reject(new HermesAcpError("timeout", boundedError("timeout")));
    }, input.timeoutMs);
  });

  const execute = async (): Promise<HermesAcpTurnResult> => {
    const initialized = await request("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "cabinet", title: "Cabinet", version: "0.5.3" },
    });
    if (!isRecord(initialized) || initialized.protocolVersion !== 1) {
      throw new HermesAcpError("protocol", boundedError("protocol"));
    }

    if (sessionId) {
      const loaded = await request("session/load", { cwd: input.cwd, sessionId, mcpServers: [] });
      if (!isRecord(loaded)) {
        throw new HermesAcpError("session_expired", boundedError("session_expired"));
      }
    } else {
      const created = await request("session/new", { cwd: input.cwd, mcpServers: [] });
      if (!isRecord(created) || typeof created.sessionId !== "string" || !created.sessionId) {
        throw new HermesAcpError("protocol", boundedError("protocol"));
      }
      sessionId = created.sessionId;
    }

    output = "";
    lastChunkSignature = "";
    collecting = true;
    const promptResult = await request("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: input.prompt }],
      messageId: randomUUID(),
    });
    collecting = false;
    if (!isRecord(promptResult) || typeof promptResult.stopReason !== "string") {
      throw new HermesAcpError("protocol", boundedError("protocol"));
    }
    if (!output.trim()) {
      throw new HermesAcpError("protocol", "Hermes completed without an assistant response.");
    }
    return { output, sessionId, stopReason: promptResult.stopReason, toolEventCount };
  };

  try {
    const result = await Promise.race([execute(), timedOut]);
    settled = true;
    return result;
  } finally {
    if (timeout) clearTimeout(timeout);
    settled = true;
    if (child.stdin.writable) child.stdin.end();
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    await Promise.race([
      exited,
      new Promise<void>((resolve) => setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolve();
      }, SHUTDOWN_GRACE_MS)),
    ]);
  }
}

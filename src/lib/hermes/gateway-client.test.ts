import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import WebSocket from "ws";
import { HermesGatewayClient, HermesGatewayError } from "./gateway-client";
import { hermesGatewayWebSocketUrl, type HermesServerConfig } from "./server-config";

const config: HermesServerConfig = {
  apiBaseUrl: "http://127.0.0.1:8642",
  apiKey: "server-only-test-key",
  managementBaseUrl: "http://127.0.0.1:8645",
  gatewayBaseUrl: "http://127.0.0.1:8645",
  gatewayToken: "server-only-test-key",
  profile: "operator-os",
  timeoutMs: 500,
};

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.CONNECTING;
  sent: Array<Record<string, unknown>> = [];

  open() {
    this.readyState = WebSocket.OPEN;
    this.emit("open");
  }

  send(raw: string) {
    this.sent.push(JSON.parse(raw) as Record<string, unknown>);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }

  respond(index: number, result: unknown) {
    this.emit("message", JSON.stringify({ id: this.sent[index].id, result }));
  }
}

test("builds the server-only gateway URL without changing the configured base", () => {
  assert.equal(
    hermesGatewayWebSocketUrl(config),
    "ws://127.0.0.1:8645/api/ws?token=server-only-test-key"
  );
  assert.equal(config.apiBaseUrl, "http://127.0.0.1:8642");
});

test("creates a session and preserves live and durable Hermes identity", async () => {
  const socket = new FakeSocket();
  let openedUrl = "";
  const client = new HermesGatewayClient(config, ((url: string) => {
    openedUrl = url;
    queueMicrotask(() => socket.open());
    return socket;
  }) as never);

  await client.connect();
  const pending = client.createSession({ cwd: "/tmp/work", title: "Hello" });
  socket.respond(0, {
    session_id: "live-123",
    stored_session_id: "durable-456",
    messages: [],
  });
  assert.deepEqual(await pending, {
    liveSessionId: "live-123",
    sessionId: "durable-456",
    messages: [],
  });
  assert.match(openedUrl, /^ws:\/\/127\.0\.0\.1:8645\/api\/ws\?token=/);
  const params = socket.sent[0].params as Record<string, unknown>;
  assert.equal(params.profile, "operator-os");
  assert.equal(params.source, "cabinet");
  client.close();
});

test("delivers structured events and classifies stale sessions", async () => {
  const socket = new FakeSocket();
  const client = new HermesGatewayClient(
    config,
    (() => {
      queueMicrotask(() => socket.open());
      return socket;
    }) as never
  );
  const events: string[] = [];
  client.onEvent((event) => events.push(event.type));
  await client.connect();

  socket.emit(
    "message",
    `${JSON.stringify({
      jsonrpc: "2.0",
      method: "event",
      params: { type: "message.delta", session_id: "live", payload: { text: "Hi" } },
    })}\n${JSON.stringify({
      jsonrpc: "2.0",
      method: "event",
      params: { type: "tool.start", session_id: "live", payload: { name: "search" } },
    })}`
  );
  assert.deepEqual(events, ["message.delta", "tool.start"]);

  const pending = client.resumeSession("missing");
  socket.emit(
    "message",
    JSON.stringify({
      id: socket.sent[0].id,
      error: { code: 4007, message: "session not found" },
    })
  );
  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof HermesGatewayError);
    assert.equal(error.kind, "stale_session");
    return true;
  });
  client.close();
});

test("sends governed responses with exact Hermes request identity", async () => {
  const socket = new FakeSocket();
  const client = new HermesGatewayClient(
    config,
    (() => {
      queueMicrotask(() => socket.open());
      return socket;
    }) as never
  );
  await client.connect();

  const clarification = client.respondClarification("clarify-1", "Scope A");
  socket.respond(0, { status: "ok" });
  await clarification;
  assert.deepEqual(socket.sent[0], {
    jsonrpc: "2.0",
    id: "cabinet-1",
    method: "clarify.respond",
    params: { request_id: "clarify-1", answer: "Scope A" },
  });

  const approval = client.respondApproval("live-1", "once");
  socket.respond(1, { resolved: true });
  assert.deepEqual(await approval, { resolved: true });

  const secret = client.respondSecret("secret-1", "never-persist-this");
  socket.respond(2, { status: "ok" });
  assert.deepEqual(await secret, { status: "ok" });

  const sudo = client.respondSudo("sudo-1", "never-persist-this-either");
  socket.respond(3, { status: "expired" });
  assert.deepEqual(await sudo, { status: "expired" });

  assert.deepEqual(socket.sent.slice(1).map((frame) => frame.method), [
    "approval.respond",
    "secret.respond",
    "sudo.respond",
  ]);
  client.close();
});

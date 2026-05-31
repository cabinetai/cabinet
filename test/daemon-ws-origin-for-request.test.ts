import test from "node:test";
import assert from "node:assert/strict";
import { getPublicDaemonWsOriginForRequest } from "@/lib/runtime/runtime-config";

const ORIGINAL_PUBLIC = process.env.CABINET_PUBLIC_DAEMON_ORIGIN;
const ORIGINAL_PORT = process.env.CABINET_DAEMON_PORT;

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function fakeReq(headers: Record<string, string>) {
  return { headers: new Headers(headers) };
}

// Pin the daemon port for deterministic assertions across machines.
test.before(() => {
  process.env.CABINET_DAEMON_PORT = "4100";
});

test.after(() => {
  if (ORIGINAL_PORT === undefined) delete process.env.CABINET_DAEMON_PORT;
  else process.env.CABINET_DAEMON_PORT = ORIGINAL_PORT;
  if (ORIGINAL_PUBLIC === undefined) delete process.env.CABINET_PUBLIC_DAEMON_ORIGIN;
  else process.env.CABINET_PUBLIC_DAEMON_ORIGIN = ORIGINAL_PUBLIC;
});

// --- Explicit override branch ---------------------------------------------

test("explicit ws:// override is returned as-is", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: "ws://cabinet.example.com:4100" }, () => {
    const out = getPublicDaemonWsOriginForRequest(fakeReq({ host: "evil.invalid:4000" }));
    assert.equal(out, "ws://cabinet.example.com:4100");
  });
});

test("explicit wss:// override is returned as-is", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: "wss://cabinet.example.com" }, () => {
    const out = getPublicDaemonWsOriginForRequest(fakeReq({ host: "evil.invalid:4000" }));
    assert.equal(out, "wss://cabinet.example.com");
  });
});

test("explicit http:// override is upgraded to ws://", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: "http://cabinet.example.com:4100" }, () => {
    const out = getPublicDaemonWsOriginForRequest(fakeReq({ host: "evil.invalid:4000" }));
    assert.equal(out, "ws://cabinet.example.com:4100");
  });
});

test("explicit https:// override is upgraded to wss://", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: "https://cabinet.example.com" }, () => {
    const out = getPublicDaemonWsOriginForRequest(fakeReq({ host: "evil.invalid:4000" }));
    assert.equal(out, "wss://cabinet.example.com");
  });
});

// --- Host-header derivation (the LAN/remote-browser fix) -------------------

test("LAN browser: derives ws://<host>:<daemonPort> from Host header", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: undefined }, () => {
    const out = getPublicDaemonWsOriginForRequest(fakeReq({ host: "192.168.1.50:4000" }));
    assert.equal(out, "ws://192.168.1.50:4100");
  });
});

test("Bonjour .local hostname is preserved", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: undefined }, () => {
    const out = getPublicDaemonWsOriginForRequest(fakeReq({ host: "my-mac.local:4000" }));
    assert.equal(out, "ws://my-mac.local:4100");
  });
});

test("reverse proxy: x-forwarded-proto: https → wss://", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: undefined }, () => {
    const out = getPublicDaemonWsOriginForRequest(
      fakeReq({ host: "cabinet.example.com", "x-forwarded-proto": "https" })
    );
    assert.equal(out, "wss://cabinet.example.com:4100");
  });
});

test("x-forwarded-proto with comma-list takes the first proto", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: undefined }, () => {
    const out = getPublicDaemonWsOriginForRequest(
      fakeReq({ host: "cabinet.example.com", "x-forwarded-proto": "https, http" })
    );
    assert.equal(out, "wss://cabinet.example.com:4100");
  });
});

test("IPv6 host like [::1]:4000 parses correctly and gets daemon port", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: undefined }, () => {
    const out = getPublicDaemonWsOriginForRequest(fakeReq({ host: "[::1]:4000" }));
    assert.equal(out, "ws://[::1]:4100");
  });
});

test("loopback Host stays loopback (single-host case still works)", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: undefined }, () => {
    const out = getPublicDaemonWsOriginForRequest(fakeReq({ host: "127.0.0.1:4000" }));
    assert.equal(out, "ws://127.0.0.1:4100");
  });
});

// --- Fallback branches -----------------------------------------------------

test("scheme-less explicit override falls through to Host derivation", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: "cabinet.example.com" }, () => {
    const out = getPublicDaemonWsOriginForRequest(fakeReq({ host: "192.168.1.50:4000" }));
    assert.equal(out, "ws://192.168.1.50:4100");
  });
});

test("missing Host header falls back to loopback (legacy helper)", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: undefined }, () => {
    const out = getPublicDaemonWsOriginForRequest(fakeReq({}));
    assert.match(out, /^ws:\/\/127\.0\.0\.1:4100$/);
  });
});

test("null request falls back to loopback", () => {
  withEnv({ CABINET_PUBLIC_DAEMON_ORIGIN: undefined }, () => {
    const out = getPublicDaemonWsOriginForRequest(null);
    assert.match(out, /^ws:\/\/127\.0\.0\.1:4100$/);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.CABINET_LOGIN_PBKDF2_ITERS = "1";
delete process.env.KB_PASSWORD; // auth disabled -> gate passes

test("buildApiApp mounts the full manifest and serves real routes", async () => {
  const { apiRoutes } = await import("../server/http/route-manifest");
  assert.ok(
    apiRoutes.length >= 140,
    `expected >=140 mounted routes, got ${apiRoutes.length}`
  );

  const { buildApiApp } = await import("../server/http/api-app");
  const server = buildApiApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    const check = await fetch(`http://127.0.0.1:${port}/api/auth/check`);
    assert.equal(check.status, 200);
    assert.deepEqual(await check.json(), {
      authenticated: true,
      authEnabled: false,
    });

    const missing = await fetch(
      `http://127.0.0.1:${port}/api/definitely-not-a-route`
    );
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "Not found" });
  } finally {
    server.close();
  }
});

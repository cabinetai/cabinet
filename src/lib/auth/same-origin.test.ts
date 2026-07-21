import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { requireSameOrigin } from "./same-origin";

function request(origin: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://127.0.0.1:4000/api/hermes/runtime-interventions", {
    method: "POST",
    headers: { origin, host: "127.0.0.1:4000", ...headers },
  });
}

test("same-origin gate accepts the configured Cabinet origin", () => {
  assert.equal(requireSameOrigin(request("http://127.0.0.1:4000"), "http://127.0.0.1:4000"), null);
});

test("same-origin gate accepts a reverse-proxy Host without trusting forwarded headers", () => {
  const proxied = request("https://cabinet.tail.example", { host: "cabinet.tail.example", "x-forwarded-host": "attacker.example", "x-forwarded-proto": "http" });
  assert.equal(requireSameOrigin(proxied, "http://127.0.0.1:4000"), null);
});

test("same-origin gate rejects foreign, missing, malformed, and forwarded-header spoofed origins", async () => {
  for (const candidate of [
    request("https://foreign.example"),
    new NextRequest("http://127.0.0.1:4000/api/hermes/runtime-interventions", { method: "POST", headers: { host: "127.0.0.1:4000" } }),
    request("not-an-origin"),
    request("https://attacker.example", { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" }),
  ]) {
    const response = requireSameOrigin(candidate, "http://127.0.0.1:4000");
    assert.equal(response?.status, 403);
  }
});

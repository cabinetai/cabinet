import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hashKbToken, KB_AUTH_COOKIE } from "@/lib/auth/kb-auth";

// Independent reference implementation of the gate's expected cookie value.
// proxy.ts and the daemon must both reproduce exactly this, or scheduled
// triggers 401.
function expectedHash(password: string): string {
  return createHash("sha256")
    .update(password + "cabinet-salt")
    .digest("hex");
}

test("cookie name is kb-auth", () => {
  assert.equal(KB_AUTH_COOKIE, "kb-auth");
});

test("hashKbToken matches SHA-256(password + salt)", async () => {
  for (const pw of ["hunter2", "p@ss word!", "", "🔑-unicode"]) {
    assert.equal(await hashKbToken(pw), expectedHash(pw));
  }
});

test("different passwords produce different hashes", async () => {
  assert.notEqual(await hashKbToken("a"), await hashKbToken("b"));
});

test("hash is stable across calls", async () => {
  assert.equal(await hashKbToken("same"), await hashKbToken("same"));
});

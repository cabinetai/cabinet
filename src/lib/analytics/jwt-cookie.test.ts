import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { subFromJwtCookie } from "./jwt-cookie";

// base64url-encode a JWT payload the way Supabase does (no padding, -/_ alphabet).
const b64url = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (payload: unknown) => `h.${b64url(payload)}.sig`;

describe("subFromJwtCookie", () => {
  it("extracts sub from the cabinet_jwt cookie among others", () => {
    const cookie = `theme=paper; cabinet_jwt=${jwt({ sub: "user-123", email: "a@b.com" })}; foo=bar`;
    assert.equal(subFromJwtCookie(cookie), "user-123");
  });
  it("returns null when the cookie is absent", () => {
    assert.equal(subFromJwtCookie("theme=paper; foo=bar"), null);
  });
  it("returns null on a malformed token instead of throwing", () => {
    assert.equal(subFromJwtCookie("cabinet_jwt=not-a-jwt"), null);
    assert.equal(subFromJwtCookie("cabinet_jwt=h..sig"), null);
  });
});

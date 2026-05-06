import { NextRequest, NextResponse } from "next/server";
import { isLoopbackHost, resolveOptaleRequestIdentity } from "./identity";
import {
  optaleRoleHasPermission,
  type OptaleConsolePermission,
} from "./identity-shared";

async function hashToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${password}cabinet-salt`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function requestHostname(request: NextRequest): string {
  return (
    request.nextUrl.hostname ||
    (request.headers.get("host") || "").split(":")[0]
  );
}

export async function requireOptaleControlPlaneRequest(
  request: NextRequest,
  options: {
    permission?: OptaleConsolePermission;
  } = {},
): Promise<NextResponse | null> {
  const permission = options.permission || "control_plane.write";
  const identity = await resolveOptaleRequestIdentity(request);
  if (identity.authenticated) {
    if (optaleRoleHasPermission(identity.role, permission)) return null;
    return NextResponse.json(
      {
        error: "OptaleControlPlaneForbidden",
        message:
          "This Console role is not allowed to access the Optale control plane.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const password = process.env.KB_PASSWORD || "";
  const hostname = requestHostname(request);

  if (!password) {
    if (isLoopbackHost(hostname)) return null;
    return NextResponse.json(
      {
        error: "OptaleControlPlaneAuthRequired",
        message:
          "Optale control-plane APIs require authentication before exposing or mutating governance state on public hosts.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const token = request.cookies.get("kb-auth")?.value;
  const expected = await hashToken(password);
  if (token === expected) return null;

  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

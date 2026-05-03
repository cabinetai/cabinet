import { NextRequest, NextResponse } from "next/server";

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

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
): Promise<NextResponse | null> {
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

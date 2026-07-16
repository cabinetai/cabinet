import { NextResponse, type NextRequest } from "next/server";

import { getOrCreateDaemonToken } from "@/lib/agents/daemon-auth";
import { getDaemonUrl } from "@/lib/runtime/runtime-config";
import { isCloud } from "@/lib/cloud/tier";

const ALLOWED = new Map<string, ReadonlySet<string>>([
  ["status", new Set(["GET"])],
  ["install", new Set(["POST"])],
  ["start", new Set(["POST"])],
  ["stop", new Set(["POST"])],
  ["models", new Set(["GET"])],
  ["accounts", new Set(["GET"])],
  ["routing", new Set(["POST"])],
  ["oauth/start", new Set(["POST"])],
  ["oauth/status", new Set(["GET"])],
  ["oauth/cancel", new Set(["POST"])],
]);

async function proxy(
  req: NextRequest,
  params: Promise<{ action: string[] }>
): Promise<NextResponse> {
  if (isCloud()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const action = (await params).action.join("/");
  const method = req.method.toUpperCase();
  if (!ALLOWED.get(action)?.has(method)) {
    return NextResponse.json({ error: "unknown CLIProxyAPI action" }, { status: 404 });
  }
  if (method !== "GET") {
    const origin = req.headers.get("origin");
    const fetchSite = req.headers.get("sec-fetch-site");
    if (
      (origin && origin !== req.nextUrl.origin) ||
      fetchSite === "cross-site"
    ) {
      return NextResponse.json({ error: "Cross-origin request denied" }, { status: 403 });
    }
  }

  try {
    const token = await getOrCreateDaemonToken();
    const query = action === "oauth/status" ? req.nextUrl.search : "";
    const body = method === "POST" ? await req.text() : undefined;
    const response = await fetch(`${getDaemonUrl()}/cli-proxy/${action}${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body || undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(action === "install" ? 150_000 : 40_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CLIProxyAPI daemon unavailable" },
      { status: 503 }
    );
  }
}

type RouteContext = { params: Promise<{ action: string[] }> };

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxy(req, context.params);
}

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxy(req, context.params);
}

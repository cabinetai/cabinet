import { NextRequest, NextResponse } from "next/server";
import {
  isCommandBrainReadMethod,
  proxyCommandBrainRead,
} from "@/lib/optale/command-brain-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ path: string[] }> };

const HEADERS = { "Cache-Control": "no-store" };

function readOnlyResponse(method: string) {
  return NextResponse.json(
    {
      error: "CommandBrainReadOnly",
      message: `Command Brain bridge is read-only. ${method.toUpperCase()} is not allowed.`,
    },
    {
      status: 405,
      headers: {
        ...HEADERS,
        Allow: "GET, OPTIONS",
      },
    }
  );
}

function malformedPathResponse() {
  return NextResponse.json(
    {
      error: "CommandBrainRouteNotAllowed",
      message: "This Command Brain route is not in the read-only allowlist.",
    },
    { status: 403, headers: HEADERS }
  );
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  let path: string[];
  try {
    ({ path } = await params);
  } catch {
    return malformedPathResponse();
  }
  const result = await proxyCommandBrainRead({
    path,
    searchParams: request.nextUrl.searchParams,
    requestHeaders: request.headers,
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      ...HEADERS,
      "Content-Type": result.contentType,
    },
  });
}

export async function POST(request: NextRequest) {
  return readOnlyResponse(request.method);
}

export async function PUT(request: NextRequest) {
  return readOnlyResponse(request.method);
}

export async function PATCH(request: NextRequest) {
  return readOnlyResponse(request.method);
}

export async function DELETE(request: NextRequest) {
  return readOnlyResponse(request.method);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...HEADERS,
      Allow: "GET, OPTIONS",
    },
  });
}

export function HEAD(request: NextRequest) {
  if (!isCommandBrainReadMethod(request.method)) {
    return readOnlyResponse(request.method);
  }
  return new NextResponse(null, { status: 204, headers: HEADERS });
}

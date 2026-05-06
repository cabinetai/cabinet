import { NextRequest, NextResponse } from "next/server";
import {
  restrictedCapabilityDenial,
  restrictedModeDenialResponse,
} from "@/lib/optale/restricted-customer-mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ path: string[] }> };

const DEFAULT_HARNESS_URL = "http://127.0.0.1:8787";
const HEADERS = { "Cache-Control": "no-store" };
const API_KEY_HEADER = "x-harness-api-key";

function upstreamBaseUrl() {
  const configured = process.env.OPTALE_AGENT_HARNESS_URL?.trim();
  return configured || DEFAULT_HARNESS_URL;
}

function buildUpstreamUrl(path: string[], search: string) {
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  return new URL(`/observatory/${encodedPath}${search}`, upstreamBaseUrl());
}

function harnessAuthHeaders(): Record<string, string> {
  const apiKey = process.env.OPTALE_AGENT_HARNESS_API_KEY?.trim();
  if (!apiKey) return {};

  const header = process.env.OPTALE_AGENT_HARNESS_AUTH_HEADER?.trim().toLowerCase();
  if (header === API_KEY_HEADER) {
    return { "X-Harness-API-Key": apiKey };
  }

  return { Authorization: `Bearer ${apiKey}` };
}

function methodNotAllowed(method: string) {
  return NextResponse.json(
    {
      error: "OptaleObservatoryProxyReadOnly",
      message: `Optale Observatory proxy only supports GET. ${method.toUpperCase()} is not allowed.`,
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const restricted = restrictedModeDenialResponse(
    restrictedCapabilityDenial("diagnostics.raw"),
  );
  if (restricted) return restricted;

  let path: string[];
  try {
    ({ path } = await params);
  } catch {
    return NextResponse.json(
      {
        error: "OptaleObservatoryProxyInvalidPath",
        message: "Optale Observatory proxy path is invalid.",
      },
      { status: 400, headers: HEADERS }
    );
  }

  try {
    const upstream = buildUpstreamUrl(path, request.nextUrl.search);
    const response = await fetch(upstream, {
      method: "GET",
      headers: {
        Accept: request.headers.get("accept") || "application/json",
        ...harnessAuthHeaders(),
      },
      cache: "no-store",
    });

    const headers = new Headers(HEADERS);
    const contentType = response.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return NextResponse.json(
      {
        error: "OptaleObservatoryProxyUnavailable",
        message: "Optale Agent Harness Observatory is unavailable.",
      },
      { status: 502, headers: HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  return methodNotAllowed(request.method);
}

export async function PUT(request: NextRequest) {
  return methodNotAllowed(request.method);
}

export async function PATCH(request: NextRequest) {
  return methodNotAllowed(request.method);
}

export async function DELETE(request: NextRequest) {
  return methodNotAllowed(request.method);
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

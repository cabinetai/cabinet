import { NextRequest, NextResponse } from "next/server";
import {
  createOptaleMcpClient,
  listPublicOptaleMcpClients,
  redactOptaleMcpClientForClient,
  rotateOptaleMcpClientToken,
  updateOptaleMcpClient,
} from "@/lib/optale/mcp-client-registry";
import { requireOptaleControlPlaneRequest } from "@/lib/optale/control-plane-auth";

export const dynamic = "force-dynamic";

function noStore() {
  return { "Cache-Control": "no-store" };
}

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status, headers: noStore() });
}

async function readBody(
  request: NextRequest,
): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireOptaleControlPlaneRequest(request);
  if (unauthorized) return unauthorized;

  return NextResponse.json(
    {
      clients: await listPublicOptaleMcpClients(),
    },
    { headers: noStore() },
  );
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireOptaleControlPlaneRequest(request);
  if (unauthorized) return unauthorized;

  const body = await readBody(request);
  if (!body) return errorResponse("JSON body is required");

  try {
    if (trimString(body.action) === "rotate") {
      const result = await rotateOptaleMcpClientToken(body.id);
      return NextResponse.json(
        {
          client: redactOptaleMcpClientForClient(result.client),
          oneTimeToken: result.token,
        },
        { headers: noStore() },
      );
    }

    const result = await createOptaleMcpClient(body);
    return NextResponse.json(
      {
        client: redactOptaleMcpClientForClient(result.client),
        oneTimeToken: result.token,
      },
      { status: 201, headers: noStore() },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireOptaleControlPlaneRequest(request);
  if (unauthorized) return unauthorized;

  const body = await readBody(request);
  if (!body) return errorResponse("JSON body is required");

  try {
    const result = await updateOptaleMcpClient({ ...body, id: body.id });
    return NextResponse.json(
      { client: redactOptaleMcpClientForClient(result.client) },
      { headers: noStore() },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireOptaleControlPlaneRequest(request);
  if (unauthorized) return unauthorized;

  const body = await readBody(request);
  if (!body) return errorResponse("JSON body is required");

  try {
    const result = await updateOptaleMcpClient({
      id: body.id,
      enabled: false,
    });
    return NextResponse.json(
      { client: redactOptaleMcpClientForClient(result.client) },
      { headers: noStore() },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

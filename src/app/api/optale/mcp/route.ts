import { NextRequest, NextResponse } from "next/server";
import {
  handleOptaleMcpJsonRpc,
  listOptaleMcpTools,
} from "@/lib/optale/mcp-server";
import { buildOptaleMcpGatewayContextFromRequest } from "@/lib/optale/mcp-gateway";

export const dynamic = "force-dynamic";

function mcpHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "MCP-Protocol-Version": "2024-11-05",
  };
}

function unauthorizedResponse(message: string) {
  return NextResponse.json(
    { error: "Unauthorized", message },
    { status: 401, headers: mcpHeaders() }
  );
}

export async function GET(request: NextRequest) {
  const gatewayContext = await buildOptaleMcpGatewayContextFromRequest(request);
  if (!gatewayContext.authorized) {
    return unauthorizedResponse(gatewayContext.authorizationError || "Unauthorized MCP request.");
  }
  return NextResponse.json(
    {
      name: "optale-agents",
      protocolVersion: "2024-11-05",
      transport: "http-json-rpc",
      session: {
        requestId: gatewayContext.requestId,
        clientId: gatewayContext.clientId,
        clientName: gatewayContext.clientName,
        authType: gatewayContext.authType,
        defaultCabinetPath: gatewayContext.defaultCabinetPath,
        cabinetPathLocked: gatewayContext.cabinetPathLocked,
        agentScope: gatewayContext.agentScope,
        permissions: gatewayContext.permissions,
        allowedTools: gatewayContext.allowedTools,
        deniedTools: gatewayContext.deniedTools,
        budget: gatewayContext.budget,
        actionsEnabled: gatewayContext.canUseActions,
        auditEnabled: gatewayContext.auditEnabled,
      },
      tools: await listOptaleMcpTools({
        gatewayContext,
        includeDownstream: true,
      }),
    },
    { headers: mcpHeaders() }
  );
}

export async function POST(request: NextRequest) {
  const gatewayContext = await buildOptaleMcpGatewayContextFromRequest(request);
  if (!gatewayContext.authorized) {
    return unauthorizedResponse(gatewayContext.authorizationError || "Unauthorized MCP request.");
  }
  const body = await request.json().catch(() => null);
  if (body === null) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
      { status: 400, headers: mcpHeaders() }
    );
  }

  const result = await handleOptaleMcpJsonRpc(body, {
    gatewayContext,
    includeDownstream: true,
  });
  if (result === undefined) {
    return new NextResponse(null, { status: 204, headers: mcpHeaders() });
  }

  return NextResponse.json(result, { headers: mcpHeaders() });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...mcpHeaders(),
      Allow: "GET, POST, OPTIONS",
    },
  });
}

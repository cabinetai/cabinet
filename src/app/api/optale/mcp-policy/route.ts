import { NextRequest, NextResponse } from "next/server";
import {
  normalizeOptaleMcpPolicyWriteInputFromClient,
  readOptaleMcpPolicy,
  redactOptaleMcpPolicyForClient,
  redactOptaleMcpPolicyServersForClient,
  resolveMcpPolicyServersForScope,
  writeOptaleMcpPolicy,
} from "@/lib/optale/mcp-policy";
import { normalizeOptaleScope } from "@/lib/optale/scope-registry";
import { requireOptaleControlPlaneRequest } from "@/lib/optale/control-plane-auth";

export const dynamic = "force-dynamic";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getCabinetPath(request: NextRequest): string | undefined {
  return (
    trimString(request.nextUrl.searchParams.get("cabinetPath")) ||
    trimString(request.nextUrl.searchParams.get("path"))
  );
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireOptaleControlPlaneRequest(request);
  if (unauthorized) return unauthorized;

  const cabinetPath = getCabinetPath(request);
  const agentScope = normalizeOptaleScope(
    request.nextUrl.searchParams.get("agentScope"),
  );
  const policy = await readOptaleMcpPolicy(cabinetPath);

  return NextResponse.json(
    {
      policy: redactOptaleMcpPolicyForClient(policy),
      effectiveServers: redactOptaleMcpPolicyServersForClient(
        resolveMcpPolicyServersForScope(policy, agentScope),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: NextRequest) {
  const unauthorized = await requireOptaleControlPlaneRequest(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "JSON body is required" },
      { status: 400 },
    );
  }

  const cabinetPath = trimString(body.cabinetPath) || getCabinetPath(request);
  const policy = await writeOptaleMcpPolicy(
    cabinetPath,
    normalizeOptaleMcpPolicyWriteInputFromClient({
      enforcementMode: body.enforcementMode === "proxy" ? "proxy" : "prompt",
      commandCenterManaged:
        typeof body.commandCenterManaged === "boolean"
          ? body.commandCenterManaged
          : undefined,
      policyId: body.policyId,
      ownerId: body.ownerId,
      companyId: body.companyId,
      userId: body.userId,
      servers: Array.isArray(body.servers) ? body.servers : undefined,
    }),
  );

  return NextResponse.json(
    {
      policy: redactOptaleMcpPolicyForClient(policy),
      effectiveServers: redactOptaleMcpPolicyServersForClient(
        resolveMcpPolicyServersForScope(policy),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

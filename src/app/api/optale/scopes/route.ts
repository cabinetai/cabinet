import { NextRequest, NextResponse } from "next/server";
import { listPersonas } from "@/lib/agents/persona-manager";
import {
  normalizeOptaleScope,
  readCabinetOptaleScope,
  writeCabinetOptaleScope,
} from "@/lib/optale/scope-registry";
import { requireOptaleControlPlaneRequest } from "@/lib/optale/control-plane-auth";
import {
  restrictedCapabilityDenial,
  restrictedModeDenialResponse,
} from "@/lib/optale/restricted-customer-mode";

export const dynamic = "force-dynamic";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeLabels(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const labels = value
    .filter(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim() !== "",
    )
    .map((entry) => entry.trim());
  return labels.length > 0 ? Array.from(new Set(labels)) : undefined;
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
  const [cabinet, personas] = await Promise.all([
    readCabinetOptaleScope(cabinetPath),
    listPersonas(cabinetPath),
  ]);

  return NextResponse.json(
    {
      cabinet,
      agents: personas.map((persona) => ({
        slug: persona.slug,
        name: persona.name,
        cabinetPath: persona.cabinetPath,
        personaScope: persona.scope,
        optaleScope: persona.optaleScope,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: NextRequest) {
  const unauthorized = await requireOptaleControlPlaneRequest(request);
  if (unauthorized) return unauthorized;
  const restricted = restrictedModeDenialResponse(
    restrictedCapabilityDenial("memory.cross_tenant"),
  );
  if (restricted) return restricted;

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

  const scope = normalizeOptaleScope(body.scope);
  if (!scope) {
    return NextResponse.json(
      { error: "scope must be one of company, personal, or system" },
      { status: 400 },
    );
  }

  const cabinetPath = trimString(body.cabinetPath) || getCabinetPath(request);
  const cabinet = await writeCabinetOptaleScope(cabinetPath, {
    scope,
    ownerId: trimString(body.ownerId),
    companyId: trimString(body.companyId),
    userId: trimString(body.userId),
    policyId: trimString(body.policyId),
    memoryNamespace: trimString(body.memoryNamespace),
    companyBrainTargetId: trimString(body.companyBrainTargetId),
    labels: normalizeLabels(body.labels),
  });

  return NextResponse.json(
    { cabinet },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextRequest, NextResponse } from "next/server";
import { createOptaleCompanyBrainPromotion } from "@/lib/optale/brain-company-brain-adapter";
import {
  restrictedCapabilityDenial,
  restrictedModeDenialResponse,
} from "@/lib/optale/restricted-customer-mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: NextRequest) {
  const restricted = restrictedModeDenialResponse(
    restrictedCapabilityDenial("memory.cross_tenant"),
  );
  if (restricted) return restricted;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const response = await createOptaleCompanyBrainPromotion({
    cabinetPath:
      trimString(body?.cabinetPath) ||
      trimString(request.nextUrl.searchParams.get("cabinetPath")) ||
      trimString(request.nextUrl.searchParams.get("path")),
    targetId: trimString(body?.targetId),
    sourceType: trimString(body?.sourceType),
    title: trimString(body?.title),
    summary: trimString(body?.summary),
    content: trimString(body?.content),
    sensitivity: trimString(body?.sensitivity),
    entityTypes: body?.entityTypes,
    tags: body?.tags,
    notes: trimString(body?.notes),
    submit: body?.submit === true,
    sourceRef: body?.sourceRef,
    payload: body?.payload,
    requestHeaders: request.headers,
  });

  return NextResponse.json(response, {
    status: response.httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}

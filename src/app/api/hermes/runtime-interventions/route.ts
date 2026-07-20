import { NextRequest, NextResponse } from "next/server";
import { authenticatedCabinetActorIdentity, requireApiAuth } from "@/lib/auth/request-gate";
import { requireSameOrigin } from "@/lib/auth/same-origin";
import { getHermesControlCenterSnapshot } from "@/lib/hermes/control-center";
import { sanitizeHermesText } from "@/lib/hermes/control-center-sanitizer";
import {
  getHermesRuntimeInterventionService,
  establishHermesLiveInterventionAuthority,
  HermesRuntimeInterventionError,
  type HermesRuntimeInterventionService,
} from "@/lib/hermes/governed-runtime-intervention";
import type { HermesControlCenterSnapshot } from "@/lib/hermes/control-center-types";
import { readHermesServerConfig } from "@/lib/hermes/server-config";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";

export const dynamic = "force-dynamic";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

type RouteDependencies = {
  requireAuth?: typeof requireApiAuth;
  sameOrigin?: typeof requireSameOrigin;
  runtimeMode?: typeof getCabinetRuntimeMode;
  actorIdentity?: typeof authenticatedCabinetActorIdentity;
  snapshot?: () => Promise<HermesControlCenterSnapshot>;
  service?: Pick<HermesRuntimeInterventionService, "prepare" | "commit" | "recheck">;
};

export async function handleRuntimeInterventionPost(request: NextRequest, dependencies: RouteDependencies = {}) {
  const unauthorized = await (dependencies.requireAuth ?? requireApiAuth)(request);
  if (unauthorized) return unauthorized;
  const crossOrigin = (dependencies.sameOrigin ?? requireSameOrigin)(request);
  if (crossOrigin) return crossOrigin;
  if ((dependencies.runtimeMode ?? getCabinetRuntimeMode)() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const actorIdentity = await (dependencies.actorIdentity ?? authenticatedCabinetActorIdentity)(request);
    if (!actorIdentity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const service = dependencies.service ?? getHermesRuntimeInterventionService(readHermesServerConfig());
    if (body.stage === "prepare") {
      const targetRunId = text(body.targetRunId);
      const authority = establishHermesLiveInterventionAuthority(
        await (dependencies.snapshot ?? getHermesControlCenterSnapshot)(),
        targetRunId,
      );
      const preview = await service.prepare({
        targetRunId,
        reason: text(body.reason),
        authority,
        actorIdentity,
      });
      return NextResponse.json({ ok: true, preview }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.stage === "commit") {
      const result = await service.commit({
        previewId: text(body.previewId),
        targetRunId: text(body.targetRunId),
        confirmationPhrase: typeof body.confirmationPhrase === "string" ? body.confirmationPhrase : "",
        actorIdentity,
      });
      return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.stage === "recheck") {
      const result = await service.recheck({
        previewId: text(body.previewId),
        targetRunId: text(body.targetRunId),
        actorIdentity,
      });
      return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "A prepare, commit, or recheck stage is required." }, { status: 400 });
  } catch (error) {
    const status = error instanceof HermesRuntimeInterventionError
      ? error.code === "fixture_forbidden" ? 403 : error.code.includes("stale") || error.code.includes("mismatch") ? 409 : 400
      : 502;
    return NextResponse.json(
      { error: error instanceof Error ? sanitizeHermesText(error.message, 200) : "Hermes intervention failed." },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleRuntimeInterventionPost(request);
}

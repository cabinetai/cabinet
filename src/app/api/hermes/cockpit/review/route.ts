import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";
import { recordCockpitFriction, recordOwnerClassification, recordOwnerPotentialMiss } from "@/lib/hermes/cockpit-service";
import { COCKPIT_REVIEW_CLASSIFICATIONS, type CockpitReviewClassification, type CockpitSourceKind } from "@/lib/hermes/cockpit-types";

const SOURCES = new Set<CockpitSourceKind>(["gmail", "calendar", "hermes_job", "manual_risk", "hermes_run", "memory"]);

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "Jeremy";
    if (body.kind === "classification") {
      const cardId = typeof body.cardId === "string" ? body.cardId.trim() : "";
      const classification = body.classification as CockpitReviewClassification;
      if (!cardId || !COCKPIT_REVIEW_CLASSIFICATIONS.includes(classification)) return NextResponse.json({ error: "Card identity and valid classification are required." }, { status: 400 });
      return NextResponse.json({ ok: true, review: await recordOwnerClassification({ cardId, classification, note: typeof body.note === "string" ? body.note.trim().slice(0, 4_000) : "", actor }) });
    }
    if (body.kind === "potential_miss") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const sourceType = body.sourceType as CockpitSourceKind;
      const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
      const whyPotentiallyMissed = typeof body.whyPotentiallyMissed === "string" ? body.whyPotentiallyMissed.trim() : "";
      if (!title || !sourceId || !whyPotentiallyMissed || !SOURCES.has(sourceType)) return NextResponse.json({ error: "Title, source, identity, and review reason are required." }, { status: 400 });
      return NextResponse.json({ ok: true, item: await recordOwnerPotentialMiss({ title, sourceType, sourceId, whyPotentiallyMissed, reviewQuestion: typeof body.reviewQuestion === "string" ? body.reviewQuestion.trim().slice(0, 2_000) : "Should this have been promoted?", actor }) });
    }
    if (body.kind === "friction") {
      const value = typeof body.body === "string" ? body.body.trim() : "";
      if (!value) return NextResponse.json({ error: "Friction detail is required." }, { status: 400 });
      return NextResponse.json({ ok: true, friction: await recordCockpitFriction(value.slice(0, 4_000), actor) });
    }
    return NextResponse.json({ error: "Unsupported owner review record." }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Owner review could not be recorded." }, { status: 400 }); }
}

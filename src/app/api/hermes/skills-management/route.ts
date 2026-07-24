import { NextRequest, NextResponse } from "next/server";
import { authenticatedCabinetActorIdentity, requireApiAuth } from "@/lib/auth/request-gate";
import { requireSameOrigin } from "@/lib/auth/same-origin";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";
import { sanitizeHermesText } from "@/lib/hermes/control-center-sanitizer";
import { HermesSkillsCliAdapter } from "@/lib/hermes/skills-adapter";
import { HermesSkillsManagementError, HermesSkillsManagementService } from "@/lib/hermes/governed-skills-management";
import { FakeHermesSkillsAdapter } from "@/lib/hermes/skills-management-fixture";
import type { HermesSkillAction } from "@/lib/hermes/skills-management-types";
import { readHermesSkillsServerConfig } from "@/lib/hermes/server-config";

export const dynamic = "force-dynamic";

const serviceKey = Symbol.for("cabinet.hermes.skills-management-service");
const fixtureServiceKey = Symbol.for("cabinet.hermes.skills-management-fixture-service");
type ServiceGlobal = typeof globalThis & {
  [serviceKey]?: HermesSkillsManagementService;
  [fixtureServiceKey]?: HermesSkillsManagementService;
};

function liveService(): HermesSkillsManagementService {
  const target = globalThis as ServiceGlobal;
  return target[serviceKey] ??= new HermesSkillsManagementService(new HermesSkillsCliAdapter(readHermesSkillsServerConfig()));
}

function fixtureService(): HermesSkillsManagementService {
  const target = globalThis as ServiceGlobal;
  return target[fixtureServiceKey] ??= new HermesSkillsManagementService(new FakeHermesSkillsAdapter());
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isAction(value: unknown): value is HermesSkillAction {
  return value === "install" || value === "remove";
}

type SkillsRouteMode =
  | { mode: "production" | "fixture" }
  | { mode: "unavailable"; code: "invalid_mode" | "fixture_requires_isolation" };

export function resolveHermesSkillsRouteMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SkillsRouteMode {
  const configured = env.CABINET_ACCEPTANCE_SKILLS_MODE?.trim();
  if (!configured || configured === "production") return { mode: "production" };
  if (configured === "fixture") {
    return env.CABINET_ACCEPTANCE_ISOLATED === "1"
      ? { mode: "fixture" }
      : { mode: "unavailable", code: "fixture_requires_isolation" };
  }
  return { mode: "unavailable", code: "invalid_mode" };
}

function modeUnavailable(code: Extract<SkillsRouteMode, { mode: "unavailable" }>["code"]) {
  return NextResponse.json(
    {
      state: "unavailable",
      code,
      error: "Hermes Skills mode is unavailable because server configuration is invalid.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function browserModeSelectionForbidden() {
  return NextResponse.json(
    {
      state: "blocked",
      code: "browser_mode_selection_forbidden",
      error: "Hermes Skills mode is selected by the server.",
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

type RouteDependencies = {
  requireAuth?: typeof requireApiAuth;
  sameOrigin?: typeof requireSameOrigin;
  runtimeMode?: typeof getCabinetRuntimeMode;
  actorIdentity?: typeof authenticatedCabinetActorIdentity;
  service?: HermesSkillsManagementService;
  routeMode?: () => SkillsRouteMode;
  fixtureService?: HermesSkillsManagementService;
};

export async function handleHermesSkillsGet(request: NextRequest, dependencies: RouteDependencies = {}) {
  const unauthorized = await (dependencies.requireAuth ?? requireApiAuth)(request);
  if (unauthorized) return unauthorized;
  if ((dependencies.runtimeMode ?? getCabinetRuntimeMode)() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  if (request.nextUrl.searchParams.has("fixture")) return browserModeSelectionForbidden();
  const selection = (dependencies.routeMode ?? resolveHermesSkillsRouteMode)();
  if (selection.mode === "unavailable") return modeUnavailable(selection.code);
  const service = selection.mode === "fixture"
    ? dependencies.fixtureService ?? fixtureService()
    : dependencies.service ?? liveService();
  try {
    const snapshot = await service.snapshot(request.nextUrl.searchParams.get("q") ?? "");
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        state: "unavailable",
        code: "skills_read_unavailable",
        error: error instanceof Error
          ? sanitizeHermesText(error.message, 200)
          : "Hermes Skills read-only state is unavailable.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function handleHermesSkillsPost(request: NextRequest, dependencies: RouteDependencies = {}) {
  const unauthorized = await (dependencies.requireAuth ?? requireApiAuth)(request);
  if (unauthorized) return unauthorized;
  const crossOrigin = (dependencies.sameOrigin ?? requireSameOrigin)(request);
  if (crossOrigin) return crossOrigin;
  if ((dependencies.runtimeMode ?? getCabinetRuntimeMode)() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if ("fixture" in body) return browserModeSelectionForbidden();
    const selection = (dependencies.routeMode ?? resolveHermesSkillsRouteMode)();
    if (selection.mode === "unavailable") return modeUnavailable(selection.code);
    if (selection.mode === "fixture") {
      return NextResponse.json(
        {
          state: "blocked",
          code: "fixture_read_only",
          error: "The isolated Skills acceptance fixture is read-only.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const actorIdentity = await (dependencies.actorIdentity ?? authenticatedCabinetActorIdentity)(request);
    if (!actorIdentity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const service = dependencies.service ?? liveService();
    if (body.stage === "prepare") {
      if (!isAction(body.action)) return NextResponse.json({ error: "A supported Hermes skill action is required." }, { status: 400 });
      const preview = await service.prepare({
        action: body.action,
        targetIdentity: text(body.targetIdentity),
        reason: text(body.reason),
        actorIdentity,
        query: text(body.query),
      });
      return NextResponse.json({ ok: true, preview }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.stage === "commit") {
      const result = await service.commit({
        previewId: text(body.previewId),
        targetIdentity: text(body.targetIdentity),
        confirmationPhrase: typeof body.confirmationPhrase === "string" ? body.confirmationPhrase : "",
        actorIdentity,
      });
      return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.stage === "recheck") {
      const result = await service.recheck({
        previewId: text(body.previewId),
        targetIdentity: text(body.targetIdentity),
        actorIdentity,
      });
      return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "A prepare, commit, or recheck stage is required." }, { status: 400 });
  } catch (error) {
    const status = error instanceof HermesSkillsManagementError
      ? error.code === "fixture_forbidden" ? 403 : error.code.includes("stale") || error.code.includes("mismatch") ? 409 : 400
      : 502;
    return NextResponse.json(
      { error: error instanceof Error ? sanitizeHermesText(error.message, 200) : "Hermes Skills management failed." },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleHermesSkillsGet(request);
}

export async function POST(request: NextRequest) {
  return handleHermesSkillsPost(request);
}

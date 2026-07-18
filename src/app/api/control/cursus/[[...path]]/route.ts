import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { CursusControlPlaneError, getCursusControlPlane } from "@/lib/cursus/control-plane";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ path?: string[] }> };
type RequestBody = Record<string, unknown>;

function routeError(error: unknown): NextResponse {
  if (error instanceof CursusControlPlaneError) {
    return NextResponse.json({ error: error.code, message: error.message, ...error.details }, { status: error.status });
  }
  return NextResponse.json({ error: "control_plane_failure", message: "Cursus control-plane operation failed" }, { status: 500 });
}

function bodyValue(body: RequestBody, field: string): string | undefined {
  const value = body[field];
  return typeof value === "string" ? value : undefined;
}

function authorizationToken(request: NextRequest): string | undefined {
  return request.headers.get("x-cursus-workspace-authorization") ?? undefined;
}

function bootstrapCapability(request: NextRequest): string | undefined {
  return request.headers.get("x-cursus-workspace-bootstrap") ?? undefined;
}

function serviceAuthorized(request: NextRequest): boolean {
  const expected = process.env.CABINET_CURSUS_SERVICE_BEARER_SECRET;
  const header = request.headers.get("authorization");
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice("Bearer ".length));
  const secret = Buffer.from(expected);
  return supplied.length === secret.length && timingSafeEqual(supplied, secret);
}

async function requestBody(request: NextRequest): Promise<RequestBody> {
  const parsed: unknown = await request.json();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CursusControlPlaneError("invalid_request", 400, "Request body must be an object");
  }
  return Object.fromEntries(Object.entries(parsed));
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!serviceAuthorized(request)) return NextResponse.json({ error: "service_unauthorized" }, { status: 401 });
  try {
    const path = (await params).path?.join("/");
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? "";
    const controlPlane = getCursusControlPlane();
    if (path === "workspaces/snapshot") {
      return NextResponse.json(controlPlane.readSnapshot(workspaceId, authorizationToken(request) ?? ""));
    }
    if (path === "workspaces/run-status") {
      return NextResponse.json(controlPlane.readWorkspaceRunStatus(workspaceId, authorizationToken(request) ?? ""));
    }
    throw new CursusControlPlaneError("route_not_found", 404, "Cursus control-plane route was not found");
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!serviceAuthorized(request)) return NextResponse.json({ error: "service_unauthorized" }, { status: 401 });
  try {
    if ((await params).path?.join("/") !== "workspaces/snapshot") {
      throw new CursusControlPlaneError("route_not_found", 404, "Cursus control-plane route was not found");
    }
    const body = await requestBody(request);
    return NextResponse.json(getCursusControlPlane().writeSnapshot({
      workspaceId: bodyValue(body, "workspaceId") ?? "",
      expectedRevision: body.expectedRevision,
      snapshot: body.snapshot,
      authorizationToken: authorizationToken(request) ?? "",
    }));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!serviceAuthorized(request)) return NextResponse.json({ error: "service_unauthorized" }, { status: 401 });
  try {
    const path = (await params).path?.join("/");
    const body = await requestBody(request);
    const controlPlane = getCursusControlPlane();
    switch (path) {
      case "workspaces/bootstrap":
        return NextResponse.json(controlPlane.createWorkspace());
      case "passkeys/registration/options":
        return NextResponse.json(await controlPlane.beginRegistration({
          workspaceId: bodyValue(body, "workspaceId") ?? "",
          principalId: bodyValue(body, "principalId") ?? "",
          displayName: bodyValue(body, "displayName") ?? "",
          authorizationToken: authorizationToken(request),
          bootstrapCapability: bootstrapCapability(request),
        }));
      case "passkeys/registration/finish":
        return NextResponse.json(await controlPlane.finishRegistration({
          workspaceId: bodyValue(body, "workspaceId") ?? "",
          challengeId: bodyValue(body, "challengeId") ?? "",
          response: body.response,
          bootstrapCapability: bootstrapCapability(request),
        }));
      case "passkeys/authentication/options":
        return NextResponse.json(await controlPlane.beginAuthentication({ workspaceId: bodyValue(body, "workspaceId") ?? "" }));
      case "passkeys/authentication/finish":
        return NextResponse.json(await controlPlane.finishAuthentication({
          workspaceId: bodyValue(body, "workspaceId") ?? "",
          challengeId: bodyValue(body, "challengeId") ?? "",
          response: body.response,
        }));
      case "approval-receipts":
        return NextResponse.json(controlPlane.issueReceipt({
          workspaceId: bodyValue(body, "workspaceId") ?? "",
          authorizationToken: authorizationToken(request) ?? "",
          action: bodyValue(body, "action") ?? "",
          payload: body.payload,
          expiresInSeconds: typeof body.expiresInSeconds === "number" ? body.expiresInSeconds : undefined,
        }));
      case "approval-receipts/consume":
        return NextResponse.json(controlPlane.consumeReceipt({
          workspaceId: bodyValue(body, "workspaceId") ?? "",
          authorizationToken: authorizationToken(request) ?? "",
          receipt: bodyValue(body, "receipt") ?? "",
          expectedAction: bodyValue(body, "expectedAction") ?? "",
        }));
      case "verification-receipts":
        return NextResponse.json(controlPlane.issueVerificationReceipt({
          workspaceId: bodyValue(body, "workspaceId") ?? "",
          authorizationToken: authorizationToken(request) ?? "",
          report: body.report,
          expectedRevision: body.expectedRevision,
          snapshotHash: bodyValue(body, "snapshotHash"),
        }));
      default:
        throw new CursusControlPlaneError("route_not_found", 404, "Cursus control-plane route was not found");
    }
  } catch (error) {
    return routeError(error);
  }
}

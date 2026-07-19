import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";
import { HermesManagementClient } from "@/lib/hermes/management-client";
import { HermesConfigurationError, readHermesServerConfig } from "@/lib/hermes/server-config";

export const dynamic = "force-dynamic";

function client(): HermesManagementClient {
  return new HermesManagementClient(readHermesServerConfig());
}

const operationKey = Symbol.for("cabinet.hermes.management-operations");
type Operation = { action: string; payload: string; promise: Promise<unknown> };
type OperationGlobal = typeof globalThis & { [operationKey]?: Map<string, Operation> };
function operations() { const target = globalThis as OperationGlobal; return target[operationKey] ??= new Map(); }

export async function GET(request: NextRequest) {
  const unauthorized = await requireApiAuth(request);
  if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try { return NextResponse.json(await client().snapshot(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    const status = error instanceof HermesConfigurationError ? 503 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hermes management is unavailable." }, { status });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request);
  if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.confirmed !== true || typeof body.reason !== "string" || body.reason.trim().length < 3) {
      return NextResponse.json({ error: "Explicit confirmation and a reason are required for Hermes changes." }, { status: 428 });
    }
    if (typeof body.action !== "string") return NextResponse.json({ error: "A management action is required." }, { status: 400 });
    if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim()) return NextResponse.json({ error: "An idempotency key is required for Hermes changes." }, { status: 400 });
    const payload = body.payload && typeof body.payload === "object" ? body.payload as Record<string, unknown> : {};
    const key = body.idempotencyKey.trim();
    const serializedPayload = JSON.stringify(payload);
    let operation = operations().get(key);
    if (operation && (operation.action !== body.action || operation.payload !== serializedPayload)) {
      return NextResponse.json({ error: "The idempotency key is already bound to a different Hermes change." }, { status: 409 });
    }
    if (!operation) {
      operation = { action: body.action, payload: serializedPayload, promise: client().perform(body.action, payload) };
      operations().set(key, operation);
    }
    const result = await operation.promise;
    return NextResponse.json({ ok: true, action: body.action, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hermes management action failed." }, { status: 400 });
  }
}

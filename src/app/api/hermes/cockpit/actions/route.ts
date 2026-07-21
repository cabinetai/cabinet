import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/request-gate";
import { getCabinetRuntimeMode } from "@/lib/runtime/runtime-config";
import { performCockpitAction } from "@/lib/hermes/cockpit-service";
import type { CockpitAction } from "@/lib/hermes/cockpit-types";

const operationKey = Symbol.for("cabinet.hermes.cockpit-operations");
type OperationGlobal = typeof globalThis & { [operationKey]?: Map<string, { fingerprint: string; promise: Promise<unknown> }> };
function operations() { const target = globalThis as OperationGlobal; return target[operationKey] ??= new Map(); }

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiAuth(request); if (unauthorized) return unauthorized;
  if (getCabinetRuntimeMode() !== "hermes") return NextResponse.json({ error: "Hermes runtime mode is disabled." }, { status: 404 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const cardId = typeof body.cardId === "string" ? body.cardId.trim() : "";
    const action = typeof body.action === "string" ? body.action as CockpitAction : "" as CockpitAction;
    if (!idempotencyKey || !cardId || !action) return NextResponse.json({ error: "Action, card identity, and idempotency key are required." }, { status: 400 });
    const fingerprint = JSON.stringify(body);
    let operation = operations().get(idempotencyKey);
    if (operation && operation.fingerprint !== fingerprint) return NextResponse.json({ error: "The idempotency key is bound to another cockpit action." }, { status: 409 });
    if (!operation) {
      operation = { fingerprint, promise: performCockpitAction({
        action, cardId, idempotencyKey, confirmed: body.confirmed === true,
        actor: typeof body.actor === "string" ? body.actor : "Jeremy",
        runId: typeof body.runId === "string" ? body.runId : undefined,
        requestId: typeof body.requestId === "string" ? body.requestId : undefined,
        body: typeof body.body === "string" ? body.body : undefined,
        until: typeof body.until === "string" ? body.until : undefined,
        schedule: typeof body.schedule === "string" ? body.schedule : undefined,
      }) };
      operations().set(idempotencyKey, operation);
    }
    return NextResponse.json({ ok: true, result: await operation.promise });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Cockpit action failed." }, { status: 400 }); }
}

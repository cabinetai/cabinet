import { NextRequest, NextResponse } from "next/server";
import { createCabinet, listCabinets, setActiveCabinet } from "@/lib/cabinets/cabinets";
import { getActiveCabinetName } from "@/lib/runtime/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cabinets = await listCabinets();
    return NextResponse.json({ cabinets, activeCabinet: getActiveCabinetName() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: unknown };
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const name = await createCabinet(body.name);
    const cabinets = await listCabinets();
    return NextResponse.json({ name, cabinets });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      message.startsWith("invalid") || message.startsWith("reserved")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Switch the active cabinet (root cabinet). Persists the pointer to the shared
 * home config; the new content root only takes effect after the server is
 * restarted, so the client reloads/relaunches on success.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: unknown };
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const name = await setActiveCabinet(body.name);
    return NextResponse.json({ activeCabinet: name, requiresRestart: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.startsWith("unknown") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

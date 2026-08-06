import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspaceSyncStatus,
  setWorkspaceSyncActivePath,
  syncWorkspace,
} from "@/lib/git/git-service";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getWorkspaceSyncStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const activePath =
      typeof body.activePath === "string" ? body.activePath : null;
    const status = await syncWorkspace({
      activePath,
      automatic: body.automatic === true,
    });
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.clientId !== "string") {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }
  setWorkspaceSyncActivePath(
    body.clientId,
    typeof body.activePath === "string" ? body.activePath : null,
  );
  return NextResponse.json(getWorkspaceSyncStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.clientId === "string") {
    setWorkspaceSyncActivePath(body.clientId, null);
  }
  return NextResponse.json({ ok: true });
}

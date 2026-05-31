import { NextRequest, NextResponse } from "next/server";
import {
  getSelectedEnvironments,
  setSelectedEnvironments,
} from "@/lib/agents/integration-environments";

/**
 * `/api/agents/config/integration-environments` — read/write the user's
 * selected set of CLI environments integrations install into. Backs both the
 * install/onboarding step and the editable Settings selector.
 */

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { environments: await getSelectedEnvironments() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const ids = (body as { environments?: unknown })?.environments;
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) {
    return NextResponse.json(
      { error: "environments must be an array of provider ids" },
      { status: 400 },
    );
  }
  const saved = await setSelectedEnvironments(ids as string[]);
  return NextResponse.json({ environments: saved });
}

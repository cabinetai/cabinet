import { NextResponse } from "next/server";
import { buildAgentHarnessAdminSnapshot } from "@/lib/optale/agent-harness/admin-status";

export async function GET() {
  const snapshot = await buildAgentHarnessAdminSnapshot();
  return NextResponse.json(snapshot);
}

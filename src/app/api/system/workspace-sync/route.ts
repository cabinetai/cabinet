import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getManagedDataDir } from "@/lib/runtime/runtime-config";

export const dynamic = "force-dynamic";

const fallback = {
  state: "not-configured",
  lastAttemptAt: null,
  lastSuccessAt: null,
  branch: null,
  reason: null,
  error: null,
};

export async function GET() {
  const statusPath = path.join(
    getManagedDataDir(),
    ".cabinet-state",
    "workspace-sync.json",
  );
  try {
    return NextResponse.json(
      JSON.parse(fs.readFileSync(statusPath, "utf8")),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(fallback, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}

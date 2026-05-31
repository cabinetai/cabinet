import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getServerDataLocations } from "@/lib/data-locations/server-registry";

export const dynamic = "force-dynamic";

function openCommand(targetPath: string): { command: string; args: string[] } {
  switch (process.platform) {
    case "darwin":
      return { command: "open", args: [targetPath] };
    case "win32":
      return { command: "explorer.exe", args: [targetPath] };
    default:
      return { command: "xdg-open", args: [targetPath] };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const target = typeof body?.path === "string" ? body.path : "";
    if (!target) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }
    const resolved = path.resolve(target);
    const allowed = getServerDataLocations()
      .filter((row) => row.scope === "fs")
      .map((row) => path.resolve(row.pathOrKey));
    if (!allowed.includes(resolved)) {
      return NextResponse.json(
        { error: "Path is not in the data-locations registry" },
        { status: 403 }
      );
    }
    const { command, args } = openCommand(resolved);
    spawn(command, args, { stdio: "ignore", detached: true }).unref();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

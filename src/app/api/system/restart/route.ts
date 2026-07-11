import { NextRequest, NextResponse } from "next/server";
import { restartDaemon } from "@/lib/agents/daemon-client";
import { isCloud } from "@/lib/cloud/tier";
import { isElectronRuntime } from "@/lib/runtime/runtime-config";

// Restart-by-exit: this route never respawns anything itself — it asks the
// target process to exit and relies on the supervisor to bring it back
// (Electron main respawns its children; the cloud container's entrypoint
// exits when either process dies and docker's restart policy relaunches
// both). Source installs have no supervisor, so restarting there stays a
// terminal affair and this route refuses.

function supervised(): boolean {
  return isCloud() || isElectronRuntime();
}

function exitSoon(): void {
  // Give the response time to flush before the process goes away.
  setTimeout(() => process.exit(0), 300);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const target = body?.target === "app" || body?.target === "all" ? body.target : "daemon";

  if (target === "daemon") {
    if (await restartDaemon()) {
      return NextResponse.json({ ok: true, restarting: "daemon" });
    }
    // Daemon too wedged to accept HTTP. In the cloud the whole container
    // restarts when this process exits, which recovers the daemon too.
    if (isCloud()) {
      exitSoon();
      return NextResponse.json({ ok: true, restarting: "all" });
    }
    return NextResponse.json(
      { error: "The daemon is not responding to a restart request." },
      { status: 502 }
    );
  }

  if (!supervised()) {
    return NextResponse.json(
      { error: "No supervisor to restart the app server on this install." },
      { status: 400 }
    );
  }

  exitSoon();
  return NextResponse.json({ ok: true, restarting: isCloud() ? "all" : "app" });
}

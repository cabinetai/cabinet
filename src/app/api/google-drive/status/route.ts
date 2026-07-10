import { NextRequest, NextResponse } from "next/server";
import { detectProvider, detectAllDriveDesktop, type CloudProviderId } from "@/lib/google-drive/detect-desktop";
import { readKnowledgeSources } from "@/lib/knowledge-sources/store";

export async function GET(request: NextRequest) {
  try {
    const cabinet = request.nextUrl.searchParams.get("cabinet") ?? "";
    const provider = (request.nextUrl.searchParams.get("provider") ??
      "google-drive") as CloudProviderId;
    const detection = await detectProvider(provider);
    // Google Drive can have multiple signed-in accounts mounted at once;
    // other providers only ever expose the single `detection` result.
    const accounts = provider === "google-drive" ? await detectAllDriveDesktop() : [];
    const sources = await readKnowledgeSources(cabinet);
    const mounts = sources
      .filter((s) => s.provider === provider && s.surface === "browser")
      .map((s) => ({
        id: s.id,
        abs_path: s.absPath,
        folder_name: s.name,
        enabled: s.enabled ? 1 : 0,
        added_at: s.addedAt,
      }));

    return NextResponse.json({
      desktopDetected: detection.detected,
      mountPath: detection.mountPath,
      accounts,
      mounts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

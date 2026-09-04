import { NextResponse } from "next/server";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { isProcessStale } from "@/lib/runtime/runtime-config";
import { detectInstallKind, readInstallMetadata } from "@/lib/system/install-metadata";
import { readBundledReleaseManifest } from "@/lib/system/release-manifest";

export async function GET() {
  const [metadata, manifest] = await Promise.all([
    readInstallMetadata(),
    readBundledReleaseManifest(),
  ]);

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: manifest.version,
    installKind: detectInstallKind(metadata),
    dataDir: DATA_DIR,
    // True when the active cabinet was switched on disk after this process
    // booted (frozen DATA_DIR no longer matches home.json). Health itself
    // never touches resolveContentPath, so it keeps answering while stale —
    // letting the client poll here to detect when a fresh process is up.
    stale: isProcessStale(),
  });
}

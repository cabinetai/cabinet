import { NextResponse } from "next/server";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { detectInstallKind, readInstallMetadata } from "@/lib/system/install-metadata";
import { readBundledReleaseManifest } from "@/lib/system/release-manifest";
import { OPTALE_PRODUCT } from "@/lib/optale/product";

export async function GET() {
  const [metadata, manifest] = await Promise.all([
    readInstallMetadata(),
    readBundledReleaseManifest(),
  ]);

  return NextResponse.json({
    status: "ok",
    product: OPTALE_PRODUCT,
    timestamp: new Date().toISOString(),
    version: manifest.version,
    installKind: detectInstallKind(metadata),
    dataDir: DATA_DIR,
  });
}

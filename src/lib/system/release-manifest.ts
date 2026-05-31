import fs from "fs/promises";
import path from "path";
import { PROJECT_RELEASE_MANIFEST_PATH } from "@/lib/storage/path-utils";
import { getReleaseManifestUrl, PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import type { ReleaseManifest } from "@/types";

interface PackageManifest {
  version?: string;
  repository?: {
    url?: string;
  };
}

function buildReleaseUrls(repositoryUrl: string, gitTag: string): Pick<
  ReleaseManifest,
  "releaseNotesUrl" | "sourceTarballUrl"
> {
  return {
    releaseNotesUrl: `${repositoryUrl}/releases/tag/${gitTag}`,
    sourceTarballUrl: `${repositoryUrl}/archive/refs/tags/${gitTag}.tar.gz`,
  };
}

function buildFallbackManifest(pkg: PackageManifest): ReleaseManifest {
  const version = pkg.version || "0.0.0";
  const gitTag = `v${version}`;
  const repositoryUrl = pkg.repository?.url?.replace(/^git\+/, "").replace(/\.git$/, "") ||
    "https://github.com/hilash/cabinet";

  return {
    manifestVersion: 1,
    version,
    channel: "stable",
    releaseDate: new Date(0).toISOString(),
    gitTag,
    repositoryUrl,
    ...buildReleaseUrls(repositoryUrl, gitTag),
    npmPackage: "create-cabinet",
    createCabinetVersion: version,
    cabinetaiPackage: "cabinetai",
    cabinetaiVersion: version,
    electron: {
      macos: {
        zipAssetName: "Cabinet-darwin-arm64.zip",
        dmgAssetName: "Cabinet.dmg",
      },
    },
  };
}

async function readPackageManifest(): Promise<PackageManifest> {
  const raw = await fs.readFile(path.join(PROJECT_ROOT, "package.json"), "utf-8");
  return JSON.parse(raw) as PackageManifest;
}

function normalizeReleaseManifest(input: Partial<ReleaseManifest>, fallback: ReleaseManifest): ReleaseManifest {
  return {
    ...fallback,
    ...input,
    channel: "stable",
    electron: {
      ...fallback.electron,
      ...input.electron,
      macos: {
        ...fallback.electron?.macos,
        ...input.electron?.macos,
      },
    },
  };
}

function alignManifestWithFallback(
  manifest: ReleaseManifest,
  fallback: ReleaseManifest
): ReleaseManifest {
  const version = fallback.version;
  const repositoryUrl = manifest.repositoryUrl || fallback.repositoryUrl;
  const gitTag = `v${version}`;

  return {
    ...manifest,
    version,
    gitTag,
    repositoryUrl,
    ...buildReleaseUrls(repositoryUrl, gitTag),
    createCabinetVersion: version,
    cabinetaiVersion: manifest.cabinetaiPackage ? version : manifest.cabinetaiVersion,
  };
}

export async function readBundledReleaseManifest(): Promise<ReleaseManifest> {
  const pkg = await readPackageManifest();
  const fallback = buildFallbackManifest(pkg);

  try {
    const raw = await fs.readFile(PROJECT_RELEASE_MANIFEST_PATH, "utf-8");
    const manifest = normalizeReleaseManifest(JSON.parse(raw) as Partial<ReleaseManifest>, fallback);
    return alignManifestWithFallback(manifest, fallback);
  } catch {
    return fallback;
  }
}

export async function fetchLatestReleaseManifest(): Promise<{
  manifest: ReleaseManifest;
  manifestUrl: string;
  source: "remote" | "bundled";
}> {
  const bundled = await readBundledReleaseManifest();
  const manifestUrl = getReleaseManifestUrl();

  try {
    const response = await fetch(manifestUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Manifest request failed (${response.status})`);
    }

    const json = (await response.json()) as Partial<ReleaseManifest>;
    return {
      manifest: normalizeReleaseManifest(json, bundled),
      manifestUrl,
      source: "remote",
    };
  } catch {
    return {
      manifest: bundled,
      manifestUrl,
      source: "bundled",
    };
  }
}

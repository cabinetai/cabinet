export type AppBundleKey = "darwin-arm64" | "darwin-x64" | "linux-arm64" | "linux-x64";

export interface ReleaseAppBundle {
  assetName: string;
  url: string;
  sha256?: string;
}

export interface ReleaseManifest {
  version: string;
  gitTag: string;
  repositoryUrl: string;
  releaseNotesUrl: string;
  sourceTarballUrl: string;
  appBundles?: Partial<Record<AppBundleKey, ReleaseAppBundle>>;
}

const DEFAULT_RELEASE_MANIFEST_URL =
  "https://github.com/cabinetai/cabinet/releases/latest/download/cabinet-release.json";
const DEFAULT_REPOSITORY_URL = "https://github.com/cabinetai/cabinet";

function normalizeRepositoryUrl(url: string | undefined): string {
  return (url || DEFAULT_REPOSITORY_URL).replace(/^git\+/, "").replace(/\.git$/, "");
}

function cleanVersion(version: string): string {
  return version.replace(/^v/, "");
}

export function getReleaseManifestUrl(version?: string): string {
  const configured = process.env.CABINET_RELEASE_MANIFEST_URL?.trim();
  if (configured) {
    return configured;
  }

  const clean = cleanVersion(version || "");
  if (clean) {
    return `https://github.com/cabinetai/cabinet/releases/download/v${clean}/cabinet-release.json`;
  }

  return DEFAULT_RELEASE_MANIFEST_URL;
}

export function getAppBundleKey(platform = process.platform, arch = process.arch): AppBundleKey | null {
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  if (platform === "linux" && arch === "x64") return "linux-x64";
  return null;
}

export function buildAppBundleAssetName(version: string, key: AppBundleKey): string {
  const clean = cleanVersion(version);
  return `cabinet-app-${key}-v${clean}.tgz`;
}

export function buildAppBundleUrl(repositoryUrl: string, version: string, key: AppBundleKey): string {
  const repo = normalizeRepositoryUrl(repositoryUrl);
  const gitTag = `v${cleanVersion(version)}`;
  const assetName = buildAppBundleAssetName(version, key);
  return `${repo}/releases/download/${gitTag}/${assetName}`;
}

export function resolveAppBundle(manifest: ReleaseManifest, platform = process.platform, arch = process.arch): ReleaseAppBundle | null {
  const key = getAppBundleKey(platform, arch);
  if (!key) return null;

  const explicit = manifest.appBundles?.[key];
  if (explicit?.url) return explicit;

  return {
    assetName: buildAppBundleAssetName(manifest.version, key),
    url: buildAppBundleUrl(manifest.repositoryUrl, manifest.version, key),
  };
}

export async function fetchReleaseManifest(version?: string): Promise<ReleaseManifest | null> {
  try {
    const response = await fetch(getReleaseManifestUrl(version), {
      headers: { "user-agent": "cabinetai" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    return (await response.json()) as ReleaseManifest;
  } catch {
    return null;
  }
}

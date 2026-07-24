import fs from "fs/promises";
import path from "path";

function readArg(name, fallback = undefined) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) return fallback;
  return value;
}

const packageJson = JSON.parse(
  await fs.readFile(path.join(process.cwd(), "package.json"), "utf-8")
);

const version = readArg("version", packageJson.version);
const tag = readArg("tag", `v${version}`);
const outputPath = readArg("output", path.join(process.cwd(), "cabinet-release.json"));
const gitCommit = readArg("git-commit", process.env.GITHUB_SHA || undefined);
const releaseDate = readArg("release-date", new Date().toISOString());
// Prefer an explicit --repository-url, then the CI repo (GITHUB_REPOSITORY),
// then the canonical repo. Keeps generated URLs correct after the org move
// (hilash/cabinet → cabinetai/cabinet) without hardcoding.
const repositoryUrl = (
  readArg("repository-url") ||
  (process.env.GITHUB_REPOSITORY && `https://github.com/${process.env.GITHUB_REPOSITORY}`) ||
  "https://github.com/cabinetai/cabinet"
).replace(/\.git$/, "");

// Prebuilt app-bundle keys for the zero-install `npx cabinetai run` path.
// darwin/linux only — Windows still uses the source + npm-install fallback
// until a win32 bundle is validated (tracked in a follow-up PR).
const appBundleKeys = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"];

function appBundleAssetName(key, tag) {
  return `cabinet-app-${key}-${tag}.tgz`;
}

function appBundleUrl(tag, key) {
  const assetName = appBundleAssetName(key, tag);
  return `${repositoryUrl}/releases/download/${tag}/${assetName}`;
}

const productName = packageJson.productName || "Cabinet";
const releaseAssetName = productName.replace(/\s+/g, ".");

// GitHub replaces spaces in uploaded Electron Forge artifact names with dots.
// The macOS build host is arm64 (electron-release.yml runs on macos-latest).

const manifest = {
  manifestVersion: 1,
  version,
  channel: "stable",
  releaseDate,
  gitTag: tag,
  gitCommit,
  repositoryUrl,
  releaseNotesUrl: `${repositoryUrl}/releases/tag/${tag}`,
  sourceTarballUrl: `${repositoryUrl}/archive/refs/tags/${tag}.tar.gz`,
  appBundles: Object.fromEntries(
    appBundleKeys.map((key) => [key, { assetName: appBundleAssetName(key, tag), url: appBundleUrl(tag, key) }])
  ),
  npmPackage: "create-cabinet",
  createCabinetVersion: version,
  cabinetaiPackage: "cabinetai",
  cabinetaiVersion: version,
  electron: {
    macos: {
      arch: "arm64",
      zipAssetName: `${releaseAssetName}-darwin-arm64-${version}.zip`,
      dmgAssetName: `${releaseAssetName}-${version}-arm64.dmg`,
    },
    windows: {
      zipAssetName: `${releaseAssetName}-win32-x64-${version}.zip`,
      // GitHub replaces the space in the Squirrel output ("Cabinet-X Setup.exe")
      // with a dot when it stores the release asset, so match the as-uploaded name.
      setupExeAssetName: `${releaseAssetName}-${version}.Setup.exe`,
      nupkgAssetName: `good_place_cabinet-${version}-full.nupkg`,
      releasesAssetName: "RELEASES",
    },
  },
};

await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
console.log(`Wrote release manifest to ${outputPath}`);

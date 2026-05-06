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
const productName = process.env.OPTALE_DESKTOP_APP_NAME || "Optale Console";
const repositoryUrl =
  process.env.OPTALE_RELEASE_REPOSITORY_URL || "https://github.com/hilash/cabinet";

// Electron Forge default naming for the configured product name:
//   MakerZIP (darwin):  ${productName}-darwin-${arch}-${version}.zip
//   MakerDMG:           ${productName}-${version}-${arch}.dmg
// arch is the build host arch — currently arm64 (electron-release.yml runs on macos-latest).
// Confirm by running `npm run electron:make` locally if maker versions change.
const arch = "arm64";

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
  npmPackage: "create-cabinet",
  createCabinetVersion: version,
  cabinetaiPackage: "cabinetai",
  cabinetaiVersion: version,
  electron: {
    macos: {
      arch,
      zipAssetName: `${productName}-darwin-${arch}-${version}.zip`,
      dmgAssetName: `${productName}-${version}-${arch}.dmg`,
    },
  },
};

await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
console.log(`Wrote release manifest to ${outputPath}`);

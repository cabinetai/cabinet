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
const repositoryUrl = "https://github.com/cabinetai/cabinet";

// Electron Forge default naming for Cabinet (productName "Cabinet"):
//   MakerZIP (darwin):     Cabinet-darwin-${arch}-${version}.zip
//   MakerDMG:              Cabinet-${version}-${arch}.dmg
//   MakerZIP (win32):      Cabinet-win32-x64-${version}.zip
//   MakerSquirrel (win32): "Cabinet-${version} Setup.exe", cabinet-${version}-full.nupkg, RELEASES
// arch is the macOS build host arch — currently arm64 (electron-release.yml runs on macos-latest).
// Confirm by running `npm run electron:make` / `:make:win` locally if maker versions change.
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
      zipAssetName: `Cabinet-darwin-${arch}-${version}.zip`,
      dmgAssetName: `Cabinet-${version}-${arch}.dmg`,
    },
    windows: {
      zipAssetName: `Cabinet-win32-x64-${version}.zip`,
      // GitHub replaces the space in the Squirrel output ("Cabinet-X Setup.exe")
      // with a dot when it stores the release asset, so match the as-uploaded name.
      setupExeAssetName: `Cabinet-${version}.Setup.exe`,
      nupkgAssetName: `cabinet-${version}-full.nupkg`,
      releasesAssetName: "RELEASES",
    },
  },
};

await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
console.log(`Wrote release manifest to ${outputPath}`);


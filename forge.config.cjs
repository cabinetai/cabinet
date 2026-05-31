/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const { MakerZIP } = require("@electron-forge/maker-zip");
const { MakerDMG } = require("@electron-forge/maker-dmg");
const { AutoUnpackNativesPlugin } = require("@electron-forge/plugin-auto-unpack-natives");
const { PublisherGithub } = require("@electron-forge/publisher-github");

const PACKAGER_IGNORE = [
  /^\/\.git(?:\/|$)/,
  /^\/\.github(?:\/|$)/,
  /^\/\.claude(?:\/|$)/,
  /^\/\.agents(?:\/|$)/,
  /^\/coverage(?:\/|$)/,
  /^\/out(?:\/|$)/,
  /^\/test(?:\/|$)/,
  /^\/scripts(?:\/|$)/,
  /^\/assets(?:\/|$)/,
  /^\/cli(?:\/|$)/,
  /^\/public(?:\/|$)/,
  /^\/electron\/(?!main\.cjs$|preload\.cjs$).*/,
  /^\/server(?:\/|$)/,
  /^\/src(?:\/|$)/,
  /^\/data(?:\/|$)/,
  /^\/\.next\/(?!standalone(?:\/|$)).*/,
  /^\/node_modules\/(?!update-electron-app(?:\/|$)|github-url-to-object(?:\/|$)|is-url(?:\/|$)|ms(?:\/|$)|electron-squirrel-startup(?:\/|$)|debug(?:\/|$)).*/,
  /^\/(?:AI-claude-editor\.md|CLAUDE\.md|PRD\.md|PROGRESS\.md|README\.md|LICENSE\.md|package-lock\.json|eslint\.config\.mjs|forge\.config\.cjs|next\.config\.ts|next-env\.d\.ts|postcss\.config\.mjs|skills-lock\.json|tsconfig\.json|tsconfig\.tsbuildinfo|\.env\.example|\.env\.local|\.dockerignore|\.gitignore|components\.json)$/i,
];

const MACOS_LOCALES_TO_KEEP = new Set(["en.lproj", "en_GB.lproj", "he.lproj"]);

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectAppBundles(rootPath, depth = 0, appBundles = []) {
  if (path.extname(rootPath) === ".app") {
    appBundles.push(rootPath);
    return appBundles;
  }

  if (depth >= 3 || !(await pathExists(rootPath))) {
    return appBundles;
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    await collectAppBundles(path.join(rootPath, entry.name), depth + 1, appBundles);
  }

  return appBundles;
}

async function pruneLocaleDirectory(resourceDir) {
  if (!(await pathExists(resourceDir))) {
    return;
  }

  const entries = await fs.readdir(resourceDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name.endsWith(".lproj") &&
          !MACOS_LOCALES_TO_KEEP.has(entry.name)
      )
      .map((entry) => fs.rm(path.join(resourceDir, entry.name), { recursive: true, force: true }))
  );
}

function codesignNativeBinaries(buildPath, electronVersion, platform, arch, done) {
  if (platform !== "darwin" || process.env.APPLE_ID) {
    done();
    return;
  }

  // Ad-hoc codesign the bundled Node binary so macOS allows execution.
  // node-pty is extracted outside the .app bundle at runtime (see main.cjs).
  const bundledNode = path.join(
    buildPath,
    "Cabinet.app",
    "Contents",
    "Resources",
    "app.asar.unpacked",
    ".next",
    "standalone",
    "bin",
    "node"
  );

  try {
    execFileSync("codesign", ["--force", "--sign", "-", bundledNode]);
  } catch {}

  const appPath = path.join(buildPath, "Cabinet.app");
  try {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath]);
  } catch {}

  done();
}

function pruneMacLocales(buildPath, electronVersion, platform, arch, done) {
  void (async () => {
    if (platform !== "darwin" || process.env.APPLE_ID) {
      done();
      return;
    }

    const appBundles = await collectAppBundles(buildPath);
    await Promise.all(
      appBundles.flatMap((appPath) => [
        pruneLocaleDirectory(path.join(appPath, "Contents", "Resources")),
        pruneLocaleDirectory(
          path.join(
            appPath,
            "Contents",
            "Frameworks",
            "Electron Framework.framework",
            "Versions",
            "A",
            "Resources"
          )
        ),
      ])
    );

    done();
  })().catch(done);
}

module.exports = {
  packagerConfig: {
    name: "Cabinet",
    icon: "./electron/assets/cabinet-icon",
    appBundleId: "com.runcabinet.cabinet",
    appCopyright: "© 2026 Hila Shmuel",
    appCategoryType: "public.app-category.productivity",
    asar: {
      unpackDir: ".next/standalone",
    },
    prune: true,
    ignore: PACKAGER_IGNORE,
    afterComplete: [codesignNativeBinaries, pruneMacLocales],
    osxSign: process.env.APPLE_ID
      ? {
          identity: process.env.APPLE_SIGN_IDENTITY,
          optionsForFile: () => ({
            entitlements: path.join(__dirname, "electron", "entitlements.mac.plist"),
          }),
        }
      : undefined,
    osxNotarize: process.env.APPLE_ID
      ? {
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_APP_PASSWORD,
          teamId: process.env.APPLE_TEAM_ID,
        }
      : undefined,
  },
  makers: [
    new MakerZIP({}, ["darwin"]),
    new MakerDMG({
      format: "ULFO",
      icon: "./electron/assets/cabinet-icon.icns",
    }),
  ],
  plugins: [new AutoUnpackNativesPlugin({})],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: "hilash",
        name: "cabinet",
      },
      prerelease: false,
      draft: false,
    }),
  ],
};

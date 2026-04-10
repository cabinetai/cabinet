import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compareVersions, isStableVersion } from "@/lib/system/version-utils";
import { readBundledReleaseManifest } from "@/lib/system/release-manifest";
import { detectInstallKind, inferElectronInstallKind } from "@/lib/system/install-metadata";
import type { InstallMetadata } from "@/types";

const pkgVersion = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8")
).version as string;

test("compareVersions sorts stable semver values correctly", () => {
  assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
  assert.equal(compareVersions("0.2.0", "0.2.0"), 0);
  assert.equal(compareVersions("0.1.9", "0.2.0"), -1);
});

test("isStableVersion only accepts plain stable semver", () => {
  assert.equal(isStableVersion("0.2.0"), true);
  assert.equal(isStableVersion("v0.2.0"), true);
  assert.equal(isStableVersion("0.2.0-beta.1"), false);
});

test("bundled release manifest stays aligned with the local package version", async () => {
  const manifest = await readBundledReleaseManifest();

  assert.equal(manifest.version, pkgVersion);
  assert.equal(manifest.gitTag, `v${pkgVersion}`);
  assert.equal(manifest.channel, "stable");
  assert.match(manifest.sourceTarballUrl, new RegExp(`v${pkgVersion.replace(/\./g, "\\.")}\\.tar\\.gz$`));
});

test("detectInstallKind respects explicit environment hints first", () => {
  const original = process.env.CABINET_INSTALL_KIND;
  process.env.CABINET_INSTALL_KIND = "source-custom";

  try {
    const metadata: InstallMetadata = {
      installKind: "source-managed",
      managed: true,
      installedAt: new Date().toISOString(),
      currentVersion: "0.2.0",
      projectRoot: "/tmp/cabinet",
      dataDir: "/tmp/cabinet/data",
    };

    assert.equal(detectInstallKind(metadata), "source-custom");
  } finally {
    if (original === undefined) {
      delete process.env.CABINET_INSTALL_KIND;
    } else {
      process.env.CABINET_INSTALL_KIND = original;
    }
  }
});

test("inferElectronInstallKind maps Windows and macOS runtimes distinctly", () => {
  assert.equal(inferElectronInstallKind("win32"), "electron-windows");
  assert.equal(inferElectronInstallKind("darwin"), "electron-macos");
});

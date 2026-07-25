import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function collectUrls(value: unknown): string[] {
  if (typeof value === "string" && value.startsWith("https://")) return [value];
  if (Array.isArray(value)) return value.flatMap(collectUrls);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectUrls);
  }
  return [];
}

test("local manifest generation uses the package repository", () => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "cabinet-manifest-"),
  );
  const outputPath = path.join(temporaryDirectory, "cabinet-release.json");
  const environment = { ...process.env };
  delete environment.GITHUB_REPOSITORY;

  try {
    execFileSync(
      process.execPath,
      [
        "scripts/generate-release-manifest.mjs",
        "--output",
        outputPath,
        "--release-date",
        "2026-01-01T00:00:00.000Z",
      ],
      {
        cwd: path.join(__dirname, ".."),
        env: environment,
      },
    );
    const manifest = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const urls = collectUrls(manifest);

    assert.ok(urls.length > 0);
    assert.ok(
      urls.every((url) => url.startsWith("https://github.com/souljorje/cabinet")),
    );
    assert.equal(manifest.npmPackage, undefined);
    assert.equal(manifest.createCabinetVersion, undefined);
    assert.equal(manifest.cabinetaiPackage, undefined);
    assert.equal(manifest.cabinetaiVersion, undefined);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

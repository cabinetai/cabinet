#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("cabinet-release.json", "utf8"));
const distribution = JSON.parse(fs.readFileSync("distribution.json", "utf8"));
const expectedRepositoryUrl = `https://github.com/${distribution.repository}`;

function collectUrls(value) {
  if (typeof value === "string" && value.startsWith("https://")) return [value];
  if (Array.isArray(value)) return value.flatMap(collectUrls);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectUrls);
  }
  return [];
}

assert.equal(packageJson.productName, distribution.productName);
assert.equal(
  packageJson.repository.url,
  `git+${expectedRepositoryUrl}.git`,
);
assert.equal(packageLock.version, packageJson.version);
assert.equal(packageLock.packages[""].version, packageJson.version);
assert.equal(manifest.version, packageJson.version);
assert.equal(manifest.gitTag, `v${packageJson.version}`);
assert.equal(manifest.repositoryUrl, expectedRepositoryUrl);
assert.ok(
  collectUrls(manifest).every((url) => url.startsWith(expectedRepositoryUrl)),
);
assert.equal(manifest.npmPackage, undefined);
assert.equal(manifest.createCabinetVersion, undefined);
assert.equal(manifest.cabinetaiPackage, undefined);
assert.equal(manifest.cabinetaiVersion, undefined);

console.log("Fork invariants passed.");

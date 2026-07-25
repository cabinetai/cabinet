#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import semver from "semver";

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    ...options,
  });
}

const version = process.argv[2]?.replace(/^v/, "");
if (!version || !semver.valid(version) || !/-gp\.\d+$/.test(version)) {
  throw new Error(
    "Usage: npm run gp:release:prepare -- <x.y.z-gp.n>",
  );
}

const dirty = execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
}).trim();
if (dirty) {
  throw new Error("Release preparation requires a clean working tree.");
}

const branch = execFileSync("git", ["branch", "--show-current"], {
  encoding: "utf8",
}).trim();
if (branch !== `release/${version}`) {
  throw new Error(`Switch to release/${version} before preparing this release.`);
}

run("npm", ["version", version, "--no-git-tag-version"]);
run("node", [
  "scripts/generate-release-manifest.mjs",
  "--version",
  version,
  "--tag",
  `v${version}`,
]);
run("node", ["scripts/check-fork-invariants.mjs"]);
run("npm", ["test"]);
run("npm", ["run", "lint"]);
run("npm", ["run", "build"]);

console.log("");
console.log("Release preparation passed. Review the diff, then run:");
console.log(`  git add package.json package-lock.json cabinet-release.json`);
console.log(`  git commit -m "release: prepare ${version}"`);
console.log("After the release PR is merged and main is checked out:");
console.log(`  git tag v${version}`);
console.log(`  git push origin v${version}`);

#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * create-cabinet — thin wrapper that delegates to cabinetai.
 *
 * Usage:
 *   npx create-cabinet [dir]           → cabinetai create <dir> + cabinetai run
 *   npx create-cabinet help            → cabinetai --help
 *   npx create-cabinet upgrade [opts]  → cabinetai update (legacy compat)
 */

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const args = process.argv.slice(2);
const COMMANDS = ["init", "upgrade", "help", "--help"];
const firstArg = args[0] || "init";
const command = COMMANDS.includes(firstArg) ? firstArg : "init";
const dirArg = COMMANDS.includes(firstArg) ? args[1] : firstArg;

function resolveCabinetAI() {
  // 1. Sibling install in our own node_modules (when create-cabinet was npm-installed)
  const ownBin = path.join(__dirname, "node_modules", ".bin", "cabinetai");
  if (fs.existsSync(ownBin)) return ownBin;

  // 2. Hoisted install one level up
  const hoistedBin = path.join(__dirname, "..", "node_modules", ".bin", "cabinetai");
  if (fs.existsSync(hoistedBin)) return hoistedBin;

  return null;
}

function pinnedCabinetAIVersion() {
  // Pin the npx fallback to the exact cabinetai version this create-cabinet was published against.
  // Reading from our own dependencies guarantees create-cabinet@N.M.K → cabinetai@N.M.K, never @latest.
  try {
    const pkg = require("./package.json");
    return (pkg.dependencies && pkg.dependencies.cabinetai) || pkg.version;
  } catch {
    return null;
  }
}

function runCabinetAI(cmdArgs) {
  const localBin = resolveCabinetAI();

  if (localBin) {
    const result = spawnSync(process.execPath, [localBin, ...cmdArgs], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    return result.status || 0;
  }

  // Fall back to npx with an exact-version pin (never @latest, to keep create-cabinet@X
  // and cabinetai@X moving together).
  const version = pinnedCabinetAIVersion();
  const spec = version ? `cabinetai@${version}` : "cabinetai";
  const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npxBin, ["-y", spec, ...cmdArgs], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
  return result.status || 0;
}

if (command === "help" || command === "--help") {
  console.log(`
  create-cabinet — Create a new Cabinet project

  This tool delegates to the cabinetai CLI.

  Usage:
    npx create-cabinet [directory]    Create a new cabinet and start it
    npx create-cabinet help           Show this help

  For more commands, use cabinetai directly:
    npx cabinetai --help
  `);
  process.exit(0);
}

if (command === "upgrade") {
  // Legacy upgrade compat — delegate to cabinetai update
  const status = runCabinetAI(["update"]);
  process.exit(status);
}

// Default: init — create cabinet + run
const targetDir = dirArg || "cabinet";

console.log(`
  ┌─────────────────────────────┐
  │                             │
  │   📦  Cabinet               │
  │   AI-first startup OS       │
  │                             │
  └─────────────────────────────┘
`);

// Step 1: Create the cabinet
const createStatus = runCabinetAI(["create", targetDir]);
if (createStatus !== 0) {
  process.exit(createStatus);
}

// Step 2: Run Cabinet from the new directory
const targetPath = path.resolve(process.cwd(), targetDir);
process.chdir(targetPath);
const runStatus = runCabinetAI(["run"]);
process.exit(runStatus);

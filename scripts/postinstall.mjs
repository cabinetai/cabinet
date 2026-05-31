#!/usr/bin/env node
import { execSync } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import process from "process";

const require = createRequire(import.meta.url);

// macOS arm64 node-pty needs two fixes: the prebuilt spawn-helper must be
// executable, and Gatekeeper's quarantine xattr has to be stripped from the
// native binaries or the PTY won't open. We only warn on platforms where
// these fixes are *expected* to apply — otherwise the user sees scary
// messages on Linux/Windows where the prebuild simply isn't there.
const isMacArm64 = process.platform === "darwin" && process.arch === "arm64";

const ptyPrebuildDir = path.join(
  "node_modules",
  "node-pty",
  "prebuilds",
  "darwin-arm64",
);
const spawnHelper = path.join(ptyPrebuildDir, "spawn-helper");
const ptyNode = path.join(ptyPrebuildDir, "pty.node");

const macFixes = [
  { label: "chmod spawn-helper", cmd: `chmod +x ${spawnHelper}`, target: spawnHelper },
  { label: "strip quarantine xattr (spawn-helper)", cmd: `xattr -d com.apple.provenance ${spawnHelper}`, target: spawnHelper },
  { label: "strip quarantine xattr (pty.node)", cmd: `xattr -d com.apple.provenance ${ptyNode}`, target: ptyNode },
];

for (const { label, cmd, target } of macFixes) {
  // Skip silently when the file isn't there — that's the normal case on
  // Linux/Windows or before node-pty has been installed yet.
  if (!fs.existsSync(target)) continue;
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch (err) {
    if (isMacArm64) {
      const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
      // `xattr -d` exits non-zero if the attribute is already absent — that's
      // success from our perspective, so don't warn for that specific case.
      const benign = label.startsWith("strip quarantine") && /No such xattr/.test(detail);
      if (!benign) {
        console.warn(
          `[cabinet] postinstall: ${label} failed — ${detail}. ` +
            "Terminal/PTY features may be unavailable; reinstall node-pty if it doesn't open.",
        );
      }
    }
    // Non-mac platforms: ignore silently.
  }
}

// better-sqlite3 prebuilds ship for a specific NODE_MODULE_VERSION; if the
// user's runtime doesn't match, rebuild from source so the daemon boots
// cleanly regardless of which Node version is active.
try {
  require("better-sqlite3");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  const mismatch =
    msg.includes("NODE_MODULE_VERSION") ||
    msg.includes("ERR_DLOPEN_FAILED") ||
    msg.includes("was compiled against a different Node.js version");
  if (mismatch) {
    const runtime = `Node ${process.version} (NODE_MODULE_VERSION ${process.versions.modules})`;
    console.warn(
      `[cabinet] better-sqlite3 prebuild does not match this runtime — ${runtime}. Rebuilding from source…`,
    );
    try {
      execSync("npm rebuild better-sqlite3 --build-from-source", {
        stdio: "inherit",
      });
      console.warn("[cabinet] better-sqlite3 rebuilt successfully.");
    } catch {
      console.warn(
        "[cabinet] Auto-rebuild failed. Run `npm rebuild better-sqlite3` manually before starting the daemon.",
      );
    }
  } else {
    console.warn(`[cabinet] better-sqlite3 smoke test warning: ${msg}`);
  }
}

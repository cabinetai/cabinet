import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

if (process.platform !== "darwin") {
  process.exit(0);
}

const darwinArm64Dir = path.join(
  process.cwd(),
  "node_modules",
  "node-pty",
  "prebuilds",
  "darwin-arm64"
);

for (const fileName of ["spawn-helper", "pty.node"]) {
  const target = path.join(darwinArm64Dir, fileName);
  if (!fs.existsSync(target)) {
    continue;
  }

  if (fileName === "spawn-helper") {
    try {
      fs.chmodSync(target, 0o755);
    } catch {}
  }

  try {
    execFileSync("xattr", ["-d", "com.apple.provenance", target], {
      stdio: "ignore",
    });
  } catch {}
}

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

if (process.platform !== "darwin") {
  process.exit(0);
}

const prebuildsBase = path.join(process.cwd(), "node_modules", "node-pty", "prebuilds");
const darwinDirs = ["darwin-arm64", "darwin-x64"]
  .map((arch) => path.join(prebuildsBase, arch))
  .filter((dir) => fs.existsSync(dir));

for (const darwinDir of darwinDirs) {
  for (const fileName of ["spawn-helper", "pty.node"]) {
    const target = path.join(darwinDir, fileName);
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
}

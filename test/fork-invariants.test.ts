import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

test("Good Place distribution and release metadata stay aligned", () => {
  execFileSync(process.execPath, ["scripts/check-fork-invariants.mjs"], {
    cwd: path.join(__dirname, ".."),
    stdio: "pipe",
  });
});

import { execSync } from "child_process";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const localRequire = createRequire(import.meta.url);

let preflightDone = false;

function findProjectRoot(): string {
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function tryLoad(): { ok: true } | { ok: false; message: string } {
  try {
    delete localRequire.cache[localRequire.resolve("better-sqlite3")];
  } catch {
    /* not yet cached — ignore */
  }
  try {
    localRequire("better-sqlite3");
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function isModuleVersionMismatch(message: string): boolean {
  return (
    message.includes("NODE_MODULE_VERSION") ||
    message.includes("ERR_DLOPEN_FAILED") ||
    message.includes("was compiled against a different Node.js version")
  );
}

function manualFixHint(): string {
  return (
    "Fix manually: align your Node version (`nvm use` will pick `.nvmrc`), " +
    "then run `npm rebuild better-sqlite3`."
  );
}

export function ensureBetterSqlite3(): void {
  if (preflightDone) return;

  const first = tryLoad();
  if (first.ok) {
    preflightDone = true;
    return;
  }

  if (!isModuleVersionMismatch(first.message)) {
    console.error(`[cabinet] Failed to load better-sqlite3:\n${first.message}`);
    process.exit(1);
  }

  const runtime = `Node ${process.version} (NODE_MODULE_VERSION ${process.versions.modules})`;
  console.warn(
    `[cabinet] better-sqlite3 native binary is incompatible with the current runtime — ${runtime}. ` +
      "Rebuilding from source…",
  );

  const root = findProjectRoot();
  try {
    execSync("npm rebuild better-sqlite3 --build-from-source", {
      cwd: root,
      stdio: "inherit",
    });
  } catch (rebuildErr) {
    const detail =
      rebuildErr instanceof Error ? rebuildErr.message : String(rebuildErr);
    console.error(
      `[cabinet] Auto-rebuild of better-sqlite3 failed: ${detail}\n[cabinet] ${manualFixHint()}`,
    );
    process.exit(1);
  }

  const second = tryLoad();
  if (!second.ok) {
    console.error(
      `[cabinet] better-sqlite3 still cannot be loaded after rebuild:\n${second.message}\n[cabinet] ${manualFixHint()}`,
    );
    process.exit(1);
  }

  console.warn("[cabinet] better-sqlite3 rebuilt successfully.");
  preflightDone = true;
}

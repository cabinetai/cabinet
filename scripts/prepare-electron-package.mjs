import { build as bundle } from "esbuild";
import { execFileSync } from "child_process";
import fs from "fs/promises";
import path from "path";

const projectRoot = process.cwd();
const outDir = path.join(projectRoot, "out");
const nextDir = path.join(projectRoot, ".next");
const standaloneDir = path.join(nextDir, "standalone");
const standaloneServerDir = path.join(standaloneDir, "server");
const standaloneNodeModulesDir = path.join(standaloneDir, "node_modules");
const standaloneBinDir = path.join(standaloneDir, "bin");
const daemonBundlePath = path.join(standaloneServerDir, "cabinet-daemon.cjs");
const daemonMigrationsDir = path.join(standaloneServerDir, "migrations");
const stagedNativeDir = path.join(standaloneDir, ".native");
const stagedNodePtyDir = path.join(stagedNativeDir, "node-pty");
const stagedSeedDir = path.join(standaloneDir, ".seed");
const bundledNodeBinaryPath = path.join(standaloneBinDir, "node");
const rootNodePtyDir = path.join(projectRoot, "node_modules", "node-pty");
const dataDir = path.join(projectRoot, "data");
const resourcesDir = path.join(projectRoot, "resources");
const agentLibraryDir = path.join(projectRoot, "src", "lib", "agents", "library");

const STANDALONE_PRUNE_PATHS = [
  ".agents",
  ".claude",
  ".github",
  ".git",
  "assets",
  "cli",
  "coverage",
  "data",
  "electron",
  "out",
  "scripts",
  "src",
  "test",
  ".dockerignore",
  ".env.example",
  ".env.local",
  ".gitignore",
  "AI-claude-editor.md",
  "CLAUDE.md",
  "LICENSE",
  "LICENSE.md",
  "PRD.md",
  "PROGRESS.md",
  "README.md",
  "components.json",
  "eslint.config.mjs",
  "forge.config.cjs",
  "next-env.d.ts",
  "next.config.ts",
  "package-lock.json",
  "postcss.config.mjs",
  "skills-lock.json",
  "tsconfig.json",
  "tsconfig.tsbuildinfo",
];

const SERVER_PRUNE_PATHS = [
  path.join("server", "cabinet-daemon.ts"),
  path.join("server", "db.ts"),
  path.join("server", "pty"),
  path.join("server", "cabinet-daemon.cjs"),
  path.join("server", "migrations"),
];

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function removePath(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function copyDirectory(fromPath, toPath) {
  if (!(await pathExists(fromPath))) {
    return;
  }

  await removePath(toPath);
  await fs.mkdir(path.dirname(toPath), { recursive: true });
  await fs.cp(fromPath, toPath, { recursive: true, force: true });
}

async function copyFileIfExists(fromPath, toPath) {
  if (!(await pathExists(fromPath))) {
    return;
  }
  await fs.mkdir(path.dirname(toPath), { recursive: true });
  await fs.copyFile(fromPath, toPath);
}

async function copyFile(fromPath, toPath) {
  await fs.mkdir(path.dirname(toPath), { recursive: true });
  await fs.copyFile(fromPath, toPath);
}

async function bundleDaemon() {
  await fs.mkdir(standaloneServerDir, { recursive: true });
  await bundle({
    entryPoints: [path.join(projectRoot, "server", "cabinet-daemon.ts")],
    bundle: true,
    format: "cjs",
    outfile: daemonBundlePath,
    platform: "node",
    target: "node20",
    external: ["better-sqlite3", "node-pty"],
    // CJS bundles emit `var import_meta = {}; import_meta.url` which is
    // undefined at runtime. createRequire(undefined) and fileURLToPath(undefined)
    // both crash the daemon at startup (v0.4.0/v0.4.1 Electron bug). Polyfill
    // by declaring a top-level helper in a banner and rewriting all
    // `import.meta.url` references to point at it.
    banner: {
      js: "var __cabinet_self_url = require('url').pathToFileURL(__filename).href;",
    },
    define: {
      "import.meta.url": "__cabinet_self_url",
    },
    logLevel: "silent",
  });
}

async function stageDaemonRuntime() {
  await Promise.all([
    removePath(daemonBundlePath),
    removePath(daemonMigrationsDir),
    removePath(stagedNativeDir),
    removePath(bundledNodeBinaryPath),
    // Remove any node-pty from node_modules so the daemon can only find
    // it via NODE_PATH (pointing outside the .app bundle at runtime).
    removePath(path.join(standaloneNodeModulesDir, "node-pty")),
  ]);

  await bundleDaemon();
  await copyDirectory(path.join(projectRoot, "server", "migrations"), daemonMigrationsDir);

  // Stage node-pty into .native/ (NOT node_modules/) so it ships inside the
  // app bundle but is not resolvable by require().  At runtime, main.cjs
  // copies it to userData where macOS allows execution.
  await Promise.all([
    copyDirectory(path.join(rootNodePtyDir, "lib"), path.join(stagedNodePtyDir, "lib")),
    copyDirectory(
      path.join(rootNodePtyDir, "prebuilds", "darwin-arm64"),
      path.join(stagedNodePtyDir, "prebuilds", "darwin-arm64")
    ),
    copyFile(path.join(rootNodePtyDir, "package.json"), path.join(stagedNodePtyDir, "package.json")),
  ]);

  await fs.chmod(path.join(stagedNodePtyDir, "prebuilds", "darwin-arm64", "spawn-helper"), 0o755);
}

async function stageBundledNodeRuntime() {
  await copyFile(process.execPath, bundledNodeBinaryPath);
  await fs.chmod(bundledNodeBinaryPath, 0o755);
}

async function stageSeedContent() {
  await removePath(stagedSeedDir);

  // Default pages — seed from resources/ (canonical location). data/ is local
  // runtime state and isn't tracked in git, so it's not present in CI checkouts.
  await Promise.all([
    copyDirectory(path.join(resourcesDir, "getting-started"), path.join(stagedSeedDir, "getting-started")),
    copyDirectory(path.join(resourcesDir, "example-cabinet-carousel-factory"), path.join(stagedSeedDir, "example-cabinet-carousel-factory")),
    copyFileIfExists(path.join(resourcesDir, "index.md"), path.join(stagedSeedDir, "index.md")),
    copyFileIfExists(path.join(resourcesDir, "CLAUDE.md"), path.join(stagedSeedDir, "CLAUDE.md")),
  ]);

  // Agent library templates
  await copyDirectory(
    agentLibraryDir,
    path.join(stagedSeedDir, ".agents", ".library")
  );

  // Playbook catalog — also moved to resources/
  if (await pathExists(path.join(resourcesDir, ".playbooks", "catalog"))) {
    await copyDirectory(
      path.join(resourcesDir, ".playbooks", "catalog"),
      path.join(stagedSeedDir, ".playbooks", "catalog")
    );
  }

  // Remove .DS_Store files
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.name === ".DS_Store") await removePath(fullPath);
    }
  };
  await walk(stagedSeedDir);
}

async function main() {
  if (!(await pathExists(standaloneDir))) {
    throw new Error("Expected .next/standalone to exist. Run `npm run build` first.");
  }

  await removePath(outDir);

  await Promise.all([
    removePath(path.join(standaloneDir, ".next", "cache")),
    removePath(path.join(standaloneDir, ".next", "dev")),
    ...STANDALONE_PRUNE_PATHS.map((relativePath) =>
      removePath(path.join(standaloneDir, relativePath))
    ),
    ...SERVER_PRUNE_PATHS.map((relativePath) =>
      removePath(path.join(standaloneDir, relativePath))
    ),
  ]);

  await copyDirectory(path.join(projectRoot, "public"), path.join(standaloneDir, "public"));
  await copyDirectory(path.join(nextDir, "static"), path.join(standaloneDir, ".next", "static"));
  await stageDaemonRuntime();
  await stageBundledNodeRuntime();
  await stageSeedContent();
}

await main();

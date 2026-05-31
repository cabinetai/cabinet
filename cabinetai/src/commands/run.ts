import type { Command } from "commander";
import path from "path";
import fs from "fs";
import { log, success, error, warning } from "../lib/log.js";
import { ensureApp } from "../lib/app-manager.js";
import { openBrowser, npmCommand, spawnChild } from "../lib/process.js";
import {
  bootstrapCabinetAt,
  resolveCabinetRoot,
  resolveOrBootstrapCabinetRoot,
  type ResolvedCabinetRoot,
} from "../lib/scaffold.js";
import { CABINET_MANIFEST } from "../lib/paths.js";
import { confirmOrContinue } from "../lib/prompt.js";
import {
  parsePort,
  findAvailablePort,
  updateRuntimeService,
  clearRuntimeService,
  readRuntimePorts,
  isProcessAlive,
  originResponds,
} from "../lib/ports.js";
import { VERSION } from "../version.js";

type ResolutionSource =
  | "data-dir-flag"
  | "env-var"
  | "manifest-here"
  | "manifest-ancestor"
  | "bootstrapped";

interface ResolveOptions {
  dataDirFlag?: string;
}

/**
 * Reasons a directory looks like a poor choice to bootstrap as a cabinet.
 * Returns null for directories that look fine.
 *
 * NOTE: HOME and the filesystem root are not handled here — they're hard-
 * refused by the guard in `bootstrapCabinetAt`. Anything we return from this
 * function is a *soft* warning where the user can still proceed.
 */
function looksRiskyForBootstrap(dir: string): string | null {
  const resolved = path.resolve(dir);
  const base = path.basename(resolved).toLowerCase();
  const devNames = new Set([
    "developer",
    "development",
    "projects",
    "code",
    "src",
    "source",
    "workspace",
    "repos",
    "git",
    "github",
  ]);
  if (devNames.has(base)) return `"${path.basename(resolved)}" looks like a dev folder`;
  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const subdirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).length;
    if (subdirs > 50) return `${subdirs} subdirectories — likely too broad for a single cabinet`;
  } catch {
    // unreadable cwd; let the rest of the flow surface the real error
  }
  return null;
}

async function resolveCabinetDir(opts: ResolveOptions): Promise<{
  resolved: ResolvedCabinetRoot;
  source: ResolutionSource;
}> {
  // 1. Explicit --data-dir wins over everything else.
  if (opts.dataDirFlag) {
    const target = path.resolve(opts.dataDirFlag);
    fs.mkdirSync(target, { recursive: true });
    const found = resolveCabinetRoot(target);
    if (found && !found.resolvedFromAncestor) {
      // The exact dir already has a manifest — reuse it silently.
      const existing: ResolvedCabinetRoot = {
        cabinetDir: found.cabinetDir,
        name: path.basename(found.cabinetDir),
        bootstrapped: false,
        startedFrom: target,
        resolvedFromAncestor: false,
      };
      return { resolved: existing, source: "data-dir-flag" };
    }
    // Either nothing here yet, or a parent has one (we ignore that — explicit wins).
    return { resolved: bootstrapCabinetAt(target), source: "data-dir-flag" };
  }

  // 2. CABINET_DATA_DIR env var. Same precedence as the daemon's runtime-config.
  const envDir = process.env.CABINET_DATA_DIR?.trim();
  if (envDir) {
    const target = path.resolve(envDir);
    fs.mkdirSync(target, { recursive: true });
    const found = resolveCabinetRoot(target);
    if (found && !found.resolvedFromAncestor) {
      return {
        resolved: {
          cabinetDir: found.cabinetDir,
          name: path.basename(found.cabinetDir),
          bootstrapped: false,
          startedFrom: target,
          resolvedFromAncestor: false,
        },
        source: "env-var",
      };
    }
    return { resolved: bootstrapCabinetAt(target), source: "env-var" };
  }

  // 3. Walk up from cwd to find an existing cabinet.
  const found = resolveCabinetRoot();
  if (found) {
    if (found.resolvedFromAncestor) {
      // Surprising case Gareth hit: ran in ~/Developer/cabinet but ~/Developer
      // already has a .cabinet from a previous run. Make sure the user knows.
      console.log("");
      warning(
        `Found an existing cabinet at a parent of your current directory:`
      );
      console.log(`    cabinet root:  ${found.cabinetDir}`);
      console.log(`    your cwd:      ${found.startedFrom}`);
      console.log(
        `    manifest file: ${path.join(found.cabinetDir, CABINET_MANIFEST)}`
      );
      console.log("");
      console.log(
        "  Cabinet walks up from your cwd looking for a .cabinet file. To run\n" +
          "  in your current directory instead, pass --data-dir explicitly:\n" +
          `    cabinetai run --data-dir ${found.startedFrom}`
      );
      const proceed = await confirmOrContinue(
        `Use the cabinet at ${found.cabinetDir}?`,
        true,
        true
      );
      if (!proceed) {
        console.log("");
        log(
          `Aborted. Re-run with --data-dir to choose a directory, or remove ${path.join(
            found.cabinetDir,
            CABINET_MANIFEST
          )} (cabinetai reset-config) to forget this cabinet.`
        );
        process.exit(0);
      }
    }
    return {
      resolved: {
        cabinetDir: found.cabinetDir,
        name: path.basename(found.cabinetDir),
        bootstrapped: false,
        startedFrom: found.startedFrom,
        resolvedFromAncestor: found.resolvedFromAncestor,
      },
      source: found.resolvedFromAncestor ? "manifest-ancestor" : "manifest-here",
    };
  }

  // 4. About to bootstrap cwd. Warn first if it looks risky.
  const cwd = path.resolve(process.cwd());
  const risky = looksRiskyForBootstrap(cwd);
  if (risky) {
    console.log("");
    warning(`About to make this directory a cabinet — but ${risky}.`);
    console.log(`    target:   ${cwd}`);
    console.log("");
    console.log(
      "  Cabinet indexes every supported file under the cabinet directory.\n" +
        "  A focused workspace works far better than a full dev folder.\n" +
        "  Recommended: ~/Documents/Cabinet (or any fresh empty directory).\n" +
        "\n" +
        `  To pick a different folder:  cabinetai run --data-dir ~/Documents/Cabinet`
    );
    const proceed = await confirmOrContinue(`Continue and bootstrap ${cwd}?`, true, false);
    if (!proceed) {
      console.log("");
      log("Aborted. Pick a fresh empty folder or use --data-dir.");
      process.exit(0);
    }
  }

  return {
    resolved: resolveOrBootstrapCabinetRoot(cwd),
    source: "bootstrapped",
  };
}

function describeSource(source: ResolutionSource, resolved: ResolvedCabinetRoot): string {
  switch (source) {
    case "data-dir-flag":
      return resolved.bootstrapped ? "--data-dir (bootstrapped)" : "--data-dir";
    case "env-var":
      return resolved.bootstrapped
        ? "CABINET_DATA_DIR (bootstrapped)"
        : "CABINET_DATA_DIR";
    case "manifest-here":
      return "found .cabinet here";
    case "manifest-ancestor":
      return `found .cabinet at parent (walked up from ${resolved.startedFrom})`;
    case "bootstrapped":
      return "bootstrapped here (no .cabinet found)";
  }
}

export function registerRun(program: Command): void {
  program
    .command("run")
    .description("Start Cabinet serving the current cabinet directory")
    .option("--app-version <version>", "Override the app version to use")
    .option("--no-open", "Don't open the browser automatically")
    .option(
      "--data-dir <path>",
      "Use this exact directory as the cabinet (skips upward traversal)"
    )
    .action(
      async (opts: {
        appVersion?: string;
        open?: boolean;
        dataDir?: string;
      }) => {
        try {
          await runCabinet(opts);
        } catch (err) {
          error(err instanceof Error ? err.message : String(err));
        }
      }
    );
}

async function runCabinet(opts: {
  appVersion?: string;
  open?: boolean;
  dataDir?: string;
}): Promise<void> {
  // 1. Resolve where this cabinet lives (with TTY warnings for surprising cases)
  const { resolved, source } = await resolveCabinetDir({ dataDirFlag: opts.dataDir });
  const { cabinetDir, name, bootstrapped } = resolved;
  if (bootstrapped) {
    success(`Bootstrapped "${name}" at ${cabinetDir}`);
  }

  const version = opts.appVersion || VERSION;

  console.log(`
  ┌─────────────────────────────┐
  │                             │
  │   📦  Cabinet v${version.padEnd(13)}│
  │   AI-first startup OS       │
  │                             │
  └─────────────────────────────┘
  `);

  log(`Cabinet directory: ${cabinetDir}`);
  log(`Manifest:          ${path.join(cabinetDir, CABINET_MANIFEST)}`);
  log(`Source:            ${describeSource(source, resolved)}`);

  // 2. Ensure app is installed
  const appDir = await ensureApp(version);
  log(`App directory:     ${appDir}`);

  // 3. Quick doctor: auto-install deps if missing
  if (!fs.existsSync(path.join(appDir, "node_modules", "next"))) {
    log("Installing dependencies...");
    const { spawnSync } = await import("child_process");
    const result = spawnSync(npmCommand(), ["install"], {
      cwd: appDir,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      error("Failed to install dependencies");
    }
  }

  // 4. Check for existing running server for this cabinet
  const existingPorts = readRuntimePorts(cabinetDir);
  if (existingPorts.app?.pid && isProcessAlive(existingPorts.app.pid)) {
    const origin = existingPorts.app.origin;
    if (await originResponds(origin)) {
      success(`Cabinet is already running at ${origin}`);
      if (opts.open !== false) {
        openBrowser(origin);
      }
      return;
    }
  }

  // 5. Find available ports
  const preferredAppPort = parsePort(process.env.CABINET_APP_PORT || process.env.PORT, 4000);
  const preferredDaemonPort = parsePort(process.env.CABINET_DAEMON_PORT, 4100);

  const appPort = await findAvailablePort(preferredAppPort);
  const daemonPort = await findAvailablePort(preferredDaemonPort);

  if (appPort !== preferredAppPort) {
    warning(`App port ${preferredAppPort} is busy, using ${appPort} instead.`);
  }
  if (daemonPort !== preferredDaemonPort) {
    warning(`Daemon port ${preferredDaemonPort} is busy, using ${daemonPort} instead.`);
  }

  const appOrigin = `http://127.0.0.1:${appPort}`;
  const daemonOrigin = `http://127.0.0.1:${daemonPort}`;
  const daemonWsOrigin = `ws://127.0.0.1:${daemonPort}`;

  // 6. Spawn Next.js dev server
  const nextBin = path.join(appDir, "node_modules", "next", "dist", "bin", "next");
  const appEnv = {
    // Default CABINET_APP_ORIGIN to loopback, but let process.env override
    // when the operator pinned a public hostname so next.config.ts can
    // auto-allow it through Next 15's dev origin guard.
    CABINET_APP_ORIGIN: appOrigin,
    ...process.env,
    CABINET_DATA_DIR: cabinetDir,
    PORT: String(appPort),
    CABINET_APP_PORT: String(appPort),
    CABINET_DAEMON_PORT: String(daemonPort),
    CABINET_DAEMON_URL: daemonOrigin,
    // Note: do not pin CABINET_PUBLIC_DAEMON_ORIGIN here. The /api/daemon/auth
    // route derives the browser-visible WS origin from the request Host so a
    // remote browser connects to the same hostname it reached the app on. Set
    // CABINET_PUBLIC_DAEMON_ORIGIN explicitly only when serving behind a proxy.
  };

  log("Starting Next.js server...");
  const appChild = spawnChild(
    process.execPath,
    [nextBin, "dev", "-p", String(appPort)],
    {
      cwd: appDir,
      stdio: "inherit",
      env: appEnv,
    }
  );

  updateRuntimeService(cabinetDir, "app", {
    port: appPort,
    origin: appOrigin,
    pid: appChild.pid!,
    updatedAt: new Date().toISOString(),
    cabinetDir,
  });

  // 7. Spawn daemon
  const tsxCli = path.join(appDir, "node_modules", "tsx", "dist", "cli.mjs");
  const daemonScript = path.join(appDir, "server", "cabinet-daemon.ts");

  log("Starting daemon...");
  const daemonChild = spawnChild(
    process.execPath,
    [tsxCli, daemonScript],
    {
      cwd: appDir,
      stdio: "inherit",
      env: {
        ...appEnv,
        CABINET_DAEMON_PORT: String(daemonPort),
        CABINET_DAEMON_URL: daemonOrigin,
        CABINET_PUBLIC_DAEMON_ORIGIN: daemonOrigin,
      },
    }
  );

  updateRuntimeService(cabinetDir, "daemon", {
    port: daemonPort,
    origin: daemonOrigin,
    wsOrigin: daemonWsOrigin,
    pid: daemonChild.pid!,
    updatedAt: new Date().toISOString(),
    cabinetDir,
  });

  // 8. Print status
  console.log("");
  success(`Cabinet is running at ${appOrigin}`);
  console.log(`  Daemon: ${daemonOrigin}`);
  console.log(`  Data:   ${cabinetDir}`);
  console.log("");

  // 9. Open browser
  if (opts.open !== false) {
    // Give the server a moment to start before opening
    setTimeout(() => openBrowser(appOrigin), 2000);
  }

  // 10. Handle signals and cleanup
  const children = [appChild, daemonChild];

  const cleanup = () => {
    clearRuntimeService(cabinetDir, "app", appChild.pid!);
    clearRuntimeService(cabinetDir, "daemon", daemonChild.pid!);
  };

  process.on("exit", cleanup);

  process.on("SIGINT", () => {
    for (const child of children) child.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    for (const child of children) child.kill("SIGTERM");
  });

  // Wait for either child to exit
  let exited = 0;
  const onChildExit = (code: number | null, signal: NodeJS.Signals | null) => {
    exited++;
    if (exited === 1) {
      // First child died — kill the other
      for (const child of children) {
        try {
          child.kill("SIGTERM");
        } catch {
          // Already dead
        }
      }
    }
    if (exited >= children.length) {
      cleanup();
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    }
  };

  appChild.on("exit", onChildExit);
  daemonChild.on("exit", onChildExit);
}

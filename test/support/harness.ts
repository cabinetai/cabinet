/**
 * Boots a real Cabinet — Next.js app + daemon — against an isolated, seeded
 * state root on ephemeral ports.
 *
 * Every seam used here is existing product configuration, not a test backdoor:
 *   CABINET_DATA_DIR   → getManagedDataDir() → DATA_DIR        (runtime-config.ts:72)
 *   CABINET_DAEMON_PORT→ getDaemonPort()                       (runtime-config.ts:115)
 *   PATH               → buildRuntimePath + lookupCommandOnPath(provider-cli.ts:58,153)
 *   KB_PASSWORD unset  → auth disabled                         (kb-auth.ts:44)
 *
 * DATA_DIR is a module-level const, frozen at import time, so the state root
 * MUST be injected when the process is spawned. It cannot be changed after.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { createFakeAgentCli, type FakeAgentCli } from "./fake-agent-cli";

// Resolved by walking up to the nearest package.json rather than from
// import.meta: the repo is CommonJS, and Playwright transpiles specs to CJS
// where import.meta is a syntax error.
const REPO_ROOT = findRepoRoot(__dirname);

// Two fixtures, deliberately:
//   seed-cabinet — the root .cabinet manifest ONLY, used by the unit suite.
//   e2e-cabinet  — root manifest + a runnable agent + workspace config.
// They are separate because provider-management's tests scan DATA_DIR for
// agents assigned to a provider; an extra persona in the shared unit fixture
// silently changes their expected conflict list.
const DEFAULT_SEED = path.join(REPO_ROOT, "test/support/fixtures/e2e-cabinet");

function findRepoRoot(start: string): string {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`no package.json found above ${start}`);
}

export interface FakeAgentSpec {
  /** Command the adapter looks for on PATH, e.g. "claude". */
  name: string;
  /** Stream-JSON lines the fake CLI emits. */
  lines: string[];
}

export interface BootOptions {
  /** Directory copied into the temp state root. Defaults to the seed fixture. */
  seed?: string;
  /** Fake agent CLIs to place on PATH, shadowing any real install. */
  fakeAgents?: FakeAgentSpec[];
}

export interface CabinetInstance {
  appUrl: string;
  daemonUrl: string;
  dataDir: string;
  close(): Promise<void>;
}

export async function bootCabinet(options: BootOptions = {}): Promise<CabinetInstance> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-e2e-"));
  const seed = options.seed ?? DEFAULT_SEED;
  await fs.cp(seed, dataDir, { recursive: true });

  // Adapters do NOT resolve their CLI from $PATH directly. buildRuntimePath()
  // (provider-cli.ts:78) returns:
  //
  //   $HOME/.local/bin : /usr/local/bin : /opt/homebrew/bin : <nvm bin> : $PATH
  //
  // so a shim merely prepended to $PATH is SHADOWED by any real CLI installed
  // in one of the earlier dirs — on a dev machine with Claude Code installed,
  // the "fake" agent test would silently invoke the real model. Instead we give
  // the child processes a temp HOME and install the fakes into its
  // .local/bin, which that same rule puts ahead of everything else.
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-e2e-home-"));
  const binDir = path.join(home, ".local", "bin");
  await fs.mkdir(binDir, { recursive: true });

  const fakes: FakeAgentCli[] = [];
  for (const agent of options.fakeAgents ?? []) {
    fakes.push(await createFakeAgentCli(agent.name, agent.lines, binDir));
  }

  const appPort = await freePort();
  const daemonPort = await freePort();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    PATH: [binDir, process.env.PATH ?? ""].filter(Boolean).join(path.delimiter),
    CABINET_DATA_DIR: dataDir,
    CABINET_DAEMON_PORT: String(daemonPort),
    NODE_ENV: "production",
    // Auth is enabled exactly when KB_PASSWORD is non-empty. Keep it off so the
    // bullet tests the agent loop, not the login wall.
    KB_PASSWORD: "",
  };

  const children: ChildProcess[] = [];
  const daemon = spawn("npx", ["tsx", "server/cabinet-daemon.ts"], {
    cwd: REPO_ROOT,
    env,
    stdio: "pipe",
  });
  children.push(daemon);

  const app = spawn("npx", ["next", "start", "-p", String(appPort)], {
    cwd: REPO_ROOT,
    env: { ...env, PORT: String(appPort) },
    stdio: "pipe",
  });
  children.push(app);

  const logs: string[] = [];
  for (const child of children) {
    child.stdout?.on("data", (d) => logs.push(String(d)));
    child.stderr?.on("data", (d) => logs.push(String(d)));
  }

  const appUrl = `http://127.0.0.1:${appPort}`;
  const daemonUrl = `http://127.0.0.1:${daemonPort}`;

  const close = async () => {
    for (const child of children) child.kill("SIGTERM");
    await Promise.all(fakes.map((f) => f.cleanup()));
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  };

  try {
    // Poll readiness rather than sleeping — sleeps are how e2e suites get flaky.
    await Promise.all([
      waitForOk(`${daemonUrl}/health`),
      waitForOk(appUrl),
    ]);
  } catch (error) {
    const tail = logs.join("").split("\n").slice(-25).join("\n");
    await close();
    throw new Error(`${(error as Error).message}\n--- app/daemon output ---\n${tail}`);
  }

  return { appUrl, daemonUrl, dataDir, close };
}

async function waitForOk(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = (error as Error).message;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${url} (last: ${last})`);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "string" || !address) {
        server.close();
        reject(new Error("could not determine a free port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

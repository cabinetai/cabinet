import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const APP_PORT = 4207 as const;

export interface IsolatedCabinet {
  appUrl: string;
  dataDir: string;
  restart(): Promise<void>;
  logs(): string;
  close(): Promise<void>;
}

async function assertPortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => reject(new Error(`required port ${port} is unavailable: ${error.message}`)));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve()));
  });
}

async function waitForOk(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "not attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for isolated Cabinet (${last})`);
}

async function stop(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

export async function bootIsolatedCabinet(repoRoot: string): Promise<IsolatedCabinet> {
  await assertPortAvailable(APP_PORT);
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-production-acceptance-"));
  const dataDir = path.join(stateRoot, "data");
  const homeDir = path.join(stateRoot, "home");
  await fs.mkdir(path.join(homeDir, ".local/bin"), { recursive: true });
  await fs.mkdir(path.join(dataDir, "acceptance-cabinet/.agents/editor"), { recursive: true });
  await fs.mkdir(path.join(dataDir, ".agents/.config"), { recursive: true });
  await fs.mkdir(path.join(dataDir, ".home"), { recursive: true });
  await fs.writeFile(
    path.join(dataDir, ".cabinet"),
    "schemaVersion: 1\nid: home\nname: Acceptance Home\nkind: home\nentry: index.md\n"
  );
  await fs.writeFile(path.join(dataDir, "index.md"), "# Acceptance Home\n");
  await fs.writeFile(
    path.join(dataDir, ".agents/.config/workspace.json"),
    JSON.stringify(
      {
        exists: true,
        version: 2,
        home: { name: "Acceptance Home" },
        room: {
          id: "acceptance-01",
          type: "office",
          name: "Acceptance Cabinet",
          slug: "acceptance-cabinet",
        },
        cabinet: {
          name: "Acceptance Cabinet",
          description: "Isolated production acceptance fixture.",
          size: "",
        },
        setupDate: "2026-07-23T00:00:00.000Z",
      },
      null,
      2
    )
  );
  await fs.writeFile(
    path.join(dataDir, ".home/home.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        kind: "home",
        defaultRoom: "acceptance-cabinet",
        lastActiveRoom: "acceptance-cabinet",
      },
      null,
      2
    )
  );
  await fs.writeFile(
    path.join(dataDir, "acceptance-cabinet/.cabinet"),
    "schemaVersion: 1\nid: acceptance-cabinet\nname: Acceptance Cabinet\nkind: room\nentry: index.md\n"
  );
  await fs.writeFile(path.join(dataDir, "acceptance-cabinet/index.md"), "# Acceptance Cabinet\n");
  await fs.writeFile(
    path.join(dataDir, "acceptance-cabinet/.agents/editor/persona.md"),
    `---
name: Operator
slug: editor
type: specialist
department: engineering
role: Acceptance operator
provider: hermes
active: true
setupComplete: true
workdir: /data
workspace: /
channels: [general]
focus: []
---

Isolated acceptance fixture. No model execution is authorized.
`
  );

  const logs: string[] = [];
  let app: ChildProcess | null = null;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: homeDir,
    CABINET_DATA_DIR: dataDir,
    CABINET_RUNTIME_MODE: "hermes",
    CABINET_HERMES_PROFILE: "operator-os",
    CABINET_DAEMON_PORT: "4217",
    KB_PASSWORD: "",
    NODE_ENV: "production",
    PORT: String(APP_PORT),
  };

  const start = async () => {
    app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
      cwd: repoRoot,
      env,
      stdio: "pipe",
    });
    app.stdout?.on("data", (chunk) => logs.push(String(chunk)));
    app.stderr?.on("data", (chunk) => logs.push(String(chunk)));
    await waitForOk(`http://127.0.0.1:${APP_PORT}/api/health`);
  };

  await start();
  return {
    appUrl: `http://127.0.0.1:${APP_PORT}`,
    dataDir,
    restart: async () => {
      await stop(app);
      await assertPortAvailable(APP_PORT);
      await start();
    },
    logs: () => logs.join(""),
    close: async () => {
      await stop(app);
      await fs.rm(stateRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
}

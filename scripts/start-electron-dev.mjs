import { spawn } from "child_process";
import net from "net";
import path from "path";

const appUrl = (process.env.ELECTRON_START_URL || "http://127.0.0.1:3000").trim();
const daemonUrl = (process.env.CABINET_DAEMON_URL || "http://127.0.0.1:3001").trim();

function parseUrlPort(url) {
  try {
    const parsed = new URL(url);
    return Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  } catch {
    return null;
  }
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 30_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }
        setTimeout(attempt, 500);
      });
    };

    attempt();
  });
}

const appPort = parseUrlPort(appUrl);
const daemonPort = parseUrlPort(daemonUrl);

if (!appPort || !daemonPort) {
  throw new Error("Invalid dev URLs. Check ELECTRON_START_URL and CABINET_DAEMON_URL.");
}

await Promise.all([waitForPort(appPort), waitForPort(daemonPort)]);

const electronBin =
  process.platform === "win32"
    ? path.join(process.cwd(), "node_modules", ".bin", "electron.cmd")
    : path.join(process.cwd(), "node_modules", ".bin", "electron");

const child =
  process.platform === "win32"
    ? spawn(`"${electronBin}" .`, {
        stdio: "inherit",
        shell: true,
        env: {
          ...process.env,
          ELECTRON_START_URL: appUrl,
        },
      })
    : spawn(electronBin, ["."], {
        stdio: "inherit",
        env: {
          ...process.env,
          ELECTRON_START_URL: appUrl,
        },
      });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

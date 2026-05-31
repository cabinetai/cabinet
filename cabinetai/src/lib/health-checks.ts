import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { findCabinetRoot } from "./paths.js";
import { appVersionDir } from "./paths.js";
import { npmCommand } from "./process.js";
import { isPortFree, parsePort } from "./ports.js";

export interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: () => void;
}

export function checkNodeVersion(): CheckResult {
  const major = parseInt(process.version.slice(1), 10);
  if (major < 18) {
    return {
      name: "Node.js version",
      status: "fail",
      message: `Node.js ${process.version} is too old. Requires >= 18.`,
    };
  }
  if (major < 20) {
    return {
      name: "Node.js version",
      status: "warn",
      message: `Node.js ${process.version} works but >= 20 is recommended.`,
    };
  }
  return {
    name: "Node.js version",
    status: "pass",
    message: `Node.js ${process.version}`,
  };
}

export function checkCabinetRoot(): CheckResult {
  const root = findCabinetRoot();
  if (!root) {
    return {
      name: "Cabinet root",
      status: "fail",
      message: 'No .cabinet file found. Run "cabinetai create <name>" first.',
    };
  }
  return {
    name: "Cabinet root",
    status: "pass",
    message: root,
  };
}

export function checkAppInstalled(version: string): CheckResult {
  const appDir = appVersionDir(version);
  if (!fs.existsSync(path.join(appDir, "package.json"))) {
    return {
      name: "App installed",
      status: "fail",
      message: `Cabinet v${version} not installed at ${appDir}`,
      fix: () => {
        // Will be handled by ensureApp in the run command
      },
    };
  }
  return {
    name: "App installed",
    status: "pass",
    message: `v${version} at ${appDir}`,
  };
}

export function checkAppDeps(version: string): CheckResult {
  const appDir = appVersionDir(version);
  const nextPath = path.join(appDir, "node_modules", "next");

  if (!fs.existsSync(nextPath)) {
    return {
      name: "App dependencies",
      status: "fail",
      message: "Dependencies not installed.",
      fix: () => {
        spawnSync(npmCommand(), ["install"], { cwd: appDir, stdio: "inherit" });
      },
    };
  }
  return {
    name: "App dependencies",
    status: "pass",
    message: "Installed",
  };
}

export function checkEnvLocal(version: string): CheckResult {
  const appDir = appVersionDir(version);
  const envLocal = path.join(appDir, ".env.local");
  const envExample = path.join(appDir, ".env.example");

  if (!fs.existsSync(envLocal)) {
    return {
      name: ".env.local",
      status: "warn",
      message: "Missing .env.local in app directory.",
      fix: () => {
        if (fs.existsSync(envExample)) {
          fs.copyFileSync(envExample, envLocal);
        }
      },
    };
  }
  return {
    name: ".env.local",
    status: "pass",
    message: "Present",
  };
}

export async function checkPorts(): Promise<CheckResult> {
  const appPort = parsePort(process.env.CABINET_APP_PORT, 4000);
  const daemonPort = parsePort(process.env.CABINET_DAEMON_PORT, 4100);

  const appFree = await isPortFree(appPort);
  const daemonFree = await isPortFree(daemonPort);

  if (!appFree && !daemonFree) {
    return {
      name: "Ports",
      status: "warn",
      message: `Both ports ${appPort} and ${daemonPort} are in use (will auto-select alternatives).`,
    };
  }
  if (!appFree) {
    return {
      name: "Ports",
      status: "warn",
      message: `App port ${appPort} is in use (will auto-select alternative).`,
    };
  }
  if (!daemonFree) {
    return {
      name: "Ports",
      status: "warn",
      message: `Daemon port ${daemonPort} is in use (will auto-select alternative).`,
    };
  }
  return {
    name: "Ports",
    status: "pass",
    message: `App: ${appPort}, Daemon: ${daemonPort} — both available`,
  };
}

export function runAllChecks(version: string): { checks: CheckResult[]; asyncChecks: Promise<CheckResult>[] } {
  const checks = [
    checkNodeVersion(),
    checkCabinetRoot(),
    checkAppInstalled(version),
    checkAppDeps(version),
    checkEnvLocal(version),
  ];
  const asyncChecks = [checkPorts()];
  return { checks, asyncChecks };
}

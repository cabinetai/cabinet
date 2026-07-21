import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export type HermesDesktopCommand = { command: string; args: string[]; application: string };

export function hermesDesktopCommand(platform: NodeJS.Platform = process.platform): HermesDesktopCommand | null {
  if (platform === "darwin") {
    return { command: "open", args: ["-a", "Hermes"], application: "/Applications/Hermes.app" };
  }
  return null;
}

export function openHermesDesktop(): { application: string } {
  const launch = hermesDesktopCommand();
  if (!launch) throw new Error("The Hermes Desktop diagnostic escape hatch is not supported on this platform.");
  if (!existsSync(launch.application)) throw new Error(`Hermes Desktop was not found at ${launch.application}.`);
  spawn(launch.command, launch.args, { stdio: "ignore", detached: true }).unref();
  return { application: launch.application };
}

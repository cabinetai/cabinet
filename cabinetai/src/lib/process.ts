import { spawnSync, spawn, type ChildProcess, type SpawnOptions } from "child_process";
import { error } from "./log.js";

export function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function run(bin: string, args: string[], opts: Record<string, unknown> = {}): void {
  const result = spawnSync(bin, args, {
    stdio: "inherit",
    ...opts,
  });
  if (result.status !== 0) {
    error(`Command failed: ${bin} ${args.join(" ")}`);
  }
}

export function spawnChild(
  bin: string,
  args: string[],
  opts: SpawnOptions = {}
): ChildProcess {
  return spawn(bin, args, {
    stdio: "inherit",
    ...opts,
  });
}

export function openBrowser(url: string): void {
  // Only allow http/https URLs to prevent opening arbitrary file:// or other schemes
  if (!/^https?:\/\//i.test(url)) return;

  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  spawnSync(cmd, [url], { stdio: "ignore" });
}

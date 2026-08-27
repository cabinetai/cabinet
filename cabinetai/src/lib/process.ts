import {
  spawnSync,
  spawn,
  type ChildProcess,
  type SpawnOptions,
  type SpawnSyncOptions,
  type SpawnSyncReturns,
} from "child_process";
import { error } from "./log.js";

export function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

/**
 * Run an npm subcommand synchronously.
 *
 * On Windows npm's entry point is `npm.cmd`, a batch file. Since the Node
 * hardening released for CVE-2024-27980, spawning a `.cmd` without a shell
 * fails with EINVAL, so npm has to be reached through the command interpreter.
 *
 * We do that by spawning `cmd.exe /c npm.cmd <args>` with a real argument
 * array rather than passing `shell: true`. With `shell: true` Node
 * concatenates the arguments into a single unescaped command string, which
 * Node warns about (DEP0190). An argument array is quoted by Node before
 * cmd.exe re-parses it.
 */
export function runNpm(args: string[], opts: SpawnSyncOptions = {}): SpawnSyncReturns<Buffer> {
  const options: SpawnSyncOptions = { stdio: "inherit", ...opts };
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/c", npmCommand(), ...args], options)
      : spawnSync(npmCommand(), args, options);
  return result as SpawnSyncReturns<Buffer>;
}

/**
 * Describe why a spawnSync call failed, so callers can report the underlying
 * cause instead of collapsing every failure into one generic message.
 */
export function describeSpawnFailure(result: SpawnSyncReturns<Buffer>): string {
  if (result.error) return result.error.message;
  const stderr = result.stderr ? result.stderr.toString().trim() : "";
  if (stderr) return stderr;
  if (result.signal) return `terminated by signal ${result.signal}`;
  return `exited with code ${result.status}`;
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

import { execFile } from "child_process";
import type { ChildProcess } from "child_process";

type TerminateChildProcessOptions = {
  platform?: NodeJS.Platform;
  taskkill?: (command: string, args: string[]) => Promise<void>;
};

function killDirectly(proc: ChildProcess): void {
  try {
    proc.kill();
  } catch {}
}

async function defaultTaskkill(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(command, args, { stdio: "ignore" }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function terminateChildProcess(
  proc: ChildProcess,
  options?: TerminateChildProcessOptions
): Promise<void> {
  const platform = options?.platform || process.platform;

  if (platform !== "win32") {
    killDirectly(proc);
    return;
  }

  if (!proc.pid) {
    killDirectly(proc);
    return;
  }

  try {
    const taskkill = options?.taskkill || defaultTaskkill;
    await taskkill("taskkill.exe", ["/PID", String(proc.pid), "/T", "/F"]);
  } catch {
    killDirectly(proc);
  }
}

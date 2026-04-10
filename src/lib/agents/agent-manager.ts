import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { buildWindowsShellCommand, RUNTIME_PATH } from "./provider-cli";
import { getOneShotLaunchSpec } from "./provider-runtime";

export interface AgentSession {
  id: string;
  taskId?: string;
  taskTitle: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  output: string;
  process?: ChildProcess;
}

// In-memory session store
const sessions = new Map<string, AgentSession>();

export function getActiveSessions(): AgentSession[] {
  return Array.from(sessions.values())
    .filter((s) => s.status === "running")
    .map(({ process: _p, ...rest }) => rest);
}

export function getRecentSessions(limit = 10): AgentSession[] {
  return Array.from(sessions.values())
    .filter((s) => s.status !== "running")
    .sort(
      (a, b) =>
        new Date(b.completedAt || b.startedAt).getTime() -
        new Date(a.completedAt || a.startedAt).getTime()
    )
    .slice(0, limit)
    .map(({ process: _p, ...rest }) => rest);
}

export function getSession(id: string): AgentSession | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  const { process: _p, ...rest } = session;
  return rest;
}

export function getAgentStats(): {
  active: number;
  completed: number;
  failed: number;
  totalRuns: number;
} {
  let active = 0;
  let completed = 0;
  let failed = 0;

  for (const session of sessions.values()) {
    if (session.status === "running") active++;
    else if (session.status === "completed") completed++;
    else if (session.status === "failed") failed++;
  }

  return { active, completed, failed, totalRuns: sessions.size };
}

export async function runAgent(
  taskTitle: string,
  prompt: string,
  taskId?: string,
  workdir?: string,
  providerId?: string
): Promise<string> {
  const id = `agent-${Date.now()}`;

  const session: AgentSession = {
    id,
    taskId,
    taskTitle,
    status: "running",
    startedAt: new Date().toISOString(),
    output: "",
  };

  const cwd = workdir ? path.join(DATA_DIR, workdir) : DATA_DIR;
  const launch = getOneShotLaunchSpec({
    providerId,
    prompt,
    workdir: cwd,
  });
  const env = {
    ...process.env,
    PATH: RUNTIME_PATH,
  };
  const proc =
    process.platform === "win32"
      ? spawn(buildWindowsShellCommand(launch.command, launch.args), {
          cwd,
          env,
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn(launch.command, launch.args, {
          cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });

  session.process = proc;
  sessions.set(id, session);

  proc.stdout?.on("data", (data: Buffer) => {
    session.output += data.toString();
  });

  proc.stderr?.on("data", (data: Buffer) => {
    session.output += data.toString();
  });

  proc.on("close", (code: number | null) => {
    session.status = code === 0 ? "completed" : "failed";
    session.completedAt = new Date().toISOString();
    delete session.process;

    // Auto-summarize on completion if linked to a task
    if (code === 0 && taskId) {
      autoSummarize(session).catch(() => {});
    }
  });

  proc.on("error", () => {
    session.status = "failed";
    session.completedAt = new Date().toISOString();
    delete session.process;
  });

  return id;
}

async function autoSummarize(session: AgentSession): Promise<void> {
  try {
    // Get recent git diff
    const diffProc = spawn("git", ["diff", "HEAD~1", "--stat"], {
      cwd: DATA_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let diffOutput = "";
    diffProc.stdout?.on("data", (d: Buffer) => { diffOutput += d.toString(); });
    await new Promise<void>((resolve) => diffProc.on("close", () => resolve()));

    if (diffOutput.trim()) {
      session.output += `\n\n--- Auto-Summary ---\nFiles changed:\n${diffOutput}`;
    }
  } catch {
    // ignore summarize errors
  }
}

export function stopAgent(id: string): boolean {
  const session = sessions.get(id);
  if (!session || !session.process) return false;

  session.process.kill();
  session.status = "failed";
  session.completedAt = new Date().toISOString();
  delete session.process;
  return true;
}

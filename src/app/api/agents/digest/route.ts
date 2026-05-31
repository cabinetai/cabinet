import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { runOneShotProviderPrompt } from "@/lib/agents/provider-runtime";
import { listConversationMetas } from "@/lib/agents/conversation-store";

export async function POST() {
  try {
    // Get yesterday's git activity
    let gitLog = "";
    try {
      const gitProc = await new Promise<string>((resolve, reject) => {
        const proc = spawn("git", ["log", "--since=yesterday", "--oneline", "--stat"], {
          cwd: DATA_DIR,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let out = "";
        proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
        proc.on("close", () => resolve(out));
        proc.on("error", reject);
      });
      gitLog = gitProc;
    } catch {
      gitLog = "No git history available.";
    }

    // Pull recent conversations as the source of truth for tasks.
    // Replaces the retired data/tasks/board.yaml reader.
    let taskInfo = "";
    try {
      const conversations = await listConversationMetas({ limit: 200 });
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recent = conversations.filter((c) => {
        const ts = new Date(c.lastActivityAt ?? c.startedAt ?? 0).getTime();
        return ts >= dayAgo;
      });
      const done = recent.filter((c) => c.doneAt && !c.archivedAt).map((c) => c.title);
      const inProgress = recent
        .filter((c) => !c.doneAt && !c.archivedAt && (c.status === "running" || c.awaitingInput))
        .map((c) => c.title);
      taskInfo =
        `Done tasks: ${done.length ? done.join(", ") : "none"}\n` +
        `In progress: ${inProgress.length ? inProgress.join(", ") : "none"}`;
    } catch {
      taskInfo = "No task data available.";
    }

    const prompt = `Generate a brief daily digest for the Cabinet knowledge base.

Yesterday's git activity:
${gitLog || "No changes recorded."}

Task status:
${taskInfo}

Format the digest as a concise markdown summary with:
- Key changes (what was added/modified)
- Task progress
- Any notable items

Keep it under 200 words. Be specific about what changed.`;

    const result = await runOneShotProviderPrompt({
      prompt,
      cwd: DATA_DIR,
      timeoutMs: 60_000,
    });

    return NextResponse.json({ ok: true, digest: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

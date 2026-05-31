import path from "path";
import { DATA_DIR } from "@/lib/storage/path-utils";
import {
  readPersona,
  readMemory,
  writeMemory,
  readInbox,
  clearInbox,
  recordHeartbeat,
  markHeartbeatRunning,
  markHeartbeatComplete,
  getHeartbeatHistory,
  type AgentPersona,
} from "./persona-manager";
import { renderPersonaBody } from "./persona-templating";
import { readCabinetReferenceByPath } from "@/lib/cabinets/overview";
import { readUserProfile } from "@/lib/user/profile-io";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";

async function buildPersonaPromptBody(persona: AgentPersona): Promise<string> {
  const cabinetPath = persona.cabinetPath || ROOT_CABINET_PATH;
  let cabinetName: string | undefined;
  let cabinetSlug: string | undefined;
  try {
    const ref = await readCabinetReferenceByPath(cabinetPath);
    cabinetName = ref?.name;
    cabinetSlug = ref?.id;
  } catch {
    /* fall through — leave placeholders intact */
  }
  let userName: string | undefined;
  try {
    const profile = await readUserProfile();
    const raw = (profile.displayName || profile.name || "").trim();
    if (raw && raw.toLowerCase() !== "you") userName = raw;
  } catch {
    /* fall through */
  }
  return renderPersonaBody(persona.body, {
    cabinet: { name: cabinetName, slug: cabinetSlug, path: cabinetPath },
    user: { name: userName },
    agent: { name: persona.name, slug: persona.slug },
    today: new Date().toISOString().slice(0, 10),
  });
}
import { readFileContent, fileExists } from "@/lib/storage/fs-operations";
import { autoCommit } from "@/lib/git/git-service";
import { postMessage } from "./slack-manager";
import { getGoalState, updateGoal } from "./goal-manager";
import { startConversationRun } from "./conversation-runner";
import { reloadDaemonSchedules } from "./daemon-client";
import { getDaemonUrl, getOrCreateDaemonToken } from "./daemon-auth";
import {
  defaultAdapterTypeForProvider,
  resolveExecutionProviderId,
} from "./adapters";

interface HeartbeatContext {
  prompt: string;
  persona: AgentPersona;
  inbox: Array<{ from: string; timestamp: string; message: string }>;
  cwd: string;
  startTime: number;
}

async function buildHeartbeatContext(slug: string, cabinetPath?: string): Promise<HeartbeatContext | null> {
  const startTime = Date.now();
  const persona = await readPersona(slug, cabinetPath);
  if (!persona || !persona.active) return null;

  const context = await readMemory(slug, "context.md", cabinetPath);
  const decisions = await readMemory(slug, "decisions.md", cabinetPath);
  const learnings = await readMemory(slug, "learnings.md", cabinetPath);

  const inbox = await readInbox(slug, cabinetPath);
  const inboxText = inbox.length > 0
    ? inbox.map((m) => `**From ${m.from}** (${m.timestamp}):\n${m.message}`).join("\n\n---\n\n")
    : "(no new messages)";

  let focusContext = "";
  for (const focusPath of persona.focus) {
    const indexPath = path.join(DATA_DIR, focusPath, "index.md");
    if (await fileExists(indexPath)) {
      const content = await readFileContent(indexPath);
      focusContext += `\n### ${focusPath}\n${content.slice(0, 500)}...\n`;
    }
  }

  let goalsContext = "";
  if (persona.goals && persona.goals.length > 0) {
    const goalState = await getGoalState(slug);
    goalsContext = persona.goals.map((g) => {
      const state = goalState[g.metric];
      const current = state?.current ?? g.current ?? 0;
      const pct = g.target > 0 ? Math.round((current / g.target) * 100) : 0;
      return `- **${g.metric}**: ${current}/${g.target} ${g.unit} (${pct}%)`;
    }).join("\n");
  }

  let tasksContext = "";
  try {
    const { getTasksForAgent } = await import("./task-inbox");
    const pendingTasks = await getTasksForAgent(slug, "pending", cabinetPath);
    const inProgressTasks = await getTasksForAgent(slug, "in_progress", cabinetPath);
    const allActive = [...pendingTasks, ...inProgressTasks];
    if (allActive.length > 0) {
      tasksContext = allActive.map((t) =>
        `- [${t.status.toUpperCase()}] **${t.title}** (from ${t.fromName || t.fromAgent}, priority ${t.priority})${t.description ? `: ${t.description}` : ""}`
      ).join("\n");
    }
  } catch { /* ignore */ }

  const personaBody = await buildPersonaPromptBody(persona);
  const prompt = `${personaBody}

---

## Your Memory (from previous heartbeats)

### Recent Context
${context || "(no previous context)"}

### Key Decisions
${decisions || "(no decisions logged yet)"}

### Learnings
${learnings || "(no learnings yet)"}

---

## Inbox (messages from other agents)
${inboxText}

---

## Focus Areas (recent state)
${focusContext || "(no focus areas configured)"}

---

## Goal Progress
${goalsContext || "(no goals configured)"}

---

## Task Inbox (tasks from other agents)
${tasksContext || "(no pending tasks)"}

---

## Instructions for this heartbeat

1. Review your focus areas, inbox messages, and goal progress
2. Review goal progress and determine what actions to take
3. Take action: edit KB pages, run jobs, create/update tasks, or send messages to other agents
4. At the END of your response, include a structured section like this:

\`\`\`memory
CONTEXT_UPDATE: One paragraph summarizing what you did this heartbeat and key observations.
DECISION: (optional) Any key decision made, with reasoning.
LEARNING: (optional) Any new insight to remember long-term.
GOAL_UPDATE [metric_name]: +N (report progress on goals, e.g. GOAL_UPDATE [reddit_replies]: +3)
MESSAGE_TO [agent-slug]: (optional) A message to send to another agent.
SLACK [channel-name]: (optional) A message to post to Agent Slack. Use this to report your activity.
TASK_CREATE [target-agent-slug] [priority 1-5]: title | description (optional — create a structured task handoff to another agent)
TASK_COMPLETE [task-id]: result summary (mark a pending task as completed)
\`\`\`

REQUIRED: also include a second block at the very end. A heartbeat without this
block is treated as incomplete and you will be asked to emit it again.

\`\`\`cabinet
SUMMARY: One short summary line of what happened. (always required)
CONTEXT: Optional lightweight context summary to remember later.
ARTIFACT: relative/path/to/created-or-updated-kb-file
\`\`\`

Emit one ARTIFACT: line per file you created or updated. Do not combine multiple files on a single ARTIFACT: line.
If you did not create or modify any file this heartbeat, still emit exactly one line \`ARTIFACT: none\` so the block is well-formed.

Now execute your heartbeat. Check your focus areas, process inbox, review goals, and take action.`;

  const baseCwd = cabinetPath ? path.join(DATA_DIR, cabinetPath) : DATA_DIR;
  const cwd = persona.workdir === "/data" || persona.workdir === "/"
    ? baseCwd
    : path.join(baseCwd, persona.workdir.replace(/^\/+/, ""));
  return { prompt, persona, inbox, cwd, startTime };
}

async function processHeartbeatOutput(
  slug: string,
  output: string,
  status: "completed" | "failed",
  persona: AgentPersona,
  inbox: Array<{ from: string; timestamp: string; message: string }>,
  startTime: number,
  cabinetPath?: string,
): Promise<void> {
  // Parse memory block from output
  const memoryMatch = output.match(/```memory\n([\s\S]*?)```/);
  if (memoryMatch) {
    const memoryBlock = memoryMatch[1];

    const contextUpdate = memoryBlock.match(/CONTEXT_UPDATE:\s*(.*)/);
    if (contextUpdate) {
      const timestamp = new Date().toISOString();
      const entry = `\n\n## ${timestamp}\n${contextUpdate[1].trim()}`;
      const existingContext = await readMemory(slug, "context.md", cabinetPath);
      const entries = existingContext.split(/\n## \d{4}-/).filter(Boolean);
      const trimmed = entries.slice(-19).map((e, i) => i === 0 ? e : `## ${e.startsWith("20") ? "" : ""}${e}`).join("\n");
      await writeMemory(slug, "context.md", trimmed + entry, cabinetPath);
    }

    const decision = memoryBlock.match(/DECISION:\s*(.*)/);
    if (decision && decision[1].trim()) {
      const timestamp = new Date().toISOString();
      const existingDecisions = await readMemory(slug, "decisions.md", cabinetPath);
      await writeMemory(slug, "decisions.md",
        existingDecisions + `\n\n## ${timestamp}\n${decision[1].trim()}`, cabinetPath
      );
    }

    const learning = memoryBlock.match(/LEARNING:\s*(.*)/);
    if (learning && learning[1].trim()) {
      const timestamp = new Date().toISOString();
      const existingLearnings = await readMemory(slug, "learnings.md", cabinetPath);
      await writeMemory(slug, "learnings.md",
        existingLearnings + `\n\n## ${timestamp}\n${learning[1].trim()}`, cabinetPath
      );
    }

    const messageMatches = memoryBlock.matchAll(/MESSAGE_TO\s+\[([^\]]+)\]:\s*(.*)/g);
    for (const match of messageMatches) {
      const { sendMessage } = await import("./persona-manager");
      await sendMessage(slug, match[1], match[2].trim(), cabinetPath);
    }

    const slackMatches = memoryBlock.matchAll(/SLACK\s+\[([^\]]+)\]:\s*(.*)/g);
    for (const match of slackMatches) {
      await postMessage({
        channel: match[1],
        agent: slug,
        emoji: persona.emoji,
        displayName: persona.name,
        type: "message",
        content: match[2].trim(),
        mentions: [],
        kbRefs: [],
      });
    }

    const goalMatches = memoryBlock.matchAll(/GOAL_UPDATE\s+\[([^\]]+)\]:\s*\+?(\d+)/g);
    for (const match of goalMatches) {
      const metric = match[1].trim();
      const increment = parseInt(match[2], 10);
      if (increment > 0) await updateGoal(slug, metric, increment);
    }

    const taskMatches = memoryBlock.matchAll(/TASK_CREATE\s+\[([^\]]+)\]\s*\[?(\d)?\]?:\s*([^|]+)(?:\|\s*(.*))?/g);
    for (const match of taskMatches) {
      const { createTask } = await import("./task-inbox");
      const toAgent = match[1].trim();
      const priority = match[2] ? parseInt(match[2], 10) : 3;
      const title = match[3].trim();
      const description = match[4]?.trim() || "";
      await createTask({
        fromAgent: slug, fromEmoji: persona.emoji, fromName: persona.name,
        toAgent, channel: persona.channels?.[0] || "general",
        title, description, kbRefs: [], priority,
        cabinetPath,
      });
      await postMessage({
        channel: persona.channels?.[0] || "general",
        agent: slug, emoji: persona.emoji, displayName: persona.name,
        type: "task",
        content: `📋 Task created for **@${toAgent}**: ${title}${description ? ` — ${description}` : ""}`,
        mentions: [toAgent], kbRefs: [],
      });
    }

    const taskCompleteMatches = memoryBlock.matchAll(/TASK_COMPLETE\s+\[([^\]]+)\]:\s*(.*)/g);
    for (const match of taskCompleteMatches) {
      const { updateTask } = await import("./task-inbox");
      await updateTask(
        slug,
        match[1].trim(),
        { status: "completed", result: match[2].trim() },
        cabinetPath
      );
    }
  }

  // Floor alerts
  if (persona.goals && persona.goals.length > 0) {
    const goalState = await getGoalState(slug);
    for (const g of persona.goals) {
      if (g.floor !== undefined && g.floor > 0) {
        const state = goalState[g.metric];
        const current = state?.current ?? g.current ?? 0;
        if (current < g.floor) {
          const periodEnd = state?.period_end;
          if (periodEnd) {
            const endDate = new Date(periodEnd).getTime();
            const periodStart = state?.period_start;
            const startDate = periodStart ? new Date(periodStart).getTime() : endDate - 7 * 86400000;
            const elapsed = Date.now() - startDate;
            if (elapsed / (endDate - startDate) >= 0.8) {
              await postMessage({
                channel: "alerts", agent: slug, emoji: persona.emoji, displayName: persona.name,
                type: "alert",
                content: `**${g.metric}** at ${current}/${g.target} (floor: ${g.floor}) with ${Math.round(((endDate - Date.now()) / 86400000))}d left. @human`,
                mentions: ["human"], kbRefs: [],
              });
            }
          }
        }
      }
    }
  }

  // Auto-post to channel
  if (status === "completed" && persona.channels && persona.channels.length > 0) {
    const summaryLine = output.slice(0, 300).split("\n")[0] || "Heartbeat completed";
    await postMessage({
      channel: persona.channels[0], agent: slug, emoji: persona.emoji, displayName: persona.name,
      type: "report", content: summaryLine, mentions: [], kbRefs: [],
    });
  }

  if (inbox.length > 0 && status === "completed") await clearInbox(slug, cabinetPath);

  const duration = Date.now() - startTime;
  const timestamp = new Date().toISOString();
  await recordHeartbeat({ agentSlug: slug, timestamp, duration, status, summary: output.slice(0, 500), cabinetPath });

  // Auto-generate workspace index
  try {
    const fs = await import("fs/promises");
    const agentsDir = cabinetPath ? path.join(DATA_DIR, cabinetPath, ".agents") : path.join(DATA_DIR, ".agents");
    const wsDir = path.join(agentsDir, slug, "workspace");
    const stats = await fs.stat(wsDir).catch(() => null);
    if (stats?.isDirectory()) {
      const entries = await fs.readdir(wsDir, { withFileTypes: true });
      const files = entries.filter((e) => !e.name.startsWith(".") && e.name !== "index.md");
      if (files.length > 0) {
        const indexPath = path.join(wsDir, "index.md");
        const exists = await fs.stat(indexPath).catch(() => null);
        if (!exists) {
          const fileList = files.map((f) => f.isDirectory() ? `- [${f.name}/](./${f.name}/)` : `- [${f.name}](./${f.name})`).join("\n");
          await fs.writeFile(indexPath, `---\ntitle: "${persona.name} — Workspace"\nmodified: "${timestamp}"\n---\n\n# ${persona.name} Workspace\n\n## Files\n${fileList}\n`, "utf-8");
        }
      }
    }
  } catch { /* ignore */ }

  markHeartbeatComplete(slug);

  // Auto-pause after 3 consecutive failures
  if (status === "failed") {
    const recentHistory = await getHeartbeatHistory(slug, undefined, cabinetPath);
    const lastThree = recentHistory.slice(0, 3);
    if (lastThree.length >= 3 && lastThree.every((h) => h.status === "failed")) {
      const { writePersona } = await import("./persona-manager");
      await writePersona(slug, { active: false });
      await reloadDaemonSchedules().catch(() => {});
      await postMessage({
        channel: "alerts", agent: slug, emoji: persona.emoji, displayName: persona.name,
        type: "alert",
        content: `Auto-paused after 3 consecutive failures. Last error: ${output.slice(0, 150)}. @human`,
        mentions: ["human"], kbRefs: [],
      });
    }
  }

  const commitPath = cabinetPath ? `${cabinetPath}/.agents/${slug}` : `.agents/${slug}`;
  autoCommit(commitPath, "Update");
}

/**
 * Run a heartbeat via daemon PTY — used by both cron scheduler and manual "Run Now".
 * Creates a PTY session so output is always visible and buffered.
 * Post-processing (memory updates, goal tracking etc.) runs in the background.
 *
 * Returns the sessionId (cron ignores it; frontend connects WebTerminal to it).
 * Returns null if the agent is inactive or over budget.
 */
export async function runHeartbeat(
  slug: string,
  cabinetPath?: string,
  scheduledAt?: string,
): Promise<string | null> {
  const ctx = await buildHeartbeatContext(slug, cabinetPath);
  if (!ctx) return null;
  const { prompt, persona, inbox, startTime, cwd } = ctx;

  if (persona.heartbeatsUsed !== undefined && persona.heartbeatsUsed >= persona.budget) {
    console.log(`Agent ${slug} has exceeded budget (${persona.heartbeatsUsed}/${persona.budget}). Skipping.`);
    return null;
  }

  markHeartbeatRunning(slug);

  try {
    const meta = await startConversationRun({
      agentSlug: slug,
      title: `${persona.name} heartbeat`,
      trigger: "heartbeat",
      prompt,
      adapterType:
        persona.adapterType ||
        defaultAdapterTypeForProvider(
          resolveExecutionProviderId({
            adapterType: persona.adapterType,
            providerId: persona.provider,
          })
        ),
      adapterConfig: persona.adapterConfig,
      providerId: resolveExecutionProviderId({
        adapterType: persona.adapterType,
        providerId: persona.provider,
      }),
      cabinetPath,
      scheduledAt,
      cwd,
      timeoutSeconds: 600,
      onComplete: async (completion) => {
        if (completion.status === "failed" && !completion.output) {
          await postMessage({
            channel: "alerts", agent: slug, emoji: persona.emoji, displayName: persona.name,
            type: "alert",
            content: `Heartbeat timed out or failed for ${slug}. @human`,
            mentions: ["human"], kbRefs: [],
          });
        }

        await processHeartbeatOutput(
          slug,
          completion.output,
          completion.status,
          persona,
          inbox,
          startTime,
          cabinetPath,
        );
      },
    });

    return meta.id;
  } catch (err) {
    console.error(`Failed to create daemon session for ${slug}:`, err);
    markHeartbeatComplete(slug);
    return null;
  }
}

/**
 * Start a manual heartbeat — thin wrapper over runHeartbeat.
 * Returns sessionId for the frontend to connect a WebTerminal to.
 */
export async function startManualHeartbeat(
  slug: string,
  cabinetPath?: string,
  scheduledAt?: string,
): Promise<string | null> {
  return runHeartbeat(slug, cabinetPath, scheduledAt);
}

/**
 * Run a quick response to a human message in Agent Slack.
 * Lightweight variant of runHeartbeat — focused on responding to the human,
 * not executing full jobs or heartbeat duties.
 *
 * Returns the agent's response text (also posted to Slack).
 */
export async function runQuickResponse(
  slug: string,
  humanMessage: string,
  channel: string,
): Promise<string> {
  const persona = await readPersona(slug);
  if (!persona) return "";

  // Load memory for context
  const context = await readMemory(slug, "context.md");
  const learnings = await readMemory(slug, "learnings.md");

  // Load goal state for context
  let goalsContext = "";
  if (persona.goals && persona.goals.length > 0) {
    const goalState = await getGoalState(slug);
    goalsContext = persona.goals
      .map((g) => {
        const state = goalState[g.metric];
        const current = state?.current ?? g.current ?? 0;
        const pct = g.target > 0 ? Math.round((current / g.target) * 100) : 0;
        return `- **${g.metric}**: ${current}/${g.target} ${g.unit} (${pct}%)`;
      })
      .join("\n");
  }

  // Load recent Slack messages from this channel for conversation context
  let recentMessages = "";
  try {
    const { getMessages } = await import("./slack-manager");
    const msgs = await getMessages(channel, 10);
    if (msgs.length > 0) {
      recentMessages = msgs
        .map(
          (m) =>
            `${m.displayName || m.agent} (${new Date(m.timestamp).toLocaleTimeString()}): ${m.content.slice(0, 200)}`,
        )
        .join("\n");
    }
  } catch {
    /* ignore */
  }

  const personaBody = await buildPersonaPromptBody(persona);
  const prompt = `${personaBody}

---

## Context

You are responding to a human message in Agent Slack channel #${channel}.
Keep your response concise, helpful, and on-topic. Do NOT include any \`\`\`memory blocks — this is a direct conversation, not a heartbeat.

### Your Memory (recent context)
${context ? context.slice(-1500) : "(no previous context)"}

### Your Learnings
${learnings ? learnings.slice(-800) : "(none yet)"}

### Goal Progress
${goalsContext || "(no goals configured)"}

### Recent conversation in #${channel}
${recentMessages || "(no recent messages)"}

---

## Human message (respond to this):
${humanMessage}

---

Respond naturally as ${persona.name}. Be concise (1-3 short paragraphs max). Reference specific data, KB pages, or workspace files when relevant. If asked about status or progress, reference your actual goal numbers.`;

  let response = "";
  try {
    const sessionId = `slack-${slug}-${Date.now()}`;
    const token = await getOrCreateDaemonToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    await fetch(`${getDaemonUrl()}/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: sessionId,
        args: ["--dangerously-skip-permissions", "-p", prompt, "--output-format", "text"],
      }),
    });

    const deadline = Date.now() + 120_000; // 2 min timeout
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`${getDaemonUrl()}/session/${sessionId}/output`, {
          headers,
        });
        if (res.ok) {
          const data = await res.json() as { status: string; output: string };
          if (data.status === "completed") { response = data.output; break; }
        }
      } catch { /* retry */ }
    }
  } catch (err) {
    response = err instanceof Error
      ? `Sorry, I encountered an error: ${err.message}`
      : "Sorry, I encountered an error processing your request.";
  }

  // Post the response to Slack
  if (response) {
    await postMessage({
      channel,
      agent: slug,
      emoji: persona.emoji,
      displayName: persona.name,
      type: "message",
      content: response,
      mentions: [],
      kbRefs: [],
    });
  }

  return response;
}

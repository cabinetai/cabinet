import { NextResponse } from "next/server";
import { listAllPersonas } from "@/lib/agents/persona-manager";
import { getGoalState } from "@/lib/agents/goal-manager";
import { getMessages } from "@/lib/agents/slack-manager";
import { getRespondingAgents } from "@/app/api/agents/slack/route";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { getRunningConversationCounts, drainConversationNotifications } from "@/lib/agents/conversation-store";

async function getDataDirVersion(): Promise<string> {
  try {
    const stat = await fs.stat(DATA_DIR);
    const entries = await fs.readdir(DATA_DIR, { recursive: false });

    // Also watch .agents dir so agent add/remove triggers a refresh
    let agentsSig = "";
    try {
      const agentsDir = path.join(DATA_DIR, ".agents");
      const agentStat = await fs.stat(agentsDir);
      const agentEntries = await fs.readdir(agentsDir);
      agentsSig = `${agentStat.mtimeMs}-${agentEntries.length}`;
    } catch { /* ignore if .agents doesn't exist yet */ }

    return `${stat.mtimeMs}-${entries.length}-${agentsSig}`;
  } catch {
    return "0";
  }
}

/**
 * GET /api/agents/events — Server-Sent Events for real-time Mission Control updates.
 * Pushes agent status, goal progress, and new Slack messages every 3 seconds.
 */
export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Track last known state for diffing
      let lastSlackCounts: Record<string, number> = {};
      let lastDataVersion = await getDataDirVersion();

      const tick = async () => {
        if (closed) return;

        try {
          // Gather current state
          const personas = await listAllPersonas();
          const registered = personas
            .filter((persona) => persona.active && persona.heartbeatEnabled && !!persona.heartbeat)
            .map((persona) => persona.slug);
          const runningCounts = await getRunningConversationCounts();

          // Agent statuses
          const agentStatuses = personas.map((p) => ({
            slug: p.slug,
            active: p.active,
            scheduled: registered.includes(p.slug),
            running: (runningCounts[p.slug] || 0) > 0,
            runningCount: runningCounts[p.slug] || 0,
            lastHeartbeat: p.lastHeartbeat,
            nextHeartbeat: p.nextHeartbeat,
          }));

          send("agent_status", agentStatuses);

          // Conversation start + completion notifications
          const drained = drainConversationNotifications();
          if (drained.length > 0) {
            const enriched = drained.map((n) => {
              const persona = personas.find(
                (p) =>
                  p.slug === n.agentSlug &&
                  (typeof n.cabinetPath !== "string" ||
                    !n.cabinetPath ||
                    p.cabinetPath === n.cabinetPath)
              ) || personas.find((p) => p.slug === n.agentSlug);
              return {
                ...n,
                agentName: persona?.name || n.agentSlug,
                agentEmoji: persona?.emoji || "🤖",
              };
            });

            const started = enriched.filter((n) => n.status === "running");
            const terminal = enriched.filter(
              (n) => n.status === "completed" || n.status === "failed"
            );

            if (started.length > 0) {
              send("conversation_started", started);
            }

            if (terminal.length > 0) {
              send("conversation_completed", terminal);

              // Agent just finished — it may have written KB files anywhere in
              // the tree. The shallow fs.stat diff at the bottom of this tick
              // only catches top-level mtime changes, so a file written into
              // e.g. data/have-fun/voldemort/ doesn't trip it. Force a
              // tree_changed so the sidebar refetches without F5.
              send("tree_changed", { reason: "conversation_completed" });
              lastDataVersion = await getDataDirVersion();
            }
          }

          // Goal progress (only for agents with goals) — parallelize reads.
          const personasWithGoals = personas.filter(
            (p) => p.goals && p.goals.length > 0
          );
          const goalStates = await Promise.all(
            personasWithGoals.map((p) => getGoalState(p.slug))
          );
          const goalUpdates = personasWithGoals.map((p, i) => {
            const state = goalStates[i];
            const goals: Record<string, { current: number; target: number }> = {};
            for (const g of p.goals!) {
              const s = state[g.metric];
              goals[g.metric] = {
                current: s?.current ?? g.current ?? 0,
                target: g.target,
              };
            }
            return { slug: p.slug, goals };
          });
          if (goalUpdates.length > 0) {
            send("goal_update", goalUpdates);
          }

          // New Slack messages — fetch all channels in parallel and reuse the
          // message list for both the count diff and the @human preview.
          const channels = ["general", "marketing", "engineering", "operations", "alerts"];
          const slackResults = await Promise.all(
            channels.map(async (ch) => {
              try {
                return { ch, msgs: await getMessages(ch, 1) };
              } catch {
                return { ch, msgs: [] };
              }
            })
          );
          const newSlackCounts: Record<string, number> = {};
          for (const { ch, msgs } of slackResults) {
            const count = msgs.length > 0 ? msgs.length : 0;
            newSlackCounts[ch] = count;
            if (
              lastSlackCounts[ch] !== undefined &&
              count > lastSlackCounts[ch]
            ) {
              const latest = msgs[msgs.length - 1];
              const hasHumanMention =
                latest?.content?.includes("@human") ||
                latest?.mentions?.includes("human");
              send("slack_activity", {
                channel: ch,
                hasHumanMention,
                agentName: latest?.displayName || latest?.agent,
                agentEmoji: latest?.emoji,
                preview: latest?.content?.slice(0, 120),
              });
            }
          }
          lastSlackCounts = newSlackCounts;

          // Pulse metrics summary
          const allGoals = personas.flatMap((p) => p.goals || []);
          const goalsOnTrack = allGoals.filter((g) => {
            if (g.target === 0) return true;
            return (g.current ?? 0) / g.target >= 0.4;
          }).length;

          // Responding agents (typing indicator for Slack)
          const responding = getRespondingAgents();
          const respondingList = [...responding.entries()].map(([slug, info]) => {
            const p = personas.find((a) => a.slug === slug);
            return {
              slug,
              channel: info.channel,
              emoji: p?.emoji || "🤖",
              name: p?.name || slug,
            };
          });
          // Always send — empty array clears the typing indicator
          send("agent_responding", respondingList);

          send("pulse", {
            totalAgents: personas.length,
            activeAgents: personas.filter((p) => p.active).length,
            scheduledAgents: registered.length,
            runningPlays: Object.values(runningCounts).reduce((sum, count) => sum + count, 0),
            goalsOnTrack,
            totalGoals: allGoals.length,
          });

          // Tree change detection — notify client to reload sidebar
          const currentDataVersion = await getDataDirVersion();
          if (currentDataVersion !== lastDataVersion) {
            lastDataVersion = currentDataVersion;
            send("tree_changed", {});
          }
        } catch {
          // Ignore errors in SSE tick
        }
      };

      // Initial tick
      await tick();

      // Poll every 3 seconds
      const interval = setInterval(tick, 3000);

      // Cleanup when client disconnects
      const cleanup = () => {
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      };

      // Auto-close after 5 minutes to prevent zombie connections
      setTimeout(cleanup, 5 * 60 * 1000);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

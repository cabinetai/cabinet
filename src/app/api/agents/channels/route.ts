import { NextRequest, NextResponse } from "next/server";
import {
  postMessage,
  getMessages,
  getRecentMessages,
  listChannels,
} from "@/lib/agents/channels-manager";
import { sendMessage, listPersonas } from "@/lib/agents/persona-manager";
import { sendNotification, shouldNotify } from "@/lib/agents/notification-service";
import { runQuickResponse } from "@/lib/agents/heartbeat";
import { setResponding, clearResponding } from "@/lib/agents/responding-state";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // Channels are per-room; scope every read to the requesting cabinet.
  const cabinetPath = searchParams.get("cabinetPath") || undefined;

  // List channels (always include defaults)
  if (searchParams.get("channels") === "true") {
    const existing = await listChannels(cabinetPath);
    const defaults = ["general", "marketing", "alerts"];
    const channels = [...new Set([...defaults, ...existing])];
    return NextResponse.json({ channels });
  }

  const channel = searchParams.get("channel");
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  // Get messages for specific channel or recent across all
  if (channel) {
    const messages = await getMessages(channel, limit, cabinetPath);
    return NextResponse.json({ messages });
  }

  const messages = await getRecentMessages(limit, cabinetPath);
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { channel, agent, type, content, mentions, kbRefs, emoji, displayName, thread } = body;
  const cabinetPath: string | undefined = body.cabinetPath || undefined;

  if (!channel || !content) {
    return NextResponse.json({ error: "channel and content required" }, { status: 400 });
  }

  await postMessage(
    {
      channel,
      agent: agent || "human",
      emoji: emoji || undefined,
      displayName: displayName || undefined,
      type: type || "message",
      content,
      mentions: mentions || [],
      kbRefs: kbRefs || [],
      ...(thread ? { thread } : {}),
    },
    cabinetPath
  );

  // Send external notifications for alerts and @human mentions
  if (shouldNotify(channel, content, mentions)) {
    sendNotification({
      title: type === "alert" ? "Agent Alert" : `Message in #${channel}`,
      message: content.slice(0, 300),
      agentName: displayName || agent,
      agentEmoji: emoji,
      channel,
      severity: type === "alert" ? "critical" : channel === "alerts" ? "warning" : "info",
    }).catch(() => {}); // Fire and forget
  }

  // Route @mentions from humans to agent inboxes AND trigger quick response
  if ((agent || "human") === "human") {
    const mentionedSlugs = extractMentions(content);
    const personas = await listPersonas(cabinetPath);
    const slugSet = new Set(personas.map((p) => p.slug));

    if (mentionedSlugs.length > 0) {
      // Specific @mentions — respond with the first mentioned agent
      for (const mentioned of mentionedSlugs) {
        if (slugSet.has(mentioned)) {
          await sendMessage("human", mentioned, `[#${channel}] ${content}`, cabinetPath);
        }
      }

      // Trigger a quick response from the first valid mentioned agent (fire-and-forget)
      const respondingSlug = mentionedSlugs.find((s) => slugSet.has(s));
      if (respondingSlug) {
        setResponding(respondingSlug, channel);
        runQuickResponse(respondingSlug, content, channel, cabinetPath)
          .catch(() => {})
          .finally(() => clearResponding(respondingSlug));
      }
    } else {
      // No specific @mention — route to the department lead for this channel
      // Channel name often matches a department (e.g., #marketing → marketing lead)
      const channelDeptMap: Record<string, string> = {
        general: "leadership",
        marketing: "marketing",
        engineering: "engineering",
        operations: "operations",
        alerts: "leadership",
      };
      const targetDept = channelDeptMap[channel];
      if (targetDept) {
        const lead = personas.find(
          (p) => p.department === targetDept && p.type === "lead"
        );
        if (lead) {
          setResponding(lead.slug, channel);
          runQuickResponse(lead.slug, content, channel, cabinetPath)
            .catch(() => {})
            .finally(() => clearResponding(lead.slug));
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Extract @agent-slug mentions from message content.
 * Matches @word-word patterns (agent slugs are kebab-case).
 */
function extractMentions(content: string): string[] {
  const matches = content.matchAll(/@([\w-]+)/g);
  return [...matches].map((m) => m[1]);
}

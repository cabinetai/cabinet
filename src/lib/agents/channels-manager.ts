import path from "path";
import fs from "fs/promises";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import {
  readFileContent,
  fileExists,
  ensureDirectory,
  listDirectory,
} from "@/lib/storage/fs-operations";
import type { ChannelMessage } from "@/types/agents";

// Channels are per-cabinet (per room): each cabinet keeps its own board under
// <cabinet>/.agents/.channels/<channel>.jsonl. The home/root cabinet (".")
// resolves to the data root. Pass the cabinetPath of the room being read or
// written; omit it for the home board.
function channelsDir(cabinetPath?: string): string {
  return path.join(resolveCabinetDir(cabinetPath), ".agents", ".channels");
}

// Older builds stored a single global board at <cabinet>/.agents/.slack. Rename
// it to .channels on first access (per cabinet), preserving history. Idempotent
// and race-safe: once .channels exists we never touch .slack again.
export async function initChannelsDir(cabinetPath?: string): Promise<void> {
  const dir = channelsDir(cabinetPath);
  if (!(await fileExists(dir))) {
    const legacy = path.join(resolveCabinetDir(cabinetPath), ".agents", ".slack");
    if (await fileExists(legacy)) {
      try {
        await fs.rename(legacy, dir);
        return;
      } catch {
        // raced with another writer / partially moved — fall through to ensure.
      }
    }
  }
  await ensureDirectory(dir);
}

export async function postMessage(
  msg: Omit<ChannelMessage, "id" | "timestamp">,
  cabinetPath?: string
): Promise<ChannelMessage> {
  await initChannelsDir(cabinetPath);

  const full: ChannelMessage = {
    ...msg,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  const channelFile = path.join(channelsDir(cabinetPath), `${full.channel}.jsonl`);
  const line = JSON.stringify(full) + "\n";
  await fs.appendFile(channelFile, line, "utf-8");

  return full;
}

export async function getMessages(
  channel: string,
  limit: number = 50,
  cabinetPath?: string
): Promise<ChannelMessage[]> {
  const channelFile = path.join(channelsDir(cabinetPath), `${channel}.jsonl`);
  if (!(await fileExists(channelFile))) return [];

  const raw = await readFileContent(channelFile);
  const lines = raw.trim().split("\n").filter(Boolean);

  const messages: ChannelMessage[] = [];
  for (const line of lines) {
    try {
      messages.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  // Sort oldest first (chronological order for chat display)
  messages.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  // Return the most recent N messages (tail of sorted array)
  return limit > 0 ? messages.slice(-limit) : messages;
}

export async function getRecentMessages(
  limit: number = 50,
  cabinetPath?: string
): Promise<ChannelMessage[]> {
  await initChannelsDir(cabinetPath);

  const channels = await listChannels(cabinetPath);
  const allMessages: ChannelMessage[] = [];

  for (const channel of channels) {
    const msgs = await getMessages(channel, 0, cabinetPath); // 0 = get all
    allMessages.push(...msgs);
  }

  allMessages.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  return limit > 0 ? allMessages.slice(-limit) : allMessages;
}

export async function listChannels(cabinetPath?: string): Promise<string[]> {
  await initChannelsDir(cabinetPath);

  const entries = await listDirectory(channelsDir(cabinetPath));
  return entries
    .filter((e) => !e.isDirectory && e.name.endsWith(".jsonl"))
    .map((e) => e.name.replace(/\.jsonl$/, ""));
}

export async function postSystemMessage(
  channel: string,
  content: string,
  cabinetPath?: string
): Promise<ChannelMessage> {
  return postMessage(
    {
      channel,
      agent: "system",
      type: "message",
      content,
      mentions: [],
      kbRefs: [],
    },
    cabinetPath
  );
}

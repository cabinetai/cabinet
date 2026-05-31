import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { readConversationMeta } from "@/lib/agents/conversation-store";
import { DATA_DIR } from "@/lib/storage/path-utils";

interface EventLine {
  ts?: string;
  type?: string;
  [key: string]: unknown;
}

/**
 * Return the append-only events.log for a conversation as an array of
 * parsed JSON objects. Used by the Logs tab in TaskConversationPage.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cabinetPath = req.nextUrl.searchParams.get("cabinetPath") || undefined;

  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const cp = meta.cabinetPath || cabinetPath;
  const logPath = cp
    ? path.join(DATA_DIR, cp, ".agents", ".conversations", id, "events.log")
    : path.join(DATA_DIR, ".agents", ".conversations", id, "events.log");

  let events: EventLine[] = [];
  try {
    const raw = await fs.readFile(logPath, "utf-8");
    events = raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as EventLine;
        } catch {
          return { raw: line };
        }
      });
  } catch {
    events = [];
  }

  return NextResponse.json({ events });
}

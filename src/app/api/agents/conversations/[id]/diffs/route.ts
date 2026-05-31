import { NextRequest, NextResponse } from "next/server";
import { readConversationMeta } from "@/lib/agents/conversation-store";
import { getPageHistory, getDiff } from "@/lib/git/git-service";

interface DiffEntry {
  path: string;
  commits: {
    hash: string;
    message: string;
    author: string;
    date: string;
    diff: string;
  }[];
}

/**
 * For each artifact path on the conversation, return git commits that fall
 * within the task's time window [startedAt, completedAt] and their diffs.
 * Powers the Diff tab in TaskConversationPage.
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

  const startMs = new Date(meta.startedAt).getTime();
  const endMs = meta.completedAt
    ? new Date(meta.completedAt).getTime() + 60 * 1000 // 60s slack
    : Date.now();

  const paths = meta.artifactPaths ?? [];
  const entries: DiffEntry[] = [];

  for (const artifactPath of paths) {
    if (artifactPath === "none") continue;
    const history = await getPageHistory(artifactPath);
    const relevant = history.filter((entry) => {
      const t = new Date(entry.date).getTime();
      return t >= startMs && t <= endMs;
    });

    if (relevant.length === 0) continue;

    const commits = await Promise.all(
      relevant.map(async (entry) => ({
        hash: entry.hash,
        message: entry.message,
        author: entry.author,
        date: entry.date,
        diff: await getDiff(entry.hash),
      }))
    );

    entries.push({ path: artifactPath, commits });
  }

  return NextResponse.json({ entries });
}

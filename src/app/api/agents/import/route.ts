import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import matter from "gray-matter";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { writePersona } from "@/lib/agents/persona-manager";
import { getDefaultProviderId } from "@/lib/agents/provider-runtime";

async function ensureDir(dir: string) {
  try { await fs.mkdir(dir, { recursive: true }); } catch { /* exists */ }
}

export async function POST(req: NextRequest) {
  try {
    const bundle = await req.json();

    if (!bundle.agent?.slug || !bundle.agent?.frontmatter) {
      return NextResponse.json({ error: "Invalid bundle format" }, { status: 400 });
    }

    let slug = bundle.agent.slug;
    const agentDir = path.join(DATA_DIR, ".agents", slug);
    try {
      await fs.access(path.join(agentDir, "persona.md"));
      slug = `${slug}-imported-${Date.now().toString(36).slice(-4)}`;
    } catch { /* doesn't exist, use original slug */ }

    const fm = bundle.agent.frontmatter;
    fm.active = false;
    await writePersona(slug, {
      name: fm.name || slug,
      role: fm.role || "",
      provider: fm.provider || getDefaultProviderId(),
      heartbeat: fm.heartbeat || "0 8 * * *",
      budget: fm.budget || 100,
      active: false,
      workdir: fm.workdir || "/data",
      focus: fm.focus || [],
      tags: fm.tags || [],
      emoji: fm.emoji || "🤖",
      department: fm.department || "general",
      type: fm.type || "specialist",
      goals: fm.goals || [],
      channels: fm.channels || ["general"],
      workspace: fm.workspace || "workspace",
      slug,
      body: bundle.agent.body || "",
    });

    const workspaceDir = path.join(DATA_DIR, ".agents", slug, "workspace");
    await ensureDir(workspaceDir);

    if (bundle.workspaceIndex) {
      const { data: wsFm, content: wsBody } = matter(bundle.workspaceIndex);
      wsFm.title = `${fm.name || slug} Workspace`;
      const newWsContent = matter.stringify(wsBody, wsFm);
      await fs.writeFile(path.join(workspaceDir, "index.md"), newWsContent, "utf-8");
    }

    await ensureDir(path.join(DATA_DIR, ".agents", ".memory", slug));
    await ensureDir(path.join(DATA_DIR, ".agents", slug, "workspace", "reports"));
    await ensureDir(path.join(DATA_DIR, ".agents", slug, "workspace", "data"));

    return NextResponse.json({
      success: true,
      slug,
      message: `Agent "${fm.name || slug}" imported successfully (paused by default).`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Import failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 500 },
    );
  }
}

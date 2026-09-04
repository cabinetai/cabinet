import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import matter from "gray-matter";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { readPersona } from "@/lib/agents/persona-manager";

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const persona = await readPersona(slug);
  if (!persona) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Read the raw agent markdown file
  const agentFile = path.join(DATA_DIR, ".agents", slug, "persona.md");
  let agentMd = "";
  try {
    agentMd = await fs.readFile(agentFile, "utf-8");
  } catch {
    return NextResponse.json({ error: "Agent file not found" }, { status: 404 });
  }

  const { data: frontmatter, content: body } = matter(agentMd);

  // Read workspace metadata if exists
  let workspaceIndex: string | null = null;
  const wsPath = path.join(DATA_DIR, ".agents", slug, "workspace", "workspace.md");
  try {
    workspaceIndex = await fs.readFile(wsPath, "utf-8");
  } catch { /* no workspace */ }

  const bundle = {
    version: 2,
    exportedAt: new Date().toISOString(),
    agent: {
      slug,
      frontmatter,
      body: body.trim(),
    },
    workspaceIndex,
  };

  return NextResponse.json(bundle, {
    headers: {
      "Content-Disposition": `attachment; filename="${slug}-agent-bundle.json"`,
    },
  });
}

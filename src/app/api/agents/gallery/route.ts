import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import matter from "gray-matter";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { listAllPersonas } from "@/lib/agents/persona-manager";

interface GalleryItem {
  name: string;
  type: "app" | "report" | "data" | "code" | "file";
  agent: string;
  agentEmoji: string;
  agentSlug: string;
  department: string;
  path: string;       // relative KB path for navigation
  modified: string;
  size?: number;
  preview?: string;   // first lines of markdown or description
}

async function scanWorkspace(
  dir: string,
  agentName: string,
  agentEmoji: string,
  agentSlug: string,
  department: string,
  basePath: string,
): Promise<GalleryItem[]> {
  const items: GalleryItem[] = [];

  let entries: { name: string; isDir: boolean }[];
  try {
    const dirEntries = await fs.readdir(dir, { withFileTypes: true });
    entries = dirEntries
      .filter((e) => !e.name.startsWith(".") && e.name !== ".gitkeep")
      .map((e) => ({ name: e.name, isDir: e.isDirectory() }));
  } catch {
    return items;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(basePath, entry.name);

    if (entry.isDir) {
      // Check if it's an app (has index.html)
      const hasHtml = await fileExists(path.join(fullPath, "index.html"));
      const hasApp = await fileExists(path.join(fullPath, ".app"));

      if (hasHtml) {
        const stat = await fs.stat(fullPath);
        items.push({
          name: entry.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          type: "app",
          agent: agentName,
          agentEmoji,
          agentSlug,
          department,
          path: relPath,
          modified: stat.mtime.toISOString(),
          preview: hasApp ? "Full-screen interactive app" : "Embedded web app",
        });
      } else {
        // Check for index.md (report directory)
        const hasMd = await fileExists(path.join(fullPath, "index.md"));
        if (hasMd) {
          const stat = await fs.stat(path.join(fullPath, "index.md"));
          const raw = await fs.readFile(path.join(fullPath, "index.md"), "utf-8");
          const { data: fm, content: bodyContent } = matter(raw);
          const title = (fm.title as string) || entry.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          const preview = bodyContent
            .split("\n")
            .filter((l) => l.trim() && !l.startsWith("#"))
            .slice(0, 2)
            .join(" ")
            .slice(0, 120);
          items.push({
            name: title,
            type: "report",
            agent: agentName,
            agentEmoji,
            agentSlug,
            department,
            path: relPath,
            modified: stat.mtime.toISOString(),
            preview: preview || "Report",
          });
        } else {
          // Recurse into subdirectory
          const subItems = await scanWorkspace(fullPath, agentName, agentEmoji, agentSlug, department, relPath);
          items.push(...subItems);
        }
      }
    } else {
      const stat = await fs.stat(fullPath);
      const ext = path.extname(entry.name).toLowerCase();

      let type: GalleryItem["type"] = "file";
      if ([".md"].includes(ext)) type = "report";
      else if ([".csv", ".json", ".yaml", ".yml"].includes(ext)) type = "data";
      else if ([".py", ".js", ".ts", ".sh"].includes(ext)) type = "code";
      else if ([".html"].includes(ext)) type = "app";

      // Skip gitkeep and tiny files
      if (stat.size < 10) continue;

      let preview: string | undefined;
      let displayName = entry.name;
      if (type === "report" && ext === ".md") {
        try {
          const raw = await fs.readFile(fullPath, "utf-8");
          const { data: fm, content: bodyContent } = matter(raw);
          if (fm.title) displayName = fm.title as string;
          preview = bodyContent
            .split("\n")
            .filter((l) => l.trim() && !l.startsWith("#"))
            .slice(0, 2)
            .join(" ")
            .slice(0, 120);
        } catch { /* ignore */ }
      }

      items.push({
        name: displayName,
        type,
        agent: agentName,
        agentEmoji,
        agentSlug,
        department,
        path: relPath,
        modified: stat.mtime.toISOString(),
        size: stat.size,
        preview,
      });
    }
  }

  return items;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const personas = await listAllPersonas();
    const allItems: GalleryItem[] = [];

    for (const persona of personas) {
      if (persona.slug === "editor") continue;

      // Globals live at `data/.global-agents/<slug>/workspace`, not under
      // any cabinet's .agents dir.
      const isGlobal = persona.scope === "global";
      const workspaceDir = isGlobal
        ? path.join(DATA_DIR, ".global-agents", persona.slug, "workspace")
        : path.join(
            DATA_DIR,
            persona.cabinetPath && persona.cabinetPath !== "." ? persona.cabinetPath : "",
            ".agents",
            persona.slug,
            "workspace"
          );
      const basePath = isGlobal
        ? `.global-agents/${persona.slug}/workspace`
        : persona.cabinetPath && persona.cabinetPath !== "."
          ? `${persona.cabinetPath}/.agents/${persona.slug}/workspace`
          : `.agents/${persona.slug}/workspace`;
      const items = await scanWorkspace(
        workspaceDir,
        persona.name,
        persona.emoji || "🤖",
        persona.slug,
        persona.department || "general",
        basePath,
      );
      allItems.push(...items);
    }

    // Sort by modified date, newest first
    allItems.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    return NextResponse.json({ items: allItems });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import matter from "gray-matter";
import { resolveAgentLibraryDir } from "@/lib/agents/library-manager";

export async function GET() {
  try {
    const libraryDir = await resolveAgentLibraryDir();
    if (!libraryDir) {
      return NextResponse.json({ templates: [] });
    }

    const entries = await fs.readdir(libraryDir, { withFileTypes: true });
    const templates = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const personaPath = path.join(libraryDir, entry.name, "persona.md");
      try {
        const raw = await fs.readFile(personaPath, "utf-8");
        const { data, content } = matter(raw);
        templates.push({
          slug: data.slug || entry.name,
          name: data.name || entry.name,
          emoji: data.emoji || "",
          type: data.type || "specialist",
          department: data.department || "general",
          role: data.role || "",
          description: content.trim().split("\n\n")[1] || "",
        });
      } catch {
        // Skip templates without valid persona.md
      }
    }

    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ templates: [] });
  }
}

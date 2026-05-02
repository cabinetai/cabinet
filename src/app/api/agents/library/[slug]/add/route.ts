import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import matter from "gray-matter";
import { ensureAgentScaffold } from "@/lib/agents/scaffold";
import { resolveAgentTemplateDir } from "@/lib/agents/library-manager";
import { normalizeCabinetPath } from "@/lib/cabinets/paths";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const cabinetPath = normalizeCabinetPath(
      typeof body.cabinetPath === "string" ? body.cabinetPath : undefined,
      true
    );
    const targetDir = path.join(resolveCabinetDir(cabinetPath), ".agents", slug);

    // Resolve the template via the shared library resolver so we hit the
    // seeded copy under DATA_DIR in Electron builds (where `src/` is pruned
    // by scripts/prepare-electron-package.mjs) and fall back to the source
    // tree in dev. Without this, `Add Agent` returns 404 in every Electron
    // release.
    const templateDir = await resolveAgentTemplateDir(slug);
    if (!templateDir) {
      return NextResponse.json(
        { error: `Template "${slug}" not found` },
        { status: 404 }
      );
    }

    // Check if agent already exists
    try {
      await fs.access(targetDir);
      return NextResponse.json(
        { error: `Agent "${slug}" already exists` },
        { status: 409 }
      );
    } catch {
      // Good — doesn't exist yet
    }

    // Copy template directory to active agents
    await copyDir(templateDir, targetDir);

    await ensureAgentScaffold(targetDir);

    // Promote `recommendedSkills` into active `skills` for fresh agents (C8).
    // The library template's `recommendedSkills:` are sensible defaults per
    // role; activating them on creation gives a "good first run" without
    // making the user open the Skills section to find what to attach. The
    // user can always deselect from the agent detail Skills section.
    const promoted = await promoteRecommendedSkills(path.join(targetDir, "persona.md"));

    return NextResponse.json(
      { ok: true, slug, cabinetPath, promotedSkills: promoted },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Read the freshly-copied persona.md, and if it has `recommendedSkills` and
 * `skills` is empty, write `skills = recommendedSkills` back. Returns the
 * promoted slugs (or [] if nothing changed). Best-effort: failures don't
 * block agent creation.
 */
async function promoteRecommendedSkills(personaPath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(personaPath, "utf-8");
    const parsed = matter(raw);
    const recommended = parsed.data.recommendedSkills;
    if (!Array.isArray(recommended) || recommended.length === 0) return [];
    const existing = parsed.data.skills;
    if (Array.isArray(existing) && existing.length > 0) return [];
    // Only auto-promote bare-string entries — those reference skills assumed
    // to already be in the local catalog (e.g. user-authored Cabinet skills).
    // Object-form entries with a `source` URL need an explicit install step,
    // so they stay in `recommendedSkills` for the UI's install-on-click flow.
    // Promoting them here would land them in `skills:` as orphans (referenced
    // but no bundle on disk).
    const cleanRecommended = recommended
      .map((v): string | null => {
        if (typeof v === "string" && v.trim()) return v.trim();
        return null;
      })
      .filter((v): v is string => v !== null);
    if (cleanRecommended.length === 0) return [];
    const nextData = { ...parsed.data, skills: cleanRecommended };
    const nextMd = matter.stringify(parsed.content, nextData);
    await fs.writeFile(personaPath, nextMd, "utf-8");
    return cleanRecommended;
  } catch {
    return [];
  }
}

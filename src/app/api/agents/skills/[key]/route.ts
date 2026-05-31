import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { readSkill } from "@/lib/agents/skills/loader";
import { readSkillsLock } from "@/lib/agents/skills/lock";
import {
  fetchAuditsForLockEntry,
  parseLockSource,
} from "@/lib/agents/skills/upstream";

interface RouteContext {
  params: Promise<{ key: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const { key } = await context.params;
  const url = new URL(request.url);
  const cabinetPath = url.searchParams.get("cabinet") || undefined;
  const bundle = await readSkill(key, { cabinetPath });
  if (!bundle) {
    return NextResponse.json({ error: "skill not found" }, { status: 404 });
  }
  const lock = await readSkillsLock();
  const lockEntry = lock.skills[key];
  const audits = lockEntry ? await fetchAuditsForLockEntry(key, lockEntry) : null;
  // Build the skills.sh path segment (`<owner>/<repo>/<skill>`) so the UI
  // can deep-link each audit pill to its full report. Null when the skill
  // wasn't installed from a github source we can resolve.
  const parsedSource = lockEntry ? parseLockSource(lockEntry) : null;
  const skillsShPath = parsedSource
    ? `${parsedSource.owner}/${parsedSource.repo}/${parsedSource.skill ?? key}`
    : null;
  return NextResponse.json({ skill: bundle, audits, skillsShPath });
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const { key } = await context.params;
  const url = new URL(request.url);
  const cabinetPath = url.searchParams.get("cabinet") || undefined;
  const bundle = await readSkill(key, { cabinetPath });
  if (!bundle) {
    return NextResponse.json({ error: "skill not found" }, { status: 404 });
  }
  if (!bundle.editable) {
    return NextResponse.json(
      { error: `skill is read-only (origin: ${bundle.origin})` },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    body?: string;
    frontmatter?: Record<string, unknown>;
  };

  const skillMdPath = path.join(bundle.path, "SKILL.md");
  const existingRaw = await fs.readFile(skillMdPath, "utf-8").catch(() => "");
  const existing = matter(existingRaw);
  const nextData = body.frontmatter
    ? { ...existing.data, ...body.frontmatter }
    : existing.data;
  const nextBody = body.body ?? existing.content;
  const written = matter.stringify(nextBody, nextData);
  await fs.writeFile(skillMdPath, written, "utf-8");

  const updated = await readSkill(key, { cabinetPath });
  return NextResponse.json({ skill: updated });
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  const { key } = await context.params;
  const url = new URL(request.url);
  const cabinetPath = url.searchParams.get("cabinet") || undefined;
  const bundle = await readSkill(key, { cabinetPath });
  if (!bundle) {
    return NextResponse.json({ error: "skill not found" }, { status: 404 });
  }
  if (!bundle.editable) {
    return NextResponse.json(
      { error: `skill is read-only (origin: ${bundle.origin}) — cannot delete from this surface` },
      { status: 403 },
    );
  }
  await fs.rm(bundle.path, { recursive: true, force: true });
  return NextResponse.json({ ok: true });
}

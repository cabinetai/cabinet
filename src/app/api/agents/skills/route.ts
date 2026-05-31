import { NextResponse } from "next/server";
import fs from "fs/promises";
import os from "os";
import path from "path";
import matter from "gray-matter";
import { listSkills, readSkill } from "@/lib/agents/skills/loader";
import { readSkillStats } from "@/lib/agents/skills/stats";
import { readSkillsLock } from "@/lib/agents/skills/lock";
import { fetchUpstreamForLock } from "@/lib/agents/skills/upstream";
import {
  cabinetPathFromScope,
  isValidSkillKey,
  resolveSkillsScopeRoot,
} from "@/lib/agents/skills/scope";

interface CreateRequest {
  key: string;
  name?: string;
  description?: string;
  body?: string;
  scope?: string; // "root" | "cabinet:<path>"  default: "root"
  allowedTools?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as CreateRequest;
  if (!body.key || !isValidSkillKey(body.key)) {
    return NextResponse.json(
      { error: "key is required and must be kebab-case (lowercase, digits, hyphens)" },
      { status: 400 },
    );
  }

  const scope = body.scope ?? "root";
  let destRoot: string;
  try {
    destRoot = resolveSkillsScopeRoot(scope);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid scope" },
      { status: 400 },
    );
  }

  const skillDir = path.join(destRoot, body.key);
  const exists = await fs.stat(skillDir).then(() => true).catch(() => false);
  if (exists) {
    return NextResponse.json({ error: "skill already exists" }, { status: 409 });
  }

  await fs.mkdir(skillDir, { recursive: true });
  const frontmatter: Record<string, unknown> = {
    name: body.name || body.key,
    description: body.description ?? "",
  };
  if (body.allowedTools) frontmatter["allowed-tools"] = body.allowedTools;

  const skillBody = body.body ?? `# ${body.name || body.key}\n\n${body.description ?? ""}\n`;
  const md = matter.stringify(skillBody, frontmatter);
  await fs.writeFile(path.join(skillDir, "SKILL.md"), md, "utf-8");

  const created = await readSkill(body.key, {
    cabinetPath: cabinetPathFromScope(scope),
  });
  return NextResponse.json({ skill: created }, { status: 201 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const cabinetPath = url.searchParams.get("cabinet") || undefined;
  const originsParam = url.searchParams.get("origins");
  const includeSystem = originsParam ? originsParam.split(",").includes("system") : true;
  const includeLinked = originsParam ? originsParam.split(",").includes("linked") : true;
  const includeLegacy = originsParam ? originsParam.split(",").includes("legacy") : true;

  const [skills, stats, lock] = await Promise.all([
    listSkills({
      cabinetPath,
      includeSystem,
      includeLinked,
      includeLegacy,
    }),
    readSkillStats(cabinetPath ?? null),
    readSkillsLock(),
  ]);

  // Upstream metadata (GitHub stars + skills.sh installs) for skills that
  // have a github source recorded in skills-lock.json. Skills authored
  // directly on disk lack a lock entry → upstream is null and the UI hides
  // the chip. Fetches are cached aggressively (24h stars, 1h installs).
  const upstream = await fetchUpstreamForLock(lock);

  // Decorate each entry with stats + upstream when we have them.
  const entries = skills.map((entry) => ({
    ...entry,
    stats: stats.skills[entry.key] ?? null,
    upstream: upstream.get(entry.key) ?? null,
  }));

  // Legacy clients consumed `{ root, skills, count }` where `skills[]` had
  // `{ slug, name, description, path }`. Preserve that surface, plus expose
  // the richer entries under `entries`.
  const home = process.env.HOME || os.homedir() || "/tmp";
  return NextResponse.json({
    root: path.join(home, ".cabinet", "skills"),
    count: skills.length,
    skills: skills.map((entry) => ({
      slug: entry.key,
      name: entry.name,
      description: entry.description ?? undefined,
      path: entry.path,
    })),
    entries,
  });
}

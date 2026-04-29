import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { readSkill } from "@/lib/agents/skills/loader";
import { updateSkillsLock } from "@/lib/agents/skills/lock";
import {
  isValidSkillKey,
  resolveSkillsScopeRoot,
} from "@/lib/agents/skills/scope";

interface RouteContext {
  params: Promise<{ key: string }>;
}

interface BundleRequest {
  scope?: string; // "root" | "cabinet:<path>"  default: "root"
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { key } = await context.params;
  if (!isValidSkillKey(key)) {
    return NextResponse.json({ error: "invalid skill key" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as BundleRequest;

  const source = await readSkill(key, {});
  if (!source) {
    return NextResponse.json({ error: "skill not found" }, { status: 404 });
  }
  if (source.origin === "cabinet-root" || source.origin === "cabinet-scoped") {
    return NextResponse.json(
      { error: "skill is already cabinet-managed", origin: source.origin },
      { status: 409 },
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
  await fs.mkdir(destRoot, { recursive: true });
  const dest = path.join(destRoot, key);
  await fs.rm(dest, { recursive: true, force: true });
  // Preserve symlinks rather than following them — keeps any deliberate
  // intra-bundle links intact and avoids exfiltrating link targets if the
  // host-installed bundle ever contains one pointing outside its own dir.
  await fs.cp(source.path, dest, { recursive: true, verbatimSymlinks: true });

  await updateSkillsLock(key, {
    source: source.path,
    sourceType: "local_path",
    ref: null,
    scope,
    installedAt: new Date().toISOString(),
    note: `bundled-into-cabinet from ${source.origin}`,
  });

  return NextResponse.json({ ok: true, key, scope, fromOrigin: source.origin });
}

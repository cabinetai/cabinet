import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "@/lib/storage/path-utils";
import {
  readPersona,
  writePersona,
  deletePersona,
  readMemory,
  writeMemory,
  listMemoryFiles,
  readInbox,
  sendMessage,
  getHeartbeatHistory,
} from "@/lib/agents/persona-manager";
import { getTemplateRecommendedSkills } from "@/lib/agents/library-manager";
import { startManualHeartbeat } from "@/lib/agents/heartbeat";
import { updateGoal, getGoalHistory } from "@/lib/agents/goal-manager";
import { reloadDaemonSchedules } from "@/lib/agents/daemon-client";

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);

  // Session output retrieval
  const sessionTs = searchParams.get("session");
  if (sessionTs) {
    const sessionsDir = path.join(DATA_DIR, ".agents", slug, "sessions");
    const sessionFile = path.join(sessionsDir, `${sessionTs.replace(/[:.]/g, "-")}.txt`);
    // Validate path stays within sessions dir
    if (!sessionFile.startsWith(sessionsDir)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    try {
      const output = await fs.readFile(sessionFile, "utf-8");
      return NextResponse.json({ output });
    } catch {
      return NextResponse.json({ output: null });
    }
  }

  const cabinetPath = searchParams.get("cabinetPath") || undefined;

  const persona = await readPersona(slug, cabinetPath);
  if (!persona) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Enrich `recommendedSkills` with the library template's recommendations
  // when the agent slug matches a known template — covers the case where an
  // agent was created before the template's `recommendedSkills` field was
  // populated, so the on-disk persona is missing them. The persona's own
  // entries take precedence on key collision.
  const templateRecs = await getTemplateRecommendedSkills(slug);
  if (templateRecs.length > 0) {
    const personaRecs = persona.recommendedSkills ?? [];
    const seen = new Set(personaRecs.map((r) => r.key));
    const merged = [...personaRecs];
    for (const rec of templateRecs) {
      if (!seen.has(rec.key)) {
        merged.push(rec);
        seen.add(rec.key);
      }
    }
    persona.recommendedSkills = merged;
  }

  const memoryFiles = await listMemoryFiles(slug, cabinetPath);
  const memory: Record<string, string> = {};
  for (const file of memoryFiles) {
    if (file.endsWith(".md")) {
      memory[file] = await readMemory(slug, file, cabinetPath);
    }
  }

  const inbox = await readInbox(slug, cabinetPath);
  const history = await getHeartbeatHistory(slug, undefined, cabinetPath);
  const goalHistory = await getGoalHistory(slug);

  return NextResponse.json({ persona, memory, inbox, history, goalHistory });
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const body = await req.json();
  const cabinetPath = typeof body.cabinetPath === "string" ? body.cabinetPath : undefined;

  // Handle different update types
  if (body.action === "toggle") {
    const persona = await readPersona(slug, cabinetPath);
    if (!persona) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await writePersona(slug, { active: !persona.active }, cabinetPath);
    await reloadDaemonSchedules().catch(() => {});
    return NextResponse.json({ ok: true, active: !persona.active });
  }

  if (body.action === "run") {
    const scheduledAt =
      typeof body.scheduledAt === "string" ? body.scheduledAt : undefined;
    const sessionId = await startManualHeartbeat(slug, cabinetPath, scheduledAt);
    if (!sessionId) {
      return NextResponse.json({ ok: false, message: "Agent inactive or over budget" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, sessionId });
  }

  if (body.action === "updateMemory") {
    await writeMemory(slug, body.file, body.content, cabinetPath);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "sendMessage") {
    await sendMessage(slug, body.to, body.message, cabinetPath);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "updateGoal") {
    const result = await updateGoal(slug, body.metric, body.increment || 1);
    return NextResponse.json({ ok: true, goal: result });
  }

  // Default: update persona
  await writePersona(slug, body, cabinetPath);
  await reloadDaemonSchedules().catch(() => {});
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const cabinetPath = req.nextUrl.searchParams.get("cabinetPath") || undefined;
  await deletePersona(slug, cabinetPath);
  await reloadDaemonSchedules().catch(() => {});
  return NextResponse.json({ ok: true });
}

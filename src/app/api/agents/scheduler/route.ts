import { NextRequest, NextResponse } from "next/server";
import {
  listAllPersonas,
  writePersona,
} from "@/lib/agents/persona-manager";
import { reloadDaemonSchedules } from "@/lib/agents/daemon-client";

/**
 * GET /api/agents/scheduler — Get scheduler status
 */
export async function GET() {
  const personas = await listAllPersonas();
  const registered = personas
    .filter((persona) => persona.active && persona.heartbeatEnabled && !!persona.heartbeat)
    .map((persona) => ({
      slug: persona.slug,
      cabinetPath: persona.cabinetPath,
      scopedId: `${persona.cabinetPath || "."}::agent::${persona.slug}`,
    }));

  const active = personas.filter((p) => p.active);
  const paused = personas.filter((p) => !p.active);

  return NextResponse.json({
    status: registered.length > 0 ? "running" : "stopped",
    scheduledAgents: registered,
    totalAgents: personas.length,
    activeCount: active.length,
    pausedCount: paused.length,
    agents: personas.map((p) => ({
      slug: p.slug,
      cabinetPath: p.cabinetPath,
      scopedId: `${p.cabinetPath || "."}::agent::${p.slug}`,
      name: p.name,
      emoji: p.emoji,
      active: p.active,
      scheduled: registered.some(
        (agent) =>
          agent.slug === p.slug && agent.cabinetPath === p.cabinetPath
      ),
      heartbeat: p.heartbeat,
      lastHeartbeat: p.lastHeartbeat,
      nextHeartbeat: p.nextHeartbeat,
    })),
  });
}

/**
 * POST /api/agents/scheduler — Control the scheduler
 * body.action: "start-all" | "stop-all" | "activate" | "pause"
 * body.slugs?: string[] — specific agents to activate/pause (default: all)
 * body.exclude?: string[] — agents to exclude from bulk operations
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, slugs, exclude = [], cabinetPath } = body;

  const allPersonas = await listAllPersonas();

  // When cabinetPath is provided, scope operations to that cabinet only (no sub-cabinets)
  const personas = cabinetPath
    ? allPersonas.filter((p) => (p.cabinetPath || ".") === cabinetPath)
    : allPersonas;

  switch (action) {
    case "start-all": {
      // Activate and register agents (except excluded ones)
      const toActivate = personas.filter(
        (p) => !p.active && !exclude.includes(p.slug)
      );
      for (const p of toActivate) {
        await writePersona(p.slug, { active: true }, p.cabinetPath);
      }
      await reloadDaemonSchedules().catch(() => {});
      const newRegistered = personas
        .filter((p) => (p.active || toActivate.some((agent) => agent.slug === p.slug)) && !exclude.includes(p.slug))
        .map((p) => p.slug);
      return NextResponse.json({
        ok: true,
        activated: toActivate.length,
        totalScheduled: newRegistered.length,
      });
    }

    case "stop-all": {
      // Pause and unregister agents
      const toPause = personas.filter((p) => p.active);
      for (const p of toPause) {
        await writePersona(p.slug, { active: false }, p.cabinetPath);
      }
      await reloadDaemonSchedules().catch(() => {});
      return NextResponse.json({ ok: true, paused: toPause.length });
    }

    case "pause-heartbeats": {
      // Disable heartbeats only — leaves agent.active alone so other
      // routines keep firing. Used by the "Pause all heartbeats" button.
      const toPause = personas.filter((p) => p.heartbeatEnabled !== false);
      for (const p of toPause) {
        await writePersona(p.slug, { heartbeatEnabled: false }, p.cabinetPath);
      }
      await reloadDaemonSchedules().catch(() => {});
      return NextResponse.json({ ok: true, paused: toPause.length });
    }

    case "resume-heartbeats": {
      const toResume = personas.filter((p) => p.heartbeatEnabled === false);
      for (const p of toResume) {
        await writePersona(p.slug, { heartbeatEnabled: true }, p.cabinetPath);
      }
      await reloadDaemonSchedules().catch(() => {});
      return NextResponse.json({ ok: true, resumed: toResume.length });
    }

    case "activate": {
      // Activate specific agents
      const targetSlugs = slugs || [];
      let count = 0;
      for (const slug of targetSlugs) {
        const p = personas.find((pp) => pp.slug === slug);
        if (p && !p.active) {
          await writePersona(slug, { active: true }, p.cabinetPath);
          count++;
        }
      }
      await reloadDaemonSchedules().catch(() => {});
      return NextResponse.json({ ok: true, activated: count });
    }

    case "pause": {
      // Pause specific agents
      const targetSlugs = slugs || [];
      let count = 0;
      for (const slug of targetSlugs) {
        const p = personas.find((pp) => pp.slug === slug);
        if (p && p.active) {
          await writePersona(slug, { active: false }, p.cabinetPath);
          count++;
        }
      }
      await reloadDaemonSchedules().catch(() => {});
      return NextResponse.json({ ok: true, paused: count });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { normalizeCabinetPath } from "@/lib/cabinets/paths";
import {
  GLOBAL_AGENTS_DIR,
  listPersonas,
  readPersona,
  writePersona,
} from "@/lib/agents/persona-manager";
import { reloadDaemonSchedules } from "@/lib/agents/daemon-client";
import { getRunningConversationCounts } from "@/lib/agents/conversation-store";
import { ensureAgentScaffold } from "@/lib/agents/scaffold";
import { defaultAdapterTypeForProvider } from "@/lib/agents/adapters";
import { getDefaultProviderId } from "@/lib/agents/provider-runtime";

// Initialize heartbeats on first request
let initialized = false;

export async function GET(req: NextRequest) {
  if (!initialized) {
    await reloadDaemonSchedules().catch(() => {});
    initialized = true;
  }

  const cabinetPath = normalizeCabinetPath(
    req.nextUrl.searchParams.get("cabinetPath"),
    false
  );
  const personas = await listPersonas(cabinetPath);
  const activeHeartbeats = personas
    .filter((persona) => persona.active && persona.heartbeatEnabled && !!persona.heartbeat)
    .map((persona) => persona.slug);
  const runningCounts = await getRunningConversationCounts();

  return NextResponse.json({
    personas: personas.map((persona) => ({
      ...persona,
      runningCount: runningCounts[persona.slug] || 0,
    })),
    activeHeartbeats,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, ...personaData } = body;
  const cabinetPath = normalizeCabinetPath(
    typeof body.cabinetPath === "string" ? body.cabinetPath : undefined,
    false
  );

  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  await writePersona(slug, {
    provider: personaData.provider || getDefaultProviderId(),
    adapterType:
      typeof personaData.adapterType === "string" && personaData.adapterType.trim()
        ? personaData.adapterType.trim()
        : defaultAdapterTypeForProvider(personaData.provider || getDefaultProviderId()),
    ...personaData,
  }, cabinetPath);

  // Globals scaffold under data/.global-agents/<slug>/, not under any cabinet.
  // Re-read the persona so we know where writePersona actually landed it.
  const written = await readPersona(slug, cabinetPath);
  const agentDir =
    written?.scope === "global"
      ? path.join(GLOBAL_AGENTS_DIR, slug)
      : cabinetPath
        ? path.join(DATA_DIR, cabinetPath, ".agents", slug)
        : path.join(DATA_DIR, ".agents", slug);
  await ensureAgentScaffold(agentDir);

  await reloadDaemonSchedules().catch(() => {});

  return NextResponse.json({ ok: true }, { status: 201 });
}

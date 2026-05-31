import { NextRequest, NextResponse } from "next/server";
import {
  loadAgentJobsBySlug,
  saveAgentJob,
  deleteAgentJob,
  executeJob,
} from "@/lib/jobs/job-manager";
import { reloadDaemonSchedules } from "@/lib/agents/daemon-client";
import {
  jobIdMatches,
  normalizeJobConfig,
} from "@/lib/jobs/job-normalization";
import { normalizeCabinetPath } from "@/lib/cabinets/paths";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const { id: slug, jobId } = await params;
  const { searchParams } = new URL(req.url);
  const cabinetPath = normalizeCabinetPath(
    searchParams.get("cabinetPath"),
    false
  );
  try {
    const jobs = await loadAgentJobsBySlug(slug, cabinetPath);
    const job = jobs.find((j) => jobIdMatches(j.id, jobId));
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const { id: slug, jobId } = await params;
  try {
    const body = await req.json();
    const cabinetPath = normalizeCabinetPath(
      typeof body.cabinetPath === "string" ? body.cabinetPath : undefined,
      false
    );

    const jobs = await loadAgentJobsBySlug(slug, cabinetPath);
    const existing = jobs.find((j) => jobIdMatches(j.id, jobId));
    if (!existing) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Handle run action
    if (body.action === "run") {
      if (cabinetPath) existing.cabinetPath = cabinetPath;
      const scheduledAt =
        typeof body.scheduledAt === "string" ? body.scheduledAt : undefined;
      const run = await executeJob(existing, { scheduledAt });
      return NextResponse.json({ ok: true, run });
    }

    // Handle toggle action
    if (body.action === "toggle") {
      existing.enabled = !existing.enabled;
      existing.updatedAt = new Date().toISOString();
      await saveAgentJob(slug, existing, cabinetPath || existing.cabinetPath);
      await reloadDaemonSchedules().catch(() => {});
      return NextResponse.json({ ok: true, job: existing });
    }

    // Update fields
    const updated = {
      ...existing,
      ...body,
      id: existing.id,
      agentSlug: slug,
      updatedAt: new Date().toISOString(),
    };
    const normalized = normalizeJobConfig(updated, slug, existing.id);
    const saved = await saveAgentJob(
      slug,
      normalized,
      cabinetPath || existing.cabinetPath
    );
    await reloadDaemonSchedules().catch(() => {});
    return NextResponse.json({ ok: true, job: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const { id: slug, jobId } = await params;
  try {
    const cabinetPath = normalizeCabinetPath(
      req.nextUrl.searchParams.get("cabinetPath"),
      false
    );
    await deleteAgentJob(slug, jobId, cabinetPath);
    await reloadDaemonSchedules().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

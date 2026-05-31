import { NextRequest, NextResponse } from "next/server";
import { loadAgentJobsBySlug, saveAgentJob } from "@/lib/jobs/job-manager";
import type { JobConfig } from "@/types/jobs";
import { reloadDaemonSchedules } from "@/lib/agents/daemon-client";
import { normalizeJobConfig } from "@/lib/jobs/job-normalization";
import { normalizeCabinetPath } from "@/lib/cabinets/paths";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: slug } = await params;
  const { searchParams } = new URL(req.url);
  const cabinetPath = normalizeCabinetPath(
    searchParams.get("cabinetPath"),
    false
  );
  try {
    const jobs = await loadAgentJobsBySlug(slug, cabinetPath);
    return NextResponse.json({ jobs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: slug } = await params;
  try {
    const body = await req.json();
    const cabinetPath = normalizeCabinetPath(
      typeof body.cabinetPath === "string" ? body.cabinetPath : undefined,
      false
    );
    const now = new Date().toISOString();
    const job: JobConfig = normalizeJobConfig(
      {
        ...body,
        ownerAgent: slug,
        cabinetPath,
        createdAt: now,
        updatedAt: now,
      },
      slug,
      `job-${Date.now()}`
    );

    const savedJob = await saveAgentJob(slug, job, cabinetPath);
    await reloadDaemonSchedules().catch(() => {});
    return NextResponse.json({ ok: true, job: savedJob }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

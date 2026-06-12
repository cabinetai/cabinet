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
import { minuteIso } from "@/lib/agents/cron-compute";
import { withinSeriesWindow } from "@/lib/agents/one-off";

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
      // Per-occurrence exception (EXDATE): a recurring job whose owner moved
      // THIS occurrence elsewhere records the original instant in `exceptions`.
      // The cron still fires on that minute, so suppress the run here — hiding
      // it in the calendar alone would let the original occurrence still run.
      if (
        scheduledAt &&
        Array.isArray(existing.exceptions) &&
        existing.exceptions.some((iso) => minuteIso(iso) === minuteIso(scheduledAt))
      ) {
        return NextResponse.json({ ok: true, skipped: "exception" });
      }
      // Recurring-series window ("this and following"): node-cron has no
      // end-date, so a series capped with `until` (or a fork that has not
      // reached its `since`) keeps firing. Suppress out-of-window runs here —
      // hiding them in the calendar alone would let the original cron execute.
      if (scheduledAt && !withinSeriesWindow(existing, scheduledAt)) {
        // If the series has fully ended (its `until` is now in the past, so
        // every future fire is dead), retire the zombie cron so the daemon
        // stops firing it daily. Occurrences before `until` already ran.
        if (
          existing.until &&
          new Date(existing.until).getTime() <= Date.now() &&
          existing.enabled
        ) {
          existing.enabled = false;
          existing.updatedAt = new Date().toISOString();
          await saveAgentJob(slug, existing, cabinetPath || existing.cabinetPath);
          await reloadDaemonSchedules().catch(() => {});
          return NextResponse.json({ ok: true, skipped: "series-ended", disabled: true });
        }
        return NextResponse.json({ ok: true, skipped: "series-window" });
      }
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

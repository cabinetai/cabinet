import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { runOneShotProviderPrompt } from "@/lib/agents/provider-runtime";

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      workdir,
      providerId,
      captureOutput = true,
      model,
      effort,
    } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }

    const cwd = workdir ? path.join(DATA_DIR, workdir) : DATA_DIR;

    const result = await runOneShotProviderPrompt({
      providerId,
      prompt,
      cwd,
      timeoutMs: 120_000,
      model: typeof model === "string" && model.trim() ? model.trim() : undefined,
      effort: typeof effort === "string" && effort.trim() ? effort.trim() : undefined,
    });

    return NextResponse.json({
      ok: true,
      output: captureOutput ? result : undefined,
      message: "Completed successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

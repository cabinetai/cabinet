import { spawn } from "child_process";
import { NextResponse } from "next/server";
import { providerRegistry } from "@/lib/agents/provider-registry";
import { ADAPTER_RUNTIME_PATH } from "@/lib/agents/adapters/utils";
import {
  getConfiguredDefaultProviderId,
  readProviderSettings,
} from "@/lib/agents/provider-settings";
import { emit as emitTelemetry } from "@/lib/telemetry";

type VerifyStatus =
  | "pass"
  | "not_installed"
  | "auth_required"
  | "payment_required"
  | "quota_exceeded"
  | "other_error";

interface VerifyResult {
  status: VerifyStatus;
  failedStepTitle: string;
  command: string;
  exitCode: number | null;
  signal: string | null;
  output: string;
  stderr: string;
  durationMs: number;
  hint?: string;
}

const MAX_OUTPUT_CHARS = 16_000;
const TIMEOUT_MS = 60_000;

function classify(
  exitCode: number | null,
  signal: string | null,
  stdout: string,
  stderr: string,
  spawnError: string | null
): { status: VerifyStatus; hint?: string } {
  if (spawnError) {
    if (/ENOENT|command not found|no such file/i.test(spawnError)) {
      return {
        status: "not_installed",
        hint: "Cabinet couldn't find the CLI binary on your PATH. Rerun the Install step.",
      };
    }
    return {
      status: "other_error",
      hint: spawnError,
    };
  }

  if (signal === "SIGTERM") {
    return {
      status: "other_error",
      hint: `Verify command timed out after ${TIMEOUT_MS / 1000}s.`,
    };
  }

  const text = `${stdout}\n${stderr}`.toLowerCase();

  if (/command not found|no such file|enoent/i.test(text)) {
    return {
      status: "not_installed",
      hint: "The CLI binary isn't on your PATH yet. Rerun the Install step.",
    };
  }

  if (
    /quota exceeded|resource.{0,10}exhausted|rate[- ]?limit|too many requests|try again later/i.test(text)
  ) {
    return {
      status: "quota_exceeded",
      hint: "You hit your provider's usage quota or rate limit. Wait and retry, or switch to a paid plan/API key.",
    };
  }

  if (
    /payment required|subscription required|upgrade.{0,20}plan|billing required|403.{0,20}payment/i.test(text)
  ) {
    return {
      status: "payment_required",
      hint: "This provider needs an active paid plan or subscription before it will answer requests.",
    };
  }

  if (
    /not logged in|not authenticated|unauthori[sz]ed|401|missing api key|api key.{0,20}not set|please (sign|log) ?in|run .{0,20}(login|auth)/i.test(
      text
    )
  ) {
    return {
      status: "auth_required",
      hint: "The CLI is installed but not authenticated. Finish the Log in / API-key step.",
    };
  }

  if (exitCode === 0) {
    return { status: "pass" };
  }

  return {
    status: "other_error",
    hint: "Verify command exited non-zero. See stderr for details.",
  };
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n…(truncated ${text.length - MAX_OUTPUT_CHARS} chars)`;
}

function findVerifyStep(installSteps: Array<{ title: string; command?: string }> | undefined) {
  if (!installSteps || installSteps.length === 0) return null;
  const byTitle = installSteps.find(
    (step) =>
      step.command &&
      /verify\s+setup/i.test(step.title)
  );
  if (byTitle) return byTitle;
  const lastWithCommand = [...installSteps].reverse().find((step) => step.command);
  return lastWithCommand || null;
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse<VerifyResult | { error: string }>> {
  const { id } = await ctx.params;
  const provider = providerRegistry.get(id);
  if (!provider) {
    return NextResponse.json({ error: `Unknown provider: ${id}` }, { status: 404 });
  }

  const step = findVerifyStep(provider.installSteps);
  const stepTitle = step?.title ?? "Verify setup";

  // A provider-supplied verify command (OpenCode/Pi) wins over the static
  // install step so verification exercises the resolved default model.
  let command: string | null = step?.command ?? null;
  if (typeof provider.buildVerifyCommand === "function") {
    let defaultModel: string | null = null;
    try {
      const settings = await readProviderSettings();
      if (getConfiguredDefaultProviderId(settings) === id) {
        defaultModel = settings.defaultModel ?? null;
      }
    } catch {
      // settings unreadable → verify the model-less default path
    }
    command = provider.buildVerifyCommand(defaultModel);
  }

  if (!command) {
    return NextResponse.json(
      { error: `Provider ${id} has no verifiable command in its install steps.` },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  const result = await runShellCommand(command);
  const durationMs = Date.now() - startedAt;

  const { status, hint } = classify(
    result.exitCode,
    result.signal,
    result.stdout,
    result.stderr,
    result.spawnError
  );

  emitTelemetry("provider.verified", {
    provider: id,
    success: status === "pass",
    durationMs,
  });

  return NextResponse.json({
    status,
    failedStepTitle: status === "pass" ? "" : stepTitle,
    command,
    exitCode: result.exitCode,
    signal: result.signal,
    output: truncate(result.stdout),
    stderr: truncate(result.stderr),
    durationMs,
    hint,
  });
}

function runShellCommand(command: string): Promise<{
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  spawnError: string | null;
}> {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], {
      env: {
        ...process.env,
        PATH: ADAPTER_RUNTIME_PATH,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let spawnError: string | null = null;

    const timer = setTimeout(() => {
      if (settled) return;
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore
      }
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      spawnError = err instanceof Error ? err.message : String(err);
      resolve({
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        spawnError,
      });
    });

    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        signal: signal ?? null,
        stdout,
        stderr,
        spawnError: null,
      });
    });
  });
}

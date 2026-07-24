import type { AgentProvider, ProviderStatus } from "../provider-interface";
import {
  checkCliProviderAvailable,
  execCli,
  resolveCliCommand,
} from "../provider-cli";

const OPENCODE_VARIANT_LEVELS = [
  { id: "minimal", name: "Minimal", description: "Skip extra reasoning" },
  { id: "low", name: "Low", description: "Quick reasoning" },
  { id: "medium", name: "Medium", description: "Balanced depth" },
  { id: "high", name: "High", description: "Thorough reasoning" },
  { id: "xhigh", name: "Extra High", description: "Maximum depth" },
  { id: "max", name: "Max", description: "Provider max effort" },
] as const;

// Used only when `opencode models` discovery fails (CLI not installed or
// not authed). OpenCode reaches the API directly so we can't include
// ChatGPT-only ids like `gpt-5.5` here. Refreshed 2026-07-23.
// DeepSeek models included so users see realistic options even when
// discovery is degraded, avoiding misleading non-DeepSeek defaults.
const OPENCODE_FALLBACK_MODELS = [
  { id: "openai/gpt-5.4", name: "openai/gpt-5.4", contextWindow: 1_050_000 },
  { id: "openai/gpt-5.4-mini", name: "openai/gpt-5.4-mini", contextWindow: 400_000 },
  { id: "openai/gpt-5.3-codex", name: "openai/gpt-5.3-codex", contextWindow: 1_050_000 },
  { id: "anthropic/claude-opus-4-7", name: "anthropic/claude-opus-4-7", contextWindow: 1_000_000 },
  { id: "anthropic/claude-sonnet-4-6", name: "anthropic/claude-sonnet-4-6", contextWindow: 1_000_000 },
  { id: "google/gemini-3.1-pro", name: "google/gemini-3.1-pro", contextWindow: 1_048_576 },
  { id: "xai/grok-4.3", name: "xai/grok-4.3", contextWindow: 1_000_000 },
  { id: "deepseek/deepseek-v4-pro", name: "deepseek/deepseek-v4-pro", contextWindow: 1_002_000 },
  { id: "deepseek/deepseek-v4-flash", name: "deepseek/deepseek-v4-flash", contextWindow: 1_048_576 },
] as const;

type FallbackModel = (typeof OPENCODE_FALLBACK_MODELS)[number];

export interface OpenCodeModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  effortLevels?: Array<OpenCodeVariantLevel>;
}

type OpenCodeVariantLevel = (typeof OPENCODE_VARIANT_LEVELS)[number];

function withVariants<T extends { id: string; name: string; contextWindow?: number }>(models: readonly T[]) {
  return models.map((model) => ({
    ...model,
    effortLevels: [...OPENCODE_VARIANT_LEVELS],
  }));
}

/**
 * Pure parser for `opencode models` stdout. Each usable line is a
 * `vendor/model` id (the command is entitlement-gated server-side — it only
 * lists providers the user has authed + the always-on OpenCode Zen subset).
 * Lines without a `/` are CLI chrome/noise and are dropped. Empty output →
 * the offline fallback list so the picker is never blank.
 */
export function parseOpenCodeModels(stdout: string | null | undefined) {
  const out = (stdout || "").trim();
  if (!out) return withVariants(OPENCODE_FALLBACK_MODELS);
  // If the output contains JSON (--verbose format), delegate to the
  // verbose parser which extracts contextWindow from limit.context.
  if (out.startsWith("{") || out.includes("\n{")) {
    return parseVerboseOpenCodeModels(out);
  }
  const parsed = out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.includes("/"))
    .map((id) => ({
      id,
      name: id,
      effortLevels: [...OPENCODE_VARIANT_LEVELS],
    }));
  return parsed.length > 0 ? parsed : withVariants(OPENCODE_FALLBACK_MODELS);
}

/**
 * Parse the `opencode models --verbose` output format. The output has the
 * model ID as a text line (e.g. `opencode/vendor/model`) followed by a
 * multi-line JSON object containing `limit.context` for the context window.
 * Falls back to the offline list when parsing fails.
 */
export function parseVerboseOpenCodeModels(stdout: string) {
  const lines = stdout.split(/\r?\n/);
  const models: OpenCodeModelInfo[] = [];
  let currentId: string | null = null;
  let jsonAccum: string[] = [];
  let braceDepth = 0;
  let inJson = false;

  function flushJson() {
    if (!currentId || jsonAccum.length === 0) return;
    try {
      const parsed = JSON.parse(jsonAccum.join("\n"));
      models.push({
        id: currentId,
        name: currentId,
        contextWindow: parsed.limit?.context,
        effortLevels: [...OPENCODE_VARIANT_LEVELS],
      });
    } catch {
      // Malformed JSON — still add the model without contextWindow
      models.push({
        id: currentId,
        name: currentId,
        effortLevels: [...OPENCODE_VARIANT_LEVELS],
      });
    }
    currentId = null;
    jsonAccum = [];
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.includes("/") && !line.startsWith("{")) {
      // Model ID line — flush any pending JSON first
      if (inJson) flushJson();
      inJson = false;
      currentId = line;
    } else if (line.startsWith("{") || inJson) {
      // JSON block
      if (!inJson) {
        inJson = true;
        jsonAccum = [];
      }
      jsonAccum.push(line);
      braceDepth = 0;
      // Track brace depth to find end of JSON
      for (const ch of line) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
      if (inJson && braceDepth <= 0) {
        flushJson();
        inJson = false;
      }
    }
  }

  // Handle trailing JSON
  if (inJson) flushJson();

  // Fallback: if no models parsed, try the simple line parser or fallback list
  if (models.length === 0) {
    const simple = lines
      .map((l) => l.trim())
      .filter((l) => l && l.includes("/"));
    if (simple.length > 0) {
      return simple.map((id) => ({
        id,
        name: id,
        effortLevels: [...OPENCODE_VARIANT_LEVELS],
      }));
    }
    return withVariants(OPENCODE_FALLBACK_MODELS);
  }

  return models;
}

export interface OpenCodeAuthSummary {
  credentials: number;
  envProviders: number;
  configured: boolean;
}

// Strip ANSI SGR escapes (\x1b[..m) from `opencode auth list` before parsing.
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * Pure parser for `opencode auth list` stdout. OpenCode is a multi-provider
 * router — "authenticated" means *some* provider is keyed, via stored
 * credentials (`opencode auth login`) or environment variables. The summary
 * box prints stable "N credentials" / "N environment variables" lines; we
 * strip ANSI and read those counts. Used only to make the readiness *text*
 * honest — never to flip selectability (Zen `-free` models run with no key,
 * so OpenCode stays usable/selectable even when `configured` is false).
 */
export function parseOpenCodeAuth(
  stdout: string | null | undefined
): OpenCodeAuthSummary {
  const text = (stdout || "").replace(ANSI_RE, "");
  const credMatch = text.match(/(\d+)\s+credentials?\b/i);
  const envMatch = text.match(/(\d+)\s+environment variables?\b/i);
  const credentials = credMatch ? parseInt(credMatch[1], 10) : 0;
  const envProviders = envMatch ? parseInt(envMatch[1], 10) : 0;
  return {
    credentials,
    envProviders,
    configured: credentials > 0 || envProviders > 0,
  };
}

export const openCodeProvider: AgentProvider = {
  id: "opencode",
  name: "OpenCode",
  type: "cli",
  icon: "opencode",
  iconAsset: "/providers/opencode.svg",
  installMessage:
    "OpenCode CLI not found. Install with: npm i -g opencode-ai",
  installSteps: [
    {
      title: "Install OpenCode",
      detail: "Run the following in your terminal:",
      command: "npm i -g opencode-ai",
    },
    {
      title: "Configure a provider",
      detail:
        "OpenCode routes to many providers. Configure at least one (OpenAI, Anthropic, OpenRouter, etc.) via environment variables or `opencode auth`.",
      command: "opencode auth",
      link: {
        label: "OpenCode docs",
        url: "https://opencode.ai/docs",
      },
    },
    {
      title: "Verify setup",
      detail: "Confirm headless mode works:",
      command: "opencode run 'Reply with exactly OK'",
    },
  ],
  detachedPromptLaunchMode: "one-shot",
  supportsTerminalResume: true,
  models: OPENCODE_FALLBACK_MODELS.map((model) => ({
    id: model.id,
    name: model.name,
    contextWindow: model.contextWindow,
    effortLevels: [...OPENCODE_VARIANT_LEVELS],
  })),
  effortLevels: [...OPENCODE_VARIANT_LEVELS],
  command: "opencode",
  commandCandidates: [
    `${process.env.HOME || ""}/.local/bin/opencode`,
    "/usr/local/bin/opencode",
    "/opt/homebrew/bin/opencode",
    "opencode",
  ],

  buildArgs(prompt: string, _workdir: string): string[] {
    return ["run", prompt];
  },

  buildOneShotInvocation(prompt: string, workdir: string, opts) {
    const baseArgs = this.buildArgs ? this.buildArgs(prompt, workdir) : [];
    const args = [...baseArgs];
    if (opts?.model) {
      args.push("--model", opts.model);
    }
    if (opts?.effort) {
      args.push("--variant", opts.effort);
    }
    if (opts?.resumeId) {
      args.push("--session", opts.resumeId);
    }
    return {
      command: this.command || "opencode",
      args,
    };
  },

  buildVerifyCommand(defaultModel?: string | null): string {
    // Mirrors the install step (`opencode run 'Reply with exactly OK'`) but
    // pins the resolved default model so "verify passed" means *that* model
    // works, not OpenCode's opaque internal default. Model ids are
    // vendor/model (no shell metachars) but single-quote defensively.
    const modelArg = defaultModel ? ` --model '${defaultModel}'` : "";
    return `opencode run${modelArg} 'Reply with exactly OK'`;
  },

  async listModels() {
    // Throws on a genuine CLI failure (not installed / not runnable) — the
    // models API route catches that and serves the offline fallback with
    // `dynamic:false`, so the picker can honestly say "offline defaults".
    // Steady state this is a local cache read (~/.cache/opencode/models.json);
    // the first run on a fresh machine populates it from models.dev, hence
    // the generous timeout. `parseOpenCodeModels` still guards empty output.
    // `--verbose` outputs NDJSON with `limit.context` per model, giving us
    // the real context window instead of the 200k hardcoded fallback.
    const cmd = resolveCliCommand(this);
    const out = await execCli(cmd, ["models", "--verbose"], { timeout: 15_000 });
    return parseOpenCodeModels(out);
  },

  async isAvailable(): Promise<boolean> {
    return checkCliProviderAvailable(this);
  },

  async healthCheck(): Promise<ProviderStatus> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        return {
          available: false,
          authenticated: false,
          error: this.installMessage,
        };
      }

      try {
        const cmd = resolveCliCommand(this);
        const version = await execCli(cmd, ["--version"], { timeout: 5000 });
        const base = version ? `OpenCode ${version}` : "OpenCode installed";

        // OpenCode routes to many providers; "ready" must not imply full
        // model access. Probe configured providers and make the status TEXT
        // honest — but keep authenticated:true regardless, because Zen
        // `-free` models run with no key (flipping it would hide OpenCode
        // from the composer picker entirely).
        let suffix = "";
        try {
          const authOut = await execCli(cmd, ["auth", "list"], {
            timeout: 6000,
          });
          const auth = parseOpenCodeAuth(authOut);
          suffix = auth.configured
            ? ` · ${auth.credentials + auth.envProviders} provider${
                auth.credentials + auth.envProviders === 1 ? "" : "s"
              } configured`
            : " · no provider keys (Zen free models only)";
        } catch {
          // auth list unavailable (old CLI / odd output) — don't regress,
          // just show the plain version string.
        }

        return {
          available: true,
          authenticated: true,
          version: `${base}${suffix}`,
        };
      } catch {
        return {
          available: true,
          authenticated: false,
          error: "OpenCode is installed but not verified. Configure a provider (e.g. OPENAI_API_KEY).",
        };
      }
    } catch (error) {
      return {
        available: false,
        authenticated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};

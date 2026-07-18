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
// ChatGPT-only ids like `gpt-5.5` here. Refreshed 2026-05-03.
const OPENCODE_FALLBACK_MODELS = [
  { id: "openai/gpt-5.4", name: "openai/gpt-5.4" },
  { id: "openai/gpt-5.4-mini", name: "openai/gpt-5.4-mini" },
  { id: "openai/gpt-5.3-codex", name: "openai/gpt-5.3-codex" },
  { id: "anthropic/claude-opus-4-7", name: "anthropic/claude-opus-4-7" },
  { id: "anthropic/claude-sonnet-4-6", name: "anthropic/claude-sonnet-4-6" },
  { id: "google/gemini-3.1-pro", name: "google/gemini-3.1-pro" },
  { id: "xai/grok-4.3", name: "xai/grok-4.3" },
] as const;

function withVariants<T extends { id: string; name: string }>(models: readonly T[]) {
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
    const cmd = resolveCliCommand(this);
    const out = await execCli(cmd, ["models"], { timeout: 15_000 });
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

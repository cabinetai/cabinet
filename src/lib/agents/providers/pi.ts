import type { AgentProvider, ProviderStatus } from "../provider-interface";
import {
  checkCliProviderAvailable,
  execCli,
  resolveCliCommand,
} from "../provider-cli";

const PI_THINKING_LEVELS = [
  { id: "off", name: "Off", description: "No extra reasoning" },
  { id: "minimal", name: "Minimal", description: "Tiny reasoning budget" },
  { id: "low", name: "Low", description: "Quick reasoning" },
  { id: "medium", name: "Medium", description: "Balanced depth" },
  { id: "high", name: "High", description: "Thorough reasoning" },
  { id: "xhigh", name: "Extra High", description: "Maximum depth" },
] as const;

// Used only when `pi --list-models` discovery fails. Refreshed 2026-05-03.
const PI_FALLBACK_MODELS = [
  { id: "xai/grok-4.3", name: "xai/grok-4.3" },
  { id: "anthropic/claude-opus-4-7", name: "anthropic/claude-opus-4-7" },
  { id: "anthropic/claude-sonnet-4-6", name: "anthropic/claude-sonnet-4-6" },
  { id: "openai/gpt-5.4", name: "openai/gpt-5.4" },
  { id: "openai/gpt-5.3-codex", name: "openai/gpt-5.3-codex" },
  { id: "google/gemini-3.1-pro", name: "google/gemini-3.1-pro" },
] as const;

function withThinkingLevels<T extends { id: string; name: string }>(
  models: readonly T[]
) {
  return models.map((model) => ({
    ...model,
    effortLevels: [...PI_THINKING_LEVELS],
  }));
}

/**
 * Pure parser for `pi --list-models` stdout. Pi routes to whatever providers
 * the user has keyed, so this list is per-machine. Blank lines and `#`
 * comments/banners are dropped; if nothing survives (empty output, or output
 * that is *only* a banner) we fall back to the offline list so the picker is
 * never blank — the same hardening applied to OpenCode (§11 #22).
 */
export function parsePiModels(stdout: string | null | undefined) {
  const out = (stdout || "").trim();
  if (!out) return withThinkingLevels(PI_FALLBACK_MODELS);
  const parsed = out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((id) => ({
      id,
      name: id,
      effortLevels: [...PI_THINKING_LEVELS],
    }));
  return parsed.length > 0 ? parsed : withThinkingLevels(PI_FALLBACK_MODELS);
}

export const piProvider: AgentProvider = {
  id: "pi",
  name: "Pi (Inflection)",
  type: "cli",
  icon: "pi",
  iconAsset: "/providers/pi.svg",
  installMessage: "Pi CLI not found. Install with: npm i -g @pi/cli",
  installSteps: [
    {
      title: "Install Pi",
      detail: "Pi is a multi-provider AI coding agent. Install the CLI:",
      command: "npm i -g @pi/cli",
    },
    {
      title: "Configure a provider",
      detail:
        "Set API keys for the provider(s) you want Pi to route to (e.g. XAI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY).",
      command: "pi --list-models",
      link: {
        label: "Pi docs",
        url: "https://pi.ai/docs",
      },
    },
    {
      title: "Verify setup",
      detail: "Confirm headless mode works:",
      command: "pi --mode json -p 'Reply with exactly OK'",
    },
  ],
  detachedPromptLaunchMode: "one-shot",
  models: PI_FALLBACK_MODELS.map((model) => ({
    id: model.id,
    name: model.name,
    effortLevels: [...PI_THINKING_LEVELS],
  })),
  effortLevels: [...PI_THINKING_LEVELS],
  command: "pi",
  commandCandidates: [
    `${process.env.HOME || ""}/.local/bin/pi`,
    "/usr/local/bin/pi",
    "/opt/homebrew/bin/pi",
    "pi",
  ],

  buildArgs(prompt: string, _workdir: string): string[] {
    return ["-p", prompt];
  },

  buildOneShotInvocation(prompt: string, workdir: string, opts) {
    const baseArgs = this.buildArgs ? this.buildArgs(prompt, workdir) : [];
    const args = [...baseArgs];
    if (opts?.model) {
      args.push("--model", opts.model);
    }
    if (opts?.effort) {
      args.push("--thinking", opts.effort);
    }
    return {
      command: this.command || "pi",
      args,
    };
  },

  buildVerifyCommand(defaultModel?: string | null): string {
    // Mirrors the install step (`pi --mode json -p 'Reply with exactly OK'`)
    // but pins the resolved default model so verification exercises the
    // user's actual path, not Pi's internal default.
    const modelArg = defaultModel ? ` --model '${defaultModel}'` : "";
    return `pi --mode json${modelArg} -p 'Reply with exactly OK'`;
  },

  async listModels() {
    // Throws on a genuine CLI failure so the models API route serves the
    // offline fallback with `dynamic:false` (honest "offline defaults" hint).
    // `parsePiModels` still guards empty / banner-only output.
    const cmd = resolveCliCommand(this);
    const out = await execCli(cmd, ["--list-models"], { timeout: 15_000 });
    return parsePiModels(out);
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

        return {
          available: true,
          authenticated: true,
          version: version ? `Pi ${version}` : "Pi installed",
        };
      } catch {
        return {
          available: true,
          authenticated: false,
          error: "Pi is installed but not verified. Configure at least one provider API key.",
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

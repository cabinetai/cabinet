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

const PI_FALLBACK_MODELS = [
  { id: "xai/grok-4", name: "xai/grok-4" },
  { id: "anthropic/claude-sonnet-4-6", name: "anthropic/claude-sonnet-4-6" },
  { id: "anthropic/claude-opus-4-7", name: "anthropic/claude-opus-4-7" },
  { id: "openai/gpt-5.2-codex", name: "openai/gpt-5.2-codex" },
  { id: "google/gemini-2.5-pro", name: "google/gemini-2.5-pro" },
] as const;

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

  async listModels() {
    try {
      const cmd = resolveCliCommand(this);
      const out = await execCli(cmd, ["--list-models"], { timeout: 10_000 });
      if (!out) {
        return [...PI_FALLBACK_MODELS].map((m) => ({ ...m, effortLevels: [...PI_THINKING_LEVELS] }));
      }
      return out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((id) => ({
          id,
          name: id,
          effortLevels: [...PI_THINKING_LEVELS],
        }));
    } catch {
      return [...PI_FALLBACK_MODELS].map((m) => ({ ...m, effortLevels: [...PI_THINKING_LEVELS] }));
    }
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

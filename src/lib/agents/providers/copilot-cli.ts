import type { AgentProvider, ProviderStatus } from "../provider-interface";
import {
  checkCliProviderAvailable,
  execCli,
  resolveCliCommand,
} from "../provider-cli";

// Copilot CLI's `--model` accepts whatever the user's plan exposes via
// `/model` in the TUI. Verified 2026-05-03 against GitHub's supported-models
// docs; "auto" was added 2026-04-17 and routes across GPT-5.x, Sonnet 4.6,
// Haiku 4.5 based on plan + policy.
const COPILOT_MODELS = [
  {
    id: "auto",
    name: "Auto (recommended)",
    description: "Copilot picks the best model for each turn based on your plan",
  },
  {
    id: "gpt-5.5",
    name: "GPT-5.5 (via Copilot)",
    description: "OpenAI's strongest coding model routed through Copilot",
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4 (via Copilot)",
    description: "Previous OpenAI flagship routed through Copilot",
  },
  {
    id: "gpt-5.3-codex",
    name: "GPT-5.3 Codex (via Copilot)",
    description: "Codex-tuned OpenAI model routed through Copilot",
  },
  {
    id: "claude-opus-4.7",
    name: "Claude Opus 4.7 (via Copilot)",
    description: "Anthropic's most intelligent model routed through Copilot",
  },
  {
    id: "claude-sonnet-4.6",
    name: "Claude Sonnet 4.6 (via Copilot)",
    description: "Anthropic Sonnet routed through Copilot",
  },
  {
    id: "claude-haiku-4.5",
    name: "Claude Haiku 4.5 (via Copilot)",
    description: "Fast Anthropic model routed through Copilot",
  },
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro (via Copilot)",
    description: "Google's flagship Gemini routed through Copilot",
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash (via Copilot)",
    description: "Fast Google model routed through Copilot",
  },
] as const;

export const copilotCliProvider: AgentProvider = {
  id: "copilot-cli",
  name: "Copilot CLI",
  type: "cli",
  icon: "copilot",
  iconAsset: "/providers/copilot.svg",
  installMessage:
    "GitHub Copilot CLI not found. Install with: npm install -g @github/copilot",
  installSteps: [
    {
      title: "Get a Copilot subscription",
      detail:
        "Any GitHub Copilot plan works (Individual, Business, or Enterprise).",
      link: {
        label: "GitHub Copilot plans",
        url: "https://github.com/features/copilot/plans",
      },
    },
    {
      title: "Install Copilot CLI",
      detail: "Run the following in your terminal:",
      command: "npm install -g @github/copilot",
    },
    {
      title: "Sign in to GitHub",
      detail:
        "Authenticate Copilot CLI with your GitHub account. It reuses `gh` auth when available:",
      command: "copilot auth login",
    },
    {
      title: "Verify setup",
      detail: "Confirm headless mode works:",
      command: "copilot -p 'Reply with exactly OK' --allow-all-tools",
    },
  ],
  detachedPromptLaunchMode: "one-shot",
  models: COPILOT_MODELS.map((model) => ({
    id: model.id,
    name: model.name,
    description: model.description,
    effortLevels: [],
  })),
  effortLevels: [],
  command: "copilot",
  commandCandidates: [
    `${process.env.HOME || ""}/.local/bin/copilot`,
    "/usr/local/bin/copilot",
    "/opt/homebrew/bin/copilot",
    "copilot",
  ],

  buildArgs(prompt: string, _workdir: string): string[] {
    return ["-p", prompt, "--allow-all-tools"];
  },

  buildOneShotInvocation(prompt: string, workdir: string, opts) {
    const baseArgs = this.buildArgs ? this.buildArgs(prompt, workdir) : [];
    const args = [...baseArgs];
    if (opts?.model) {
      args.push("--model", opts.model);
    }
    return {
      command: this.command || "copilot",
      args,
    };
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
          version: version ? `Copilot CLI ${version}` : "Copilot CLI installed",
        };
      } catch {
        return {
          available: true,
          authenticated: false,
          error:
            "Copilot CLI is installed but not authenticated. Run: copilot auth login",
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

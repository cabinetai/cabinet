import type { AgentProvider, ProviderStatus } from "../provider-interface";
import {
  buildCommandCandidates,
  checkCliProviderAvailable,
  execCli,
  resolveCliCommand,
} from "../provider-cli";
import { getNvmNodeBin } from "../nvm-path";

// Effort levels per Claude Code docs: Fable 5, Opus 4.8/4.7, and Sonnet 5 all
// support the full ladder including the `xhigh` rung. (Sonnet 4.6 stopped at
// `max` with no `xhigh`, but it's no longer offered here.) Setting an
// unsupported level falls back to the highest the model accepts, but we
// surface the right list so the picker doesn't show levels that won't apply.
const EFFORT_LEVELS_WITH_XHIGH = [
  { id: "low", name: "Low", description: "Quick, minimal reasoning" },
  { id: "medium", name: "Medium", description: "Balanced depth" },
  { id: "high", name: "High", description: "Thorough reasoning" },
  { id: "xhigh", name: "Extra High", description: "Recommended for hardest tasks" },
  { id: "max", name: "Max", description: "Deepest reasoning, no token cap" },
] as const;

const nvmClaudePath = (() => {
  const bin = getNvmNodeBin();
  return bin || null;
})();

export const claudeCodeProvider: AgentProvider = {
  id: "claude-code",
  name: "Claude Code",
  type: "cli",
  icon: "sparkles",
  installMessage: "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code",
  installSteps: [
    { title: "Get a Claude subscription", detail: "Any Claude Code subscription will do (Pro, Max, or Team).", link: { label: "Open Claude billing", url: "https://claude.ai/settings/billing" } },
    { title: "Install Claude Code", detail: "Run the following in your terminal:", command: "npm install -g @anthropic-ai/claude-code" },
    { title: "Log in", detail: "Authenticate with your Claude account:", command: "claude auth login" },
    { title: "Verify login", detail: "Check that you're logged in:", command: "claude auth status" },
    { title: "Verify setup", detail: "Confirm headless mode works:", command: "claude -p 'Reply with exactly OK' --output-format text" },
  ],
  models: [
    {
      id: "fable",
      name: "Claude Fable 5",
      description: "Most powerful model, above Opus, with configurable effort",
      effortLevels: [...EFFORT_LEVELS_WITH_XHIGH],
    },
    {
      id: "opus",
      name: "Claude Opus 4.8",
      description: "Most intelligent Opus with configurable effort",
      effortLevels: [...EFFORT_LEVELS_WITH_XHIGH],
    },
    {
      id: "opus[1m]",
      name: "Claude Opus 4.8 (1M context)",
      description: "Opus 4.8 with 1M-token context for very long sessions",
      effortLevels: [...EFFORT_LEVELS_WITH_XHIGH],
    },
    {
      id: "sonnet",
      name: "Claude Sonnet 5",
      description: "Fast and capable with configurable effort",
      effortLevels: [...EFFORT_LEVELS_WITH_XHIGH],
    },
    {
      id: "sonnet[1m]",
      name: "Claude Sonnet 5 (1M context)",
      description: "Sonnet 5 with 1M-token context for very long sessions",
      effortLevels: [...EFFORT_LEVELS_WITH_XHIGH],
    },
    {
      id: "opusplan",
      name: "Opus + Sonnet (opusplan)",
      description: "Opus during plan mode, Sonnet for execution",
      effortLevels: [...EFFORT_LEVELS_WITH_XHIGH],
    },
    {
      id: "haiku",
      name: "Claude Haiku 4.5",
      description: "Fastest responses",
      effortLevels: [],
    },
  ],
  detachedPromptLaunchMode: "session",
  supportsTerminalResume: true,
  effortLevels: [...EFFORT_LEVELS_WITH_XHIGH],
  command: "claude",
  commandCandidates: buildCommandCandidates("claude", { nvmBin: nvmClaudePath }),

  buildArgs(prompt: string, _workdir: string): string[] {
    return ["--dangerously-skip-permissions", "-p", prompt, "--output-format", "text"];
  },

  buildOneShotInvocation(prompt: string, workdir: string, opts) {
    const baseArgs = this.buildArgs ? this.buildArgs(prompt, workdir) : [];
    const args = [...baseArgs];
    if (opts?.model) {
      args.push("--model", opts.model);
    }
    return {
      command: this.command || "claude",
      args,
    };
  },

  buildSessionInvocation(prompt: string | undefined, _workdir: string, opts) {
    const args = ["--dangerously-skip-permissions"];
    if (opts?.resumeId) {
      // `claude --resume <sessionId>` rehydrates the prior conversation so
      // the user's follow-up prompt reads into the same context.
      args.push("--resume", opts.resumeId);
    }
    return {
      command: this.command || "claude",
      args,
      initialPrompt: prompt?.trim() || undefined,
      readyStrategy: prompt ? "claude" : undefined,
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

      // Check actual auth status via `claude auth status`
      try {
        const cmd = resolveCliCommand(this);
        const output = await execCli(cmd, ["auth", "status"], { timeout: 5000 });
        const auth = JSON.parse(output);
        if (auth.loggedIn) {
          const sub = auth.subscriptionType ? ` (${auth.subscriptionType})` : "";
          return {
            available: true,
            authenticated: true,
            version: `Logged in${sub}`,
          };
        }
        return {
          available: true,
          authenticated: false,
          error: "Claude Code is installed but not logged in. Run: claude auth login",
        };
      } catch {
        // auth status command failed — might be older version without it
        return {
          available: true,
          authenticated: false,
          error: "Could not verify login status. Run: claude auth login",
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

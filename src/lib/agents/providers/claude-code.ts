import { execSync } from "child_process";
import type { AgentProvider, ProviderStatus } from "../provider-interface";
import {
  buildCommandCandidates,
  checkCliProviderAvailable,
  resolveCliCommand,
  RUNTIME_PATH,
} from "../provider-cli";
import { getNvmNodeBin } from "../nvm-path";

const CLAUDE_THINKING_LEVELS = [
  { id: "low", name: "Low", description: "Quick, minimal reasoning" },
  { id: "medium", name: "Medium", description: "Balanced depth" },
  { id: "high", name: "High", description: "Thorough reasoning" },
  { id: "max", name: "Max", description: "Maximum depth" },
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
  ],
  models: [
    {
      id: "opus",
      name: "Claude Opus 4.7",
      description: "Most intelligent with configurable effort",
      effortLevels: [...CLAUDE_THINKING_LEVELS],
    },
    {
      id: "sonnet",
      name: "Claude Sonnet 4.6",
      description: "Fast and capable with configurable effort",
      effortLevels: [...CLAUDE_THINKING_LEVELS],
    },
    {
      id: "haiku",
      name: "Claude Haiku 4.5",
      description: "Fastest responses",
      effortLevels: [],
    },
  ],
  detachedPromptLaunchMode: "session",
  effortLevels: [...CLAUDE_THINKING_LEVELS],
  command: "claude",
  commandCandidates: buildCommandCandidates("claude", { nvmBin: nvmClaudePath }),

  buildArgs(prompt: string, _workdir: string): string[] {
    return ["--dangerously-skip-permissions", "-p", prompt, "--output-format", "text"];
  },

  buildOneShotInvocation(prompt: string, workdir: string) {
    return {
      command: this.command || "claude",
      args: this.buildArgs ? this.buildArgs(prompt, workdir) : [],
    };
  },

  buildSessionInvocation(prompt: string | undefined, _workdir: string) {
    return {
      command: this.command || "claude",
      args: ["--dangerously-skip-permissions"],
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
        const output = execSync(`${cmd} auth status`, {
          encoding: "utf8",
          env: { ...process.env, PATH: RUNTIME_PATH },
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 5000,
        }).trim();
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

import { execSync } from "child_process";
import type { AgentProvider, ProviderStatus } from "../provider-interface";
import {
  buildCommandCandidates,
  checkCliProviderAvailable,
  resolveCliCommand,
  RUNTIME_PATH,
} from "../provider-cli";

const CODEX_REASONING_LEVELS = [
  { id: "low", name: "Low", description: "Faster, lighter reasoning" },
  { id: "medium", name: "Medium", description: "Balanced depth" },
  { id: "high", name: "High", description: "More deliberate reasoning" },
] as const;

const CODEX_EXTENDED_REASONING_LEVELS = [
  ...CODEX_REASONING_LEVELS,
  {
    id: "xhigh",
    name: "Extra High",
    description: "Maximum depth for the hardest tasks",
  },
] as const;

const CODEX_MAX_REASONING_LEVELS = [
  { id: "none", name: "None", description: "Skip extra reasoning tokens" },
  { id: "medium", name: "Medium", description: "Balanced depth" },
  { id: "high", name: "High", description: "More deliberate reasoning" },
  {
    id: "xhigh",
    name: "Extra High",
    description: "Maximum depth for the hardest tasks",
  },
] as const;

export const codexCliProvider: AgentProvider = {
  id: "codex-cli",
  name: "Codex CLI",
  type: "cli",
  icon: "bot",
  installMessage: "Codex CLI not found. Install with: npm i -g @openai/codex",
  installSteps: [
    { title: "Install Codex CLI", detail: "Run the following in your terminal:", command: "npm i -g @openai/codex" },
    { title: "Log in", detail: "Authenticate with your ChatGPT or API account:", command: "codex login" },
    { title: "Verify login", detail: "Check that you're logged in:", command: "codex login status" },
  ],
  detachedPromptLaunchMode: "one-shot",
  models: [
    {
      id: "gpt-5.2-codex",
      name: "GPT-5.2 Codex",
      description: "Current flagship Codex model for agentic coding",
      effortLevels: [...CODEX_EXTENDED_REASONING_LEVELS],
    },
    {
      id: "gpt-5.1-codex-max",
      name: "GPT-5.1 Codex Max",
      description: "High-depth Codex model with extended reasoning",
      effortLevels: [...CODEX_MAX_REASONING_LEVELS],
    },
    {
      id: "o3",
      name: "o3",
      description: "Most capable legacy reasoning model",
      effortLevels: [...CODEX_REASONING_LEVELS],
    },
    {
      id: "o4-mini",
      name: "o4-mini",
      description: "Fast legacy reasoning model",
      effortLevels: [...CODEX_REASONING_LEVELS],
    },
    {
      id: "gpt-4.1",
      name: "GPT-4.1",
      description: "Flagship GPT model",
      effortLevels: [],
    },
    {
      id: "gpt-4.1-mini",
      name: "GPT-4.1 Mini",
      description: "Fast and affordable",
      effortLevels: [],
    },
    {
      id: "gpt-4.1-nano",
      name: "GPT-4.1 Nano",
      description: "Fastest, lowest cost",
      effortLevels: [],
    },
  ],
  effortLevels: [
    { id: "none", name: "None", description: "Skip extra reasoning tokens" },
    { id: "low", name: "Low", description: "Faster, lighter reasoning" },
    { id: "medium", name: "Medium", description: "Balanced depth" },
    { id: "high", name: "High", description: "More deliberate reasoning" },
    {
      id: "xhigh",
      name: "Extra High",
      description: "Maximum depth for the hardest tasks",
    },
  ],
  command: "codex",
  commandCandidates: buildCommandCandidates("codex"),

  buildArgs(prompt: string, _workdir: string): string[] {
    return [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      prompt,
    ];
  },

  buildOneShotInvocation(prompt: string, workdir: string) {
    return {
      command: this.command || "codex",
      args: this.buildArgs ? this.buildArgs(prompt, workdir) : [],
    };
  },

  buildSessionInvocation(prompt: string | undefined, workdir: string) {
    if (prompt?.trim()) {
      return {
        command: this.command || "codex",
        args: this.buildArgs ? this.buildArgs(prompt.trim(), workdir) : [prompt.trim()],
      };
    }

    return {
      command: this.command || "codex",
      args: ["--ephemeral"],
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

      // Check auth status via `codex login status`
      try {
        const cmd = resolveCliCommand(this);
        const output = execSync(`${cmd} login status 2>&1`, {
          encoding: "utf8",
          env: { ...process.env, PATH: RUNTIME_PATH },
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 5000,
        }).trim();

        // Output is e.g. "Logged in using ChatGPT"
        if (output.toLowerCase().startsWith("logged in")) {
          return {
            available: true,
            authenticated: true,
            version: output,
          };
        }

        return {
          available: true,
          authenticated: false,
          error: "Codex CLI is installed but not logged in. Run: codex login",
        };
      } catch {
        return {
          available: true,
          authenticated: false,
          error: "Could not verify login status. Run: codex login",
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

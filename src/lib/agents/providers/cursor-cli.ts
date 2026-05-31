import type { AgentProvider, ProviderStatus } from "../provider-interface";
import {
  checkCliProviderAvailable,
  execCli,
  resolveCliCommand,
} from "../provider-cli";

// Cursor exposes a curated multi-vendor list. Verified 2026-05-03 against
// Cursor's changelog/docs; Composer 2 is the new flagship in-house model
// (launched April 2026). The CLI's `--model` accepts these IDs; `auto` lets
// Cursor route per request.
const CURSOR_MODEL_IDS = [
  { id: "auto", name: "Auto", description: "Let Cursor pick the best model" },
  { id: "composer-2", name: "Composer 2", description: "Cursor's flagship in-house coding model" },
  { id: "composer-1.5", name: "Composer 1.5", description: "Previous Cursor in-house coding model" },
  { id: "gpt-5.5", name: "GPT-5.5", description: "OpenAI's strongest coding model" },
  { id: "gpt-5.4", name: "GPT-5.4" },
  { id: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
  { id: "gpt-5.3-codex-high", name: "GPT-5.3 Codex (High)" },
  { id: "sonnet-4.6", name: "Claude Sonnet 4.6" },
  { id: "opus-4.7", name: "Claude Opus 4.7" },
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro" },
  { id: "gemini-3-flash", name: "Gemini 3 Flash" },
  { id: "grok-4", name: "Grok 4" },
] as const;

export const cursorCliProvider: AgentProvider = {
  id: "cursor-cli",
  name: "Cursor CLI",
  type: "cli",
  icon: "cursor",
  iconAsset: "/providers/cursor.svg",
  installMessage:
    "Cursor Agent CLI not found. Install with: curl https://cursor.com/install -fsSL | bash",
  installSteps: [
    {
      title: "Install Cursor Agent CLI",
      detail: "Run the Cursor install script:",
      command: "curl https://cursor.com/install -fsSL | bash",
    },
    {
      title: "Log in",
      detail: "Authenticate with your Cursor account:",
      command: "cursor-agent login",
      link: {
        label: "Cursor CLI docs",
        url: "https://docs.cursor.com/cli",
      },
    },
    {
      title: "Verify setup",
      detail: "Confirm headless mode works:",
      command: "cursor-agent -p 'Reply with exactly OK' --output-format text --yolo",
    },
  ],
  detachedPromptLaunchMode: "one-shot",
  supportsTerminalResume: true,
  models: CURSOR_MODEL_IDS.map((model) => ({
    id: model.id,
    name: model.name,
    description: "description" in model ? model.description : undefined,
    effortLevels: [],
  })),
  effortLevels: [],
  command: "cursor-agent",
  commandCandidates: [
    `${process.env.HOME || ""}/.local/bin/cursor-agent`,
    `${process.env.HOME || ""}/.cursor/bin/cursor-agent`,
    "/usr/local/bin/cursor-agent",
    "/opt/homebrew/bin/cursor-agent",
    "cursor-agent",
  ],

  buildArgs(prompt: string, _workdir: string): string[] {
    return ["-p", prompt, "--output-format", "text", "--yolo"];
  },

  buildOneShotInvocation(prompt: string, workdir: string, opts) {
    const baseArgs = this.buildArgs ? this.buildArgs(prompt, workdir) : [];
    const args = [...baseArgs];
    if (opts?.model) {
      args.push("--model", opts.model);
    }
    if (opts?.resumeId) {
      args.push("--resume", opts.resumeId);
    }
    return {
      command: this.command || "cursor-agent",
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
          version: version ? `Cursor Agent ${version}` : "Cursor Agent installed",
        };
      } catch {
        return {
          available: true,
          authenticated: false,
          error: "Cursor Agent CLI is installed but version check failed. Run: cursor-agent login",
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

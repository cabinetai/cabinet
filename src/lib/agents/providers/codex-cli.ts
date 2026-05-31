import type { AgentProvider, ProviderStatus } from "../provider-interface";
import {
  checkCliProviderAvailable,
  execCli,
  resolveCliCommand,
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
    { title: "Verify setup", detail: "Confirm headless mode works:", command: "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 'Reply with exactly OK'" },
  ],
  detachedPromptLaunchMode: "one-shot",
  // Models are annotated with `requires` so UI pickers can badge entries the
  // user's current auth mode can't hit. Per OpenAI's Codex models docs
  // (verified 2026-05-03): `gpt-5.5` and `gpt-5.3-codex-spark` are
  // ChatGPT-only; the older `*-codex` / `o*` / `gpt-4.1*` ids are API-key
  // only; the `gpt-5.4`/`gpt-5.4-mini`/`gpt-5.3-codex`/`gpt-5.2` line works
  // with both auth modes.
  models: [
    {
      id: "gpt-5.5",
      name: "GPT-5.5",
      description: "Recommended default — strongest coding model (ChatGPT sign-in only)",
      requires: "chatgpt_plan",
      effortLevels: [...CODEX_EXTENDED_REASONING_LEVELS],
    },
    {
      id: "gpt-5.4",
      name: "GPT-5.4",
      description: "Previous flagship — works with both ChatGPT and API key",
      requires: "any",
      effortLevels: [...CODEX_EXTENDED_REASONING_LEVELS],
    },
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      description: "Faster, lower-cost variant for lighter coding tasks",
      requires: "any",
      effortLevels: [...CODEX_EXTENDED_REASONING_LEVELS],
    },
    {
      id: "gpt-5.3-codex",
      name: "GPT-5.3 Codex",
      description: "Codex-tuned model for agentic coding",
      requires: "any",
      effortLevels: [...CODEX_EXTENDED_REASONING_LEVELS],
    },
    {
      id: "gpt-5.3-codex-spark",
      name: "GPT-5.3 Codex Spark",
      description: "Real-time coding iteration (ChatGPT Pro research preview)",
      requires: "chatgpt_plan",
      effortLevels: [...CODEX_REASONING_LEVELS],
    },
    {
      id: "gpt-5.2",
      name: "GPT-5.2",
      description: "General-purpose GPT-5.2",
      requires: "any",
      effortLevels: [...CODEX_EXTENDED_REASONING_LEVELS],
    },
    {
      id: "gpt-5.2-codex",
      name: "GPT-5.2 Codex",
      description: "Earlier Codex flagship (API-key only)",
      requires: "api_key",
      effortLevels: [...CODEX_EXTENDED_REASONING_LEVELS],
    },
    {
      id: "gpt-5.1-codex-max",
      name: "GPT-5.1 Codex Max",
      description: "High-depth Codex model with extended reasoning (API-key only)",
      requires: "api_key",
      effortLevels: [...CODEX_MAX_REASONING_LEVELS],
    },
    {
      id: "o3",
      name: "o3",
      description: "Most capable legacy reasoning model (API-key only)",
      requires: "api_key",
      effortLevels: [...CODEX_REASONING_LEVELS],
    },
    {
      id: "o4-mini",
      name: "o4-mini",
      description: "Fast legacy reasoning model (API-key only)",
      requires: "api_key",
      effortLevels: [...CODEX_REASONING_LEVELS],
    },
    {
      id: "gpt-4.1",
      name: "GPT-4.1",
      description: "Flagship GPT model (API-key only)",
      requires: "api_key",
      effortLevels: [],
    },
    {
      id: "gpt-4.1-mini",
      name: "GPT-4.1 Mini",
      description: "Fast and affordable (API-key only)",
      requires: "api_key",
      effortLevels: [],
    },
    {
      id: "gpt-4.1-nano",
      name: "GPT-4.1 Nano",
      description: "Fastest, lowest cost (API-key only)",
      requires: "api_key",
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
  commandCandidates: [
    `${process.env.HOME || ""}/.local/bin/codex`,
    "/usr/local/bin/codex",
    "/opt/homebrew/bin/codex",
    "codex",
  ],

  buildArgs(prompt: string, _workdir: string): string[] {
    return [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      prompt,
    ];
  },

  buildOneShotInvocation(prompt: string, workdir: string, opts) {
    const baseArgs = this.buildArgs ? this.buildArgs(prompt, workdir) : [];
    const args = [...baseArgs];
    if (opts?.model) {
      args.unshift("--model", opts.model);
    }
    if (opts?.effort) {
      args.unshift("-c", `model_reasoning_effort=${opts.effort}`);
    }
    return {
      command: this.command || "codex",
      args,
    };
  },

  buildSessionInvocation(
    prompt: string | undefined,
    _workdir: string,
    opts
  ) {
    // Interactive TUI mode. Previously this wrapped the prompt with
    // `buildArgs` which produces `codex exec … <prompt>` — but `codex exec`
    // is the HEADLESS one-shot subcommand, so users who picked "terminal
    // mode" were getting the non-interactive run piped through a PTY. The
    // interactive TUI is invoked with no subcommand (bare `codex`), and the
    // daemon pastes `initialPrompt` into the TUI once it's ready.
    const args: string[] = [];
    if (opts?.resumeId) {
      // `codex resume <session-id>` rehydrates a prior interactive session.
      args.push("resume", opts.resumeId);
    }
    return {
      command: this.command || "codex",
      args,
      initialPrompt: prompt?.trim() || undefined,
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
        const output = await execCli(cmd, ["login", "status"], {
          timeout: 5000,
          captureStderr: true,
        });

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

import fs from "fs";
import os from "os";
import path from "path";
import type { AgentProvider, ProviderStatus } from "../provider-interface";
import {
  checkCliProviderAvailable,
  execCli,
  resolveCliCommand,
} from "../provider-cli";

// `grok login` writes credentials here (mode 0600). Its presence means the
// user signed in with their X account — no XAI_API_KEY needed. Checked so a
// browser-logged-in user shows as authenticated, not "not logged in".
function hasGrokBrowserAuth(): boolean {
  try {
    return fs.statSync(path.join(os.homedir(), ".grok", "auth.json")).size > 0;
  } catch {
    return false;
  }
}

// Verified 2026-07-11 against xAI's Grok Build docs (x.ai/cli). grok-4.5 is
// the model that powers Grok Build and is xAI's current recommended default;
// the 4.x-fast line covers cost-sensitive high-volume use; Grok 3 has been
// retired from the recommended catalog so it's no longer listed here.
const GROK_MODELS = [
  {
    id: "grok-4.5",
    name: "Grok 4.5",
    description: "xAI's recommended default: powers Grok Build, most intelligent",
  },
  {
    id: "grok-4.3",
    name: "Grok 4.3",
    description: "Previous flagship: fast, intelligent (1M context)",
  },
  { id: "grok-4", name: "Grok 4", description: "Frontier reasoning workloads" },
  {
    id: "grok-4-fast",
    name: "Grok 4 Fast",
    description: "Fast, cost-efficient Grok 4 for high-volume use",
  },
  {
    id: "grok-4.1-fast",
    name: "Grok 4.1 Fast",
    description: "Cheapest Grok 4.x: high-throughput, low-latency",
  },
  {
    id: "grok-code-fast-1",
    name: "Grok Code Fast 1",
    description: "Fast code-focused Grok model for agentic coding",
  },
] as const;

export const grokCliProvider: AgentProvider = {
  id: "grok-cli",
  name: "Grok CLI",
  type: "cli",
  icon: "grok",
  iconAsset: "/providers/grok.svg",
  installMessage:
    "Grok CLI not found. Install with: curl -fsSL https://x.ai/cli/install.sh | bash",
  installSteps: [
    {
      title: "Install Grok CLI",
      detail: "Install xAI's official Grok CLI (grok):",
      command: "curl -fsSL https://x.ai/cli/install.sh | bash",
      link: { label: "Grok CLI docs", url: "https://x.ai/cli" },
    },
    {
      title: "Log in",
      detail: "Sign in with your X account: open the link shown, approve, then come back.",
      // device-auth prints a URL + code rather than depending on a browser
      // auto-opening (which is unreliable inside Electron). Cabinet surfaces the
      // URL with Open/Copy buttons.
      command: "grok login --device-auth",
    },
    {
      title: "Verify setup",
      detail: "Confirm headless mode works:",
      command: "grok -p 'Reply with exactly OK'",
    },
    {
      title: "Or use an API key",
      detail:
        "Prefer a key instead of browser sign-in? Add XAI_API_KEY (from the xAI Console) to your shell so agent runs can authenticate.",
      command: "export XAI_API_KEY=xai-...",
      link: { label: "Open xAI Console", url: "https://console.x.ai/" },
    },
  ],
  detachedPromptLaunchMode: "one-shot",
  models: GROK_MODELS.map((model) => ({
    id: model.id,
    name: model.name,
    description: model.description,
    effortLevels: [],
  })),
  effortLevels: [],
  command: "grok",
  commandCandidates: [
    `${process.env.HOME || ""}/.local/bin/grok`,
    "/usr/local/bin/grok",
    "/opt/homebrew/bin/grok",
    "grok",
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
    return {
      command: this.command || "grok",
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

      // Authenticated if the user signed in with `grok login` (auth.json) OR
      // set an API key. Either path lets agent runs reach the model.
      const authed =
        hasGrokBrowserAuth() ||
        Boolean(process.env.XAI_API_KEY?.trim()) ||
        Boolean(process.env.GROK_API_KEY?.trim());

      const notAuthedError =
        "Grok is installed but not signed in. Run `grok login` (or set XAI_API_KEY).";

      try {
        const cmd = resolveCliCommand(this);
        const version = await execCli(cmd, ["--version"], { timeout: 5000 });
        return {
          available: true,
          authenticated: authed,
          version: version ? `Grok CLI ${version}` : "Grok CLI installed",
          error: authed ? undefined : notAuthedError,
        };
      } catch {
        return {
          available: true,
          authenticated: authed,
          error: authed ? undefined : notAuthedError,
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

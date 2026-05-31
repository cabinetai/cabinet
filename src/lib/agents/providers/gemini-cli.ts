import fs from "fs";
import path from "path";
import type { AgentProvider, ProviderStatus } from "../provider-interface";
import {
  checkCliProviderAvailable,
  execCli,
  resolveCliCommand,
} from "../provider-cli";
import { getNvmNodeBin } from "../nvm-path";

const nvmGeminiPath = (() => {
  const bin = getNvmNodeBin();
  return bin ? `${bin}/gemini` : null;
})();

function fileExists(filePath: string | undefined): boolean {
  if (!filePath) return false;
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function detectGeminiAuthSource(): string | null {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return "Configured via API key";
  }

  const serviceAccountPath =
    typeof process.env.GOOGLE_APPLICATION_CREDENTIALS === "string"
      ? process.env.GOOGLE_APPLICATION_CREDENTIALS
      : undefined;
  if (fileExists(serviceAccountPath)) {
    return "Configured via service account";
  }

  const oauthCredsPath = path.join(process.env.HOME || "", ".gemini", "oauth_creds.json");
  const googleAccountPath = path.join(process.env.HOME || "", ".gemini", "google_account_id");
  if (fileExists(oauthCredsPath) || fileExists(googleAccountPath)) {
    return "Signed in with Google";
  }

  const adcPath = path.join(
    process.env.HOME || "",
    ".config",
    "gcloud",
    "application_default_credentials.json"
  );
  if (
    fileExists(adcPath) &&
    typeof process.env.GOOGLE_CLOUD_PROJECT === "string" &&
    process.env.GOOGLE_CLOUD_PROJECT.trim()
  ) {
    return "Configured via Vertex AI";
  }

  return null;
}

export const geminiCliProvider: AgentProvider = {
  id: "gemini-cli",
  name: "Gemini CLI",
  type: "cli",
  icon: "gemini",
  installMessage:
    "Gemini CLI not found. Install with: npm i -g @google/gemini-cli",
  installSteps: [
    {
      title: "Install Gemini CLI",
      detail: "Install the latest version (Cabinet needs 0.14+ for stream-json output):",
      command: "npm i -g @google/gemini-cli@latest",
    },
    {
      title: "Log in",
      detail:
        "Start Gemini and choose Sign in with Google, or configure GEMINI_API_KEY for headless use.",
      command: "gemini",
      link: {
        label: "Open Gemini auth guide",
        url: "https://geminicli.com/docs/get-started/authentication",
      },
    },
    {
      title: "Verify setup",
      detail:
        "Confirm headless mode works. If `Unknown arguments: output-format` appears, upgrade with `npm i -g @google/gemini-cli@latest` first.",
      command: "gemini -p 'Reply with exactly OK' --yolo",
    },
  ],
  detachedPromptLaunchMode: "one-shot",
  // Gemini 3 Pro Preview was deprecated 2026-03-09 — `gemini-3.1-pro-preview`
  // is the active flagship preview. Verified against Gemini CLI docs and
  // Google's model docs on 2026-05-03.
  models: [
    {
      id: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro Preview",
      description: "Most capable Gemini preview model when access is enabled",
      effortLevels: [],
    },
    {
      id: "gemini-3-flash-preview",
      name: "Gemini 3 Flash Preview",
      description: "Fast Gemini 3 preview for high-frequency terminal workflows",
      effortLevels: [],
    },
    {
      id: "gemini-3.1-flash-lite",
      name: "Gemini 3.1 Flash Lite",
      description: "Lightweight Gemini 3.1 for lower-cost runs",
      effortLevels: [],
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      description: "Stable high-depth Gemini model",
      effortLevels: [],
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      description: "Fast stable Gemini model",
      effortLevels: [],
    },
    {
      id: "gemini-2.5-flash-lite",
      name: "Gemini 2.5 Flash Lite",
      description: "Lightweight stable Gemini for lower-cost runs",
      effortLevels: [],
    },
  ],
  command: "gemini",
  commandCandidates: [
    `${process.env.HOME || ""}/.local/bin/gemini`,
    "/usr/local/bin/gemini",
    "/opt/homebrew/bin/gemini",
    ...(nvmGeminiPath ? [nvmGeminiPath] : []),
    "gemini",
  ],

  buildArgs(prompt: string, workdir: string): string[] {
    void workdir;
    return [
      "-p",
      prompt,
      "--output-format",
      "text",
      "--yolo",
      "--sandbox",
      "false",
    ];
  },

  buildOneShotInvocation(prompt: string, workdir: string, opts) {
    const baseArgs = this.buildArgs ? this.buildArgs(prompt, workdir) : [];
    const args = [...baseArgs];
    if (opts?.model) {
      args.push("-m", opts.model);
    }
    return {
      command: this.command || "gemini",
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

      const authSource = detectGeminiAuthSource();
      if (authSource) {
        return {
          available: true,
          authenticated: true,
          version: authSource,
        };
      }

      try {
        const cmd = resolveCliCommand(this);
        const version = await execCli(cmd, ["--version"], { timeout: 5000 });

        return {
          available: true,
          authenticated: false,
          error: "Gemini CLI is installed but not authenticated. Run: gemini",
          version: version ? `Gemini CLI ${version}` : undefined,
        };
      } catch {
        return {
          available: true,
          authenticated: false,
          error: "Gemini CLI is installed but not authenticated. Run: gemini",
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

import { AgentProvider, ProviderStatus, ProviderModel } from "../provider-interface";
import { checkCliProviderAvailable, execCli, resolveCliCommand } from "../provider-cli";

export const ollamaProvider: AgentProvider = {
  id: "ollama",
  name: "Ollama",
  type: "cli",
  icon: "ollama",
  installMessage: "Ollama not found. Install from https://ollama.com",
  installSteps: [
    {
      title: "Install Ollama",
      detail: "Download and install Ollama for your operating system:",
      link: {
        label: "Download Ollama",
        url: "https://ollama.com/download"
      }
    },
    {
      title: "Pull a model",
      detail: "Pull a model to use with Ollama, for example llama3:",
      command: "ollama pull llama3"
    }
  ],
  detachedPromptLaunchMode: "one-shot",
  command: "ollama",
  commandCandidates: [
    "/usr/local/bin/ollama",
    "/opt/homebrew/bin/ollama",
    "ollama"
  ],

  buildOneShotInvocation(prompt: string, workdir: string, opts) {
    void workdir;
    const model = opts?.model || "llama3";
    return {
      command: this.command || "ollama",
      args: ["run", model, prompt],
    };
  },

  buildSessionInvocation(prompt: string | undefined, workdir: string, opts) {
    void workdir;
    const model = opts?.model || "llama3";
    const args = ["run", model];
    return {
      command: this.command || "ollama",
      args,
      initialPrompt: prompt,
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

      // Check if Ollama API server is reachable
      try {
        const response = await fetch("http://127.0.0.1:11434/api/version", { signal: AbortSignal.timeout(2000) });
        if (response.ok) {
          const data = await response.json() as { version: string };
          return {
            available: true,
            authenticated: true,
            version: `Ollama ${data.version}`,
          };
        }
      } catch {
        // Fallback to CLI version check if HTTP fails
        try {
          const cmd = resolveCliCommand(this);
          const versionOutput = await execCli(cmd, ["--version"], { timeout: 2000 });
          return {
            available: true,
            authenticated: true,
            version: versionOutput,
          };
        } catch {
          // ignore
        }
      }

      return {
        available: true,
        authenticated: true, // Local provider needs no auth
      };
    } catch (error) {
      return {
        available: false,
        authenticated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },

  async listModels(): Promise<ProviderModel[]> {
    try {
      // Fetch models dynamically from local Ollama instance
      const response = await fetch("http://127.0.0.1:11434/api/tags", {
        signal: AbortSignal.timeout(3000),
        cache: "no-store"
      });
      if (!response.ok) {
        return [];
      }
      const data = await response.json() as { models: Array<{ name: string; details?: { parameter_size?: string } }> };
      
      return (data.models || []).map((m) => ({
        id: m.name,
        name: m.name,
        description: m.details?.parameter_size ? `Local model (${m.details.parameter_size})` : "Local model",
      }));
    } catch {
      // If the API server is down or unreachable, return empty list.
      return [];
    }
  }
};

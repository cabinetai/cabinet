import type { AgentProvider, ProviderStatus } from "../provider-interface";

const MINIMAX_BASE_URL = "https://api.minimax.io/v1";

export const minimaxApiProvider: AgentProvider = {
  id: "minimax-api",
  name: "MiniMax",
  type: "api",
  icon: "minimax",
  installMessage:
    "MiniMax API key not found. Set MINIMAX_API_KEY in your environment to enable this provider.",
  installSteps: [
    {
      title: "Get a MiniMax API key",
      detail: "Sign up and create an API key at the MiniMax platform.",
      link: { label: "Open MiniMax platform", url: "https://platform.minimax.io" },
    },
    {
      title: "Set the API key",
      detail: "Add the key to your environment:",
      command: "export MINIMAX_API_KEY=your_api_key_here",
    },
  ],
  models: [
    {
      id: "MiniMax-M3",
      name: "MiniMax M3",
      description:
        "Latest model. 512K context, up to 128K output, image input support",
    },
    {
      id: "MiniMax-M2.7",
      name: "MiniMax M2.7",
      description: "Peak Performance. Ultimate Value. Master the Complex",
    },
    {
      id: "MiniMax-M2.7-highspeed",
      name: "MiniMax M2.7 Highspeed",
      description: "Same performance, faster and more agile",
    },
  ],
  apiKeyEnvVar: "MINIMAX_API_KEY",

  async isAvailable(): Promise<boolean> {
    return !!(process.env.MINIMAX_API_KEY && process.env.MINIMAX_API_KEY.trim());
  },

  async healthCheck(): Promise<ProviderStatus> {
    const apiKey = process.env.MINIMAX_API_KEY?.trim();
    if (!apiKey) {
      return {
        available: false,
        authenticated: false,
        error: this.installMessage,
      };
    }

    try {
      const response = await fetch(`${MINIMAX_BASE_URL}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        return { available: true, authenticated: true, version: "MiniMax API" };
      }

      if (response.status === 401) {
        return {
          available: true,
          authenticated: false,
          error: "Invalid MINIMAX_API_KEY. Check your API key and try again.",
        };
      }

      return {
        available: true,
        authenticated: true,
        version: "MiniMax API",
      };
    } catch {
      // If the models endpoint fails, we still consider it available if the key is set
      return {
        available: true,
        authenticated: true,
        version: "MiniMax API",
      };
    }
  },

  async runPrompt(prompt: string, _context: string): Promise<string> {
    const apiKey = process.env.MINIMAX_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("MINIMAX_API_KEY is not set");
    }

    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "MiniMax-M3",
        messages: [{ role: "user", content: prompt }],
        temperature: 1.0,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `MiniMax API request failed with status ${response.status}: ${errorText}`
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("MiniMax API returned an empty response");
    }

    return content;
  },
};

import type { AgentProvider, ProviderModel, ProviderStatus } from "../provider-interface";

const OPENROUTER_EFFORT_LEVELS = [
  { id: "none", name: "None", description: "Disable reasoning tokens when supported" },
  { id: "minimal", name: "Minimal", description: "Minimal reasoning" },
  { id: "low", name: "Low", description: "Light reasoning" },
  { id: "medium", name: "Medium", description: "Balanced reasoning" },
  { id: "high", name: "High", description: "Deep reasoning" },
  { id: "xhigh", name: "Extra High", description: "Maximum reasoning when supported" },
] as const;

const OPENROUTER_FALLBACK_MODELS: ProviderModel[] = [
  {
    id: "openrouter/auto",
    name: "OpenRouter Auto",
    description: "Automatically routes to a suitable OpenRouter model.",
    effortLevels: [...OPENROUTER_EFFORT_LEVELS],
  },
];

function apiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

function baseUrl(): string {
  return (process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(
    /\/+$/,
    ""
  );
}

export const openRouterProvider: AgentProvider = {
  id: "openrouter",
  name: "OpenRouter",
  type: "api",
  icon: "bot",
  installMessage: "Set OPENROUTER_API_KEY in the Optale Agents environment.",
  installSteps: [
    {
      title: "Create an OpenRouter key",
      detail: "Create an API key in OpenRouter.",
      link: { label: "OpenRouter keys", url: "https://openrouter.ai/keys" },
    },
    {
      title: "Set the API key",
      detail: "Expose the key to the web and daemon processes.",
      command: "export OPENROUTER_API_KEY=sk-or-...",
    },
    {
      title: "Pick a model",
      detail:
        "Use openrouter/auto or any model id from OpenRouter's model list. Tool calls are executed by Optale Agents.",
      link: { label: "OpenRouter models", url: "https://openrouter.ai/models" },
    },
  ],
  detachedPromptLaunchMode: "one-shot",
  models: OPENROUTER_FALLBACK_MODELS,
  effortLevels: [...OPENROUTER_EFFORT_LEVELS],
  apiKeyEnvVar: "OPENROUTER_API_KEY",

  async listModels(): Promise<ProviderModel[]> {
    const key = apiKey();
    if (!key || typeof fetch !== "function") return OPENROUTER_FALLBACK_MODELS;

    const response = await fetch(`${baseUrl()}/models`, {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
    if (!response.ok) return OPENROUTER_FALLBACK_MODELS;

    const json = (await response.json()) as {
      data?: Array<{ id?: unknown; name?: unknown; description?: unknown }>;
    };
    const models = (json.data || [])
      .flatMap((model) => {
        if (typeof model.id !== "string" || !model.id.trim()) return [];
        return [
          {
            id: model.id,
            name: typeof model.name === "string" && model.name.trim() ? model.name : model.id,
            description:
              typeof model.description === "string" && model.description.trim()
                ? model.description
                : undefined,
            effortLevels: [...OPENROUTER_EFFORT_LEVELS],
          },
        ];
      })
      .slice(0, 500);

    return models.length > 0 ? models : OPENROUTER_FALLBACK_MODELS;
  },

  async isAvailable(): Promise<boolean> {
    return Boolean(apiKey());
  },

  async healthCheck(): Promise<ProviderStatus> {
    const key = apiKey();
    if (!key) {
      return {
        available: false,
        authenticated: false,
        error: "OPENROUTER_API_KEY is not set.",
      };
    }

    return {
      available: true,
      authenticated: true,
      version: "OpenRouter API key configured",
    };
  },
};

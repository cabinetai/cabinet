import type { AgentProvider } from "@/lib/agents/provider-interface";
import { geminiApiHealthCheck } from "@/lib/agents/providers/gemini-api-auth";

const GEMINI_MODELS = [
  {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    description: "Fast Gemini model for general-purpose generation",
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    description: "High-capability Gemini preview model",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Stable fast Gemini model",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Stable high-capability Gemini model",
  },
] as const;

export const geminiApiProvider: AgentProvider = {
  id: "gemini-api",
  name: "Gemini API",
  type: "api",
  icon: "gemini",
  iconAsset: "/providers/gemini.svg",
  apiKeyEnvVar: "GOOGLE_AI_API_KEY",
  installSteps: [
    {
      title: "Create a Google AI Studio API key",
      detail: "Create an API key and save it in Cabinet's API Keys settings.",
      link: {
        label: "Open Google AI Studio",
        url: "https://aistudio.google.com/app/apikey",
      },
    },
  ],
  models: [...GEMINI_MODELS],
  isAvailable: async () => true,
  healthCheck: async () => geminiApiHealthCheck(),
};

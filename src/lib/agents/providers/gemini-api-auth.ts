import { readCabinetEnvFile } from "@/lib/runtime/cabinet-env";
import type { ProviderStatus } from "@/lib/agents/provider-interface";

export const GEMINI_API_KEY_ENV_VAR = "GOOGLE_AI_API_KEY";

export function getGeminiApiKey(env?: Record<string, string>): string | null {
  const fromContext = env?.[GEMINI_API_KEY_ENV_VAR]?.trim();
  if (fromContext) return fromContext;

  const fromProcess = process.env[GEMINI_API_KEY_ENV_VAR]?.trim();
  if (fromProcess) return fromProcess;

  return readCabinetEnvFile().values[GEMINI_API_KEY_ENV_VAR]?.trim() || null;
}

export function geminiApiHealthCheck(): ProviderStatus {
  const authenticated = Boolean(getGeminiApiKey());
  return {
    available: true,
    authenticated,
    version: "Vercel AI SDK / Google Gemini API",
    ...(authenticated
      ? {}
      : { error: `Missing ${GEMINI_API_KEY_ENV_VAR}. Add it in Settings → API Keys.` }),
  };
}

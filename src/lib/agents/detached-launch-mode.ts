import type { AgentProvider } from "./provider-interface";

export type DetachedLaunchMode = "session" | "one-shot";

export function resolveDetachedPromptLaunchMode(
  provider: AgentProvider,
  prompt?: string
): DetachedLaunchMode {
  if (!prompt?.trim()) {
    return "session";
  }

  return provider.detachedPromptLaunchMode || "one-shot";
}

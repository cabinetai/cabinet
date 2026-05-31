/**
 * Shared filters for deciding which providers surface where in the UI.
 *
 * Historically UI surfaces hardcoded `provider.type === "cli"` because the
 * adapter runtime only shipped CLI-backed providers. When API-backed providers
 * land (Anthropic API, OpenAI API, etc.) they'll reuse this filter so that
 * flipping a single predicate here lights them up across onboarding, settings,
 * providers-demo, agents-workspace, and the composer — instead of hunting
 * every call site.
 *
 * Note: the server-side provider registry already fully supports API
 * providers (see `provider-runtime.ts` runPrompt branch). The gate is purely
 * UX: without install steps, verify commands, model metadata, and a runtime
 * picker entry tailored to API providers, surfacing them to users would
 * expose half-built experiences.
 */

export interface ProviderTypeInfo {
  type: "cli" | "api";
}

/**
 * Whether a provider should be shown in user-facing runtime surfaces today.
 * Returns `true` for CLI providers; returns `false` for API providers until
 * we flip the switch. Kept intentionally simple — if you need additional
 * gating (enabled / available / authenticated) compose with `isProviderReady`.
 */
export function isAgentProviderSelectable(provider: ProviderTypeInfo): boolean {
  return provider.type === "cli";
}

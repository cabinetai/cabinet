export const HERMES_PROVIDER_ID = "hermes";
export const HERMES_ADAPTER_TYPE = "hermes_runtime";
export const DEFAULT_HERMES_PROFILE = "operator-os";

type PersonaRecord = object & { slug?: string };

export function projectHermesPersona<T extends PersonaRecord>(
  persona: T
): T & { provider: string; adapterType: string } {
  return {
    ...persona,
    ...(persona.slug === "editor"
      ? {
          name: "Operator",
          role: "Hermes operator for this Cabinet",
          emoji: "⚡",
        }
      : {}),
    provider: HERMES_PROVIDER_ID,
    adapterType: HERMES_ADAPTER_TYPE,
  } as T & { provider: string; adapterType: string };
}

export function enforceHermesPersonaWrite<T extends Record<string, unknown>>(
  data: T
): T & { provider: string; adapterType: string } {
  return {
    ...data,
    provider: HERMES_PROVIDER_ID,
    adapterType: HERMES_ADAPTER_TYPE,
  };
}

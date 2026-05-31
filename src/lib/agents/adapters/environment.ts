import type { ProviderStatus } from "../provider-interface";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestResult,
} from "./types";

export function providerStatusToEnvironmentTest(
  adapterType: string,
  providerStatus: ProviderStatus,
  installMessage?: string
): AdapterEnvironmentTestResult {
  const checks: AdapterEnvironmentCheck[] = [
    {
      code: "provider_available",
      level: providerStatus.available ? "info" : "error",
      message: providerStatus.available
        ? "Provider command is available."
        : providerStatus.error || installMessage || "Provider is not installed or not on PATH.",
      ...(providerStatus.available
        ? { detail: providerStatus.version || null }
        : { hint: installMessage || null }),
    },
  ];

  if (providerStatus.available) {
    checks.push({
      code: "provider_authenticated",
      level: providerStatus.authenticated ? "info" : "warn",
      message: providerStatus.authenticated
        ? "Provider authentication is ready."
        : providerStatus.error || "Provider is installed but not authenticated yet.",
      detail: providerStatus.version || providerStatus.error || null,
    });
  }

  const status = checks.some((check) => check.level === "error")
    ? "fail"
    : checks.some((check) => check.level === "warn")
      ? "warn"
      : "pass";

  return {
    adapterType,
    status,
    checks,
    testedAt: new Date().toISOString(),
  };
}

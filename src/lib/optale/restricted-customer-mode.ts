import { NextResponse } from "next/server";
import type { CabinetVisibilityMode } from "@/types/cabinets";
import {
  agentAdapterRegistry,
  defaultAdapterTypeForProvider,
  isLegacyAdapterType,
} from "@/lib/agents/adapters";
import { isOptaleRestrictedCustomerMode } from "./runtime-mode";

export const RESTRICTED_CUSTOMER_MODE_ERROR = "OptaleRestrictedCustomerMode";

export interface RestrictedModeDenial {
  code: string;
  capability: string;
  message: string;
}

export const RESTRICTED_COMMAND_CENTER_ALLOWED_ACTIONS = new Set([
  "review_actions",
]);

function csvSet(value: string | undefined): Set<string> {
  return new Set(
    (value || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function restrictedCustomerModeBody(
  capability: string,
  message?: string,
) {
  return {
    error: RESTRICTED_CUSTOMER_MODE_ERROR,
    capability,
    mode: "restricted_customer",
    message:
      message ||
      `${capability} is disabled while Optale restricted customer mode is active.`,
  };
}

export function restrictedCustomerModeResponse(
  capability: string,
  message?: string,
): NextResponse {
  return NextResponse.json(restrictedCustomerModeBody(capability, message), {
    status: 403,
    headers: { "Cache-Control": "no-store" },
  });
}

export function restrictedCapabilityDenial(
  capability: string,
  message?: string,
  env: NodeJS.ProcessEnv = process.env,
): RestrictedModeDenial | null {
  if (!isOptaleRestrictedCustomerMode(env)) return null;
  return {
    code: `restricted_customer_${capability.replaceAll(".", "_")}`,
    capability,
    message:
      message ||
      `${capability} is operator-only in restricted customer mode.`,
  };
}

export function isCommandCenterActionAllowedInRestrictedCustomerMode(
  action: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isOptaleRestrictedCustomerMode(env)) return true;
  return Boolean(action && RESTRICTED_COMMAND_CENTER_ALLOWED_ACTIONS.has(action));
}

export function commandCenterRestrictedDenial(
  action: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): RestrictedModeDenial | null {
  if (isCommandCenterActionAllowedInRestrictedCustomerMode(action, env)) {
    return null;
  }
  const actionName = action || "unknown";
  return {
    code: "restricted_customer_command_center_action",
    capability: `command_center.${actionName}`,
    message:
      `Command Center action "${actionName}" is operator-only in restricted customer mode. ` +
      "Use the reviewed action-approval path or switch to operator mode.",
  };
}

export function restrictedCustomerVisibilityMode(
  requested: CabinetVisibilityMode | undefined,
  env: NodeJS.ProcessEnv = process.env,
): CabinetVisibilityMode {
  if (!isOptaleRestrictedCustomerMode(env)) return requested || "own";
  return "own";
}

export function restrictedAllowedAdapterTypes(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const configured = csvSet(env.OPTALE_RESTRICTED_ALLOWED_ADAPTERS);
  if (configured.size > 0) return configured;
  return new Set(["openrouter_api"]);
}

export function restrictedAgentRuntimeDenial(
  input: {
    providerId?: string | null;
    adapterType?: string | null;
    runtimeMode?: "native" | "terminal" | null;
  },
  env: NodeJS.ProcessEnv = process.env,
): RestrictedModeDenial | null {
  if (!isOptaleRestrictedCustomerMode(env)) return null;

  if (input.runtimeMode === "terminal") {
    return {
      code: "restricted_customer_terminal_runtime",
      capability: "agent_runtime.terminal",
      message:
        "Terminal/PTY agent runtime is disabled in restricted customer mode.",
    };
  }

  const adapterType =
    typeof input.adapterType === "string" && input.adapterType.trim()
      ? input.adapterType.trim()
      : typeof input.providerId === "string" && input.providerId.trim()
        ? defaultAdapterTypeForProvider(input.providerId.trim())
        : undefined;

  if (!adapterType) {
    return {
      code: "restricted_customer_unresolved_adapter",
      capability: "agent_runtime.unresolved",
      message:
        "Agent runtime must resolve to an explicitly allowed adapter in restricted customer mode.",
    };
  }

  if (adapterType === "shell" || isLegacyAdapterType(adapterType)) {
    return {
      code: "restricted_customer_shell_or_legacy_adapter",
      capability: `agent_runtime.${adapterType}`,
      message:
        `Adapter "${adapterType}" is operator-only in restricted customer mode.`,
    };
  }

  const allowed = restrictedAllowedAdapterTypes(env);
  if (!allowed.has(adapterType)) {
    const adapter = agentAdapterRegistry.get(adapterType);
    return {
      code: "restricted_customer_adapter_not_allowed",
      capability: `agent_runtime.${adapterType}`,
      message:
        `Adapter "${adapterType}"` +
        (adapter ? ` (${adapter.executionEngine})` : "") +
        " is not allowed in restricted customer mode.",
    };
  }

  return null;
}

export function restrictedModeDenialResponse(
  denial: RestrictedModeDenial | null,
): NextResponse | null {
  if (!denial) return null;
  return restrictedCustomerModeResponse(denial.capability, denial.message);
}

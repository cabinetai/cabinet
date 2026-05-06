import {
  OPTALE_CONSOLE_ROLE_LABELS,
  type OptaleIdentitySnapshot,
} from "@/lib/optale/identity-shared";

export function identityRoleLabel(identity: OptaleIdentitySnapshot | null): string {
  if (!identity) return "Loading";
  return OPTALE_CONSOLE_ROLE_LABELS[identity.role];
}

export function identitySourceLabel(
  identity: OptaleIdentitySnapshot | null,
): string {
  if (!identity) return "Loading";
  if (identity.source === "trusted-proxy") return "Authelia";
  if (identity.source === "legacy-password") return "Password gate";
  if (identity.source === "desktop") return "Desktop";
  if (identity.source === "local-dev") return "Local dev";
  if (identity.source === "better-auth") return "Better Auth";
  return "Anonymous";
}

export function identityNameLabel(
  identity: OptaleIdentitySnapshot | null,
): string {
  if (!identity) return "Loading";
  return identity.name || identity.email || identity.subject || "Anonymous";
}

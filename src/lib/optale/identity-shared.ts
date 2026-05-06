export type OptaleConsoleRole = "admin" | "operator" | "engineer" | "viewer";

export type OptaleIdentityProvider =
  | "authelia"
  | "better-auth"
  | "cabinet-password"
  | "local"
  | "anonymous";

export type OptaleIdentitySource =
  | "trusted-proxy"
  | "better-auth"
  | "legacy-password"
  | "desktop"
  | "local-dev"
  | "anonymous";

export const OPTALE_CONSOLE_PERMISSIONS = [
  "console.read",
  "command.run",
  "objects.read",
  "agents.read",
  "agents.manage",
  "brain.read",
  "brain.promote",
  "observatory.read",
  "settings.read",
  "settings.manage",
  "integrations.manage",
  "provisioning.manage",
  "audit.export",
  "terminal.open",
  "control_plane.read",
  "control_plane.write",
] as const;

export type OptaleConsolePermission =
  (typeof OPTALE_CONSOLE_PERMISSIONS)[number];

export type OptaleIdentitySnapshot = {
  authenticated: boolean;
  provider: OptaleIdentityProvider;
  source: OptaleIdentitySource;
  subject: string | null;
  email: string | null;
  name: string | null;
  groups: string[];
  role: OptaleConsoleRole;
  permissions: OptaleConsolePermission[];
};

export const OPTALE_CONSOLE_ROLE_LABELS: Record<OptaleConsoleRole, string> = {
  admin: "Admin",
  operator: "Operator",
  engineer: "Engineer",
  viewer: "Viewer",
};

const ROLE_PERMISSIONS: Record<
  OptaleConsoleRole,
  readonly OptaleConsolePermission[]
> = {
  admin: OPTALE_CONSOLE_PERMISSIONS,
  engineer: [
    "console.read",
    "command.run",
    "objects.read",
    "agents.read",
    "agents.manage",
    "brain.read",
    "brain.promote",
    "observatory.read",
    "settings.read",
    "integrations.manage",
    "terminal.open",
    "control_plane.read",
    "control_plane.write",
  ],
  operator: [
    "console.read",
    "command.run",
    "objects.read",
    "agents.read",
    "brain.read",
    "observatory.read",
    "settings.read",
  ],
  viewer: [
    "console.read",
    "objects.read",
    "agents.read",
    "brain.read",
    "observatory.read",
  ],
};

export function normalizeOptaleConsoleRole(
  value: unknown,
): OptaleConsoleRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "admin" ||
    normalized === "operator" ||
    normalized === "engineer" ||
    normalized === "viewer"
  ) {
    return normalized;
  }
  if (normalized === "fde" || normalized === "engineering") return "engineer";
  if (normalized === "read-only" || normalized === "readonly") return "viewer";
  return null;
}

export function permissionsForOptaleRole(
  role: OptaleConsoleRole,
): OptaleConsolePermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function optaleRoleHasPermission(
  role: OptaleConsoleRole,
  permission: OptaleConsolePermission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function anonymousOptaleIdentity(): OptaleIdentitySnapshot {
  return {
    authenticated: false,
    provider: "anonymous",
    source: "anonymous",
    subject: null,
    email: null,
    name: null,
    groups: [],
    role: "viewer",
    permissions: permissionsForOptaleRole("viewer"),
  };
}

import {
  OPTALE_CONSOLE_PERMISSIONS,
  OPTALE_CONSOLE_ROLE_LABELS,
  optaleRoleHasPermission,
  type OptaleConsolePermission,
  type OptaleConsoleRole,
  type OptaleIdentitySnapshot,
} from "./identity-shared";
import {
  OPTALE_CONSOLE_ROLE_ORDER,
  type OptaleConsoleMemberPrincipal,
  type OptaleConsoleMemberRow,
  type OptaleConsoleMembersPayload,
  type OptaleConsolePermissionRow,
  type OptaleConsolePermissionsPayload,
} from "./console-admin-shared";
import {
  ensureOptaleConsoleIdentityMember,
  listOptaleConsoleMembers,
  optaleConsoleMemberIdForIdentity,
  type OptaleStoredConsoleMember,
} from "./member-registry";

type RuntimeEnv = Partial<Record<string, string | undefined>>;
type MembersPayloadOptions = {
  syncIdentityMember?: boolean;
};

const PERMISSION_LABELS: Record<
  OptaleConsolePermission,
  { area: string; label: string }
> = {
  "console.read": { area: "Console", label: "Read Console" },
  "command.run": { area: "Command", label: "Run Command" },
  "objects.read": { area: "Objects", label: "Read Objects" },
  "agents.read": { area: "Agents", label: "Read Agents" },
  "agents.manage": { area: "Agents", label: "Manage Agents" },
  "brain.read": { area: "Brain", label: "Read Brain" },
  "brain.promote": { area: "Brain", label: "Promote Brain Documents" },
  "observatory.read": { area: "Observatory", label: "Read Observatory" },
  "settings.read": { area: "Settings", label: "Read Settings" },
  "settings.manage": { area: "Settings", label: "Manage Settings" },
  "integrations.manage": {
    area: "Settings",
    label: "Manage Integrations",
  },
  "provisioning.manage": {
    area: "Settings",
    label: "Manage Provisioning",
  },
  "audit.export": { area: "Audit", label: "Export Audit" },
  "terminal.open": { area: "Terminal", label: "Open Terminal" },
  "control_plane.read": {
    area: "Control Plane",
    label: "Read Control Plane",
  },
  "control_plane.write": {
    area: "Control Plane",
    label: "Write Control Plane",
  },
};

function generatedAt(now: Date): string {
  return now.toISOString();
}

function envConfigured(env: RuntimeEnv, keys: string[]): boolean {
  return keys.some((key) => Boolean((env[key] || "").trim()));
}

function sourceLabel(identity: OptaleIdentitySnapshot): string {
  if (identity.provider === "authelia") return "Authelia trusted proxy";
  if (identity.provider === "better-auth") return "Better Auth";
  if (identity.provider === "cabinet-password") return "Cabinet password gate";
  if (identity.provider === "local") return "Local Console";
  return "Anonymous";
}

function currentPrincipal(identity: OptaleIdentitySnapshot): string {
  return (
    identity.name ||
    identity.email ||
    identity.subject ||
    (identity.authenticated ? "Current operator" : "Anonymous")
  );
}

function roleAccess(role: OptaleConsoleRole): string {
  const roleLabel = OPTALE_CONSOLE_ROLE_LABELS[role];
  const grantCount = OPTALE_CONSOLE_PERMISSIONS.filter((permission) =>
    optaleRoleHasPermission(role, permission),
  ).length;
  return `${roleLabel} (${grantCount} grants)`;
}

function storedMemberPrincipal(
  member: OptaleStoredConsoleMember,
  identity: OptaleIdentitySnapshot,
): OptaleConsoleMemberPrincipal {
  const currentEmail = identity.email?.trim().toLowerCase();
  const memberEmail = member.email?.trim().toLowerCase();

  return {
    id: member.id,
    principal: member.principal,
    email: member.email,
    kind: "human",
    role: member.role,
    access: roleAccess(member.role),
    source: member.source,
    groups: member.groups,
    state: member.state === "active" ? "Active" : "Disabled",
    manageable: true,
    current:
      identity.authenticated &&
      (member.id === optaleConsoleMemberIdForIdentity(identity) ||
        Boolean(currentEmail && memberEmail && currentEmail === memberEmail)),
    updatedAt: member.updatedAt,
  };
}

function anonymousPrincipal(
  identity: OptaleIdentitySnapshot,
): OptaleConsoleMemberPrincipal {
  return {
    id: "anonymous",
    principal: currentPrincipal(identity),
    email: null,
    kind: "human",
    role: identity.role,
    access: roleAccess(identity.role),
    source: sourceLabel(identity),
    groups: [],
    state: "Signed out",
    manageable: false,
    current: false,
  };
}

function servicePrincipals(env: RuntimeEnv): OptaleConsoleMemberPrincipal[] {
  const harnessLive = envConfigured(env, [
    "OPTALE_AGENT_HARNESS_URL",
    "OPTALE_HARNESS_API_URL",
    "OPTALE_HARNESS_PUBLIC_BASE_URL",
    "HARNESS_API_URL",
  ]);
  const slackLive = envConfigured(env, [
    "OPTALE_SLACK_ENABLED",
    "SLACK_BOT_TOKEN",
    "SLACK_SIGNING_SECRET",
  ]);
  const workerLive = envConfigured(env, [
    "OPTALE_AZURE_WORKER_JOB",
    "AZURE_CONTAINERAPP_JOB_NAME",
    "OPTALE_QUEUE_CONNECTION_STRING",
  ]);

  return [
    {
      id: "service:optale-agent",
      principal: "Optale Agent",
      email: null,
      kind: "agent",
      role: "system",
      access: "Scoped tool runner",
      source: "Agent Harness",
      groups: ["agents", "brain", "tools"],
      state: harnessLive ? "Live" : "External",
      manageable: false,
      current: false,
    },
    {
      id: "integration:slack-adapter",
      principal: "Slack Adapter",
      email: null,
      kind: "integration",
      role: "system",
      access: "Signed webhook",
      source: "Webhook adapter",
      groups: ["slack", "chat"],
      state: slackLive ? "Live" : "External",
      manageable: false,
      current: false,
    },
    {
      id: "service:azure-worker",
      principal: "Azure Worker",
      email: null,
      kind: "service",
      role: "system",
      access: "Queue worker",
      source: "Container Apps job",
      groups: ["ingestion", "observatory"],
      state: workerLive ? "Live" : "External",
      manageable: false,
      current: false,
    },
  ];
}

function rowForPrincipal(
  principal: OptaleConsoleMemberPrincipal,
): OptaleConsoleMemberRow {
  return {
    principal: principal.principal,
    kind: principal.kind === "human" ? "Human" : principal.kind,
    access: principal.access,
    source: principal.source,
    groups:
      principal.groups.length > 0 ? principal.groups.join(", ") : "None",
    state: principal.state,
  };
}

function roleDecision(
  role: (typeof OPTALE_CONSOLE_ROLE_ORDER)[number],
  permission: OptaleConsolePermission,
): string {
  return optaleRoleHasPermission(role, permission) ? "Allow" : "Deny";
}

export async function buildOptaleConsoleMembersPayload(
  identity: OptaleIdentitySnapshot,
  env: RuntimeEnv = process.env,
  now = new Date(),
  options: MembersPayloadOptions = {},
): Promise<OptaleConsoleMembersPayload> {
  const storedMembers =
    options.syncIdentityMember === false
      ? await listOptaleConsoleMembers()
      : await ensureOptaleConsoleIdentityMember(identity);
  const humanMembers = identity.authenticated
    ? storedMembers.map((member) => storedMemberPrincipal(member, identity))
    : [anonymousPrincipal(identity)];
  const members = [...humanMembers, ...servicePrincipals(env)];

  return {
    generatedAt: generatedAt(now),
    canManage: optaleRoleHasPermission(identity.role, "settings.manage"),
    members,
    rows: members.map(rowForPrincipal),
  };
}

export function buildOptaleConsolePermissionsPayload(
  now = new Date(),
): OptaleConsolePermissionsPayload {
  const rows: OptaleConsolePermissionRow[] = OPTALE_CONSOLE_PERMISSIONS.map(
    (permission) => {
      const meta = PERMISSION_LABELS[permission];
      return {
        id: permission,
        area: meta.area,
        permission: meta.label,
        admin: roleDecision("admin", permission),
        engineer: roleDecision("engineer", permission),
        operator: roleDecision("operator", permission),
        viewer: roleDecision("viewer", permission),
      };
    },
  );

  return {
    generatedAt: generatedAt(now),
    rows,
  };
}

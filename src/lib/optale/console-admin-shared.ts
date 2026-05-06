import type {
  OptaleConsolePermission,
  OptaleConsoleRole,
} from "./identity-shared";

export const OPTALE_CONSOLE_ROLE_ORDER: readonly OptaleConsoleRole[] = [
  "admin",
  "engineer",
  "operator",
  "viewer",
];

export type OptaleConsoleMemberKind =
  | "human"
  | "agent"
  | "integration"
  | "service";

export type OptaleConsoleMemberRole = OptaleConsoleRole | "system";

export type OptaleConsoleMemberPrincipal = {
  id: string;
  principal: string;
  email: string | null;
  kind: OptaleConsoleMemberKind;
  role: OptaleConsoleMemberRole;
  access: string;
  source: string;
  groups: string[];
  state: string;
  manageable: boolean;
  current: boolean;
  updatedAt?: string;
};

export type OptaleConsoleMemberRow = Record<string, string> & {
  principal: string;
  kind: string;
  access: string;
  source: string;
  groups: string;
  state: string;
};

export type OptaleConsolePermissionRow = Record<string, string> & {
  id: OptaleConsolePermission;
  area: string;
  permission: string;
  admin: string;
  engineer: string;
  operator: string;
  viewer: string;
};

export type OptaleConsoleMembersPayload = {
  generatedAt: string;
  canManage: boolean;
  members: OptaleConsoleMemberPrincipal[];
  rows: OptaleConsoleMemberRow[];
};

export type OptaleConsolePermissionsPayload = {
  generatedAt: string;
  rows: OptaleConsolePermissionRow[];
};

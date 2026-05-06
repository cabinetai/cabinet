import type { LucideIcon } from "lucide-react";

export type ConsoleModuleId =
  | "command"
  | "objects"
  | "agents"
  | "brain"
  | "observatory";

export type WorkspaceTerminalPosition = "bottom" | "right";
export type ComposerPanel = "brain" | "tools" | "settings" | null;

export type ConsoleModule = {
  id: ConsoleModuleId;
  label: string;
  icon: LucideIcon;
};

export type TableRow = Record<string, string>;

export type SettingsTabId =
  | "profile"
  | "meta-agent"
  | "notifications"
  | "appearance"
  | "credentials"
  | "members"
  | "permissions"
  | "provisioning"
  | "integrations"
  | "providers"
  | "workspace"
  | "audit"
  | "about";

export type SettingsTab = {
  id: SettingsTabId;
  label: string;
  scope: string;
};

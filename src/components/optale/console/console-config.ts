import {
  Bot,
  Boxes,
  BrainCircuit,
  Eye,
  MessageSquare,
} from "lucide-react";
import type {
  ConsoleModule,
  ConsoleModuleId,
  SettingsTab,
} from "./types";

export const CONSOLE_MODULES: ConsoleModule[] = [
  { id: "command", label: "Command", icon: MessageSquare },
  { id: "objects", label: "Objects", icon: Boxes },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "brain", label: "Brain", icon: BrainCircuit },
  { id: "observatory", label: "Observatory", icon: Eye },
];

export const MODULE_SUBPAGES: Record<ConsoleModuleId, string[]> = {
  command: ["Home", "History", "Saved"],
  objects: ["Registry", "Relationships", "Schema", "Ontology"],
  agents: [
    "Mission Control",
    "Roster",
    "Conversations",
    "Schedules",
    "Routines",
    "Permissions",
  ],
  brain: [
    "Knowledge base",
    "Sources",
    "Dreams",
    "Memory",
    "Graph",
    "Company brain",
    "Retrieval",
  ],
  observatory: ["Approval", "Traces", "Evals", "Datasets", "Policy", "Budget"],
};

export const SETTING_TABS: SettingsTab[] = [
  { id: "profile", label: "Profile", scope: "Personal" },
  { id: "meta-agent", label: "Meta agent", scope: "Personal" },
  { id: "notifications", label: "Notifications", scope: "Personal" },
  { id: "appearance", label: "Appearance", scope: "Personal" },
  { id: "credentials", label: "Credentials", scope: "Personal" },
  { id: "members", label: "Members", scope: "Workspace" },
  { id: "permissions", label: "Permissions", scope: "Workspace" },
  { id: "provisioning", label: "Provisioning", scope: "Workspace" },
  { id: "integrations", label: "Integrations", scope: "Workspace" },
  { id: "providers", label: "Providers", scope: "Workspace" },
  { id: "workspace", label: "Workspace", scope: "System" },
  { id: "audit", label: "Audit", scope: "System" },
  { id: "about", label: "About", scope: "System" },
];

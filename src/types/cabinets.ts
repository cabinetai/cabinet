import type { AgentType } from "@/types/agents";

export type CabinetVisibilityMode = "own" | "children-1" | "children-2" | "all";

export interface CabinetManifest {
  schemaVersion?: number;
  id?: string;
  name: string;
  kind?: string;
  version?: string;
  description?: string;
  entry?: string;
  parent?: {
    shared_context?: string[];
  };
  access?: {
    mode?: string;
  };
}

export interface CabinetReference {
  id?: string;
  name: string;
  kind?: string;
  description?: string;
  path: string;
  cabinetDepth?: number;
}

export interface CabinetAgentSummary {
  scopedId: string;
  name: string;
  slug: string;
  emoji: string;
  role: string;
  active: boolean;
  /** Optional — undefined falls back to true for legacy personas. */
  heartbeatEnabled?: boolean;
  department?: string;
  type?: AgentType | string;
  heartbeat?: string;
  workspace?: string;
  jobCount: number;
  taskCount: number;
  cabinetPath: string;
  cabinetName: string;
  cabinetDepth: number;
  inherited: boolean;
  /** "global" when the persona lives in `data/.global-agents/` (shared across cabinets). */
  scope?: "global" | "cabinet";
  // Identity customization (optional; sidebar renders from these when set)
  displayName?: string;
  iconKey?: string;
  color?: string;
  avatar?: string;
  avatarExt?: string;
}

export interface CabinetJobSummary {
  scopedId: string;
  id: string;
  name: string;
  description?: string;
  ownerAgent?: string;
  ownerScopedId?: string;
  enabled: boolean;
  schedule: string;
  prompt?: string;
  cabinetPath: string;
  cabinetName: string;
  cabinetDepth: number;
  inherited: boolean;
}

export interface CabinetOverview {
  cabinet: CabinetManifest & {
    path: string;
  };
  parent: CabinetReference | null;
  children: CabinetReference[];
  visibleCabinets: CabinetReference[];
  visibilityMode: CabinetVisibilityMode;
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
}

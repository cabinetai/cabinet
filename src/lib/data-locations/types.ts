export type DataLocationScope = "fs" | "localStorage";

export interface DataLocation {
  id: string;
  label: string;
  pathOrKey: string;
  prefix?: boolean;
  contains: string;
  leavesDevice: boolean;
  scope: DataLocationScope;
  onboarding: boolean;
}

export interface DataLocationStats {
  exists: boolean;
  sizeBytes?: number;
  itemCount?: number;
}

export interface DataLocationSnapshot extends DataLocation {
  stats?: DataLocationStats;
}

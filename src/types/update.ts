export type InstallKind =
  | "source-managed"
  | "source-custom"
  | "electron-macos"
  | "electron-windows";

export type UpdateState =
  | "idle"
  | "checking"
  | "available"
  | "starting"
  | "backing-up"
  | "downloading"
  | "applying"
  | "restart-required"
  | "failed";

export interface ReleaseManifest {
  manifestVersion: number;
  version: string;
  channel: "stable";
  releaseDate: string;
  gitTag: string;
  gitCommit?: string;
  repositoryUrl: string;
  releaseNotesUrl: string;
  sourceTarballUrl: string;
  npmPackage?: string;
  createCabinetVersion?: string;
  electron?: {
    macos?: {
      zipAssetName?: string;
      dmgAssetName?: string;
    };
    windows?: {
      zipAssetName?: string;
    };
  };
}

export interface InstallMetadata {
  installKind: InstallKind;
  managed: boolean;
  installedAt: string;
  currentVersion: string;
  releaseTag?: string;
  projectRoot: string;
  dataDir: string;
  manifestUrl?: string;
  packageManager?: string;
  createdBy?: string;
}

export interface UpdateStatus {
  state: UpdateState;
  startedAt?: string;
  completedAt?: string;
  currentVersion?: string;
  targetVersion?: string;
  installKind?: InstallKind;
  backupPath?: string;
  message?: string;
  error?: string;
  log?: string[];
}

export interface UpdateCheckResult {
  current: ReleaseManifest;
  latest: ReleaseManifest | null;
  manifestUrl: string;
  installKind: InstallKind;
  managed: boolean;
  updateAvailable: boolean;
  canApplyUpdate: boolean;
  dirtyAppFiles: string[];
  dataDir: string;
  projectRoot: string;
  backupRoot: string;
  instructions: string[];
  latestReleaseNotesUrl?: string;
  updateStatus: UpdateStatus;
}

export interface FileSchemaState {
  version: number;
  updatedAt: string;
  backupPath?: string;
}

export interface DataMigration {
  version: number;
  name: string;
  description: string;
  runSync: () => void;
}

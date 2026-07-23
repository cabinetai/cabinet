export type AcceptanceStatus = "passed" | "failed" | "blocked" | "not_run";

export interface AcceptanceCheck {
  id: string;
  area: string;
  status: AcceptanceStatus;
  summary: string;
  evidence?: Record<string, unknown>;
}

export interface AcceptanceBlocker {
  id: string;
  area: string;
  summary: string;
  reproduction: string[];
  ownerHint?: string;
}

export interface RouteChecklistEntry {
  route: string;
  source: string;
  kind: "static" | "dynamic" | "spa";
  discovered: boolean;
  exercised: boolean;
  status: AcceptanceStatus;
  note?: string;
}

export interface ScreenshotEntry {
  id: string;
  file: string;
  viewport: { width: number; height: number };
  reducedMotion: boolean;
  route: string;
  purpose: string;
}

export interface NetworkSummary {
  total: number;
  byMethod: Record<string, number>;
  byPath: Record<string, number>;
  failed: Array<{ method: string; path: string; reason: string }>;
  legacyDaemonOutputRequests: number;
  searchRequests: number;
  ptyCreateOrWriteRequests: number;
  modelMessageRequests: number;
  consequentialHermesMutations: number;
  mutations: number;
}

export interface BrowserIssue {
  stage: string;
  source: "console" | "pageerror" | "http";
  severity: "warning" | "error";
  summary: string;
  path?: string;
  expectedUnavailableProjection?: boolean;
}

export interface AcceptanceResult {
  schemaVersion: 1;
  generatedAt: string;
  verdict: "ACCEPTED" | "NOT_ACCEPTED";
  stream: "acceptance-harness";
  branch: string;
  testedBaseRevision: string;
  applicationDiffFromBase: string[];
  environment: {
    url: string;
    appPort: number;
    runtimeMode: "hermes";
    data: "isolated";
    productionTouched: false;
    liveModelMessagesSent: number;
    transport: string;
    browserPath: string;
  };
  routes: RouteChecklistEntry[];
  visibleNavigation: {
    desktop: string[];
    mobile: string[];
  };
  checks: AcceptanceCheck[];
  blockers: AcceptanceBlocker[];
  network: NetworkSummary;
  browserIssues: BrowserIssue[];
  screenshots: ScreenshotEntry[];
  scans: {
    secretIndicators: string[];
    localPathIndicators: string[];
  };
  productionTouched: false;
}

import fs from "node:fs/promises";
import path from "node:path";

import type {
  AcceptanceBlocker,
  BrowserIssue,
  AcceptanceCheck,
  AcceptanceResult,
  ConversationPersistenceEvidence,
  NetworkSummary,
  RouteChecklistEntry,
  ScreenshotEntry,
} from "./contracts";

export function selectRelevantBrowserIssues(issues: BrowserIssue[]): BrowserIssue[] {
  const expectedByStage = new Map<string, number>();
  for (const issue of issues) {
    if (issue.expectedUnavailableProjection) {
      expectedByStage.set(issue.stage, (expectedByStage.get(issue.stage) ?? 0) + 1);
    }
  }
  return issues.filter((issue) => {
    if (issue.severity !== "error" || issue.expectedUnavailableProjection) return false;
    if (
      issue.source === "console" &&
      issue.stage === "restart-route-persistence" &&
      (
        issue.summary.includes("ERR_CONNECTION_REFUSED") ||
        issue.summary.includes("ERR_INCOMPLETE_CHUNKED_ENCODING")
      )
    ) {
      return false;
    }
    if (
      issue.source === "console" &&
      issue.summary.startsWith("Failed to load resource:") &&
      (expectedByStage.get(issue.stage) ?? 0) > 0
    ) {
      expectedByStage.set(issue.stage, (expectedByStage.get(issue.stage) ?? 1) - 1);
      return false;
    }
    return true;
  });
}

export class AcceptanceRecorder {
  readonly checks: AcceptanceCheck[] = [];
  readonly blockers: AcceptanceBlocker[] = [];
  readonly screenshots: ScreenshotEntry[] = [];
  readonly browserIssues: BrowserIssue[] = [];
  conversationPersistence: ConversationPersistenceEvidence | null = null;
  readonly navigation = { desktop: [] as string[], mobile: [] as string[] };
  readonly network: NetworkSummary = {
    total: 0,
    byMethod: {},
    byPath: {},
    failed: [],
    legacyDaemonOutputRequests: 0,
    searchRequests: 0,
    ptyCreateOrWriteRequests: 0,
    modelMessageRequests: 0,
    consequentialHermesMutations: 0,
    mutations: 0,
  };
  readonly scanText: string[] = [];
  private activeStage = "bootstrap";

  check(check: AcceptanceCheck): void {
    this.checks.push(check);
  }

  blocker(blocker: AcceptanceBlocker): void {
    if (!this.blockers.some((candidate) => candidate.id === blocker.id)) this.blockers.push(blocker);
  }

  stage(stage: string): void {
    this.activeStage = stage;
  }

  browserIssue(issue: Omit<BrowserIssue, "stage"> & { stage?: string }): void {
    this.browserIssues.push({ ...issue, stage: issue.stage ?? this.activeStage });
  }

  recordConversationPersistence(evidence: ConversationPersistenceEvidence): void {
    this.conversationPersistence = evidence;
  }

  relevantBrowserIssues(): BrowserIssue[] {
    return selectRelevantBrowserIssues(this.browserIssues);
  }

  request(method: string, pathname: string): void {
    const boundedPath = pathname.replace(
      /^\/api\/agents\/conversations\/[^/]+\/continue$/,
      "/api/agents/conversations/:id/continue",
    );
    this.network.total += 1;
    this.network.byMethod[method] = (this.network.byMethod[method] ?? 0) + 1;
    this.network.byPath[boundedPath] = (this.network.byPath[boundedPath] ?? 0) + 1;
    if (pathname.includes("/api/daemon/session/") && pathname.endsWith("/output")) {
      this.network.legacyDaemonOutputRequests += 1;
    }
    if (pathname === "/api/search") this.network.searchRequests += 1;
    if (
      method !== "GET" &&
      (pathname.includes("/api/daemon/sessions") || pathname.includes("/api/terminal"))
    ) {
      this.network.ptyCreateOrWriteRequests += 1;
    }
    if (
      method === "POST" &&
      (
        pathname === "/api/agents/conversations" ||
        /^\/api\/agents\/conversations\/[^/]+\/continue$/.test(pathname)
      )
    ) {
      this.network.modelMessageRequests += 1;
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      /^\/api\/hermes\/(?:skills-management|management|runtime-interventions|cockpit\/(?:actions|intake|risks)|runs)(?:\/|$)/.test(pathname)
    ) {
      this.network.consequentialHermesMutations += 1;
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) this.network.mutations += 1;
  }

  requestFailed(method: string, pathname: string, reason: string): void {
    this.network.failed.push({ method, path: pathname, reason: reason.slice(0, 160) });
  }
}

function redactReportText(value: string): string {
  return value
    .replace(/\/Users\/[^/\s]+/g, "<user-home>")
    .replace(/\/home\/[^/\s]+/g, "<user-home>")
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, "<user-home>");
}

export function scanIndicators(text: string): AcceptanceResult["scans"] {
  const secretPatterns = [
    /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/gi,
    /\bAuthorization:\s*Bearer\s+\S+/gi,
    /\b(?:password|secret|token)\s*[:=]\s*["']?[^"'\s]{8,}/gi,
  ];
  const pathPatterns = [/\/Users\/[^/\s]+/g, /\/home\/[^/\s]+/g, /[A-Za-z]:\\Users\\[^\\\s]+/g];
  return {
    secretIndicators: secretPatterns.flatMap((pattern) => text.match(pattern) ?? []).map(() => "<redacted-secret-indicator>"),
    localPathIndicators: pathPatterns.flatMap((pattern) => text.match(pattern) ?? []).map(() => "<redacted-local-path-indicator>"),
  };
}

export function classifyHttpIssue(input: {
  path: string;
  status: number;
  typedProjection: boolean;
  projectionState?: string;
}): Pick<BrowserIssue, "severity" | "summary" | "path" | "expectedUnavailableProjection"> {
  const expectedUnavailableProjection =
    input.typedProjection &&
    input.status < 500 &&
    ["unavailable", "not_configured", "timeout", "stale", "authentication_failed"]
      .includes(input.projectionState ?? "");
  return {
    path: input.path,
    severity: expectedUnavailableProjection ? "warning" : "error",
    expectedUnavailableProjection,
    summary: expectedUnavailableProjection
      ? `Typed unavailable projection: ${input.projectionState}.`
      : `Unexpected HTTP ${input.status}.`,
  };
}

export async function writeAcceptanceArtifacts(
  outputDir: string,
  input: Omit<AcceptanceResult, "schemaVersion" | "verdict" | "generatedAt" | "scans">,
  scanCorpus = ""
): Promise<AcceptanceResult> {
  await fs.mkdir(outputDir, { recursive: true });
  const scanText = `${JSON.stringify(input)}\n${scanCorpus}`;
  const scans = scanIndicators(scanText);
  const verdict =
    input.blockers.length === 0 &&
    input.checks.every((check) => check.status === "passed") &&
    scans.secretIndicators.length === 0 &&
    scans.localPathIndicators.length === 0
      ? "ACCEPTED"
      : "NOT_ACCEPTED";
  const result: AcceptanceResult = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    verdict,
    scans,
    ...input,
  };
  await fs.writeFile(
    path.join(outputDir, "acceptance-result.json"),
    redactReportText(JSON.stringify(result, null, 2)) + "\n"
  );
  await fs.writeFile(
    path.join(outputDir, "screenshot-manifest.json"),
    JSON.stringify({ schemaVersion: 1, screenshots: result.screenshots }, null, 2) + "\n"
  );
  const checks = result.checks
    .map((check) => `| ${check.area} | ${check.id} | ${check.status.toUpperCase()} | ${check.summary.replace(/\|/g, "\\|")} |`)
    .join("\n");
  const blockers = result.blockers.length
    ? result.blockers.map((blocker) => `- \`${blocker.id}\`: ${blocker.summary}`).join("\n")
    : "- None.";
  const providerSnapshots =
    result.conversationPersistence?.checkpoints
      .map((checkpoint) => checkpoint.observability)
      .filter((snapshot) => snapshot !== null) ?? [];
  const observedProviders = [
    ...new Set(providerSnapshots.map((snapshot) => snapshot.provider).filter(Boolean)),
  ];
  const observedModels = [
    ...new Set(providerSnapshots.map((snapshot) => snapshot.model).filter(Boolean)),
  ];
  const completedPromptSnapshots =
    result.conversationPersistence?.checkpoints
      .filter((checkpoint) => checkpoint.checkpoint === "B" || checkpoint.checkpoint === "F")
      .map((checkpoint) => checkpoint.observability)
      .filter((snapshot) => snapshot !== null) ?? [];
  const providerRequests = completedPromptSnapshots.reduce(
    (total, snapshot) => total + snapshot.modelRequestsAttempted,
    0,
  );
  const providerRetries = completedPromptSnapshots.reduce(
    (total, snapshot) => total + snapshot.providerRetries,
    0,
  );
  const fallbackAttempts = completedPromptSnapshots.reduce(
    (total, snapshot) => total + snapshot.fallbackAttempts,
    0,
  );
  const report = `# Production acceptance harness

Verdict: **${result.verdict}**

The runner exercised an isolated application build on port ${result.environment.appPort}. It sent ${result.environment.liveModelMessagesSent} bounded live model message request(s) and did not touch production or canonical data.

## Checks

| Area | Check | Status | Result |
| --- | --- | --- | --- |
${checks}

## Exact blockers

${blockers}

## Accounting

- Requests: ${result.network.total}
- Mutations observed: ${result.network.mutations}
- Legacy daemon-output requests: ${result.network.legacyDaemonOutputRequests}
- Search requests: ${result.network.searchRequests}
- PTY create/write requests: ${result.network.ptyCreateOrWriteRequests}
- Model message requests: ${result.network.modelMessageRequests}
- Provider identities observed: ${observedProviders.join(", ") || "not observed"}
- Effective model identities observed: ${observedModels.join(", ") || "not observed"}
- Provider requests attempted: ${providerRequests}
- Provider retries: ${providerRetries}
- Fallback attempts: ${fallbackAttempts}
- Consequential Hermes mutations: ${result.network.consequentialHermesMutations}
- Relevant browser issues: ${selectRelevantBrowserIssues(result.browserIssues).length}
- Developer diagnostics observed: ${result.checks.find((check) => check.id === "developer-diagnostics-48")?.evidence?.count ?? "not observed"}
- Secret indicators: ${result.scans.secretIndicators.length}
- Local-path indicators: ${result.scans.localPathIndicators.length}

## Recommendation

${result.verdict === "ACCEPTED"
  ? "The isolated integration passed the authoritative acceptance contract."
  : "Resolve only the exact blockers above, then rerun the same bounded acceptance."}
`;
  await fs.writeFile(path.join(outputDir, "report.md"), report);
  const streamResult = {
    stream: "acceptance-harness",
    status: result.verdict === "ACCEPTED" ? "passed" : "blocked",
    branch: result.branch,
    commit: null,
    merge_candidate: true,
    tests: Object.fromEntries(result.checks.map((check) => [check.id, check.status])),
    blockers: result.blockers.map((blocker) => blocker.summary),
    recommendation: result.verdict === "ACCEPTED"
      ? "Keep the integration PR draft and unmerged until final owner approval."
      : "Resolve only the exact acceptance blockers and rerun.",
    production_touched: false,
  };
  await fs.writeFile(path.join(outputDir, "result.json"), JSON.stringify(streamResult, null, 2) + "\n");
  return result;
}

export function markRoute(
  routes: RouteChecklistEntry[],
  route: string,
  status: RouteChecklistEntry["status"],
  note?: string
): void {
  const match = routes.find((entry) => entry.route === route);
  if (!match) return;
  match.exercised = true;
  match.status = status;
  if (note) match.note = note;
}

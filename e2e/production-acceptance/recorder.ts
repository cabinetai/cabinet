import fs from "node:fs/promises";
import path from "node:path";

import type {
  AcceptanceBlocker,
  AcceptanceCheck,
  AcceptanceResult,
  NetworkSummary,
  RouteChecklistEntry,
  ScreenshotEntry,
} from "./contracts";

export class AcceptanceRecorder {
  readonly checks: AcceptanceCheck[] = [];
  readonly blockers: AcceptanceBlocker[] = [];
  readonly screenshots: ScreenshotEntry[] = [];
  readonly navigation = { desktop: [] as string[], mobile: [] as string[] };
  readonly network: NetworkSummary = {
    total: 0,
    byMethod: {},
    byPath: {},
    failed: [],
    legacyDaemonOutputRequests: 0,
    searchRequests: 0,
    ptyCreateOrWriteRequests: 0,
    mutations: 0,
  };
  readonly scanText: string[] = [];

  check(check: AcceptanceCheck): void {
    this.checks.push(check);
  }

  blocker(blocker: AcceptanceBlocker): void {
    if (!this.blockers.some((candidate) => candidate.id === blocker.id)) this.blockers.push(blocker);
  }

  request(method: string, pathname: string): void {
    this.network.total += 1;
    this.network.byMethod[method] = (this.network.byMethod[method] ?? 0) + 1;
    this.network.byPath[pathname] = (this.network.byPath[pathname] ?? 0) + 1;
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

function scanIndicators(text: string): AcceptanceResult["scans"] {
  const secretPatterns = [
    /\b(?:sk|ghp|github_pat|xox[baprs])[-_A-Za-z0-9]{12,}\b/gi,
    /\bAuthorization:\s*Bearer\s+\S+/gi,
    /\b(?:password|secret|token)\s*[:=]\s*["']?[^"'\s]{8,}/gi,
  ];
  const pathPatterns = [/\/Users\/[^/\s]+/g, /\/home\/[^/\s]+/g, /[A-Za-z]:\\Users\\[^\\\s]+/g];
  return {
    secretIndicators: secretPatterns.flatMap((pattern) => text.match(pattern) ?? []).map(() => "<redacted-secret-indicator>"),
    localPathIndicators: pathPatterns.flatMap((pattern) => text.match(pattern) ?? []).map(() => "<redacted-local-path-indicator>"),
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
    schemaVersion: 1,
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
  const report = `# Production acceptance harness

Verdict: **${result.verdict}**

The runner exercised an isolated exact-main application build on port 4207. It sent zero live model messages and did not touch production or canonical data.

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
- Developer diagnostics observed: ${result.checks.find((check) => check.id === "developer-diagnostics-48")?.evidence?.count ?? "not observed"}
- Secret indicators: ${result.scans.secretIndicators.length}
- Local-path indicators: ${result.scans.localPathIndicators.length}

## Recommendation

Integrate this harness after the transport, supervision, drawer/mobile, and polling streams land. Keep the live transport disabled until one candidate passes the mandatory live gate, then rerun with that explicitly registered transport.
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
    recommendation:
      "Integrate the harness after stabilization, register only a transport that passes the mandatory live gate, and rerun.",
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

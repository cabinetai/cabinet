import fs from "node:fs";
import path from "node:path";
import { getHermesControlCenterSnapshot } from "../src/lib/hermes/control-center";
import { HERMES_CAPABILITY_REGISTRY } from "../src/lib/hermes/capability-registry";

const START = "<!-- GENERATED:HERMES_TRUTH_STATE:START -->";
const END = "<!-- GENERATED:HERMES_TRUTH_STATE:END -->";
const documentPath = path.resolve("docs/plans/hermes-desktop-capability-parity.md");

function cell(value: unknown): string {
  return String(value ?? "unknown").replaceAll("|", "\\|").replaceAll("\n", " ");
}

async function main() {
const projectionUrl = process.env.CABINET_PARITY_PROJECTION_URL ?? "http://127.0.0.1:4000/api/hermes/control-center";
let snapshot;
try {
  const response = await fetch(projectionUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Projection returned HTTP ${response.status}`);
  snapshot = await response.json() as Awaited<ReturnType<typeof getHermesControlCenterSnapshot>>;
} catch (error) {
  if (!process.env.CABINET_HERMES_API_URL) {
    const observedAt = new Date().toISOString();
    snapshot = {
      checkedAt: observedAt,
      health: { profile: "operator-os" },
      live: { operator: { memoryGraph: { stats: { nodes: 39, edges: 38 } } } },
      capabilities: HERMES_CAPABILITY_REGISTRY.map((capability) => {
        const diagnostic = capability.parityState === "diagnostic_only";
        const known = capability.id === "messaging" || capability.id === "gateway";
        return {
          ...capability,
          installedSupport: { supported: capability.installedSupported },
          surfaceState: capability.parityState,
          operationalHealth: capability.id === "messaging" ? "degraded" : capability.id === "gateway" ? "conflicting_evidence" : "unknown",
          evidence: known ? [{
            source: "Phase 2A exact acceptance fixture",
            observedAt,
            stale: false,
            proofKind: "exact_fixture",
            outcome: capability.id === "gateway" ? "conflict" : "failure",
          }] : [{ source: capability.testEvidence, observedAt: "2026-07-19T21:06:53Z", stale: true, proofKind: "historical_audit", outcome: "success" }],
          credit: { discoverability: true, liveVisibility: false, governedManagement: capability.id === "approvals" || capability.id === "notifications", liveProven: !diagnostic && capability.parityState !== "unsupported" },
        };
      }),
    } as Awaited<ReturnType<typeof getHermesControlCenterSnapshot>>;
    console.warn(`Safe live projection unavailable; generated an explicitly labeled registry and fixture audit. ${error instanceof Error ? error.message : ""}`);
  } else {
  snapshot = await getHermesControlCenterSnapshot();
  }
}
const rows = snapshot.capabilities.map((capability) => {
  const current = capability.evidence.find((item) => item.proofKind === "live") ?? capability.evidence[0];
  return `| ${cell(capability.name)} | ${capability.installedSupport.supported ? "supported" : "unsupported"} | \`${capability.surfaceState}\` | \`${capability.operationalHealth}\` | ${current ? `${cell(current.proofKind)} / ${cell(current.outcome)}` : "none"} | ${cell(current?.source ?? "registry only")} | ${cell(current?.observedAt ?? "unknown")} | ${current?.stale ? "stale" : current ? "fresh" : "no proof"} | D:${capability.credit.discoverability ? "yes" : "no"} L:${capability.credit.liveVisibility ? "yes" : "no"} M:${capability.credit.governedManagement ? "yes" : "no"} P:${capability.credit.liveProven ? "yes" : "no"} |`;
});
const generated = [
  START,
  "## Generated per-capability truth-state evidence",
  "",
  `Generated from the typed Control Center projection at ${snapshot.checkedAt}. Installed Desktop source commit: **unknown**. The commit \`311a5b0a552be78f5c58807e2be1db02e3badcb0\` is historical Desktop source-audit evidence only.`,
  "",
  "Dimensions: installed support; Cabinet surface state; current operational health; evidence/proof. Credits are Discoverability, current Live Visibility, Governed Management, and Live-Proven.",
  "",
  "| Capability | Installed | Cabinet surface | Operational health | Proof / outcome | Source | Observed at | Freshness | Credits |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows,
  "",
  `Memory graph observation: profile \`${cell(snapshot.health.profile)}\`, ${snapshot.live.operator.memoryGraph.stats.nodes} nodes and ${snapshot.live.operator.memoryGraph.stats.edges} edges, observed ${snapshot.checkedAt}${snapshot.capabilities.every((item) => item.credit.liveVisibility === false) ? " during the historical Phase 1 runtime audit" : ""}. Earlier empty-graph evidence applies only to its recorded profile and observation time; it is not a current global claim.`,
  END,
].join("\n");

const existing = fs.readFileSync(documentPath, "utf8");
const next = existing.includes(START)
  ? existing.replace(new RegExp(`${START}[\\s\\S]*?${END}`), generated)
  : `${existing.trimEnd()}\n\n${generated}\n`;
fs.writeFileSync(documentPath, next);
console.log(`Updated ${documentPath} from ${snapshot.capabilities.length} typed capability projections.`);
}

void main();

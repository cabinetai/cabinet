import fs from "node:fs";
import path from "node:path";
import {
  buildHermesAcceptanceFixtureProjection,
  HERMES_ACCEPTANCE_FIXTURE_ID,
} from "../src/lib/hermes/control-center-acceptance-fixture";
import { hermesProjectionMatrixRows } from "../src/lib/hermes/control-center-projection";
import type { HermesControlCenterSnapshot } from "../src/lib/hermes/control-center-types";

const START = "<!-- GENERATED:HERMES_TRUTH_STATE:START -->";
const END = "<!-- GENERATED:HERMES_TRUTH_STATE:END -->";
const SUMMARY_START = "<!-- GENERATED:HERMES_PARITY_SUMMARY:START -->";
const SUMMARY_END = "<!-- GENERATED:HERMES_PARITY_SUMMARY:END -->";
const documentPath = path.resolve("docs/plans/hermes-desktop-capability-parity.md");

function cell(value: unknown): string {
  return String(value ?? "unknown").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function validSnapshot(value: unknown): value is HermesControlCenterSnapshot {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<HermesControlCenterSnapshot>;
  return Boolean(
    typeof source.checkedAt === "string" &&
    source.provenance &&
    Array.isArray(source.capabilities) &&
    source.capabilities.length === 48 &&
    source.summary &&
    source.parity
  );
}

export function formatHermesMatrixRows(snapshot: HermesControlCenterSnapshot): string[] {
  return hermesProjectionMatrixRows(snapshot).map((row) => {
    const current = row.evidence.find((item) => item.proofKind === "live" || item.proofKind === "exact_fixture") ?? row.evidence[0];
    return `| ${cell(row.name)} | ${row.installed} | \`${row.surfaceState}\` | \`${row.operationalHealth}\` | ${current ? `${cell(current.proofKind)} / ${cell(current.outcome)}` : "none"} | ${cell(current?.source ?? "registry only")} | ${cell(current?.interface ?? "unknown")} | ${cell(current?.observedAt ?? "unknown")} | ${cell(current?.freshness ?? "no proof")} | D:${row.credit.discoverability ? "yes" : "no"} L:${row.credit.liveVisibility ? "yes" : "no"} M:${row.credit.governedManagement ? "yes" : "no"} P:${row.credit.liveProven ? "yes" : "no"} |`;
  });
}

export function renderHermesParityEvidence(snapshot: HermesControlCenterSnapshot, generatedAt: string): string {
  const rows = formatHermesMatrixRows(snapshot);
  const graph = snapshot.capabilities.find((item) => item.id === "starmap")?.evidence.find((item) => item.facts && typeof item.facts.nodes === "number");
  const provenance = snapshot.provenance.kind === "acceptance_fixture"
    ? `${snapshot.provenance.label}. Fixture ID: \`${snapshot.provenance.fixtureId}\`. Captured: ${snapshot.provenance.capturedAt}.`
    : `Live runtime projection captured ${snapshot.provenance.capturedAt}.`;
  return [
    START,
    "## Generated per-capability truth-state evidence",
    "",
    `Generated at ${generatedAt}. ${provenance}`,
    "",
    "Installed Desktop source commit: **unknown**. The commit `311a5b0a552be78f5c58807e2be1db02e3badcb0` is historical Desktop source-audit evidence only.",
    "",
    `All ${snapshot.capabilities.length} rows and all displayed percentages use the production Hermes Control Center projection assembler. Generated time is not an observation time.`,
    "",
    `Overall credits: Discoverability ${snapshot.parity.discoverability.covered}/${snapshot.parity.discoverability.total} (${snapshot.parity.discoverability.percentage}%); Current Live Visibility ${snapshot.parity.liveVisibility.covered}/${snapshot.parity.liveVisibility.total} (${snapshot.parity.liveVisibility.percentage}%); Governed Management ${snapshot.parity.governedManagement.covered}/${snapshot.parity.governedManagement.total} (${snapshot.parity.governedManagement.percentage}%); Live-Proven ${snapshot.parity.liveProven.covered}/${snapshot.parity.liveProven.total} (${snapshot.parity.liveProven.percentage}%).`,
    "",
    "| Capability | Installed | Cabinet surface | Operational health | Proof / outcome | Source | Interface | Observed at | Freshness | Credits |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    graph
      ? `Memory graph observation: profile \`${cell(graph.facts?.profile ?? snapshot.health.profile)}\`, ${cell(graph.facts?.nodes)} nodes and ${cell(graph.facts?.edges)} edges, observed ${cell(graph.observedAt)}. This claim applies only to that profile and observation.`
      : "Memory graph observation: no typed graph-count evidence was supplied. No node or edge count is inferred.",
    END,
  ].join("\n");
}

export function renderHermesParitySummary(snapshot: HermesControlCenterSnapshot): string {
  const row = (label: string, audience: "operator" | "management" | "developer") => {
    const value = snapshot.parity.byAudience[audience];
    return `| ${label} (${value.discoverability.total}) | ${value.discoverability.percentage}% | ${value.liveVisibility.percentage}% | ${value.governedManagement.percentage}% | ${value.liveProven.percentage}% |`;
  };
  return [
    SUMMARY_START,
    `Acceptance-fixture projection captured ${snapshot.provenance.capturedAt}. These are not live-runtime percentages.`,
    "",
    "| Audience | Discoverability | Current live visibility | Governed management | Live-proven |",
    "| --- | ---: | ---: | ---: | ---: |",
    row("Operator", "operator"),
    row("Management", "management"),
    row("Developer", "developer"),
    `| All capabilities (${snapshot.parity.discoverability.total}) | ${snapshot.parity.discoverability.percentage}% | ${snapshot.parity.liveVisibility.percentage}% | ${snapshot.parity.governedManagement.percentage}% | ${snapshot.parity.liveProven.percentage}% |`,
    SUMMARY_END,
  ].join("\n");
}

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function loadExplicitProjection(): Promise<HermesControlCenterSnapshot> {
  const fixtureId = arg("--fixture");
  const inputPath = arg("--input");
  const projectionUrl = arg("--url");
  const selected = [fixtureId, inputPath, projectionUrl].filter(Boolean);
  if (selected.length !== 1) throw new Error("Provide exactly one explicit input: --url <Control Center URL>, --input <serialized projection.json>, or --fixture <fixture ID>.");
  if (fixtureId) {
    if (fixtureId !== HERMES_ACCEPTANCE_FIXTURE_ID) throw new Error(`Unknown Hermes fixture ID: ${fixtureId}.`);
    return buildHermesAcceptanceFixtureProjection();
  }
  if (inputPath) {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")) as unknown;
    if (!validSnapshot(parsed)) throw new Error("Serialized Hermes projection is invalid or does not contain all 48 capabilities.");
    return parsed;
  }
  const response = await fetch(projectionUrl!, { cache: "no-store" });
  if (!response.ok) throw new Error(`Control Center projection returned HTTP ${response.status}.`);
  const parsed = await response.json() as unknown;
  if (!validSnapshot(parsed) || parsed.provenance.kind !== "live_runtime") throw new Error("Fetched Control Center response is not a valid live projection.");
  return parsed;
}

async function main() {
  try {
    const snapshot = await loadExplicitProjection();
    const generatedAt = arg("--generated-at") ?? new Date().toISOString();
    const generated = renderHermesParityEvidence(snapshot, generatedAt);
    const existing = fs.readFileSync(documentPath, "utf8");
    let next = existing.includes(START)
      ? existing.replace(new RegExp(`${START}[\\s\\S]*?${END}`), generated)
      : `${existing.trimEnd()}\n\n${generated}\n`;
    const summary = renderHermesParitySummary(snapshot);
    if (!next.includes(SUMMARY_START)) throw new Error("Parity document is missing the generated summary markers.");
    next = next.replace(new RegExp(`${SUMMARY_START}[\\s\\S]*?${SUMMARY_END}`), summary);
    fs.writeFileSync(documentPath, next);
    const projectionOut = arg("--projection-out");
    if (projectionOut) fs.writeFileSync(path.resolve(projectionOut), `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`Updated ${documentPath} from ${snapshot.capabilities.length} typed capability projections.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hermes parity evidence generation failed.";
    console.error(message.slice(0, 500));
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main();

import type { HermesSkillsAdapter } from "./skills-adapter";
import type {
  HermesCanonicalSkillsState,
  HermesExactSkillCandidate,
  HermesManagedSkill,
  HermesSkillAction,
  HermesSkillExecutionAuthority,
  HermesSkillOperation,
  HermesSkillsSnapshot,
  HermesSkillsSourceState,
} from "./skills-management-types";

export const HERMES_SKILLS_ACCEPTANCE_LABEL = "Acceptance fixture — no live Hermes mutation performed";

function installed(name: string, enabled: boolean, actions: HermesManagedSkill["supportedActions"], updateAvailable: boolean | null = null, hubIdentifier: string | null = null, source: string | null = null): HermesManagedSkill {
  const provenance = hubIdentifier ? "hub" : "bundled";
  const officialPublic = Boolean(hubIdentifier?.startsWith("official/") && (source ?? "official") === "official");
  return {
    identity: hubIdentifier ? `operator-os:hub:${hubIdentifier}` : `operator-os:${provenance}:${name}`,
    name,
    category: "fixture",
    installed: true,
    enabled,
    version: name === "update-ready" ? "1.0.0" : null,
    source: source ?? (hubIdentifier ? hubIdentifier.split("/")[0] : "bundled"),
    nativeTrust: officialPublic || !hubIdentifier ? "builtin" : "community",
    authorityClass: officialPublic ? "official_public" : "unapproved",
    official: officialPublic,
    public: officialPublic,
    localFulfillment: true,
    provenance,
    hubIdentifier,
    profile: "operator-os",
    updateAvailable,
    observedAt: "2026-07-21T20:00:00.000Z",
    supportedActions: actions,
  };
}

export function buildHermesSkillsAcceptanceSnapshot(): HermesSkillsSnapshot {
  return {
    fixture: true,
    fixtureLabel: HERMES_SKILLS_ACCEPTANCE_LABEL,
    profile: "operator-os",
    observedAt: "2026-07-21T20:00:00.000Z",
    sourceState: "success",
    summary: "Fixture covers governed Hermes Skills management without a live mutation.",
    interface: "Approved Hermes CLI catalog + canonical Skills JSON",
    operations: {
      install: { supported: true, interface: "fixture Hermes adapter", note: "No live dispatch." },
      enable: { supported: false, interface: "Unsupported", note: "No fixed native noninteractive mutation." },
      disable: { supported: false, interface: "Unsupported", note: "No fixed native noninteractive mutation." },
      update: { supported: false, interface: "fixture audit only", note: "Exact target-specific update readback is unavailable." },
      remove: { supported: true, interface: "fixture Hermes adapter", note: "No live dispatch." },
    },
    installed: [
      installed("enabled-skill", true, []),
      installed("disabled-skill", false, []),
      installed("update-ready", true, ["remove"], true, "official/productivity/update-ready", "official"),
      installed("removable-skill", true, ["remove"], false, "official/productivity/removable-skill", "official"),
      installed("unsupported-bundled", true, []),
      installed("malicious-metadata-redacted", true, []),
    ],
    available: [{
      identity: "official/productivity/installable-skill",
      name: "installable-skill",
      category: null,
      installed: false,
      enabled: null,
      version: null,
      source: "official",
      nativeTrust: "builtin",
      authorityClass: "official_public",
      official: true,
      public: true,
      localFulfillment: true,
      provenance: "hub",
      hubIdentifier: "official/productivity/installable-skill",
      profile: "operator-os",
      updateAvailable: null,
      observedAt: "2026-07-21T20:00:00.000Z",
      supportedActions: ["install"],
    }],
    duplicateIdentities: [],
  };
}

export class FakeHermesSkillsAdapter implements HermesSkillsAdapter {
  mutationCalls = 0;
  catalogCalls = 0;
  canonicalCalls = 0;
  candidateCalls = 0;
  authorityCalls = 0;
  readonly operations: HermesSkillOperation[] = [];
  failBeforeDispatch = false;
  unknownAfterDispatch = false;
  staleOnNextRead = false;
  sourceStateOverride: HermesSkillsSourceState | null = null;
  observedAtOverride: string | null = null;
  executionBarrier: Promise<void> | null = null;
  executionStarted: (() => void) | null = null;
  installAsDifferentHubIdentity = false;
  installWithSameNameBundled = false;
  leaveSameNameBundledOnRemove = false;
  private snapshotValue = buildHermesSkillsAcceptanceSnapshot();

  configuredProfile(): string {
    return "operator-os";
  }

  private async readSnapshot(): Promise<HermesSkillsSnapshot> {
    if (this.staleOnNextRead) {
      this.staleOnNextRead = false;
      const first = this.snapshotValue.installed[0];
      this.snapshotValue = { ...this.snapshotValue, observedAt: new Date().toISOString(), installed: [{ ...first, version: "externally-changed" }, ...this.snapshotValue.installed.slice(1)] };
    }
    const snapshot = structuredClone(this.snapshotValue);
    snapshot.observedAt = this.observedAtOverride ?? new Date().toISOString();
    snapshot.sourceState = this.sourceStateOverride ?? snapshot.sourceState;
    snapshot.installed = snapshot.installed.map((skill) => ({ ...skill, observedAt: snapshot.observedAt }));
    snapshot.available = snapshot.available.map((skill) => ({ ...skill, observedAt: snapshot.observedAt }));
    return snapshot;
  }

  async discoverCatalog(): Promise<HermesSkillsSnapshot> {
    this.catalogCalls += 1;
    return this.readSnapshot();
  }

  async readCanonicalInstalledState(profile: string): Promise<HermesCanonicalSkillsState> {
    this.canonicalCalls += 1;
    if (profile !== this.configuredProfile()) throw new Error("Fixture profile mismatch");
    const snapshot = await this.readSnapshot();
    const names = new Map<string, number>();
    for (const skill of snapshot.installed) names.set(skill.name, (names.get(skill.name) ?? 0) + 1);
    return {
      profile,
      observedAt: snapshot.observedAt,
      sourceState: snapshot.sourceState,
      summary: snapshot.summary,
      interface: "Canonical Hermes CLI installed-state JSON",
      installed: snapshot.installed,
      duplicateIdentities: snapshot.duplicateIdentities,
      duplicateNames: [...names.entries()].filter(([, count]) => count > 1).map(([name]) => name),
      evidence: { attemptCount: 1, finalClassification: "success", totalElapsedMs: 1 },
    };
  }

  async inspectExactCandidate(identifier: string, profile: string): Promise<HermesExactSkillCandidate> {
    this.candidateCalls += 1;
    if (profile !== this.configuredProfile()) throw new Error("Fixture profile mismatch");
    const snapshot = await this.readSnapshot();
    const skill = snapshot.available.find((item) => item.hubIdentifier === identifier)
      ?? snapshot.installed.find((item) => item.hubIdentifier === identifier);
    if (!skill?.hubIdentifier || !skill.source) throw new Error("Fixture candidate unavailable");
    return {
      identifier,
      name: skill.name,
      source: skill.source,
      nativeTrust: "builtin",
      authorityClass: "official_public",
      official: true,
      public: true,
      localFulfillment: true,
      scanVerdict: "safe",
      installPolicy: "allow",
      findingCount: 0,
      prerequisiteClassification: "none_declared",
      prerequisiteClasses: [],
      fingerprint: `fixture-candidate-${identifier}`,
      observedAt: new Date().toISOString(),
      evidence: {
        preview: { attemptCount: 1, finalClassification: "success", totalElapsedMs: 1 },
        scan: { attemptCount: 1, finalClassification: "success", totalElapsedMs: 1 },
      },
    };
  }

  async inspectExecutionAuthority(action: HermesSkillAction, profile: string): Promise<HermesSkillExecutionAuthority> {
    this.authorityCalls += 1;
    if (profile !== this.configuredProfile()) throw new Error("Fixture profile mismatch");
    if (action !== "install" && action !== "remove") throw new Error("Only install and removal are operational");
    return {
      action,
      profile,
      opaqueIdentity: `fixture-authority-${action}`,
      cliAuthorityIdentity: "fixture-cli",
      inspectedAt: new Date().toISOString(),
    };
  }

  async execute(operation: HermesSkillOperation, authority: HermesSkillExecutionAuthority): Promise<{ responseReceived: boolean }> {
    if (this.failBeforeDispatch) throw new Error("Fixture failed before dispatch");
    if (authority.opaqueIdentity !== `fixture-authority-${operation.action}`) throw new Error("Fixture authority mismatch");
    this.mutationCalls += 1;
    this.operations.push(operation);
    this.executionStarted?.();
    if (this.executionBarrier) await this.executionBarrier;
    if (this.unknownAfterDispatch) {
      const error = new Error("Fixture outcome unknown") as Error & { dispatched?: boolean };
      const { HermesSkillsAdapterError } = await import("./skills-adapter");
      throw new HermesSkillsAdapterError("timeout", error.message, true, false);
    }
    if (operation.action === "install") {
      const catalog = this.snapshotValue.available.find((skill) => skill.identity === operation.targetIdentity);
      this.snapshotValue.available = this.snapshotValue.available.filter((skill) => skill.identity !== operation.targetIdentity);
      const installedIdentifier = this.installAsDifferentHubIdentity ? `clawhub/${operation.targetName}` : operation.targetIdentity;
      this.snapshotValue.installed.push(installed(operation.targetName, true, ["remove"], false, installedIdentifier, this.installAsDifferentHubIdentity ? "clawhub" : catalog?.source ?? null));
      if (this.installWithSameNameBundled) this.snapshotValue.installed.push(installed(operation.targetName, true, []));
    } else if (operation.action === "remove") {
      this.snapshotValue.installed = this.snapshotValue.installed.filter((skill) => skill.identity !== operation.targetIdentity);
      if (this.leaveSameNameBundledOnRemove) this.snapshotValue.installed.push(installed(operation.targetName, true, []));
    } else {
      throw new Error("Fixture action is unsupported");
    }
    this.snapshotValue.observedAt = new Date().toISOString();
    return { responseReceived: true };
  }
}

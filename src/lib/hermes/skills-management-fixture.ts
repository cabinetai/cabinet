import type { HermesSkillsAdapter } from "./skills-adapter";
import type { HermesManagedSkill, HermesSkillOperation, HermesSkillsSnapshot } from "./skills-management-types";

export const HERMES_SKILLS_ACCEPTANCE_LABEL = "Acceptance fixture — no live Hermes mutation performed";

function installed(name: string, enabled: boolean, actions: HermesManagedSkill["supportedActions"], updateAvailable: boolean | null = null): HermesManagedSkill {
  return {
    identity: `operator-os:${name}`,
    name,
    category: "fixture",
    installed: true,
    enabled,
    version: name === "update-ready" ? "1.0.0" : null,
    source: actions.includes("remove") ? "Hermes Skills Hub" : "bundled",
    provenance: actions.includes("remove") ? "hub" : "bundled",
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
    interface: "Hermes Agent 0.19.0 authenticated API",
    operations: {
      install: { supported: true, interface: "fixture Hermes adapter", note: "No live dispatch." },
      enable: { supported: true, interface: "fixture Hermes adapter", note: "No live dispatch." },
      disable: { supported: true, interface: "fixture Hermes adapter", note: "No live dispatch." },
      update: { supported: true, interface: "fixture Hermes adapter", note: "No live dispatch." },
      remove: { supported: true, interface: "fixture Hermes adapter", note: "No live dispatch." },
    },
    installed: [
      installed("enabled-skill", true, ["disable"]),
      installed("disabled-skill", false, ["enable"]),
      installed("update-ready", true, ["disable", "update", "remove"], true),
      installed("removable-skill", true, ["disable", "update", "remove"], false),
      installed("unsupported-bundled", true, ["disable"]),
      installed("malicious-metadata-redacted", true, ["disable"]),
    ],
    available: [{
      identity: "official/productivity/installable-skill",
      name: "installable-skill",
      category: null,
      installed: false,
      enabled: null,
      version: null,
      source: "official",
      provenance: "hub",
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
  readonly operations: HermesSkillOperation[] = [];
  failBeforeDispatch = false;
  unknownAfterDispatch = false;
  staleOnNextRead = false;
  private snapshotValue = buildHermesSkillsAcceptanceSnapshot();

  async read(): Promise<HermesSkillsSnapshot> {
    if (this.staleOnNextRead) {
      this.staleOnNextRead = false;
      const first = this.snapshotValue.installed[0];
      this.snapshotValue = { ...this.snapshotValue, observedAt: new Date().toISOString(), installed: [{ ...first, version: "externally-changed" }, ...this.snapshotValue.installed.slice(1)] };
    }
    return structuredClone(this.snapshotValue);
  }

  async checkUpdate(name: string): Promise<boolean | null> {
    return this.snapshotValue.installed.find((skill) => skill.name === name)?.updateAvailable ?? null;
  }

  async execute(operation: HermesSkillOperation): Promise<{ responseReceived: boolean }> {
    if (this.failBeforeDispatch) throw new Error("Fixture failed before dispatch");
    this.mutationCalls += 1;
    this.operations.push(operation);
    if (this.unknownAfterDispatch) {
      const error = new Error("Fixture outcome unknown") as Error & { dispatched?: boolean };
      const { HermesSkillsAdapterError } = await import("./skills-adapter");
      throw new HermesSkillsAdapterError("timeout", error.message, true, false);
    }
    if (operation.action === "install") {
      this.snapshotValue.available = this.snapshotValue.available.filter((skill) => skill.name !== operation.targetName);
      this.snapshotValue.installed.push(installed(operation.targetName, true, ["disable", "update", "remove"], false));
    } else if (operation.action === "remove") {
      this.snapshotValue.installed = this.snapshotValue.installed.filter((skill) => skill.name !== operation.targetName);
    } else {
      this.snapshotValue.installed = this.snapshotValue.installed.map((skill) => skill.name === operation.targetName ? {
        ...skill,
        enabled: operation.action === "enable" ? true : operation.action === "disable" ? false : skill.enabled,
        updateAvailable: operation.action === "update" ? false : skill.updateAvailable,
      } : skill);
    }
    this.snapshotValue.observedAt = new Date().toISOString();
    return { responseReceived: true };
  }
}

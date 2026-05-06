import { readOptaleBrainFixtureLifecycle } from "@/lib/optale/brain-fixtures";
import { readOptaleBrainIsolationStatus } from "@/lib/optale/brain-isolation";
import { readOptaleBrainSemanticOperationLog } from "@/lib/optale/brain-semantic-operations";
import { buildOptaleConsoleMembersPayload } from "@/lib/optale/console-admin";
import { optaleRoleHasPermission, type OptaleIdentitySnapshot } from "@/lib/optale/identity-shared";
import { getOptaleRuntimeMode } from "@/lib/optale/runtime-mode";
import { readCabinetOptaleScope } from "@/lib/optale/scope-registry";

export type OptaleTenantReadinessStatus = "green" | "yellow" | "red";

export interface OptaleTenantReadinessCheck {
  id: string;
  area: string;
  check: string;
  status: OptaleTenantReadinessStatus;
  message: string;
}

export interface OptaleTenantReadinessPayload {
  version: 1;
  generatedAt: string;
  runtimeMode: string;
  readiness: {
    fixtureRehearsalReady: boolean;
    realOnboardingReady: boolean;
    red: number;
    yellow: number;
    green: number;
  };
  tenant: {
    companyId: string | null;
    companyCabinetPath: ".";
    personalCabinetPath: string;
    companyBrainTargetId: string | null;
    humanMembers: number;
    activeAdmins: number;
  };
  identity: {
    provider: OptaleIdentitySnapshot["provider"];
    source: OptaleIdentitySnapshot["source"];
    role: OptaleIdentitySnapshot["role"];
    subject: string | null;
    email: string | null;
  };
  checks: OptaleTenantReadinessCheck[];
  rows: Record<string, string>[];
}

type RuntimeEnv = Partial<Record<string, string | undefined>>;

function check(
  id: string,
  area: string,
  label: string,
  status: OptaleTenantReadinessStatus,
  message: string,
): OptaleTenantReadinessCheck {
  return { id, area, check: label, status, message };
}

function boolStatus(
  id: string,
  area: string,
  label: string,
  passed: boolean,
  passMessage: string,
  failMessage: string,
  failStatus: OptaleTenantReadinessStatus = "red",
): OptaleTenantReadinessCheck {
  return check(id, area, label, passed ? "green" : failStatus, passed ? passMessage : failMessage);
}

function personalCabinetPathFor(identity: OptaleIdentitySnapshot): string {
  const subject = identity.email || identity.subject || identity.name || "local-operator";
  const slug =
    subject
      .trim()
      .toLowerCase()
      .replace(/\\/g, "/")
      .replace(/@.+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "operator";
  return `personal/${slug}`;
}

function authProviderCheck(identity: OptaleIdentitySnapshot): OptaleTenantReadinessCheck {
  if (identity.provider === "authelia" || identity.provider === "better-auth") {
    return check(
      "auth-provider-external",
      "Auth",
      "Identity provider",
      "green",
      "Console identity is resolved by a central auth provider.",
    );
  }
  if (identity.provider === "cabinet-password" || identity.provider === "local") {
    return check(
      "auth-provider-external",
      "Auth",
      "Identity provider",
      "yellow",
      "Staging is using a local/password identity source; central auth should be enabled before partner onboarding.",
    );
  }
  return check(
    "auth-provider-external",
    "Auth",
    "Identity provider",
    "red",
    "Console identity is anonymous.",
  );
}

function terminalSemanticStatus(status: string | undefined): boolean {
  return status === undefined || status === "completed" || status === "failed" || status === "cancelled";
}

function rowsFor(checks: OptaleTenantReadinessCheck[]): Record<string, string>[] {
  return checks.map((entry) => ({
    area: entry.area,
    check: entry.check,
    status: entry.status,
    message: entry.message,
  }));
}

export async function buildOptaleTenantReadinessPayload(
  identity: OptaleIdentitySnapshot,
  input: {
    env?: RuntimeEnv;
    now?: Date;
    personalCabinetPath?: string | null;
  } = {},
): Promise<OptaleTenantReadinessPayload> {
  const env = input.env || process.env;
  const now = input.now || new Date();
  const personalCabinetPath = input.personalCabinetPath || personalCabinetPathFor(identity);
  const [members, companyScope, personalScope, isolation, fixtures, semanticLog] =
    await Promise.all([
      buildOptaleConsoleMembersPayload(identity, env, now, {
        syncIdentityMember: false,
      }),
      readCabinetOptaleScope("."),
      readCabinetOptaleScope(personalCabinetPath),
      readOptaleBrainIsolationStatus({
        companyCabinetPath: ".",
        personalCabinetPath,
      }),
      readOptaleBrainFixtureLifecycle({ limit: 5 }),
      readOptaleBrainSemanticOperationLog({ limit: 5 }),
    ]);

  const humanMembers = members.members.filter(
    (member) => member.kind === "human" && member.state === "Active",
  );
  const activeAdmins = humanMembers.filter((member) => member.role === "admin");
  const optaleAgentLive = members.members.some(
    (member) => member.id === "service:optale-agent" && member.state === "Live",
  );
  const fixtureState = fixtures.state;
  const latestSemantic = semanticLog.records[0];
  const scopeCompanyIdMatch =
    Boolean(companyScope.companyId && personalScope.companyId) &&
    companyScope.companyId === personalScope.companyId;

  const checks: OptaleTenantReadinessCheck[] = [
    boolStatus(
      "identity-authenticated",
      "Auth",
      "Authenticated identity",
      identity.authenticated,
      "Current request resolves to an authenticated Console identity.",
      "Console request is not authenticated.",
    ),
    authProviderCheck(identity),
    boolStatus(
      "identity-settings-manage",
      "Auth",
      "Settings manage role",
      optaleRoleHasPermission(identity.role, "settings.manage"),
      "Current Console role can manage onboarding-critical settings.",
      "Current Console role cannot manage onboarding-critical settings.",
      "yellow",
    ),
    boolStatus(
      "member-active-admin",
      "Members",
      "Active admin",
      activeAdmins.length >= 1,
      "At least one active Console admin exists.",
      "At least one active Console admin is required.",
    ),
    boolStatus(
      "member-partner-ready",
      "Members",
      "Partner member slots",
      humanMembers.length >= 2,
      "At least two active human members are registered.",
      "Only one active human member is registered; add partner accounts before real onboarding.",
      "yellow",
    ),
    boolStatus(
      "agent-harness-live",
      "Members",
      "Agent Harness principal",
      optaleAgentLive,
      "Agent Harness principal is visible as live.",
      "Agent Harness principal is not marked live in Console settings.",
      "yellow",
    ),
    boolStatus(
      "company-scope-explicit",
      "Tenant",
      "Company scope",
      companyScope.scope === "company" && companyScope.source === "explicit",
      "Root company cabinet has explicit company scope.",
      "Root company cabinet must have explicit company scope.",
    ),
    boolStatus(
      "personal-scope-explicit",
      "Tenant",
      "Personal scope",
      personalScope.scope === "personal" && personalScope.source === "explicit",
      "Current personal cabinet has explicit personal scope.",
      "Current personal cabinet must have explicit personal scope.",
    ),
    boolStatus(
      "company-id-match",
      "Tenant",
      "Company id match",
      scopeCompanyIdMatch,
      "Company and personal scopes resolve to the same company id.",
      "Company and personal scopes must share the same company id.",
    ),
    boolStatus(
      "brain-target-shared",
      "Tenant",
      "Company Brain target",
      Boolean(isolation.sharedCompanyBrainTargetId),
      "Company and personal scopes share one company Brain target.",
      "Company and personal scopes must share one company Brain target.",
    ),
    boolStatus(
      "brain-isolation-green",
      "Brain",
      "Isolation gate",
      isolation.readyForIngestion,
      "Brain isolation gate is green.",
      "Brain isolation gate has blocking checks.",
    ),
    boolStatus(
      "fixture-clean",
      "Brain",
      "Fixture lifecycle",
      fixtureState.status !== "dirty" && fixtureState.counts.unexpectedFiles === 0,
      `Fixture lifecycle is ${fixtureState.status} with no unexpected files.`,
      "Fixture lifecycle is dirty or contains unexpected files.",
    ),
    boolStatus(
      "fixture-real-data",
      "Brain",
      "Fixture data class",
      fixtureState.safety.realDataIncluded === false,
      "Fixture lifecycle explicitly marks real data as absent.",
      "Fixture lifecycle cannot prove real data is absent.",
    ),
    boolStatus(
      "semantic-terminal",
      "Brain",
      "Semantic job state",
      terminalSemanticStatus(latestSemantic?.status),
      latestSemantic
        ? `Latest semantic operation is ${latestSemantic.status}.`
        : "No semantic operation is currently queued.",
      "Latest semantic operation is still open.",
    ),
    boolStatus(
      "operator-mode",
      "Runtime",
      "Runtime mode",
      getOptaleRuntimeMode(env) === "operator",
      "Runtime is in operator mode for internal staging.",
      "Runtime is restricted customer mode; onboarding controls are intentionally limited.",
      "yellow",
    ),
  ];

  const red = checks.filter((entry) => entry.status === "red").length;
  const yellow = checks.filter((entry) => entry.status === "yellow").length;
  const green = checks.filter((entry) => entry.status === "green").length;

  return {
    version: 1,
    generatedAt: now.toISOString(),
    runtimeMode: getOptaleRuntimeMode(env),
    readiness: {
      fixtureRehearsalReady: red === 0,
      realOnboardingReady: red === 0 && yellow === 0,
      red,
      yellow,
      green,
    },
    tenant: {
      companyId: companyScope.companyId || null,
      companyCabinetPath: ".",
      personalCabinetPath,
      companyBrainTargetId: isolation.sharedCompanyBrainTargetId || null,
      humanMembers: humanMembers.length,
      activeAdmins: activeAdmins.length,
    },
    identity: {
      provider: identity.provider,
      source: identity.source,
      role: identity.role,
      subject: identity.subject,
      email: identity.email,
    },
    checks,
    rows: rowsFor(checks),
  };
}

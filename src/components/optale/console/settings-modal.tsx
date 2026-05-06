"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  OptaleConsoleMemberPrincipal,
  OptaleConsoleMembersPayload,
  OptaleConsolePermissionsPayload,
} from "@/lib/optale/console-admin-shared";
import type {
  OptaleSlackAgentPolicyPayload,
  OptaleSlackResponseMode,
} from "@/lib/optale/slack-agent-policy-shared";
import type { OptalePublicContextRegistry } from "@/lib/optale/context-registry";
import type {
  OptalePublicMcpPolicy,
  OptalePublicMcpPolicyServer,
} from "@/lib/optale/mcp-policy";
import type { OptaleTenantReadinessPayload } from "@/lib/optale/tenant-readiness";
import {
  OPTALE_CONSOLE_ROLE_LABELS,
  type OptaleConsoleRole,
  type OptaleIdentitySnapshot,
} from "@/lib/optale/identity-shared";
import { cn } from "@/lib/utils";
import { SETTING_TABS } from "./console-config";
import {
  identityNameLabel,
  identityRoleLabel,
  identitySourceLabel,
} from "./identity-labels";
import { ContextSection, DataTable, SurfaceHeader } from "./primitives";
import type { SettingsTabId, TableRow } from "./types";

type RemoteSettingsState<TPayload> = {
  status: "idle" | "loading" | "ready" | "error";
  payload: TPayload | null;
  error: string | null;
};

type MemberCreateInput = {
  principal: string;
  email: string;
  role: OptaleConsoleRole;
};

type MemberActionState = {
  busyId: string | null;
  error: string | null;
};

type SlackPolicyActionState = {
  busy: boolean;
  error: string | null;
};

type ToolPolicyPayload = {
  policy: OptalePublicMcpPolicy;
  effectiveServers: OptalePublicMcpPolicyServer[];
};

type ToolPolicyActionState = {
  busyId: string | null;
  error: string | null;
};

function initialRemoteSettingsState<TPayload>(): RemoteSettingsState<TPayload> {
  return { status: "idle", payload: null, error: null };
}

export function SettingsModal({
  identity,
  onClose,
}: {
  identity: OptaleIdentitySnapshot | null;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("integrations");
  const [membersState, setMembersState] = useState<
    RemoteSettingsState<OptaleConsoleMembersPayload>
  >(() => initialRemoteSettingsState());
  const [permissionsState, setPermissionsState] = useState<
    RemoteSettingsState<OptaleConsolePermissionsPayload>
  >(() => initialRemoteSettingsState());
  const [slackPolicyState, setSlackPolicyState] = useState<
    RemoteSettingsState<OptaleSlackAgentPolicyPayload>
  >(() => ({ status: "loading", payload: null, error: null }));
  const [tenantReadinessState, setTenantReadinessState] = useState<
    RemoteSettingsState<OptaleTenantReadinessPayload>
  >(() => initialRemoteSettingsState());
  const [contextRegistryState, setContextRegistryState] = useState<
    RemoteSettingsState<OptalePublicContextRegistry>
  >(() => initialRemoteSettingsState());
  const [toolPolicyState, setToolPolicyState] = useState<
    RemoteSettingsState<ToolPolicyPayload>
  >(() => initialRemoteSettingsState());
  const [memberAction, setMemberAction] = useState<MemberActionState>({
    busyId: null,
    error: null,
  });
  const [slackPolicyAction, setSlackPolicyAction] =
    useState<SlackPolicyActionState>({
      busy: false,
      error: null,
    });
  const [toolPolicyAction, setToolPolicyAction] =
    useState<ToolPolicyActionState>({
      busyId: null,
      error: null,
    });
  const activeTabDef = SETTING_TABS.find((tab) => tab.id === activeTab);

  useEffect(() => {
    if (membersState.status !== "loading") return;
    let cancelled = false;

    fetchSettingsPayload<OptaleConsoleMembersPayload>(
      "/api/optale/admin/members",
    )
      .then((payload) => {
        if (cancelled) return;
        setMembersState({ status: "ready", payload, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMembersState({
          status: "error",
          payload: null,
          error: errorMessage(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [membersState.status]);

  useEffect(() => {
    if (permissionsState.status !== "loading") return;
    let cancelled = false;

    fetchSettingsPayload<OptaleConsolePermissionsPayload>(
      "/api/optale/admin/permissions",
    )
      .then((payload) => {
        if (cancelled) return;
        setPermissionsState({ status: "ready", payload, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPermissionsState({
          status: "error",
          payload: null,
          error: errorMessage(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [permissionsState.status]);

  useEffect(() => {
    if (slackPolicyState.status !== "loading") return;
    let cancelled = false;

    fetchSettingsPayload<OptaleSlackAgentPolicyPayload>(
      "/api/optale/admin/slack-agent-policy",
    )
      .then((payload) => {
        if (cancelled) return;
        setSlackPolicyState({ status: "ready", payload, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSlackPolicyState({
          status: "error",
          payload: null,
          error: errorMessage(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [slackPolicyState.status]);

  useEffect(() => {
    if (tenantReadinessState.status !== "loading") return;
    let cancelled = false;

    fetchSettingsPayload<OptaleTenantReadinessPayload>(
      "/api/optale/admin/tenant-readiness",
    )
      .then((payload) => {
        if (cancelled) return;
        setTenantReadinessState({ status: "ready", payload, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTenantReadinessState({
          status: "error",
          payload: null,
          error: errorMessage(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [tenantReadinessState.status]);

  useEffect(() => {
    if (contextRegistryState.status !== "loading") return;
    let cancelled = false;

    fetchSettingsPayload<OptalePublicContextRegistry>(
      "/api/optale/context-registry",
    )
      .then((payload) => {
        if (cancelled) return;
        setContextRegistryState({ status: "ready", payload, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setContextRegistryState({
          status: "error",
          payload: null,
          error: errorMessage(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [contextRegistryState.status]);

  useEffect(() => {
    if (toolPolicyState.status !== "loading") return;
    let cancelled = false;

    fetchSettingsPayload<ToolPolicyPayload>("/api/optale/mcp-policy")
      .then((payload) => {
        if (cancelled) return;
        setToolPolicyState({ status: "ready", payload, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setToolPolicyState({
          status: "error",
          payload: null,
          error: errorMessage(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [toolPolicyState.status]);

  function handleTabChange(tabId: SettingsTabId) {
    setActiveTab(tabId);
    if (tabId === "members") {
      setMembersState((current) =>
        current.status === "idle"
          ? { status: "loading", payload: null, error: null }
          : current,
      );
    }
    if (tabId === "permissions") {
      setPermissionsState((current) =>
        current.status === "idle"
          ? { status: "loading", payload: null, error: null }
          : current,
      );
    }
    if (tabId === "integrations") {
      setSlackPolicyState((current) =>
        current.status === "idle"
          ? { status: "loading", payload: null, error: null }
          : current,
      );
    }
    if (tabId === "workspace" || tabId === "provisioning") {
      setTenantReadinessState((current) =>
        current.status === "idle"
          ? { status: "loading", payload: null, error: null }
          : current,
      );
    }
    if (tabId === "providers") {
      setContextRegistryState((current) =>
        current.status === "idle"
          ? { status: "loading", payload: null, error: null }
          : current,
      );
      setToolPolicyState((current) =>
        current.status === "idle"
          ? { status: "loading", payload: null, error: null }
          : current,
      );
    }
  }

  async function updateMemberRole(id: string, role: OptaleConsoleRole) {
    setMemberAction({ busyId: id, error: null });
    try {
      const payload = await mutateSettingsPayload<OptaleConsoleMembersPayload>(
        "/api/optale/admin/members",
        "PATCH",
        { id, role },
      );
      setMembersState({ status: "ready", payload, error: null });
      setMemberAction({ busyId: null, error: null });
    } catch (error: unknown) {
      setMemberAction({ busyId: null, error: errorMessage(error) });
    }
  }

  async function createMember(input: MemberCreateInput): Promise<boolean> {
    setMemberAction({ busyId: "create", error: null });
    try {
      const payload = await mutateSettingsPayload<OptaleConsoleMembersPayload>(
        "/api/optale/admin/members",
        "POST",
        input,
      );
      setMembersState({ status: "ready", payload, error: null });
      setMemberAction({ busyId: null, error: null });
      return true;
    } catch (error: unknown) {
      setMemberAction({ busyId: null, error: errorMessage(error) });
      return false;
    }
  }

  async function updateSlackPolicy(body: Record<string, unknown>) {
    setSlackPolicyAction({ busy: true, error: null });
    try {
      const payload = await mutateSettingsPayload<OptaleSlackAgentPolicyPayload>(
        "/api/optale/admin/slack-agent-policy",
        "PATCH",
        body,
      );
      setSlackPolicyState({ status: "ready", payload, error: null });
      setSlackPolicyAction({ busy: false, error: null });
    } catch (error: unknown) {
      setSlackPolicyAction({ busy: false, error: errorMessage(error) });
    }
  }

  async function updateToolPolicy(
    body: Record<string, unknown>,
    busyId = "policy",
  ) {
    setToolPolicyAction({ busyId, error: null });
    try {
      const current = toolPolicyState.payload?.policy;
      const payload = await mutateSettingsPayload<ToolPolicyPayload>(
        "/api/optale/mcp-policy",
        "PUT",
        {
          cabinetPath: current?.cabinetPath ?? ".",
          enforcementMode: current?.enforcementMode ?? "prompt",
          commandCenterManaged: current?.commandCenterManaged ?? true,
          policyId: current?.policyId,
          ownerId: current?.ownerId,
          companyId: current?.companyId,
          userId: current?.userId,
          servers: current?.servers ?? [],
          ...body,
        },
      );
      setToolPolicyState({ status: "ready", payload, error: null });
      setToolPolicyAction({ busyId: null, error: null });
    } catch (error: unknown) {
      setToolPolicyAction({ busyId: null, error: errorMessage(error) });
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-3">
      <section className="flex max-h-[760px] w-[calc(100vw-24px)] max-w-[1080px] flex-col border border-white/12 bg-[#15171b] text-[#ebe9df] shadow-2xl">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-white">
              Settings
            </h2>
            <p className="truncate text-xs text-[#8f9498]">
              {activeTabDef?.scope ?? "Workspace"} / {activeTabDef?.label}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-[#b5b8bb] hover:bg-white/10 hover:text-white"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="shrink-0 overflow-x-auto border-b border-white/10 px-3 py-2">
          <div className="flex gap-1">
            {SETTING_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "h-7 whitespace-nowrap border px-2.5 text-xs transition-colors",
                  activeTab === tab.id
                    ? "border-[#b8d47a]/50 bg-[#b8d47a]/12 text-white"
                    : "border-transparent text-[#aeb3b7] hover:bg-white/[0.05] hover:text-white",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SettingsTabContent
            activeTab={activeTab}
            identity={identity}
            membersState={membersState}
            permissionsState={permissionsState}
            slackPolicyState={slackPolicyState}
            tenantReadinessState={tenantReadinessState}
            contextRegistryState={contextRegistryState}
            toolPolicyState={toolPolicyState}
            memberAction={memberAction}
            slackPolicyAction={slackPolicyAction}
            toolPolicyAction={toolPolicyAction}
            onCreateMember={createMember}
            onUpdateMemberRole={updateMemberRole}
            onUpdateSlackPolicy={updateSlackPolicy}
            onUpdateToolPolicy={updateToolPolicy}
          />
        </div>
      </section>
    </div>
  );
}

function SettingsTabContent({
  activeTab,
  identity,
  membersState,
  permissionsState,
  slackPolicyState,
  tenantReadinessState,
  contextRegistryState,
  toolPolicyState,
  memberAction,
  slackPolicyAction,
  toolPolicyAction,
  onCreateMember,
  onUpdateMemberRole,
  onUpdateSlackPolicy,
  onUpdateToolPolicy,
}: {
  activeTab: SettingsTabId;
  identity: OptaleIdentitySnapshot | null;
  membersState: RemoteSettingsState<OptaleConsoleMembersPayload>;
  permissionsState: RemoteSettingsState<OptaleConsolePermissionsPayload>;
  slackPolicyState: RemoteSettingsState<OptaleSlackAgentPolicyPayload>;
  tenantReadinessState: RemoteSettingsState<OptaleTenantReadinessPayload>;
  contextRegistryState: RemoteSettingsState<OptalePublicContextRegistry>;
  toolPolicyState: RemoteSettingsState<ToolPolicyPayload>;
  memberAction: MemberActionState;
  slackPolicyAction: SlackPolicyActionState;
  toolPolicyAction: ToolPolicyActionState;
  onCreateMember: (input: MemberCreateInput) => Promise<boolean>;
  onUpdateMemberRole: (id: string, role: OptaleConsoleRole) => Promise<void>;
  onUpdateSlackPolicy: (body: Record<string, unknown>) => Promise<void>;
  onUpdateToolPolicy: (
    body: Record<string, unknown>,
    busyId?: string,
  ) => Promise<void>;
}) {
  if (activeTab === "profile") {
    return (
      <SettingsPanel
        title="Profile"
        description="Identity is resolved by the Console auth adapter. Operational permissions stay in Console RBAC."
        rows={[
          ["User", identityNameLabel(identity)],
          ["Email", identity?.email || "Not provided"],
          ["Role", identityRoleLabel(identity)],
          ["Login source", identitySourceLabel(identity)],
          ["Groups", identity?.groups.join(", ") || "None"],
        ]}
      />
    );
  }

  if (activeTab === "members") {
    return (
      <MembersSettingsTable
        state={membersState}
        action={memberAction}
        canManage={Boolean(
          identity?.permissions.includes("settings.manage") &&
            membersState.payload?.canManage,
        )}
        onCreateMember={onCreateMember}
        onUpdateMemberRole={onUpdateMemberRole}
      />
    );
  }

  if (activeTab === "permissions") {
    return (
      <RemoteSettingsTable
        state={permissionsState}
        title="Permissions"
        description="Role decisions generated from the active Console RBAC contract."
        columns={["area", "permission", "admin", "engineer", "operator", "viewer"]}
      />
    );
  }

  if (activeTab === "integrations") {
    return (
      <SlackPolicySettings
        state={slackPolicyState}
        action={slackPolicyAction}
        canManage={Boolean(
          identity?.permissions.includes("settings.manage") &&
            slackPolicyState.payload?.canManage,
        )}
        onUpdatePolicy={onUpdateSlackPolicy}
      />
    );
  }

  if (activeTab === "provisioning") {
    return (
      <TenantReadinessSettings
        state={tenantReadinessState}
        title="Provisioning Readiness"
        description="Readiness gates before agents, members, and Brain data are provisioned for real users."
      />
    );
  }

  if (activeTab === "providers") {
    return (
      <ToolContextPolicySettings
        contextState={contextRegistryState}
        policyState={toolPolicyState}
        action={toolPolicyAction}
        canManage={Boolean(identity?.permissions.includes("settings.manage"))}
        onUpdatePolicy={onUpdateToolPolicy}
      />
    );
  }

  if (activeTab === "meta-agent") {
    return (
      <SettingsPanel
        title="Meta Agent"
        description="Personal persona, voice, and daily operating preferences."
        rows={[
          ["Persona prefix", "Optale Code"],
          ["Voice", "Off"],
          ["Hands-free", "Off"],
          ["Daily cap", "$8"],
          ["Harness template", "Set by workspace admin"],
        ]}
      />
    );
  }

  if (activeTab === "workspace") {
    return (
      <TenantReadinessSettings
        state={tenantReadinessState}
        title="Workspace Readiness"
        description="Tenant, auth, Brain, and runtime gates for internal partner onboarding."
      />
    );
  }

  if (activeTab === "audit") {
    return (
      <SettingsTable
        title="Audit Export"
        description="Compliance export is controlled here. Run traces stay in Observatory."
        columns={["export", "range", "format", "state", "created"]}
        rows={[
          {
            export: "May trace archive",
            range: "Month to date",
            format: "JSONL",
            state: "Ready",
            created: "Today",
          },
          {
            export: "Policy decisions",
            range: "7 days",
            format: "CSV",
            state: "Ready",
            created: "Yesterday",
          },
        ]}
      />
    );
  }

  return (
    <SettingsPanel
      title={SETTING_TABS.find((tab) => tab.id === activeTab)?.label ?? "Settings"}
      description="Settings data surface ready for backend wiring."
      rows={[
        ["Scope", SETTING_TABS.find((tab) => tab.id === activeTab)?.scope ?? "Workspace"],
        ["State", "Ready for wiring"],
        ["Policy", "Role gated"],
      ]}
    />
  );
}

async function fetchSettingsPayload<TPayload>(path: string): Promise<TPayload> {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body && typeof body.message === "string"
        ? body.message
        : body && typeof body.error === "string"
          ? body.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return response.json() as Promise<TPayload>;
}

async function mutateSettingsPayload<TPayload>(
  path: string,
  method: "POST" | "PATCH" | "PUT",
  body: Record<string, unknown>,
): Promise<TPayload> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);
    const message =
      responseBody && typeof responseBody.message === "string"
        ? responseBody.message
        : responseBody && typeof responseBody.error === "string"
          ? responseBody.error
          : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return response.json() as Promise<TPayload>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function TenantReadinessSettings({
  state,
  title,
  description,
}: {
  state: RemoteSettingsState<OptaleTenantReadinessPayload>;
  title: string;
  description: string;
}) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <SettingsPanel
        title={title}
        description={description}
        rows={[
          ["State", "Loading"],
          ["Source", "Console tenant readiness API"],
          ["Cache", "No-store"],
        ]}
      />
    );
  }

  if (state.status === "error" || !state.payload) {
    return (
      <SettingsPanel
        title={title}
        description={description}
        rows={[
          ["State", "Unavailable"],
          ["Reason", state.error || "Request failed"],
          ["Source", "Console tenant readiness API"],
        ]}
      />
    );
  }

  const payload = state.payload;
  return (
    <div className="space-y-4">
      <SurfaceHeader
        eyebrow="Settings"
        title={title}
        description={description}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SettingsTable
          title="Readiness Checks"
          description="Green checks are deploy-ready, yellow checks need operator follow-up, red checks block onboarding."
          columns={["area", "check", "status", "message"]}
          rows={payload.rows}
        />
        <div className="space-y-4">
          <ContextSection
            title="Summary"
            rows={[
              ["Fixture rehearsal", payload.readiness.fixtureRehearsalReady ? "Ready" : "Blocked"],
              ["Real onboarding", payload.readiness.realOnboardingReady ? "Ready" : "Not yet"],
              ["Green", String(payload.readiness.green)],
              ["Yellow", String(payload.readiness.yellow)],
              ["Red", String(payload.readiness.red)],
            ]}
          />
          <ContextSection
            title="Tenant"
            rows={[
              ["Company", payload.tenant.companyId || "n/a"],
              ["Company Brain", payload.tenant.companyBrainTargetId || "n/a"],
              ["Personal path", payload.tenant.personalCabinetPath],
              ["Humans", String(payload.tenant.humanMembers)],
              ["Admins", String(payload.tenant.activeAdmins)],
              ["Runtime", payload.runtimeMode],
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function ToolContextPolicySettings({
  contextState,
  policyState,
  action,
  canManage,
  onUpdatePolicy,
}: {
  contextState: RemoteSettingsState<OptalePublicContextRegistry>;
  policyState: RemoteSettingsState<ToolPolicyPayload>;
  action: ToolPolicyActionState;
  canManage: boolean;
  onUpdatePolicy: (
    body: Record<string, unknown>,
    busyId?: string,
  ) => Promise<void>;
}) {
  if (
    contextState.status === "idle" ||
    contextState.status === "loading" ||
    policyState.status === "idle" ||
    policyState.status === "loading"
  ) {
    return (
      <SettingsPanel
        title="Tool & Context Policy"
        description="Workspace source lanes and tool access controlled by Console policy."
        rows={[
          ["State", "Loading"],
          ["Context source", "Console registry"],
          ["Policy source", "Tool policy API"],
        ]}
      />
    );
  }

  if (
    contextState.status === "error" ||
    policyState.status === "error" ||
    !contextState.payload ||
    !policyState.payload
  ) {
    return (
      <SettingsPanel
        title="Tool & Context Policy"
        description="Workspace source lanes and tool access controlled by Console policy."
        rows={[
          ["State", "Unavailable"],
          [
            "Reason",
            contextState.error || policyState.error || "Request failed",
          ],
          ["Policy", "No changes applied"],
        ]}
      />
    );
  }

  const context = contextState.payload;
  const policy = policyState.payload.policy;
  const sourceRows = sourcePolicyRows(context, policy);
  const configuredSources = context.mcp.servers.filter(
    (server) => server.status === "configured",
  ).length;
  const enabledServers = policy.servers.filter((server) => server.enabled).length;

  function updateServer(
    serverId: string,
    patch: Partial<OptalePublicMcpPolicyServer>,
  ) {
    const servers = policy.servers.map((server) =>
      server.id === serverId ? { ...server, ...patch } : server,
    );
    void onUpdatePolicy({ servers }, serverId);
  }

  return (
    <div className="space-y-4">
      <SurfaceHeader
        eyebrow="Settings"
        title="Tool & Context Policy"
        description="Controls which workspace context lanes and tool providers are available to Command, Slack, and governed agents."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <DataTable
            columns={["source", "state", "scope", "lane", "description"]}
            rows={sourceRows}
          />
          <ToolPolicyServerTable
            servers={policy.servers}
            runtimeServers={context.mcp.servers}
            action={action}
            canManage={canManage}
            onUpdateServer={updateServer}
          />
        </div>

        <div className="space-y-4">
          <div className="border border-white/10 bg-[#181a1e] p-4">
            <ContextSection
              title="Policy"
              rows={[
                ["Cabinet", policy.cabinetPath],
                ["Scope", policy.scope],
                ["Source", policy.source],
                ["Default", policy.defaultDecision],
                ["Enabled lanes", `${enabledServers}/${policy.servers.length}`],
                ["Effective", String(policyState.payload.effectiveServers.length)],
                ["Configured", `${configuredSources}/${context.mcp.servers.length}`],
              ]}
            />
          </div>
          <div className="space-y-3 border border-white/10 bg-[#181a1e] p-4">
            <h3 className="text-sm font-semibold text-white">Workspace Control</h3>
            <label className="flex min-h-10 items-center justify-between gap-3 border border-white/10 bg-[#101216] px-3 text-sm">
              <span className="text-[#d7d9dc]">Enforcement</span>
              <select
                value={policy.enforcementMode}
                disabled={!canManage || action.busyId !== null}
                onChange={(event) => {
                  void onUpdatePolicy({ enforcementMode: event.target.value });
                }}
                className="h-8 border border-white/10 bg-[#15171b] px-2 text-xs text-white outline-none disabled:opacity-60"
              >
                <option value="prompt">Prompt</option>
                <option value="proxy">Proxy</option>
              </select>
            </label>
            <PolicyToggle
              label="Command managed"
              checked={policy.commandCenterManaged}
              disabled={!canManage || action.busyId !== null}
              onChange={(commandCenterManaged) => {
                void onUpdatePolicy({ commandCenterManaged });
              }}
            />
            {action.error ? (
              <p className="border border-[#c9a86a]/30 bg-[#c9a86a]/10 px-3 py-2 text-sm text-[#c9a86a]">
                {action.error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlackPolicySettings({
  state,
  action,
  canManage,
  onUpdatePolicy,
}: {
  state: RemoteSettingsState<OptaleSlackAgentPolicyPayload>;
  action: SlackPolicyActionState;
  canManage: boolean;
  onUpdatePolicy: (body: Record<string, unknown>) => Promise<void>;
}) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <SettingsPanel
        title="Workspace Integrations"
        description="Channel and system connectors that can feed agents, tools, and trace evidence."
        rows={[
          ["State", "Loading"],
          ["Source", "Console admin API"],
          ["Cache", "No-store"],
        ]}
      />
    );
  }

  if (state.status === "error" || !state.payload) {
    return (
      <SettingsPanel
        title="Workspace Integrations"
        description="Channel and system connectors that can feed agents, tools, and trace evidence."
        rows={[
          ["State", "Unavailable"],
          ["Reason", state.error || "Request failed"],
          ["Source", "Console admin API"],
        ]}
      />
    );
  }

  const policy = state.payload.policy;
  const contextSummary = [
    policy.context.currentThread ? "current thread" : null,
    policy.context.linkedThreads ? "linked threads" : null,
    policy.context.timeReferences ? "time refs" : null,
  ].filter(Boolean).join(", ") || "disabled";

  return (
    <div className="space-y-4">
      <SurfaceHeader
        eyebrow="Settings"
        title="Workspace Integrations"
        description="Channel and system connectors that can feed agents, tools, and trace evidence."
      />
      <DataTable
        columns={["integration", "surface", "state", "context", "control"]}
        rows={[
          {
            integration: "Slack",
            surface: "Chat",
            state: policy.enabled ? "Live" : "Paused",
            context: contextSummary,
            control: policy.responseMode === "reply" ? "Reply" : "Observe",
          },
          {
            integration: "Teams",
            surface: "Chat",
            state: "Roadmap",
            context: "Workspace channels",
            control: "Provisioning",
          },
          {
            integration: "Vexa",
            surface: "Meetings",
            state: "Roadmap",
            context: "Zoom + Meet",
            control: "Integrations",
          },
          {
            integration: "Pipedrive",
            surface: "Objects",
            state: "Planned",
            context: "CRM account ontology",
            control: "Objects / Schema",
          },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3 border border-white/10 bg-[#181a1e] p-4">
          <h3 className="text-sm font-semibold text-white">Slack Agent Policy</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <PolicyToggle
              label="Enabled"
              checked={policy.enabled}
              disabled={!canManage || action.busy}
              onChange={(enabled) => {
                void onUpdatePolicy({ enabled });
              }}
            />
            <label className="flex min-h-10 items-center justify-between gap-3 border border-white/10 bg-[#101216] px-3 text-sm">
              <span className="text-[#d7d9dc]">Mode</span>
              <select
                value={policy.responseMode}
                disabled={!canManage || action.busy}
                onChange={(event) => {
                  void onUpdatePolicy({
                    responseMode: event.target.value as OptaleSlackResponseMode,
                  });
                }}
                className="h-8 border border-white/10 bg-[#15171b] px-2 text-xs text-white outline-none disabled:opacity-60"
              >
                <option value="reply">Reply</option>
                <option value="observe">Observe</option>
              </select>
            </label>
            <PolicyToggle
              label="Current thread"
              checked={policy.context.currentThread}
              disabled={!canManage || action.busy}
              onChange={(currentThread) => {
                void onUpdatePolicy({ context: { currentThread } });
              }}
            />
            <PolicyToggle
              label="Linked threads"
              checked={policy.context.linkedThreads}
              disabled={!canManage || action.busy}
              onChange={(linkedThreads) => {
                void onUpdatePolicy({ context: { linkedThreads } });
              }}
            />
            <PolicyToggle
              label="Time references"
              checked={policy.context.timeReferences}
              disabled={!canManage || action.busy}
              onChange={(timeReferences) => {
                void onUpdatePolicy({ context: { timeReferences } });
              }}
            />
            <PolicyNumber
              label="Thread messages"
              value={policy.context.maxThreadMessages}
              min={1}
              max={20}
              disabled={!canManage || action.busy}
              onChange={(maxThreadMessages) => {
                void onUpdatePolicy({ context: { maxThreadMessages } });
              }}
            />
            <PolicyToggle
              label="Post replies"
              checked={policy.tools.postReplies}
              disabled={!canManage || action.busy}
              onChange={(postReplies) => {
                void onUpdatePolicy({ tools: { postReplies } });
              }}
            />
            <PolicyToggle
              label="Inspect threads"
              checked={policy.tools.inspectThreads}
              disabled={!canManage || action.busy}
              onChange={(inspectThreads) => {
                void onUpdatePolicy({ tools: { inspectThreads } });
              }}
            />
            <PolicyToggle
              label="Company brain"
              checked={policy.memory.companyBrain}
              disabled={!canManage || action.busy}
              onChange={(companyBrain) => {
                void onUpdatePolicy({ memory: { companyBrain } });
              }}
            />
            <PolicyToggle
              label="Client brain"
              checked={policy.memory.clientBrain}
              disabled={!canManage || action.busy}
              onChange={(clientBrain) => {
                void onUpdatePolicy({ memory: { clientBrain } });
              }}
            />
          </div>
          {action.error ? (
            <p className="border border-[#c9a86a]/30 bg-[#c9a86a]/10 px-3 py-2 text-sm text-[#c9a86a]">
              {action.error}
            </p>
          ) : null}
        </div>
        <div className="border border-white/10 bg-[#181a1e] p-4">
          <ContextSection
            title="Runtime"
            rows={[
              ["Adapter endpoint", "Service token"],
              ["Updated", policy.updatedAt],
              ["Max linked threads", String(policy.context.maxReferencedThreads)],
              ["Command tools", policy.tools.runCommand ? "Allow" : "Deny"],
              ["Object tools", policy.tools.readObjects ? "Allow" : "Deny"],
              ["Agent tools", policy.tools.useAgents ? "Allow" : "Deny"],
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function sourcePolicyRows(
  context: OptalePublicContextRegistry,
  policy: OptalePublicMcpPolicy,
): TableRow[] {
  const policyByServer = new Map(
    policy.servers.map((server) => [server.id, server]),
  );
  const runtimeByServer = new Map(
    context.mcp.servers.map((server) => [server.id, server]),
  );

  return context.brainSources.map((source) => {
    const runtime = source.mcpServer
      ? runtimeByServer.get(source.mcpServer)
      : undefined;
    const rule = source.mcpServer
      ? policyByServer.get(source.mcpServer)
      : undefined;
    const state =
      runtime?.status === "planned"
        ? "Planned"
        : rule?.enabled
          ? "Allowed"
          : source.mcpServer
            ? "Blocked"
            : "Built in";

    return {
      source: source.name,
      state,
      scope: source.scopes.join(", "),
      lane: rule?.name || runtime?.name || "Built in",
      description: source.description,
    };
  });
}

function ToolPolicyServerTable({
  servers,
  runtimeServers,
  action,
  canManage,
  onUpdateServer,
}: {
  servers: OptalePublicMcpPolicyServer[];
  runtimeServers: OptalePublicContextRegistry["mcp"]["servers"];
  action: ToolPolicyActionState;
  canManage: boolean;
  onUpdateServer: (
    serverId: string,
    patch: Partial<OptalePublicMcpPolicyServer>,
  ) => void;
}) {
  const runtimeById = new Map(
    runtimeServers.map((server) => [server.id, server]),
  );

  return (
    <div className="overflow-hidden border border-white/10 bg-[#15171b]">
      <div className="border-b border-white/10 px-3 py-2">
        <h3 className="text-sm font-semibold text-white">Tool Lanes</h3>
        <p className="mt-1 text-xs text-[#8f9498]">
          Enabled lanes are available to governed agents for this workspace
          scope.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-[#1b1d22] text-[10px] uppercase tracking-[0.18em] text-[#8f9498]">
            <tr>
              <th className="border-b border-white/10 px-3 py-2">provider</th>
              <th className="border-b border-white/10 px-3 py-2">state</th>
              <th className="border-b border-white/10 px-3 py-2">scope</th>
              <th className="border-b border-white/10 px-3 py-2">permissions</th>
              <th className="border-b border-white/10 px-3 py-2">tools</th>
              <th className="border-b border-white/10 px-3 py-2">control</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => {
              const runtime = runtimeById.get(server.id);
              const planned = runtime?.status === "planned";
              const state = planned
                ? "Planned"
                : server.enabled
                  ? "Allowed"
                  : "Blocked";
              const busy = action.busyId === server.id;

              return (
                <tr
                  key={server.id}
                  className="border-b border-white/10 text-[#d7d9dc] last:border-b-0 hover:bg-white/[0.04]"
                >
                  <td className="px-3 py-3 align-middle font-medium text-white">
                    <div className="min-w-0">
                      <p className="truncate">{server.name}</p>
                      <p className="mt-0.5 truncate text-xs text-[#8f9498]">
                        {server.description || "Managed source"}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <span className={toolStateClass(state)}>{state}</span>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    {server.scopes.join(", ")}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    {server.permissions.length > 0
                      ? server.permissions.join(", ")
                      : "None"}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    {toolAccessLabel(server, planned)}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <label className="inline-flex items-center gap-2 text-xs text-[#d7d9dc]">
                      <input
                        type="checkbox"
                        checked={server.enabled}
                        disabled={!canManage || planned || busy}
                        onChange={(event) =>
                          onUpdateServer(server.id, {
                            enabled: event.target.checked,
                          })
                        }
                        className="size-4 accent-[#b8d47a]"
                      />
                      Enable
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function toolAccessLabel(
  server: OptalePublicMcpPolicyServer,
  planned: boolean,
): string {
  if (planned) return "Waiting for connector";
  if (server.deniedTools.length > 0) {
    return `Denied: ${server.deniedTools.join(", ")}`;
  }
  if (server.allowedTools.length > 0) {
    return server.allowedTools.join(", ");
  }
  return server.enabled ? "All read tools" : "Disabled";
}

function toolStateClass(state: string): string {
  if (state === "Allowed") return "text-xs text-[#b8d47a]";
  if (state === "Planned") return "text-xs text-[#c9a86a]";
  return "text-xs text-[#aeb3b7]";
}

function PolicyToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 border border-white/10 bg-[#101216] px-3 text-sm">
      <span className="text-[#d7d9dc]">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[#b8d47a]"
      />
    </label>
  );
}

function PolicyNumber({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 border border-white/10 bg-[#101216] px-3 text-sm">
      <span className="text-[#d7d9dc]">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-8 w-16 border border-white/10 bg-[#15171b] px-2 text-right text-xs text-white outline-none disabled:opacity-60"
      />
    </label>
  );
}

function MembersSettingsTable({
  state,
  action,
  canManage,
  onCreateMember,
  onUpdateMemberRole,
}: {
  state: RemoteSettingsState<OptaleConsoleMembersPayload>;
  action: MemberActionState;
  canManage: boolean;
  onCreateMember: (input: MemberCreateInput) => Promise<boolean>;
  onUpdateMemberRole: (id: string, role: OptaleConsoleRole) => Promise<void>;
}) {
  const [principal, setPrincipal] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OptaleConsoleRole>("viewer");

  if (state.status !== "ready") {
    return (
      <RemoteSettingsTable
        state={state}
        title="Members"
        description="Human operators and service principals resolved by the Console admin API."
        columns={["principal", "kind", "access", "source", "groups", "state"]}
      />
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await onCreateMember({
      principal: principal.trim(),
      email: email.trim(),
      role,
    });
    if (created) {
      setPrincipal("");
      setEmail("");
      setRole("viewer");
    }
  }

  const members = state.payload?.members ?? [];

  return (
    <div className="space-y-4">
      <SurfaceHeader
        eyebrow="Settings"
        title="Members"
        description="Human operators and service principals resolved by the Console admin API."
      />
      <div className="overflow-hidden border border-white/10 bg-[#15171b]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-[#1b1d22] text-[10px] uppercase tracking-[0.18em] text-[#8f9498]">
              <tr>
                <th className="border-b border-white/10 px-3 py-2">principal</th>
                <th className="border-b border-white/10 px-3 py-2">kind</th>
                <th className="border-b border-white/10 px-3 py-2">access</th>
                <th className="border-b border-white/10 px-3 py-2">source</th>
                <th className="border-b border-white/10 px-3 py-2">groups</th>
                <th className="border-b border-white/10 px-3 py-2">state</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  canManage={canManage}
                  busy={action.busyId === member.id}
                  onUpdateMemberRole={onUpdateMemberRole}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {canManage ? (
        <form
          className="grid gap-2 border border-white/10 bg-[#181a1e] p-3 md:grid-cols-[minmax(140px,1fr)_minmax(180px,1fr)_140px_92px]"
          onSubmit={handleCreate}
        >
          <input
            value={principal}
            onChange={(event) => setPrincipal(event.target.value)}
            placeholder="Name"
            className="h-9 border border-white/10 bg-[#101216] px-3 text-sm text-white outline-none placeholder:text-[#686d72] focus:border-[#b8d47a]/50"
          />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            type="email"
            className="h-9 border border-white/10 bg-[#101216] px-3 text-sm text-white outline-none placeholder:text-[#686d72] focus:border-[#b8d47a]/50"
          />
          <RoleSelect
            value={role}
            disabled={action.busyId === "create"}
            onChange={setRole}
          />
          <Button
            type="submit"
            size="sm"
            disabled={action.busyId === "create"}
            className="h-9 gap-1.5"
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        </form>
      ) : null}
      {action.error ? (
        <p className="border border-[#c9a86a]/30 bg-[#c9a86a]/10 px-3 py-2 text-sm text-[#c9a86a]">
          {action.error}
        </p>
      ) : null}
    </div>
  );
}

function MemberRow({
  member,
  canManage,
  busy,
  onUpdateMemberRole,
}: {
  member: OptaleConsoleMemberPrincipal;
  canManage: boolean;
  busy: boolean;
  onUpdateMemberRole: (id: string, role: OptaleConsoleRole) => Promise<void>;
}) {
  const canEdit = canManage && member.manageable;

  return (
    <tr className="border-b border-white/10 text-[#d7d9dc] last:border-b-0 hover:bg-white/[0.04]">
      <td className="px-3 py-3 align-middle font-medium text-white">
        <div className="min-w-0">
          <p className="truncate">{member.principal}</p>
          {member.email ? (
            <p className="mt-0.5 truncate text-xs text-[#8f9498]">
              {member.email}
            </p>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3 align-middle">{member.kind}</td>
      <td className="px-3 py-3 align-middle">
        {canEdit && member.role !== "system" ? (
          <RoleSelect
            value={member.role}
            disabled={busy}
            onChange={(nextRole) => {
              void onUpdateMemberRole(member.id, nextRole);
            }}
          />
        ) : (
          member.access
        )}
      </td>
      <td className="px-3 py-3 align-middle">{member.source}</td>
      <td className="px-3 py-3 align-middle">
        {member.groups.length > 0 ? member.groups.join(", ") : "None"}
      </td>
      <td className="px-3 py-3 align-middle">{member.state}</td>
    </tr>
  );
}

function RoleSelect({
  value,
  disabled,
  onChange,
}: {
  value: OptaleConsoleRole;
  disabled?: boolean;
  onChange: (role: OptaleConsoleRole) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as OptaleConsoleRole)}
      className="h-8 w-full min-w-28 border border-white/10 bg-[#101216] px-2 text-xs text-white outline-none focus:border-[#b8d47a]/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {(["admin", "engineer", "operator", "viewer"] as const).map((role) => (
        <option key={role} value={role}>
          {OPTALE_CONSOLE_ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}

function RemoteSettingsTable({
  state,
  title,
  description,
  columns,
}: {
  state: RemoteSettingsState<{ generatedAt: string; rows: TableRow[] }>;
  title: string;
  description: string;
  columns: string[];
}) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <SettingsPanel
        title={title}
        description={description}
        rows={[
          ["State", "Loading"],
          ["Source", "Console admin API"],
          ["Cache", "No-store"],
        ]}
      />
    );
  }

  if (state.status === "error") {
    return (
      <SettingsPanel
        title={title}
        description={description}
        rows={[
          ["State", "Unavailable"],
          ["Reason", state.error || "Request failed"],
          ["Source", "Console admin API"],
        ]}
      />
    );
  }

  return (
    <SettingsTable
      title={title}
      description={description}
      columns={columns}
      rows={state.payload?.rows ?? []}
    />
  );
}

function SettingsTable({
  title,
  description,
  columns,
  rows,
}: {
  title: string;
  description: string;
  columns: string[];
  rows: TableRow[];
}) {
  return (
    <div className="space-y-4">
      <SurfaceHeader eyebrow="Settings" title={title} description={description} />
      <DataTable columns={columns} rows={rows} />
    </div>
  );
}

function SettingsPanel({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: [string, string][];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <SurfaceHeader eyebrow="Settings" title={title} description={description} />
        <div className="border border-white/10 bg-[#181a1e] p-4">
          <ContextSection title="Values" rows={rows} />
        </div>
      </div>
      <div className="border border-white/10 bg-[#181a1e] p-4">
        <ContextSection
          title="Access"
          rows={[
            ["RBAC", "Server enforced"],
            ["Identity", "Adapter based"],
            ["Audit", "Trace + export"],
          ]}
        />
      </div>
    </div>
  );
}

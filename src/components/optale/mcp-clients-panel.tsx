"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Trash2,
  UnlockKeyhole,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/lib/ui/confirm";
import { showError, showSuccess } from "@/lib/ui/toast";

type OptaleScope = "company" | "personal" | "system";
type McpPermission = "read" | "write" | "execute";

interface McpClientBudget {
  dailyToolCalls?: number;
}

interface McpClient {
  id: string;
  name?: string;
  enabled: boolean;
  cabinetPath?: string;
  lockCabinet: boolean;
  agentScope?: OptaleScope;
  permissions: McpPermission[];
  allowedTools: string[];
  deniedTools: string[];
  budget?: McpClientBudget;
  auditEnabled: boolean;
  remoteActionsEnabled: boolean;
  source: "registry" | "legacy-env";
  tokenConfigured: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastRotatedAt?: string;
  disabledAt?: string;
}

type ClientForm = {
  id: string;
  name: string;
  cabinetPath: string;
  lockCabinet: boolean;
  agentScope: OptaleScope;
  permissions: McpPermission[];
  allowedTools: string;
  deniedTools: string;
  dailyToolCalls: string;
  auditEnabled: boolean;
  remoteActionsEnabled: boolean;
  enabled: boolean;
};

const PERMISSIONS: McpPermission[] = ["read", "write", "execute"];
const SCOPES: OptaleScope[] = ["company", "personal", "system"];

function defaultForm(cabinetPath: string): ClientForm {
  const normalizedPath = cabinetPath === "." ? "" : cabinetPath;
  return {
    id: "",
    name: "",
    cabinetPath: normalizedPath,
    lockCabinet: Boolean(normalizedPath),
    agentScope: "company",
    permissions: ["read"],
    allowedTools: "",
    deniedTools: "",
    dailyToolCalls: "",
    auditEnabled: true,
    remoteActionsEnabled: false,
    enabled: true,
  };
}

function formFromClient(client: McpClient): ClientForm {
  return {
    id: client.id,
    name: client.name || "",
    cabinetPath: client.cabinetPath || "",
    lockCabinet: client.lockCabinet,
    agentScope: client.agentScope || "company",
    permissions: client.permissions.length > 0 ? client.permissions : ["read"],
    allowedTools: client.allowedTools.join(", "),
    deniedTools: client.deniedTools.join(", "),
    dailyToolCalls: client.budget?.dailyToolCalls
      ? String(client.budget.dailyToolCalls)
      : "",
    auditEnabled: client.auditEnabled,
    remoteActionsEnabled: client.remoteActionsEnabled,
    enabled: client.enabled,
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function payloadFromForm(form: ClientForm) {
  const dailyToolCalls = Number(form.dailyToolCalls);
  return {
    id: form.id.trim(),
    name: form.name.trim() || undefined,
    cabinetPath: form.cabinetPath.trim() || undefined,
    lockCabinet: form.lockCabinet,
    agentScope: form.agentScope,
    permissions: form.permissions,
    allowedTools: splitList(form.allowedTools),
    deniedTools: splitList(form.deniedTools),
    dailyToolCalls:
      Number.isFinite(dailyToolCalls) && dailyToolCalls > 0
        ? Math.floor(dailyToolCalls)
        : undefined,
    auditEnabled: form.auditEnabled,
    remoteActionsEnabled: form.remoteActionsEnabled,
    enabled: form.enabled,
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;
  if (!response.ok) {
    throw new Error(
      (body && typeof body === "object" && "error" in body && body.error) ||
        `Request failed: ${response.status}`
    );
  }
  return body as T;
}

export function OptaleMcpClientsPanel({
  cabinetPath,
  className,
}: {
  cabinetPath: string;
  className?: string;
}) {
  const [clients, setClients] = useState<McpClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<ClientForm>(() => defaultForm(cabinetPath));
  const [oneTimeToken, setOneTimeToken] = useState<{
    clientId: string;
    token: string;
  } | null>(null);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ clients: McpClient[] }>(
        "/api/optale/mcp-clients"
      );
      setClients(data.clients);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to load MCP clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const fileClients = useMemo(
    () => clients.filter((client) => client.source === "registry"),
    [clients]
  );
  const activeCount = useMemo(
    () => clients.filter((client) => client.enabled).length,
    [clients]
  );

  function openCreate() {
    setForm(defaultForm(cabinetPath));
    setDialogMode("create");
  }

  function openEdit(client: McpClient) {
    setForm(formFromClient(client));
    setDialogMode("edit");
  }

  async function submitForm() {
    if (!form.id.trim()) {
      showError("Client id is required");
      return;
    }
    setBusyId(form.id || "new");
    try {
      if (dialogMode === "edit") {
        await fetchJson<{ client: McpClient }>("/api/optale/mcp-clients", {
          method: "PATCH",
          body: JSON.stringify(payloadFromForm(form)),
        });
        showSuccess("MCP client updated");
      } else {
        const result = await fetchJson<{
          client: McpClient;
          oneTimeToken: string;
        }>("/api/optale/mcp-clients", {
          method: "POST",
          body: JSON.stringify(payloadFromForm(form)),
        });
        setOneTimeToken({
          clientId: result.client.id,
          token: result.oneTimeToken,
        });
        showSuccess("MCP client created");
      }
      setDialogMode(null);
      await loadClients();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to save MCP client");
    } finally {
      setBusyId(null);
    }
  }

  async function rotateClient(client: McpClient) {
    const ok = await confirmDialog({
      title: "Rotate MCP token",
      message: `${client.id} will receive a new bearer token.`,
      confirmText: "Rotate",
    });
    if (!ok) return;
    setBusyId(client.id);
    try {
      const result = await fetchJson<{
        client: McpClient;
        oneTimeToken: string;
      }>("/api/optale/mcp-clients", {
        method: "POST",
        body: JSON.stringify({ action: "rotate", id: client.id }),
      });
      setOneTimeToken({
        clientId: result.client.id,
        token: result.oneTimeToken,
      });
      showSuccess("MCP token rotated");
      await loadClients();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to rotate MCP token");
    } finally {
      setBusyId(null);
    }
  }

  async function disableClient(client: McpClient) {
    const ok = await confirmDialog({
      title: "Disable MCP client",
      message: `${client.id} will stop authenticating.`,
      confirmText: "Disable",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(client.id);
    try {
      await fetchJson<{ client: McpClient }>("/api/optale/mcp-clients", {
        method: "DELETE",
        body: JSON.stringify({ id: client.id }),
      });
      showSuccess("MCP client disabled");
      await loadClients();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to disable MCP client");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-amber-500" />
            <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
              MCP clients
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {loading
              ? "Loading clients"
              : `${activeCount} active / ${clients.length} total`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void loadClients()}
            disabled={loading}
            title="Refresh MCP clients"
            aria-label="Refresh MCP clients"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon-xs"
            onClick={openCreate}
            title="Create MCP client"
            aria-label="Create MCP client"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="size-3.5 text-emerald-500" />
            {fileClients.length} file-backed
          </span>
          <span className="rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            bearer access
          </span>
        </div>

        <div className="space-y-1.5 p-2">
          {clients.length === 0 && !loading ? (
            <div className="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[12px] text-muted-foreground">
              No MCP clients.
            </div>
          ) : null}

          {(clients.length > 0 ? clients : loading ? loadingSkeletonClients() : []).map((client) => (
            <ClientRow
              key={client.id}
              client={client}
              busy={busyId === client.id}
              disabled={loading || Boolean(busyId)}
              onEdit={() => openEdit(client)}
              onRotate={() => void rotateClient(client)}
              onDisable={() => void disableClient(client)}
            />
          ))}
        </div>
      </div>

      <ClientDialog
        mode={dialogMode}
        form={form}
        busy={Boolean(busyId)}
        onOpenChange={(open) => {
          if (!open) setDialogMode(null);
        }}
        onChange={setForm}
        onSubmit={() => void submitForm()}
      />

      <TokenDialog
        value={oneTimeToken}
        onOpenChange={(open) => {
          if (!open) setOneTimeToken(null);
        }}
      />
    </section>
  );
}

function ClientRow({
  client,
  busy,
  disabled,
  onEdit,
  onRotate,
  onDisable,
}: {
  client: McpClient;
  busy: boolean;
  disabled: boolean;
  onEdit: () => void;
  onRotate: () => void;
  onDisable: () => void;
}) {
  const manageable = client.source === "registry";
  const activeRegistryClient = manageable && client.enabled;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2 py-2",
        client.enabled
          ? "border-border/70 bg-background"
          : "border-border/40 bg-muted/20 opacity-70"
      )}
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30">
        {client.lockCabinet ? (
          <LockKeyhole className="size-3.5 text-amber-500" />
        ) : (
          <UnlockKeyhole className="size-3.5 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[12px] font-medium text-foreground">
            {client.name || client.id}
          </span>
          {!client.enabled ? (
            <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
              disabled
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[10.5px] text-muted-foreground">
          {client.id} / {client.agentScope || "scope"} /{" "}
          {client.cabinetPath || "all spaces"}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          {client.permissions.map((permission) => (
            <span
              key={permission}
              className="rounded border border-border/60 bg-muted/30 px-1 py-0.5 text-[9.5px] text-muted-foreground"
            >
              {permission}
            </span>
          ))}
          {client.budget?.dailyToolCalls ? (
            <span className="rounded border border-amber-500/25 bg-amber-500/10 px-1 py-0.5 text-[9.5px] text-amber-700 dark:text-amber-300">
              {client.budget.dailyToolCalls}/day
            </span>
          ) : null}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onEdit}
          disabled={disabled || !manageable}
          title="Edit MCP client"
          aria-label="Edit MCP client"
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onRotate}
          disabled={disabled || !activeRegistryClient}
          title="Rotate token"
          aria-label="Rotate token"
        >
          <RotateCw className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDisable}
          disabled={disabled || !activeRegistryClient}
          title="Disable MCP client"
          aria-label="Disable MCP client"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ClientDialog({
  mode,
  form,
  busy,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  mode: "create" | "edit" | null;
  form: ClientForm;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: ClientForm) => void;
  onSubmit: () => void;
}) {
  const open = mode !== null;
  const title = mode === "edit" ? "Edit MCP client" : "Create MCP client";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client id">
            <Input
              value={form.id}
              onChange={(event) =>
                onChange({
                  ...form,
                  id: event.target.value.replace(/[^a-zA-Z0-9._:-]/g, ""),
                })
              }
              disabled={mode === "edit"}
              className="h-8 font-mono text-[12.5px]"
              placeholder="client-acme"
            />
          </Field>
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(event) => onChange({ ...form, name: event.target.value })}
              className="h-8 text-[12.5px]"
              placeholder="Acme agents"
            />
          </Field>
          <Field label="Space path">
            <Input
              value={form.cabinetPath}
              onChange={(event) =>
                onChange({ ...form, cabinetPath: event.target.value })
              }
              className="h-8 font-mono text-[12.5px]"
              placeholder="clients/acme"
            />
          </Field>
          <Field label="Scope">
            <select
              value={form.agentScope}
              onChange={(event) =>
                onChange({
                  ...form,
                  agentScope: event.target.value as OptaleScope,
                })
              }
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-[12.5px] outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
            >
              {SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {scope}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Allowed tools">
            <Input
              value={form.allowedTools}
              onChange={(event) =>
                onChange({ ...form, allowedTools: event.target.value })
              }
              className="h-8 font-mono text-[12.5px]"
              placeholder="observatory_brain_summary"
            />
          </Field>
          <Field label="Denied tools">
            <Input
              value={form.deniedTools}
              onChange={(event) =>
                onChange({ ...form, deniedTools: event.target.value })
              }
              className="h-8 font-mono text-[12.5px]"
              placeholder="observatory_command_center_action"
            />
          </Field>
          <Field label="Daily calls">
            <Input
              type="number"
              min={1}
              value={form.dailyToolCalls}
              onChange={(event) =>
                onChange({ ...form, dailyToolCalls: event.target.value })
              }
              className="h-8 text-[12.5px]"
              placeholder="100"
            />
          </Field>
          <div className="space-y-2">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
              Permissions
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PERMISSIONS.map((permission) => {
                const checked = form.permissions.includes(permission);
                return (
                  <button
                    key={permission}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...form,
                        permissions: checked
                          ? form.permissions.filter((entry) => entry !== permission)
                          : [...form.permissions, permission],
                      })
                    }
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors",
                      checked
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {checked ? <Check className="size-3" /> : <X className="size-3" />}
                    {permission}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 sm:grid-cols-2">
          <CheckRow
            label="Lock space"
            checked={form.lockCabinet}
            onChange={(checked) => onChange({ ...form, lockCabinet: checked })}
          />
          <CheckRow
            label="Audit calls"
            checked={form.auditEnabled}
            onChange={(checked) => onChange({ ...form, auditEnabled: checked })}
          />
          <CheckRow
            label="Remote actions"
            checked={form.remoteActionsEnabled}
            onChange={(checked) =>
              onChange({ ...form, remoteActionsEnabled: checked })
            }
          />
          <CheckRow
            label="Enabled"
            checked={form.enabled}
            onChange={(checked) => onChange({ ...form, enabled: checked })}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={busy || form.permissions.length === 0}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {mode === "edit" ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenDialog({
  value,
  onOpenChange,
}: {
  value: { clientId: string; token: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const copied = Boolean(value?.token && copiedToken === value.token);

  async function copyToken() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value.token);
      setCopiedToken(value.token);
      showSuccess("Token copied");
    } catch {
      showError("Could not copy token");
    }
  }

  return (
    <Dialog open={Boolean(value)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{value?.clientId || "MCP token"}</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
          This token will not be shown again.
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
          <code className="min-w-0 flex-1 truncate font-mono text-[12px]">
            {value?.token}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void copyToken()}
            className="h-7 gap-1.5"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            Copy
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
        {label}
      </span>
      {children}
    </label>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-8 items-center gap-2 rounded-md border border-border/60 bg-background px-2 text-[12px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 rounded border-border"
      />
      <span className="truncate">{label}</span>
    </label>
  );
}

function loadingSkeletonClients(): McpClient[] {
  return [
    {
      id: "loading-client",
      enabled: true,
      lockCabinet: false,
      permissions: ["read"],
      allowedTools: [],
      deniedTools: [],
      auditEnabled: true,
      remoteActionsEnabled: false,
      source: "registry",
      tokenConfigured: false,
    },
  ];
}

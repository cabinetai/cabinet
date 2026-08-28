"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cable,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/ui/toast";
import { useIsCloud } from "@/lib/cloud/client-tier";

interface ConnectorStatus {
  supported: boolean;
  installed: boolean;
  running: boolean;
  version: string;
  port: number | null;
  routingEnabled: boolean;
  error?: string;
}

interface AccountSummary {
  provider: string;
  label: string | null;
  email: string | null;
  status: string | null;
  disabled: boolean;
  unavailable: boolean;
}

type OAuthProvider = "anthropic" | "codex";
type OAuthState = {
  provider: OAuthProvider;
  state: string;
  phase: "waiting" | "done" | "error";
  url?: string;
  userCode?: string;
  message?: string;
} | null;

const PROVIDERS: Array<{ id: OAuthProvider; label: string; detail: string }> = [
  { id: "codex", label: "ChatGPT / Codex", detail: "Use your Codex-enabled ChatGPT account" },
  { id: "anthropic", label: "Claude", detail: "Use your Claude Code subscription" },
];

function notifyProvidersUpdated(): void {
  window.dispatchEvent(new Event("cabinet:providers-updated"));
}

async function api(action: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/agents/cli-proxy/${action}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${response.status}`);
  }
  return body;
}

export function CLIProxyConnectorCard() {
  const isCloud = useIsCloud();
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [oauth, setOAuth] = useState<OAuthState>(null);
  const mounted = useRef(true);
  const cancelledOAuthStates = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const next = await api("status") as ConnectorStatus;
      if (!mounted.current) return;
      setStatus(next);
      if (next.running) {
        const accountData = await api("accounts") as { accounts?: AccountSummary[] };
        if (mounted.current) setAccounts(accountData.accounts || []);
      } else {
        setAccounts([]);
      }
    } catch (error) {
      if (mounted.current) {
        setStatus({
          supported: true,
          installed: false,
          running: false,
          version: "",
          port: null,
          routingEnabled: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  const lifecycle = async (action: "install" | "start" | "stop") => {
    setBusy(action);
    try {
      setStatus(await api(action, { method: "POST" }) as ConnectorStatus);
      await refresh();
      notifyProvidersUpdated();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const connect = async (provider: OAuthProvider) => {
    setBusy(provider);
    const popup = window.open("", "_blank");
    try {
      const result = await api("oauth/start", {
        method: "POST",
        body: JSON.stringify({ provider }),
      }) as { url: string; state: string; user_code?: string };
      cancelledOAuthStates.current.delete(result.state);
      setOAuth({
        provider,
        state: result.state,
        phase: "waiting",
        url: result.url,
        userCode: result.user_code,
      });
      if (popup) {
        popup.opener = null;
        popup.location.href = result.url;
      }

      const deadline = Date.now() + 5 * 60_000;
      while (mounted.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        if (cancelledOAuthStates.current.has(result.state)) return;
        const poll = await api(`oauth/status?state=${encodeURIComponent(result.state)}`) as {
          status?: string;
          error?: string;
        };
        if (poll.status === "wait") continue;
        if (poll.status === "ok") {
          setOAuth({ provider, state: result.state, phase: "done" });
          await refresh();
          notifyProvidersUpdated();
          return;
        }
        setOAuth({
          provider,
          state: result.state,
          phase: "error",
          message: poll.error || "Authentication failed",
        });
        return;
      }
      if (mounted.current) {
        setOAuth({ provider, state: result.state, phase: "error", message: "Authentication timed out" });
      }
    } catch (error) {
      popup?.close();
      showError(error instanceof Error ? error.message : String(error));
      setOAuth(null);
    } finally {
      setBusy(null);
    }
  };

  const cancelOAuth = async () => {
    if (!oauth?.state) return;
    cancelledOAuthStates.current.add(oauth.state);
    try {
      await api("oauth/cancel", { method: "POST", body: JSON.stringify({ state: oauth.state }) });
    } catch {
      // The upstream session may already have expired; clearing local UI is safe.
    }
    setOAuth(null);
  };

  const setRouting = async (enabled: boolean) => {
    setBusy("routing");
    try {
      setStatus(await api("routing", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }) as ConnectorStatus);
      notifyProvidersUpdated();
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const stateLabel = !status
    ? "Checking…"
    : status.running
      ? `Running · v${status.version}`
      : status.installed
        ? `Installed · v${status.version}`
        : status.supported
          ? "Not installed"
          : "Unsupported on this device";

  if (isCloud !== false) return null;

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Cable className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14px] font-semibold">Connected AI accounts</h3>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                status?.running ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
              )}>
                {stateLabel}
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-[12px] text-muted-foreground">
              Cabinet manages a private local connector so your existing agent CLIs can use connected subscriptions without copying API keys or changing global CLI settings.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!status?.installed ? (
            <Button
              size="sm"
              disabled={!status?.supported || busy !== null}
              onClick={() => void lifecycle("install")}
            >
              {busy === "install" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Set up connector
            </Button>
          ) : !status.running ? (
            <Button size="sm" disabled={busy !== null} onClick={() => void lifecycle("start")}>
              {busy === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Start
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void lifecycle("stop")}>
              {busy === "stop" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
              Stop
            </Button>
          )}
        </div>
      </div>

      {status?.error && (
        <p className="mt-3 rounded-md bg-rose-500/10 px-3 py-2 text-[11px] text-rose-500">
          {status.error}
        </p>
      )}

      {status?.running && (
        <div className="mt-4 border-t border-border pt-4">
          <label className="mb-4 flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-muted/40 px-3 py-2.5">
            <span>
              <span className="block text-[12px] font-medium">Use connected accounts for agent runs</span>
              <span className="block text-[10px] text-muted-foreground">
                Routes Claude Code and Codex through this connector when a matching account is connected.
              </span>
            </span>
            <input
              type="checkbox"
              checked={status.routingEnabled}
              disabled={busy !== null}
              onChange={(event) => void setRouting(event.target.checked)}
              className="h-4 w-4 shrink-0 accent-primary"
            />
          </label>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Connect an account
            </h4>
            {accounts.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {accounts.length} connected
              </span>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {PROVIDERS.map((provider) => {
              const connected = accounts.filter((account) => account.provider === provider.id ||
                (provider.id === "anthropic" && account.provider === "claude"));
              const waiting = oauth?.provider === provider.id && oauth.phase === "waiting";
              return (
                <button
                  key={provider.id}
                  type="button"
                  disabled={busy !== null || waiting}
                  onClick={() => void connect(provider.id)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-start transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:opacity-60"
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium">{provider.label}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {connected[0]?.email || connected[0]?.label || provider.detail}
                    </p>
                  </div>
                  {waiting || busy === provider.id ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : connected.length > 0 ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>

          {oauth && (
            <div className={cn(
              "mt-3 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-[11px]",
              oauth.phase === "done"
                ? "bg-emerald-500/10 text-emerald-600"
                : oauth.phase === "error"
                  ? "bg-rose-500/10 text-rose-500"
                  : "bg-primary/10 text-foreground"
            )}>
              {oauth.phase === "waiting" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>
                {oauth.phase === "waiting"
                  ? "Finish authorization in the browser."
                  : oauth.phase === "done"
                    ? "Account connected."
                    : oauth.message}
              </span>
              {oauth.userCode && (
                <code className="rounded bg-background px-2 py-0.5 font-mono">{oauth.userCode}</code>
              )}
              {oauth.phase === "waiting" && oauth.url && (
                <a
                  href={oauth.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  Open login
                </a>
              )}
              <button className="ms-auto font-medium hover:underline" onClick={() => void cancelOAuth()}>
                {oauth.phase === "waiting" ? "Cancel" : "Dismiss"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

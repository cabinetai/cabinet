"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Loader2, ExternalLink, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/ui/toast";
import { openExternalUrl } from "@/lib/runtime/open-url";
import type { IntegrationItem } from "@/lib/integrations/preview-catalog";

/**
 * The "Smart default + disclosure" connect surface for an integration.
 *
 * On load it reads the real catalog (`/api/agents/config/mcp-catalog`) to learn
 * which agent CLIs can host this server, which the user's *default* runtime is,
 * and where it's already connected. By default it installs into the default
 * provider only; a disclosure lets power users add other environments. The CLI
 * is the MCP client — Cabinet just writes the `cabinet-<id>` server entry into
 * the chosen CLIs (secrets go to `.cabinet.env`, never the config).
 */

type Backend = "cli-pkce" | "user-app" | "token" | "cabinet-broker";

interface ProviderInfo {
  id: string;
  name: string;
  iconAsset?: string;
  capable: boolean;
  transports: string[];
}
interface Credential {
  envKey: string;
  label: string;
  kind: "secret" | "filepath" | "plain";
  required: boolean;
  placeholder: string;
  hint?: string;
}
interface CatalogItem {
  id: string;
  label: string;
  transport: "http" | "stdio";
  authBackend: Backend;
  supportedProviderIds: string[];
  connectedProviderIds: string[];
  credentials: Credential[];
  credentialStatus: Record<string, { hasValue: boolean; lastFour: string }>;
  sourceUrl: string;
  /** Connect-time sign-in style: http (via Claude), stdio (daemon-run), or none. */
  signinKind?: "http" | "stdio" | null;
}
interface Payload {
  providers: ProviderInfo[];
  selectedEnvironments: string[];
  defaultProvider: string;
  approved: CatalogItem[];
}

/** Result of the live Discord connection check (see discord-check route). */
interface DiscordChecks {
  token: { ok: boolean; botTag?: string; error?: string; missing?: boolean };
  guild: {
    ok?: boolean;
    name?: string;
    error?: string;
    inviteUrl?: string;
    skipped?: boolean;
    unknown?: boolean;
  };
}

function pickPrimary(
  supported: ProviderInfo[],
  selected: string[],
  defaultProvider: string,
): string | null {
  const ids = supported.map((p) => p.id);
  if (ids.includes(defaultProvider)) return defaultProvider;
  const firstSelected = ids.find((id) => selected.includes(id));
  return firstSelected ?? ids[0] ?? null;
}

export function ConnectPanel({
  item,
  msMode: msModeProp,
  onMsModeChange,
}: {
  item: IntegrationItem;
  /** M365 only: lifted personal/work mode so the page's setup guide can react. */
  msMode?: "personal" | "work";
  onMsModeChange?: (mode: "personal" | "work") => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  // Microsoft 365 only: "personal" → no fields, built-in app + device-code
  // sign-in; "work" → paste your own Entra app credentials.
  const isM365 = item.id === "microsoft-365";
  const [msModeInternal, setMsModeInternal] = useState<"personal" | "work">("personal");
  const msAccountMode = msModeProp ?? msModeInternal;
  const setMsAccountMode = useCallback(
    (mode: "personal" | "work") => {
      setMsModeInternal(mode);
      onMsModeChange?.(mode);
    },
    [onMsModeChange],
  );
  // M365 personal device-code sign-in, driven from here so the user can
  // authenticate at connect-time (not deferred to first agent use).
  const [msLogin, setMsLogin] = useState<{
    state: "idle" | "starting" | "pending" | "success" | "error";
    sessionId?: string;
    url?: string;
    code?: string;
    error?: string;
  }>({ state: "idle" });
  // Generic HTTP/OAuth sign-in (Notion, GitHub, Linear, …) driven through
  // Claude Code at connect-time, so the token is cached before any agent runs.
  const [oauthLogin, setOauthLogin] = useState<{
    state: "idle" | "starting" | "pending" | "success" | "error";
    sessionId?: string;
    url?: string;
    error?: string;
  }>({ state: "idle" });
  const [callbackPaste, setCallbackPaste] = useState("");
  // True OAuth auth state (registration alone ≠ authenticated). "unknown" until
  // the first check resolves, so we don't flash a misleading button.
  const [authState, setAuthState] = useState<"unknown" | "authenticated" | "needs-auth">(
    "unknown",
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);
  useEffect(() => () => stopPolling(), [stopPolling]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/config/mcp-catalog", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as Payload;
      setData(payload);
      const entry = payload.approved.find((a) => a.id === item.id);
      const supported = payload.providers.filter(
        (p) => entry?.supportedProviderIds.includes(p.id),
      );
      const connected = new Set(entry?.connectedProviderIds ?? []);
      if (connected.size > 0) {
        setTargets(connected);
        // Only auto-expand the "other environments" list when more than one is
        // connected; otherwise it needlessly lengthens the panel and pushes the
        // primary action button below the fold.
        setShowMore(connected.size > 1);
      } else {
        const primary = pickPrimary(
          supported,
          payload.selectedEnvironments,
          payload.defaultProvider,
        );
        setTargets(primary ? new Set([primary]) : new Set());
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [item.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Resolve true OAuth auth state for HTTP servers (skips non-http / M365, which
  // have their own flows). Lets the panel show "signed in" vs "needs sign-in".
  const refreshAuthState = useCallback(async () => {
    if (isM365) {
      setAuthState("unknown");
      return;
    }
    try {
      const res = await fetch(
        `/api/agents/config/mcp-catalog/oauth/login?id=${encodeURIComponent(item.id)}`,
        { cache: "no-store" },
      );
      const j = await res.json();
      setAuthState(
        !j.applicable ? "unknown" : j.authenticated ? "authenticated" : "needs-auth",
      );
    } catch {
      setAuthState("unknown");
    }
  }, [isM365, item.id]);

  useEffect(() => {
    void refreshAuthState();
  }, [refreshAuthState]);

  // If the user already saved their own Entra credentials, open in "work" mode
  // so the fields show (and aren't silently bypassed by the personal default).
  useEffect(() => {
    if (!isM365) return;
    const e = data?.approved.find((a) => a.id === item.id);
    if (!e) return;
    if (e.credentials.some((c) => e.credentialStatus[c.envKey]?.hasValue)) {
      setMsAccountMode("work");
    }
  }, [isM365, data, item.id, setMsAccountMode]);

  // Live Discord validation: token works + bot is in the configured server.
  const [checks, setChecks] = useState<DiscordChecks | null>(null);
  const [checking, setChecking] = useState(false);

  const runChecks = useCallback(async (token?: string, guildId?: string) => {
    setChecking(true);
    try {
      const res = await fetch("/api/agents/config/mcp-catalog/discord-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, guildId }),
      });
      setChecks(res.ok ? ((await res.json()) as DiscordChecks) : null);
    } catch {
      setChecks(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (item.id !== "discord") return;
    const e = data?.approved.find((a) => a.id === item.id);
    if (!e) return;
    const savedToken = e.credentialStatus["DISCORD_TOKEN"]?.hasValue ?? false;
    const typedToken = creds["DISCORD_TOKEN"]?.trim() ?? "";
    const typedGuild = creds["DISCORD_GUILD_ID"]?.trim() ?? "";
    if (typedToken) {
      if (typedToken.length < 50) return; // mid-typing — wait for a full token
    } else if (!savedToken) {
      setChecks(null);
      return;
    }
    const t = setTimeout(() => {
      void runChecks(typedToken || undefined, typedGuild || undefined);
    }, 700);
    return () => clearTimeout(t);
  }, [item.id, data, creds, runChecks]);

  if (loadError) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-[13px] text-muted-foreground">
        Couldn&apos;t load connection options: {loadError}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-5 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const entry = data.approved.find((a) => a.id === item.id);
  if (!entry) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-[13px] text-muted-foreground">
        This integration isn&apos;t in the connectable catalog yet.
      </div>
    );
  }

  const supported = data.providers.filter((p) =>
    entry.supportedProviderIds.includes(p.id),
  );
  const connected = new Set(entry.connectedProviderIds);
  const primary = pickPrimary(supported, data.selectedEnvironments, data.defaultProvider);
  const others = supported.filter((p) => p.id !== primary);
  const needsCreds = entry.authBackend === "token" || entry.authBackend === "user-app";
  // For M365, the credential fields only show in "work" mode; personal mode is
  // field-free (built-in app + device-code sign-in).
  const showMsCreds = !isM365 || msAccountMode === "work";
  // Other HTTP/OAuth servers can be signed in at connect-time, but only via
  // Claude Code (it's the CLI we drive). When it's unchecked we fall back to the
  // deferred (first agent use) flow. M365 has its own device-code path above.
  const claudeSelected = targets.has("claude-code");
  // stdio connect-time sign-in is run by the daemon itself (it spawns the
  // server), so it needs no specific CLI. HTTP sign-in is driven through Claude
  // Code, so it requires Claude to be selected.
  const canConnectTimeSignin =
    entry.signinKind === "stdio" ||
    (entry.signinKind === "http" && !isM365 && claudeSelected);

  const toggle = (id: string) =>
    setTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const missingRequired =
    needsCreds &&
    entry.credentials.some(
      (c) =>
        c.required &&
        !entry.credentialStatus[c.envKey]?.hasValue &&
        !(creds[c.envKey]?.trim()),
    );

  const connect = async () => {
    if (targets.size === 0) {
      showError("Pick at least one environment.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/agents/config/mcp-catalog/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entry.id,
          providers: [...targets],
          // Personal M365 sends no creds → server uses its built-in app.
          credentials: needsCreds && showMsCreds ? creds : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || json.message || "Connect failed");
      showSuccess(json.message || "Connected.");
      setCreds({});
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/agents/config/mcp-catalog/connect?id=${encodeURIComponent(entry.id)}&providers=${[...connected].join(",")}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Disconnect failed");
      showSuccess("Disconnected.");
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  };

  const LOGIN_URL = "/api/agents/config/mcp-catalog/microsoft/login";

  const cancelMsLogin = () => {
    stopPolling();
    if (msLogin.sessionId) {
      void fetch(`${LOGIN_URL}?sessionId=${encodeURIComponent(msLogin.sessionId)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    setMsLogin({ state: "idle" });
  };

  // Personal sign-in: start device-code login, show the code, poll until the
  // user finishes in the browser, then register the server in the chosen envs.
  const startMsLogin = async () => {
    if (targets.size === 0) {
      showError("Pick at least one environment.");
      return;
    }
    stopPolling();
    setMsLogin({ state: "starting" });
    try {
      const res = await fetch(LOGIN_URL, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not start sign-in");
      const sessionId: string = json.sessionId;
      setMsLogin({
        state: "pending",
        sessionId,
        url: json.verificationUri,
        code: json.userCode,
      });
      // Intentionally do NOT auto-open Microsoft — the user copies the code
      // first, then opens the page via the explicit button (clearer flow).
      pollRef.current = setInterval(async () => {
        try {
          const s = await fetch(`${LOGIN_URL}?sessionId=${encodeURIComponent(sessionId)}`, {
            cache: "no-store",
          });
          const sj = await s.json();
          if (sj.status === "success") {
            stopPolling();
            setMsLogin({ state: "success", sessionId });
            showSuccess("Signed in to Microsoft.");
            await connect(); // register the MCP server now that the token is cached
            setMsLogin({ state: "idle" }); // connected state is driven by load()
          } else if (sj.status === "error" || sj.status === "expired") {
            stopPolling();
            setMsLogin({
              state: "error",
              error:
                sj.error ||
                (sj.status === "expired"
                  ? "The code expired before sign-in finished. Try again."
                  : "Sign-in failed."),
            });
          }
        } catch {
          /* transient — keep polling */
        }
      }, 3000);
    } catch (err) {
      setMsLogin({
        state: "error",
        error: err instanceof Error ? err.message : "Could not start sign-in",
      });
    }
  };

  const OAUTH_URL = "/api/agents/config/mcp-catalog/oauth/login";

  const cancelOauthLogin = () => {
    stopPolling();
    if (oauthLogin.sessionId) {
      void fetch(`${OAUTH_URL}?sessionId=${encodeURIComponent(oauthLogin.sessionId)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    setOauthLogin({ state: "idle" });
    setCallbackPaste("");
  };

  const pollOauthLogin = (sessionId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const s = await fetch(`${OAUTH_URL}?sessionId=${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        });
        const sj = await s.json();
        if (sj.status === "success") {
          stopPolling();
          setOauthLogin({ state: "success", sessionId });
          setAuthState("authenticated");
          showSuccess(`Signed in to ${item.name}.`);
          await load(); // connected state is driven by load()
          setOauthLogin({ state: "idle" });
          setCallbackPaste("");
        } else if (sj.status === "error" || sj.status === "expired") {
          stopPolling();
          setOauthLogin({
            state: "error",
            error:
              sj.error ||
              (sj.status === "expired"
                ? "Sign-in timed out before you finished. Try again."
                : "Sign-in failed."),
          });
        }
      } catch {
        /* transient — keep polling */
      }
    }, 3000);
  };

  // Register the server (so the CLI exposes its authenticate tool), then drive
  // the OAuth sign-in through Claude Code while keeping its loopback alive.
  const startOauthLogin = async () => {
    if (targets.size === 0) {
      showError("Pick at least one environment.");
      return;
    }
    if (missingRequired) {
      showError("Enter the required credentials first.");
      return;
    }
    stopPolling();
    setOauthLogin({ state: "starting" });
    try {
      const reg = await fetch("/api/agents/config/mcp-catalog/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entry.id,
          providers: [...targets],
          // Persist credentials first (e.g. Google OAuth client ID/secret/email,
          // or a confidential-client Slack id/secret) so the connect-time
          // sign-in can read them from .cabinet.env.
          credentials: needsCreds ? creds : undefined,
        }),
      });
      const regJson = await reg.json();
      if (!reg.ok || !regJson.ok)
        throw new Error(regJson.error || regJson.message || "Connect failed");

      const res = await fetch(OAUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not start sign-in");
      if (json.alreadyAuthenticated) {
        setOauthLogin({ state: "success" });
        setAuthState("authenticated");
        showSuccess(`${item.name} connected.`);
        await load();
        setOauthLogin({ state: "idle" });
        return;
      }
      setOauthLogin({ state: "pending", sessionId: json.sessionId, url: json.authorizeUrl });
      pollOauthLogin(json.sessionId);
    } catch (err) {
      setOauthLogin({
        state: "error",
        error: err instanceof Error ? err.message : "Could not start sign-in",
      });
    }
  };

  // Fallback when the browser can't reach the loopback: submit the pasted
  // callback URL; the poll then flips to success.
  const submitOauthCallback = async () => {
    if (!oauthLogin.sessionId || !callbackPaste.trim()) return;
    try {
      const res = await fetch(OAUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: oauthLogin.sessionId,
          callbackUrl: callbackPaste.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not submit callback URL");
      showSuccess("Finishing sign-in…");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not submit callback URL");
    }
  };

  const primaryProvider = supported.find((p) => p.id === primary);
  const isConnected = connected.size > 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-[14px] font-semibold text-foreground">
        {isConnected ? `${item.name} connected` : `Connect ${item.name}`}
      </h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {isConnected
          ? "Active in these agent environments."
          : "Installs into the environment your agents run in."}
      </p>

      {/* Primary (smart default) */}
      {primaryProvider ? (
        <EnvRow
          provider={primaryProvider}
          checked={targets.has(primaryProvider.id)}
          connected={connected.has(primaryProvider.id)}
          isDefault
          onToggle={() => toggle(primaryProvider.id)}
        />
      ) : (
        <p className="mt-4 text-[13px] text-muted-foreground">
          No compatible agent CLI detected. Install Claude Code, Gemini, Codex, or Cursor.
        </p>
      )}

      {/* Disclosure: other environments */}
      {others.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", showMore && "rotate-180")}
            />
            {showMore ? "Fewer environments" : `Add to other environments (${others.length})`}
          </button>
          {showMore && (
            <div className="mt-1 space-y-1">
              {others.map((p) => (
                <EnvRow
                  key={p.id}
                  provider={p}
                  checked={targets.has(p.id)}
                  connected={connected.has(p.id)}
                  onToggle={() => toggle(p.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Microsoft 365: choose account type before showing any fields. */}
      {isM365 && (
        <div className="mt-4">
          <p className="mb-2 text-[12px] font-medium text-foreground">
            How do you want to connect?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMsAccountMode("personal")}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                msAccountMode === "personal"
                  ? "border-foreground bg-accent"
                  : "border-border hover:bg-accent/50",
              )}
            >
              <span className="block text-[13px] font-medium text-foreground">
                Personal account
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                outlook.com, hotmail. One-click sign-in, nothing to set up.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMsAccountMode("work")}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                msAccountMode === "work"
                  ? "border-foreground bg-accent"
                  : "border-border hover:bg-accent/50",
              )}
            >
              <span className="block text-[13px] font-medium text-foreground">
                Work / school app
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Use your organization&apos;s Azure app registration.
              </span>
            </button>
          </div>
          {msAccountMode === "personal" && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
              No fields needed. Sign in with Microsoft below. Your password is
              entered on Microsoft&apos;s own page and never stored by Cabinet.
            </p>
          )}
        </div>
      )}

      {/* Credentials (token / user-app backends) */}
      {needsCreds && showMsCreds &&
        entry.credentials.map((c) => {
          const saved = entry.credentialStatus[c.envKey]?.hasValue;
          return (
            <div key={c.envKey} className="mt-3">
              <label className="mb-1 block text-[12px] font-medium text-foreground">
                {c.label}
                {c.required && <span className="text-muted-foreground"> *</span>}
                {saved && (
                  <span className="ms-2 text-[11px] font-normal text-emerald-600 dark:text-emerald-400">
                    saved ••••{entry.credentialStatus[c.envKey]?.lastFour}
                  </span>
                )}
              </label>
              <input
                type={c.kind === "secret" ? "password" : "text"}
                value={creds[c.envKey] ?? ""}
                onChange={(e) =>
                  setCreds((prev) => ({ ...prev, [c.envKey]: e.target.value }))
                }
                placeholder={saved ? "•••••••• (replace)" : c.placeholder}
                className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground/20"
              />
              {c.hint && <p className="mt-1 text-[11px] text-muted-foreground">{c.hint}</p>}
              {entry.id === "discord" &&
                (c.envKey === "DISCORD_TOKEN" || c.envKey === "DISCORD_GUILD_ID") && (
                  <FieldCheck
                    kind={c.envKey === "DISCORD_TOKEN" ? "token" : "guild"}
                    checks={checks}
                    checking={checking}
                  />
                )}
            </div>
          );
        })}

      {isM365 && msAccountMode === "personal" && !isConnected ? (
        <div className="mt-4">
          {msLogin.state === "pending" ? (
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[12px] font-medium text-foreground">
                Step 1: copy your code
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded bg-foreground/[0.06] px-3 py-2 text-center text-[18px] font-semibold tracking-[0.25em] text-foreground">
                  {msLogin.code}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(msLogin.code ?? "");
                    showSuccess("Code copied");
                  }}
                  className="shrink-0 rounded-md border border-border px-3 py-2 text-[12px] font-medium text-foreground hover:bg-accent"
                >
                  Copy
                </button>
              </div>
              <p className="mt-3 text-[12px] font-medium text-foreground">
                Step 2: open Microsoft &amp; paste it
              </p>
              <a
                href={msLogin.url}
                onClick={(e) => {
                  // OAuth must run in the system browser, not the in-app browse
                  // view (which lacks the user's Microsoft session).
                  e.preventDefault();
                  if (msLogin.url) openExternalUrl(msLogin.url);
                }}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground hover:bg-accent"
              >
                Open Microsoft sign-in <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for you to
                finish…
              </p>
              <button
                type="button"
                onClick={cancelMsLogin}
                className="mt-2 text-[12px] text-muted-foreground hover:text-destructive"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button
              className="w-full"
              disabled={
                targets.size === 0 ||
                msLogin.state === "starting" ||
                msLogin.state === "success" ||
                busy
              }
              onClick={startMsLogin}
            >
              {msLogin.state === "starting" || msLogin.state === "success" || busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Sign in with Microsoft"
              )}
            </Button>
          )}
          {msLogin.state === "error" && (
            <p className="mt-2 text-[12px] text-destructive">{msLogin.error}</p>
          )}
        </div>
      ) : canConnectTimeSignin && authState !== "authenticated" ? (
        <div className="mt-4">
          {authState === "unknown" && oauthLogin.state !== "pending" ? (
            <Button className="w-full" disabled>
              <Loader2 className="h-4 w-4 animate-spin" />
            </Button>
          ) : oauthLogin.state === "pending" ? (
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[12px] font-medium text-foreground">
                Approve access in your browser
              </p>
              <button
                type="button"
                onClick={() => {
                  // OAuth must run in the system default browser, not the in-app
                  // browse view (which lacks the user's provider session and may
                  // be rejected as a webview). A button keeps this routed solely
                  // through openExternalUrl — an anchor's href could still be
                  // activated through normal link navigation.
                  if (oauthLogin.url) openExternalUrl(oauthLogin.url);
                }}
                disabled={!oauthLogin.url}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                Open {item.name} sign-in <ExternalLink className="h-3.5 w-3.5" />
              </button>
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for you to
                finish…
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                  Stuck on a &ldquo;can&apos;t be reached&rdquo; page?
                </summary>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  That page is harmless. Copy its full address-bar URL (it starts
                  with <code>http://localhost</code>) and paste it here:
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={callbackPaste}
                    onChange={(e) => setCallbackPaste(e.target.value)}
                    placeholder="http://localhost:…/callback?code=…"
                    className="h-8 flex-1 rounded-md border border-border bg-background px-2.5 text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground/20"
                  />
                  <button
                    type="button"
                    onClick={submitOauthCallback}
                    disabled={!callbackPaste.trim()}
                    className="shrink-0 rounded-md border border-border px-3 py-2 text-[12px] font-medium text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    Submit
                  </button>
                </div>
              </details>
              <button
                type="button"
                onClick={cancelOauthLogin}
                className="mt-3 text-[12px] text-muted-foreground hover:text-destructive"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button
              className="w-full"
              disabled={
                targets.size === 0 ||
                missingRequired ||
                oauthLogin.state === "starting" ||
                busy
              }
              onClick={startOauthLogin}
            >
              {oauthLogin.state === "starting" || busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isConnected ? (
                "Sign in"
              ) : (
                "Connect & sign in"
              )}
            </Button>
          )}
          {oauthLogin.state === "error" && (
            <p className="mt-2 text-[12px] text-destructive">{oauthLogin.error}</p>
          )}
        </div>
      ) : (
        <Button
          className="mt-4 w-full"
          disabled={busy || targets.size === 0 || missingRequired}
          onClick={connect}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isConnected ? (
            "Update"
          ) : (
            "Connect"
          )}
        </Button>
      )}

      {entry.signinKind != null && !isM365 && authState === "authenticated" && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5 shrink-0" /> Signed in — ready for your agents.
        </p>
      )}

      {isConnected && (
        <button
          type="button"
          onClick={disconnect}
          disabled={busy}
          className="mt-2 w-full text-[12px] text-muted-foreground hover:text-destructive"
        >
          Disconnect
        </button>
      )}

      {entry.signinKind === "http" && !isM365 && !canConnectTimeSignin && !isConnected && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
          Select Claude Code above to sign in now. Otherwise the CLI prompts for
          sign-in the first time an agent uses it.
        </p>
      )}

      <a
        href={entry.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        View source <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function EnvRow({
  provider,
  checked,
  connected,
  isDefault,
  onToggle,
}: {
  provider: ProviderInfo;
  checked: boolean;
  connected: boolean;
  isDefault?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-2 flex w-full items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-accent"
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
          checked ? "border-foreground bg-foreground text-background" : "border-border",
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      {provider.iconAsset && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={provider.iconAsset} alt="" className="h-4 w-4 object-contain" />
      )}
      <span className="flex-1 text-[13px] text-foreground">{provider.name}</span>
      {isDefault && (
        <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-muted-foreground">
          default
        </span>
      )}
      {connected && (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" /> connected
        </span>
      )}
    </button>
  );
}

/** Live status line shown under the Discord token / Server ID fields. */
function FieldCheck({
  kind,
  checks,
  checking,
}: {
  kind: "token" | "guild";
  checks: DiscordChecks | null;
  checking: boolean;
}) {
  if (checking && !checks) {
    return (
      <CheckStatus tone="muted" spin>
        Checking…
      </CheckStatus>
    );
  }
  if (!checks) return null;

  if (kind === "token") {
    const t = checks.token;
    if (t.missing) return null;
    if (t.ok) return <CheckStatus tone="ok">Connected as {t.botTag}</CheckStatus>;
    if (t.error) return <CheckStatus tone="error">{t.error}</CheckStatus>;
    return null;
  }

  const g = checks.guild;
  if (g.skipped || g.unknown) return null;
  if (g.ok) return <CheckStatus tone="ok">Bot is in {g.name}</CheckStatus>;
  if (g.error) {
    return (
      <CheckStatus tone="warn">
        {g.error}
        {g.inviteUrl && (
          <>
            {" "}
            <a
              href={g.inviteUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-2"
            >
              Invite the bot ↗
            </a>
          </>
        )}
      </CheckStatus>
    );
  }
  return null;
}

function CheckStatus({
  tone,
  spin,
  children,
}: {
  tone: "ok" | "error" | "warn" | "muted";
  spin?: boolean;
  children: ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "error"
        ? "text-red-600 dark:text-red-400"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground";
  return (
    <p className={cn("mt-1 flex items-center gap-1 text-[11px]", cls)}>
      {spin ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
      ) : tone === "ok" ? (
        <Check className="h-3 w-3 shrink-0" />
      ) : (
        <X className="h-3 w-3 shrink-0" />
      )}
      <span>{children}</span>
    </p>
  );
}

"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, Loader2, ExternalLink, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/ui/toast";
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

export function ConnectPanel({ item }: { item: IntegrationItem }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);

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
        setShowMore(true);
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
          credentials: needsCreds ? creds : undefined,
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

      {/* Credentials (token / user-app backends) */}
      {needsCreds &&
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

      {entry.transport === "http" && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
          The CLI opens a browser to finish sign-in the first time an agent uses it.
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

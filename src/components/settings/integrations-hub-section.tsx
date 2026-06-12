"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plug,
  Check,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IntegrationIcon } from "@/components/integrations/integration-icon";
import { showError, showSuccess } from "@/lib/ui/toast";
import { confirmDialog } from "@/lib/ui/confirm";
import { cn } from "@/lib/utils";

/**
 * Settings → Integrations → Integrations Hub.
 *
 * App-Store-style "liquid glass" tiles: the logo sits big and softly blurred
 * behind frosted glass; on hover it sharpens, and a connected integration is
 * always crisp with a green status dot. Clicking opens a cinematic config
 * modal (page behind it blurs; the logo glows blurred inside the panel) with
 * the official badge, guided steps, and per-environment install controls.
 *
 * Designed to feel obvious for a non-technical person. Secrets are never
 * displayed or written into any CLI config.
 */

type Tier = "official" | "registry" | "cabinet" | "community";

interface Credential {
  envKey: string;
  label: string;
  kind: "secret" | "filepath" | "plain";
  required: boolean;
  placeholder: string;
  hint?: string;
}

interface SetupStep {
  title: string;
  body: string;
  copy?: string;
  href?: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  iconAsset?: string;
  capable: boolean;
  transports: string[];
  configPath?: string;
}

interface CatalogItem {
  id: string;
  label: string;
  blurb: string;
  iconSlug: string;
  bgImage: string;
  logo: string;
  sourceUrl: string;
  actions: string[];
  setupSteps: SetupStep[];
  credentials: Credential[];
  transport: "http" | "stdio";
  verifiedTier: Tier;
  authBackend: "cli-pkce" | "user-app" | "token" | "cabinet-broker";
  supportedProviderIds: string[];
  connectedProviderIds: string[];
  credentialStatus: Record<string, { hasValue: boolean; lastFour: string }>;
}

interface Payload {
  deploymentMode: "local" | "cloud";
  providers: ProviderInfo[];
  selectedEnvironments: string[];
  approved: CatalogItem[];
}

// Apple-style bezel: bright top rim, soft bottom rim, hairline edge, lift.
const GLASS_EDGE: React.CSSProperties = {
  boxShadow:
    "inset 0 1.5px 1px rgba(255,255,255,0.65), inset 0 -2px 3px -1px rgba(255,255,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.18), 0 12px 36px -14px rgba(0,0,0,0.55)",
};

/**
 * Each tile is a real app icon in its own brand colour (not a shared wash).
 * `light` tiles (e.g. Google's multicolour mark) get a near-white face so the
 * logo pops; the rest get their saturated brand gradient.
 */
const BRAND: Record<string, { from: string; to: string; light?: boolean }> = {
  slack: { from: "#611f69", to: "#3d0f44" },
  "google-workspace": { from: "#ffffff", to: "#eef1f5", light: true },
  discord: { from: "#5865f2", to: "#4046c4" },
};
const BRAND_FALLBACK = { from: "#3b4252", to: "#272b36" };

function brandFace(id: string): string {
  const b = BRAND[id] ?? BRAND_FALLBACK;
  return `linear-gradient(155deg, ${b.from} 0%, ${b.to} 100%)`;
}
function isLight(id: string): boolean {
  return !!(BRAND[id] ?? BRAND_FALLBACK).light;
}

const TIER_BADGE: Record<Tier, { label: string; cls: string }> = {
  official: {
    label: "Official",
    cls: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30",
  },
  registry: {
    label: "Registry-listed",
    cls: "bg-sky-500/20 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/30",
  },
  cabinet: {
    label: "Maintained by Cabinet",
    cls: "bg-foreground/10 text-foreground/80 ring-1 ring-foreground/15",
  },
  community: {
    label: "Community",
    cls: "bg-white/15 text-foreground/70 ring-1 ring-white/15",
  },
};

function ProviderMark({
  provider,
  size = 16,
}: {
  provider: ProviderInfo;
  size?: number;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  if (provider.iconAsset && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={provider.iconAsset}
        alt={provider.name}
        title={provider.name}
        width={size}
        height={size}
        className="object-contain"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      title={provider.name}
      className="inline-flex items-center justify-center rounded bg-muted text-[8px] font-bold"
      style={{ width: size, height: size }}
    >
      {provider.name.slice(0, 1)}
    </span>
  );
}

export function IntegrationsHubSection(): React.ReactElement {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/config/mcp-catalog");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as Payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveEnvironments = useCallback(
    async (ids: string[]) => {
      try {
        const res = await fetch("/api/agents/config/integration-environments", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ environments: ids }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await refresh();
      } catch (err) {
        showError(err instanceof Error ? err.message : "Failed to save environments");
      }
    },
    [refresh],
  );

  const active = data?.approved.find((i) => i.id === openId) ?? null;

  return (
    <section className="border-t border-border pt-6">
      <h3 className="text-[14px] font-semibold flex items-center gap-1.5 mb-1">
        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
        Integrations
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Tap a tile to connect a service. Setup is guided, step by step.
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-10 justify-center">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading integrations…
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 text-[12px] text-destructive py-3">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-x-5 gap-y-5 [grid-template-columns:repeat(auto-fill,minmax(82px,1fr))]">
            {data.approved.map((item) => (
              <IntegrationTile
                key={item.id}
                item={item}
                onOpen={() => setOpenId(item.id)}
              />
            ))}
          </div>

          <EnvironmentSelector
            providers={data.providers}
            selected={data.selectedEnvironments}
            onChange={saveEnvironments}
          />

          <Dialog
            open={!!active}
            onOpenChange={(o: boolean) => {
              if (!o) setOpenId(null);
            }}
          >
            {active && (
              <IntegrationModal
                item={active}
                providers={data.providers}
                selectedEnvironments={data.selectedEnvironments}
                onChanged={refresh}
                onClose={() => setOpenId(null)}
              />
            )}
          </Dialog>
        </>
      )}
    </section>
  );
}

/* ─────────────────────────  App-Store-style tile  ───────────────────────── */

function IntegrationTile({
  item,
  onOpen,
}: {
  item: CatalogItem;
  onOpen: () => void;
}): React.ReactElement {
  const [logoFailed, setLogoFailed] = useState(false);
  const connected = item.connectedProviderIds.length > 0;
  const light = isLight(item.id);

  return (
    <button
      onClick={onOpen}
      title={item.label}
      className="group flex flex-col items-center gap-2"
    >
      <div
        style={{ ...GLASS_EDGE, background: brandFace(item.id) }}
        className={cn(
          "relative isolate aspect-square w-full overflow-hidden rounded-[20px]",
          "transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-[1.05]",
        )}
      >
        {/* Glossy glass: bright top sheen, soft falloff */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            light
              ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.7)_0%,rgba(255,255,255,0.15)_38%,transparent_62%)]"
              : "bg-[linear-gradient(180deg,rgba(255,255,255,0.34)_0%,rgba(255,255,255,0.07)_42%,transparent_64%)]",
          )}
        />
        {/* Moving diagonal specular streak on hover */}
        <div className="pointer-events-none absolute -inset-y-2 -left-1/3 w-1/3 -skew-x-12 bg-white/20 blur-md opacity-0 transition-all duration-500 ease-out group-hover:left-[110%] group-hover:opacity-100" />

        {/* Logo */}
        <div className="absolute inset-0 grid place-items-center p-2.5">
          {!logoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.logo}
              alt={`${item.label} logo`}
              className={cn(
                "h-[64%] w-[64%] object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.4)] transition-all duration-300 ease-out",
                connected
                  ? "scale-100 opacity-100"
                  : "opacity-90 group-hover:scale-[1.08] group-hover:opacity-100",
              )}
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <IntegrationIcon slug={item.iconSlug} required size="lg" showLabel={false} />
          )}
        </div>

        {/* Status dot — only shown when connected (no idle/gray state) */}
        {connected && (
          <span className="absolute top-2 right-2 flex h-2.5 w-2.5" title="Connected">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white/40" />
          </span>
        )}
      </div>

      {/* Caption — full name always visible, wraps & balances, never clipped */}
      <span className="flex w-full items-start justify-center gap-1 px-0.5 text-center text-[11px] font-medium leading-tight text-balance text-foreground/80">
        <span className="break-words">{item.label}</span>
        {item.verifiedTier === "official" && (
          <ShieldCheck className="mt-0.5 h-2.5 w-2.5 shrink-0 text-emerald-500" />
        )}
      </span>
    </button>
  );
}

/* ─────────────────────────  Global env selector  ───────────────────────── */

function EnvironmentSelector({
  providers,
  selected,
  onChange,
}: {
  providers: ProviderInfo[];
  selected: string[];
  onChange: (ids: string[]) => void;
}): React.ReactElement {
  const capable = providers.filter((p) => p.capable);
  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );
  return (
    <div className="mt-5 rounded-xl border border-border bg-card/60 px-3 py-2.5 backdrop-blur-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-1">
        Supported environments
      </div>
      <p className="text-[11px] text-muted-foreground mb-2.5">
        Which CLIs new integrations install into by default. Editable any time;
        you can also choose per integration.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {capable.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              title={p.configPath}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                on
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              <ProviderMark provider={p} size={14} />
              {p.name}
              {on && <Check className="h-3 w-3" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────  Cinematic config modal  ───────────────────────── */

function IntegrationModal({
  item,
  providers,
  selectedEnvironments,
  onChanged,
  onClose,
}: {
  item: CatalogItem;
  providers: ProviderInfo[];
  selectedEnvironments: string[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}): React.ReactElement {
  const needsCreds = item.authBackend === "token" || item.authBackend === "user-app";
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "test" | "connect" | "disconnect">(null);
  const [testResult, setTestResult] = useState<{ valid: boolean; detail: string } | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const badge = TIER_BADGE[item.verifiedTier];
  const connected = item.connectedProviderIds.length > 0;
  const light = isLight(item.id);

  const targetable = providers.filter(
    (p) => item.supportedProviderIds.includes(p.id) && selectedEnvironments.includes(p.id),
  );
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(targetable.map((p) => p.id)),
  );

  const setVal = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const toggleProvider = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runTest = useCallback(async () => {
    setBusy("test");
    setTestResult(null);
    try {
      const res = await fetch("/api/agents/config/mcp-catalog/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, credentials: values }),
      });
      const d = (await res.json()) as { valid?: boolean; detail?: string; error?: string };
      setTestResult(
        d.error ? { valid: false, detail: d.error } : { valid: !!d.valid, detail: d.detail ?? "" },
      );
    } catch (err) {
      setTestResult({ valid: false, detail: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setBusy(null);
    }
  }, [item.id, values]);

  const connect = useCallback(async () => {
    const targets = [...chosen];
    if (targets.length === 0) {
      showError("Pick at least one environment to install into.");
      return;
    }
    setBusy("connect");
    try {
      const res = await fetch("/api/agents/config/mcp-catalog/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, credentials: values, providers: targets }),
      });
      const d = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        results?: { providerName: string; ok: boolean; error?: string }[];
      };
      if (!res.ok || !d.ok) {
        const failed = (d.results ?? [])
          .filter((r) => !r.ok)
          .map((r) => `${r.providerName}: ${r.error ?? "failed"}`)
          .join("; ");
        throw new Error(d.error || failed || `HTTP ${res.status}`);
      }
      const failed = (d.results ?? []).filter((r) => !r.ok);
      showSuccess(
        failed.length
          ? `${d.message} (skipped: ${failed.map((r) => r.providerName).join(", ")})`
          : d.message || "Connected",
      );
      await onChanged();
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setBusy(null);
    }
  }, [chosen, item.id, values, onChanged, onClose]);

  const disconnect = useCallback(async () => {
    const ok = await confirmDialog({
      title: `Disconnect ${item.label}?`,
      message:
        "The MCP server entry is removed from the connected environment(s). Saved credentials are kept unless you remove them separately.",
      confirmText: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    setBusy("disconnect");
    try {
      const qs = item.connectedProviderIds.length
        ? `&providers=${encodeURIComponent(item.connectedProviderIds.join(","))}`
        : "";
      const res = await fetch(
        `/api/agents/config/mcp-catalog/connect?id=${encodeURIComponent(item.id)}${qs}`,
        { method: "DELETE" },
      );
      const d = (await res.json()) as { ok?: boolean; error?: string; note?: string };
      if (!res.ok || !d.ok) throw new Error(d.error || `HTTP ${res.status}`);
      showSuccess(d.note || "Disconnected");
      await onChanged();
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setBusy(null);
    }
  }, [item.id, item.label, item.connectedProviderIds, onChanged, onClose]);

  const requiredFilled = item.credentials
    .filter((c) => c.required)
    .every(
      (c) =>
        (values[c.envKey] ?? "").trim().length > 0 ||
        item.credentialStatus[c.envKey]?.hasValue,
    );

  return (
    <DialogContent
      className="w-full overflow-hidden border-0 bg-transparent p-0 ring-0 sm:max-w-3xl"
      showCloseButton
    >
      <div
        style={GLASS_EDGE}
        className="relative max-h-[88vh] overflow-y-auto rounded-2xl bg-background"
      >
        {/* Brand-colour hero band */}
        <div
          className="relative px-7 pt-8 pb-7"
          style={{ background: brandFace(item.id) }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_-20%,rgba(255,255,255,0.35),transparent_60%)]"
          />
          <div className="relative flex items-center gap-4">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[22px] bg-white/85 shadow-lg ring-1 ring-black/5">
              {!logoFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.logo}
                  alt={`${item.label} logo`}
                  className="h-12 w-12 object-contain"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <IntegrationIcon slug={item.iconSlug} required size="lg" showLabel={false} />
              )}
            </div>
            <div className={cn("min-w-0", light ? "text-zinc-900" : "text-white")}>
              <h2 className="text-2xl font-semibold leading-tight">{item.label}</h2>
              <p
                className={cn(
                  "mt-1 text-[13px]",
                  light ? "text-zinc-700" : "text-white/85",
                )}
              >
                {item.blurb}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                    light
                      ? "bg-black/5 text-zinc-700 ring-black/10"
                      : "bg-white/15 text-white ring-white/20",
                  )}
                >
                  {item.verifiedTier === "official" && <ShieldCheck className="h-2.5 w-2.5" />}
                  {badge.label}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                    connected
                      ? "bg-emerald-500/90 text-white ring-emerald-300/40"
                      : light
                        ? "bg-black/5 text-zinc-600 ring-black/10"
                        : "bg-white/10 text-white/80 ring-white/15",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      connected ? "bg-white" : light ? "bg-zinc-400" : "bg-white/60",
                    )}
                  />
                  {connected ? "Connected" : "Not connected"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body — two columns: explore on the left, connect on the right */}
        <div className="grid gap-x-8 gap-y-6 px-7 py-6 sm:grid-cols-2">
          {/* Left: what it does + optional, non-scary setup help */}
          <div className="space-y-5">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                What you can do with it
              </div>
              <div className="space-y-1.5">
                {item.actions.map((a) => (
                  <div
                    key={a}
                    className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-[12.5px]"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    {a}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20">
              <button
                onClick={() => setShowGuide((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
              >
                <span className="text-[12.5px] font-medium">
                  New here? Show the step-by-step guide
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    showGuide && "rotate-180",
                  )}
                />
              </button>
              {showGuide && (
                <ol className="space-y-2.5 border-t border-border/60 px-3.5 py-3">
                  {item.setupSteps.map((s, i) => (
                    <li key={s.title} className="flex gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <div className="text-[12.5px] font-medium">{s.title}</div>
                        <p className="text-[12px] text-muted-foreground">{s.body}</p>
                        {s.href && (
                          <a
                            href={s.href}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-primary"
                          >
                            Open <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                        {s.copy && <CopyChip value={s.copy} />}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* Right: the actual connect controls */}
          <div className="space-y-5">
            {needsCreds && (
              <div className="space-y-2.5">
                {item.credentials.map((c) => {
                  const status = item.credentialStatus[c.envKey];
                  return (
                    <div key={c.envKey}>
                      <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        {c.label}
                        {status?.hasValue && (
                          <span className="ml-2 font-mono normal-case tracking-normal text-muted-foreground">
                            {status.lastFour ? `••••${status.lastFour} saved` : "saved"}
                          </span>
                        )}
                      </label>
                      <Input
                        type={c.kind === "secret" ? "password" : "text"}
                        value={values[c.envKey] ?? ""}
                        onChange={(e) => setVal(c.envKey, e.target.value)}
                        placeholder={status?.hasValue ? "Enter to replace" : c.placeholder}
                        className="h-9 text-[12.5px] font-mono"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      {c.hint && (
                        <p className="mt-1 text-[10.5px] text-muted-foreground">{c.hint}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Install into
              </div>
              {targetable.length === 0 ? (
                <p className="text-[11.5px] text-muted-foreground">
                  None of your supported environments can run this integration.
                  Add a compatible CLI under “Supported environments”.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {targetable.map((p) => {
                    const on = chosen.has(p.id);
                    const conn = item.connectedProviderIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleProvider(p.id)}
                        title={p.configPath}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                          on
                            ? "border-primary/40 bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:bg-muted/50",
                        )}
                      >
                        <ProviderMark provider={p} size={14} />
                        {p.name}
                        {conn && (
                          <span className="text-[9px] text-emerald-600 dark:text-emerald-400">
                            connected
                          </span>
                        )}
                        {on && <Check className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {testResult && (
              <div
                className={cn(
                  "flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11.5px]",
                  testResult.valid
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {testResult.valid ? (
                  <Check className="mt-0.5 h-3 w-3 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                )}
                {testResult.detail}
              </div>
            )}
          </div>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-0 flex items-center gap-2 border-t border-border/60 bg-background/80 px-6 py-3 backdrop-blur-xl">
          {connected && (
            <Button
              size="sm"
              variant="ghost"
              className="mr-auto h-8 text-[12px] text-destructive hover:text-destructive"
              disabled={busy !== null}
              onClick={disconnect}
            >
              {busy === "disconnect" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Disconnect"
              )}
            </Button>
          )}
          {needsCreds && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[12px]"
              disabled={busy !== null}
              onClick={runTest}
            >
              {busy === "test" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Test connection"
              )}
            </Button>
          )}
          <Button
            size="sm"
            className={cn("h-8 text-[12px]", !connected && "min-w-[140px]")}
            disabled={
              busy !== null ||
              targetable.length === 0 ||
              chosen.size === 0 ||
              (needsCreds && !requiredFilled)
            }
            onClick={connect}
          >
            {busy === "connect" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : item.authBackend === "cli-pkce" ? (
              "Connect & sign in"
            ) : connected ? (
              "Update"
            ) : (
              "Connect"
            )}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function CopyChip({ value }: { value: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — ignore */
        }
      }}
      className="mt-1 inline-flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-1 text-left text-[10px] font-mono hover:bg-muted/70"
      title="Copy"
    >
      {copied ? (
        <Check className="h-2.5 w-2.5 shrink-0" />
      ) : (
        <Copy className="h-2.5 w-2.5 shrink-0" />
      )}
      <span className="truncate">{value}</span>
    </button>
  );
}

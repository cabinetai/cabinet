"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Check, X, ExternalLink, Copy, ChevronDown, Sparkles } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useLocale } from "@/i18n/use-locale";
import { cn } from "@/lib/utils";
import { WebTerminal, type WebTerminalHandle } from "@/components/terminal/web-terminal";
import { ProviderSetupSteps, type SetupStep } from "@/components/settings/provider-setup-steps";

// A guided, self-advancing "get this provider ready" flow. Three phases —
// Install → Sign in → Ready — with a live console on the right that the buttons
// drive (the user watches, never types). Status is polled with ?refresh=1 so
// the moment a step completes the dialog advances on its own; sign-in is
// auto-verified so we only celebrate when the model is actually reachable.

interface ProviderInfo { id: string; name: string; iconAsset?: string; installSteps?: SetupStep[]; }
interface ProviderStatus { id: string; name: string; available: boolean; authenticated: boolean; }

// Providers whose API doesn't return an iconAsset but whose logo ships anyway.
const ICON_FALLBACK: Record<string, string> = {
  "claude-code": "/providers/claude.svg",
  "codex-cli": "/providers/openai.png",
  "gemini-cli": "/providers/gemini.svg",
};
// Single-API-key providers get an inline key field (writes .cabinet.env).
const API_KEY_ENV: Record<string, string> = { "grok-cli": "XAI_API_KEY" };

const findStep = (steps: SetupStep[] | undefined, re: RegExp) =>
  steps?.find((s) => s.command && re.test(s.title)) ?? null;

function openExternal(url: string) {
  const bridge = (window as unknown as { CabinetDesktop?: { openExternal?: (u: string) => void } }).CabinetDesktop;
  if (bridge?.openExternal) bridge.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

// Point new agents at the sole ready provider when the configured default isn't
// ready. Full read-modify-write — the providers PUT resets disabled/migrations.
async function promoteSoleReadyDefault(providerId: string): Promise<void> {
  try {
    const [provRes, statRes] = await Promise.all([
      fetch("/api/agents/providers", { cache: "no-store" }),
      fetch("/api/agents/providers/status?refresh=1", { cache: "no-store" }),
    ]);
    if (!provRes.ok || !statRes.ok) return;
    const prov = (await provRes.json()) as { providers: Array<{ id: string; enabled?: boolean }>; defaultProvider?: string; defaultModel?: string; defaultEffort?: string; };
    const stat = (await statRes.json()) as { providers: Array<{ id: string; available: boolean; authenticated: boolean }> };
    const readyIds = stat.providers.filter((p) => p.available && p.authenticated).map((p) => p.id);
    if (readyIds.length !== 1 || readyIds[0] !== providerId) return;
    if (prov.defaultProvider && readyIds.includes(prov.defaultProvider)) return;
    await fetch("/api/agents/providers", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultProvider: providerId, defaultModel: prov.defaultModel, defaultEffort: prov.defaultEffort,
        disabledProviderIds: prov.providers.filter((p) => p.enabled === false).map((p) => p.id), migrations: [],
      }),
    });
  } catch { /* best-effort */ }
}

export function ProviderSetupDialog() {
  const providerId = useAppStore((s) => s.providerSetupId);
  if (!providerId) return null;
  return <ProviderSetupPanel key={providerId} providerId={providerId} />;
}

type Phase = "install" | "signin" | "verify" | "ready";

function ProviderSetupPanel({ providerId }: { providerId: string }) {
  const { t } = useLocale();
  const close = useAppStore((s) => s.closeProviderSetup);
  const setSection = useAppStore((s) => s.setSection);
  const loadProviders = useAppStore((s) => s.loadProviders);

  const [info, setInfo] = useState<ProviderInfo | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [verify, setVerify] = useState<null | { status: string; hint?: string; failedStepTitle?: string }>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  // The phase the user kicked off an action in; "busy" is derived (started ===
  // current phase), so it resets naturally when polling advances the phase.
  const [startedInPhase, setStartedInPhase] = useState<Phase | null>(null);
  const [showManual, setShowManual] = useState(false);

  const termRef = useRef<WebTerminalHandle>(null);
  const outBuf = useRef("");
  const verifyRanRef = useRef(false);
  const [termSessionId] = useState(() => `provider-setup-${Date.now()}`);

  const name = info?.name ?? providerId;
  const iconSrc = info?.iconAsset ?? ICON_FALLBACK[providerId];

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/agents/providers/status?refresh=1", { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as { providers: ProviderStatus[] };
      setStatus(data.providers.find((p) => p.id === providerId) ?? null);
    } catch { /* ignore */ }
  }, [providerId]);

  // Load static info once + first status.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/agents/providers", { cache: "no-store" });
        if (r.ok) {
          const data = (await r.json()) as { providers: ProviderInfo[] };
          if (alive) setInfo(data.providers.find((p) => p.id === providerId) ?? null);
        }
      } catch { /* ignore */ }
      await refreshStatus();
    })();
    return () => { alive = false; };
  }, [providerId, refreshStatus]);

  const steps = info?.installSteps ?? [];
  const installStep = findStep(steps, /install/i);
  const loginStep = findStep(steps, /^log\s?in$/i);
  const available = status?.available ?? false;
  const authed = status?.authenticated ?? false;
  const apiKeyEnv = API_KEY_ENV[providerId];

  const vStatus = verify?.status;
  const verified = vStatus === "pass";
  const verifyFailed = !!vStatus && vStatus !== "pass" && vStatus !== "running";

  // Verify is the authority for "ready". A failed verify stays in the verify
  // phase (with recovery actions) rather than bouncing back to sign-in — some
  // providers report authenticated optimistically (e.g. Grok's auth.json), and
  // only a real verify call proves the model is reachable.
  const phase: Phase = !available ? "install"
    : !authed ? "signin"
    : !verified ? "verify"
    : "ready";
  const ready = phase === "ready";
  const actionStarted = startedInPhase === phase;

  // Poll status until ready so install/sign-in completion advances the flow.
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => void refreshStatus(), 2500);
    return () => clearInterval(id);
  }, [ready, refreshStatus]);

  // Auto-verify once on entering the verify phase (so we only celebrate when the
  // model actually answers). Re-arms whenever we leave the verify phase.
  const runVerify = useCallback(async () => {
    setVerify({ status: "running" });
    try {
      const r = await fetch(`/api/agents/providers/${providerId}/verify`, { method: "POST" });
      const d = await r.json();
      setVerify({ status: d.status, hint: d.hint, failedStepTitle: d.failedStepTitle });
      if (d.status === "pass") {
        await refreshStatus();
        await loadProviders();
        await promoteSoleReadyDefault(providerId);
        // Let the Settings list (and any other surface) refresh its card.
        window.dispatchEvent(new CustomEvent("cabinet:providers-updated"));
      }
    } catch (e) {
      setVerify({ status: "other_error", hint: e instanceof Error ? e.message : String(e) });
    }
  }, [providerId, refreshStatus, loadProviders]);

  useEffect(() => {
    if (phase === "verify" && !verifyRanRef.current) {
      verifyRanRef.current = true;
      // Defer so the "running" setState isn't synchronous within the effect.
      queueMicrotask(() => void runVerify());
    } else if (phase !== "verify") {
      verifyRanRef.current = false;
    }
  }, [phase, runVerify]);

  const runInTerminal = (command: string) => {
    setLoginUrl(null);
    outBuf.current = "";
    setStartedInPhase(phase);
    termRef.current?.sendInput(command + "\r");
  };

  const handleTermData = (text: string) => {
    outBuf.current = (outBuf.current + text).slice(-4000);
    if (loginUrl) return;
    const m = outBuf.current.match(/https?:\/\/[^\s"'`\x1b]+/);
    if (m) setLoginUrl(m[0].replace(/[)\].,]+$/, ""));
  };

  const onExternalDone = async () => {
    await refreshStatus(); await loadProviders(); await promoteSoleReadyDefault(providerId);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={close}>
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <ProviderLogo src={iconSrc} name={name} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold leading-tight">{t("settings:providerSetup.title", { name })}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {ready ? t("settings:providerSetup.ready") : available ? t("settings:providerSetup.notLoggedIn") : t("settings:providerSetup.notInstalled")}
            </p>
          </div>
          <button onClick={close} aria-label={t("status:common.close")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress rail (hidden until the first status lands, to avoid a flash) */}
        {status !== null && <ProgressRail phase={phase} available={available} authed={authed} t={t} />}

        {status === null ? (
          <div className="flex flex-1 items-center justify-center p-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : ready ? (
          <ReadyPanel name={name} iconSrc={iconSrc} t={t} onClose={close} />
        ) : (
          <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* LEFT — the current phase, front and center */}
            <div className="min-h-0 space-y-4 overflow-y-auto border-b border-border p-5 md:border-b-0 md:border-e">
              {phase === "install" && (
                <HeroAction
                  heading={t("settings:providerSetup.installHeading", { name })}
                  body={t("settings:providerSetup.installBody")}
                  cta={t("settings:providerSetup.installCta", { name })}
                  busy={actionStarted}
                  busyLabel={t("settings:providerSetup.installingNow")}
                  disabled={!installStep}
                  onClick={() => installStep && runInTerminal(installStep.command!)}
                />
              )}

              {phase === "signin" && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-[15px] font-semibold">{t("settings:providerSetup.signInHeading", { name })}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("settings:providerSetup.signInBody", { name })}</p>
                  </div>
                  {providerId === "claude-code" && <ClaudeLogin onDone={onExternalDone} t={t} />}
                  {providerId !== "claude-code" && loginStep && (
                    <HeroAction
                      cta={t("settings:providerSetup.signInCta")}
                      busy={actionStarted}
                      busyLabel={t("settings:providerSetup.signInWaiting")}
                      onClick={() => runInTerminal(loginStep.command!)}
                    />
                  )}
                  {providerId !== "claude-code" && !loginStep && apiKeyEnv && <ApiKeyLogin envVar={apiKeyEnv} onDone={onExternalDone} t={t} />}
                  {loginUrl && <LoginLink url={loginUrl} t={t} />}
                </div>
              )}

              {phase === "verify" && (
                verifyFailed ? (
                  <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                    <h3 className="text-[15px] font-semibold text-amber-800 dark:text-amber-200">{t("settings:providerSetup.almostThere")}</h3>
                    <p className="text-xs text-amber-700 dark:text-amber-300">{verify?.hint || vStatus}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => void runVerify()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
                        {t("settings:providerSetup.tryAgain")}
                      </button>
                      {vStatus === "auth_required" && loginStep && (
                        <button onClick={() => runInTerminal(loginStep.command!)} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
                          {t("settings:providerSetup.signInCta")}
                        </button>
                      )}
                    </div>
                    {loginUrl && <LoginLink url={loginUrl} t={t} />}
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                    <p className="text-sm">{t("settings:providerSetup.verifyingNow")}</p>
                  </div>
                )
              )}

              {/* Manual steps — always available, tucked away. */}
              <div className="border-t border-border pt-3">
                <button onClick={() => setShowManual((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showManual && "rotate-180")} />
                  {showManual ? t("settings:providerSetup.manualHide") : t("settings:providerSetup.manualToggle")}
                </button>
                {showManual && (
                  <div className="mt-2 rounded-lg bg-muted/40 p-2">
                    <ProviderSetupSteps steps={steps} onRunCommand={runInTerminal} failedStepTitle={verify?.failedStepTitle} passed={verified} />
                    <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                      <button onClick={() => void runVerify()} disabled={vStatus === "running"} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50">
                        {vStatus === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {t("settings:providerSetup.verify")}
                      </button>
                      {verifyFailed && <span className="text-[11px] text-amber-600 dark:text-amber-400">{verify?.hint || vStatus}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — the live console */}
            <div className="flex min-h-0 flex-col p-4">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {t("settings:providerSetup.consoleLabel")}
              </div>
              <div className="min-h-[320px] flex-1 overflow-hidden rounded-xl border border-border">
                <WebTerminal ref={termRef} sessionId={termSessionId} adapterType="shell" themeSurface="page" onData={handleTermData} onClose={() => {}} />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {!ready && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <button onClick={() => { setSection({ type: "settings", slug: "providers" }); close(); }} className="text-xs text-muted-foreground underline hover:text-foreground">
              {t("settings:providerSetup.openSettings")}
            </button>
            <button onClick={close} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              {t("status:common.close")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderLogo({ src, name }: { src?: string; name: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" onError={() => setBroken(true)} />;
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

type TFn = (k: string, o?: Record<string, unknown>) => string;

function ProgressRail({ phase, available, authed, t }: { phase: Phase; available: boolean; authed: boolean; t: TFn }) {
  const steps: Array<{ key: string; label: string; state: "done" | "current" | "todo" }> = [
    { key: "install", label: t("settings:providerSetup.phaseInstall"), state: available ? "done" : phase === "install" ? "current" : "todo" },
    { key: "signin", label: t("settings:providerSetup.phaseSignIn"), state: available && authed ? "done" : phase === "signin" ? "current" : "todo" },
    { key: "ready", label: t("settings:providerSetup.phaseReady"), state: phase === "ready" ? "done" : phase === "verify" ? "current" : "todo" },
  ];
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-5 py-2.5">
      {steps.map((s, i) => (
        <div key={s.key} className="flex flex-1 items-center gap-2">
          <span className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
            s.state === "done" ? "bg-emerald-500 text-white"
            : s.state === "current" ? "bg-primary text-primary-foreground"
            : "bg-muted-foreground/20 text-muted-foreground",
          )}>
            {s.state === "done" ? <Check className="h-3 w-3" /> : i + 1}
          </span>
          <span className={cn("text-xs font-medium", s.state === "todo" ? "text-muted-foreground" : "text-foreground")}>{s.label}</span>
          {i < steps.length - 1 && <span className={cn("mx-1 h-px flex-1", s.state === "done" ? "bg-emerald-500/40" : "bg-border")} />}
        </div>
      ))}
    </div>
  );
}

function HeroAction({ heading, body, cta, busy, busyLabel, disabled, onClick }: {
  heading?: string; body?: string; cta: string; busy: boolean; busyLabel: string; disabled?: boolean; onClick: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
      {heading && <h3 className="text-[15px] font-semibold">{heading}</h3>}
      {body && <p className="text-xs text-muted-foreground">{body}</p>}
      {busy ? (
        <p className="flex items-center gap-2 text-sm text-primary"><Loader2 className="h-4 w-4 animate-spin" />{busyLabel}</p>
      ) : (
        <button onClick={onClick} disabled={disabled} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
          {cta}
        </button>
      )}
    </div>
  );
}

function LoginLink({ url, t }: { url: string; t: TFn }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{t("settings:providerSetup.openLinkHint")}</p>
      <div className="flex items-center gap-1.5">
        <button onClick={() => openExternal(url)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
          <ExternalLink className="h-3.5 w-3.5" /> {t("settings:providerSetup.openInBrowser")}
        </button>
        <span className="flex-1 truncate rounded border border-border bg-background px-2 py-1.5 font-mono text-[10.5px]">{url}</span>
        <CopyButton text={url} />
      </div>
    </div>
  );
}

function ReadyPanel({ name, iconSrc, t, onClose }: { name: string; iconSrc?: string; t: TFn; onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="relative">
        <ProviderLogo src={iconSrc} name={name} />
        <span className="absolute -bottom-1.5 -end-1.5 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-background">
          <Check className="h-3 w-3" />
        </span>
      </div>
      <div>
        <h3 className="flex items-center justify-center gap-1.5 text-lg font-semibold">
          <Sparkles className="h-4 w-4 text-amber-500" /> {t("settings:providerSetup.readyHeading", { name })}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings:providerSetup.readyBody", { name })}</p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">{t("settings:providerSetup.whatNext")}</p>
      </div>
      <button onClick={onClose} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
        {t("settings:providerSetup.done")}
      </button>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Copy">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function ClaudeLogin({ onDone, t }: { onDone: () => void; t: TFn }) {
  const [phase, setPhase] = useState<"idle" | "starting" | "await-code" | "submitting">("idle");
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  const start = async () => {
    setPhase("starting"); setErr("");
    try {
      const r = await fetch("/api/agents/claude-login/start", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not start Claude login");
      setUrl(d.url); setPhase("await-code");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setPhase("idle"); }
  };
  const submit = async () => {
    setPhase("submitting"); setErr("");
    try {
      const r = await fetch("/api/agents/claude-login/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not connect");
      void onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setPhase("await-code"); }
  };

  return (
    <div className="space-y-2">
      {phase === "idle" && (
        <button onClick={start} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          {t("settings:providerSetup.connectClaude")}
        </button>
      )}
      {phase === "starting" && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("settings:providerSetup.preparingLink")}</p>}
      {(phase === "await-code" || phase === "submitting") && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <button onClick={() => openExternal(url)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
              <ExternalLink className="h-3.5 w-3.5" />{t("settings:providerSetup.openClaudeLogin")}
            </button>
            <CopyButton text={url} />
          </div>
          <p className="text-xs text-muted-foreground">{t("settings:providerSetup.pasteCodeHint")}</p>
          <div className="flex items-center gap-1.5">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("settings:providerSetup.codePlaceholder")} className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring/60" />
            <button onClick={submit} disabled={!code.trim() || phase === "submitting"} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {phase === "submitting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{t("settings:providerSetup.connect")}
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

function ApiKeyLogin({ envVar, onDone, t }: { envVar: string; onDone: () => void; t: TFn }) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSaving(true); setErr("");
    try {
      const r = await fetch("/api/agents/config/cabinet-env", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: envVar, value: key.trim() }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error((d as { error?: string }).error || "Could not save key"); }
      setKey(""); void onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("settings:providerSetup.apiKeyFieldHint", { envVar })}</p>
      <div className="flex items-center gap-1.5">
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={envVar} className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring/60" />
        <button onClick={save} disabled={!key.trim() || saving} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{t("settings:providerSetup.saveKey")}
        </button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

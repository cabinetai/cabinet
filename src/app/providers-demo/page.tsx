"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProviderGlyph } from "@/components/agents/provider-glyph";
import { isAgentProviderSelectable } from "@/lib/agents/provider-filters";
import type { ProviderInfo } from "@/types/agents";
import { Loader2, Play, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

type VerifyStatus =
  | "pass"
  | "not_installed"
  | "auth_required"
  | "payment_required"
  | "quota_exceeded"
  | "other_error";

interface VerifyResult {
  status: VerifyStatus;
  failedStepTitle: string;
  command: string;
  exitCode: number | null;
  signal: string | null;
  output: string;
  stderr: string;
  durationMs: number;
  hint?: string;
}

type RunPhase =
  | { phase: "idle" }
  | { phase: "running"; startedAt: number }
  | { phase: "done"; output: string; ms: number }
  | { phase: "error"; message: string; ms: number };

type VerifyPhase =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; result: VerifyResult }
  | { phase: "error"; message: string };

interface ApiLogEntry {
  id: string;
  method: string;
  url: string;
  requestBody?: unknown;
  status?: number;
  ok?: boolean;
  responseBody?: unknown;
  errorMessage?: string;
  startedAt: number;
  ms: number;
}

const STATUS_META: Record<VerifyStatus, { label: string; tone: string }> = {
  pass: { label: "Pass", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  not_installed: { label: "Not installed", tone: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  auth_required: { label: "Auth required", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  payment_required: { label: "Payment required", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  quota_exceeded: { label: "Quota / rate limit", tone: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  other_error: { label: "Error", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
};

function nowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ProvidersDemoPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [defaultProvider, setDefaultProvider] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [defaultEffort, setDefaultEffort] = useState<string | null>(null);

  const [statusProviders, setStatusProviders] = useState<Array<{
    id: string;
    name: string;
    available: boolean;
    authenticated: boolean;
  }> | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [prompt, setPrompt] = useState("Reply with exactly: OK from {{provider}}.");
  const [modelByProvider, setModelByProvider] = useState<Record<string, string | null>>({});
  const [effortByProvider, setEffortByProvider] = useState<Record<string, string | null>>({});
  const [runState, setRunState] = useState<Record<string, RunPhase>>({});
  const [verifyState, setVerifyState] = useState<Record<string, VerifyPhase>>({});
  const [apiLog, setApiLog] = useState<ApiLogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(true);

  const appendLog = useCallback((entry: ApiLogEntry) => {
    setApiLog((prev) => [entry, ...prev].slice(0, 100));
  }, []);

  const callApi = useCallback(
    async <T,>(input: {
      method: string;
      url: string;
      body?: unknown;
    }): Promise<{ ok: boolean; status: number; data: T | null; error?: string; ms: number }> => {
      const id = nowId();
      const startedAt = Date.now();
      try {
        const res = await fetch(input.url, {
          method: input.method,
          headers: input.body ? { "Content-Type": "application/json" } : undefined,
          body: input.body ? JSON.stringify(input.body) : undefined,
        });
        const text = await res.text();
        let data: unknown = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }
        const ms = Date.now() - startedAt;
        appendLog({
          id,
          method: input.method,
          url: input.url,
          requestBody: input.body,
          status: res.status,
          ok: res.ok,
          responseBody: data,
          startedAt,
          ms,
        });
        return { ok: res.ok, status: res.status, data: data as T, ms };
      } catch (err) {
        const ms = Date.now() - startedAt;
        const errorMessage = err instanceof Error ? err.message : String(err);
        appendLog({
          id,
          method: input.method,
          url: input.url,
          requestBody: input.body,
          errorMessage,
          startedAt,
          ms,
        });
        return { ok: false, status: 0, data: null, error: errorMessage, ms };
      }
    },
    [appendLog]
  );

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    setProvidersError(null);
    const res = await callApi<{
      providers: ProviderInfo[];
      defaultProvider: string | null;
      defaultModel: string | null;
      defaultEffort: string | null;
    }>({ method: "GET", url: "/api/agents/providers" });
    if (res.ok && res.data) {
      const cli = (res.data.providers || []).filter(isAgentProviderSelectable);
      setProviders(cli);
      setDefaultProvider(res.data.defaultProvider ?? null);
      setDefaultModel(res.data.defaultModel ?? null);
      setDefaultEffort(res.data.defaultEffort ?? null);
      setModelByProvider((prev) => {
        const next = { ...prev };
        for (const p of cli) {
          if (!next[p.id]) next[p.id] = p.models?.[0]?.id ?? null;
        }
        return next;
      });
      setEffortByProvider((prev) => {
        const next = { ...prev };
        for (const p of cli) {
          if (!next[p.id]) {
            next[p.id] = p.effortLevels?.[0]?.id ?? null;
          }
        }
        return next;
      });
    } else {
      setProvidersError(res.error || `HTTP ${res.status}`);
    }
    setProvidersLoading(false);
  }, [callApi]);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    const res = await callApi<{
      providers: Array<{ id: string; name: string; available: boolean; authenticated: boolean }>;
      anyReady: boolean;
    }>({ method: "GET", url: "/api/agents/providers/status" });
    if (res.ok && res.data) setStatusProviders(res.data.providers);
    setStatusLoading(false);
  }, [callApi]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const runVerify = useCallback(
    async (id: string) => {
      setVerifyState((prev) => ({ ...prev, [id]: { phase: "running" } }));
      const res = await callApi<VerifyResult>({
        method: "POST",
        url: `/api/agents/providers/${id}/verify`,
      });
      if (res.ok && res.data) {
        setVerifyState((prev) => ({ ...prev, [id]: { phase: "done", result: res.data! } }));
      } else {
        setVerifyState((prev) => ({
          ...prev,
          [id]: { phase: "error", message: res.error || `HTTP ${res.status}` },
        }));
      }
    },
    [callApi]
  );

  const runPrompt = useCallback(
    async (p: ProviderInfo) => {
      const startedAt = Date.now();
      setRunState((prev) => ({ ...prev, [p.id]: { phase: "running", startedAt } }));
      const resolvedPrompt = prompt.replaceAll("{{provider}}", p.name);
      const selectedModel = modelByProvider[p.id];
      const selectedEffort = effortByProvider[p.id];
      const res = await callApi<{ ok: boolean; output?: string | Record<string, unknown>; message?: string; error?: string }>({
        method: "POST",
        url: "/api/agents/headless",
        body: {
          providerId: p.id,
          prompt: resolvedPrompt,
          captureOutput: true,
          model: selectedModel || undefined,
          effort: selectedEffort || undefined,
        },
      });
      const ms = Date.now() - startedAt;
      if (res.ok && res.data && res.data.ok) {
        const output =
          typeof res.data.output === "string"
            ? res.data.output
            : res.data.output
              ? JSON.stringify(res.data.output, null, 2)
              : res.data.message || "(no output)";
        setRunState((prev) => ({ ...prev, [p.id]: { phase: "done", output, ms } }));
      } else {
        const msg =
          (res.data && typeof res.data === "object" && "error" in res.data
            ? String((res.data as { error?: unknown }).error ?? "")
            : res.error) || `HTTP ${res.status}`;
        setRunState((prev) => ({ ...prev, [p.id]: { phase: "error", message: msg, ms } }));
      }
    },
    [callApi, prompt]
  );

  const readyCount = useMemo(
    () => providers.filter((p) => p.available && p.authenticated).length,
    [providers]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Providers Demo</h1>
            <p className="text-sm text-muted-foreground">
              Exercise every provider server API: list, status, verify, and headless one-shot prompts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadProviders()}
              disabled={providersLoading}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {providersLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              GET /api/agents/providers
            </button>
            <button
              onClick={() => void loadStatus()}
              disabled={statusLoading}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {statusLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="size-3.5" />
              )}
              GET /api/agents/providers/status
            </button>
          </div>
        </header>

        {/* Summary */}
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Providers" value={String(providers.length)} />
          <SummaryCard label="Ready" value={`${readyCount} / ${providers.length}`} />
          <SummaryCard label="Default provider" value={defaultProvider || "—"} />
          <SummaryCard
            label="Default model · effort"
            value={`${defaultModel || "—"} · ${defaultEffort || "—"}`}
          />
        </section>

        {providersError && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
            Failed to load providers: {providersError}
          </div>
        )}

        {/* Shared prompt */}
        <section className="mb-6 rounded-xl border bg-card p-4">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Shared prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Reply with exactly: OK from {{provider}}."
            className="mt-2 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            <code className="rounded bg-muted px-1 py-0.5">{`{{provider}}`}</code> is replaced with the
            provider&apos;s display name before being sent. Model + effort selectors are forwarded to{" "}
            <code className="rounded bg-muted px-1 py-0.5">/api/agents/headless</code> for providers
            that support them (Claude and Codex today); others ignore them.
          </p>
        </section>

        {/* Provider cards */}
        <section className="space-y-3">
          {providers.length === 0 && !providersLoading && (
            <div className="rounded-md border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              No providers loaded. Click <strong>GET /api/agents/providers</strong> above.
            </div>
          )}
          {providers.map((p) => {
            const isReady = !!(p.available && p.authenticated);
            const run = runState[p.id] ?? { phase: "idle" as const };
            const verify = verifyState[p.id] ?? { phase: "idle" as const };
            const selectedModel = modelByProvider[p.id] ?? null;
            const selectedEffort = effortByProvider[p.id] ?? null;
            const verifyResult = verify.phase === "done" ? verify.result : null;
            return (
              <div
                key={p.id}
                className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <ProviderGlyph icon={p.icon} className="size-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{p.name}</p>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {p.id}
                        </code>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            isReady
                              ? STATUS_META.pass.tone
                              : p.available
                                ? STATUS_META.auth_required.tone
                                : STATUS_META.not_installed.tone
                          }`}
                        >
                          {isReady ? "Ready" : p.available ? "Log in required" : "Not installed"}
                        </span>
                        {p.version && (
                          <span className="text-[10px] text-muted-foreground">
                            {p.version}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        adapter: <code>{p.defaultAdapterType || "—"}</code>
                        {p.adapters && p.adapters.length > 1 && (
                          <>
                            {" · "}
                            {p.adapters.length} adapters
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => void runVerify(p.id)}
                      disabled={verify.phase === "running"}
                      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      {verify.phase === "running" ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <ShieldCheck className="size-3" />
                      )}
                      Verify
                    </button>
                    <button
                      onClick={() => void runPrompt(p)}
                      disabled={!isReady || run.phase === "running" || !prompt.trim()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      {run.phase === "running" ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Play className="size-3" />
                      )}
                      Send prompt
                    </button>
                  </div>
                </div>

                {/* Model + effort pickers */}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {p.models && p.models.length > 0 && (
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Model
                      </label>
                      <select
                        value={selectedModel ?? ""}
                        onChange={(e) =>
                          setModelByProvider((prev) => ({ ...prev, [p.id]: e.target.value || null }))
                        }
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-[12px]"
                      >
                        {p.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.id})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {p.effortLevels && p.effortLevels.length > 0 && (
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Effort
                      </label>
                      <select
                        value={selectedEffort ?? ""}
                        onChange={(e) =>
                          setEffortByProvider((prev) => ({
                            ...prev,
                            [p.id]: e.target.value || null,
                          }))
                        }
                        className="mt-1 w-full rounded-md border bg-background px-2 py-1 text-[12px]"
                      >
                        {p.effortLevels.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Verify result */}
                {verifyResult && (
                  <div className="mt-3 rounded-md border bg-muted/30 p-3 text-[11px]">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_META[verifyResult.status].tone}`}
                      >
                        {STATUS_META[verifyResult.status].label}
                      </span>
                      <span className="text-muted-foreground">
                        exit={verifyResult.exitCode ?? "null"} · {verifyResult.durationMs}ms
                      </span>
                      {verifyResult.status !== "pass" && verifyResult.failedStepTitle && (
                        <span className="text-muted-foreground">
                          failed at: <strong>{verifyResult.failedStepTitle}</strong>
                        </span>
                      )}
                    </div>
                    {verifyResult.hint && (
                      <p className="text-muted-foreground">{verifyResult.hint}</p>
                    )}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-muted-foreground">command & output</summary>
                      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono text-[10px]">
{`$ ${verifyResult.command}

--- stdout ---
${verifyResult.output || "(empty)"}

--- stderr ---
${verifyResult.stderr || "(empty)"}`}
                      </pre>
                    </details>
                  </div>
                )}
                {verify.phase === "error" && (
                  <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-700 dark:text-rose-400">
                    Verify failed: {verify.message}
                  </div>
                )}

                {/* Run result */}
                {run.phase !== "idle" && (
                  <div className="mt-3 rounded-md border bg-muted/30 p-3 text-[11px]">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          run.phase === "done"
                            ? STATUS_META.pass.tone
                            : run.phase === "error"
                              ? STATUS_META.other_error.tone
                              : "bg-slate-500/15 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {run.phase === "done" ? "Completed" : run.phase === "error" ? "Error" : "Running…"}
                      </span>
                      {run.phase !== "running" && (
                        <span className="text-muted-foreground">{run.ms}ms</span>
                      )}
                    </div>
                    {run.phase === "done" && (
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono text-[11px]">
                        {run.output || "(empty response)"}
                      </pre>
                    )}
                    {run.phase === "error" && (
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono text-[11px] text-rose-700 dark:text-rose-400">
                        {run.message}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* Status response */}
        {statusProviders && (
          <section className="mt-8 rounded-xl border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">/providers/status response</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {statusProviders.map((p) => (
                <div
                  key={p.id}
                  className="rounded-md border bg-muted/30 px-3 py-2 text-[11px]"
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="text-muted-foreground">
                    available: {String(p.available)} · auth: {String(p.authenticated)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* API log */}
        <section className="mt-8 rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">API call log</h2>
              <span className="text-[11px] text-muted-foreground">
                {apiLog.length} entr{apiLog.length === 1 ? "y" : "ies"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLogOpen((v) => !v)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                {logOpen ? "Hide" : "Show"}
              </button>
              <button
                onClick={() => setApiLog([])}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
              >
                <Trash2 className="size-3" />
                Clear
              </button>
            </div>
          </div>
          {logOpen && (
            <div className="max-h-[480px] overflow-auto">
              {apiLog.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No calls yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {apiLog.map((entry) => (
                    <li key={entry.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-semibold">
                          {entry.method}
                        </span>
                        <code className="font-mono text-foreground">{entry.url}</code>
                        {entry.status !== undefined && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              entry.ok
                                ? STATUS_META.pass.tone
                                : STATUS_META.other_error.tone
                            }`}
                          >
                            {entry.status}
                          </span>
                        )}
                        <span className="text-muted-foreground">{entry.ms}ms</span>
                        <span className="text-muted-foreground">
                          {new Date(entry.startedAt).toLocaleTimeString()}
                        </span>
                      </div>
                      {entry.errorMessage && (
                        <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-400">
                          {entry.errorMessage}
                        </p>
                      )}
                      {(entry.requestBody !== undefined || entry.responseBody !== undefined) && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-muted-foreground">
                            body
                          </summary>
                          <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-2">
                            {entry.requestBody !== undefined && (
                              <pre className="max-h-40 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px]">
                                {JSON.stringify(entry.requestBody, null, 2)}
                              </pre>
                            )}
                            {entry.responseBody !== undefined && (
                              <pre className="max-h-40 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px]">
                                {typeof entry.responseBody === "string"
                                  ? entry.responseBody
                                  : JSON.stringify(entry.responseBody, null, 2)}
                              </pre>
                            )}
                          </div>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

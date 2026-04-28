"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import {
  Settings,
  CheckCircle,
  XCircle,
  RefreshCw,
  Sparkles,
  Bell,
  Plug,
  Cpu,
  Stethoscope,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Clock,
  CloudDownload,
  Palette,
  Check,
  Info,
  Terminal,
  ExternalLink,
  ChevronDown,
  Copy,
  ClipboardCheck,
  HardDrive,
  FolderOpen,
  RotateCw,
  CircleUser,
  Upload,
  Trash2,
  Cloud,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SkillLibrary } from "@/components/skills/skill-library";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { UpdateSummary } from "@/components/system/update-summary";
import { useCabinetUpdate } from "@/hooks/use-cabinet-update";
import { useTheme } from "@/components/theme-provider";
import {
  THEMES,
  applyTheme,
  getStoredThemeName,
  storeThemeName,
  type ThemeDefinition,
} from "@/lib/themes";
import {
  RuntimeMatrixPicker,
  RuntimeSelectionBanner,
} from "@/components/composer/task-runtime-picker";
import { isAgentProviderSelectable } from "@/lib/agents/provider-filters";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/ui/toast";
import { confirmDialog } from "@/lib/ui/confirm";
import type { ProviderInfo } from "@/types/agents";
import { UserAvatar } from "@/components/layout/user-avatar";
import {
  refreshUserProfile,
  setUserProfileOptimistic,
  useUserProfile,
} from "@/hooks/use-user-profile";
import { ICON_PICKER_KEYS, getIconByKey } from "@/lib/agents/icon-catalog";
import { AGENT_PALETTE } from "@/lib/themes";
import {
  AVATAR_PRESETS,
  AVATAR_CATEGORY_LABEL,
  AVATAR_CATEGORY_ORDER,
  getAvatarCategory,
  type AvatarCategory,
  type AvatarPreset,
} from "@/lib/agents/avatar-catalog";
import Image from "next/image";
import { sendTelemetry } from "@/lib/telemetry/browser";
import {
  recordWaitlistView,
  recordWaitlistStart,
  submitWaitlistEmail,
} from "@/lib/telemetry/waitlist-client";

interface McpServer {
  name: string;
  command: string;
  enabled: boolean;
  env: Record<string, string>;
  description?: string;
}

interface IntegrationConfig {
  mcp_servers: Record<string, McpServer>;
  notifications: {
    browser_push: boolean;
    telegram: { enabled: boolean; bot_token: string; chat_id: string };
    slack_webhook: { enabled: boolean; url: string };
    email: { enabled: boolean; frequency: "hourly" | "daily"; to: string };
  };
  scheduling: {
    max_concurrent_agents: number;
    default_heartbeat_interval: string;
    active_hours: string;
    pause_on_error: boolean;
  };
}

type Tab = "profile" | "providers" | "skills" | "storage" | "integrations" | "notifications" | "appearance" | "updates" | "about";

function TerminalCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 mt-1.5 font-mono text-[12px]"
      style={{ background: "#1e1e1e", color: "#d4d4d4" }}
    >
      <span style={{ color: "#6A9955" }}>$</span>
      <span className="flex-1 select-all">{command}</span>
      <button
        onClick={copy}
        className="shrink-0 p-1 rounded transition-colors hover:bg-white/10"
        title="Copy to clipboard"
      >
        {copied ? (
          <ClipboardCheck className="size-3.5" style={{ color: "#6A9955" }} />
        ) : (
          <Copy className="size-3.5" style={{ color: "#808080" }} />
        )}
      </button>
    </div>
  );
}

type SetupStep = { title: string; detail: string; cmd?: string; openTerminal?: boolean; link?: { label: string; url: string } };

function buildProviderSetupSteps(
  installSteps: ProviderInfo["installSteps"]
): SetupStep[] {
  if (!installSteps || installSteps.length === 0) return [];
  return [
    {
      title: "Open a terminal",
      detail: "You'll need a terminal to run the next steps.",
      openTerminal: true,
    },
    ...installSteps.map((step) => ({
      title: step.title,
      detail: step.detail,
      cmd: step.command,
      link: step.link,
    })),
  ];
}

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

type VerifyState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; result: VerifyResult }
  | { phase: "error"; message: string };

const VERIFY_STATUS_META: Record<VerifyStatus, { label: string; tone: string }> = {
  pass: { label: "Passed", tone: "bg-emerald-500/10 text-emerald-500" },
  not_installed: { label: "Not installed", tone: "bg-muted text-muted-foreground" },
  auth_required: { label: "Auth required", tone: "bg-amber-500/15 text-amber-500" },
  payment_required: {
    label: "Payment required",
    tone: "bg-rose-500/15 text-rose-500",
  },
  quota_exceeded: { label: "Quota / rate limit", tone: "bg-orange-500/15 text-orange-500" },
  other_error: { label: "Error", tone: "bg-rose-500/10 text-rose-500" },
};

function matchesFailedStep(stepTitle: string, failedStepTitle?: string): boolean {
  if (!failedStepTitle) return false;
  return stepTitle.trim().toLowerCase() === failedStepTitle.trim().toLowerCase();
}

export function SettingsPage() {
  const { showHiddenFiles, setShowHiddenFiles } = useTreeStore();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [defaultProvider, setDefaultProvider] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [defaultEffort, setDefaultEffort] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingProviders, setSavingProviders] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [verifyState, setVerifyState] = useState<Record<string, VerifyState>>({});
  const [verifyOutputOpen, setVerifyOutputOpen] = useState<Record<string, boolean>>({});

  const runVerify = async (providerId: string) => {
    setVerifyState((prev) => ({ ...prev, [providerId]: { phase: "running" } }));
    try {
      const res = await fetch(`/api/agents/providers/${providerId}/verify`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setVerifyState((prev) => ({
          ...prev,
          [providerId]: {
            phase: "error",
            message: body.error || `HTTP ${res.status}`,
          },
        }));
        return;
      }
      const data = (await res.json()) as VerifyResult;
      setVerifyState((prev) => ({
        ...prev,
        [providerId]: { phase: "done", result: data },
      }));
    } catch (err) {
      setVerifyState((prev) => ({
        ...prev,
        [providerId]: {
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  };
  const [dataDir, setDataDir] = useState("");
  const [dataDirPending, setDataDirPending] = useState<string | null>(null);
  const [dataDirBrowsing, setDataDirBrowsing] = useState(false);
  const [dataDirSaving, setDataDirSaving] = useState(false);
  const [dataDirRestartNeeded, setDataDirRestartNeeded] = useState(false);
  const VALID_TABS: Tab[] = ["profile", "providers", "skills", "storage", "integrations", "notifications", "appearance", "updates", "about"];
  const initialTab = (() => {
    const slug = useAppStore.getState().section.slug as Tab | undefined;
    return slug && VALID_TABS.includes(slug) ? slug : "profile";
  })();
  const [tab, setTabState] = useState<Tab>(initialTab);
  const initializedRef = useRef(false);

  // Sync tab changes to hash
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    useAppStore.getState().setSection({ type: "settings", slug: t });
  }, []);

  // Listen for external hash changes (browser back/forward)
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      // Set hash on first render if it's just #/settings
      if (!useAppStore.getState().section.slug) {
        useAppStore.getState().setSection({ type: "settings", slug: tab });
      }
    }
    const unsub = useAppStore.subscribe((state, prev) => {
      if (state.section.type === "settings" && state.section.slug !== prev.section.slug) {
        const slug = state.section.slug as Tab | undefined;
        if (slug && VALID_TABS.includes(slug)) {
          setTabState(slug);
        }
      }
    });
    return unsub;
  }, []);
  const [config, setConfig] = useState<IntegrationConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [activeThemeName, setActiveThemeName] = useState<string | null>(null);
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean | null>(null);
  const [telemetryEnvDisabled, setTelemetryEnvDisabled] = useState(false);
  const [telemetrySaving, setTelemetrySaving] = useState(false);
  const { setTheme: setNextTheme } = useTheme();
  const {
    update,
    loading: updateLoading,
    refreshing: updateRefreshing,
    applyPending,
    backupPending,
    backupPath,
    actionError,
    refresh: refreshUpdate,
    createBackup,
    openDataDir,
    applyUpdate,
  } = useCabinetUpdate();

  // Sync active theme name on mount
  useEffect(() => {
    setActiveThemeName(getStoredThemeName() || "paper");
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/telemetry/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { enabled?: boolean; envDisabled?: boolean }) => {
        if (cancelled) return;
        setTelemetryEnabled(data.enabled ?? true);
        setTelemetryEnvDisabled(Boolean(data.envDisabled));
      })
      .catch(() => {
        if (!cancelled) setTelemetryEnabled(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cabinet Cloud waitlist (About tab) — same client as the onboarding form,
  // posts to reports.runcabinet.com with source: "cabinet-settings".
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudStatus, setCloudStatus] = useState<
    "idle" | "submitting" | "success" | "already" | "error"
  >("idle");
  const cloudViewedRef = useRef(false);
  const cloudStartedRef = useRef(false);
  useEffect(() => {
    if (tab === "about" && !cloudViewedRef.current) {
      cloudViewedRef.current = true;
      recordWaitlistView("cabinet-settings");
    }
  }, [tab]);
  const handleCloudInput = useCallback((value: string) => {
    setCloudEmail(value);
    if (cloudStatus === "error" || cloudStatus === "already") setCloudStatus("idle");
    if (!cloudStartedRef.current && value.length > 0) {
      cloudStartedRef.current = true;
      recordWaitlistStart("cabinet-settings");
    }
  }, [cloudStatus]);
  const handleCloudSubmit = useCallback(async () => {
    const trimmed = cloudEmail.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setCloudStatus("error");
      return;
    }
    setCloudStatus("submitting");
    const result = await submitWaitlistEmail(trimmed, "cabinet-settings");
    if (!result.ok) {
      setCloudStatus("error");
      return;
    }
    setCloudStatus(result.alreadyOnList ? "already" : "success");
  }, [cloudEmail]);

  const toggleTelemetry = useCallback(async (next: boolean) => {
    setTelemetrySaving(true);
    try {
      const res = await fetch("/api/telemetry/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) {
        const data = (await res.json()) as { enabled: boolean };
        setTelemetryEnabled(data.enabled);
      }
    } catch {
      /* ignore */
    } finally {
      setTelemetrySaving(false);
    }
  }, []);

  const selectTheme = (themeDef: ThemeDefinition) => {
    applyTheme(themeDef);
    setActiveThemeName(themeDef.name);
    storeThemeName(themeDef.name);
    setNextTheme(themeDef.type);
    sendTelemetry("theme.changed", { themeName: themeDef.name });
  };

  const darkThemes = THEMES.filter((t) => t.type === "dark");
  const lightThemes = THEMES.filter((t) => t.type === "light");

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/agents/providers");
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
        setDefaultProvider(data.defaultProvider || "");
        setDefaultModel(data.defaultModel || "");
        setDefaultEffort(data.defaultEffort || "");
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProviderSettings = useCallback(async (
    nextDefaultProvider: string,
    disabledProviderIds: string[],
    migrations: Array<{ fromProviderId: string; toProviderId: string }> = [],
    overrides?: { defaultModel?: string; defaultEffort?: string }
  ) => {
    setSavingProviders(true);
    try {
      const res = await fetch("/api/agents/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultProvider: nextDefaultProvider,
          defaultModel: overrides?.defaultModel ?? (defaultModel || undefined),
          defaultEffort: overrides?.defaultEffort ?? (defaultEffort || undefined),
          disabledProviderIds,
          migrations,
        }),
      });
      if (res.ok) {
        await refresh(true);
        return true;
      }

      const data = await res.json().catch(() => null);
      if (res.status === 409 && data?.conflicts) {
        const message = (data.conflicts as Array<{
          providerId: string;
          agentSlugs: string[];
          jobs: Array<{ jobName: string }>;
          suggestedProviderId: string;
        }>).map((conflict) =>
          `${conflict.providerId}: ${conflict.agentSlugs.length} agents, ${conflict.jobs.length} jobs`
        ).join("\n");
        showError(`Provider disable blocked until assignments are migrated: ${message}`);
      }
    } catch {
      // ignore
    } finally {
      setSavingProviders(false);
    }
    return false;
  }, [refresh, defaultModel, defaultEffort]);

  const getProviderName = (providerId: string) =>
    providers.find((provider) => provider.id === providerId)?.name || providerId;

  const describeProviderUsage = (provider: ProviderInfo) => {
    const parts: string[] = [];
    if ((provider.usage?.agentCount ?? 0) > 0) {
      parts.push(`${provider.usage!.agentCount} agent${provider.usage!.agentCount === 1 ? "" : "s"}`);
    }
    if ((provider.usage?.jobCount ?? 0) > 0) {
      parts.push(`${provider.usage!.jobCount} job${provider.usage!.jobCount === 1 ? "" : "s"}`);
    }
    return parts.join(", ");
  };

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const res = await fetch("/api/agents/config/integrations");
      if (res.ok) {
        setConfig(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await fetch("/api/agents/config/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const loadDataDir = useCallback(async () => {
    try {
      const res = await fetch("/api/system/data-dir");
      if (res.ok) {
        const data = await res.json();
        setDataDir(data.dataDir || "");
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refresh();
    loadConfig();
    loadDataDir();
  }, [refresh, loadConfig, loadDataDir]);

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateMcp = (id: string, field: string, value: unknown) => {
    if (!config) return;
    setConfig({
      ...config,
      mcp_servers: {
        ...config.mcp_servers,
        [id]: { ...config.mcp_servers[id], [field]: value },
      },
    });
  };

  const updateMcpEnv = (id: string, envKey: string, value: string) => {
    if (!config) return;
    setConfig({
      ...config,
      mcp_servers: {
        ...config.mcp_servers,
        [id]: {
          ...config.mcp_servers[id],
          env: { ...config.mcp_servers[id].env, [envKey]: value },
        },
      },
    });
  };

  const updateNotif = (path: string, value: unknown) => {
    if (!config) return;
    const parts = path.split(".");
    const notif = { ...config.notifications } as Record<string, unknown>;
    if (parts.length === 1) {
      notif[parts[0]] = value;
    } else {
      notif[parts[0]] = { ...(notif[parts[0]] as Record<string, unknown>), [parts[1]]: value };
    }
    setConfig({ ...config, notifications: notif as IntegrationConfig["notifications"] });
  };

  const updateScheduling = (field: string, value: unknown) => {
    if (!config) return;
    setConfig({
      ...config,
      scheduling: { ...config.scheduling, [field]: value },
    });
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "Profile", icon: <CircleUser className="h-3.5 w-3.5" /> },
    { id: "providers", label: "Providers", icon: <Cpu className="h-3.5 w-3.5" /> },
    { id: "skills", label: "Skills", icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: "storage", label: "Storage", icon: <HardDrive className="h-3.5 w-3.5" /> },
    { id: "integrations", label: "Integrations", icon: <Plug className="h-3.5 w-3.5" /> },
    { id: "notifications", label: "Notifications", icon: <Bell className="h-3.5 w-3.5" /> },
    { id: "appearance", label: "Appearance", icon: <Palette className="h-3.5 w-3.5" /> },
    { id: "updates", label: "Updates", icon: <CloudDownload className="h-3.5 w-3.5" /> },
    { id: "about", label: "About", icon: <Info className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border transition-[padding] duration-200"
        style={{ paddingLeft: `calc(1rem + var(--sidebar-toggle-offset, 0px))` }}
      >
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
            Settings
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
<Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-[12px]"
            onClick={() => { refresh(); loadConfig(); }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
              tab === t.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="p-4 space-y-6 max-w-2xl">
          {/* Profile Tab */}
          {tab === "profile" && <ProfileTab />}

          {/* Appearance Tab */}
          {tab === "appearance" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[13px] font-semibold mb-1">Theme</h3>
                <p className="text-[12px] text-muted-foreground mb-4">
                  Choose a theme for the interface.
                </p>

                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-2">Light Themes</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {lightThemes.map((t) => (
                        <button
                          key={t.name}
                          onClick={() => selectTheme(t)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all",
                            activeThemeName === t.name
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border hover:border-primary/30"
                          )}
                        >
                          <div
                            className="h-4 w-4 rounded-full shrink-0 border border-[#00000015]"
                            style={{ backgroundColor: t.accent }}
                          />
                          <span
                            className={cn(
                              "text-[12px]",
                              t.name === "paper" ? "italic" : "font-medium"
                            )}
                            style={{
                              fontFamily: t.name === "paper"
                                ? "var(--font-logo), Georgia, serif"
                                : (t.headingFont || t.font),
                            }}
                          >
                            {t.label}
                          </span>
                          {activeThemeName === t.name && (
                            <Check className="h-3 w-3 text-primary ml-auto shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-2">Dark Themes</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {darkThemes.map((t) => (
                        <button
                          key={t.name}
                          onClick={() => selectTheme(t)}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all",
                            activeThemeName === t.name
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border hover:border-primary/30"
                          )}
                        >
                          <div
                            className="h-4 w-4 rounded-full shrink-0 border border-[#ffffff20]"
                            style={{ backgroundColor: t.accent }}
                          />
                          <span
                            className="text-[12px] font-medium"
                            style={{ fontFamily: t.headingFont || t.font }}
                          >
                            {t.label}
                          </span>
                          {activeThemeName === t.name && (
                            <Check className="h-3 w-3 text-primary ml-auto shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="text-[13px] font-semibold mb-1">Sidebar</h3>
                <p className="text-[12px] text-muted-foreground mb-4">
                  Configure how files are displayed in the sidebar.
                </p>

                <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 cursor-pointer hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={showHiddenFiles}
                      onChange={(e) => setShowHiddenFiles(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <div>
                      <span className="text-[13px] font-medium">Show hidden files</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Display files and folders starting with a dot (e.g. .env, .git)
                      </p>
                    </div>
                  </div>
                  <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl"}+⇧+.
                  </kbd>
                </label>
              </div>
            </div>
          )}

          {/* Storage Tab */}
          {tab === "storage" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[14px] font-semibold mb-1">Data Directory</h3>
                <p className="text-[12px] text-muted-foreground">
                  All Knowledge Base content is stored in this directory.
                  Changing the path requires a restart.
                </p>
              </div>

              {dataDirRestartNeeded && (
                <div className="flex items-center gap-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
                  <RotateCw className="h-4 w-4 shrink-0 text-yellow-500" />
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-yellow-500">Restart required</p>
                    <p className="text-[12px] text-muted-foreground">
                      The data directory will change after you restart Cabinet.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[12px] font-medium text-muted-foreground">
                  Current path
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 bg-muted/30">
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 font-mono text-[12px] truncate select-all">
                    {dataDir || "Loading..."}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      navigator.clipboard.writeText(dataDir);
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[12px] font-medium text-muted-foreground">
                  Change directory
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="/path/to/data"
                    value={dataDirPending ?? ""}
                    onChange={(e) => setDataDirPending(e.target.value)}
                    className="font-mono text-[12px]"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    disabled={dataDirBrowsing || dataDirSaving}
                    onClick={async () => {
                      setDataDirBrowsing(true);
                      try {
                        const res = await fetch("/api/system/pick-directory", { method: "POST" });
                        const data = await res.json().catch(() => null);
                        if (data?.path) setDataDirPending(data.path);
                      } catch {
                        // ignore
                      } finally {
                        setDataDirBrowsing(false);
                      }
                    }}
                  >
                    {dataDirBrowsing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5" />
                    )}
                    Browse
                  </Button>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    disabled={!dataDirPending?.trim() || dataDirSaving || dataDirPending.trim() === dataDir}
                    onClick={async () => {
                      if (!dataDirPending?.trim()) return;
                      setDataDirSaving(true);
                      try {
                        const res = await fetch("/api/system/data-dir", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ dataDir: dataDirPending.trim() }),
                        });
                        const data = await res.json().catch(() => null);
                        if (!res.ok) {
                          showError(data?.error || "Failed to save.");
                          return;
                        }
                        setDataDirRestartNeeded(true);
                        setDataDirPending(null);
                      } catch {
                        showError("Failed to save data directory.");
                      } finally {
                        setDataDirSaving(false);
                      }
                    }}
                  >
                    {dataDirSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Save
                  </Button>
                  {dataDir && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => {
                        fetch("/api/system/open-data-dir", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({}),
                        });
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Open in Finder
                    </Button>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-[12px] text-muted-foreground">
                  You can also set the <code className="px-1 py-0.5 rounded bg-muted text-[11px]">CABINET_DATA_DIR</code> environment
                  variable, which takes priority over this setting.
                </p>
              </div>
            </div>
          )}

          {tab === "updates" && update && (
            <UpdateSummary
              update={update}
              loading={updateLoading}
              refreshing={updateRefreshing}
              applyPending={applyPending}
              backupPending={backupPending}
              backupPath={backupPath}
              actionError={actionError}
              onRefresh={() => {
                void refreshUpdate();
              }}
              onApply={applyUpdate}
              onCreateBackup={async (options) => {
                await createBackup("data", options);
              }}
              onOpenDataDir={openDataDir}
            />
          )}

          {tab === "updates" && !update && updateLoading && (
            <p className="text-[13px] text-muted-foreground">Checking for Cabinet updates...</p>
          )}

          {/* Providers Tab */}
          {tab === "providers" && (
            <>
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[14px] font-semibold">Agent Providers</h3>
                  <a
                    href="/providers-demo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <Stethoscope className="h-3 w-3" />
                    Troubleshoot AI providers
                  </a>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Configure AI agent providers. CLI agents run via terminal, API agents use direct API calls.
                </p>

                {loading ? (
                  <p className="text-[13px] text-muted-foreground">Loading...</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="mb-3 rounded-lg border border-border bg-card p-3 space-y-2">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Default runtime
                        </label>
                        <RuntimeSelectionBanner
                          providers={providers}
                          value={{
                            providerId: defaultProvider || null,
                            model: defaultModel || null,
                            effort: defaultEffort || null,
                          }}
                          label="Default Model"
                        />
                        <RuntimeMatrixPicker
                          providers={providers}
                          value={{
                            providerId: defaultProvider || null,
                            model: defaultModel || null,
                            effort: defaultEffort || null,
                          }}
                          includeUnavailable
                          emptyText="No providers are configured. Add one below."
                          onChange={({ providerId, model, effort }) => {
                            if (savingProviders) return;
                            const disabledIds = providers
                              .filter((p) => !p.enabled && p.id !== providerId)
                              .map((p) => p.id);
                            setDefaultProvider(providerId);
                            if (typeof model === "string") setDefaultModel(model);
                            if (typeof effort === "string") setDefaultEffort(effort);
                            void saveProviderSettings(providerId, disabledIds, [], {
                              defaultModel: typeof model === "string" ? model : undefined,
                              defaultEffort: typeof effort === "string" ? effort : undefined,
                            });
                          }}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          General conversations and fallback runs use this provider/model/effort.
                        </p>
                      </div>

                      <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                        CLI Agents
                      </h4>
                      <div className="space-y-2">
                        {providers
                          .filter(isAgentProviderSelectable)
                          .map((provider) => {
                            const isReady = !!(provider.available && provider.authenticated);
                            const isInstalled = !!provider.available;
                            const isExpanded = expandedProvider === provider.id;
                            const setupSteps = buildProviderSetupSteps(provider.installSteps);
                            const statusColor = isReady ? "text-green-500" : isInstalled ? "text-amber-500" : "text-muted-foreground";
                            const statusText = isReady
                              ? provider.version || "Ready"
                              : isInstalled
                                ? "Installed but not logged in"
                                : "Not installed";
                            return (
                              <div
                                key={provider.id}
                                className="bg-card border border-border rounded-lg p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    {isReady ? (
                                      <CheckCircle className="h-4 w-4 text-green-500" />
                                    ) : isInstalled ? (
                                      <XCircle className="h-4 w-4 text-amber-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <div>
                                      <p className="text-[13px] font-medium">{provider.name}</p>
                                      <p className={cn("text-[11px]", statusColor)}>
                                        {statusText}
                                      </p>
                                      {(provider.usage?.totalCount ?? 0) > 0 && (
                                        <p className="text-[11px] text-muted-foreground">
                                          In use by {describeProviderUsage(provider)}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {setupSteps.length > 0 && (
                                      <button
                                        onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                                        className={cn(
                                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
                                          isExpanded ? "bg-muted" : ""
                                        )}
                                        title="Setup guide"
                                      >
                                        <Info className="size-3" />
                                        Guide
                                        <ChevronDown
                                          className="size-3 transition-transform duration-300"
                                          style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                                        />
                                      </button>
                                    )}
                                    <span className={cn(
                                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                                      provider.id === defaultProvider
                                        ? "bg-primary/10 text-primary"
                                        : provider.enabled
                                          ? "bg-emerald-500/10 text-emerald-500"
                                          : "bg-muted text-muted-foreground"
                                    )}>
                                      {provider.id === defaultProvider
                                        ? "Default"
                                        : provider.enabled
                                          ? "Enabled"
                                          : "Disabled"}
                                    </span>
                                    <button
                                      onClick={async () => {
                                        const nextDisabled = provider.enabled
                                          ? providers
                                              .filter((entry) => !entry.enabled || entry.id === provider.id)
                                              .map((entry) => entry.id)
                                          : providers
                                              .filter((entry) => !entry.enabled && entry.id !== provider.id)
                                              .map((entry) => entry.id);
                                        const enabledAfterToggle = providers.filter(
                                          (entry) => !nextDisabled.includes(entry.id) && isAgentProviderSelectable(entry)
                                        );
                                        const nextDefault =
                                          provider.id === defaultProvider && nextDisabled.includes(provider.id)
                                            ? enabledAfterToggle[0]?.id || defaultProvider
                                            : defaultProvider;
                                        const migrations =
                                          provider.enabled && (provider.usage?.totalCount ?? 0) > 0
                                            ? [{ fromProviderId: provider.id, toProviderId: nextDefault }]
                                            : [];

                                        if (provider.enabled && (provider.usage?.totalCount ?? 0) > 0) {
                                          const confirmed = await confirmDialog({
                                            title: `Disable ${provider.name}?`,
                                            message: `Migrate ${describeProviderUsage(provider)} to ${getProviderName(nextDefault)}.`,
                                            confirmText: "Disable and migrate",
                                            destructive: true,
                                          });
                                          if (!confirmed) return;
                                        }

                                        await saveProviderSettings(nextDefault, nextDisabled, migrations);
                                      }}
                                      disabled={savingProviders || (provider.id === defaultProvider && providers.filter((entry) => isAgentProviderSelectable(entry) && entry.enabled).length <= 1)}
                                      className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                                    >
                                      {provider.enabled ? "Disable" : "Enable"}
                                    </button>
                                  </div>
                                </div>

                                {/* Expandable setup guide */}
                                {setupSteps.length > 0 && (() => {
                                  const state = verifyState[provider.id] || { phase: "idle" };
                                  const result = state.phase === "done" ? state.result : null;
                                  const statusMeta = result ? VERIFY_STATUS_META[result.status] : null;
                                  const isOutputOpen = verifyOutputOpen[provider.id] ?? false;
                                  return (
                                    <div
                                      className="overflow-hidden transition-all duration-300 ease-in-out"
                                      style={{
                                        maxHeight: isExpanded ? 800 : 0,
                                        opacity: isExpanded ? 1 : 0,
                                      }}
                                    >
                                      <div className="rounded-lg bg-muted/50 p-3 space-y-3">
                                        {setupSteps.map((step, i) => {
                                          const isFailedStep =
                                            result?.status !== undefined &&
                                            result.status !== "pass" &&
                                            matchesFailedStep(step.title, result.failedStepTitle);
                                          const isPassStep =
                                            result?.status === "pass" &&
                                            /verify\s+setup/i.test(step.title);
                                          return (
                                            <div
                                              key={i}
                                              className={cn(
                                                "flex items-start gap-2.5 rounded-md p-1.5 transition-colors",
                                                isFailedStep && "bg-rose-500/5 ring-1 ring-rose-500/30",
                                                isPassStep && "bg-emerald-500/5 ring-1 ring-emerald-500/30"
                                              )}
                                            >
                                              <span
                                                className={cn(
                                                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5",
                                                  isFailedStep
                                                    ? "bg-rose-500 text-white"
                                                    : isPassStep
                                                      ? "bg-emerald-500 text-white"
                                                      : "bg-primary text-primary-foreground"
                                                )}
                                              >
                                                {isFailedStep ? "!" : isPassStep ? "✓" : i + 1}
                                              </span>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-medium">{step.title}</p>
                                                <p className="text-[11px] mt-0.5 text-muted-foreground">{step.detail}</p>
                                                {step.cmd && (
                                                  <TerminalCommand command={step.cmd} />
                                                )}
                                                {step.openTerminal && (
                                                  <button
                                                    onClick={() => {
                                                      fetch("/api/terminal/open", { method: "POST" }).catch(() => {
                                                        showError("Could not open terminal automatically. Open your system terminal manually.");
                                                      });
                                                    }}
                                                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 mt-1.5 text-[11px] font-medium transition-all hover:-translate-y-0.5"
                                                    style={{ background: "#1e1e1e", color: "#d4d4d4" }}
                                                  >
                                                    <Terminal className="size-3" />
                                                    Open terminal
                                                  </button>
                                                )}
                                                {step.link && (
                                                  <a
                                                    href={step.link.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-[11px] font-medium mt-1.5 text-primary hover:underline"
                                                  >
                                                    {step.link.label}
                                                    <ExternalLink className="size-3" />
                                                  </a>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
                                          <button
                                            onClick={() => void runVerify(provider.id)}
                                            disabled={state.phase === "running"}
                                            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                                          >
                                            {state.phase === "running" ? (
                                              <RefreshCw className="size-3 animate-spin" />
                                            ) : (
                                              <CheckCircle className="size-3" />
                                            )}
                                            {state.phase === "running"
                                              ? "Verifying…"
                                              : state.phase === "done"
                                                ? "Re-run verify"
                                                : "Run verify"}
                                          </button>
                                          {statusMeta && (
                                            <span
                                              className={cn(
                                                "text-[10px] px-2 py-0.5 rounded-full font-medium",
                                                statusMeta.tone
                                              )}
                                            >
                                              {statusMeta.label}
                                            </span>
                                          )}
                                          {result && result.status !== "pass" && result.failedStepTitle && (
                                            <span className="text-[11px] text-muted-foreground">
                                              Failed at step: <strong className="text-foreground">{result.failedStepTitle}</strong>
                                            </span>
                                          )}
                                          {state.phase === "error" && (
                                            <span className="text-[11px] text-rose-500">{state.message}</span>
                                          )}
                                          {result && (
                                            <button
                                              onClick={() =>
                                                setVerifyOutputOpen((prev) => ({
                                                  ...prev,
                                                  [provider.id]: !isOutputOpen,
                                                }))
                                              }
                                              className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                                            >
                                              <ChevronDown
                                                className="size-3 transition-transform"
                                                style={{ transform: isOutputOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                                              />
                                              {isOutputOpen ? "Hide raw output" : "Show raw output"}
                                            </button>
                                          )}
                                        </div>
                                        {result?.hint && result.status !== "pass" && (
                                          <p className="text-[11px] text-muted-foreground">{result.hint}</p>
                                        )}
                                        {result && isOutputOpen && (
                                          <div className="space-y-1.5">
                                            <p className="text-[10px] font-mono text-muted-foreground">
                                              $ {result.command}
                                            </p>
                                            <pre className="max-h-48 overflow-auto rounded bg-background p-2 text-[10px] font-mono text-foreground whitespace-pre-wrap">
                                              {(result.output || "(no stdout)") +
                                                (result.stderr ? `\n\n[stderr]\n${result.stderr}` : "")}
                                            </pre>
                                            <p className="text-[10px] text-muted-foreground">
                                              exit {result.exitCode ?? "-"} · {result.durationMs} ms
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                      </div>

                      {/* Re-check button */}
                      <button
                        onClick={() => void refresh()}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted disabled:opacity-50 mt-2"
                      >
                        <RefreshCw className={cn("size-3", loading && "animate-spin")} />
                        Re-check providers
                      </button>
                    </div>

                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                        API Agents
                      </h4>
                      <div className="space-y-2">
                        {[
                          { name: "Anthropic API", env: "ANTHROPIC_API_KEY", status: "Coming soon" },
                          { name: "OpenAI API", env: "OPENAI_API_KEY", status: "Coming soon" },
                          { name: "Google AI API", env: "GOOGLE_AI_API_KEY", status: "Coming soon" },
                        ].map((p) => (
                          <div
                            key={p.name}
                            className="flex items-center justify-between bg-card border border-border rounded-lg p-3 opacity-50"
                          >
                            <div className="flex items-center gap-3">
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-[13px] font-medium">{p.name}</p>
                                <p className="text-[11px] text-muted-foreground">{p.status}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </>
          )}

          {/* Skills Tab */}
          {tab === "skills" && <SkillsSettings />}

          {/* Integrations Tab */}
          {tab === "integrations" && (
            <div className="space-y-8">
              <ApiKeysSection />

              <section className="border-t border-border pt-6">
                <h3 className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
                  <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                  Connected integrations
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Prebuilt OAuth flows for services like Gmail, Slack, and Google
                  Calendar. Connect once and Cabinet handles tokens, scopes, and
                  refresh.
                </p>
                <div className="bg-card border border-dashed border-border rounded-lg px-4 py-6 text-center">
                  <span className="text-[12px] font-semibold">Coming soon</span>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    For now, set service-specific API tokens above and add MCP
                    servers in your CLI config.
                  </p>
                </div>
              </section>
            </div>
          )}

          {/* Notifications Tab */}
          {tab === "notifications" && (
            <div className="relative">
              {/* Blurred content preview */}
              <div className="pointer-events-none select-none blur-[2px] opacity-70" aria-hidden="true">
                <div>
                  <h3 className="text-[14px] font-semibold mb-1">Notification Channels</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Configure how you receive alerts when agents need your attention.
                  </p>
                  <div className="space-y-3">
                    {[
                      { icon: "🔔", name: "Browser Push", desc: "Instant alerts when Cabinet tab is open or PWA installed" },
                      { icon: "✈️", name: "Telegram", desc: "Instant mobile notifications via Telegram bot" },
                      { icon: "💬", name: "Slack Webhook", desc: "Forward alerts to your team's Slack channel" },
                      { icon: "📧", name: "Email Digest", desc: "Batched summary of alerts and agent activity" },
                    ].map((ch) => (
                      <div key={ch.name} className="bg-card border border-border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{ch.icon}</span>
                            <div>
                              <p className="text-[13px] font-medium">{ch.name}</p>
                              <p className="text-[11px] text-muted-foreground">{ch.desc}</p>
                            </div>
                          </div>
                          <div className="h-4 w-8 rounded-full bg-muted-foreground/30 relative">
                            <span className="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border pt-6 mt-6">
                  <h3 className="text-[14px] font-semibold mb-1">Alert Rules</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Notifications are triggered automatically for these events:
                  </p>
                  <div className="space-y-2">
                    {[
                      { event: "#alerts channel messages", desc: "Any agent posting to the alerts channel" },
                      { event: "@human mentions", desc: "When an agent mentions @human in any channel" },
                      { event: "Goal floor breached", desc: "A goal drops below its minimum threshold" },
                      { event: "Agent health degraded", desc: "3+ consecutive heartbeat failures" },
                    ].map((rule) => (
                      <div key={rule.event} className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2">
                        <div>
                          <p className="text-[12px] font-medium">{rule.event}</p>
                          <p className="text-[10px] text-muted-foreground/60">{rule.desc}</p>
                        </div>
                        <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">Always on</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Coming Soon overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 bg-background/80 backdrop-blur-sm rounded-xl px-8 py-6 border border-border shadow-lg">
                  <Bell className="h-6 w-6 text-muted-foreground/50" />
                  <span className="text-[13px] font-semibold">Coming Soon</span>
                  <p className="text-[12px] text-muted-foreground text-center max-w-[220px]">
                    Browser push, Telegram, Slack, and email notifications.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* About Tab */}
          {tab === "about" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[14px] font-semibold mb-1">Cabinet</h3>
                <p className="text-[12px] text-muted-foreground">
                  AI-first self-hosted knowledge base and startup OS.
                </p>
              </div>

              <div className="space-y-3 text-[13px]">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-mono">0.2.6</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Framework</span>
                  <span>Next.js (App Router)</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Storage</span>
                  <span className="font-mono text-[12px] truncate max-w-[300px]" title={dataDir}>{dataDir || "Local filesystem"}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">AI</span>
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Powered by local AI CLIs
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-[12px] text-muted-foreground">
                  All content lives as markdown files on disk. Humans define intent. Agents do the work. The knowledge base is the shared memory between both.
                </p>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="text-[14px] font-semibold mb-1">Privacy</h3>
                <p className="text-[12px] text-muted-foreground mb-3">
                  Cabinet sends anonymous usage telemetry to help us improve the
                  product. No file contents, paths, prompts, or secrets are collected.
                  <a
                    href="https://github.com/hilash/cabinet/blob/main/TELEMETRY.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 underline hover:text-foreground"
                  >
                    What&apos;s collected?
                  </a>
                </p>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 cursor-pointer hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={telemetryEnabled === true && !telemetryEnvDisabled}
                      disabled={telemetryEnabled === null || telemetrySaving || telemetryEnvDisabled}
                      onChange={(e) => toggleTelemetry(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <div>
                      <span className="text-[13px] font-medium">Anonymous usage telemetry</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {telemetryEnvDisabled
                          ? "Disabled by CABINET_TELEMETRY_DISABLED=1 (env var)."
                          : "Event counts, versions, and platform info only. Toggle off to stop sending."}
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="text-[14px] font-semibold mb-1 flex items-center gap-2">
                  <Cloud className="h-3.5 w-3.5" />
                  Cabinet Cloud
                </h3>
                <p className="text-[12px] text-muted-foreground mb-3">
                  Connect to your Cabinet from anywhere, while your AI team works 24/7
                  for you. Drop your email below and we&apos;ll let you know when
                  Cabinet Cloud opens up.
                </p>
                {cloudStatus === "success" || cloudStatus === "already" ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-[13px]">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      {cloudStatus === "already"
                        ? "You're already on the list — we'll be in touch."
                        : "You're on the list. We'll email you when Cabinet Cloud opens up."}
                    </span>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleCloudSubmit();
                    }}
                    className="flex flex-col gap-2 sm:flex-row"
                  >
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={cloudEmail}
                      onChange={(e) => handleCloudInput(e.target.value)}
                      disabled={cloudStatus === "submitting"}
                      className={cn(
                        "flex-1 h-10 text-[13px]",
                        cloudStatus === "error" && "border-destructive focus-visible:ring-destructive/30"
                      )}
                    />
                    <Button
                      type="submit"
                      disabled={cloudStatus === "submitting" || cloudEmail.trim().length === 0}
                      className="h-10 gap-2 px-4 text-[13px]"
                    >
                      {cloudStatus === "submitting" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Sending…
                        </>
                      ) : (
                        <>
                          Join waitlist
                          <ArrowRight className="h-3 w-3" />
                        </>
                      )}
                    </Button>
                  </form>
                )}
                {cloudStatus === "error" && (
                  <p className="mt-2 text-[11px] text-destructive">
                    Something went wrong. Check the email and try again.
                  </p>
                )}
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="text-[14px] font-semibold mb-1">Connect</h3>
                <p className="text-[12px] text-muted-foreground mb-3">
                  Get help, share feedback, or just say hi.
                </p>
                <div className="space-y-2">
                  <a
                    href="https://discord.gg/hJa5TRTbTH"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-[13px] font-medium hover:bg-primary/10 transition-colors"
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                    Join the Discord
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">Recommended</span>
                  </a>
                  <a
                    href="mailto:hi@runcabinet.com"
                    className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-[13px] text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    hi@runcabinet.com
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SkillsSettings() {
  // The full library lives in `src/components/skills/skill-library.tsx`.
  // Settings -> Skills is now the canonical surface (no separate /skills
  // route or sidebar entry — see docs/SKILLS_PLAN.md Wave 11).
  return <SkillLibrary />;
}

// Audit #082: 110+ avatars in a single grid was overwhelming. Defaults
// to the 12 silhouettes; a search field filters across all categories;
// "Browse all" toggles category tabs. Reused by ProfileTab.
function AvatarPicker({
  selectedId,
  onSelect,
  onClear,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [browseAll, setBrowseAll] = useState(false);
  const [tab, setTab] = useState<AvatarCategory>("silhouettes");

  const presetsByCategory = useMemo(() => {
    const map = new Map<AvatarCategory, AvatarPreset[]>();
    for (const cat of AVATAR_CATEGORY_ORDER) map.set(cat, []);
    for (const preset of AVATAR_PRESETS) {
      const cat = getAvatarCategory(preset);
      const list = map.get(cat);
      if (list) list.push(preset);
    }
    return map;
  }, []);

  const trimmed = query.trim().toLowerCase();
  const isSearching = trimmed.length > 0;

  const visiblePresets: AvatarPreset[] = useMemo(() => {
    if (isSearching) {
      return AVATAR_PRESETS.filter((p) =>
        p.label.toLowerCase().includes(trimmed),
      );
    }
    if (!browseAll) {
      return presetsByCategory.get("silhouettes") ?? [];
    }
    return presetsByCategory.get(tab) ?? [];
  }, [browseAll, isSearching, presetsByCategory, tab, trimmed]);

  const totalCount = AVATAR_PRESETS.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search avatars…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 max-w-xs text-[12px]"
        />
        {!isSearching && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-[11px]"
            onClick={() => setBrowseAll((v) => !v)}
          >
            {browseAll ? "Show favorites" : `Browse all (${totalCount})`}
          </Button>
        )}
      </div>

      {!isSearching && browseAll && (
        <div className="flex flex-wrap gap-1">
          {AVATAR_CATEGORY_ORDER.map((cat) => {
            const count = presetsByCategory.get(cat)?.length ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setTab(cat)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] transition-colors",
                  tab === cat
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {AVATAR_CATEGORY_LABEL[cat]}{" "}
                <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid max-h-64 grid-cols-8 gap-2 overflow-y-auto pr-1">
        <button
          type="button"
          onClick={onClear}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full border-2 bg-muted text-[10px] text-muted-foreground",
            !selectedId ? "border-foreground" : "border-transparent",
          )}
          title="Use icon instead"
        >
          None
        </button>
        {visiblePresets.map((preset) => {
          const selected = selectedId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset.id)}
              className={cn(
                "h-12 w-12 overflow-hidden rounded-full border-2 transition-all",
                selected ? "border-foreground" : "border-transparent",
              )}
              title={preset.label}
            >
              <Image
                src={preset.file}
                alt={preset.label}
                width={48}
                height={48}
                className="h-full w-full object-cover"
                unoptimized
              />
            </button>
          );
        })}
        {visiblePresets.length === 0 && (
          <p className="col-span-full px-2 py-3 text-[11px] text-muted-foreground">
            No avatars match &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}

// Audit #082: a flat ~120-icon grid was overwhelming. Add a search field
// and only render filtered results (or the first 24 if no query) so the
// section stays under one screen. Toggling the same key clears the field.
function IconPicker({
  selectedKey,
  onSelect,
}: {
  selectedKey: string;
  onSelect: (next: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const trimmed = query.trim().toLowerCase();
  const filtered: string[] = useMemo(() => {
    if (!trimmed) return ICON_PICKER_KEYS;
    return ICON_PICKER_KEYS.filter((k) => k.toLowerCase().includes(trimmed));
  }, [trimmed]);

  const visibleKeys: string[] = useMemo(() => {
    if (trimmed) return filtered;
    if (showAll) return filtered;
    return filtered.slice(0, 24);
  }, [filtered, showAll, trimmed]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search icons…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 max-w-xs text-[12px]"
        />
        {!trimmed && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-[11px]"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? "Show fewer"
              : `Browse all (${ICON_PICKER_KEYS.length})`}
          </Button>
        )}
      </div>
      <div className="grid max-h-40 grid-cols-10 gap-1 overflow-auto rounded-md border bg-background p-2">
        {visibleKeys.map((key) => {
          const Icon = getIconByKey(key);
          if (!Icon) return null;
          const selected = selectedKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(selected ? "" : key)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted",
                selected && "bg-accent text-accent-foreground",
              )}
              title={key}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
        {visibleKeys.length === 0 && (
          <p className="col-span-full px-1 py-2 text-[11px] text-muted-foreground">
            No icons match &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}

function hexFromPalette(i: number): string {
  const text = AGENT_PALETTE[i].text;
  const m = text.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return "";
  const [, r, g, b] = m;
  return (
    "#" +
    [r, g, b]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

function ProfileTab() {
  const state = useUserProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading profile…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        Failed to load profile: {state.error}
      </div>
    );
  }

  const { profile, workspace } = state.data;

  const update = (
    next: {
      profile?: Partial<typeof profile>;
      workspace?: Partial<typeof workspace>;
    }
  ) => {
    setUserProfileOptimistic(next);
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, workspace }),
      });
      if (res.ok) {
        await refreshUserProfile();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (file.size > 1024 * 1024) {
      alert("Avatar must be 1 MB or smaller.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/user/avatar", { method: "POST", body: fd });
    if (!res.ok) {
      alert("Upload failed.");
      return;
    }
    await refreshUserProfile();
  }

  async function removeAvatar() {
    if (profile.avatar === "custom") {
      await fetch("/api/user/avatar", { method: "DELETE" });
    } else {
      update({ profile: { avatar: "", avatarExt: "" } });
    }
    await refreshUserProfile();
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 text-[13px] font-semibold">Profile</h3>
        <p className="mb-4 text-[12px] text-muted-foreground">
          How you appear in conversations and across the app.
        </p>

        <div className="mb-4 flex items-center gap-3 rounded-md border bg-muted/30 p-3">
          <UserAvatar profile={profile} size="lg" shape="circle" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {profile.displayName?.trim() || profile.name || "You"}
            </span>
            {profile.role ? (
              <span className="truncate text-xs text-muted-foreground">
                {profile.role}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <Field label="Name">
            <Input
              value={profile.name}
              onChange={(e) => update({ profile: { name: e.target.value } })}
              placeholder="Hila"
              maxLength={60}
            />
          </Field>
          <Field label="Display name" hint="Shown in conversations. Defaults to Name.">
            <Input
              value={profile.displayName || ""}
              onChange={(e) =>
                update({ profile: { displayName: e.target.value } })
              }
              placeholder={profile.name}
              maxLength={60}
            />
          </Field>
          <Field label="Role">
            <Input
              value={profile.role || ""}
              onChange={(e) => update({ profile: { role: e.target.value } })}
              placeholder="Builder"
              maxLength={80}
            />
          </Field>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-[12px] font-semibold">Avatar</h4>
        <AvatarPicker
          selectedId={profile.avatar}
          onSelect={(id) => update({ profile: { avatar: id, avatarExt: "" } })}
          onClear={() => void removeAvatar()}
        />
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadAvatar(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Upload custom
          </Button>
          {profile.avatar === "custom" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void removeAvatar()}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-[12px] font-semibold">Accent color</h4>
        <div className="flex flex-wrap items-center gap-2">
          {AGENT_PALETTE.map((_, i) => {
            const hex = hexFromPalette(i);
            const selected =
              (profile.color || "").toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                type="button"
                onClick={() =>
                  update({
                    profile: { color: selected ? "" : hex },
                  })
                }
                className={cn(
                  "h-6 w-6 rounded-full border-2 transition-all",
                  selected
                    ? "border-foreground scale-110"
                    : "border-transparent"
                )}
                style={{ backgroundColor: hex }}
                title={hex}
              />
            );
          })}
          <Input
            type="text"
            placeholder="#hex"
            value={profile.color || ""}
            onChange={(e) => update({ profile: { color: e.target.value } })}
            className="ml-2 h-8 w-24 text-xs"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Tints the fallback avatar when no image is set.
        </p>
      </div>

      <div>
        <h4 className="mb-2 text-[12px] font-semibold">Fallback icon</h4>
        <IconPicker
          selectedKey={profile.iconKey || ""}
          onSelect={(key) => update({ profile: { iconKey: key } })}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Used when no avatar image is set. Click again to clear.
        </p>
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="mb-1 text-[13px] font-semibold">Workspace</h3>
        <p className="mb-4 text-[12px] text-muted-foreground">
          Captured during onboarding. Agents read these when planning work.
        </p>
        <div className="space-y-3">
          <Field label="Workspace name">
            <Input
              value={workspace.workspaceName || ""}
              onChange={(e) =>
                update({ workspace: { workspaceName: e.target.value } })
              }
              placeholder="My Cabinet"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={workspace.description || ""}
              onChange={(e) =>
                update({ workspace: { description: e.target.value } })
              }
              className="min-h-[72px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="What do you do?"
            />
          </Field>
          <Field label="Team size">
            <Input
              value={workspace.teamSize || ""}
              onChange={(e) =>
                update({ workspace: { teamSize: e.target.value } })
              }
              placeholder="Solo / 2–5 / 6–20 / 20+"
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-4">
        <Button onClick={() => void save()} disabled={saving} size="sm">
          {saving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          {saving ? "Saving…" : "Save"}
        </Button>
        {saved ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      {children}
      {hint ? (
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

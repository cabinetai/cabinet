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
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SkillLibrary } from "@/components/skills/skill-library";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { DataLocationsSection } from "@/components/settings/data-locations-section";
import { UninstallSection } from "@/components/settings/uninstall-section";
import { CliMcpSection } from "@/components/settings/cli-mcp-section";
import { IntegrationsHubSection } from "@/components/settings/integrations-hub-section";
import { BuiltInToolsSection } from "@/components/settings/built-in-tools-section";
import { UpdateSummary } from "@/components/system/update-summary";
import { useCabinetUpdate } from "@/hooks/use-cabinet-update";
import { useTheme } from "@/components/theme-provider";
import {
  THEMES,
  applyTheme,
  getStoredThemeName,
  storeThemeName,
  getStoredThemeMode,
  storeThemeMode,
  getStoredThemePair,
  storeThemePair,
  findThemeByName,
  type ThemeDefinition,
  type ThemeMode,
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
import { ICON_PICKER_KEYS, getIconByKey, friendlyIconName } from "@/lib/agents/icon-catalog";
import { AGENT_PALETTE } from "@/lib/themes";
import { StorageBackendSection } from "@/components/settings/storage-backend-section";
import { version as pkgVersion } from "../../../package.json";
import releaseJson from "../../../cabinet-release.json";
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
import { useLocale } from "@/i18n/use-locale";
import {
  REQUESTABLE_LOCALES,
  SUPPORTED_LOCALES,
  LOCALE_LABELS,
  localeToDir,
  type Locale,
} from "@/i18n";
import { submitLanguageRequest } from "@/lib/telemetry/language-request-client";

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
  const { t } = useLocale();
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
        title={t("settings:common.copyToClipboard")}
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

function LanguageSection() {
  const { locale, setLocale, t } = useLocale();
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requested, setRequested] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(REQUESTED_LOCALES_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  // Derived from the locale registry so adding a locale in src/i18n/index.ts
  // surfaces it here automatically — native labels (own script), correct dir.
  const supported: { value: Locale; label: string; dir: "ltr" | "rtl" }[] =
    SUPPORTED_LOCALES.map((value) => ({
      value,
      label: LOCALE_LABELS[value],
      dir: localeToDir(value),
    }));

  const requestLanguage = async (code: string, label: string) => {
    if (requesting === code || requested.has(code)) return;
    setRequesting(code);
    const result = await submitLanguageRequest({
      requestedLocale: code,
      localeLabel: label,
      currentLocale: locale,
      appVersion: pkgVersion,
    });
    setRequesting(null);
    if (result.ok) {
      const next = new Set(requested);
      next.add(code);
      setRequested(next);
      try {
        window.localStorage.setItem(
          REQUESTED_LOCALES_KEY,
          JSON.stringify([...next]),
        );
      } catch {
        /* ignore localStorage failures */
      }
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: {
            kind: "success",
            message: t("settings:language.requestSubmitted", { language: label }),
          },
        }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: {
            kind: "error",
            message: t("settings:language.requestFailed"),
          },
        }),
      );
    }
  };

  return (
    <div>
      <h3 className="text-[13px] font-semibold mb-1">{t("settings:language.title")}</h3>
      <p className="text-[12px] text-muted-foreground mb-4">
        {t("settings:language.description")}
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1">
        {supported.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLocale(opt.value)}
            dir={opt.dir}
            title={opt.dir === "rtl" ? "RTL ←" : undefined}
            className={cn(
              "rounded border px-1.5 py-1 text-[11px] leading-tight text-start truncate transition-colors",
              locale === opt.value
                ? "border-primary bg-primary/5 ring-1 ring-primary/20 text-foreground"
                : "border-border text-muted-foreground/70 hover:border-primary/30 hover:text-foreground hover:bg-accent/40",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between mb-1.5">
          <h4 className="text-[12px] font-semibold text-muted-foreground">
            {t("settings:language.moreLanguages")}
          </h4>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
            {t("settings:language.comingSoon")}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/80 mb-3">
          {t("settings:language.moreLanguagesHint")}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1">
          {REQUESTABLE_LOCALES.map((opt) => {
            const isRequesting = requesting === opt.code;
            const isRequested = requested.has(opt.code);
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => requestLanguage(opt.code, opt.label)}
                disabled={isRequesting || isRequested}
                title={isRequested
                  ? t("settings:language.requestSubmitted", { language: opt.label })
                  : opt.englishName}
                dir={opt.dir}
                className={cn(
                  "rounded border border-dashed px-1.5 py-1 text-[11px] leading-tight text-start truncate transition-colors",
                  "border-border/60 text-muted-foreground/70",
                  isRequested
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 cursor-default"
                    : isRequesting
                    ? "opacity-60 cursor-wait"
                    : "hover:border-primary/30 hover:text-foreground hover:bg-accent/40 cursor-pointer",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const REQUESTED_LOCALES_KEY = "cabinet-requested-locales";

export function SettingsPage() {
  const { t } = useLocale();
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
  // Audit #045: theme mode state.
  const [themeMode, setThemeModeState] = useState<ThemeMode>("manual");
  const [themePair, setThemePairState] = useState<{ light: string; dark: string }>({
    light: "paper",
    dark: "claude",
  });
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
    // Audit #045: hydrate match-system state.
    setThemeModeState(getStoredThemeMode());
    setThemePairState(getStoredThemePair());
  }, []);

  // Audit #045: applying a theme via the manual grid disables match-system,
  // since the user has explicitly picked one. The pair stays stored so
  // toggling system back on later picks up where they left off.
  const setThemeModeAndApply = useCallback(
    (nextMode: ThemeMode, nextPair?: { light?: string; dark?: string }) => {
      setThemeModeState(nextMode);
      storeThemeMode(nextMode);
      if (nextPair) {
        setThemePairState((prev) => ({
          light: nextPair.light ?? prev.light,
          dark: nextPair.dark ?? prev.dark,
        }));
        storeThemePair(nextPair);
      }
      if (nextMode === "system") {
        const pair = nextPair
          ? { ...themePair, ...nextPair }
          : themePair;
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const target = findThemeByName(isDark ? pair.dark : pair.light);
        if (target) {
          applyTheme(target);
          setActiveThemeName(target.name);
          storeThemeName(target.name);
          setNextTheme(target.type as "light" | "dark");
        }
      }
    },
    [themePair, setNextTheme]
  );

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
    // Audit #045: picking a manual theme disables system mode.
    if (themeMode === "system") {
      setThemeModeState("manual");
      storeThemeMode("manual");
    }
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

  // Audit #040: 9 horizontal tabs broke the visual rhythm; switched to a
  // vertical rail (~200px) with three semantic groups. macOS Settings,
  // Linear Settings, GitHub Settings, all do this for >5 categories.
  const tabGroups: {
    label: string;
    items: { id: Tab; label: string; icon: React.ReactNode }[];
  }[] = [
    {
      label: t("settings:page.groupYou"),
      items: [
        { id: "profile", label: t("settings:tabs.profile"), icon: <CircleUser className="h-3.5 w-3.5" /> },
        { id: "notifications", label: t("settings:tabs.notifications"), icon: <Bell className="h-3.5 w-3.5" /> },
        { id: "appearance", label: t("settings:tabs.appearance"), icon: <Palette className="h-3.5 w-3.5" /> },
      ],
    },
    {
      label: t("settings:page.groupWorkspace"),
      items: [
        { id: "providers", label: t("settings:tabs.providers"), icon: <Cpu className="h-3.5 w-3.5" /> },
        { id: "skills", label: t("settings:tabs.skills"), icon: <Sparkles className="h-3.5 w-3.5" /> },
        { id: "storage", label: t("settings:tabs.storage"), icon: <HardDrive className="h-3.5 w-3.5" /> },
        { id: "integrations", label: t("settings:tabs.integrations"), icon: <Plug className="h-3.5 w-3.5" /> },
      ],
    },
    {
      label: t("settings:page.groupApp"),
      items: [
        { id: "updates", label: t("settings:tabs.updates"), icon: <CloudDownload className="h-3.5 w-3.5" /> },
        { id: "about", label: t("settings:tabs.about"), icon: <Info className="h-3.5 w-3.5" /> },
      ],
    },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border transition-[padding] duration-200"
        style={{ paddingLeft: `calc(1rem + var(--sidebar-toggle-offset, 0px))` }}
      >
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          {/*
           * Audit #059: Settings is the page topic, so its top heading
           * should be H1, not H2. Visual size kept identical via Tailwind.
           */}
          <h1 className="text-[15px] font-semibold tracking-[-0.02em]">
            {t("settings:page.title")}
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
<Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-[12px]"
            onClick={() => { refresh(); loadConfig(); }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("settings:page.refresh")}
          </Button>
        </div>
      </div>

      {/* Audit #040: vertical sidebar instead of a 9-tab horizontal strip. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav
          aria-label={t("settings:common.categoriesAriaLabel")}
          className="hidden w-[212px] shrink-0 flex-col gap-3 border-e border-border bg-muted/10 px-2 py-3 md:flex"
        >
          {tabGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </div>
              {group.items.map((t) => (
                <a
                  key={t.id}
                  href={`#/settings/${t.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setTab(t.id);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors no-underline",
                    tab === t.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  {t.icon}
                  {t.label}
                </a>
              ))}
            </div>
          ))}
        </nav>

        {/* On narrow viewports the rail collapses; expose the tabs as a
            compact horizontal row at the top of the content pane. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-1.5 md:hidden">
            {tabGroups.flatMap((g) => g.items).map((t) => (
              <a
                key={t.id}
                href={`#/settings/${t.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setTab(t.id);
                }}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors no-underline",
                  tab === t.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {t.icon}
                {t.label}
              </a>
            ))}
          </div>

          <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className={cn("p-4 space-y-6", tab !== "skills" && "max-w-2xl")}>
          {/* Profile Tab */}
          {tab === "profile" && <ProfileTab />}

          {/* Appearance Tab */}
          {tab === "appearance" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[13px] font-semibold mb-1">{t("settings:appearance.theme")}</h3>
                <p className="text-[12px] text-muted-foreground mb-4">
                  {t("settings:appearance.themeDescription")}
                </p>

                <div className="space-y-4">
                  {/* Audit #045: Match system pair card sits at the top of
                      the picker. When enabled, Cabinet listens to OS
                      prefers-color-scheme and applies the chosen light or
                      dark variant; the manual grids below dim out so the
                      user understands they're inactive. */}
                  <div
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      themeMode === "system"
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <div
                          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-foreground"
                          aria-hidden="true"
                        >
                          <span className="text-[11px]">☀ 🌙</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[13px] font-semibold">
                            {t("settings:appearance.matchSystem")}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {t("settings:appearance.matchSystemDescription")}
                          </span>
                        </div>
                      </div>
                      <label className="inline-flex items-center gap-2">
                        <span className="sr-only">{t("settings:appearance.matchSystem")}</span>
                        <input
                          type="checkbox"
                          checked={themeMode === "system"}
                          onChange={(e) =>
                            setThemeModeAndApply(
                              e.target.checked ? "system" : "manual"
                            )
                          }
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                      </label>
                    </div>
                    {themeMode === "system" && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-[11px]">
                          <span className="font-medium text-muted-foreground">
                            {t("settings:appearance.lightVariant")}
                          </span>
                          <select
                            value={themePair.light}
                            onChange={(e) =>
                              setThemeModeAndApply("system", {
                                light: e.target.value,
                              })
                            }
                            className="rounded-md border border-border bg-background px-2 py-1 text-[12px]"
                          >
                            {THEMES.filter((t) => t.type === "light").map((t) => (
                              <option key={t.name} value={t.name}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-[11px]">
                          <span className="font-medium text-muted-foreground">
                            {t("settings:appearance.darkVariant")}
                          </span>
                          <select
                            value={themePair.dark}
                            onChange={(e) =>
                              setThemeModeAndApply("system", {
                                dark: e.target.value,
                              })
                            }
                            className="rounded-md border border-border bg-background px-2 py-1 text-[12px]"
                          >
                            {THEMES.filter((t) => t.type === "dark").map((t) => (
                              <option key={t.name} value={t.name}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-2">{t("settings:appearance.lightThemes")}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {lightThemes.map((t) => (
                        <button
                          key={t.name}
                          onClick={() => selectTheme(t)}
                          title={`Apply ${t.label} theme`}
                          className={cn(
                            "flex flex-col gap-2 rounded-lg border p-2 text-left transition-all",
                            activeThemeName === t.name
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border hover:border-primary/30"
                          )}
                        >
                          <ThemeThumbnail theme={t} />
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full shrink-0 border border-[#00000015]"
                              style={{ backgroundColor: t.accent }}
                            />
                            <span
                              className={cn(
                                "truncate text-[12px]",
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
                              <Check className="h-3 w-3 text-primary ms-auto shrink-0" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-2">{t("settings:appearance.darkThemes")}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {darkThemes.map((t) => (
                        <button
                          key={t.name}
                          onClick={() => selectTheme(t)}
                          title={`Apply ${t.label} theme`}
                          className={cn(
                            "flex flex-col gap-2 rounded-lg border p-2 text-left transition-all",
                            activeThemeName === t.name
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border hover:border-primary/30"
                          )}
                        >
                          <ThemeThumbnail theme={t} />
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full shrink-0 border border-[#ffffff20]"
                              style={{ backgroundColor: t.accent }}
                            />
                            <span
                              className="truncate text-[12px] font-medium"
                              style={{ fontFamily: t.headingFont || t.font }}
                            >
                              {t.label}
                            </span>
                            {activeThemeName === t.name && (
                              <Check className="h-3 w-3 text-primary ms-auto shrink-0" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="text-[13px] font-semibold mb-1">{t("settings:appearance.sidebar")}</h3>
                <p className="text-[12px] text-muted-foreground mb-4">
                  {t("settings:appearance.sidebarDescription")}
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
                      <span className="text-[13px] font-medium">{t("settings:appearance.showHiddenFiles")}</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {t("settings:appearance.showHiddenFilesHint")}
                      </p>
                    </div>
                  </div>
                  {/*
                   * Audit #043: macOS convention concatenates modifier glyphs
                   * with no separator (⌘⇧.); Windows/Linux uses Ctrl+Shift+. .
                   */}
                  <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {typeof navigator !== "undefined" && /Mac/.test(navigator.platform)
                      ? "⌘⇧."
                      : "Ctrl+Shift+."}
                  </kbd>
                </label>
              </div>

              <div className="border-t border-border pt-6">
                <LanguageSection />
              </div>
            </div>
          )}

          {/* Storage Tab */}
          {tab === "storage" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[14px] font-semibold mb-1">{t("settings:storage.dataDirectory")}</h3>
                <p className="text-[12px] text-muted-foreground">
                  {t("settings:storage.dataDirectoryDescription")}
                </p>
              </div>

              {dataDirRestartNeeded && (
                <div className="flex items-center gap-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
                  <RotateCw className="h-4 w-4 shrink-0 text-yellow-500" />
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-yellow-500">{t("settings:storage.restartRequired")}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {t("settings:storage.restartHint")}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[12px] font-medium text-muted-foreground">
                  {t("settings:storage.currentPath")}
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 bg-muted/30">
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 font-mono text-[12px] truncate select-all">
                    {dataDir || t("settings:storage.loadingPath")}
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
                  {t("settings:storage.changeDirectory")}
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("settings:storage.directoryPlaceholder")}
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
                    {t("settings:storage.browse")}
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
                          showError(data?.error || t("settings:storage.failedToSave"));
                          return;
                        }
                        setDataDirRestartNeeded(true);
                        setDataDirPending(null);
                      } catch {
                        showError(t("settings:storage.failedToSaveDir"));
                      } finally {
                        setDataDirSaving(false);
                      }
                    }}
                  >
                    {dataDirSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin me-1.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5 me-1.5" />
                    )}
                    {t("settings:storage.save")}
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
                      <ExternalLink className="h-3.5 w-3.5 me-1.5" />
                      {t("settings:storage.openInFinder")}
                    </Button>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-[12px] text-muted-foreground">
                  {t("settings:storage.envVarHint1")}<code className="px-1 py-0.5 rounded bg-muted text-[11px]">CABINET_DATA_DIR</code>{t("settings:storage.envVarHint2")}
                </p>
              </div>

              <StorageBackendSection />

              <div className="border-t border-border pt-6">
                <DataLocationsSection />
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
            <p className="text-[13px] text-muted-foreground">{t("settings:updates.checking")}</p>
          )}

          {/* Providers Tab */}
          {tab === "providers" && (
            <>
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[14px] font-semibold">{t("settings:providers.title")}</h3>
                  <a
                    href="/providers-demo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <Stethoscope className="h-3 w-3" />
                    {t("settings:providers.troubleshoot")}
                  </a>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  {t("settings:providers.subtitle")}
                </p>

                {loading ? (
                  <p className="text-[13px] text-muted-foreground">{t("settings:common.loading")}</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="mb-3 rounded-lg border border-border bg-card p-3 space-y-2">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t("settings:providers.defaultRuntime")}
                        </label>
                        <RuntimeSelectionBanner
                          providers={providers}
                          value={{
                            providerId: defaultProvider || null,
                            model: defaultModel || null,
                            effort: defaultEffort || null,
                          }}
                          label={t("settings:providers.defaultModel")}
                        />
                        <RuntimeMatrixPicker
                          providers={providers}
                          value={{
                            providerId: defaultProvider || null,
                            model: defaultModel || null,
                            effort: defaultEffort || null,
                          }}
                          includeUnavailable
                          emptyText={t("settings:providers.emptyMatrix")}
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
                          {t("settings:providers.defaultRuntimeHint")}
                        </p>
                      </div>

                      <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                        {t("settings:providers.cliAgents")}
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
                              ? provider.version || t("settings:providers.ready")
                              : isInstalled
                                ? t("settings:providers.installedNotLoggedIn")
                                : t("settings:providers.notInstalled");
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
                                        title={t("settings:providers.setupGuide")}
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
                                              className="ms-auto inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
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

              {/* Integrations + Built-in tools — coming soon (blurred preview) */}
              <div className="relative">
                <div className="pointer-events-none select-none blur-[2px] opacity-70 space-y-8" aria-hidden="true">
                  <IntegrationsHubSection />
                  <BuiltInToolsSection />
                </div>

                {/* Coming Soon overlay */}
                <div className="absolute inset-0 flex items-start justify-center pt-10">
                  <div className="flex flex-col items-center gap-2 bg-background/80 backdrop-blur-sm rounded-xl px-8 py-6 border border-border shadow-lg">
                    <Plug className="h-6 w-6 text-muted-foreground/50" />
                    <span className="text-[13px] font-semibold">{t("settings:integrationsPreview.comingSoon")}</span>
                    <p className="text-[12px] text-muted-foreground text-center max-w-[220px]">
                      {t("settings:integrationsPreview.hint")}
                    </p>
                  </div>
                </div>
              </div>

              <CliMcpSection />
            </div>
          )}

          {/* Notifications Tab */}
          {tab === "notifications" && (
            <div className="relative">
              {/* Blurred content preview */}
              <div className="pointer-events-none select-none blur-[2px] opacity-70" aria-hidden="true">
                <div>
                  <h3 className="text-[14px] font-semibold mb-1">{t("settings:notifications.channels")}</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    {t("settings:notifications.channelsHint")}
                  </p>
                  <div className="space-y-3">
                    {[
                      { icon: "🔔", name: t("settings:notifications.channelPushName"), desc: t("settings:notifications.channelPushDesc") },
                      { icon: "✈️", name: t("settings:notifications.channelTelegramName"), desc: t("settings:notifications.channelTelegramDesc") },
                      { icon: "💬", name: t("settings:notifications.channelSlackName"), desc: t("settings:notifications.channelSlackDesc") },
                      { icon: "📧", name: t("settings:notifications.channelEmailName"), desc: t("settings:notifications.channelEmailDesc") },
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
                            <span className="absolute top-0.5 start-0.5 h-3 w-3 rounded-full bg-white" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border pt-6 mt-6">
                  <h3 className="text-[14px] font-semibold mb-1">{t("settings:notifications.alertRules")}</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    {t("settings:notifications.rulesHint")}
                  </p>
                  <div className="space-y-2">
                    {[
                      { event: t("settings:notifications.ruleAlertsEvent"), desc: t("settings:notifications.ruleAlertsDesc") },
                      { event: t("settings:notifications.ruleMentionsEvent"), desc: t("settings:notifications.ruleMentionsDesc") },
                      { event: t("settings:notifications.ruleFloorEvent"), desc: t("settings:notifications.ruleFloorDesc") },
                      { event: t("settings:notifications.ruleHealthEvent"), desc: t("settings:notifications.ruleHealthDesc") },
                    ].map((rule) => (
                      <div key={rule.event} className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2">
                        <div>
                          <p className="text-[12px] font-medium">{rule.event}</p>
                          <p className="text-[10px] text-muted-foreground/60">{rule.desc}</p>
                        </div>
                        <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">{t("settings:notifications.alwaysOn")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Coming Soon overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 bg-background/80 backdrop-blur-sm rounded-xl px-8 py-6 border border-border shadow-lg">
                  <Bell className="h-6 w-6 text-muted-foreground/50" />
                  <span className="text-[13px] font-semibold">{t("settings:notifications.comingSoon")}</span>
                  <p className="text-[12px] text-muted-foreground text-center max-w-[220px]">
                    {t("settings:notifications.previewHint")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* About Tab */}
          {tab === "about" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[14px] font-semibold mb-1">{t("settings:about.cabinet")}</h3>
                <p className="text-[12px] text-muted-foreground">
                  {t("settings:about.tagline")}
                </p>
              </div>

              <div className="space-y-3 text-[13px]">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">{t("settings:about.version")}</span>
                  <span className="font-mono">{pkgVersion}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">{t("settings:about.release")}</span>
                  <span className="font-mono text-[12px] text-muted-foreground">
                    {releaseJson.version}
                    {releaseJson.channel !== "stable" && (
                      <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px]">{releaseJson.channel}</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">{t("settings:about.framework")}</span>
                  <span>{t("settings:about.frameworkValue")}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">{t("settings:about.storage")}</span>
                  <span className="font-mono text-[12px] truncate max-w-[300px]" title={dataDir}>{dataDir || t("settings:about.storageValue")}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">{t("settings:about.aiLabel")}</span>
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("settings:about.aiValue")}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-[12px] text-muted-foreground">
                  {t("settings:about.philosophy")}
                </p>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="text-[14px] font-semibold mb-1">{t("settings:about.privacy")}</h3>
                <p className="text-[12px] text-muted-foreground mb-3">
                  {t("settings:about.privacyBody")}
                  <a
                    href="https://github.com/hilash/cabinet/blob/main/TELEMETRY.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 underline hover:text-foreground"
                  >
                    {t("settings:about.privacyLink")}
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
                      <span className="text-[13px] font-medium">{t("settings:about.telemetry")}</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {telemetryEnvDisabled
                          ? t("settings:about.telemetryEnvDisabled")
                          : t("settings:about.telemetryHint")}
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="text-[14px] font-semibold mb-1 flex items-center gap-2">
                  <Cloud className="h-3.5 w-3.5" />
                  {t("settings:about.cabinetCloud")}
                </h3>
                <p className="text-[12px] text-muted-foreground mb-3">
                  {t("settings:about.cloudBody")}
                </p>
                {cloudStatus === "success" || cloudStatus === "already" ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-[13px]">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      {cloudStatus === "already"
                        ? t("settings:about.cloudAlready")
                        : t("settings:about.cloudSuccess")}
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
                      placeholder={t("settings:notifications.emailPlaceholder")}
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
                          {t("settings:about.cloudSending")}
                        </>
                      ) : (
                        <>
                          {t("settings:about.cloudJoinWaitlist")}
                          <ArrowRight className="h-3 w-3" />
                        </>
                      )}
                    </Button>
                  </form>
                )}
                {cloudStatus === "error" && (
                  <p className="mt-2 text-[11px] text-destructive">
                    {t("settings:about.cloudError")}
                  </p>
                )}
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="text-[14px] font-semibold mb-1">{t("settings:about.connectTitle")}</h3>
                <p className="text-[12px] text-muted-foreground mb-3">
                  {t("settings:about.connectBody")}
                </p>
                <div className="space-y-2">
                  <a
                    href="https://discord.gg/hJa5TRTbTH"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-[13px] font-medium hover:bg-primary/10 transition-colors"
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                    {t("settings:about.joinDiscord")}
                    <span className="ms-auto text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{t("settings:common.recommended")}</span>
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

              <UninstallSection />
            </div>
          )}
        </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// Audit #042: theme picker now renders a miniature surface in each card
// using the theme's actual CSS custom properties. Cheap to do — themes ship
// the same `--background` / `--card` / `--primary` / `--sidebar-*` vars the
// real app uses. The thumbnail mirrors the screenshot the audit asked for:
// faux sidebar (with cabinet + page rows), a heading line, a primary button,
// and a status-bar accent stripe.
function ThemeThumbnail({ theme }: { theme: ThemeDefinition }) {
  // Wrapper div carries all the theme's tokens. Inside, the mini-UI uses
  // those tokens via var(--…).
  const style = theme.vars as React.CSSProperties;
  const headingFont = theme.headingFont || theme.font || "inherit";
  const bodyFont = theme.font || "inherit";
  return (
    <div
      style={style}
      className="pointer-events-none relative h-[70px] w-full overflow-hidden rounded-md border border-[color:var(--border)]"
      aria-hidden="true"
    >
      <div
        className="flex h-full w-full"
        style={{
          background: "var(--background)",
          color: "var(--foreground)",
        }}
      >
        {/* Mini sidebar */}
        <div
          className="flex h-full w-[28%] flex-col gap-0.5 border-e p-1"
          style={{
            background: "var(--sidebar)",
            color: "var(--sidebar-foreground)",
            borderColor: "var(--sidebar-border)",
          }}
        >
          <div
            className="h-1.5 w-3/4 rounded"
            style={{ background: "var(--sidebar-primary)" }}
          />
          <div
            className="h-1 w-2/3 rounded opacity-60"
            style={{ background: "var(--sidebar-accent)" }}
          />
          <div
            className="h-1 w-1/2 rounded opacity-60"
            style={{ background: "var(--sidebar-accent)" }}
          />
        </div>
        {/* Mini main pane */}
        <div className="flex h-full flex-1 flex-col gap-1 p-1.5">
          <div
            className="h-2 w-3/4 rounded"
            style={{ background: "var(--foreground)", opacity: 0.85, fontFamily: headingFont }}
          />
          <div
            className="h-1 w-1/2 rounded"
            style={{ background: "var(--muted-foreground)", opacity: 0.6 }}
          />
          <div className="mt-auto flex items-center gap-1">
            <div
              className="h-2.5 w-8 rounded"
              style={{ background: "var(--primary)" }}
            />
            <div
              className="h-1.5 w-6 rounded"
              style={{
                background: "var(--secondary)",
                color: "var(--secondary-foreground)",
              }}
            />
          </div>
        </div>
      </div>
      {/* Accent stripe along the bottom */}
      <div
        className="absolute bottom-0 left-0 h-0.5 w-full"
        style={{ background: "var(--ring)" }}
      />
      <span className="sr-only" style={{ fontFamily: bodyFont }}>
        {theme.label}
      </span>
    </div>
  );
}

function SkillsSettings() {
  // The full library lives in `src/components/skills/skill-library.tsx`.
  // Settings -> Skills is now the canonical surface (no separate /skills
  // route or sidebar entry; see docs/SKILLS_PLAN.md Wave 11).
  return (
    <div className="flex gap-6 items-start">
      <div className="flex-1 min-w-0 max-w-3xl">
        <SkillLibrary />
      </div>
      <aside className="hidden lg:flex w-80 shrink-0 flex-col gap-3 rounded-lg border border-border bg-muted/30 p-5 text-[12px] leading-relaxed text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
          <h3 className="text-[13px] font-semibold text-foreground">
            Skills are serious business.
          </h3>
        </div>
        <p>
          Cabinet&apos;s philosophy is to connect you to the world — safely. A
          skill runs real code on your computer, so treat each one like you
          would any app you install: read what it does before you trust it.
        </p>
        <p>
          We&apos;re working on a curated collection of skills and integrations,
          vetted by a team of ex-Apple engineers and security experts. Until
          that ships, our advice is simple: don&apos;t install everything you
          find on the internet. Stick to skills from sources you recognize, and
          skim the skill&apos;s instructions before running it.
        </p>
        <p className="border-t border-border pt-3">
          Questions? Join us on{" "}
          <a
            href="https://discord.gg/hJa5TRTbTH"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 hover:text-primary"
          >
            Discord
          </a>
          .
        </p>
      </aside>
    </div>
  );
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
  const { t } = useLocale();
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
          placeholder={t("settings:profile.searchAvatars")}
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
            {browseAll ? t("settings:profile.showFavorites") : t("settings:profile.browseAll", { count: totalCount })}
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
          title={t("settings:profile.useIconInstead")}
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
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const trimmed = query.trim().toLowerCase();
  const filtered: string[] = useMemo(() => {
    if (!trimmed) return ICON_PICKER_KEYS;
    // Audit #041: search the friendly label too — typing "shield" should
    // find "ShieldCheck", typing "bar chart" should find "BarChart3".
    return ICON_PICKER_KEYS.filter((k) => {
      const friendly = friendlyIconName(k).toLowerCase();
      return (
        k.toLowerCase().includes(trimmed) || friendly.includes(trimmed)
      );
    });
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
          placeholder={t("settings:profile.searchIcons")}
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
              ? t("settings:profile.showFewer")
              : t("settings:profile.browseAll", { count: ICON_PICKER_KEYS.length })}
          </Button>
        )}
      </div>
      <div className="grid max-h-40 grid-cols-10 gap-1 overflow-auto rounded-md border bg-background p-2">
        {visibleKeys.map((key) => {
          const Icon = getIconByKey(key);
          if (!Icon) return null;
          const selected = selectedKey === key;
          const label = friendlyIconName(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(selected ? "" : key)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted",
                selected && "bg-accent text-accent-foreground",
              )}
              title={label}
              aria-label={label}
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

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return [r, g, b];
}

function wcagContrastVsWhite(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [rs, gs, bs] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const l = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  // Avatar fallback uses white icon — only warn when white-on-color contrast is low.
  return (1.05) / (l + 0.05);
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
  const { t } = useLocale();
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
        <h3 className="mb-1 text-[13px] font-semibold">{t("settings:profile.title")}</h3>
        <p className="mb-4 text-[12px] text-muted-foreground">
          {t("settings:profile.howAppear")}
        </p>

        <div className="mb-4 flex items-center gap-3 rounded-md border bg-muted/30 p-3">
          <UserAvatar profile={profile} size="lg" shape="circle" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {profile.displayName?.trim() || profile.name || t("settings:profile.youFallback")}
            </span>
            {profile.role ? (
              <span className="truncate text-xs text-muted-foreground">
                {profile.role}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <Field label={t("settings:profile.name")}>
            <Input
              value={profile.name}
              onChange={(e) => update({ profile: { name: e.target.value } })}
              placeholder={t("settings:profile.namePlaceholder")}
              maxLength={60}
            />
          </Field>
          <Field label={t("settings:profile.displayName")} hint={t("settings:profile.displayNameHint")}>
            <Input
              value={profile.displayName || ""}
              onChange={(e) =>
                update({ profile: { displayName: e.target.value } })
              }
              placeholder={profile.name}
              maxLength={60}
            />
          </Field>
          <Field label={t("settings:profile.role")}>
            <Input
              value={profile.role || ""}
              onChange={(e) => update({ profile: { role: e.target.value } })}
              placeholder={t("settings:profile.rolePlaceholder")}
              maxLength={80}
            />
          </Field>
        </div>
      </div>

      {/* Audit #085: Workspace used to live below ~110 avatars + ~120 icons,
          which buried the more-frequently-edited fields under a wall of
          decoration. Moved to right after Name/Role so the workspace
          fields are above the fold and visible before the avatar grid. */}
      <div className="border-t border-border pt-5">
        <h3 className="mb-1 text-[13px] font-semibold">{t("settings:workspace.title")}</h3>
        <p className="mb-4 text-[12px] text-muted-foreground">
          {t("settings:workspace.subtitle")}
        </p>
        <div className="space-y-3">
          <Field label={t("settings:workspace.name")}>
            <Input
              value={workspace.workspaceName || ""}
              onChange={(e) =>
                update({ workspace: { workspaceName: e.target.value } })
              }
              placeholder={t("settings:workspace.namePlaceholder")}
            />
          </Field>
          <Field label={t("settings:workspace.description")}>
            <textarea
              value={workspace.description || ""}
              onChange={(e) =>
                update({ workspace: { description: e.target.value } })
              }
              className="min-h-[72px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t("settings:workspace.descriptionPlaceholder")}
            />
          </Field>
          <Field label={t("settings:workspace.teamSize")}>
            <Input
              value={workspace.teamSize || ""}
              onChange={(e) =>
                update({ workspace: { teamSize: e.target.value } })
              }
              placeholder={t("settings:workspace.teamSizePlaceholder")}
            />
          </Field>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-[12px] font-semibold">{t("settings:profile.avatar")}</h4>
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
            <Upload className="me-1.5 h-3.5 w-3.5" />
            Upload custom
          </Button>
          {profile.avatar === "custom" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void removeAvatar()}
            >
              <Trash2 className="me-1.5 h-3.5 w-3.5" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-[12px] font-semibold">{t("settings:profile.accentColor")}</h4>
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
            placeholder={t("settings:profile.hexPlaceholder")}
            value={profile.color || ""}
            onChange={(e) => update({ profile: { color: e.target.value } })}
            className="ms-2 h-8 w-24 text-xs"
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("settings:profile.tintHint")}
        </p>
        {(() => {
          const hex = (profile.color || "").trim();
          if (!hex) return null;
          const contrast = wcagContrastVsWhite(hex.startsWith("#") ? hex : `#${hex}`);
          if (contrast === null || contrast >= 3) return null;
          return (
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
              Low contrast ({contrast.toFixed(1)}:1) — initials may be hard to read on this background.
            </p>
          );
        })()}
      </div>

      <div>
        <h4 className="mb-2 text-[12px] font-semibold">{t("settings:profile.fallbackIcon")}</h4>
        <IconPicker
          selectedKey={profile.iconKey || ""}
          onSelect={(key) => update({ profile: { iconKey: key } })}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("settings:profile.iconHint")}
        </p>
      </div>

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-background pt-4 pb-2 z-10">
        <Button onClick={() => void save()} disabled={saving} size="sm">
          {saving ? (
            <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="me-1.5 h-3.5 w-3.5" />
          )}
          {saving ? t("settings:profile.saving") : t("settings:profile.save")}
        </Button>
        {saved ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            {t("settings:profile.saved")}
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

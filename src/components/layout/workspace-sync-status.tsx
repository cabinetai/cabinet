"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleDot,
  CloudOff,
  Loader2,
} from "lucide-react";

type WorkspaceSyncState =
  | "synced"
  | "syncing"
  | "offline"
  | "needs-attention"
  | "not-configured";

interface WorkspaceSyncStatus {
  state: WorkspaceSyncState;
  branch: string | null;
  reason: string | null;
  error: string | null;
}

const fallback: WorkspaceSyncStatus = {
  state: "not-configured",
  branch: null,
  reason: null,
  error: null,
};

const presentations = {
  synced: {
    label: "Synced",
    icon: Check,
    className: "text-emerald-500",
  },
  syncing: {
    label: "Syncing",
    icon: Loader2,
    className: "text-amber-500",
  },
  offline: {
    label: "Offline",
    icon: CloudOff,
    className: "text-muted-foreground",
  },
  "needs-attention": {
    label: "Needs attention",
    icon: AlertTriangle,
    className: "text-red-500",
  },
  "not-configured": {
    label: "Not configured",
    icon: CircleDot,
    className: "text-muted-foreground/70",
  },
} satisfies Record<
  WorkspaceSyncState,
  {
    label: string;
    icon: typeof Check;
    className: string;
  }
>;

export function WorkspaceSyncStatusIndicator() {
  const [status, setStatus] = useState<WorkspaceSyncStatus>(fallback);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/system/workspace-sync", {
        cache: "no-store",
      });
      if (response.ok) {
        setStatus((await response.json()) as WorkspaceSyncStatus);
      }
    } catch {
      setStatus((current) => ({
        ...current,
        state: "offline",
        reason: "status-unavailable",
        error: "Workspace sync status is unavailable.",
      }));
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const presentation = presentations[status.state] ?? presentations["not-configured"];
  const Icon = presentation.icon;
  const title = [
    presentation.label,
    status.branch ? `Branch: ${status.branch}` : null,
    status.error || status.reason,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 ${presentation.className}`}
      title={title}
      aria-label={title}
    >
      <Icon
        className={`h-3 w-3 ${
          status.state === "syncing" ? "animate-spin" : ""
        }`}
      />
      <span className="@max-[820px]:hidden">{presentation.label}</span>
    </span>
  );
}

/**
 * Storage backend settings — cloud edition only.
 *
 * Renders nothing in OSS. In cloud, drives the GitHub-backend opt-in
 * flow: connect the GitHub App, pick a repo, migrate, and (later)
 * disconnect after exporting.
 *
 * State machine, derived from /api/integrations/github/migrate/status:
 *   - !installed                        → "Connect GitHub" button
 *   - installed, no repo                → repo dropdown + create form
 *   - repo set, status=idle             → "Migrate now" button
 *   - status=running                    → polling spinner
 *   - status=completed, backend=github  → "Connected to owner/repo" + Export + Disconnect
 *   - status=failed                     → error banner + retry button
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Github, ExternalLink, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/use-locale";

const IS_CLOUD = process.env.NEXT_PUBLIC_CABINET_EDITION === "cloud";
const POLL_INTERVAL_MS = 2000;

interface RepoSummary {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

interface StorageStatus {
  storageBackend: "gcs" | "github";
  status: "idle" | "running" | "completed" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  repo: { owner: string; name: string; branch: string; htmlUrl: string } | null;
  installed: boolean;
  lastExportedAt: string | null;
}

export function StorageBackendSection() {
  const { t } = useLocale();
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [repos, setRepos] = useState<RepoSummary[] | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    const res = await fetch("/api/integrations/github/migrate/status");
    if (!res.ok) return;
    const next = (await res.json()) as StorageStatus;
    setStatus(next);
  }, []);

  // Initial load + reactivate polling whenever status flips to running.
  useEffect(() => {
    if (!IS_CLOUD) return;
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!IS_CLOUD) return;
    if (status?.status === "running") {
      if (pollRef.current) return;
      pollRef.current = setInterval(refreshStatus, POLL_INTERVAL_MS);
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [status?.status, refreshStatus]);

  const loadRepos = useCallback(async () => {
    setLoadingRepos(true);
    try {
      const res = await fetch("/api/integrations/github/repos");
      if (!res.ok) {
        setActionError(`Failed to load repos: ${res.status}`);
        return;
      }
      const body = (await res.json()) as { repos: RepoSummary[] };
      setRepos(body.repos);
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  // Auto-load repos when the App is installed but no repo is selected yet.
  useEffect(() => {
    if (!IS_CLOUD) return;
    if (status?.installed && !status.repo) {
      void loadRepos();
    }
  }, [status?.installed, status?.repo, loadRepos]);

  if (!IS_CLOUD) return null;
  if (!status) {
    return (
      <div className="border-t border-border pt-6">
        <h3 className="text-[14px] font-semibold mb-1">{t("storageBackend:title")}</h3>
        <p className="text-[12px] text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </p>
      </div>
    );
  }

  const handleConnect = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/integrations/github/install/start");
      const body = (await res.json()) as { installUrl?: string; error?: string };
      if (body.installUrl) {
        window.location.href = body.installUrl;
      } else {
        setActionError(body.error ?? "Failed to start GitHub install");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAttachRepo = async (repo: RepoSummary) => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/integrations/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "attach",
          owner: repo.owner,
          name: repo.name,
          branch: repo.defaultBranch,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(body.error ?? "Failed to attach repo");
        return;
      }
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const handleMigrate = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/integrations/github/migrate", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(body.error ?? "Migration failed to start");
        return;
      }
      await refreshStatus(); // will start the polling effect
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/integrations/github/export");
      const body = (await res.json()) as {
        backend?: string;
        cloneUrl?: string;
        htmlUrl?: string;
        note?: string;
      };
      if (body.cloneUrl) {
        window.open(body.htmlUrl ?? body.cloneUrl, "_blank");
      } else {
        setActionError(body.note ?? "Export acknowledged.");
      }
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect GitHub? Your data stays in the repo, but cabinet will show an empty workspace until you reconnect or start fresh.")) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/integrations/github/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmExported: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(body.error ?? "Disconnect failed");
        return;
      }
      await refreshStatus();
      setRepos(null);
    } finally {
      setBusy(false);
    }
  };

  // ── render branches ────────────────────────────────────────────────

  const onGitHub = status.storageBackend === "github" && status.status === "completed";
  const isMigrating = status.status === "running";
  const failed = status.status === "failed";

  return (
    <div className="border-t border-border pt-6">
      <h3 className="text-[14px] font-semibold mb-1">{t("storageBackend:title")}</h3>
      <p className="text-[12px] text-muted-foreground mb-4">
        By default cabinet stores your data in our managed cloud. You can switch to your own GitHub repo for full version history and portability.
      </p>

      {actionError && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px]">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {failed && status.error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px]">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
          <div>
            <div className="font-medium">{t("storageBackend:migrationFailed")}</div>
            <div className="text-muted-foreground">{status.error}</div>
          </div>
        </div>
      )}

      {/* On GitHub — show repo + actions */}
      {onGitHub && status.repo && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-[12px]">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
            <span>
              Storing in{" "}
              <a
                href={status.repo.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="underline font-medium"
              >
                {status.repo.owner}/{status.repo.name}
              </a>{" "}
              on <code className="text-[11px] px-1 py-0.5 rounded bg-muted">{status.repo.branch}</code>
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleExport} disabled={busy}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open repo
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDisconnect} disabled={busy}>
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {/* Migrating — spinner + status */}
      {isMigrating && (
        <div className="flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[12px]">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span>
            Migrating to GitHub… this may take a minute. You can leave this page open or come back later.
          </span>
        </div>
      )}

      {/* Not connected — Connect button */}
      {!onGitHub && !isMigrating && !status.installed && (
        <Button size="sm" onClick={handleConnect} disabled={busy}>
          <Github className="h-3.5 w-3.5 mr-1.5" />
          Connect GitHub
        </Button>
      )}

      {/* Installed but no repo — pick one */}
      {!onGitHub && !isMigrating && status.installed && !status.repo && (
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">
            GitHub App installed. Pick a repo for cabinet to use.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={loadRepos} disabled={loadingRepos || busy}>
              {loadingRepos ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Reload repos
            </Button>
          </div>
          {repos && repos.length === 0 && (
            <p className="text-[12px] text-muted-foreground">
              No repos accessible to this installation. Either add some to the App's repo selection on GitHub, or configure cabinet to create a new one (coming soon).
            </p>
          )}
          {repos && repos.length > 0 && (
            <div className="space-y-2">
              {repos.map((repo) => (
                <div
                  key={repo.fullName}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <div className="text-[12px]">
                    <div className="font-medium">{repo.fullName}</div>
                    <div className="text-muted-foreground">
                      {repo.private ? "private" : "public"} · default branch <code>{repo.defaultBranch}</code>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleAttachRepo(repo)} disabled={busy}>
                    Use this repo
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Repo selected, ready to migrate */}
      {!onGitHub && !isMigrating && status.installed && status.repo && (
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">
            Ready to migrate to{" "}
            <a
              href={status.repo.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {status.repo.owner}/{status.repo.name}
            </a>
            . Existing pages will be committed and pushed to the repo, then removed from our managed storage.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleMigrate} disabled={busy}>
              {failed ? "Retry migration" : "Migrate now"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDisconnect} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

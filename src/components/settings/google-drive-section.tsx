"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Cloud,
  CloudOff,
  CheckCircle,
  Folder,
  FolderOpen,
  Plus,
  Trash2,
  ChevronRight,
  Loader2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { GDRIVE_MOUNTS_CHANGED_EVENT } from "@/components/sidebar/google-drive-tree";

interface Mount {
  id: string;
  abs_path: string;
  folder_name: string;
  enabled: number;
  added_at: string;
}

interface DriveStatus {
  desktopDetected: boolean;
  mountPath: string | null;
  mounts: Mount[];
}

interface BrowseDir {
  name: string;
  path: string;
}

// Folder picker modal
function FolderPickerDialog({
  open,
  onOpenChange,
  rootPath,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootPath: string;
  /** Returns a resolved promise on success; throws with an error message on failure. */
  onSelect: (absPath: string, name: string) => Promise<void>;
}) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [dirs, setDirs] = useState<BrowseDir[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounting, setMounting] = useState(false);
  const [mountError, setMountError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const browse = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/google-drive/browse?path=${encodeURIComponent(p)}`);
      const data = await res.json() as { dirs: BrowseDir[] };
      setCurrentPath(p);
      setDirs(data.dirs || []);
    } catch {
      setDirs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setHistory([]);
      void browse(rootPath);
    }
  }, [open, rootPath, browse]);

  const navigateInto = (dir: BrowseDir) => {
    setMountError(null);
    setHistory((h) => [...h, currentPath]);
    void browse(dir.path);
  };

  const navigateBack = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setMountError(null);
    setHistory((h) => h.slice(0, -1));
    void browse(prev);
  };

  // basename, handling both POSIX (/) and Windows (\) separators
  const folderName = currentPath.split(/[\\/]/).pop() || currentPath;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Choose a folder to mount</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Current path — show only the last 2 segments to keep it readable */}
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 min-w-0 overflow-hidden">
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="text-[11px] text-muted-foreground/60 font-mono shrink-0">…/</span>
            <span className="text-[11px] text-muted-foreground font-mono truncate" title={currentPath}>
              {currentPath.split(/[\\/]/).slice(-2).join("/")}
            </span>
          </div>

          {/* Subdirectory list */}
          <div className="rounded-md border border-border overflow-y-auto max-h-52">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : dirs.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-muted-foreground">
                No subfolders here
              </div>
            ) : (
              dirs.map((dir) => (
                <button
                  key={dir.path}
                  type="button"
                  onClick={() => navigateInto(dir)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-left hover:bg-accent transition-colors border-b border-border/50 last:border-b-0"
                >
                  <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span className="flex-1 truncate">{dir.name}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                </button>
              ))
            )}
          </div>
        </div>

        {mountError && (
          <p className="text-[12px] text-destructive px-1">{mountError}</p>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={navigateBack}
            disabled={history.length === 0 || mounting}
            className="shrink-0"
          >
            ← Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={mounting}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={mounting}
              onClick={async () => {
                setMounting(true);
                setMountError(null);
                try {
                  await onSelect(currentPath, folderName);
                  onOpenChange(false);
                } catch (err) {
                  setMountError(err instanceof Error ? err.message : "Failed to mount folder");
                } finally {
                  setMounting(false);
                }
              }}
            >
              {mounting ? (
                <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5 me-1.5" />
              )}
              Mount &ldquo;{folderName}&rdquo;
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GoogleDriveSection() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/google-drive/status", { cache: "no-store" });
      const data = await res.json() as DriveStatus;
      setStatus(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const addMount = async (absPath: string, folderName: string) => {
    const res = await fetch("/api/google-drive/mounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ absPath, folderName }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? `Server error ${res.status}`);
    }
    await loadStatus();
    window.dispatchEvent(new Event(GDRIVE_MOUNTS_CHANGED_EVENT));
    window.dispatchEvent(
      new CustomEvent("cabinet:toast", {
        detail: { kind: "success", message: `Mounted "${folderName}"` },
      })
    );
  };

  const removeMount = async (id: string, name: string) => {
    setRemoving(id);
    try {
      const res = await fetch(`/api/google-drive/mounts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        window.dispatchEvent(
          new CustomEvent("cabinet:toast", {
            detail: { kind: "error", message: data.error ?? `Failed to remove "${name}"` },
          })
        );
        return;
      }
      await loadStatus();
      window.dispatchEvent(new Event(GDRIVE_MOUNTS_CHANGED_EVENT));
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: { kind: "info", message: `Removed "${name}"` },
        })
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: { kind: "error", message: `Failed to remove "${name}"` },
        })
      );
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking for Google Drive…
      </div>
    );
  }

  const detected = status?.desktopDetected ?? false;
  const mounts = status?.mounts ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[14px] font-semibold mb-1">Google Drive</h3>
        <p className="text-[12px] text-muted-foreground">
          Mount folders from Google Drive for Desktop. Files appear inline in the sidebar file tree alongside your local documents and are fully accessible to agents.
        </p>
      </div>

      {/* Detection status */}
      {detected ? (
        <div className="flex items-start gap-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
          <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          <div className="text-[12px]">
            <div className="font-medium text-emerald-700 dark:text-emerald-400">Google Drive for Desktop detected</div>
            <div className="text-muted-foreground font-mono mt-0.5 break-all">{status?.mountPath}</div>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 rounded-md border border-border bg-muted/20 px-3.5 py-3">
          <div className="flex items-center gap-2 text-[12px]">
            <CloudOff className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium">Google Drive for Desktop not detected</span>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Install Google Drive for Desktop to mount your Drive as a local folder. No OAuth or GCP setup needed.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-[12px]"
            onClick={() => window.open("https://www.google.com/drive/download/", "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5 me-1.5" />
            Download Google Drive for Desktop
          </Button>
          <div className="pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-[12px] text-muted-foreground"
              onClick={loadStatus}
            >
              <RefreshCw className="h-3 w-3 me-1.5" />
              Re-check
            </Button>
          </div>
        </div>
      )}

      {/* Mounted folders */}
      {detected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium">Mounted folders</span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px]"
              onClick={() => setPickerOpen(true)}
            >
              <Plus className="h-3 w-3 me-1" />
              Add folder
            </Button>
          </div>

          {mounts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
              No folders mounted yet.{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setPickerOpen(true)}
              >
                Add a folder
              </button>{" "}
              to get started.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {mounts.map((mount) => (
                <div
                  key={mount.id}
                  className="flex items-center gap-2 px-3 py-2 border-b border-border/60 last:border-b-0"
                >
                  <Cloud className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">{mount.folder_name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">{mount.abs_path}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                    title={`Remove "${mount.folder_name}"`}
                    disabled={removing === mount.id}
                    onClick={() => removeMount(mount.id, mount.folder_name)}
                  >
                    {removing === mount.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Folder picker */}
      {detected && status?.mountPath && (
        <FolderPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          rootPath={status.mountPath}
          onSelect={addMount}
        />
      )}

      {/* OAuth coming soon */}
      <div className="rounded-md border border-border/50 bg-muted/10 px-3 py-2.5 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground/70">Don&apos;t have Google Drive for Desktop?</span>{" "}
        OAuth API support is coming soon — connect via your Google account without installing anything.
      </div>
    </div>
  );
}

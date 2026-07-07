"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FolderOpen, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { cn } from "@/lib/utils";
import type { TreeNode } from "@/types";
import { useLocale } from "@/i18n/use-locale";

interface ConnectGithubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentPath?: string;
}

function getRepoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  if (!trimmed) return "";
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || "";
}

function basenameForPath(value: string): string {
  const normalized = value.trim().replace(/[\\/]+$/, "");
  if (!normalized) return "";
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || "";
}

function joinPaths(base: string, rel: string): string {
  const isWindows = base.includes("\\") || (!base.includes("/") && typeof process !== "undefined" && process?.platform === "win32");
  const sep = isWindows ? "\\" : "/";
  const cleanBase = base.replace(/[\\/]+$/, "");
  const cleanRel = rel.replace(/^[\\/]+/, "").replace(/[\\/]+$/, "");
  if (!cleanRel) return cleanBase;
  const formattedRel = isWindows ? cleanRel.replace(/\//g, "\\") : cleanRel.replace(/\\/g, "/");
  return `${cleanBase}${sep}${formattedRel}`;
}

function findNode(nodes: TreeNode[], targetPath: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.children) {
      const found = findNode(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

export function ConnectGithubDialog({
  open,
  onOpenChange,
  parentPath,
}: ConnectGithubDialogProps) {
  const { t } = useLocale();
  const loadTree = useTreeStore((s) => s.loadTree);
  const selectPage = useTreeStore((s) => s.selectPage);
  const nodes = useTreeStore((s) => s.nodes);
  const loadPage = useEditorStore((s) => s.loadPage);

  const [remote, setRemote] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [description, setDescription] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [devExpanded, setDevExpanded] = useState(false);
  const [dataDir, setDataDir] = useState("");

  // Warn if the parent directory already has children beyond index.md
  const parentHasContent = useMemo(() => {
    if (!parentPath) return false;
    const parentNode = findNode(nodes, parentPath);
    return !!(parentNode?.children && parentNode.children.length > 0);
  }, [parentPath, nodes]);

  // Load the absolute data directory path from the server on open
  useEffect(() => {
    if (!open) {
      setRemote("");
      setLocalPath("");
      setName("");
      setBranch("");
      setDescription("");
      setBrowsing(false);
      setCreating(false);
      setError("");
      setDevExpanded(false);
      setDataDir("");
      return;
    }

    let active = true;
    fetch("/api/system/data-dir")
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.dataDir) {
          setDataDir(d.dataDir);
          const baseFolder = parentPath ? joinPaths(d.dataDir, parentPath) : d.dataDir;
          const repoName = getRepoNameFromUrl(remote) || "";
          if (repoName) {
            setLocalPath(joinPaths(baseFolder, repoName));
          } else {
            setLocalPath(baseFolder);
          }
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [open, parentPath]);

  // When remote URL changes, try to pre-fill the name and update localPath
  const handleRemoteChange = (val: string) => {
    setRemote(val);
    const repoName = getRepoNameFromUrl(val);
    if (repoName) {
      setName((current) => current || repoName);
      if (dataDir) {
        const baseFolder = parentPath ? joinPaths(dataDir, parentPath) : dataDir;
        setLocalPath(joinPaths(baseFolder, repoName));
      }
    }
  };

  async function handleBrowse() {
    setBrowsing(true);
    setError("");

    try {
      const res = await fetch("/api/system/pick-directory", {
        method: "POST",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Failed to open folder picker.");
      }

      if (data?.cancelled || !data?.path) {
        return;
      }

      const repoName = getRepoNameFromUrl(remote) || "repository";
      setLocalPath(joinPaths(data.path, repoName));
      setName((current) => current || repoName);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to open folder picker."
      );
    } finally {
      setBrowsing(false);
    }
  }

  async function handleCreate() {
    if (!remote.trim() || !localPath.trim()) return;

    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/system/clone-github-repo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          remote: remote.trim(),
          localPath: localPath.trim(),
          name: name.trim() || getRepoNameFromUrl(remote) || basenameForPath(localPath),
          branch: branch.trim() || undefined,
          description: description.trim() || undefined,
          parentPath: parentPath || undefined,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to connect GitHub repository.");
      }

      await loadTree();
      selectPage(data.path);
      await loadPage(data.path);
      onOpenChange(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to connect GitHub repository."
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("connectGithub:title")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-xs text-muted-foreground">{t("connectGithub:intro")}</p>

          {parentHasContent && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
              <TriangleAlert className="h-4 w-4 shrink-0 text-yellow-500 mt-0.5" />
              <p className="text-xs text-yellow-500">
                This page already has sub-pages. The connected repository will be
                added as a new child alongside the existing content.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("connectGithub:repoUrlLabel")}
            </label>
            <Input
              placeholder={t("connectGithub:repoUrlPlaceholder")}
              value={remote}
              onChange={(event) => handleRemoteChange(event.target.value)}
              autoFocus
              required
              disabled={creating}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("connectGithub:localPathLabel")}
            </label>
            <div className="flex gap-2">
              <Input
                placeholder={t("connectGithub:localPathPlaceholder")}
                value={localPath}
                onChange={(event) => setLocalPath(event.target.value)}
                required
                disabled={creating}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleBrowse()}
                disabled={browsing || creating}
              >
                {browsing ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <FolderOpen data-icon="inline-start" />
                )}
                Browse
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("connectGithub:nameLabel")}
            </label>
            <Input
              placeholder={t("connectGithub:namePlaceholder")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={creating}
            />
          </div>

          {/* ── For Developers (Branch & Description) ──────── */}
          <div className="border border-border rounded-md">
            <button
              type="button"
              onClick={() => setDevExpanded(!devExpanded)}
              className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 shrink-0 transition-transform duration-150",
                  devExpanded && "rotate-90"
                )}
              />
              Advanced Settings
            </button>
            {devExpanded && (
              <div className="flex flex-col gap-3 px-3 pb-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("connectGithub:branchLabel")}
                  </label>
                  <Input
                    placeholder={t("connectGithub:branchPlaceholder")}
                    value={branch}
                    onChange={(event) => setBranch(event.target.value)}
                    disabled={creating}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("connectGithub:descriptionLabel")}
                  </label>
                  <Input
                    placeholder={t("connectGithub:descriptionPlaceholder")}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={creating}
                  />
                </div>
              </div>
            )}
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!remote.trim() || !localPath.trim() || creating}>
              {creating ? t("connectGithub:connecting") : t("connectGithub:connect")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

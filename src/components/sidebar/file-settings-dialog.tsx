"use client";

import { useEffect, useState } from "react";
import { AppWindow, ExternalLink, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { useLocale } from "@/i18n/use-locale";
import type { TreeNode, GoogleFrontmatter } from "@/types";

interface FileSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: TreeNode;
}

const GOOGLE_KINDS: NonNullable<GoogleFrontmatter["kind"]>[] = [
  "docs",
  "sheets",
  "slides",
  "forms",
  "drive",
];

export function FileSettingsDialog({
  open,
  onOpenChange,
  node,
}: FileSettingsDialogProps) {
  const { t } = useLocale();
  const loadTree = useTreeStore((s) => s.loadTree);

  const isGoogle = !!node.frontmatter?.google;
  const isWebFolder = node.type === "app" || node.type === "website";

  const [kind, setKind] = useState<NonNullable<GoogleFrontmatter["kind"]>>(
    node.frontmatter?.google?.kind || "docs"
  );
  const [url, setUrl] = useState(node.frontmatter?.google?.url || "");
  const [appMode, setAppMode] = useState(node.type === "app");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind(node.frontmatter?.google?.kind || "docs");
    setUrl(node.frontmatter?.google?.url || "");
    setAppMode(node.type === "app");
    setError("");
  }, [open, node]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const body = isGoogle
        ? { path: node.path, op: "google" as const, kind, url: url.trim() }
        : { path: node.path, op: "appMode" as const, app: appMode };
      const res = await fetch("/api/system/file-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || t("fileSettings:saveFailed"));
      await loadTree();
      // If the page is open, reload it so the viewer reflects the new settings.
      const ed = useEditorStore.getState();
      if (ed.currentPath === node.path) void ed.loadPage(node.path);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("fileSettings:saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isGoogle ? t("fileSettings:googleTitle") : t("fileSettings:appTitle")}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="flex flex-col gap-4"
        >
          {isGoogle ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("fileSettings:googleKindLabel")}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {GOOGLE_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs transition-colors",
                        kind === k
                          ? "border-primary/50 bg-primary/5 text-foreground ring-1 ring-primary/30"
                          : "border-border text-muted-foreground hover:bg-foreground/[0.03]"
                      )}
                    >
                      {t(`fileSettings:googleKinds.${k}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("fileSettings:googleUrlLabel")}
                </label>
                <Input
                  placeholder={t("fileSettings:googleUrlPlaceholder")}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  autoFocus
                />
                {url.trim() && (
                  <a
                    href={url.trim()}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t("fileSettings:openLink")}
                  </a>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                {t("fileSettings:googleNote")}
              </p>
            </>
          ) : isWebFolder ? (
            <>
              <label className="text-xs font-medium text-muted-foreground">
                {t("fileSettings:modeLabel")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAppMode(false)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-start transition-colors",
                    !appMode
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:bg-foreground/[0.03]"
                  )}
                >
                  <span className="flex items-center gap-2 text-[13px] font-medium">
                    <Globe className="h-4 w-4 text-blue-400" />
                    {t("fileSettings:modeWebsite")}
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {t("fileSettings:modeWebsiteDesc")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAppMode(true)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-start transition-colors",
                    appMode
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:bg-foreground/[0.03]"
                  )}
                >
                  <span className="flex items-center gap-2 text-[13px] font-medium">
                    <AppWindow className="h-4 w-4 text-emerald-400" />
                    {t("fileSettings:modeApp")}
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {t("fileSettings:modeAppDesc")}
                  </span>
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                {t("fileSettings:convertNote")}
              </p>
            </>
          ) : null}

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("fileSettings:cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("fileSettings:saving") : t("fileSettings:save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

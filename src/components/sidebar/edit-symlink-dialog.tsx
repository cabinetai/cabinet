"use client";

import { useEffect, useState } from "react";
import { FolderOpen, Loader2, TriangleAlert, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTreeStore } from "@/stores/tree-store";
import { useLocale } from "@/i18n/use-locale";

interface EditSymlinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Virtual KB path of the linked node. */
  kbPath: string;
}

export function EditSymlinkDialog({
  open,
  onOpenChange,
  kbPath,
}: EditSymlinkDialogProps) {
  const { t } = useLocale();
  const loadTree = useTreeStore((s) => s.loadTree);

  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState("");
  const [exists, setExists] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setTarget("");
      setName("");
      setDescription("");
      setNewTarget("");
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetch(
          `/api/system/symlink?path=${encodeURIComponent(kbPath)}`
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Couldn't read the symlink.");
        if (cancelled) return;
        setTarget(data.target || "");
        setExists(!!data.exists);
        setName(data.name || "");
        setDescription(data.description || "");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't read the symlink.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, kbPath]);

  async function handleBrowse() {
    setBrowsing(true);
    setError("");
    try {
      const res = await fetch("/api/system/pick-directory", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Couldn't open the folder picker.");
      if (data?.cancelled || !data?.path) return;
      setNewTarget(data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the folder picker.");
    } finally {
      setBrowsing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/system/symlink", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: kbPath,
          newTarget: newTarget.trim() || undefined,
          name: name.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || t("editSymlink:saveFailed"));
      await loadTree();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("editSymlink:saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-blue-400" />
            {t("editSymlink:title")}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
            …
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
            className="flex flex-col gap-3"
          >
            <p className="text-xs text-muted-foreground">
              {t("editSymlink:intro")}
            </p>

            {!exists && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                <p className="text-xs text-yellow-500">
                  {t("editSymlink:brokenWarning")}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("editSymlink:kbPathLabel")}
              </label>
              <code className="truncate rounded bg-muted px-2 py-1.5 text-xs">
                {kbPath}
              </code>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("editSymlink:targetLabel")}
              </label>
              <div className="flex items-center gap-2">
                <code
                  className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs"
                  title={target}
                >
                  {target || "—"}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={t("editSymlink:copyTarget")}
                  onClick={() => navigator.clipboard.writeText(target)}
                  disabled={!target}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("editSymlink:repointLabel")}
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder={target}
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleBrowse()}
                  disabled={browsing || saving}
                >
                  {browsing ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <FolderOpen data-icon="inline-start" />
                  )}
                  {t("editSymlink:browse")}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                {t("editSymlink:repointHint")}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("editSymlink:nameLabel")}
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("editSymlink:descriptionLabel")}
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t("editSymlink:saving") : t("editSymlink:save")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

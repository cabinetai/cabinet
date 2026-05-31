"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ICON_PICKER_KEYS, getIconByKey, friendlyIconName } from "@/lib/agents/icon-catalog";
import { showError } from "@/lib/ui/toast";
import { AGENT_PALETTE } from "@/lib/themes";
import { AVATAR_PRESETS } from "@/lib/agents/avatar-catalog";
import { AgentAvatar } from "./agent-avatar";
import { cn } from "@/lib/utils";
import { Upload, Trash2 } from "lucide-react";
import { useLocale } from "@/i18n/use-locale";

interface EditAgentIdentityDialogProps {
  target: { slug: string; cabinetPath?: string } | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface PersonaState {
  role: string;
  displayName: string;
  iconKey: string;
  color: string;
  avatar: string;
  avatarExt?: string;
}

function Label({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-medium text-foreground/80"
    >
      {children}
    </label>
  );
}

const EMPTY: PersonaState = {
  role: "",
  displayName: "",
  iconKey: "",
  color: "",
  avatar: "",
};

function hexFromPalette(i: number): string {
  // Pull the rgb() from the palette.text and convert to hex.
  const text = AGENT_PALETTE[i].text; // e.g. "rgb(139, 94, 60)"
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

export function EditAgentIdentityDialog({
  target,
  onOpenChange,
  onSaved,
}: EditAgentIdentityDialogProps) {
  const { t } = useLocale();
  const open = target !== null;
  const [state, setState] = useState<PersonaState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!target) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    async function load() {
      if (!target) return;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (target.cabinetPath) params.set("cabinetPath", target.cabinetPath);
        const res = await fetch(
          `/api/agents/personas/${target.slug}?${params.toString()}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("Failed to load persona");
        const data = await res.json();
        if (cancelled) return;
        const p = data.persona || {};
        setState({
          role: p.role || "",
          displayName: p.displayName || "",
          iconKey: p.iconKey || "",
          color: p.color || "",
          avatar: p.avatar || "",
          avatarExt: p.avatarExt,
        });
      } catch {
        if (!cancelled) setState(EMPTY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [target]);

  async function save() {
    if (!target) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        displayName: state.displayName,
        iconKey: state.iconKey,
        color: state.color,
        avatar: state.avatar,
      };
      if (target.cabinetPath) body.cabinetPath = target.cabinetPath;
      const res = await fetch(`/api/agents/personas/${target.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (!target) return;
    if (file.size > 1024 * 1024) {
      showError("Avatar must be 1 MB or smaller.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    if (target.cabinetPath) fd.append("cabinetPath", target.cabinetPath);
    const res = await fetch(`/api/agents/personas/${target.slug}/avatar`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      showError("Upload failed.");
      return;
    }
    const data = await res.json();
    setState((s) => ({ ...s, avatar: "custom", avatarExt: data.ext }));
    onSaved?.();
  }

  async function removeAvatar() {
    if (!target) return;
    const params = new URLSearchParams();
    if (target.cabinetPath) params.set("cabinet", target.cabinetPath);
    await fetch(
      `/api/agents/personas/${target.slug}/avatar?${params.toString()}`,
      { method: "DELETE" }
    );
    setState((s) => ({ ...s, avatar: "", avatarExt: undefined }));
    onSaved?.();
  }

  const previewAgent = target
    ? {
        slug: target.slug,
        cabinetPath: target.cabinetPath,
        displayName: state.displayName,
        iconKey: state.iconKey,
        color: state.color,
        avatar: state.avatar,
        avatarExt: state.avatarExt,
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("editIdentity:title")}</DialogTitle>
          <DialogDescription>
            Customize name, icon, color, and avatar. Role stays the same.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <div className="space-y-5">
            {/* Preview + role */}
            <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
              {previewAgent && <AgentAvatar agent={previewAgent} size="lg" shape="square" />}
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {state.displayName || state.role || target?.slug}
                </span>
                {state.displayName && state.role && state.displayName !== state.role && (
                  <span className="truncate text-xs text-muted-foreground">
                    {state.role}
                  </span>
                )}
              </div>
            </div>

            {/* Display name */}
            <div className="space-y-1.5">
              <Label htmlFor="displayName">{t("editIdentity:displayName")}</Label>
              <Input
                id="displayName"
                placeholder={state.role || "e.g. Steve"}
                value={state.displayName}
                onChange={(e) =>
                  setState((s) => ({ ...s, displayName: e.target.value }))
                }
                maxLength={40}
              />
            </div>

            {/* Icon */}
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="grid max-h-40 grid-cols-10 gap-1 overflow-auto rounded-md border bg-background p-2">
                {ICON_PICKER_KEYS.map((key) => {
                  const Icon = getIconByKey(key);
                  if (!Icon) return null;
                  const selected = state.iconKey === key;
                  const label = friendlyIconName(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          iconKey: selected ? "" : key,
                        }))
                      }
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted",
                        selected && "bg-accent text-accent-foreground"
                      )}
                      title={label}
                      aria-label={label}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Click again to clear. Empty = default for the role.
              </p>
            </div>

            {/* Color */}
            <div className="space-y-1.5">
              <Label>{t("editIdentity:color")}</Label>
              <div className="flex items-center gap-2">
                {AGENT_PALETTE.map((_, i) => {
                  const hex = hexFromPalette(i);
                  const selected =
                    state.color.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          color: selected ? "" : hex,
                        }))
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
                  placeholder={t("editIdentity:hexPlaceholder")}
                  value={state.color}
                  onChange={(e) =>
                    setState((s) => ({ ...s, color: e.target.value }))
                  }
                  className="ml-2 h-8 w-24 text-xs"
                />
              </div>
            </div>

            {/* Avatar */}
            <div className="space-y-1.5">
              <Label>{t("editIdentityPlus:avatar")}</Label>
              <div className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() =>
                    setState((s) => ({ ...s, avatar: "", avatarExt: undefined }))
                  }
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full border-2 bg-muted text-[10px] text-muted-foreground",
                    state.avatar === ""
                      ? "border-foreground"
                      : "border-transparent"
                  )}
                  title={t("editIdentityPlus:useIconInstead")}
                >
                  None
                </button>
                {AVATAR_PRESETS.map((preset) => {
                  const selected = state.avatar === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          avatar: preset.id,
                          avatarExt: undefined,
                        }))
                      }
                      className={cn(
                        "h-12 w-12 overflow-hidden rounded-full border-2 transition-all",
                        selected ? "border-foreground" : "border-transparent"
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
              </div>
              <div className="flex items-center gap-2 pt-1">
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
                {state.avatar === "custom" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void removeAvatar()}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Remove custom
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                PNG, JPG, or SVG. Max 1 MB. Square works best.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || loading}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

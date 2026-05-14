"use client";

import { useRef } from "react";
import Image from "next/image";
import { Trash2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AVATAR_PRESETS } from "@/lib/agents/avatar-catalog";
import { showError } from "@/lib/ui/toast";
import { UserAvatar } from "@/components/layout/user-avatar";
import {
  refreshUserProfile,
  setUserProfileOptimistic,
  useUserProfile,
} from "@/hooks/use-user-profile";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

export function EditUserAvatarDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocale();
  const state = useUserProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profile = state.status === "ready" ? state.data.profile : null;

  async function selectPreset(presetId: string) {
    setUserProfileOptimistic({
      profile: { ...(profile ?? { name: "" }), avatar: presetId, avatarExt: "" },
    });
    await fetch("/api/user/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: { avatar: presetId, avatarExt: "" } }),
    });
    await refreshUserProfile();
  }

  async function clearAvatar() {
    setUserProfileOptimistic({
      profile: { ...(profile ?? { name: "" }), avatar: "", avatarExt: "" },
    });
    if (profile?.avatar === "custom") {
      await fetch("/api/user/avatar", { method: "DELETE" });
    } else {
      await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: { avatar: "", avatarExt: "" } }),
      });
    }
    await refreshUserProfile();
  }

  async function uploadCustom(file: File) {
    if (file.size > 1024 * 1024) {
      showError("Avatar must be 1 MB or smaller.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/user/avatar", { method: "POST", body: fd });
    if (!res.ok) {
      showError("Upload failed.");
      return;
    }
    await refreshUserProfile();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("editUserAvatar:yourAvatar")}</DialogTitle>
          <DialogDescription>
            Pick a preset or upload your own image. Appears in conversations and
            anywhere else you&apos;re shown in the app.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
            {profile ? (
              <UserAvatar profile={profile} size="lg" shape="circle" />
            ) : null}
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {profile?.displayName?.trim() || profile?.name || "You"}
              </span>
              {profile?.role ? (
                <span className="truncate text-xs text-muted-foreground">
                  {profile.role}
                </span>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-foreground/80">{t("editUserAvatar:preset")}</span>
            <div className="grid max-h-64 grid-cols-6 gap-2 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => void clearAvatar()}
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full border-2 bg-muted text-[10px] text-muted-foreground",
                  !profile?.avatar ? "border-foreground" : "border-transparent"
                )}
                title={t("editUserAvatar:useInitials")}
              >
                None
              </button>
              {AVATAR_PRESETS.map((preset) => {
                const selected = profile?.avatar === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => void selectPreset(preset.id)}
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
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-foreground/80">{t("editUserAvatar:custom")}</span>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadCustom(f);
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
                Upload image
              </Button>
              {profile?.avatar === "custom" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void clearAvatar()}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove
                </Button>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              PNG, JPG, or SVG. Max 1 MB. Square works best.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";
import { type RoomMetaClient } from "@/stores/rooms-store";
import { RoomAvatar } from "@/lib/cabinets/room-icons";

interface RoomDeleteConfirmProps {
  room: RoomMetaClient;
  /** Closes the dialog without deleting. */
  onClose: () => void;
  /**
   * Called after a successful DELETE. Receives the server response so the
   * caller can rewire the active section / repoint the default room before
   * the rooms-store refresh lands.
   */
  onDeleted: (result: {
    trashPath: string;
    nextDefaultRoom: string | null;
  }) => void;
}

/**
 * GitHub-style destructive confirmation for "Delete room…". The user must
 * type the room's directory slug exactly to enable the action. We use the
 * slug (not the display name) because a localized / multi-word display
 * name is ambiguous — the slug is the deterministic identifier on disk.
 *
 * The dialog stays open if the request fails, surfaces the server error
 * inline, and never closes itself on error (so the user can retry or
 * dismiss explicitly).
 */
export function RoomDeleteConfirm({
  room,
  onClose,
  onDeleted,
}: RoomDeleteConfirmProps) {
  const { t } = useLocale();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, deleting]);

  const canDelete = confirmText.trim() === room.path && !deleting;

  async function handleDelete(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/rooms?path=${encodeURIComponent(room.path)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || t("rooms:deleteFailed"));
        setDeleting(false);
        return;
      }
      const data = (await res.json()) as {
        trashPath: string;
        nextDefaultRoom: string | null;
      };
      onDeleted(data);
    } catch {
      setError(t("rooms:deleteFailed"));
      setDeleting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget && !deleting) onClose();
      }}
    >
      <div className="relative w-full max-w-md mx-4 my-16 bg-card rounded-2xl border border-border shadow-2xl">
        <div className="flex items-start justify-between px-6 pt-6 pb-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {t("rooms:deleteTitle")}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("rooms:deleteSubtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={() => !deleting && onClose()}
            disabled={deleting}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={t("common:actions.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleDelete} className="px-6 pb-6 space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <RoomAvatar
              name={room.name}
              iconKey={room.icon}
              color={room.color}
              colorKey={room.path}
              className="size-7"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {room.name}
              </div>
              <code className="text-xs text-muted-foreground">{room.path}</code>
            </div>
          </div>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-foreground/80 space-y-1.5">
            <p>{t("rooms:deleteWarningIntro")}</p>
            <ul className="list-disc ps-4 space-y-0.5">
              <li>{t("rooms:deleteWarningPages")}</li>
              <li>{t("rooms:deleteWarningAgents")}</li>
              <li>{t("rooms:deleteWarningJobs")}</li>
              <li>{t("rooms:deleteWarningChat")}</li>
              <li>{t("rooms:deleteWarningSearch")}</li>
            </ul>
            <p className="pt-1 text-muted-foreground">
              {t("rooms:deleteRecoveryNote")}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              {t("rooms:deleteConfirmLabel", { slug: room.path })}
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="h-10 font-mono"
              placeholder={room.path}
              disabled={deleting}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={deleting}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!canDelete}
              className={cn(
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                !canDelete && "opacity-60"
              )}
            >
              {deleting
                ? t("rooms:deleting")
                : t("rooms:deleteConfirmButton")}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

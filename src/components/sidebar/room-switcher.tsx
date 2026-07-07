"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  Plus,
  Check,
  ExternalLink,
  Pencil,
  Library,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { useRoomsStore, type RoomMetaClient } from "@/stores/rooms-store";
import { useCabinetsStore } from "@/stores/cabinets-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { RoomAvatar } from "@/lib/cabinets/room-icons";
import { openRoomWindow } from "@/lib/cabinets/room-window";
import { notifyRoomsChanged } from "@/lib/cabinets/rooms-events";
import { invalidateCabinetOverview } from "@/lib/cabinets/overview-client";
import { confirmDialog } from "@/lib/ui/confirm";
import { useLocale } from "@/i18n/use-locale";
import { NewCabinetDialog } from "./new-cabinet-dialog";
import { NewRootCabinetDialog } from "./new-root-cabinet-dialog";
import { RoomEditDialog } from "./room-edit-dialog";
import { RoomDeleteConfirm } from "./room-delete-confirm";

/**
 * The home-button room switcher: a Notion-style dropdown next to the logo that
 * shows the current room (icon + name) and lets you switch, customize, add,
 * delete, or open any room in its own window (Electron + web).
 *
 * The dropdown refetches `/api/rooms` every time it opens, so the visible
 * list reflects the current disk state even after another window / the CLI
 * / the migration script touched it. The rooms-store also refetches on
 * focus/visibility and via the `cabinet-rooms` BroadcastChannel — see
 * `src/lib/cabinets/rooms-events.ts`.
 */
export function RoomSwitcher() {
  const { t } = useLocale();
  const section = useAppStore((s) => s.section);
  const setSection = useAppStore((s) => s.setSection);
  const rooms = useRoomsStore((s) => s.rooms);
  const defaultRoom = useRoomsStore((s) => s.defaultRoom);
  const load = useRoomsStore((s) => s.load);
  const loadTree = useTreeStore((s) => s.loadTree);
  const cabinets = useCabinetsStore((s) => s.cabinets);
  const activeCabinet = useCabinetsStore((s) => s.activeCabinet);
  const loadCabinets = useCabinetsStore((s) => s.load);
  const switchCabinet = useCabinetsStore((s) => s.switchTo);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addCabinetOpen, setAddCabinetOpen] = useState(false);
  const [editing, setEditing] = useState<RoomMetaClient | null>(null);
  const [deleting, setDeleting] = useState<RoomMetaClient | null>(null);

  useEffect(() => {
    void load();
    void loadCabinets();
  }, [load, loadCabinets]);

  // Refetch on dropdown open so a stale in-memory list can't outlive disk
  // changes that happened in another window / the CLI / the migration script.
  // load(true) is in-flight-guarded so spamming the trigger is cheap.
  useEffect(() => {
    if (open) {
      void load(true);
      void loadCabinets(true);
    }
  }, [open, load, loadCabinets]);

  const activePath = section.cabinetPath || ROOT_CABINET_PATH;
  // Rooms are top-level cabinets, so a deep path resolves to its first segment.
  const activeTop =
    activePath === ROOT_CABINET_PATH ? ROOT_CABINET_PATH : activePath.split("/")[0];
  const active = rooms.find((r) => r.path === activeTop) ?? null;

  function switchTo(room: RoomMetaClient) {
    // Clear any page selected in the previous room so we don't carry a stale
    // page path across the room boundary (rooms are isolated workspaces).
    useTreeStore.getState().selectPage(null);
    useEditorStore.getState().clear();
    setSection({ type: "cabinet", cabinetPath: room.path });
  }

  async function handleCabinetSwitch(name: string) {
    if (name === activeCabinet) return;
    // Switching cabinets rebinds the server's content root, which only takes
    // effect on a fresh process — so confirm before we restart the app.
    const ok = await confirmDialog({
      title: `Switch to “${name}”?`,
      message:
        "Cabinet will restart to open this cabinet. Any unsaved work in the " +
        "current window should be saved first. Your bookmarks are shared and " +
        "will carry over.",
      confirmText: "Switch & restart",
      cancelText: "Cancel",
    });
    if (!ok) return;
    setOpen(false);
    await switchCabinet(name);
  }

  function handleRoomSaved(updated: RoomMetaClient) {
    // The display name lives in three places that each cache it: the rooms
    // store, the tree-store nodes (manifest read), and the cabinet-overview
    // cache used by the sidebar drawer. Bust everything keyed off this path
    // so the rename appears across the chrome without a reload.
    invalidateCabinetOverview(updated.path);
    if (typeof window !== "undefined") {
      try {
        // Drop the localStorage seed used to skip the "Cabinet" flash on cold
        // paint — it's keyed by path and would replay the old name.
        window.localStorage.removeItem(`cabinet.name.${updated.path}`);
      } catch {
        // ignore storage failures
      }
    }
    void loadTree();
    // Refresh THIS window's rooms-store directly (force, in-flight-guarded) so
    // the switcher trigger/label updates deterministically — the `cabinet-rooms`
    // broadcast path is debounced for "outside" events and could otherwise
    // swallow this same-window refresh. notifyRoomsChanged() still fans out to
    // peer windows.
    void load(true);
    notifyRoomsChanged();
  }

  function handleRoomDeleted(result: {
    trashPath: string;
    nextDefaultRoom: string | null;
  }) {
    const deletedPath = deleting?.path;
    setDeleting(null);
    if (!deletedPath) return;

    // If the deleted room was the active one, snap into the new default
    // before the rooms-store refresh lands so the user never sees a render
    // pointed at a now-missing path.
    const wasActive = activeTop === deletedPath;
    if (wasActive) {
      useTreeStore.getState().selectPage(null);
      useEditorStore.getState().clear();
      const next = result.nextDefaultRoom ?? defaultRoom;
      if (next && next !== ROOT_CABINET_PATH) {
        setSection({ type: "cabinet", cabinetPath: next });
      } else {
        setSection({ type: "home" });
      }
    }

    // Bust caches keyed off the gone path so nothing tries to render it.
    invalidateCabinetOverview(deletedPath);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(`cabinet.name.${deletedPath}`);
      } catch {
        // ignore
      }
    }
    void loadTree();
    // Same as the save path: refresh locally and deterministically, then
    // broadcast to peers. Without the direct load(true) the dropdown list
    // could keep the deleted room until the next focus/open.
    void load(true);
    notifyRoomsChanged();
  }

  // Customize / Delete only make sense on a real room. The dropdown still
  // renders if `active` resolved to nothing (rooms not loaded yet or list is
  // empty), it just hides those entries.
  const canEdit = active !== null;
  const canDelete = active !== null && rooms.length > 1;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          title={active?.name || t("rooms:switcherTitle")}
          aria-label={t("rooms:switcherTitle")}
          className={cn(
            "group flex min-w-0 items-center gap-1 rounded-md p-1 cursor-pointer",
            "transition-colors hover:bg-accent/60 data-[popup-open]:bg-accent/60"
          )}
        >
          <RoomAvatar
            name={active?.name ?? ""}
            iconKey={active?.icon}
            color={active?.color}
            colorKey={active?.path ?? ""}
            className="size-6 shrink-0"
          />
          {/* Name is dropped from the trigger (the `title` tooltip + the header
              still identify the room); the avatar + chevron keep the switcher
              compact. */}
          <ChevronDown className="size-3 shrink-0 text-muted-foreground/70" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" sideOffset={6} className="w-64">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <Library className="text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {activeCabinet ?? "Cabinet"}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{"Switch cabinet"}</DropdownMenuLabel>
                {cabinets.map((cabinet) => (
                  <DropdownMenuItem
                    key={cabinet.name}
                    onClick={() => void handleCabinetSwitch(cabinet.name)}
                    className="gap-2"
                  >
                    <Library className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{cabinet.name}</span>
                    {cabinet.active && <Check className="text-foreground" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setAddCabinetOpen(true)}
                className="gap-2"
              >
                <Plus className="text-muted-foreground" />
                {"New cabinet"}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("rooms:switchRoom")}</DropdownMenuLabel>
            {rooms.map((room) => {
              const isActive = room.path === activeTop;
              return (
                <DropdownMenuItem
                  key={room.path}
                  onClick={() => switchTo(room)}
                  className="gap-2"
                >
                  <RoomAvatar
                    name={room.name}
                    iconKey={room.icon}
                    color={room.color}
                    colorKey={room.path}
                    className="size-5"
                  />
                  <span className="min-w-0 flex-1 truncate">{room.name}</span>
                  {isActive && <Check className="text-foreground" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <ExternalLink className="text-muted-foreground" />
              <span className="flex-1">{t("rooms:openInNewWindow")}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {rooms.map((room) => (
                <DropdownMenuItem
                  key={room.path}
                  onClick={() => openRoomWindow(room.path)}
                  className="gap-2"
                >
                  <RoomAvatar
                    name={room.name}
                    iconKey={room.icon}
                    color={room.color}
                    colorKey={room.path}
                    className="size-5"
                  />
                  <span className="min-w-0 flex-1 truncate">{room.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {canEdit && (
            <DropdownMenuItem onClick={() => setEditing(active)} className="gap-2">
              <Pencil className="text-muted-foreground" />
              {t("rooms:customizeRoom")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="text-muted-foreground" />
            {t("rooms:addRoom")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {addOpen && (
        <NewCabinetDialog
          open={addOpen}
          onOpenChange={(next) => {
            setAddOpen(next);
            if (!next) {
              // A new top-level cabinet may or may not have been created;
              // either way, force the rooms store + tree to re-read disk
              // and broadcast so other windows pick the change up.
              void load(true);
              void loadTree();
              notifyRoomsChanged();
            }
          }}
          parentPath=""
        />
      )}

      {addCabinetOpen && (
        <NewRootCabinetDialog open={addCabinetOpen} onOpenChange={setAddCabinetOpen} />
      )}

      {editing && (
        <RoomEditDialog
          room={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setEditing(null);
            handleRoomSaved(updated);
          }}
          // Delete lives here (not at the dropdown's top level) so the
          // dangerous action is one extra click away — open Edit, then
          // press Delete inside it. The slug-typed confirm dialog still
          // owns the final irreversible step.
          onRequestDelete={() => {
            const target = editing;
            setEditing(null);
            setDeleting(target);
          }}
          canDelete={canDelete}
        />
      )}

      {deleting && (
        <RoomDeleteConfirm
          room={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={handleRoomDeleted}
        />
      )}
    </>
  );
}

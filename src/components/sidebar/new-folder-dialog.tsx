"use client";

import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTreeStore } from "@/stores/tree-store";
import { useLocale } from "@/i18n/use-locale";

export function NewFolderDialog({
  parentPath = "",
  open: controlledOpen,
  onOpenChange,
}: {
  parentPath?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const { t } = useLocale();
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const { createFolder } = useTreeStore();

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      // Create inside the active cabinet/folder (`parentPath`). createFolder
      // builds the full path, refreshes the tree, and selects the new folder.
      await createFolder(parentPath, name.trim());
      setName("");
      setOpen(false);
    } catch (error) {
      console.error("Failed to create folder:", error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger
          data-new-folder-trigger
          title={t("dialogs:newFolder.trigger")}
          className="flex min-w-0 items-center gap-1.5 w-full text-xs px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          <FolderPlus className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{t("dialogs:newFolder.trigger")}</span>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialogs:newFolder.title")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
          className="flex gap-2"
        >
          <Input
            placeholder={t("dialogs:newFolder.placeholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <Button type="submit" disabled={!name.trim() || creating}>
            {creating ? t("dialogs:newFolder.creating") : t("dialogs:newFolder.create")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

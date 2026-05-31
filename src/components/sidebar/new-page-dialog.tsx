"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
import { useEditorStore } from "@/stores/editor-store";
import { useLocale } from "@/i18n/use-locale";

export function NewPageDialog({ parentPath = "" }: { parentPath?: string } = {}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const { createPage } = useTreeStore();
  const { loadPage } = useEditorStore();

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      // Create inside the current cabinet/folder (`parentPath`), not at the
      // data-dir (home) root. createPage builds the full path and selects it,
      // so we navigate to whatever it actually created.
      await createPage(parentPath, title.trim());
      const created = useTreeStore.getState().selectedPath;
      if (created) loadPage(created);
      setTitle("");
      setOpen(false);
    } catch (error) {
      console.error("Failed to create page:", error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        data-new-page-trigger
        title={t("dialogs:newPage.trigger")}
        className="flex min-w-0 items-center gap-1.5 w-full text-xs px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
      >
        <Plus className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{t("dialogs:newPage.trigger")}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialogs:newPage.title")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
          className="flex gap-2"
        >
          <Input
            placeholder={t("dialogs:newPage.placeholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <Button type="submit" disabled={!title.trim() || creating}>
            {creating ? t("dialogs:newPage.creating") : t("dialogs:newPage.create")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

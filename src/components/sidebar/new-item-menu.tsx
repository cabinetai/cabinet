"use client";

import { useState } from "react";
import { Plus, FilePlus, FolderPlus, Archive } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewPageDialog } from "@/components/sidebar/new-page-dialog";
import { NewFolderDialog } from "@/components/sidebar/new-folder-dialog";
import { NewCabinetDialog } from "@/components/sidebar/new-cabinet-dialog";
import { useTreeStore } from "@/stores/tree-store";
import { useLocale } from "@/i18n/use-locale";
import type { TreeNode } from "@/types";

// Container nodes that can directly hold a new page. A "file" is a markdown
// page, so creating a page while one is selected nests a sub-page inside it.
const PAGE_CONTAINERS = new Set<TreeNode["type"]>(["file", "directory", "cabinet"]);
// Only real folders/cabinets can hold a nested folder.
const FOLDER_CONTAINERS = new Set<TreeNode["type"]>(["directory", "cabinet"]);

function findNode(nodes: TreeNode[], target: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === target) return node;
    if (node.children) {
      const found = findNode(node.children, target);
      if (found) return found;
    }
  }
  return null;
}

function parentOf(p: string): string {
  return p.split("/").slice(0, -1).join("/");
}

export function NewItemMenu({ cabinetParent }: { cabinetParent: string }) {
  const { t } = useLocale();
  const { selectedPath, nodes } = useTreeStore();
  const [dialog, setDialog] = useState<"page" | "folder" | "cabinet" | null>(null);

  const selectedNode = selectedPath ? findNode(nodes, selectedPath) : null;

  // New Page lands inside the selected container (or sub-page of a selected
  // page); for a typed leaf it goes beside it; otherwise the active cabinet.
  const pageParent = selectedNode
    ? PAGE_CONTAINERS.has(selectedNode.type)
      ? selectedNode.path
      : parentOf(selectedNode.path)
    : cabinetParent;

  // New Folder lands inside the selected folder/cabinet; beside a selected
  // leaf; otherwise the active cabinet.
  const folderParent = selectedNode
    ? FOLDER_CONTAINERS.has(selectedNode.type)
      ? selectedNode.path
      : parentOf(selectedNode.path)
    : cabinetParent;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          openOnHover
          title={t("sidebar:newMenu")}
          aria-label={t("sidebar:newMenu")}
          className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top">
          <DropdownMenuItem onClick={() => setDialog("page")}>
            <FilePlus />
            <span>{t("dialogs:newPage.trigger")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("folder")}>
            <FolderPlus />
            <span>{t("dialogs:newFolder.trigger")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("cabinet")}>
            <Archive />
            <span>{t("dialogs:newCabinet.trigger")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewPageDialog
        parentPath={pageParent}
        open={dialog === "page"}
        onOpenChange={(o) => setDialog(o ? "page" : null)}
      />
      <NewFolderDialog
        parentPath={folderParent}
        open={dialog === "folder"}
        onOpenChange={(o) => setDialog(o ? "folder" : null)}
      />
      <NewCabinetDialog
        parentPath={cabinetParent}
        open={dialog === "cabinet"}
        onOpenChange={(o) => setDialog(o ? "cabinet" : null)}
      />
    </>
  );
}

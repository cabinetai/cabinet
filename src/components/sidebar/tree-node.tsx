"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Archive,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Trash2,
  FilePlus,
  Globe,
  Pencil,
  AppWindow,
  GitBranch,
  FileType,
  Table,
  Copy,
  ClipboardCopy,
  Link2,
  Link2Off,
  Code,
  Image,
  Video,
  Music,
  Workflow,
  File,
  FileSpreadsheet,
  NotebookText,
  Presentation,
  TriangleAlert,
  ArrowRightLeft,
  Loader2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TreeNode as TreeNodeType } from "@/types";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { useAppStore } from "@/stores/app-store";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LinkRepoDialog } from "./link-repo-dialog";
import { NewCabinetDialog } from "./new-cabinet-dialog";
import { useFileImport } from "./use-file-import";
import { getDataDir } from "@/lib/data-dir-cache";
import { useLocale } from "@/i18n/use-locale";

interface TreeNodeProps {
  node: TreeNodeType;
  depth: number;
  contextCabinetPath?: string | null;
  siblings?: TreeNodeType[];
  onMoveToRequest?: (node: TreeNodeType) => void;
  /**
   * Optional stagger delay (ms) applied as a fade-in animation when the row
   * mounts. Set by the parent so the whole tree cascades in like a drawer
   * being pulled out. Propagates to children with an extra bump so nested
   * rows appear after their parent.
   */
  animationDelayMs?: number;
}

const ANIMATION_MAX_DELAY_MS = 360;
const ANIMATION_CHILD_BASE_BUMP_MS = 30;
const ANIMATION_CHILD_SIBLING_MS = 14;

export function TreeNode({
  node,
  depth,
  contextCabinetPath = null,
  siblings,
  onMoveToRequest,
  animationDelayMs,
}: TreeNodeProps) {
  const { t } = useLocale();
  const {
    selectedPath,
    expandedPaths,
    dragOverPath,
    dragOverZone,
    movingPaths,
    focusTick,
    toggleExpand,
    selectPage,
    deletePage,
    movePage,
    setDragOver,
    createPage,
    renamePage,
  } = useTreeStore();
  const isMoving = movingPaths.has(node.path);
  const rowRef = useRef<HTMLButtonElement | null>(null);
  const [blink, setBlink] = useState(false);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const loadPage = useEditorStore((s) => s.loadPage);
  const setSection = useAppStore((s) => s.setSection);
  const [subPageOpen, setSubPageOpen] = useState(false);
  const [subPageTitle, setSubPageTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [linkRepoOpen, setLinkRepoOpen] = useState(false);
  const [createCabinetOpen, setCreateCabinetOpen] = useState(false);

  const isSelected = selectedPath === node.path;
  const isDragOver = dragOverPath === node.path;
  const hasChildren = !!(node.children && node.children.length > 0);
  const isExpanded = hasChildren && expandedPaths.has(node.path);
  const title = node.frontmatter?.title || node.name;

  useEffect(() => {
    if (!isSelected || focusTick === 0) return;
    const el = rowRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setBlink(true);
    const t = setTimeout(() => setBlink(false), 1400);
    return () => clearTimeout(t);
  }, [isSelected, focusTick]);

  const handleClick = () => {
    selectPage(node.path);
    // Cabinets used to switch the entire app to the cabinet view on row
    // click — that trapped users who just wanted to browse files inside.
    // Now they behave like any folder: load the cabinet's index page and
    // expand the subtree. The "Open cabinet" pill on hover (rendered below)
    // is the explicit affordance for switching into the cabinet view.
    if (node.type === "file" || node.type === "directory" || node.type === "cabinet") {
      loadPage(node.path);
    }

    setSection(
      contextCabinetPath
        ? {
            type: "page",
            cabinetPath: contextCabinetPath,
          }
        : { type: "page" }
    );
  };

  const handleOpenCabinet = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // Switch *into* the cabinet (sidebar drawer shows Data/Agents/Tasks tabs
    // because section.cabinetPath is set) and land on the cabinet's data
    // page — the index.md — instead of the dashboard. The dashboard is one
    // click away via the top of the cabinet drawer if the user wants it.
    selectPage(node.path);
    void loadPage(node.path);
    setSection({
      type: "page",
      cabinetPath: node.path,
    });
  };

  const handleDelete = () => {
    setDeleteOpen(true);
  };

  const handleCreateSubPage = async () => {
    if (!subPageTitle.trim()) return;
    setCreating(true);
    try {
      await createPage(node.path, subPageTitle.trim());
      const slug = subPageTitle
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const nextPath = `${node.path}/${slug}`;
      selectPage(nextPath);
      loadPage(nextPath);
      setSection(
        contextCabinetPath
          ? {
              type: "page",
              cabinetPath: contextCabinetPath,
            }
          : { type: "page" }
      );
      setSubPageTitle("");
      setSubPageOpen(false);
    } catch (error) {
      console.error("Failed to create sub page:", error);
    } finally {
      setCreating(false);
    }
  };

  const isContainer =
    node.type === "directory" || node.type === "cabinet";

  const isDirLike =
    isContainer || node.type === "app" || node.type === "website";

  const importTargetPath = isDirLike
    ? node.path
    : node.path.split("/").slice(0, -1).join("/");

  const { importFiles, importFilesList, importing } = useFileImport();

  const computeZone = useCallback(
    (e: React.DragEvent): "before" | "into" | "after" => {
      const el = rowRef.current;
      if (!el) return "into";
      const rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const h = rect.height;
      if (isContainer) {
        if (y < h * 0.25) return "before";
        if (y > h * 0.75) return "after";
        return "into";
      }
      return y < h * 0.5 ? "before" : "after";
    },
    [isContainer]
  );

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", node.path);
      e.dataTransfer.effectAllowed = "move";

      const source = rowRef.current;
      if (source) {
        const ghost = source.cloneNode(true) as HTMLDivElement;
        ghost.style.position = "fixed";
        ghost.style.top = "-1000px";
        ghost.style.left = "-1000px";
        ghost.style.width = `${source.offsetWidth}px`;
        ghost.style.borderRadius = "8px";
        ghost.style.background = "var(--popover)";
        ghost.style.color = "var(--popover-foreground)";
        ghost.style.boxShadow =
          "0 8px 24px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.04) inset";
        ghost.style.border = "1px solid var(--border)";
        ghost.style.padding = "4px 8px";
        ghost.style.opacity = "0.95";
        ghost.style.pointerEvents = "none";
        ghost.style.transform = "translateZ(0)";
        document.body.appendChild(ghost);
        dragGhostRef.current = ghost;
        e.dataTransfer.setDragImage(ghost, 12, 12);
      }
    },
    [node.path]
  );

  const handleDragEnd = useCallback(() => {
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const isFileDrag = e.dataTransfer.types.includes("Files");
      if (isFileDrag) {
        e.dataTransfer.dropEffect = "copy";
        if (dragOverPath !== node.path || dragOverZone !== "into") {
          setDragOver(node.path, "into");
        }
        return;
      }
      e.dataTransfer.dropEffect = "move";
      const zone = computeZone(e);
      if (dragOverPath !== node.path || dragOverZone !== zone) {
        setDragOver(node.path, zone);
      }
    },
    [node.path, setDragOver, computeZone, dragOverPath, dragOverZone]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragOverPath === node.path) {
        setDragOver(null);
      }
    },
    [node.path, dragOverPath, setDragOver]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const zone = computeZone(e);
      setDragOver(null);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        void importFilesList(importTargetPath, e.dataTransfer.files);
        return;
      }

      const fromPath = e.dataTransfer.getData("text/plain");
      if (!fromPath || fromPath === node.path) return;

      // Don't drop a page into one of its own descendants (would be circular).
      // The previous direction blocked dropping a child onto its parent's
      // before/after zone — a legitimate way to reach the top level.
      if (node.path.startsWith(fromPath + "/")) return;

      const fromName = fromPath.split("/").pop() || "";
      const nodeParent = node.path.split("/").slice(0, -1).join("/");

      if (zone === "into") {
        if (!isContainer) return;
        if (fromPath === node.path) return;
        movePage(fromPath, node.path);
        return;
      }

      // before/after → reorder within node's parent
      const targetParent = nodeParent;
      if (!siblings) {
        movePage(fromPath, targetParent);
        return;
      }
      const visible = siblings.filter((s) => s.path !== fromPath);
      const targetIndexInVisible = visible.findIndex((s) => s.path === node.path);
      if (targetIndexInVisible === -1) {
        movePage(fromPath, targetParent);
        return;
      }
      const insertIndex =
        zone === "before" ? targetIndexInVisible : targetIndexInVisible + 1;
      const prev = insertIndex > 0 ? visible[insertIndex - 1] : null;
      const next =
        insertIndex < visible.length ? visible[insertIndex] : null;
      const prevName = prev ? prev.path.split("/").pop() || null : null;
      const nextName = next ? next.path.split("/").pop() || null : null;
      movePage(fromPath, targetParent, { prevName, nextName });
    },
    [
      node.path,
      isContainer,
      movePage,
      setDragOver,
      computeZone,
      siblings,
      importFilesList,
      importTargetPath,
    ]
  );

  const showInsertBefore = isDragOver && dragOverZone === "before";
  const showInsertAfter = isDragOver && dragOverZone === "after";
  const showInto = isDragOver && dragOverZone === "into";

  const hasAnimation = typeof animationDelayMs === "number";
  const animationStyle: React.CSSProperties | undefined = hasAnimation
    ? {
        animationDelay: `${Math.min(animationDelayMs!, ANIMATION_MAX_DELAY_MS)}ms`,
        animationFillMode: "backwards",
      }
    : undefined;

  return (
    <>
      <div
        className={cn(
          "relative",
          hasAnimation &&
            "animate-in fade-in slide-in-from-top-1 duration-200 ease-out"
        )}
        style={animationStyle}
      >
      {showInsertBefore && (
        <div
          className="pointer-events-none absolute -top-px end-1.5 z-10 h-0.5 rounded-full bg-primary"
          style={{ insetInlineStart: `${depth * 16 + 8}px` }}
        />
      )}
      {showInsertAfter && (
        <div
          className="pointer-events-none absolute -bottom-px end-1.5 z-10 h-0.5 rounded-full bg-primary"
          style={{ insetInlineStart: `${depth * 16 + 8}px` }}
        />
      )}
      <ContextMenu>
        <ContextMenuTrigger>
          <button
            ref={rowRef}
            onClick={handleClick}
            draggable={!isMoving}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            disabled={isMoving}
            className={cn(
              "group relative flex items-center gap-2 w-full text-start py-1 px-2 text-[12px] text-foreground/75 rounded-md transition-colors",
              "hover:bg-foreground/[0.03] hover:text-foreground !cursor-grab active:!cursor-grabbing",
              // Override the ContextMenuTrigger wrapper's user-select:none so HTML5 dragstart fires on first mousedown (Chromium quirk: draggable rows inheriting user-select:none need a focus pass before drag initiates).
              "select-text",
              // Audit #015: active row needs two cues, not just background.
              // Adds a 2px primary-color accent bar on the start edge via a
              // before:: pseudo (does not fight the row's existing padding)
              // and bumps the label weight to font-semibold. Row background
              // stays subtle so hover (no bar, no weight) reads as lighter.
              // Uses logical start/rounded-e so the bar flips to the
              // right edge in RTL and stays rounded on its inner side.
              isSelected &&
                "bg-accent/70 text-accent-foreground font-semibold before:absolute before:start-0 before:top-1 before:bottom-1 before:w-[2px] before:rounded-e-full before:bg-primary",
              showInto &&
                "bg-primary/10 ring-1 ring-primary/30 ring-inset",
              blink && "cabinet-tree-blink",
              isMoving && "opacity-60 !cursor-progress pointer-events-none"
            )}
            style={{ paddingInlineStart: `${depth * 16 + 8}px` }}
          >
            {hasChildren ? (
              <span
                role="button"
                tabIndex={0}
                aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
                aria-expanded={isExpanded}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.path);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleExpand(node.path);
                  }
                }}
                className="shrink-0 -ms-1 flex items-center justify-center w-3 h-3 rounded hover:bg-accent"
              >
                <ChevronRight
                  className={cn(
                    "h-3 w-3 text-muted-foreground/70 transition-transform duration-150",
                    isExpanded ? "rotate-90" : "rtl:rotate-180"
                  )}
                />
              </span>
            ) : (
              <span className="w-3 -ms-1 shrink-0" />
            )}
            {node.type === "csv" ? (
              <Table className="h-3.5 w-3.5 shrink-0 text-green-400" />
            ) : node.type === "pdf" ? (
              <FileType className="h-3.5 w-3.5 shrink-0 text-red-400" />
            ) : node.type === "app" ? (
              <AppWindow className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            ) : node.type === "website" ? (
              <Globe className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            ) : node.type === "code" ? (
              <Code className="h-3.5 w-3.5 shrink-0 text-violet-400" />
            ) : node.type === "image" ? (
              <Image className="h-3.5 w-3.5 shrink-0 text-pink-400" />
            ) : node.type === "video" ? (
              <Video className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            ) : node.type === "audio" ? (
              <Music className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : node.type === "mermaid" ? (
              <Workflow className="h-3.5 w-3.5 shrink-0 text-teal-400" />
            ) : node.type === "docx" ? (
              <FileText className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            ) : node.type === "xlsx" ? (
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-green-500" />
            ) : node.type === "pptx" ? (
              <Presentation className="h-3.5 w-3.5 shrink-0 text-orange-400" />
            ) : node.type === "notebook" ? (
              <NotebookText className="h-3.5 w-3.5 shrink-0 text-[#F37626]" />
            ) : node.type === "unknown" ? (
              <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            ) : node.type === "cabinet" ? (
              // Audit #016 (review feedback 2026-05-02): keep the Archive
              // icon — it's the brand glyph used by the sidebar header and
              // the rest of the app. Persistent amber-400 color so cabinet
              // rows read consistently across the tree, sidebar header,
              // and any breadcrumb references.
              <Archive className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : node.hasRepo ? (
              <GitBranch className="h-3.5 w-3.5 shrink-0 text-orange-400" />
            ) : node.isLinked ? (
              <Link2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            ) : hasChildren ? (
              isExpanded ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                "truncate",
                node.type === "unknown" && "opacity-50",
                // Audit #016: bump cabinet rows to medium weight so the eye
                // can scan "places vs. things" without reading the icon.
                node.type === "cabinet" && "font-medium"
              )}
            >
              {title}
            </span>
            {isMoving && (
              <Loader2 className="ms-auto h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
            )}
            {node.type === "cabinet" && !isMoving && (
              // Audit #016 (review feedback 2026-05-02 round 2):
              // Hover-revealed "Open" pill — at rest the cabinet row has
              // no extra chrome (the Archive icon already says "cabinet").
              // On row hover the pill fades in as the explicit "switch
              // into the cabinet's scoped view" affordance. <span> +
              // role/tabIndex because <button> inside <button> is invalid
              // HTML; pointer/keyboard reach reproduced via the role.
              <span
                role="button"
                tabIndex={0}
                aria-label={`Open cabinet ${title}`}
                title={t("treeNode:openCabinet")}
                onClick={handleOpenCabinet}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleOpenCabinet(e as unknown as React.MouseEvent);
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  "ms-auto shrink-0 rounded-md bg-foreground/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80 transition-[opacity,background-color,color]",
                  "opacity-0 group-hover:opacity-100 focus:opacity-100",
                  "hover:bg-accent hover:text-accent-foreground cursor-pointer"
                )}
              >
                Open
              </span>
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setSubPageOpen(true)}>
            <FilePlus className="h-4 w-4 mr-2" />
            Add Sub Page
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setLinkRepoOpen(true)}>
            <GitBranch className="h-4 w-4 mr-2" />
            Load Knowledge
          </ContextMenuItem>
          <ContextMenuItem
            disabled={importing}
            onClick={() => importFiles(importTargetPath)}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Import File…
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setCreateCabinetOpen(true)}>
            <Archive className="h-4 w-4 mr-2" />
            Create Cabinet Here
          </ContextMenuItem>
          <ContextMenuItem onClick={() => { setRenameTitle(title); setRenameOpen(true); }}>
            <Pencil className="h-4 w-4 mr-2" />
            Rename
          </ContextMenuItem>
          {onMoveToRequest && (
            <ContextMenuItem onClick={() => onMoveToRequest(node)}>
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Move to…
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => navigator.clipboard.writeText(node.path)}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Relative Path
          </ContextMenuItem>
          <ContextMenuItem onClick={async () => {
            const dir = await getDataDir();
            navigator.clipboard.writeText(`${dir}/${node.path}`);
          }}>
            <ClipboardCopy className="h-4 w-4 mr-2" />
            Copy Full Path
          </ContextMenuItem>
          <ContextMenuItem onClick={() => {
            fetch("/api/system/open-data-dir", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subpath: node.path }),
            });
          }}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Open in Finder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleDelete} className="text-destructive">
            {node.isLinked ? (
              <Link2Off className="h-4 w-4 mr-2" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            {node.isLinked ? "Unlink" : "Delete"}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child, childIndex) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              contextCabinetPath={contextCabinetPath}
              siblings={node.children!}
              onMoveToRequest={onMoveToRequest}
              animationDelayMs={
                hasAnimation
                  ? Math.min(
                      animationDelayMs! +
                        ANIMATION_CHILD_BASE_BUMP_MS +
                        childIndex * ANIMATION_CHILD_SIBLING_MS,
                      ANIMATION_MAX_DELAY_MS
                    )
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <Dialog open={subPageOpen} onOpenChange={setSubPageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add Sub Page to &ldquo;{title}&rdquo;
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateSubPage();
            }}
            className="flex gap-2"
          >
            <Input
              placeholder={t("treeNode:pageTitlePlaceholder")}
              value={subPageTitle}
              onChange={(e) => setSubPageTitle(e.target.value)}
              autoFocus
            />
            <Button type="submit" disabled={!subPageTitle.trim() || creating}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("treeNode:rename")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!renameTitle.trim()) return;
              await renamePage(node.path, renameTitle.trim());
              setRenameOpen(false);
            }}
            className="flex gap-2"
          >
            <Input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              autoFocus
            />
            <Button type="submit" disabled={!renameTitle.trim()}>
              Rename
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <LinkRepoDialog open={linkRepoOpen} onOpenChange={setLinkRepoOpen} parentPath={node.path} />

      <NewCabinetDialog
        open={createCabinetOpen}
        onOpenChange={setCreateCabinetOpen}
        parentPath={node.path}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                {node.isLinked
                  ? <Link2Off className="h-4 w-4 text-destructive" />
                  : <TriangleAlert className="h-4 w-4 text-destructive" />
                }
              </div>
              <div className="flex flex-col gap-1">
                <DialogTitle>
                  {node.isLinked
                    ? `Unlink "${title}"`
                    : node.type === "cabinet"
                      ? `Delete Cabinet "${title}"`
                      : `Delete "${title}"`
                  }
                </DialogTitle>
                <DialogDescription>
                  {node.isLinked
                    ? `This will remove the link from your knowledge base. The original folder on disk will not be affected.`
                    : node.type === "cabinet"
                      ? `This will permanently delete the cabinet and everything inside it — all pages, agents, jobs, and tasks. This cannot be undone.`
                      : `This will permanently delete this ${node.type === "directory" ? "page and all its sub-pages" : "file"}. This cannot be undone.`
                  }
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deletePage(node.path);
                setDeleteOpen(false);
              }}
            >
              {node.isLinked ? "Unlink" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

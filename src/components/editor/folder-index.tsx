"use client";

import { useMemo, useState } from "react";
import {
  FileText,
  Folder,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode2,
  FileSpreadsheet,
  Globe,
  AppWindow,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import type { TreeNode } from "@/types";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { useLocale } from "@/i18n/use-locale";

type ViewMode = "list" | "gallery";

const VIEW_MODE_KEY = "kb-folder-view-mode";

function loadModePref(path: string): ViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, ViewMode>;
    return parsed[path] ?? null;
  } catch {
    return null;
  }
}

function saveModePref(path: string, mode: ViewMode) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, ViewMode>) : {};
    parsed[path] = mode;
    localStorage.setItem(VIEW_MODE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore quota / parse errors
  }
}

function isImageChild(node: TreeNode): boolean {
  return node.type === "image";
}

// A folder is "image-heavy" when it has enough images to make a gallery feel
// useful AND images dominate the child set. Tuned for moodboards and
// screenshot dumps without surprising mixed folders.
function isImageHeavy(children: TreeNode[]): boolean {
  if (children.length === 0) return false;
  const images = children.filter(isImageChild).length;
  return images >= 4 && images / children.length >= 0.6;
}

function iconFor(node: TreeNode) {
  switch (node.type) {
    case "directory":
    case "cabinet":
      return Folder;
    case "image":
      return FileImage;
    case "video":
      return FileVideo;
    case "audio":
      return FileAudio;
    case "code":
      return FileCode2;
    case "csv":
    case "xlsx":
      return FileSpreadsheet;
    case "website":
      return Globe;
    case "app":
      return AppWindow;
    default:
      return FileText;
  }
}

function navigateTo(path: string) {
  const { selectPage, expandPath } = useTreeStore.getState();
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) {
    expandPath(parts.slice(0, i).join("/"));
  }
  selectPage(path);
  void useEditorStore.getState().loadPage(path);
}

interface FolderIndexProps {
  folderPath: string;
  entries: TreeNode[];
}

// The parent passes a `key={folderPath}` so this component remounts when the
// folder changes — that's why state can safely seed from the path on mount
// without a re-sync effect.
export function FolderIndex({ folderPath, entries }: FolderIndexProps) {
  const { t } = useLocale();
  const imageHeavy = useMemo(() => isImageHeavy(entries), [entries]);

  const [mode, setMode] = useState<ViewMode>(() => {
    const saved = loadModePref(folderPath);
    if (saved) return saved;
    return imageHeavy ? "gallery" : "list";
  });

  const onSetMode = (next: ViewMode) => {
    setMode(next);
    saveModePref(folderPath, next);
  };

  // Sort: directories first, then by name. Stable so siblings stay grouped.
  const sorted = useMemo(() => {
    const copy = [...entries];
    copy.sort((a, b) => {
      const aDir = a.type === "directory" || a.type === "cabinet";
      const bDir = b.type === "directory" || b.type === "cabinet";
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [entries]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
          {sorted.length} {sorted.length === 1 ? "item" : "items"}
        </p>
        <div className="inline-flex items-center rounded-md border border-border p-0.5 text-[11px]">
          <button
            onClick={() => onSetMode("list")}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              mode === "list"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={mode === "list"}
            title={t("folderIndex:listView")}
          >
            <ListIcon className="h-3 w-3" />
            List
          </button>
          <button
            onClick={() => onSetMode("gallery")}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              mode === "gallery"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={mode === "gallery"}
            title={t("folderIndex:galleryView")}
          >
            <LayoutGrid className="h-3 w-3" />
            Gallery
          </button>
        </div>
      </div>

      {mode === "list" ? (
        <ul className="divide-y divide-border rounded-md border border-border overflow-hidden">
          {sorted.map((child) => {
            const Icon = iconFor(child);
            const title = child.frontmatter?.title || child.name;
            return (
              <li key={child.path}>
                <button
                  onClick={() => navigateTo(child.path)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent/50 transition-colors"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{title}</span>
                  <span className="text-[11px] text-muted-foreground/60 capitalize">
                    {child.type}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {sorted.map((child) => {
            const title = child.frontmatter?.title || child.name;
            if (isImageChild(child)) {
              return (
                <button
                  key={child.path}
                  onClick={() => navigateTo(child.path)}
                  className="group flex flex-col gap-1.5 text-left"
                  title={title}
                >
                  <div className="aspect-square w-full overflow-hidden rounded-md border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/assets/${child.path}`}
                      alt={title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  </div>
                  <span className="truncate text-[12px] text-muted-foreground group-hover:text-foreground">
                    {title}
                  </span>
                </button>
              );
            }
            const Icon = iconFor(child);
            return (
              <button
                key={child.path}
                onClick={() => navigateTo(child.path)}
                className="group flex flex-col gap-1.5 text-left"
                title={title}
              >
                <div className="aspect-square w-full flex items-center justify-center rounded-md border border-border bg-muted/40 group-hover:bg-muted transition-colors">
                  <Icon className="h-8 w-8 text-muted-foreground/60" />
                </div>
                <span className="truncate text-[12px] text-muted-foreground group-hover:text-foreground">
                  {title}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

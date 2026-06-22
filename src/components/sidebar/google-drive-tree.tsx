"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Cloud, ChevronRight, ChevronDown, Folder, Loader2, FolderOpen, ClipboardCopy, FileText } from "lucide-react";
import { GoogleNodeIcon } from "./google-node-icon";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore, sortTreeNodes } from "@/stores/tree-store";
import type { TreeNode, GoogleDriveSection } from "@/types";
import { cn } from "@/lib/utils";
import { decodeDrivePath } from "@/lib/google-drive/paths";
import { providerLogo } from "@/lib/knowledge-sources/providers";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const DRIVE_CACHE_KEY = "gdrive-tree-cache";
const DRIVE_EXPANDED_KEY = "gdrive-expanded-paths";
// 60-second TTL for Drive tree
const CACHE_TTL_MS = 60_000;
// Fired by the Drive settings UI after a folder is mounted/unmounted so the
// sidebar refetches immediately instead of waiting out the cache TTL.
export const GDRIVE_MOUNTS_CHANGED_EVENT = "cabinet:gdrive-mounts-changed";

function loadExpandedPaths(): Set<string> {
  try {
    const raw = localStorage.getItem(DRIVE_EXPANDED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

// Cache the tree PER ROOM so switching rooms never shows another room's
// connected Drive folders (knowledge sources are per-room now).
function driveCacheKey(cabinetPath: string): string {
  return `${DRIVE_CACHE_KEY}:${cabinetPath || "."}`;
}

function loadCachedSections(cabinetPath: string): GoogleDriveSection[] {
  try {
    const cached = localStorage.getItem(driveCacheKey(cabinetPath));
    return cached ? (JSON.parse(cached) as GoogleDriveSection[]) : [];
  } catch {
    return [];
  }
}

function saveExpandedPaths(paths: Set<string>) {
  try {
    localStorage.setItem(DRIVE_EXPANDED_KEY, JSON.stringify([...paths]));
  } catch { /* ignore */ }
}

interface DriveNodeProps {
  node: TreeNode;
  depth: number;
  padFn: (depth: number) => React.CSSProperties;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  /** Active room — scopes the reveal authorization to this room's mounts. */
  cabinetPath: string;
}

function DriveNode({ node, depth, padFn, expandedPaths, onToggle, cabinetPath }: DriveNodeProps) {
  const selectPage = useTreeStore((s) => s.selectPage);
  const setDriveNode = useTreeStore((s) => s.setDriveNode);
  const setDriveLoading = useTreeStore((s) => s.setDriveLoading);
  const setSection = useAppStore((s) => s.setSection);
  const selectedPath = useTreeStore((s) => s.selectedPath);

  const driveLoading = useTreeStore((s) => s.driveLoading);
  const isDir = node.type === "directory";
  const expanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const isLoading = isSelected && driveLoading;

  const handleClick = () => {
    if (isDir) {
      onToggle(node.path);
      return;
    }
    // Store the Drive node so app-shell can render it without going through
    // the local page loader (which knows nothing about gdrive: paths).
    selectPage(node.path);
    setDriveNode(node);
    setDriveLoading(true);
    setSection({ type: "page" });
  };

  const childrenId = isDir ? `gdrive-children-${node.path.replace(/[^a-z0-9]/gi, "-")}` : undefined;
  const absPath = decodeDrivePath(node.path);

  const doCopyFullPath = () => {
    if (absPath) void navigator.clipboard.writeText(absPath);
  };

  const doReveal = () => {
    if (!absPath) return;
    void fetch("/api/google-drive/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: node.path, cabinet: cabinetPath }),
    });
  };

  return (
    <div>
      <ContextMenu>
      <ContextMenuTrigger>
      <button
        type="button"
        onClick={handleClick}
        style={padFn(depth)}
        aria-expanded={isDir ? expanded : undefined}
        aria-controls={isDir ? childrenId : undefined}
        className={cn(
          "flex w-full items-center gap-1.5 py-1 px-2 text-[12px] text-foreground/75 rounded-md transition-colors cursor-pointer text-left",
          "hover:bg-foreground/[0.03] hover:text-foreground",
          isSelected && "bg-accent text-accent-foreground font-medium"
        )}
      >
        {isDir ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/60" />
        ) : isDir ? (
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : node.frontmatter?.google ? (
          <GoogleNodeIcon kind={node.frontmatter.google.kind} />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        <span className="min-w-0 flex-1 truncate text-start">
          {node.frontmatter?.title || node.name}
        </span>

        {/* Read-only badge for native Google formats */}
        {node.frontmatter?.google && (
          <span className="shrink-0 text-[9px] text-muted-foreground/50 font-mono">
            view
          </span>
        )}
      </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={doCopyFullPath}>
          <ClipboardCopy className="h-4 w-4 me-2" />
          Copy Full Path
        </ContextMenuItem>
        <ContextMenuItem onClick={doReveal}>
          <FolderOpen className="h-4 w-4 me-2" />
          Reveal in File Manager
        </ContextMenuItem>
      </ContextMenuContent>
      </ContextMenu>

      {isDir && expanded && node.children && node.children.length > 0 && (
        <div id={childrenId}>
          {node.children.map((child) => (
            <DriveNode
              key={child.path}
              node={child}
              depth={depth + 1}
              padFn={padFn}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              cabinetPath={cabinetPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface GoogleDriveTreeSectionProps {
  depth: number;
  padFn: (depth: number) => React.CSSProperties;
  itemClass: (active: boolean) => string;
  /** The active room; Drive sources are now per-room. */
  cabinetPath: string;
}

export function GoogleDriveTreeSection({ depth, padFn, cabinetPath }: GoogleDriveTreeSectionProps) {
  const [sections, setSections] = useState<GoogleDriveSection[]>(() => loadCachedSections(cabinetPath));
  const [sectionExpanded, setSectionExpanded] = useState<Record<string, boolean>>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(loadExpandedPaths);
  const lastFetchRef = useRef<number>(0);

  const fetchDriveTree = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchRef.current < CACHE_TTL_MS) return;

    try {
      const qs = cabinetPath ? `?cabinet=${encodeURIComponent(cabinetPath)}` : "";
      const res = await fetch(`/api/google-drive/tree${qs}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as { sections: GoogleDriveSection[] };
      setSections(data.sections);
      lastFetchRef.current = Date.now();
      // Expand new sections by default
      setSectionExpanded((prev) => {
        const next = { ...prev };
        for (const s of data.sections) {
          if (!(s.mountId in next)) next[s.mountId] = true;
        }
        return next;
      });
      try {
        localStorage.setItem(driveCacheKey(cabinetPath), JSON.stringify(data.sections));
      } catch { /* ignore */ }
    } catch { /* ignore */ }
  }, [cabinetPath]);

  // The parent keys this component on the room (key={cabinetPath}), so a room
  // switch remounts it and the useState initializer above reloads that room's
  // cache. Here we just kick off a fresh fetch on mount.
  useEffect(() => {
    // fetchDriveTree awaits the network call before any setState, so there is
    // no synchronous render cascade — the rule false-positives on the async fn.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchDriveTree();
  }, [fetchDriveTree]);

  // Mounting/unmounting a folder in settings fires this; force a refetch
  // (bypassing the cache TTL) so the change shows up without a reload.
  useEffect(() => {
    const onMountsChanged = () => void fetchDriveTree(true);
    window.addEventListener(GDRIVE_MOUNTS_CHANGED_EVENT, onMountsChanged);
    return () =>
      window.removeEventListener(GDRIVE_MOUNTS_CHANGED_EVENT, onMountsChanged);
  }, [fetchDriveTree]);

  const togglePath = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      saveExpandedPaths(next);
      return next;
    });
  };

  const sortAlphabetical = useTreeStore((s) => s.sortAlphabetical);
  const foldersFirst = useTreeStore((s) => s.foldersFirst);

  const sortedSections = useMemo(() => {
    return sections.map((section) => ({
      ...section,
      children: sortTreeNodes(section.children, sortAlphabetical, foldersFirst),
    }));
  }, [sections, sortAlphabetical, foldersFirst]);

  if (sortedSections.length === 0) return null;

  return (
    <div>
      {/* Mounted Drive folders render inline with the cabinet files — each
          mount is a collapsible folder, set apart only by the cloud glyph. */}
      {sortedSections.map((section) => {
        const expanded = sectionExpanded[section.mountId] ?? true;
        const mountChildrenId = `gdrive-mount-${section.mountId.replace(/[^a-z0-9]/gi, "-")}`;
        const sectionLogo = providerLogo(section.provider ?? "google-drive");
        return (
          <div key={section.mountId}>
            <button
              type="button"
              style={padFn(depth)}
              aria-expanded={expanded}
              aria-controls={mountChildrenId}
              onClick={() =>
                setSectionExpanded((prev) => ({
                  ...prev,
                  [section.mountId]: !prev[section.mountId],
                }))
              }
              className="flex w-full items-center gap-1.5 py-1 px-2 text-[12px] text-foreground/60 hover:text-foreground rounded-md transition-colors"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              )}
              {sectionLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sectionLogo} alt="" className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Cloud className="h-3.5 w-3.5 shrink-0 text-sky-400" />
              )}
              {/* text-start: the sidebar inherits text-align:center; without
                  this a short name like "My Drive" floats to the middle. */}
              <span className="min-w-0 flex-1 truncate text-start font-medium">{section.folderName}</span>
            </button>

            {expanded && (
              <div id={mountChildrenId}>
                {section.children.map((node) => (
                  <DriveNode
                    key={node.path}
                    node={node}
                    depth={depth + 1}
                    padFn={padFn}
                    expandedPaths={expandedPaths}
                    onToggle={togglePath}
                    cabinetPath={cabinetPath}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

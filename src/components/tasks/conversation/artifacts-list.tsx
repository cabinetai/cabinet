"use client";

import { useMemo } from "react";
import {
  ChevronRight,
  FilePlus2,
  Pencil,
  Terminal,
  Wrench,
} from "lucide-react";
import { useAppStore, type SelectedSection } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTreeStore } from "@/stores/tree-store";
import { hasOptaleCapability } from "@/lib/optale/capabilities";
import {
  artifactPathToTreePath,
  inferPageTypeFromPath,
  pageTypeColor,
  pageTypeIcon,
} from "@/lib/ui/page-type-icons";
import { usePageMeta } from "@/hooks/use-page-meta";
import { cn } from "@/lib/utils";
import type { Turn, TurnArtifact } from "@/types/tasks";

function basename(p: string): string {
  const cleaned = p.replace(/\/index\.md$/, "").replace(/\.md$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  return parts[parts.length - 1] || p;
}

function directory(p: string): string {
  const cleaned = p.replace(/\/index\.md$/, "").replace(/\.md$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  return parts.slice(0, -1).join(" / ");
}

function formatDuration(durationMs?: number): string {
  if (typeof durationMs !== "number") return "";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

type FileArtifactRecord = {
  path: string;
  title: string;
  dir: string;
  kind: "file-create" | "file-edit" | "page-edit";
  added: number;
  removed: number;
  turns: number[];
};

type ActivityArtifactRecord = {
  id: string;
  turn: number;
  kind: "command" | "tool-call";
  title: string;
  detail?: string;
  status?: string;
};

function collectArtifacts(turns: Turn[]) {
  const files = new Map<string, FileArtifactRecord>();
  const activity: ActivityArtifactRecord[] = [];

  const recordFile = (
    turn: Turn,
    artifact: Extract<TurnArtifact, { path: string }>,
  ) => {
    const current = files.get(artifact.path);
    const added = "added" in artifact ? artifact.added ?? 0 : 0;
    const removed = "removed" in artifact ? artifact.removed ?? 0 : 0;
    if (current) {
      current.added += added;
      current.removed += removed;
      if (!current.turns.includes(turn.turn)) current.turns.push(turn.turn);
      if (current.kind !== "file-create" && artifact.kind === "file-create") {
        current.kind = "file-create";
      }
      return;
    }
    files.set(artifact.path, {
      path: artifact.path,
      title:
        artifact.kind === "page-edit" && "title" in artifact
          ? artifact.title
          : basename(artifact.path),
      dir: directory(artifact.path),
      kind: artifact.kind,
      added,
      removed,
      turns: [turn.turn],
    });
  };

  for (const turn of turns) {
    for (const artifact of turn.artifacts ?? []) {
      if (
        artifact.kind === "file-edit" ||
        artifact.kind === "file-create" ||
        artifact.kind === "page-edit"
      ) {
        recordFile(turn, artifact);
      } else if (artifact.kind === "command") {
        activity.push({
          id: `${turn.id}:command:${activity.length}`,
          turn: turn.turn,
          kind: "command",
          title: "Command run",
          detail: artifact.cmd,
          status:
            artifact.exit === 0
              ? formatDuration(artifact.durationMs)
              : `exit ${artifact.exit}`,
        });
      } else if (artifact.kind === "tool-call") {
        activity.push({
          id: `${turn.id}:tool:${activity.length}`,
          turn: turn.turn,
          kind: "tool-call",
          title: "Tool call",
          detail: `${artifact.tool} ${artifact.target}`.trim(),
        });
      }
    }
  }

  return { files: [...files.values()], activity };
}

function ArtifactSummary({
  files,
  activity,
}: {
  files: FileArtifactRecord[];
  activity: ActivityArtifactRecord[];
}) {
  const created = files.filter((file) => file.kind === "file-create").length;
  const updated = files.length - created;
  const commands = activity.filter((item) => item.kind === "command").length;
  const tools = activity.filter((item) => item.kind === "tool-call").length;

  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <SummaryTile icon={<FilePlus2 className="size-4" />} label="Created" value={created} />
      <SummaryTile icon={<Pencil className="size-4" />} label="Updated" value={updated} />
      <SummaryTile icon={<Terminal className="size-4" />} label="Commands" value={commands} />
      <SummaryTile icon={<Wrench className="size-4" />} label="Tools" value={tools} />
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
      <span className="text-primary">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-foreground">
          {value}
        </span>
        <span className="block truncate text-[10.5px] text-muted-foreground">
          {label}
        </span>
      </span>
    </div>
  );
}

export function ArtifactsList({
  turns,
  returnContext,
}: {
  turns: Turn[];
  returnContext?: SelectedSection;
}) {
  const pushSection = useAppStore((s) => s.pushSection);
  const focusPath = useTreeStore((s) => s.focusPath);
  const loadPage = useEditorStore((s) => s.loadPage);
  const showDiagnostics = hasOptaleCapability("diagnostics.raw");
  const { files, activity } = useMemo(() => collectArtifacts(turns), [turns]);
  const paths = useMemo(() => files.map((file) => file.path), [files]);

  const meta = usePageMeta(paths);

  if (files.length === 0 && activity.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        No artifacts yet. Files and generated outputs will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-5 px-6 py-6">
      <ArtifactSummary files={files} activity={activity} />

      <div className="space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Files
          <span className="ml-2 rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
            {files.length}
          </span>
        </div>
        {files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-[12px] text-muted-foreground">
            No files were created or edited.
          </div>
        ) : (
          files.map((file) => {
            const entry = meta.get(file.path);
            const kind = entry?.type ?? inferPageTypeFromPath(file.path);
            const Icon = pageTypeIcon(kind);
            const color = pageTypeColor(kind);
            const title = entry?.title ?? file.title;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => {
                  const treePath = artifactPathToTreePath(file.path);
                  const from = returnContext ?? useAppStore.getState().section;
                  focusPath(treePath);
                  pushSection({ type: "page", cabinetPath: from.cabinetPath }, from);
                  void loadPage(treePath);
                }}
                className="group flex w-full items-center gap-3 rounded-md bg-card px-3 py-2.5 text-left ring-1 ring-border/60 transition-colors hover:bg-muted/40"
              >
                <Icon className={cn("size-4 shrink-0", color)} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {title}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium",
                        file.kind === "file-create"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {file.kind === "file-create" ? "created" : "updated"}
                    </span>
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
                    <span className="truncate">{file.dir || file.path}</span>
                    {file.added || file.removed ? (
                      <span className="shrink-0 font-mono text-[10.5px]">
                        +{file.added} / -{file.removed}
                      </span>
                    ) : null}
                    <span className="shrink-0">
                      turn {file.turns.join(", ")}
                    </span>
                  </div>
                </div>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })
        )}
      </div>

      {activity.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Activity
            <span className="ml-2 rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
              {activity.length}
            </span>
          </div>
          {activity.map((item) => {
            const Icon = item.kind === "command" ? Terminal : Wrench;
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {item.title}
                    </span>
                    <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                      turn {item.turn}
                    </span>
                    {item.status ? (
                      <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                        {item.status}
                      </span>
                    ) : null}
                  </div>
                  {showDiagnostics && item.detail ? (
                    <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {item.detail}
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Details available in operator diagnostics.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

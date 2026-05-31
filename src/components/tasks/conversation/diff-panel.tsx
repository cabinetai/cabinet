"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, GitCommit } from "lucide-react";
import {
  inferPageTypeFromPath,
  pageTypeColor,
  pageTypeIcon,
} from "@/lib/ui/page-type-icons";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

interface DiffCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  diff: string;
}

interface DiffEntry {
  path: string;
  commits: DiffCommit[];
}

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

function DiffPre({ diff }: { diff: string }) {
  const { t } = useLocale();
  const lines = diff.split("\n");
  return (
    <pre className="max-h-[50vh] overflow-auto rounded-md bg-muted/40 p-3 font-mono text-[11.5px] leading-relaxed">
      {lines.map((line, i) => {
        let tone = "text-foreground/80";
        if (line.startsWith("+++") || line.startsWith("---")) {
          tone = "text-muted-foreground";
        } else if (line.startsWith("+")) {
          tone = "text-emerald-600 dark:text-emerald-400";
        } else if (line.startsWith("-")) {
          tone = "text-red-500/90";
        } else if (line.startsWith("@@")) {
          tone = "text-sky-600 dark:text-sky-400";
        }
        return (
          <div key={i} className={cn("whitespace-pre-wrap break-words", tone)}>
            {line || "\u00a0"}
          </div>
        );
      })}
    </pre>
  );
}

/* eslint-disable react-hooks/static-components */
function ArtifactBlock({ entry }: { entry: DiffEntry }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(entry.commits.length <= 2);
  const kind = inferPageTypeFromPath(entry.path);
  const Icon = pageTypeIcon(kind);
  const color = pageTypeColor(kind);
  const name = basename(entry.path);
  const dir = directory(entry.path);

  return (
    <section className="rounded-xl border border-border/70 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        )}
        <Icon className={cn("size-4 shrink-0", color)} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{name}</div>
          {dir ? (
            <div className="truncate text-[11px] text-muted-foreground/75">{dir}</div>
          ) : null}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px] tabular-nums text-muted-foreground">
          <GitCommit className="size-3" />
          {entry.commits.length} commit{entry.commits.length === 1 ? "" : "s"}
        </span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border/70 p-3">
          {entry.commits.map((commit) => (
            <div key={commit.hash} className="space-y-2">
              <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                <code className="rounded bg-muted px-1 py-px font-mono">
                  {commit.hash.slice(0, 7)}
                </code>
                <span className="truncate">{commit.message}</span>
                <span className="ml-auto shrink-0">{commit.author}</span>
              </div>
              {commit.diff ? (
                <DiffPre diff={commit.diff} />
              ) : (
                <p className="text-[11.5px] text-muted-foreground">{t("tinyExtras:noDiff")}</p>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* eslint-enable react-hooks/static-components */

export function DiffPanel({
  taskId,
  cabinetPath,
}: {
  taskId: string;
  cabinetPath?: string;
}) {
  const { t } = useLocale();
  const [entries, setEntries] = useState<DiffEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (cabinetPath) params.set("cabinetPath", cabinetPath);
    const qs = params.size ? `?${params}` : "";

    fetch(`/api/agents/conversations/${encodeURIComponent(taskId)}/diffs${qs}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: { entries?: DiffEntry[] }) => {
        if (!cancelled) setEntries(data.entries ?? []);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, cabinetPath]);

  if (entries === null) {
    return (
      <div className="px-6 py-12 text-center text-[12px] text-muted-foreground">
        Loading diffs…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        No file changes recorded for this task.
      </div>
    );
  }

  return (
    <div className="space-y-3 px-6 py-6">
      {entries.map((entry) => (
        <ArtifactBlock key={entry.path} entry={entry} />
      ))}
    </div>
  );
}

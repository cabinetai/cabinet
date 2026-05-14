"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Files, PackageOpen, Sparkles, CheckCircle, XCircle, Clock } from "lucide-react";
import type { ConversationDetail } from "@/types/conversations";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { appendConversationCabinetPath } from "@/lib/agents/conversation-identity";
import { buildTaskHash } from "@/lib/navigation/task-route";
import {
  artifactPathToTreePath,
  inferPageTypeFromPath,
  pageTypeColor,
  pageTypeIcon,
} from "@/lib/ui/page-type-icons";
import { usePageMeta } from "@/hooks/use-page-meta";
import { cn } from "@/lib/utils";
import { ConversationApprovalPanel } from "./conversation-approval-panel";
import { useLocale } from "@/i18n/use-locale";

function StatusBadge({ status }: { status: string }) {
  const { t } = useLocale();
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const Icon = isCompleted ? CheckCircle : isFailed ? XCircle : Clock;
  const color = isCompleted
    ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
    : isFailed
      ? "text-red-400 bg-red-400/10 border-red-400/20"
      : "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

export function ConversationResultView({
  detail,
  onOpenArtifact,
  onRefresh,
}: {
  detail: ConversationDetail;
  onOpenArtifact: (path: string) => void;
  onRefresh?: () => void;
}) {
  const { t } = useLocale();
  const transcriptUrl = appendConversationCabinetPath(
    `/agents/conversations/${detail.meta.id}`,
    detail.meta.cabinetPath
  );
  const promptText = detail.request || detail.meta.title;
  const [promptHtml, setPromptHtml] = useState("");
  const artifactTreePaths = useMemo(
    () => detail.artifacts.map((a) => artifactPathToTreePath(a.path)),
    [detail.artifacts]
  );
  const artifactMeta = usePageMeta(artifactTreePaths);

  useEffect(() => {
    if (!promptText) return;
    fetch("/api/ai/render-md", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: promptText }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPromptHtml(data?.html || ""))
      .catch(() => setPromptHtml(""));
  }, [promptText]);

  return (
    <ScrollArea
      className="h-full"
      style={{
        backgroundColor: "var(--background)",
        color: "var(--foreground)",
      }}
    >
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        {/* Prompt */}
        <section className="rounded-2xl border border-border bg-muted/10 p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("conversationResult:prompt")}</h4>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="default"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  window.location.hash = buildTaskHash(detail.meta.id, detail.meta.cabinetPath);
                }}
              >
                Open in task viewer
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => window.open(transcriptUrl, "_blank", "noopener,noreferrer")}
              >
                <Files className="h-3.5 w-3.5" />
                Open transcript
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {promptHtml ? (
            <div
              className="max-h-48 overflow-y-auto overflow-x-hidden prose prose-sm prose-invert max-w-none prose-headings:font-semibold prose-headings:text-foreground prose-h1:text-base prose-h2:text-[13px] prose-h3:text-[12px] prose-p:text-[13px] prose-p:text-foreground/85 prose-li:text-[13px] prose-li:text-foreground/85 prose-a:text-foreground prose-code:text-[11px] prose-code:text-foreground prose-code:bg-background prose-code:px-1 prose-code:rounded prose-pre:bg-background prose-pre:border-0 prose-pre:text-foreground prose-strong:text-foreground"
              dangerouslySetInnerHTML={{ __html: promptHtml }}
            />
          ) : (
            <p className="max-h-48 overflow-y-auto overflow-x-hidden break-words text-[13px] leading-relaxed text-foreground/85">
              {promptText}
            </p>
          )}
        </section>

        {/* Result */}
        <section className="rounded-2xl border border-border bg-background p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h4 className="text-[13px] font-semibold">{t("conversationResult:result")}</h4>
            </div>
            <StatusBadge status={detail.meta.status} />
          </div>

          {detail.meta.summary ? (
            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
              {detail.meta.summary}
            </p>
          ) : detail.meta.status === "running" ? (
            <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[12px] leading-relaxed text-emerald-300">
              Waiting for the CLI to emit a cabinet-block summary. Check the Terminal tab for live output.
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">{t("conversationResult:noSummary")}</p>
          )}

          {detail.meta.contextSummary ? (
            <div className="mt-4 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Context
              </div>
              <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                {detail.meta.contextSummary}
              </p>
            </div>
          ) : null}
        </section>

        {/* Proposed agent actions — sibling view: task-conversation-page.tsx */}
        <ConversationApprovalPanel meta={detail.meta} onApproved={onRefresh} />


        {/* Artifacts */}
        <section className="rounded-2xl border border-border bg-background p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PackageOpen className="h-4 w-4 text-primary" />
              <h4 className="text-[13px] font-semibold">
                Artifacts
                {detail.artifacts.length > 0 && (
                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                    ({detail.artifacts.length})
                  </span>
                )}
              </h4>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => window.open(transcriptUrl, "_blank", "noopener,noreferrer")}
            >
              <Files className="h-3.5 w-3.5" />
              Open transcript
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>

          {detail.artifacts.length > 0 ? (
            <div className="space-y-2">
              {detail.artifacts.map((artifact) => {
                const treePath = artifactPathToTreePath(artifact.path);
                const kind = artifactMeta.get(treePath)?.type ?? inferPageTypeFromPath(artifact.path);
                const Icon = pageTypeIcon(kind);
                const color = pageTypeColor(kind);
                return (
                  <button
                    key={artifact.path}
                    onClick={() => onOpenArtifact(artifact.path)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-muted/40"
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", color)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-foreground">
                        {artifact.label || artifact.path.split("/").pop()}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{artifact.path}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : detail.meta.status === "running" ? (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-[12px] leading-relaxed text-emerald-300">
              Waiting for the CLI to emit a cabinet-block summary. Check the Terminal tab for live output.
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-[12px] text-muted-foreground">
              No artifacts were recorded for this run.
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

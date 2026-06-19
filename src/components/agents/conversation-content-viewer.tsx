"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, Wrench } from "lucide-react";
import { parseTranscript, type Block } from "@/lib/agents/transcript-parser";
import { Markdown } from "@/components/tasks/conversation/markdown";
import { cn } from "@/lib/utils";

const LABEL_COLORS: Record<string, string> = {
  SUMMARY: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  CONTEXT: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  CONTEXT_UPDATE: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  ARTIFACT: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  DECISION: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  LEARNING: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  GOAL_UPDATE: "bg-pink-500/15 text-pink-400 border-pink-500/20",
  MESSAGE_TO: "bg-orange-500/15 text-orange-400 border-orange-500/20",
};

function renderInlineFormatting(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1] && match[2]) {
      parts.push(
        <a
          key={match.index}
          href={match[2]}
          className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary/60"
          target="_blank"
          rel="noopener noreferrer"
        >
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      parts.push(
        <code
          key={match.index}
          className="rounded bg-background px-1 py-0.5 text-[11px] text-foreground"
        >
          {match[3]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function DiffBlock({ block }: { block: Extract<Block, { type: "diff" }> }) {
  const fileMatch = block.header.match(/^diff --git a\/(.+?) b\//);
  const fileName = fileMatch ? fileMatch[1] : "";
  const additions = block.lines.filter((line) => line.kind === "add").length;
  const removals = block.lines.filter((line) => line.kind === "remove").length;

  return (
    <div dir="ltr" className="my-3 overflow-hidden rounded-xl border border-border">
      {fileName ? (
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
          <span className="font-mono text-[11px] font-medium text-foreground">
            {fileName}
          </span>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            {additions > 0 ? <span className="text-emerald-400">+{additions}</span> : null}
            {removals > 0 ? <span className="text-red-400">-{removals}</span> : null}
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto bg-muted/10 font-mono text-[11px] leading-[1.6]">
        {block.lines.map((line, index) => {
          let className = "px-3 whitespace-pre-wrap break-all ";
          switch (line.kind) {
            case "add":
              className += "bg-emerald-500/10 text-emerald-400";
              break;
            case "remove":
              className += "bg-red-500/10 text-red-400";
              break;
            case "hunk":
              className += "bg-blue-500/8 text-blue-400/80";
              break;
            case "header":
              className += "text-muted-foreground/60";
              break;
            default:
              className += "text-foreground/70";
              break;
          }
          return (
            <div key={index} className={className}>
              {line.text || "\u00A0"}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CodeBlock({ block }: { block: Extract<Block, { type: "code" }> }) {
  return (
    <div dir="ltr" className="my-3 overflow-hidden rounded-xl border border-border">
      {block.lang && block.lang !== "text" ? (
        <div className="border-b border-border bg-muted/40 px-3 py-1">
          <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {block.lang}
          </span>
        </div>
      ) : null}
      <pre className="overflow-x-auto bg-muted/10 p-3 font-mono text-[11px] leading-[1.6] text-foreground/85">
        {block.content}
      </pre>
    </div>
  );
}

function StructuredBadge({ label, value }: { label: string; value: string }) {
  const baseLabel = label.split(" ")[0];
  const colorClass =
    LABEL_COLORS[baseLabel] || "bg-muted/30 text-muted-foreground border-border";

  return (
    <div className="my-1.5 flex items-start gap-2">
      <span
        className={`mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${colorClass}`}
      >
        {label}
      </span>
      <span
        dir="auto"
        className="text-[12px] leading-relaxed text-foreground/85 [unicode-bidi:plaintext]"
      >
        {renderInlineFormatting(value)}
      </span>
    </div>
  );
}

function CabinetBlock({ block }: { block: Extract<Block, { type: "cabinet" }> }) {
  return (
    <div className="my-3 space-y-1 rounded-xl border border-border bg-muted/10 p-3">
      {block.fields.map((field, index) => (
        <StructuredBadge key={index} label={field.label} value={field.value} />
      ))}
    </div>
  );
}

const ACTION_BADGE_COLORS: Record<string, string> = {
  LAUNCH_TASK: "bg-pink-500/15 text-pink-400 border-pink-500/20",
  SCHEDULE_JOB: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  SCHEDULE_TASK: "bg-violet-500/15 text-violet-400 border-violet-500/20",
};

function ActionsBlock({ block }: { block: Extract<Block, { type: "actions" }> }) {
  if (block.actions.length === 0) return null;
  return (
    <div className="my-3 space-y-2 rounded-xl border border-border bg-muted/10 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Proposed actions ({block.actions.length})
      </div>
      {block.actions.map((action, index) => {
        const color =
          ACTION_BADGE_COLORS[action.type] ||
          "bg-muted/30 text-muted-foreground border-border";
        const headline =
          action.type === "SEND_EMAIL"
            ? `${action.subject} · ${action.to.join(", ")}`
            : action.type === "SCHEDULE_JOB"
              ? `${action.agent} · ${action.name} · ${action.schedule}`
              : action.type === "SCHEDULE_TASK"
                ? `${action.agent} · ${action.title} · ${action.when}`
                : `${action.agent} · ${action.title}`;
        return (
          <div key={index} className="flex items-start gap-2">
            <span
              className={`mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${color}`}
            >
              {action.type}
            </span>
            <div className="min-w-0">
              <div
                dir="auto"
                className="text-[12px] font-medium text-foreground/90 [unicode-bidi:plaintext]"
              >
                {headline}
              </div>
              <div
                dir="auto"
                className="mt-0.5 whitespace-pre-wrap break-words text-[11px] text-foreground/70 [unicode-bidi:plaintext]"
              >
                {action.type !== "SEND_EMAIL" ? action.prompt : action.body}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <Markdown
      content={content}
      className="text-[14.5px] leading-[1.65] tracking-[-0.005em] text-foreground/95"
    />
  );
}

function TokensBadge({ value }: { value: string }) {
  return (
    <div className="mt-4 flex justify-end">
      <span className="rounded-md border border-border bg-muted/20 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
        {value} tokens
      </span>
    </div>
  );
}

function ToolOutputBlock({
  block,
}: {
  block: Extract<Block, { type: "tool" }>;
}) {
  const [open, setOpen] = useState(false);
  const label =
    block.steps > 1 ? `Ran ${block.steps} steps` : "Ran a command";

  return (
    <div
      dir="ltr"
      className="my-3 overflow-hidden rounded-xl border border-border/60 bg-muted/20"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground/80"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open && "rotate-90"
          )}
        />
        <Wrench aria-hidden="true" className="size-3 shrink-0 opacity-70" />
        <span className="text-[11px] font-medium uppercase tracking-wider">
          {label}
        </span>
        {!open ? (
          <span className="ml-auto text-[10px] opacity-60">show output</span>
        ) : null}
      </button>
      {open ? (
        <pre className="max-h-80 overflow-auto border-t border-border/60 bg-background/40 px-3 py-2 font-mono text-[11px] leading-[1.55] text-muted-foreground/80 whitespace-pre-wrap break-all">
          {block.content || "(no output)"}
        </pre>
      ) : null}
    </div>
  );
}

function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "diff":
            return <DiffBlock key={index} block={block} />;
          case "code":
            return <CodeBlock key={index} block={block} />;
          case "cabinet":
            return <CabinetBlock key={index} block={block} />;
          case "actions":
            return <ActionsBlock key={index} block={block} />;
          case "structured":
            return <StructuredBadge key={index} label={block.label} value={block.value} />;
          case "tokens":
            return <TokensBadge key={index} value={block.value} />;
          case "tool":
            return <ToolOutputBlock key={index} block={block} />;
          case "text":
            return <MarkdownBlock key={index} content={block.content} />;
        }
      })}
    </>
  );
}

export function ConversationContentViewer({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const blocks = useMemo(() => parseTranscript(text), [text]);

  return (
    <div className={className}>
      <BlockRenderer blocks={blocks} />
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Readable diff for non-developers (and a Raw toggle for the rest).
 *
 * Pretty mode parses the unified diff and renders the actual lines with
 * green/red backgrounds — no `+`/`-` prefixes, no `diff --git`/`index`/`@@`
 * machinery. Deletions get a red wash + strike, additions a green wash,
 * unchanged context stays muted. Hunk boundaries become thin "⋯" dividers.
 */

type PrettyLine =
  | { kind: "add" | "del" | "context"; text: string }
  | { kind: "gap" }
  | { kind: "file"; name: string };

function parseUnifiedDiff(diff: string): PrettyLine[] {
  const out: PrettyLine[] = [];
  let inHunk = false;
  let fileCount = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git")) {
      inHunk = false;
      fileCount++;
      // a/x/y.md b/x/y.md → y.md ; only label when the patch spans >1 file
      const m = / b\/(.+)$/.exec(line);
      if (m && fileCount > 1) out.push({ kind: "file", name: m[1] });
      continue;
    }
    if (
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to") ||
      line.startsWith("\\ No newline")
    ) {
      continue;
    }
    if (line.startsWith("@@")) {
      if (out.length && out[out.length - 1].kind !== "gap") out.push({ kind: "gap" });
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+")) out.push({ kind: "add", text: line.slice(1) });
    else if (line.startsWith("-")) out.push({ kind: "del", text: line.slice(1) });
    else out.push({ kind: "context", text: line.startsWith(" ") ? line.slice(1) : line });
  }
  // drop leading/trailing gaps
  while (out[0]?.kind === "gap") out.shift();
  while (out[out.length - 1]?.kind === "gap") out.pop();
  return out;
}

function RawDiff({ diff }: { diff: string }) {
  return (
    <pre className="p-4 text-[11px] font-mono leading-relaxed whitespace-pre-wrap">
      {diff.split("\n").map((line, i) => (
        <div
          key={i}
          className={
            line.startsWith("+") && !line.startsWith("+++")
              ? "text-green-600 dark:text-green-400 bg-green-500/10"
              : line.startsWith("-") && !line.startsWith("---")
                ? "text-red-600 dark:text-red-400 bg-red-500/10"
                : line.startsWith("@@")
                  ? "text-blue-600 dark:text-blue-400"
                  : line.startsWith("diff --git") || line.startsWith("index ")
                    ? "text-muted-foreground/60"
                    : "text-muted-foreground"
          }
        >
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

export function DiffView({ diff }: { diff: string }) {
  const [raw, setRaw] = useState(false);
  const pretty = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const isBinary = /^Binary files .* differ$/m.test(diff);

  if (!diff.trim()) {
    return (
      <p className="p-4 text-[12px] text-muted-foreground">
        No textual changes to show for this entry.
      </p>
    );
  }

  if (isBinary && !pretty.some((l) => l.kind === "add" || l.kind === "del")) {
    return (
      <p className="p-4 text-[12px] text-muted-foreground">
        This file is binary (image, media, …). Its content changed, but
        there&apos;s no text to compare.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-1 px-2 pt-1.5">
        {(["pretty", "raw"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setRaw(mode === "raw")}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
              (mode === "raw") === raw
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            )}
          >
            {mode === "pretty" ? "Changes" : "Raw diff"}
          </button>
        ))}
      </div>
      {raw ? (
        <RawDiff diff={diff} />
      ) : (
        <div className="px-3 pb-3 pt-1.5 text-[12px] leading-relaxed">
          {pretty.map((line, i) => {
            if (line.kind === "gap") {
              return (
                <div
                  key={i}
                  className="my-1 flex items-center gap-2 text-muted-foreground/40"
                  aria-label="unchanged lines skipped"
                >
                  <span className="h-px flex-1 bg-border/70" />
                  <span className="text-[10px]">⋯</span>
                  <span className="h-px flex-1 bg-border/70" />
                </div>
              );
            }
            if (line.kind === "file") {
              return (
                <div key={i} className="mt-2 mb-1 text-[10.5px] font-medium text-muted-foreground">
                  {line.name}
                </div>
              );
            }
            return (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-words rounded-[3px] border-s-2 px-2 py-px font-mono text-[11.5px]",
                  line.kind === "add" &&
                    "border-green-500/70 bg-green-500/10 text-green-900 dark:text-green-200",
                  line.kind === "del" &&
                    "border-red-500/70 bg-red-500/10 text-red-900/80 line-through decoration-red-500/40 dark:text-red-200/80",
                  line.kind === "context" && "border-transparent text-muted-foreground"
                )}
              >
                {line.text || " "}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

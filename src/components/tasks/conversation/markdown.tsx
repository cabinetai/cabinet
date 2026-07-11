"use client";

import { useEffect, useState } from "react";
import { markdownToHtml } from "@/lib/markdown/to-html";
import { cn } from "@/lib/utils";

export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    markdownToHtml(content)
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (html === null) {
    return (
      <div
        dir="auto"
        className={cn("rtl-aware whitespace-pre-wrap", className)}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      dir="auto"
      className={cn(
        "rtl-aware",
        "prose prose-sm max-w-none dark:prose-invert",
        "prose-p:my-2 prose-p:leading-[1.65]",
        "prose-pre:my-3 prose-pre:rounded-lg prose-pre:bg-muted/60 prose-pre:text-[12.5px] prose-pre:text-foreground",
        "prose-code:text-[0.9em] prose-code:bg-muted/60 prose-code:rounded prose-code:px-1 prose-code:py-px prose-code:font-mono prose-code:text-primary prose-code:before:content-none prose-code:after:content-none",
        // ponytail: color inline code + code-block-code via existing --primary token (theme-aware); full syntax highlighting would need shiki/rehype-highlight — add if plain accent isn't enough
        "prose-pre:prose-code:bg-transparent prose-pre:prose-code:p-0 prose-pre:prose-code:text-foreground",
        "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
        "prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground",
        "prose-h1:text-[17px] prose-h2:text-[15.5px] prose-h3:text-[14px]",
        "prose-a:text-primary prose-a:underline prose-a:underline-offset-2",
        "prose-strong:text-foreground prose-strong:font-semibold",
        "prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:text-muted-foreground",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

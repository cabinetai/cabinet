"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { useFindStore } from "@/stores/find-store";
import { findPluginKey } from "./extensions/find";
import { cn } from "@/lib/utils";

interface FindBarProps {
  editor: Editor | null;
}

export function FindBar({ editor }: FindBarProps) {
  const open = useFindStore((s) => s.open);
  const closeFind = useFindStore((s) => s.closeFind);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [stats, setStats] = useState<{ count: number; current: number }>({
    count: 0,
    current: -1,
  });

  // Mirror the plugin's match state into React on every transaction so the
  // "3/12" counter and disabled states stay in sync as the user types.
  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      const ps = findPluginKey.getState(editor.state);
      setStats({
        count: ps?.matches.length ?? 0,
        current: ps?.current ?? -1,
      });
    };
    editor.on("transaction", sync);
    sync();
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor]);

  // On open: seed from the current selection (browser-find behavior), focus
  // and select the input so the user can immediately retype.
  useEffect(() => {
    if (!open || !editor) return;
    const { from, to } = editor.state.selection;
    const seeded =
      from !== to ? editor.state.doc.textBetween(from, to, " ").trim() : "";
    const initial = seeded || query;
    setQuery(initial);
    editor.commands.setFindTerm(initial);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editor]);

  // On close: drop the highlights so a stale match isn't left glowing.
  useEffect(() => {
    if (open || !editor) return;
    editor.commands.clearFind();
  }, [open, editor]);

  const runSearch = useCallback(
    (value: string) => {
      setQuery(value);
      editor?.commands.setFindTerm(value);
    },
    [editor]
  );

  const toggleCase = useCallback(() => {
    const next = !caseSensitive;
    setCaseSensitive(next);
    editor?.commands.setFindCaseSensitive(next);
    editor?.commands.setFindTerm(query);
  }, [caseSensitive, editor, query]);

  const dismiss = useCallback(() => {
    closeFind();
    editor?.commands.focus();
  }, [closeFind, editor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) editor?.commands.findPrev();
      else editor?.commands.findNext();
    } else if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
    }
  };

  if (!open) return null;

  const counter =
    stats.count > 0
      ? `${stats.current + 1}/${stats.count}`
      : query
        ? "0/0"
        : "";

  return (
    <div className="absolute right-4 top-3 z-30 flex items-center gap-1 rounded-lg border border-border bg-popover/95 px-2 py-1.5 shadow-md backdrop-blur supports-[backdrop-filter]:bg-popover/80">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => runSearch(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Find in page"
        aria-label="Find in page"
        className="w-44 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
      />
      <span className="min-w-[3.25rem] select-none text-right text-xs tabular-nums text-muted-foreground">
        {counter}
      </span>
      <button
        type="button"
        onClick={toggleCase}
        title="Match case"
        aria-pressed={caseSensitive}
        className={cn(
          "rounded p-1 hover:bg-accent",
          caseSensitive && "bg-accent text-accent-foreground"
        )}
      >
        <CaseSensitive className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor?.commands.findPrev()}
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
        disabled={stats.count === 0}
        className="rounded p-1 hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor?.commands.findNext()}
        title="Next match (Enter)"
        aria-label="Next match"
        disabled={stats.count === 0}
        className="rounded p-1 hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={dismiss}
        title="Close (Esc)"
        aria-label="Close find"
        className="rounded p-1 hover:bg-accent"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

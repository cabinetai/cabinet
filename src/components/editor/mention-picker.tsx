"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bot, FileText } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/utils";
import { getMentionPickerState, setMentionPickerState } from "./mention-extension";
import type { MentionItem } from "./mention-extension";

interface EditorMentionPickerProps {
  editor: Editor | null;
}

export function EditorMentionPicker({ editor: _editor }: EditorMentionPickerProps) {
  // Re-render whenever the singleton state changes via window event.
  const [tick, setTick] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    window.addEventListener("cabinet:mention-picker-update", handler);
    return () => window.removeEventListener("cabinet:mention-picker-update", handler);
  }, []);

  // Read current state on every render.
  const state = getMentionPickerState();
  const { open, items, selectedIndex, clientRect, command } = state;

  const handleClose = useCallback(() => {
    setMentionPickerState({
      open: false,
      items: [],
      selectedIndex: 0,
      clientRect: null,
      command: null,
    });
  }, []);

  const handleSelect = useCallback(
    (item: MentionItem) => {
      if (!command) return;
      command({ id: item.id, label: item.label });
      handleClose();
    },
    [command, handleClose]
  );

  // Keyboard navigation forwarded from the suggestion plugin via window event.
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent<{ key: string }>).detail?.key;
      if (!key) return;

      const current = getMentionPickerState();
      if (!current.open) return;

      if (key === "Escape") {
        handleClose();
      } else if (key === "ArrowDown") {
        setMentionPickerState({
          selectedIndex: Math.min(current.selectedIndex + 1, current.items.length - 1),
        });
      } else if (key === "ArrowUp") {
        setMentionPickerState({
          selectedIndex: Math.max(current.selectedIndex - 1, 0),
        });
      } else if (key === "Enter") {
        const chosen = current.items[current.selectedIndex];
        if (chosen) handleSelect(chosen);
      }
    };

    window.addEventListener("cabinet:mention-keydown", handler);
    return () => window.removeEventListener("cabinet:mention-keydown", handler);
  }, [handleClose, handleSelect]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open, handleClose]);

  // Tick is consumed by reading state above; keep lint happy.
  void tick;

  if (!open || items.length === 0 || !clientRect) return null;

  // Position the floating panel below the cursor.
  const top = clientRect.bottom + window.scrollY + 4;
  const left = clientRect.left + window.scrollX;

  // Partition items by type for section headers.
  const agents = items.filter((i) => i.type === "agent");
  const pages = items.filter((i) => i.type === "page");

  const sections: { title: string; icon: React.ComponentType<{ className?: string }>; list: MentionItem[] }[] = [
    { title: "Agents", icon: Bot, list: agents },
    { title: "Pages", icon: FileText, list: pages },
  ];

  // Flat list preserving section order — used for computing the keyboard-nav index.
  const flatItems = [...agents, ...pages];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-[280px] bg-popover border border-border rounded-lg shadow-lg py-1 overflow-hidden max-h-[320px] overflow-y-auto"
      style={{ top, left }}
    >
      {sections.map((section) => {
        if (section.list.length === 0) return null;
        const SectionIcon = section.icon;
        return (
          <div key={section.title}>
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground px-3 pt-2 pb-1">
              <SectionIcon className="h-3 w-3" />
              {section.title}
            </div>
            {section.list.map((item) => {
              const flatIndex = flatItems.indexOf(item);
              const isSelected = flatIndex === selectedIndex;
              return (
                <button
                  key={item.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(item);
                  }}
                  onMouseEnter={() =>
                    setMentionPickerState({ selectedIndex: flatIndex })
                  }
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-1.5 text-left transition-colors",
                    isSelected
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium truncate">@{item.label}</p>
                    {item.sublabel && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {item.sublabel}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

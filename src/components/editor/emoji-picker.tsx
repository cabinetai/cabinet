"use client";

import { useEffect, useRef } from "react";
import data from "@emoji-mart/data";
import { Picker } from "emoji-mart";
import { useTheme } from "@/components/theme-provider";

interface Props {
  anchor: { top: number; left?: number; right?: number };
  onSelect: (native: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ anchor, onSelect, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // emoji-mart Picker renders into the element when `new Picker({...})`
    const picker = new Picker({
      data,
      theme: resolvedTheme === "dark" ? "dark" : "light",
      autoFocus: true,
      previewPosition: "none",
      skinTonePosition: "search",
      maxFrequentRows: 2,
      perLine: 8,
      onEmojiSelect: (emoji: { native: string }) => onSelect(emoji.native),
    });
    container.appendChild(picker as unknown as Node);
    return () => {
      if ((picker as unknown as Node).parentNode) {
        (picker as unknown as Node).parentNode!.removeChild(picker as unknown as Node);
      }
    };
  }, [resolvedTheme, onSelect]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Defer to avoid catching the opening click
    const t = window.setTimeout(() => window.addEventListener("mousedown", handle), 10);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousedown", handle);
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="absolute z-50 shadow-xl rounded-lg overflow-hidden"
      style={{ top: anchor.top, left: anchor.left, right: anchor.right }}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}

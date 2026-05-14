"use client";

import { useState, useEffect } from "react";
import { Link as LinkIcon, ExternalLink, Trash2 } from "lucide-react";
import { useLocale } from "@/i18n/use-locale";

interface Props {
  anchor: { top: number; left: number };
  initialUrl?: string;
  onCancel: () => void;
  onApply: (url: string) => void;
  onRemove?: () => void;
}

export function LinkPopover({ anchor, initialUrl = "", onCancel, onApply, onRemove }: Props) {
  const { t } = useLocale();
  const [url, setUrl] = useState(initialUrl);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const apply = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    onApply(trimmed);
  };

  return (
    <div
      className="absolute z-50 w-[340px] bg-popover border border-border rounded-lg shadow-xl overflow-hidden"
      style={{ top: anchor.top, left: anchor.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-[12px] font-medium">
          <LinkIcon className="w-3.5 h-3.5" />
          {initialUrl ? "Edit link" : "Add link"}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="p-3 space-y-2">
        <input
          type="url"
          autoFocus
          value={url}
          placeholder="https://example.com"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={apply}
            disabled={!url.trim()}
            className="flex-1 py-1.5 text-[12px] rounded-md bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
          >
            {initialUrl ? "Update" : "Add link"}
          </button>
          {initialUrl && (
            <>
              <a
                href={initialUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground"
                title={t("linkPopover:openLink")}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              {onRemove && (
                <button
                  type="button"
                  onClick={onRemove}
                  className="p-1.5 rounded-md border border-border hover:bg-accent text-destructive"
                  title={t("linkPopover:removeLink")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { detectEmbed, providerLabel } from "@/lib/embeds/detect";
import { Sparkles, Globe } from "lucide-react";
import { useLocale } from "@/i18n/use-locale";

interface Props {
  anchor: { top: number; left: number };
  onCancel: () => void;
  onInsert: (url: string) => void;
}

const SAMPLES = [
  { label: "YouTube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  { label: "X / Twitter", url: "https://x.com/tiptap_editor/status/1000000000000000000" },
  { label: "Vimeo", url: "https://vimeo.com/76979871" },
  { label: "Loom", url: "https://www.loom.com/share/abcdef123456" },
];

export function EmbedPopover({ anchor, onCancel, onInsert }: Props) {
  const { t } = useLocale();
  const [url, setUrl] = useState("");
  const detected = useMemo(() => (url ? detectEmbed(url) : null), [url]);

  const insert = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    onInsert(trimmed);
  };

  return (
    <div
      className="absolute z-50 w-[420px] bg-popover border border-border rounded-lg shadow-xl overflow-hidden"
      style={{ top: anchor.top, left: anchor.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-[12px] font-medium">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> Embed anything
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
          placeholder={t("embedPopover:placeholder")}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              insert();
            } else if (e.key === "Escape") onCancel();
          }}
          className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        <div className="flex items-center gap-2 text-[11px]">
          {detected ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              <Globe className="w-3 h-3" /> Detected: {providerLabel(detected.provider)}
            </span>
          ) : url.trim() ? (
            <span className="text-muted-foreground">{t("embedPopover:notValidUrl")}</span>
          ) : (
            <span className="text-muted-foreground">{t("embedPopover:anyUrlWorks")}</span>
          )}
          <button
            type="button"
            onClick={insert}
            disabled={!detected}
            className="ml-auto px-2.5 py-1 text-[11px] rounded-md bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
          >
            Insert
          </button>
        </div>

        <div className="pt-2 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Supported providers
          </div>
          <div className="flex flex-wrap gap-1">
            {SAMPLES.map((s) => (
              <span
                key={s.label}
                className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground"
              >
                {s.label}
              </span>
            ))}
            <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">TikTok</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">{t("embedPopover:facebook")}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">{t("embedPopover:instagram")}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">{t("embedPopover:spotify")}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">{t("embedPopover:anyIframe")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

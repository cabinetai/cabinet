"use client";

import { useRef, useState } from "react";
import { Upload, Link as LinkIcon, Clipboard } from "lucide-react";
import { cn } from "@/lib/utils";

export type MediaKind = "image" | "video" | "file";

interface Props {
  kind: MediaKind;
  pagePath: string;
  onCancel: () => void;
  onInsert: (payload: { url: string; alt?: string; mimeType?: string }) => void;
  anchor: { top: number; left?: number; right?: number };
}

async function uploadFile(
  pagePath: string,
  file: File
): Promise<{ url: string; filename: string } | null> {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await fetch(`/api/upload/${pagePath}`, { method: "POST", body: formData });
    if (!res.ok) return null;
    const data = await res.json();
    return { url: data.url, filename: data.filename };
  } catch {
    return null;
  }
}

function mimeFor(kind: MediaKind) {
  if (kind === "image") return "image/*";
  if (kind === "video") return "video/*";
  return "*/*";
}

function titleFor(kind: MediaKind) {
  if (kind === "image") return "Insert image";
  if (kind === "video") return "Insert video";
  return "Attach file";
}

export function MediaPopover({ kind, pagePath, onCancel, onInsert, anchor }: Props) {
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setErr(null);
    try {
      const file = files[0];
      const result = await uploadFile(pagePath, file);
      if (!result) {
        setErr("Upload failed.");
        return;
      }
      onInsert({ url: result.url, alt: file.name, mimeType: file.type });
    } finally {
      setUploading(false);
    }
  };

  const handleUrl = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    onInsert({ url: trimmed });
  };

  return (
    <div
      className="absolute z-50 w-[360px] bg-popover border border-border rounded-lg shadow-xl overflow-hidden"
      style={{ top: anchor.top, left: anchor.left, right: anchor.right }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="text-[12px] font-medium">{titleFor(kind)}</div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="flex border-b border-border bg-muted/30">
        <button
          type="button"
          onClick={() => setTab("upload")}
          className={cn(
            "flex-1 py-1.5 text-[11px] flex items-center justify-center gap-1.5 transition-colors",
            tab === "upload"
              ? "bg-background text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Upload className="w-3 h-3" /> Upload
        </button>
        <button
          type="button"
          onClick={() => setTab("url")}
          className={cn(
            "flex-1 py-1.5 text-[11px] flex items-center justify-center gap-1.5 transition-colors",
            tab === "url"
              ? "bg-background text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LinkIcon className="w-3 h-3" /> From URL
        </button>
      </div>

      {tab === "upload" ? (
        <div
          className="p-4"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleFiles(e.dataTransfer.files);
          }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full border-2 border-dashed border-border rounded-md py-6 flex flex-col items-center justify-center text-muted-foreground hover:bg-accent/30 transition-colors"
          >
            <Upload className="w-5 h-5 mb-1.5" />
            <span className="text-[12px] font-medium">
              {uploading ? "Uploading…" : `Click to upload ${kind}`}
            </span>
            <span className="text-[10px] mt-0.5">or drop a file here</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={mimeFor(kind)}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {err && <div className="mt-2 text-[11px] text-destructive">{err}</div>}
        </div>
      ) : (
        <div className="p-3 space-y-2">
          <input
            type="url"
            autoFocus
            value={url}
            placeholder={
              kind === "image"
                ? "https://example.com/image.png"
                : kind === "video"
                  ? "https://example.com/video.mp4"
                  : "https://example.com/file"
            }
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleUrl();
              } else if (e.key === "Escape") {
                onCancel();
              }
            }}
            className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="button"
            onClick={handleUrl}
            disabled={!url.trim()}
            className="w-full py-1.5 text-[12px] rounded-md bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
          >
            Insert
          </button>
        </div>
      )}

      <div className="px-3 py-2 border-t border-border bg-muted/30 text-[10px] text-muted-foreground flex items-start gap-1.5">
        <Clipboard className="w-3 h-3 shrink-0 mt-[1px]" />
        <span>
          Tip: you can also <strong className="text-foreground/80">paste</strong> or{" "}
          <strong className="text-foreground/80">drag &amp; drop</strong> files directly into the page. They&apos;ll be saved alongside this page automatically.
        </span>
      </div>
    </div>
  );
}

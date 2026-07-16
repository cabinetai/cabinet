"use client";

import {
  X,
  Loader2,
  AlertCircle,
  File as FileIcon,
  FileText,
  FileAudio,
  FileVideo,
  FileCode,
  FileImage,
} from "lucide-react";
import type { ComposerAttachment } from "./use-composer-attachments";

interface AttachmentChipsProps {
  attachments: ComposerAttachment[];
  onRemove: (id: string) => void;
}

function iconForMime(mime: string) {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime === "application/pdf" || mime.startsWith("text/")) return FileText;
  if (
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("xml")
  ) {
    return FileCode;
  }
  return FileIcon;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentChips({ attachments, onRemove }: AttachmentChipsProps) {
  if (attachments.length === 0) return null;
  return (
    <>
      {attachments.map((attachment) => {
        const isImage = attachment.mime.startsWith("image/") && attachment.previewUrl;
        const Icon = iconForMime(attachment.mime);
        const uploading = attachment.status === "uploading";
        const errored = attachment.status === "error";

        return (
          <span
            key={attachment.id}
            title={
              errored
                ? `${attachment.displayName}: ${attachment.error || "Upload failed"}`
                : `${attachment.displayName} (${formatSize(attachment.size)})`
            }
            className={
              "group relative inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition-colors " +
              (errored
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border/60 bg-muted text-foreground")
            }
          >
            {isImage ? (
              <span className="relative h-5 w-5 overflow-hidden rounded-sm ring-1 ring-border/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.previewUrl}
                  alt={attachment.displayName}
                  className="h-full w-full object-cover"
                />
                {uploading ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <Loader2 className="h-3 w-3 animate-spin text-foreground" />
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="relative inline-flex h-4 w-4 items-center justify-center">
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : errored ? (
                  <AlertCircle className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </span>
            )}
            <span className="max-w-[14ch] truncate">{attachment.displayName}</span>
            <button
              onClick={() => onRemove(attachment.id)}
              aria-label={`Remove ${attachment.displayName}`}
              className="ms-0.5 inline-flex h-3.5 w-0 items-center justify-center overflow-hidden rounded-full opacity-0 transition-all duration-150 group-hover:w-3.5 group-hover:opacity-100 hover:bg-foreground/10"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        );
      })}
    </>
  );
}

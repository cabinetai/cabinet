"use client";

import {
  File as FileIcon,
  FileText,
  FileAudio,
  FileVideo,
  FileCode,
  FileImage,
} from "lucide-react";

function encodeVirtualPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function filenameOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

function extOf(path: string): string {
  const name = filenameOf(path).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot);
}

function isImagePath(path: string): boolean {
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"].includes(
    extOf(path)
  );
}

function iconForExt(ext: string) {
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"].includes(ext))
    return FileImage;
  if ([".mp3", ".wav", ".m4a", ".ogg", ".flac"].includes(ext)) return FileAudio;
  if ([".mp4", ".mov", ".webm", ".mkv", ".avi"].includes(ext)) return FileVideo;
  if ([".pdf", ".txt", ".md"].includes(ext)) return FileText;
  if (
    [".json", ".js", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs", ".sh", ".yaml", ".yml", ".xml", ".html", ".css"].includes(
      ext
    )
  ) {
    return FileCode;
  }
  return FileIcon;
}

interface TurnAttachmentsProps {
  paths: string[];
}

export function TurnAttachments({ paths }: TurnAttachmentsProps) {
  if (!paths || paths.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {paths.map((virtualPath) => {
        const name = filenameOf(virtualPath);
        const assetUrl = `/api/assets/${encodeVirtualPath(virtualPath)}`;
        if (isImagePath(virtualPath)) {
          return (
            <a
              key={virtualPath}
              href={assetUrl}
              target="_blank"
              rel="noreferrer"
              title={name}
              className="group relative block overflow-hidden rounded-lg border border-border/60 bg-muted/40 transition-colors hover:border-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl}
                alt={name}
                className="block h-32 w-auto max-w-[240px] object-cover"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-background/85 via-background/40 to-transparent px-2 py-1 text-[10px] text-foreground/80 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="truncate">{name}</span>
              </span>
            </a>
          );
        }
        const Icon = iconForExt(extOf(virtualPath));
        return (
          <a
            key={virtualPath}
            href={assetUrl}
            target="_blank"
            rel="noreferrer"
            title={name}
            className="inline-flex max-w-[240px] items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 text-[12px] text-foreground/85 transition-colors hover:border-border hover:bg-muted/60"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{name}</span>
          </a>
        );
      })}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import {
  Folder,
  FileText,
  FileSpreadsheet,
  HardDriveDownload,
  ChevronRight,
  Check,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Hint,
  MockWindow,
  BtnMock,
  FieldMock,
} from "@/components/integrations/hub/setup-art-primitives";

/** Official Google Drive for Desktop installers + setup help. */
const DRIVE_DOWNLOAD = {
  mac: "https://dl.google.com/drive-file-stream/GoogleDrive.dmg",
  win: "https://dl.google.com/drive-file-stream/GoogleDriveSetup.exe",
} as const;

/** Best-effort OS sniff so the matching installer is the primary button. Safe to
 *  call in render: this art only renders client-side (the hub detail page is
 *  reached via hash routing + a store selection, never in SSR HTML). */
function detectOS(): "mac" | "win" | null {
  if (typeof navigator === "undefined") return null;
  const ua = (navigator.userAgent || navigator.platform || "").toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "win";
  return null;
}

/**
 * "Mini-mockups" for the Google Drive (for Desktop) setup guide — tiny,
 * theme-aware renditions of the Drive download page, the offline right-click
 * menu, Cabinet's folder picker, and the sidebar, so a non-developer can see
 * exactly what each step looks like. Pure markup, no screenshots.
 * `step` is the 0-based index into the catalog's google-drive `setupSteps` —
 * keep these aligned with that order.
 */
export function GoogleDriveStepArt({ step, brand }: { step: number; brand: string }) {
  const os = detectOS();
  switch (step) {
    case 0: // Install Google Drive for Desktop
      return (
        <MockWindow title="Google Drive for Desktop" brand={brand}>
          <div className="flex flex-col items-center gap-2.5 py-1 text-center">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-2xl"
              style={{ background: `${brand}1f` }}
            >
              <HardDriveDownload className="h-4 w-4" style={{ color: brand }} />
            </span>
            <div className="flex w-full gap-1.5">
              <DownloadBtn href={DRIVE_DOWNLOAD.mac} brand={brand} primary={os !== "win"}>
                macOS
              </DownloadBtn>
              <DownloadBtn href={DRIVE_DOWNLOAD.win} brand={brand} primary={os === "win"}>
                Windows
              </DownloadBtn>
            </div>
          </div>
          <Hint brand={brand}>
            Install it and sign in — it mounts your Drive as a local folder.
          </Hint>
        </MockWindow>
      );

    case 1: // Make folders available offline
      return (
        <MockWindow title="Reports — right-click" brand={brand}>
          <div className="overflow-hidden rounded-md border border-border text-[10.5px]">
            <MenuRow>Open</MenuRow>
            <MenuRow>Share</MenuRow>
            <MenuRow active brand={brand}>
              <Check className="h-3 w-3" /> Available offline
            </MenuRow>
          </div>
          <Hint brand={brand}>
            Right-click a folder and mark it <b>Available offline</b> so files are on disk.
          </Hint>
        </MockWindow>
      );

    case 2: // Pick folders to show in Cabinet
      return (
        <MockWindow title="Add Google Drive folder" brand={brand}>
          <FieldMock>…/My Drive</FieldMock>
          <div className="mt-1.5 overflow-hidden rounded-md border border-border">
            <FolderRow active brand={brand}>
              Reports
            </FolderRow>
            <FolderRow brand={brand}>Finance</FolderRow>
            <FolderRow brand={brand}>Design</FolderRow>
          </div>
          <BtnMock brand={brand} full>
            Add folder
          </BtnMock>
          <Hint brand={brand}>
            Pick folders here in the panel on the right →
          </Hint>
        </MockWindow>
      );

    case 3: // Open files in Cabinet
      return (
        <MockWindow title="Cabinet · Sidebar" brand={brand}>
          <div className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Google Drive
          </div>
          <div className="mt-1.5 space-y-0.5">
            <FileRow active brand={brand} icon={<FileText className="h-3 w-3" />}>
              Q3 Report.pdf
            </FileRow>
            <FileRow brand={brand} icon={<FileSpreadsheet className="h-3 w-3" />}>
              Budget.xlsx
            </FileRow>
            <FileRow brand={brand} icon={<FileText className="h-3 w-3" />}>
              Roadmap.docx
            </FileRow>
          </div>
          <Hint brand={brand}>
            Click any file — it opens inline in Cabinet&apos;s viewer.
          </Hint>
        </MockWindow>
      );

    default:
      return null;
  }
}

/* ── primitives (Google-Drive-specific) ─────────────────────────────────── */

/** A real download link styled like a button; `primary` is brand-filled. */
function DownloadBtn({
  href,
  brand,
  primary,
  children,
}: {
  href: string;
  brand: string;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors",
        primary
          ? "text-white"
          : "border border-border bg-background text-foreground hover:bg-accent",
      )}
      style={primary ? { background: brand } : undefined}
    >
      <Download className="h-3 w-3" />
      {children}
    </a>
  );
}

/** A right-click menu row; `active` tints it with the brand color. */
function MenuRow({
  active,
  brand,
  children,
}: {
  active?: boolean;
  brand?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 text-foreground border-b border-border/50 last:border-b-0",
        active && "font-medium",
      )}
      style={active && brand ? { background: `${brand}14`, color: brand } : undefined}
    >
      {children}
    </div>
  );
}

/** A folder row in the picker; `active` is the highlighted/selected one. */
function FolderRow({
  active,
  brand,
  children,
}: {
  active?: boolean;
  brand: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 text-[10.5px] text-foreground border-b border-border/50 last:border-b-0",
      )}
      style={active ? { background: `${brand}14` } : undefined}
    >
      <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: brand }} />
      <span className="flex-1 truncate">{children}</span>
      {active && <Check className="h-3 w-3" style={{ color: brand }} />}
      {!active && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
    </div>
  );
}

/** A sidebar file row; `active` is the open/selected file. */
function FileRow({
  active,
  brand,
  icon,
  children,
}: {
  active?: boolean;
  brand: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded px-1.5 py-1 text-[10.5px]",
        active ? "font-medium text-foreground" : "text-muted-foreground",
      )}
      style={active ? { background: `${brand}14` } : undefined}
    >
      <span className="shrink-0" style={{ color: active ? brand : undefined }}>
        {icon}
      </span>
      <span className="flex-1 truncate">{children}</span>
    </div>
  );
}

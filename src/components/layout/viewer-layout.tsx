"use client";

import type { ReactNode } from "react";
import { ContentSheet } from "@/components/layout/content-sheet";

/**
 * Standard file-viewer scaffold. The toolbar sits on the desk (the transparent
 * manila gutter), and only the body floats in an elevated ContentSheet — the
 * same shape the markdown editor and folder views already use, so the content
 * leads and every viewer's chrome reads as one system.
 *
 * Viewers that render through this opt OUT of app-shell's whole-view
 * ContentSheet wrap (they're listed in `bareLayout`); otherwise the body would
 * be double-sheeted and the toolbar would sit back on the bright page.
 */
export function ViewerLayout({
  toolbar,
  children,
  sheetClassName,
}: {
  toolbar: ReactNode;
  children: ReactNode;
  sheetClassName?: string;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {toolbar}
      <ContentSheet className={sheetClassName}>{children}</ContentSheet>
    </div>
  );
}

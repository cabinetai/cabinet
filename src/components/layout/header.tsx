"use client";

import { Copy, Download, FileCode, FileDown, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorStore } from "@/stores/editor-store";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { useLocale } from "@/i18n/use-locale";

export function Header() {
  const { t } = useLocale();
  const { frontmatter, content, currentPath } = useEditorStore();

  const handleCopyMarkdown = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
  };

  const handleCopyForLLM = async () => {
    if (!content || !currentPath) return;
    const title =
      frontmatter?.title ||
      currentPath.split("/").pop()?.replace(/\.md$/, "") ||
      "Untitled";
    const body = content.replace(
      /\]\((\.\/)?([^)\s]+\.md)\)/g,
      "]($2 — also in this cabinet)"
    );
    const out = `# ${title}\n\nSource: cabinet://${currentPath}\n\n---\n\n${body}`;
    await navigator.clipboard.writeText(out);
    const bytes = new TextEncoder().encode(out).length;
    const display = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    window.dispatchEvent(
      new CustomEvent("cabinet:toast", {
        detail: {
          kind: "success",
          message: t("editor:header.copiedForLlmToast", { size: display }),
        },
      })
    );
  };

  const handleCopyHTML = async () => {
    if (!content) return;
    // Convert the LIVE editor content (not a refetched saved copy, which would
    // miss unsaved edits) and pass the page path so relative image/link URLs
    // resolve instead of pasting in broken (#031).
    const { markdownToHtml } = await import("@/lib/markdown/to-html");
    const html = await markdownToHtml(content, currentPath || undefined);
    await navigator.clipboard.writeText(html);
  };

  const handleDownloadMarkdown = () => {
    // Guard on content only — a valid page with no YAML frontmatter must still
    // download; derive the filename from the title or the path basename (#032).
    if (!content) return;
    const base =
      frontmatter?.title ||
      currentPath?.split("/").pop()?.replace(/\.md$/, "") ||
      "page";
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ViewerToolbar path={currentPath || undefined} showBreadcrumb={!!currentPath}>
      {currentPath && (
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={t("editor:header.exportPage")} title={t("editor:header.exportPage")} className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer">
            <Download className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 [&_[role=menuitem]]:whitespace-nowrap">
            <DropdownMenuItem onClick={handleCopyMarkdown}>
              <Copy className="h-4 w-4 mr-2" />
              {t("editor:header.copyMarkdown")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyForLLM}>
              <Sparkles className="h-4 w-4 mr-2" />
              {t("editor:header.copyForLlms")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyHTML}>
              <FileCode className="h-4 w-4 mr-2" />
              {t("editor:header.copyAsHtml")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadMarkdown}>
              <Download className="h-4 w-4 mr-2" />
              {t("editor:header.downloadMarkdown")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={async () => {
              const editorEl = document.querySelector(".tiptap");
              if (!editorEl) return;
              const { toPng } = await import("html-to-image");
              const { jsPDF } = await import("jspdf");
              const imgData = await toPng(editorEl as HTMLElement, {
                backgroundColor: "#ffffff",
                pixelRatio: 2,
                skipFonts: true,
              });
              const img = new Image();
              img.src = imgData;
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error("Failed to load rendered page image for PDF export"));
              });
              const pdf = new jsPDF("p", "mm", "a4");
              const pdfWidth = pdf.internal.pageSize.getWidth();
              const pdfHeight = pdf.internal.pageSize.getHeight();
              // Total height of the rendered image when scaled to the page width.
              const imgHeight = (img.height * pdfWidth) / img.width;

              // Map the editor's CSS pixels to PDF millimetres so we can locate
              // images in the same coordinate space as the page slices.
              const mmPerPx = pdfWidth / (editorEl as HTMLElement).clientWidth;
              const editorTop = (editorEl as HTMLElement).getBoundingClientRect().top;
              // Vertical extents (in mm) of elements that should not be split
              // across a page boundary, sorted top-to-bottom.
              const atomicRanges = Array.from(editorEl.querySelectorAll("img"))
                .map((el) => {
                  const r = el.getBoundingClientRect();
                  return {
                    top: (r.top - editorTop) * mmPerPx,
                    bottom: (r.bottom - editorTop) * mmPerPx,
                  };
                })
                .sort((a, b) => a.top - b.top);

              // Walk down the rendered image, choosing where each page ends.
              // When a default page boundary would cut through an image, end the
              // page just above that image so it moves wholly to the next page.
              const EPS = 0.5;
              let start = 0;
              let first = true;
              while (start < imgHeight - EPS) {
                let end = start + pdfHeight;
                if (end < imgHeight) {
                  for (const range of atomicRanges) {
                    // Only adjust for an image that straddles this boundary and
                    // can fit on a page of its own (taller-than-page images are
                    // left to split, as they cannot be avoided).
                    if (
                      range.top < end - EPS &&
                      range.bottom > end + EPS &&
                      range.top > start + EPS &&
                      range.bottom - range.top <= pdfHeight
                    ) {
                      end = range.top;
                      break;
                    }
                  }
                } else {
                  end = imgHeight;
                }
                const sliceHeight = end - start;
                if (!first) pdf.addPage();
                first = false;
                // Place the full image shifted up so this slice aligns with the
                // top of the page; the page clips everything outside it.
                pdf.addImage(imgData, "PNG", 0, -start, pdfWidth, imgHeight);
                // Mask the strip below the slice so a pushed-down image does not
                // bleed onto the bottom of the current page.
                if (sliceHeight < pdfHeight - EPS) {
                  pdf.setFillColor(255, 255, 255);
                  pdf.rect(0, sliceHeight, pdfWidth, pdfHeight - sliceHeight, "F");
                }
                start = end;
              }
              pdf.save(`${frontmatter?.title || "page"}.pdf`);
            }}>
              <FileDown className="h-4 w-4 mr-2" />
              {t("editor:header.downloadPdf")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </ViewerToolbar>
  );
}

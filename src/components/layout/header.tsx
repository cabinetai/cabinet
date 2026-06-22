"use client";

import { Copy, Download, FileCode, FileDown, FileText, Sparkles } from "lucide-react";
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
    // Convert markdown to HTML for clipboard
    const res = await fetch(`/api/pages/${currentPath}`);
    if (res.ok) {
      const data = await res.json();
      // Use the remark pipeline via a simple conversion
      const { markdownToHtml } = await import("@/lib/markdown/to-html");
      const html = await markdownToHtml(data.content);
      await navigator.clipboard.writeText(html);
    }
  };

  const handleDownloadMarkdown = () => {
    if (!content || !frontmatter) return;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${frontmatter.title || "page"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMyST = async (format: "pdf" | "docx" | "tex" | "html") => {
    if (!currentPath) return;

    window.dispatchEvent(
      new CustomEvent("cabinet:toast", {
        detail: {
          kind: "info",
          message: `Exporting via MyST (${format.toUpperCase()})...`,
        },
      })
    );

    try {
      const res = await fetch(`/api/export/myst?path=${encodeURIComponent(currentPath)}&format=${format}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Export failed");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      let filename = `${frontmatter?.title || "export"}.${format}`;
      if (disposition && disposition.indexOf("filename=") !== -1) {
        const parts = disposition.split("filename=");
        if (parts[1]) filename = parts[1].replace(/['"]/g, "");
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: {
            kind: "success",
            message: "Export completed successfully!",
          },
        })
      );
    } catch (error: any) {
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: {
            kind: "error",
            message: error.message || "Export failed",
          },
        })
      );
    }
  };

  return (
    <ViewerToolbar path={currentPath || undefined} showBreadcrumb={!!currentPath}>
      {currentPath && (
        <>
          <DropdownMenu>
          <DropdownMenuTrigger aria-label={t("editor:header.exportPage")} title={t("editor:header.exportPage")} className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer">
            <Download className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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
            <DropdownMenuItem onClick={() => handleExportMyST("pdf")}>
              <FileDown className="h-4 w-4 mr-2" />
              Export PDF (MyST)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportMyST("docx")}>
              <FileText className="h-4 w-4 mr-2" />
              Export Word (MyST)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportMyST("tex")}>
              <FileCode className="h-4 w-4 mr-2" />
              Export LaTeX (MyST)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={async () => {
              const editorEl = document.querySelector(".tiptap");
              if (!editorEl) return;
              const el = editorEl as HTMLElement;
              const { toPng } = await import("html-to-image");
              const { jsPDF } = await import("jspdf");
              const pixelRatio = 2;
              // The table uses table-layout:fixed/width:100%, so it never
              // overflows — the content width equals the editor's. Use the
              // precise rendered width (rounded up + small buffer) so headings
              // that just fit on one line don't wrap and overlap the table;
              // a floored scrollWidth would shave a sub-pixel and force a wrap.
              const rect = el.getBoundingClientRect();
              const fullWidth = Math.ceil(rect.width) + 2;
              const fullHeight = el.scrollHeight;
              // Build the @font-face CSS ourselves from same-origin stylesheets,
              // skipping any cross-origin sheet whose `cssRules` access throws a
              // SecurityError. Passing this as `fontEmbedCSS` short-circuits
              // html-to-image's own stylesheet scan (which would throw that
              // error), while still embedding the real fonts — keeping correct
              // metrics so headings don't reflow and overlap the table.
              let fontEmbedCSS = "";
              for (const sheet of Array.from(document.styleSheets)) {
                let rules: CSSRuleList | null = null;
                try {
                  rules = sheet.cssRules;
                } catch {
                  continue; // cross-origin sheet — not readable, skip it
                }
                if (!rules) continue;
                for (const rule of Array.from(rules)) {
                  if (rule instanceof CSSFontFaceRule) {
                    fontEmbedCSS += `${rule.cssText}\n`;
                  }
                }
              }
              const imgData = await toPng(el, {
                backgroundColor: "#ffffff",
                pixelRatio,
                cacheBust: true,
                fontEmbedCSS,
                width: fullWidth,
                height: fullHeight,
                style: {
                  margin: "0",
                  maxWidth: "none",
                  width: `${fullWidth}px`,
                },
              });
              const img = new Image();
              img.src = imgData;
              await new Promise((resolve) => { img.onload = resolve; });
              // The image's natural on-screen width in mm (CSS px → mm at 96 DPI).
              const naturalWidthMm = (img.width / pixelRatio) / 96 * 25.4;
              const PORTRAIT_WIDTH = 210; // A4 portrait width in mm
              const portraitScale = PORTRAIT_WIDTH / naturalWidthMm;
              // If portrait would shrink the content below 75%, use landscape
              // (wider page) so wide tables stay readable.
              const orientation = portraitScale < 0.75 ? "l" : "p";
              const pdf = new jsPDF(orientation, "mm", "a4");
              const pdfWidth = pdf.internal.pageSize.getWidth();
              const pageHeight = pdf.internal.pageSize.getHeight();
              const pdfHeight = (img.height * pdfWidth) / img.width;
              // Split tall content (e.g. large tables) across multiple pages
              // by repeatedly placing the same image shifted up by one page.
              let heightLeft = pdfHeight;
              let position = 0;
              pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
              heightLeft -= pageHeight;
              while (heightLeft > 0) {
                position -= pageHeight;
                pdf.addPage();
                pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
                heightLeft -= pageHeight;
              }
              pdf.save(`${frontmatter?.title || "page"}.pdf`);
            }}>
              <FileDown className="h-4 w-4 mr-2" />
              {t("editor:header.downloadPdf")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </>
      )}
    </ViewerToolbar>
  );
}

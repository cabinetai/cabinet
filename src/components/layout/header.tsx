"use client";

import { Copy, Download, FileCode, FileDown, FileText, Asterisk } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorStore } from "@/stores/editor-store";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import {
  copyMarkdown,
  copyForLlm,
  copyAsHtml,
  downloadMarkdown,
  downloadMarkdownBundle,
  formatBytes,
} from "@/lib/markdown/page-export";
import { useLocale } from "@/i18n/use-locale";
import { getExportSettings } from "@/lib/ui/export-settings";
import {
  preparePrintExport,
  sanitizePdfFilename,
} from "@/lib/markdown/print-export";

export function Header() {
  const { t } = useLocale();
  const { frontmatter, content, currentPath, assetBase } = useEditorStore();

  // Live editor content (unsaved edits included) drives every export. The
  // sidebar right-click "Download" submenu shares these same actions, fetching
  // the saved file instead (see page-export.ts).
  const pageTitle =
    frontmatter?.title ||
    currentPath?.split("/").pop()?.replace(/\.md$/, "") ||
    "Untitled";

  const handleCopyMarkdown = () => {
    if (content) void copyMarkdown(content);
  };

  const handleCopyForLLM = async () => {
    if (!content || !currentPath) return;
    const bytes = await copyForLlm(content, currentPath, pageTitle);
    window.dispatchEvent(
      new CustomEvent("cabinet:toast", {
        detail: {
          kind: "success",
          message: t("editor:header.copiedForLlmToast", { size: formatBytes(bytes) }),
        },
      })
    );
  };

  const handleCopyHTML = () => {
    if (content) void copyAsHtml(content, currentPath || "");
  };

  const handleDownloadMarkdown = async (bundle = false) => {
    if (!content || !currentPath) return;
    try {
      const exportAssetBase = assetBase ?? currentPath;
      const result = bundle
        ? await downloadMarkdownBundle(content, pageTitle, exportAssetBase)
        : await downloadMarkdown(content, pageTitle, exportAssetBase);
      if (result.failedImages > 0) {
        window.dispatchEvent(
          new CustomEvent("cabinet:toast", {
            detail: {
              kind: "info",
              message: t("editor:header.markdownImagesMissing", {
                count: result.failedImages,
              }),
            },
          })
        );
      }
    } catch {
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: {
            kind: "error",
            message: t("editor:header.markdownExportFailed"),
          },
        })
      );
    }
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
      const exportSettings = getExportSettings();
      const params = new URLSearchParams({
        path: currentPath,
        format,
        paperSize: exportSettings.paperSize,
        orientation: exportSettings.orientation,
      });
      const res = await fetch(`/api/export/myst?${params.toString()}`);
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
    } catch (error: unknown) {
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: {
            kind: "error",
            message: error instanceof Error ? error.message : "Export failed",
          },
        })
      );
    }
  };

  const handleSavePdf = async () => {
    const editor = document.querySelector<HTMLElement>(".tiptap.ProseMirror")
      ?? document.querySelector<HTMLElement>(".tiptap");
    if (!editor) return;

    let cleanup: (() => void) | null = null;
    const afterPrint = () => cleanup?.();

    try {
      const prepared = await preparePrintExport(editor, getExportSettings());
      cleanup = prepared.cleanup;
      window.addEventListener("afterprint", afterPrint, { once: true });
      const bridge = (
        window as unknown as {
          CabinetDesktop?: {
            savePdf?: (payload: {
              filename: string;
              paperSize: "a4" | "letter";
              orientation: "portrait" | "landscape";
            }) => Promise<{
              ok: boolean;
              canceled?: boolean;
              path?: string;
              error?: string;
            }>;
          };
        }
      ).CabinetDesktop;

      if (bridge?.savePdf) {
        const result = await bridge.savePdf({
          filename: sanitizePdfFilename(pageTitle),
          paperSize: prepared.paperSize,
          orientation: prepared.orientation,
        });
        if (!result.ok && !result.canceled) {
          throw new Error(result.error || t("editor:header.pdfSaveFailed"));
        }
      } else {
        window.print();
      }
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: {
            kind: "error",
            message: error instanceof Error
              ? error.message
              : t("editor:header.pdfSaveFailed"),
          },
        })
      );
    } finally {
      window.removeEventListener("afterprint", afterPrint);
      cleanup?.();
    }
  };

  return (
    <ViewerToolbar path={currentPath || undefined} showBreadcrumb={!!currentPath}>
      {currentPath && (
        <>
          <DropdownMenu>
          <DropdownMenuTrigger aria-label={t("editor:header.exportPage")} title={t("editor:header.exportPage")} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors cursor-pointer hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground">
            <Download className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 **:[[role=menuitem]]:whitespace-nowrap">
            <DropdownMenuItem onClick={handleCopyMarkdown}>
              <Copy className="h-4 w-4 mr-2" />
              {t("editor:header.copyMarkdown")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyForLLM}>
              <Asterisk className="h-4 w-4 mr-2" />
              {t("editor:header.copyForLlms")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyHTML}>
              <FileCode className="h-4 w-4 mr-2" />
              {t("editor:header.copyAsHtml")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleDownloadMarkdown()}>
              <Download className="h-4 w-4 mr-2" />
              {t("editor:header.downloadMarkdown")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleDownloadMarkdown(true)}>
              <Download className="h-4 w-4 mr-2" />
              {t("editor:header.downloadMarkdownBundle")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleSavePdf()}>
              <FileDown className="h-4 w-4 mr-2" />
              {t("editor:header.saveAsPdf")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportMyST("pdf")}>
              <FileDown className="h-4 w-4 mr-2" />
              {t("editor:header.exportMystPdf")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportMyST("docx")}>
              <FileText className="h-4 w-4 mr-2" />
              Export Word (MyST)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportMyST("tex")}>
              <FileCode className="h-4 w-4 mr-2" />
              Export LaTeX (MyST)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </>
      )}
    </ViewerToolbar>
  );
}

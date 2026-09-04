import type {
  ExportSettings,
  PageOrientation,
  PaperSize,
} from "@/lib/ui/export-settings";

export const PRINT_ROOT_ID = "cabinet-pdf-print-root";
export const PRINT_STYLE_ID = "cabinet-pdf-page-style";
export const PRINT_MARGIN_MM = 15;

const PAPER_DIMENSIONS_MM: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
};

export interface PreparedPrintExport {
  paperSize: PaperSize;
  orientation: Exclude<PageOrientation, "auto">;
  cleanup: () => void;
}

export function printableWidthMm(paperSize: PaperSize): number {
  return Math.round(
    (PAPER_DIMENSIONS_MM[paperSize].width - PRINT_MARGIN_MM * 2) * 10
  ) / 10;
}

export function printableHeightMm(
  paperSize: PaperSize,
  orientation: Exclude<PageOrientation, "auto">
): number {
  const paper = PAPER_DIMENSIONS_MM[paperSize];
  const height = orientation === "landscape" ? paper.width : paper.height;
  return Math.round((height - PRINT_MARGIN_MM * 2) * 10) / 10;
}

export function resolvePrintOrientation(
  settings: ExportSettings,
  fixedContentWidthsPx: readonly number[]
): Exclude<PageOrientation, "auto"> {
  if (settings.orientation !== "auto") return settings.orientation;
  const printableWidthPx = (printableWidthMm(settings.paperSize) / 25.4) * 96;
  return fixedContentWidthsPx.some((width) => width > printableWidthPx / 0.75)
    ? "landscape"
    : "portrait";
}

export function buildPrintPageRule(
  paperSize: PaperSize,
  orientation: Exclude<PageOrientation, "auto">
): string {
  const size = paperSize === "a4" ? "A4" : "Letter";
  return `@page { size: ${size} ${orientation}; margin: ${PRINT_MARGIN_MM}mm; }`;
}

export function sanitizePdfFilename(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "");
  const base = sanitized || "page";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

function fixedContentWidths(editor: HTMLElement): number[] {
  return Array.from(
    editor.querySelectorAll<HTMLElement>("table, pre, svg, canvas, iframe")
  ).map((element) =>
    Math.max(element.scrollWidth, element.getBoundingClientRect().width)
  );
}

function waitForFonts(): Promise<unknown> {
  return "fonts" in document ? document.fonts.ready : Promise.resolve();
}

function waitForImage(image: HTMLImageElement): Promise<unknown> {
  if (image.complete) return image.decode?.().catch(() => undefined) ?? Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", resolve, { once: true });
  });
}

async function waitForPrintAssets(root: HTMLElement): Promise<void> {
  const assets = [
    waitForFonts(),
    ...Array.from(root.querySelectorAll("img")).map(waitForImage),
  ];
  await Promise.race([
    Promise.allSettled(assets),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

export async function preparePrintExport(
  editor: HTMLElement,
  settings: ExportSettings
): Promise<PreparedPrintExport> {
  document.getElementById(PRINT_ROOT_ID)?.remove();
  document.getElementById(PRINT_STYLE_ID)?.remove();
  document.body.removeAttribute("data-cabinet-pdf-export");

  const orientation = resolvePrintOrientation(settings, fixedContentWidths(editor));
  const root = document.createElement("main");
  root.id = PRINT_ROOT_ID;
  root.dir = editor.dir || document.documentElement.dir || "ltr";
  root.style.setProperty(
    "--cabinet-printable-height",
    `${printableHeightMm(settings.paperSize, orientation)}mm`
  );

  const clone = editor.cloneNode(true) as HTMLElement;
  clone.removeAttribute("contenteditable");
  clone.removeAttribute("spellcheck");
  clone.querySelectorAll<HTMLElement>("[contenteditable], [spellcheck], [tabindex]").forEach((element) => {
    element.removeAttribute("contenteditable");
    element.removeAttribute("spellcheck");
    element.removeAttribute("tabindex");
  });
  clone
    .querySelectorAll("button, .image-resize-handle, .column-resize-handle, [data-drag-handle]")
    .forEach((element) => element.remove());
  root.appendChild(clone);

  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = buildPrintPageRule(settings.paperSize, orientation);
  document.head.appendChild(style);
  document.body.appendChild(root);
  document.body.setAttribute("data-cabinet-pdf-export", "true");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    root.remove();
    style.remove();
    document.body.removeAttribute("data-cabinet-pdf-export");
  };

  try {
    await waitForPrintAssets(root);
    return { paperSize: settings.paperSize, orientation, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

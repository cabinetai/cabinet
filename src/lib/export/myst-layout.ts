import JSZip from "jszip";
import yaml from "js-yaml";
import type {
  ExportSettings,
  PageOrientation,
  PaperSize,
} from "@/lib/ui/export-settings";

const PAGE_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  a4: { width: 11906, height: 16838 },
  letter: { width: 12240, height: 15840 },
};

export function parseExportLayout(
  paperSize: string | null,
  orientation: string | null
): ExportSettings | null {
  if (paperSize !== "a4" && paperSize !== "letter") return null;
  if (
    orientation !== "auto" &&
    orientation !== "portrait" &&
    orientation !== "landscape"
  ) {
    return null;
  }
  return { paperSize, orientation };
}

export function resolvedFixedOrientation(
  orientation: PageOrientation
): Exclude<PageOrientation, "auto"> {
  return orientation === "landscape" ? "landscape" : "portrait";
}

export function buildMystLatexTemplate(settings: ExportSettings): string {
  const orientation = resolvedFixedOrientation(settings.orientation);
  const options = [
    settings.paperSize === "a4" ? "a4paper" : "letterpaper",
    ...(orientation === "landscape" ? ["landscape"] : []),
  ].join(",");
  return `\\documentclass[${options}]{article}
\\usepackage{hyperref}
\\usepackage{graphicx}
[-IMPORTS-]
[# if doc.title #]\\title{[-doc.title-]}[# endif #]
[# if doc.authors #]\\author{[-doc.authors|join(" \\\\and ", "name")-]}[# endif #]
\\begin{document}
[# if doc.title #]\\maketitle[# endif #]
[-CONTENT-]
\\end{document}
`;
}

export function buildMystTemplateManifest(): string {
  return yaml.dump({
    jtex: "v1",
    title: "Cabinet Print",
    description: "Cabinet print export template",
    version: "1.0.0",
    license: "MIT",
    tags: ["article"],
    parts: [],
    doc: [{ id: "title" }, { id: "authors" }],
    options: [],
    files: ["template.tex"],
    packages: ["graphicx", "hyperref"],
  });
}

function pageSizeTag(settings: ExportSettings): string {
  const orientation = resolvedFixedOrientation(settings.orientation);
  const dimensions = PAGE_DIMENSIONS[settings.paperSize];
  const width = orientation === "landscape" ? dimensions.height : dimensions.width;
  const height = orientation === "landscape" ? dimensions.width : dimensions.height;
  const orient = orientation === "landscape" ? ' w:orient="landscape"' : "";
  return `<w:pgSz w:w="${width}" w:h="${height}"${orient}/>`;
}

export function applyLayoutToDocumentXml(
  xml: string,
  settings: ExportSettings
): string {
  const replacement = pageSizeTag(settings);
  const expanded = xml.replace(
    /<w:sectPr([^>]*)\/>/g,
    `<w:sectPr$1>${replacement}</w:sectPr>`
  );
  return expanded.replace(
    /<w:sectPr([^>]*)>([\s\S]*?)<\/w:sectPr>/g,
    (_match, attributes: string, body: string) => {
      const nextBody = /<w:pgSz\b[^>]*\/>/.test(body)
        ? body.replace(/<w:pgSz\b[^>]*\/>/g, replacement)
        : `${replacement}${body}`;
      return `<w:sectPr${attributes}>${nextBody}</w:sectPr>`;
    }
  );
}

export async function applyLayoutToDocx(
  buffer: Buffer,
  settings: ExportSettings
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const document = zip.file("word/document.xml");
  if (!document) throw new Error("DOCX is missing word/document.xml");
  const xml = await document.async("string");
  zip.file("word/document.xml", applyLayoutToDocumentXml(xml, settings));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

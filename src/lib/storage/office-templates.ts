// Generators for valid *blank* Office files. Cabinet renders Office formats
// read-only (docx-preview / SheetJS / pptx-preview), so these exist mainly so
// "Create New File" can hand the user a real file they can then edit in the
// desktop app via "Open in Finder". The bytes must be valid OOXML packages or
// the desktop apps show a repair prompt.
//
// - .xlsx: produced by SheetJS (already a dependency) — guaranteed valid.
// - .docx / .pptx: minimal hand-written OOXML zipped with JSZip.
import JSZip from "jszip";
import * as XLSX from "xlsx";

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// ── DOCX ──────────────────────────────────────────────────────────────────

const DOCX_CONTENT_TYPES =
  XML_DECL +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  "</Types>";

const DOCX_ROOT_RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

const DOCX_DOCUMENT =
  XML_DECL +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  "<w:body><w:p/><w:sectPr/></w:body>" +
  "</w:document>";

export async function blankDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", DOCX_CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", DOCX_ROOT_RELS);
  zip.folder("word")!.file("document.xml", DOCX_DOCUMENT);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// ── XLSX ──────────────────────────────────────────────────────────────────

export function blankXlsx(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[]]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── PPTX ──────────────────────────────────────────────────────────────────
// Single blank slide. PowerPoint/Keynote require master + layout + theme parts
// or they offer to "repair" the file, so all of them are included.

const PPTX_CONTENT_TYPES =
  XML_DECL +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
  '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
  '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
  '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
  '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
  "</Types>";

const PPTX_ROOT_RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
  "</Relationships>";

const PPTX_PRESENTATION =
  XML_DECL +
  '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
  '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
  '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>' +
  '<p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>' +
  "</p:presentation>";

const PPTX_PRESENTATION_RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
  "</Relationships>";

const PPTX_EMPTY_SPTREE =
  "<p:spTree>" +
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
  "</p:spTree>";

const PPTX_CLRMAP =
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

const PPTX_SLIDE_MASTER =
  XML_DECL +
  '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
  "<p:cSld>" + PPTX_EMPTY_SPTREE + "</p:cSld>" + PPTX_CLRMAP +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  "</p:sldMaster>";

const PPTX_SLIDE_MASTER_RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
  "</Relationships>";

const PPTX_SLIDE_LAYOUT =
  XML_DECL +
  '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">' +
  '<p:cSld name="Blank">' + PPTX_EMPTY_SPTREE + "</p:cSld>" +
  "</p:sldLayout>";

const PPTX_SLIDE_LAYOUT_RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
  "</Relationships>";

const PPTX_SLIDE =
  XML_DECL +
  '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
  "<p:cSld>" + PPTX_EMPTY_SPTREE + "</p:cSld>" +
  "</p:sld>";

const PPTX_SLIDE_RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
  "</Relationships>";

// Standard minimal Office theme. A presentation must reference a theme with a
// complete colour/font/format scheme; this is the canonical default.
function pptxTheme(): string {
  const fill =
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const fillStyleLst =
    "<a:fillStyleLst>" + fill + fill + fill + "</a:fillStyleLst>";
  const ln =
    '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>';
  const lnStyleLst = "<a:lnStyleLst>" + ln + ln + ln + "</a:lnStyleLst>";
  const effectStyleLst =
    "<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>";
  const bgFillStyleLst =
    "<a:bgFillStyleLst>" + fill + fill + fill + "</a:bgFillStyleLst>";
  const fontScheme =
    '<a:fontScheme name="Office">' +
    '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
    "</a:fontScheme>";
  const clrScheme =
    '<a:clrScheme name="Office">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="44546A"/></a:dk2>' +
    '<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="4472C4"/></a:accent1>' +
    '<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>' +
    '<a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>' +
    '<a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="0563C1"/></a:hlink>' +
    '<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>' +
    "</a:clrScheme>";
  return (
    XML_DECL +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">' +
    "<a:themeElements>" +
    clrScheme +
    fontScheme +
    '<a:fmtScheme name="Office">' +
    fillStyleLst +
    lnStyleLst +
    effectStyleLst +
    bgFillStyleLst +
    "</a:fmtScheme>" +
    "</a:themeElements>" +
    "<a:objectDefaults/><a:extraClrSchemeLst/>" +
    "</a:theme>"
  );
}

export async function blankPptx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", PPTX_CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", PPTX_ROOT_RELS);
  const ppt = zip.folder("ppt")!;
  ppt.file("presentation.xml", PPTX_PRESENTATION);
  ppt.folder("_rels")!.file("presentation.xml.rels", PPTX_PRESENTATION_RELS);
  ppt.folder("slideMasters")!.file("slideMaster1.xml", PPTX_SLIDE_MASTER);
  ppt
    .folder("slideMasters")!
    .folder("_rels")!
    .file("slideMaster1.xml.rels", PPTX_SLIDE_MASTER_RELS);
  ppt.folder("slideLayouts")!.file("slideLayout1.xml", PPTX_SLIDE_LAYOUT);
  ppt
    .folder("slideLayouts")!
    .folder("_rels")!
    .file("slideLayout1.xml.rels", PPTX_SLIDE_LAYOUT_RELS);
  ppt.folder("slides")!.file("slide1.xml", PPTX_SLIDE);
  ppt.folder("slides")!.folder("_rels")!.file("slide1.xml.rels", PPTX_SLIDE_RELS);
  ppt.folder("theme")!.file("theme1.xml", pptxTheme());
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export type BlankOfficeKind = "docx" | "xlsx" | "pptx";

export async function blankOffice(kind: BlankOfficeKind): Promise<Buffer> {
  if (kind === "xlsx") return blankXlsx();
  if (kind === "docx") return blankDocx();
  return blankPptx();
}

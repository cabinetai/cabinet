"use strict";
(function() {
// --- constants.js ---
/**
 * EMF Constants — Record types, enumerations, and stock objects.
 * Values from MS-EMF specification (https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emf/)
 */

// RecordType Enumeration — Section 2.1.1.1
const RecordType = {
  EMR_HEADER:                   0x00000001,
  EMR_POLYBEZIER:               0x00000002,
  EMR_POLYGON:                  0x00000003,
  EMR_POLYLINE:                 0x00000004,
  EMR_POLYBEZIERTO:             0x00000005,
  EMR_POLYLINETO:               0x00000006,
  EMR_POLYPOLYLINE:             0x00000007,
  EMR_POLYPOLYGON:              0x00000008,
  EMR_SETWINDOWEXTEX:           0x00000009,
  EMR_SETWINDOWORGEX:           0x0000000A,
  EMR_SETVIEWPORTEXTEX:         0x0000000B,
  EMR_SETVIEWPORTORGEX:         0x0000000C,
  EMR_SETBRUSHORGEX:            0x0000000D,
  EMR_EOF:                      0x0000000E,
  EMR_SETPIXELV:                0x0000000F,
  EMR_SETMAPPERFLAGS:           0x00000010,
  EMR_SETMAPMODE:               0x00000011,
  EMR_SETBKMODE:                0x00000012,
  EMR_SETPOLYFILLMODE:          0x00000013,
  EMR_SETROP2:                  0x00000014,
  EMR_SETSTRETCHBLTMODE:        0x00000015,
  EMR_SETTEXTALIGN:             0x00000016,
  EMR_SETCOLORADJUSTMENT:       0x00000017,
  EMR_SETTEXTCOLOR:             0x00000018,
  EMR_SETBKCOLOR:               0x00000019,
  EMR_OFFSETCLIPRGN:            0x0000001A,
  EMR_MOVETOEX:                 0x0000001B,
  EMR_SETMETARGN:               0x0000001C,
  EMR_EXCLUDECLIPRECT:          0x0000001D,
  EMR_INTERSECTCLIPRECT:        0x0000001E,
  EMR_SCALEVIEWPORTEXTEX:       0x0000001F,
  EMR_SCALEWINDOWEXTEX:         0x00000020,
  EMR_SAVEDC:                   0x00000021,
  EMR_RESTOREDC:                0x00000022,
  EMR_SETWORLDTRANSFORM:        0x00000023,
  EMR_MODIFYWORLDTRANSFORM:     0x00000024,
  EMR_SELECTOBJECT:             0x00000025,
  EMR_CREATEPEN:                0x00000026,
  EMR_CREATEBRUSHINDIRECT:      0x00000027,
  EMR_DELETEOBJECT:             0x00000028,
  EMR_ANGLEARC:                 0x00000029,
  EMR_ELLIPSE:                  0x0000002A,
  EMR_RECTANGLE:                0x0000002B,
  EMR_ROUNDRECT:                0x0000002C,
  EMR_ARC:                      0x0000002D,
  EMR_CHORD:                    0x0000002E,
  EMR_PIE:                      0x0000002F,
  EMR_SELECTPALETTE:            0x00000030,
  EMR_CREATEPALETTE:            0x00000031,
  EMR_SETPALETTEENTRIES:        0x00000032,
  EMR_RESIZEPALETTE:            0x00000033,
  EMR_REALIZEPALETTE:           0x00000034,
  EMR_EXTFLOODFILL:             0x00000035,
  EMR_LINETO:                   0x00000036,
  EMR_ARCTO:                    0x00000037,
  EMR_POLYDRAW:                 0x00000038,
  EMR_SETARCDIRECTION:          0x00000039,
  EMR_SETMITERLIMIT:            0x0000003A,
  EMR_BEGINPATH:                0x0000003B,
  EMR_ENDPATH:                  0x0000003C,
  EMR_CLOSEFIGURE:              0x0000003D,
  EMR_FILLPATH:                 0x0000003E,
  EMR_STROKEANDFILLPATH:        0x0000003F,
  EMR_STROKEPATH:               0x00000040,
  EMR_FLATTENPATH:              0x00000041,
  EMR_WIDENPATH:                0x00000042,
  EMR_SELECTCLIPPATH:           0x00000043,
  EMR_ABORTPATH:                0x00000044,
  // 0x45 is not defined
  EMR_COMMENT:                  0x00000046,
  EMR_FILLRGN:                  0x00000047,
  EMR_FRAMERGN:                 0x00000048,
  EMR_INVERTRGN:                0x00000049,
  EMR_PAINTRGN:                 0x0000004A,
  EMR_EXTSELECTCLIPRGN:         0x0000004B,
  EMR_BITBLT:                   0x0000004C,
  EMR_STRETCHBLT:               0x0000004D,
  EMR_MASKBLT:                  0x0000004E,
  EMR_PLGBLT:                   0x0000004F,
  EMR_SETDIBITSTODEVICE:        0x00000050,
  EMR_STRETCHDIBITS:            0x00000051,
  EMR_EXTCREATEFONTINDIRECTW:   0x00000052,
  EMR_EXTTEXTOUTA:              0x00000053,
  EMR_EXTTEXTOUTW:              0x00000054,
  EMR_POLYBEZIER16:             0x00000055,
  EMR_POLYGON16:                0x00000056,
  EMR_POLYLINE16:               0x00000057,
  EMR_POLYBEZIERTO16:           0x00000058,
  EMR_POLYLINETO16:             0x00000059,
  EMR_POLYPOLYLINE16:           0x0000005A,
  EMR_POLYPOLYGON16:            0x0000005B,
  EMR_POLYDRAW16:               0x0000005C,
  EMR_CREATEMONOBRUSH:          0x0000005D,
  EMR_CREATEDIBPATTERNBRUSHPT:  0x0000005E,
  EMR_EXTCREATEPEN:             0x0000005F,
  EMR_POLYTEXTOUTA:             0x00000060,
  EMR_POLYTEXTOUTW:             0x00000061,
  EMR_SETICMMODE:               0x00000062,
  EMR_CREATECOLORSPACE:         0x00000063,
  EMR_SETCOLORSPACE:            0x00000064,
  EMR_DELETECOLORSPACE:         0x00000065,
  EMR_GLSRECORD:                0x00000066,
  EMR_GLSBOUNDEDRECORD:         0x00000067,
  EMR_PIXELFORMAT:              0x00000068,
  EMR_DRAWESCAPE:               0x00000069,
  EMR_EXTESCAPE:                0x0000006A,
  // 0x6B is not defined
  EMR_SMALLTEXTOUT:             0x0000006C,
  EMR_FORCEUFIMAPPING:          0x0000006D,
  EMR_NAMEDESCAPE:              0x0000006E,
  EMR_COLORCORRECTPALETTE:      0x0000006F,
  EMR_SETICMPROFILEA:           0x00000070,
  EMR_SETICMPROFILEW:           0x00000071,
  EMR_ALPHABLEND:               0x00000072,
  EMR_SETLAYOUT:                0x00000073,
  EMR_TRANSPARENTBLT:           0x00000074,
  // 0x75 is not defined
  EMR_GRADIENTFILL:             0x00000076,
  EMR_SETLINKEDUFIS:            0x00000077,
  EMR_SETTEXTJUSTIFICATION:     0x00000078,
  EMR_COLORMATCHTOTARGETW:      0x00000079,
  EMR_CREATECOLORSPACEW:        0x0000007A,
};

// Reverse lookup: type number → name
const RecordTypeName = {};
for (const [name, value] of Object.entries(RecordType)) {
  RecordTypeName[value] = name;
}

// Stock Object Constants — Section 2.1.31
const StockObject = {
  WHITE_BRUSH:         0x80000000,
  LTGRAY_BRUSH:        0x80000001,
  GRAY_BRUSH:          0x80000002,
  DKGRAY_BRUSH:        0x80000003,
  BLACK_BRUSH:         0x80000004,
  NULL_BRUSH:          0x80000005,
  WHITE_PEN:           0x80000006,
  BLACK_PEN:           0x80000007,
  NULL_PEN:            0x80000008,
  OEM_FIXED_FONT:      0x8000000A,
  ANSI_FIXED_FONT:     0x8000000B,
  ANSI_VAR_FONT:       0x8000000C,
  SYSTEM_FONT:         0x8000000D,
  DEVICE_DEFAULT_FONT: 0x8000000E,
  DEFAULT_PALETTE:     0x8000000F,
  SYSTEM_FIXED_FONT:   0x80000010,
  DEFAULT_GUI_FONT:    0x80000011,
  DC_BRUSH:            0x80000012,
  DC_PEN:              0x80000013,
};

// MapMode Enumeration — Section 2.1.21
const MapMode = {
  MM_TEXT:        0x01,
  MM_LOMETRIC:    0x02,
  MM_HIMETRIC:    0x03,
  MM_LOENGLISH:   0x04,
  MM_HIENGLISH:   0x05,
  MM_TWIPS:       0x06,
  MM_ISOTROPIC:   0x07,
  MM_ANISOTROPIC: 0x08,
};

// BackgroundMode Enumeration — Section 2.1.4
const BackgroundMode = {
  TRANSPARENT: 0x01,
  OPAQUE:      0x02,
};

// PolyFillMode Enumeration — Section 2.1.27
const PolyFillMode = {
  ALTERNATE: 0x01,
  WINDING:   0x02,
};

// PenStyle Enumeration — Section 2.1.25
const PenStyle = {
  PS_SOLID:       0x00000000,
  PS_DASH:        0x00000001,
  PS_DOT:         0x00000002,
  PS_DASHDOT:     0x00000003,
  PS_DASHDOTDOT:  0x00000004,
  PS_NULL:        0x00000005,
  PS_INSIDEFRAME: 0x00000006,
  PS_USERSTYLE:   0x00000007,
  PS_ALTERNATE:   0x00000008,
  // Masks
  PS_STYLE_MASK:  0x0000000F,
  // EndCap
  PS_ENDCAP_ROUND:  0x00000000,
  PS_ENDCAP_SQUARE: 0x00000100,
  PS_ENDCAP_FLAT:   0x00000200,
  PS_ENDCAP_MASK:   0x00000F00,
  // Join
  PS_JOIN_ROUND:  0x00000000,
  PS_JOIN_BEVEL:  0x00001000,
  PS_JOIN_MITER:  0x00002000,
  PS_JOIN_MASK:   0x0000F000,
  // Type
  PS_COSMETIC:    0x00000000,
  PS_GEOMETRIC:   0x00010000,
  PS_TYPE_MASK:   0x000F0000,
};

// BrushStyle Enumeration — Section 2.1.9
const BrushStyle = {
  BS_SOLID:         0x0000,
  BS_NULL:          0x0001,
  BS_HATCHED:       0x0002,
  BS_PATTERN:       0x0003,
  BS_INDEXED:       0x0004,
  BS_DIBPATTERN:    0x0005,
  BS_DIBPATTERNPT:  0x0006,
  BS_PATTERN8X8:    0x0007,
  BS_DIBPATTERN8X8: 0x0008,
  BS_MONOPATTERN:   0x0009,
};

// HatchStyle Enumeration — Section 2.1.17
const HatchStyle = {
  HS_HORIZONTAL:  0x0000,
  HS_VERTICAL:    0x0001,
  HS_FDIAGONAL:   0x0002,
  HS_BDIAGONAL:   0x0003,
  HS_CROSS:       0x0004,
  HS_DIAGCROSS:   0x0005,
};

// TextAlignment Flags — Section 2.1.2.3
const TextAlignment = {
  TA_NOUPDATECP: 0x0000,
  TA_UPDATECP:   0x0001,
  TA_LEFT:       0x0000,
  TA_RIGHT:      0x0002,
  TA_CENTER:     0x0006,
  TA_TOP:        0x0000,
  TA_BOTTOM:     0x0008,
  TA_BASELINE:   0x0018,
  TA_RTLREADING: 0x0100,
  // Masks
  TA_HORZ_MASK:  0x0006,
  TA_VERT_MASK:  0x0018,
};

// ArcDirection — Section 2.1.2
const ArcDirection = {
  AD_COUNTERCLOCKWISE: 0x01,
  AD_CLOCKWISE:        0x02,
};

// RegionMode Enumeration — Section 2.1.29
const RegionMode = {
  RGN_AND:  0x01,
  RGN_OR:   0x02,
  RGN_XOR:  0x03,
  RGN_DIFF: 0x04,
  RGN_COPY: 0x05,
};

// StretchMode Enumeration — Section 2.1.32
const StretchMode = {
  BLACKONWHITE:       0x01,
  WHITEONBLACK:       0x02,
  COLORONCOLOR:       0x03,
  HALFTONE:           0x04,
};

// ModifyWorldTransformMode — Section 2.1.24
const ModifyWorldTransformMode = {
  MWT_IDENTITY:       0x01,
  MWT_LEFTMULTIPLY:   0x02,
  MWT_RIGHTMULTIPLY:  0x03,
  MWT_SET:            0x04,
};

// Binary Raster Operation (ROP2) — Section 2.1.7
const Rop2Mode = {
  R2_BLACK:       0x01,
  R2_NOTMERGEPEN: 0x02,
  R2_MASKNOTPEN:  0x03,
  R2_NOTCOPYPEN:  0x04,
  R2_MASKPENNOT:  0x05,
  R2_NOT:         0x06,
  R2_XORPEN:      0x07,
  R2_NOTMASKPEN:  0x08,
  R2_MASKPEN:     0x09,
  R2_NOTXORPEN:   0x0A,
  R2_NOP:         0x0B,
  R2_MERGENOTPEN: 0x0C,
  R2_COPYPEN:     0x0D,
  R2_MERGEPENNOT: 0x0E,
  R2_MERGEPEN:    0x0F,
  R2_WHITE:       0x10,
};

// Ternary Raster Operations (common ones for BitBlt/StretchDIBits)
const TernaryRasterOp = {
  SRCCOPY:    0x00CC0020,
  SRCPAINT:   0x00EE0086,
  SRCAND:     0x008800C6,
  SRCINVERT:  0x00660046,
  SRCERASE:   0x00440328,
  NOTSRCCOPY: 0x00330008,
  NOTSRCERASE:0x001100A6,
  MERGECOPY:  0x00C000CA,
  MERGEPAINT: 0x00BB0226,
  PATCOPY:    0x00F00021,
  PATPAINT:   0x00FB0A09,
  PATINVERT:  0x005A0049,
  DSTINVERT:  0x00550009,
  BLACKNESS:  0x00000042,
  WHITENESS:  0x00FF0062,
};

// DIB Color Table Usage — Section 2.1.9 (for bitmap records)
const DIBColors = {
  DIB_RGB_COLORS:  0x00,
  DIB_PAL_COLORS:  0x01,
  DIB_PAL_INDICES: 0x02,
};

// BiCompression values for BITMAPINFOHEADER
const BICompression = {
  BI_RGB:       0,
  BI_RLE8:      1,
  BI_RLE4:      2,
  BI_BITFIELDS: 3,
  BI_JPEG:      4,
  BI_PNG:       5,
};

// Font weight constants
const FontWeight = {
  FW_THIN:       100,
  FW_EXTRALIGHT: 200,
  FW_LIGHT:      300,
  FW_NORMAL:     400,
  FW_MEDIUM:     500,
  FW_SEMIBOLD:   600,
  FW_BOLD:       700,
  FW_EXTRABOLD:  800,
  FW_HEAVY:      900,
};

// FloodFill mode
const FloodFill = {
  FLOODFILLBORDER:  0x00,
  FLOODFILLSURFACE: 0x01,
};

// Graphics mode — for ExtTextOut
const GraphicsMode = {
  GM_COMPATIBLE: 0x01,
  GM_ADVANCED:   0x02,
};

// ExtTextOut options flags
const ExtTextOutOptions = {
  ETO_OPAQUE:          0x0002,
  ETO_CLIPPED:         0x0004,
  ETO_GLYPH_INDEX:     0x0010,
  ETO_RTLREADING:      0x0080,
  ETO_NO_RECT:         0x0100,
  ETO_SMALL_CHARS:     0x0200,
  ETO_NUMERICSLOCAL:   0x0400,
  ETO_NUMERICSLATIN:   0x0800,
  ETO_IGNORELANGUAGE:  0x1000,
  ETO_PDY:             0x2000,
  ETO_REVERSE_INDEX_MAP: 0x10000,
};

// EMF Comment identifiers
const CommentIdentifier = {
  EMR_COMMENT_EMFPLUS:    0x2B464D45, // "+FME" (little-endian "EMF+")
  EMR_COMMENT_EMFSPOOL:   0x00000000,
  EMR_COMMENT_PUBLIC:     0x43494447, // "GIDС" (little-endian "GDIC")
};


// --- transform.js ---
/**
 * Coordinate transform utilities — XForm matrix math and
 * World → Page → Device coordinate pipeline.
 *
 * @module transform
 */

/**
 * Create an identity XForm.
 * @returns {{m11: number, m12: number, m21: number, m22: number, dx: number, dy: number}}
 */
function identityXForm() {
  return { m11: 1, m12: 0, m21: 0, m22: 1, dx: 0, dy: 0 };
}

/**
 * Clone an XForm.
 */
function cloneXForm(xf) {
  return { m11: xf.m11, m12: xf.m12, m21: xf.m21, m22: xf.m22, dx: xf.dx, dy: xf.dy };
}

/**
 * Multiply two XForms: result = a * b
 * This composes transforms so that 'a' is applied first, then 'b'.
 *
 * Matrix layout:
 *   | m11 m12 0 |
 *   | m21 m22 0 |
 *   | dx  dy  1 |
 */
function multiplyXForm(a, b) {
  return {
    m11: a.m11 * b.m11 + a.m12 * b.m21,
    m12: a.m11 * b.m12 + a.m12 * b.m22,
    m21: a.m21 * b.m11 + a.m22 * b.m21,
    m22: a.m21 * b.m12 + a.m22 * b.m22,
    dx:  a.dx * b.m11 + a.dy * b.m21 + b.dx,
    dy:  a.dx * b.m12 + a.dy * b.m22 + b.dy,
  };
}

/**
 * Apply an XForm to a point.
 * @param {{m11,m12,m21,m22,dx,dy}} xf
 * @param {{x: number, y: number}} point
 * @returns {{x: number, y: number}}
 */
function applyXForm(xf, point) {
  return {
    x: point.x * xf.m11 + point.y * xf.m21 + xf.dx,
    y: point.x * xf.m12 + point.y * xf.m22 + xf.dy,
  };
}

/**
 * Invert an XForm. Returns null if not invertible.
 */
function invertXForm(xf) {
  const det = xf.m11 * xf.m22 - xf.m12 * xf.m21;
  if (Math.abs(det) < 1e-10) return null;
  const invDet = 1 / det;
  return {
    m11:  xf.m22 * invDet,
    m12: -xf.m12 * invDet,
    m21: -xf.m21 * invDet,
    m22:  xf.m11 * invDet,
    dx:  (xf.m21 * xf.dy - xf.m22 * xf.dx) * invDet,
    dy:  (xf.m12 * xf.dx - xf.m11 * xf.dy) * invDet,
  };
}

/**
 * Check if an XForm is the identity transform.
 */
function isIdentityXForm(xf) {
  return xf.m11 === 1 && xf.m12 === 0 && xf.m21 === 0 && xf.m22 === 1 && xf.dx === 0 && xf.dy === 0;
}

/**
 * Convert an XForm to an SVG transform matrix string.
 * SVG matrix(a,b,c,d,e,f) maps to:
 *   | a c e |     | m11 m21 dx |
 *   | b d f |  =  | m12 m22 dy |
 *   | 0 0 1 |     | 0   0   1  |
 */
function xformToSvgMatrix(xf) {
  return `matrix(${xf.m11},${xf.m12},${xf.m21},${xf.m22},${xf.dx},${xf.dy})`;
}

/**
 * Apply the window/viewport coordinate mapping.
 * Converts from logical (window) coordinates to device (viewport) coordinates.
 *
 * Formula:
 *   xDevice = (xLogical - xWinOrg) * (xViewExt / xWinExt) + xViewOrg
 *   yDevice = (yLogical - yWinOrg) * (yViewExt / yWinExt) + yViewOrg
 *
 * @param {{x: number, y: number}} point - Logical coordinates
 * @param {{x: number, y: number}} windowOrg
 * @param {{cx: number, cy: number}} windowExt
 * @param {{x: number, y: number}} viewportOrg
 * @param {{cx: number, cy: number}} viewportExt
 * @returns {{x: number, y: number}}
 */
function windowToViewport(point, windowOrg, windowExt, viewportOrg, viewportExt) {
  return {
    x: (point.x - windowOrg.x) * (viewportExt.cx / windowExt.cx) + viewportOrg.x,
    y: (point.y - windowOrg.y) * (viewportExt.cy / windowExt.cy) + viewportOrg.y,
  };
}

/**
 * Build the combined Window→Viewport transform as an XForm.
 */
function windowViewportToXForm(windowOrg, windowExt, viewportOrg, viewportExt) {
  const sx = viewportExt.cx / windowExt.cx;
  const sy = viewportExt.cy / windowExt.cy;
  return {
    m11: sx,
    m12: 0,
    m21: 0,
    m22: sy,
    dx: viewportOrg.x - windowOrg.x * sx,
    dy: viewportOrg.y - windowOrg.y * sy,
  };
}


// --- svg-builder.js ---
/**
 * SVG Builder — accumulates SVG elements and produces an SVG string.
 *
 * @module svg-builder
 */

class SvgBuilder {
  constructor() {
    this._defs = [];       // <defs> content (patterns, clip paths, gradients)
    this._elements = [];   // Main content elements
    this._groupStack = []; // Stack of open <g> elements
    this._nextId = 1;      // Auto-incrementing ID counter
    this._width = 0;
    this._height = 0;
    this._viewBox = null;
  }

  /**
   * Set the SVG dimensions.
   */
  setDimensions(width, height) {
    this._width = width;
    this._height = height;
  }

  /**
   * Set the SVG viewBox.
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   */
  setViewBox(x, y, width, height) {
    this._viewBox = `${x} ${y} ${width} ${height}`;
  }

  /**
   * Generate a unique ID.
   */
  nextId(prefix = "emf") {
    return `${prefix}-${this._nextId++}`;
  }

  /**
   * Add raw content to the <defs> section.
   */
  addDef(content) {
    this._defs.push(content);
  }

  /**
   * Add a clip path to <defs> and return its ID.
   * @param {string} content - The inner content of the clipPath (e.g., <rect> or <path>)
   * @returns {string} The clip path ID
   */
  addClipPath(content) {
    const id = this.nextId("clip");
    this._defs.push(`<clipPath id="${id}">${content}</clipPath>`);
    return id;
  }

  /**
   * Add a pattern to <defs> and return its ID.
   */
  addPattern(width, height, content) {
    const id = this.nextId("pat");
    this._defs.push(
      `<pattern id="${id}" width="${width}" height="${height}" patternUnits="userSpaceOnUse">${content}</pattern>`
    );
    return id;
  }

  /**
   * Open a group element with optional attributes.
   * @param {Object} attrs - Attribute key-value pairs
   */
  openGroup(attrs = {}) {
    const attrStr = formatAttrs(attrs);
    this._push(`<g${attrStr}>`);
    this._groupStack.push(true);
  }

  /**
   * Close the most recently opened group.
   */
  closeGroup() {
    if (this._groupStack.length > 0) {
      this._groupStack.pop();
      this._push("</g>");
    }
  }

  /**
   * Close all open groups.
   */
  closeAllGroups() {
    while (this._groupStack.length > 0) {
      this.closeGroup();
    }
  }

  /**
   * Add a generic element.
   * @param {string} tag
   * @param {Object} attrs
   * @param {string} [content] - Optional inner content (for text elements)
   */
  addElement(tag, attrs = {}, content = null) {
    const attrStr = formatAttrs(attrs);
    if (content !== null) {
      this._push(`<${tag}${attrStr}>${escapeXml(content)}</${tag}>`);
    } else {
      this._push(`<${tag}${attrStr}/>`);
    }
  }

  /**
   * Add a <path> element.
   * @param {string} d - Path data
   * @param {Object} attrs - Additional attributes
   */
  addPath(d, attrs = {}) {
    this.addElement("path", { d, ...attrs });
  }

  /**
   * Add a <rect> element.
   */
  addRect(x, y, width, height, attrs = {}) {
    this.addElement("rect", { x, y, width, height, ...attrs });
  }

  /**
   * Add an <ellipse> element.
   */
  addEllipse(cx, cy, rx, ry, attrs = {}) {
    this.addElement("ellipse", { cx, cy, rx, ry, ...attrs });
  }

  /**
   * Add a <line> element.
   */
  addLine(x1, y1, x2, y2, attrs = {}) {
    this.addElement("line", { x1, y1, x2, y2, ...attrs });
  }

  /**
   * Add a <text> element.
   * @param {string} text - The text content
   * @param {number} x
   * @param {number} y
   * @param {Object} attrs - Additional attributes
   */
  addText(text, x, y, attrs = {}) {
    this.addElement("text", { x, y, ...attrs }, text);
  }

  /**
   * Add an <image> element with a data URI.
   * @param {string} dataUri - The image data URI
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {Object} attrs
   */
  addImage(dataUri, x, y, width, height, attrs = {}) {
    this.addElement("image", {
      href: dataUri,
      x, y, width, height,
      preserveAspectRatio: "none",
      ...attrs,
    });
  }

  /**
   * Add raw SVG content.
   */
  addRaw(content) {
    this._push(content);
  }

  /**
   * Build and return the complete SVG string.
   */
  toString() {
    this.closeAllGroups();

    // Build SVG opening tag
    let svgAttrs = `xmlns="http://www.w3.org/2000/svg"`;
    if (this._width > 0 && this._height > 0) {
      svgAttrs += ` width="${this._width}" height="${this._height}"`;
    }
    if (this._viewBox) {
      svgAttrs += ` viewBox="${this._viewBox}"`;
    }

    // Use array concatenation to avoid stack overflow on large element arrays
    let parts = [`<svg ${svgAttrs}>`];

    if (this._defs.length > 0) {
      parts.push("<defs>");
      parts = parts.concat(this._defs);
      parts.push("</defs>");
    }

    parts = parts.concat(this._elements);
    parts.push("</svg>");
    return parts.join("");
  }

  /**
   * Push content to the element list.
   */
  _push(content) {
    this._elements.push(content);
  }
}

/**
 * Format an attribute object to an SVG attribute string.
 * Skips null/undefined values.
 */
function formatAttrs(attrs) {
  const parts = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    // Convert camelCase to kebab-case for known SVG attributes
    const attrName = key === "className" ? "class" : camelToKebab(key);
    parts.push(`${attrName}="${escapeAttr(String(value))}"`);
  }
  return parts.length > 0 ? " " + parts.join(" ") : "";
}

/**
 * Convert camelCase to kebab-case, but preserve known SVG attributes
 * that use camelCase (viewBox, preserveAspectRatio, etc.)
 */
const PRESERVE_CASE = new Set([
  "viewBox", "preserveAspectRatio", "patternUnits", "patternTransform",
  "gradientUnits", "gradientTransform", "clipPathUnits",
  "textLength", "startOffset", "baseFrequency", "numOctaves",
  "stdDeviation", "surfaceScale", "specularConstant", "specularExponent",
  "kernelMatrix", "targetX", "targetY", "filterUnits",
  "primitiveUnits", "refX", "refY", "markerWidth", "markerHeight",
  "maskUnits", "maskContentUnits",
]);

function camelToKebab(str) {
  if (PRESERVE_CASE.has(str)) return str;
  // Don't convert data- or aria- attributes
  if (str.startsWith("data") || str.startsWith("aria")) return str;
  return str.replace(/([A-Z])/g, "-$1").toLowerCase();
}

/**
 * Escape special characters for XML attribute values.
 */
function escapeAttr(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Escape special characters for XML text content.
 */
function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Convert an RGB color object to an SVG color string.
 * @param {{r: number, g: number, b: number}} color
 * @returns {string} - "#rrggbb" format
 */
function colorToSvg(color) {
  const r = (color.r & 0xFF).toString(16).padStart(2, "0");
  const g = (color.g & 0xFF).toString(16).padStart(2, "0");
  const b = (color.b & 0xFF).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}


// --- parser.js ---
/**
 * EMF Binary Parser
 *
 * Reads an ArrayBuffer containing an EMF file and produces a structured
 * representation of the header and records.
 *
 * @module parser
 */


const EMF_SIGNATURE = 0x464D4520; // " EMF" in little-endian
const MIN_HEADER_SIZE = 88;
const MIN_RECORD_SIZE = 8; // type (4) + size (4)

/**
 * Parse an EMF file from an ArrayBuffer.
 *
 * @param {ArrayBuffer} buffer - The EMF file data
 * @returns {{ header: Object, records: Array<Object> }}
 */
function parseEMF(buffer) {
  if (buffer.byteLength < MIN_HEADER_SIZE) {
    throw new Error(`EMF too small: ${buffer.byteLength} bytes (minimum ${MIN_HEADER_SIZE})`);
  }

  const view = new DataView(buffer);

  // First record must be EMR_HEADER
  const firstType = view.getUint32(0, true);
  if (firstType !== RecordType.EMR_HEADER) {
    throw new Error(`Expected EMR_HEADER (0x01), got 0x${firstType.toString(16)}`);
  }

  const headerSize = view.getUint32(4, true);
  if (headerSize < MIN_HEADER_SIZE) {
    throw new Error(`Header record too small: ${headerSize} bytes`);
  }

  // Validate EMF signature at offset 40
  const signature = view.getUint32(40, true);
  if (signature !== EMF_SIGNATURE) {
    throw new Error(`Invalid EMF signature: 0x${signature.toString(16)} (expected 0x${EMF_SIGNATURE.toString(16)})`);
  }

  // Parse header fields
  const header = {
    // Record header
    type: firstType,
    size: headerSize,

    // Bounds rectangle (device units) — the inclusive bounding box of all drawing
    bounds: {
      left:   view.getInt32(8, true),
      top:    view.getInt32(12, true),
      right:  view.getInt32(16, true),
      bottom: view.getInt32(20, true),
    },

    // Frame rectangle (0.01mm units) — the dimensions of the image
    frame: {
      left:   view.getInt32(24, true),
      top:    view.getInt32(28, true),
      right:  view.getInt32(32, true),
      bottom: view.getInt32(36, true),
    },

    signature,

    // EMF version (typically 0x00010000)
    version: view.getUint32(44, true),

    // Total file size in bytes
    nBytes: view.getUint32(48, true),

    // Total number of records
    nRecords: view.getUint32(52, true),

    // Number of handles (object table entries)
    nHandles: view.getUint16(56, true),

    // Reserved (must be 0x0000)
    reserved: view.getUint16(58, true),

    // Description string offset and size
    nDescription: view.getUint32(60, true),
    offDescription: view.getUint32(64, true),

    // Number of palette entries
    nPalEntries: view.getUint32(68, true),

    // Reference device resolution (pixels)
    szlDevice: {
      cx: view.getInt32(72, true),
      cy: view.getInt32(76, true),
    },

    // Reference device resolution (millimeters)
    szlMillimeters: {
      cx: view.getInt32(80, true),
      cy: view.getInt32(84, true),
    },
  };

  // Extended header fields (version 2 — headerSize >= 100)
  if (headerSize >= 100) {
    header.cbPixelFormat = view.getUint32(88, true);
    header.offPixelFormat = view.getUint32(92, true);
    header.bOpenGL = view.getUint32(96, true);
  }

  // Extended header fields (version 3 — headerSize >= 108)
  if (headerSize >= 108) {
    header.szlMicrometers = {
      cx: view.getInt32(100, true),
      cy: view.getInt32(104, true),
    };
  }

  // Parse description string if present
  if (header.nDescription > 0 && header.offDescription > 0 &&
      header.offDescription + header.nDescription * 2 <= buffer.byteLength) {
    header.description = readUTF16LE(view, header.offDescription, header.nDescription);
  }

  // Computed dimensions
  header.boundsWidth = header.bounds.right - header.bounds.left;
  header.boundsHeight = header.bounds.bottom - header.bounds.top;
  header.frameWidth = header.frame.right - header.frame.left;
  header.frameHeight = header.frame.bottom - header.frame.top;

  // DPI computation from device size (pixels) and physical size (mm)
  if (header.szlMillimeters.cx > 0 && header.szlMillimeters.cy > 0) {
    header.dpiX = Math.round(header.szlDevice.cx / header.szlMillimeters.cx * 25.4);
    header.dpiY = Math.round(header.szlDevice.cy / header.szlMillimeters.cy * 25.4);
  }

  // Parse all records
  const records = [];
  let offset = 0;
  const maxOffset = Math.min(buffer.byteLength, header.nBytes || buffer.byteLength);

  while (offset < maxOffset) {
    if (offset + MIN_RECORD_SIZE > buffer.byteLength) break;

    const recType = view.getUint32(offset, true);
    const recSize = view.getUint32(offset + 4, true);

    // Validate record size
    if (recSize < MIN_RECORD_SIZE) {
      throw new Error(`Invalid record size ${recSize} at offset ${offset} (type 0x${recType.toString(16)})`);
    }
    if (offset + recSize > buffer.byteLength) {
      throw new Error(`Record extends beyond buffer: offset=${offset}, size=${recSize}, bufferLength=${buffer.byteLength}`);
    }

    records.push({
      type: recType,
      size: recSize,
      offset,
      // dataOffset points to the data after the type+size header
      dataOffset: offset + 8,
      dataSize: recSize - 8,
    });

    if (recType === RecordType.EMR_EOF) break;
    offset += recSize;
  }

  return { header, records, buffer };
}

/**
 * Read a UTF-16LE string from a DataView.
 * @param {DataView} view
 * @param {number} offset - Byte offset
 * @param {number} charCount - Number of UTF-16 code units
 * @returns {string}
 */
function readUTF16LE(view, offset, charCount) {
  const chars = [];
  for (let i = 0; i < charCount; i++) {
    const code = view.getUint16(offset + i * 2, true);
    if (code === 0) break; // null terminator
    chars.push(String.fromCharCode(code));
  }
  return chars.join("");
}

/**
 * Read an array of 32-bit PointL structures (x: INT32, y: INT32).
 * @param {DataView} view
 * @param {number} offset - Byte offset
 * @param {number} count - Number of points
 * @returns {Array<{x: number, y: number}>}
 */
function readPointLArray(view, offset, count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: view.getInt32(offset + i * 8, true),
      y: view.getInt32(offset + i * 8 + 4, true),
    });
  }
  return points;
}

/**
 * Read an array of 16-bit PointS structures (x: INT16, y: INT16).
 * @param {DataView} view
 * @param {number} offset - Byte offset
 * @param {number} count - Number of points
 * @returns {Array<{x: number, y: number}>}
 */
function readPointSArray(view, offset, count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: view.getInt16(offset + i * 4, true),
      y: view.getInt16(offset + i * 4 + 2, true),
    });
  }
  return points;
}

/**
 * Read a RectL structure (left, top, right, bottom as INT32).
 * @param {DataView} view
 * @param {number} offset
 * @returns {{left: number, top: number, right: number, bottom: number}}
 */
function readRectL(view, offset) {
  return {
    left:   view.getInt32(offset, true),
    top:    view.getInt32(offset + 4, true),
    right:  view.getInt32(offset + 8, true),
    bottom: view.getInt32(offset + 12, true),
  };
}

/**
 * Read a SizeL structure (cx, cy as UINT32).
 * @param {DataView} view
 * @param {number} offset
 * @returns {{cx: number, cy: number}}
 */
function readSizeL(view, offset) {
  return {
    cx: view.getUint32(offset, true),
    cy: view.getUint32(offset + 4, true),
  };
}

/**
 * Read a COLORREF (0x00BBGGRR) and return {r, g, b}.
 * @param {DataView} view
 * @param {number} offset
 * @returns {{r: number, g: number, b: number}}
 */
function readColorRef(view, offset) {
  const val = view.getUint32(offset, true);
  return {
    r: val & 0xFF,
    g: (val >> 8) & 0xFF,
    b: (val >> 16) & 0xFF,
  };
}

/**
 * Read an XForm (2x3 affine matrix as 6 FLOAT values).
 * @param {DataView} view
 * @param {number} offset
 * @returns {{m11: number, m12: number, m21: number, m22: number, dx: number, dy: number}}
 */
function readXForm(view, offset) {
  return {
    m11: view.getFloat32(offset, true),
    m12: view.getFloat32(offset + 4, true),
    m21: view.getFloat32(offset + 8, true),
    m22: view.getFloat32(offset + 12, true),
    dx:  view.getFloat32(offset + 16, true),
    dy:  view.getFloat32(offset + 20, true),
  };
}


// --- object-table.js ---
/**
 * EMF Object Table — manages indexed GDI objects (pens, brushes, fonts, palettes).
 *
 * Objects are stored by index (0-based). Stock objects use indices >= 0x80000000.
 *
 * @module object-table
 */


// Stock object definitions matching the Windows GDI defaults
const STOCK_OBJECTS = {
  [StockObject.WHITE_BRUSH]:   { type: "brush", style: BrushStyle.BS_SOLID, color: { r: 255, g: 255, b: 255 } },
  [StockObject.LTGRAY_BRUSH]:  { type: "brush", style: BrushStyle.BS_SOLID, color: { r: 192, g: 192, b: 192 } },
  [StockObject.GRAY_BRUSH]:    { type: "brush", style: BrushStyle.BS_SOLID, color: { r: 128, g: 128, b: 128 } },
  [StockObject.DKGRAY_BRUSH]:  { type: "brush", style: BrushStyle.BS_SOLID, color: { r: 64, g: 64, b: 64 } },
  [StockObject.BLACK_BRUSH]:   { type: "brush", style: BrushStyle.BS_SOLID, color: { r: 0, g: 0, b: 0 } },
  [StockObject.NULL_BRUSH]:    { type: "brush", style: BrushStyle.BS_NULL, color: { r: 0, g: 0, b: 0 } },
  [StockObject.WHITE_PEN]:     { type: "pen", style: PenStyle.PS_SOLID, width: 1, color: { r: 255, g: 255, b: 255 }, endCap: 0, join: 0 },
  [StockObject.BLACK_PEN]:     { type: "pen", style: PenStyle.PS_SOLID, width: 1, color: { r: 0, g: 0, b: 0 }, endCap: 0, join: 0 },
  [StockObject.NULL_PEN]:      { type: "pen", style: PenStyle.PS_NULL, width: 0, color: { r: 0, g: 0, b: 0 }, endCap: 0, join: 0 },
  [StockObject.OEM_FIXED_FONT]:     { type: "font", family: "Courier New", size: 12, weight: 400, italic: false, underline: false, strikeOut: false, escapement: 0 },
  [StockObject.ANSI_FIXED_FONT]:    { type: "font", family: "Courier New", size: 12, weight: 400, italic: false, underline: false, strikeOut: false, escapement: 0 },
  [StockObject.ANSI_VAR_FONT]:      { type: "font", family: "MS Sans Serif", size: 12, weight: 400, italic: false, underline: false, strikeOut: false, escapement: 0 },
  [StockObject.SYSTEM_FONT]:        { type: "font", family: "System", size: 16, weight: 700, italic: false, underline: false, strikeOut: false, escapement: 0 },
  [StockObject.DEVICE_DEFAULT_FONT]:{ type: "font", family: "System", size: 12, weight: 400, italic: false, underline: false, strikeOut: false, escapement: 0 },
  [StockObject.DEFAULT_PALETTE]:     { type: "palette" },
  [StockObject.SYSTEM_FIXED_FONT]:  { type: "font", family: "Courier New", size: 12, weight: 400, italic: false, underline: false, strikeOut: false, escapement: 0 },
  [StockObject.DEFAULT_GUI_FONT]:   { type: "font", family: "MS Shell Dlg", size: 13, weight: 400, italic: false, underline: false, strikeOut: false, escapement: 0 },
  [StockObject.DC_BRUSH]:    { type: "brush", style: BrushStyle.BS_SOLID, color: { r: 255, g: 255, b: 255 } },
  [StockObject.DC_PEN]:      { type: "pen", style: PenStyle.PS_SOLID, width: 1, color: { r: 0, g: 0, b: 0 }, endCap: 0, join: 0 },
};

class ObjectTable {
  constructor(maxObjects = 128) {
    this._objects = new Array(maxObjects).fill(null);
    this._maxObjects = maxObjects;
  }

  /**
   * Store an object at the given index.
   * If index is out of bounds, the table is expanded.
   */
  createObject(index, object) {
    if (index >= this._objects.length) {
      this._objects.length = index + 1;
    }
    this._objects[index] = object;
  }

  /**
   * Retrieve an object by index. Handles stock objects (index >= 0x80000000).
   * Returns null if not found.
   */
  getObject(index) {
    if (index >= 0x80000000) {
      return STOCK_OBJECTS[index] || null;
    }
    if (index < 0 || index >= this._objects.length) return null;
    return this._objects[index];
  }

  /**
   * Delete an object at the given index.
   */
  deleteObject(index) {
    if (index >= 0 && index < this._objects.length) {
      this._objects[index] = null;
    }
  }

  /**
   * Find the first free slot in the table.
   * Returns -1 if no free slot.
   */
  findFreeSlot() {
    for (let i = 0; i < this._objects.length; i++) {
      if (this._objects[i] === null) return i;
    }
    // Expand table
    const idx = this._objects.length;
    this._objects.push(null);
    return idx;
  }

  /**
   * Check if an index is a stock object.
   */
  static isStockObject(index) {
    return index >= 0x80000000;
  }

  /**
   * Get a stock object by its constant.
   */
  static getStockObject(index) {
    return STOCK_OBJECTS[index] || null;
  }
}


// --- device-context.js ---
/**
 * GDI Device Context — maintains the complete drawing state
 * as defined by the MS-EMF Graphics Environment specification.
 *
 * @module device-context
 */




class DeviceContext {
  constructor(nHandles = 128) {
    this.objectTable = new ObjectTable(nHandles);

    // Initialize to GDI defaults
    this.reset();
  }

  /**
   * Reset all state to GDI defaults.
   */
  reset() {
    // Coordinate mapping
    this.mapMode = MapMode.MM_TEXT;
    this.windowOrg = { x: 0, y: 0 };
    this.windowExt = { cx: 1, cy: 1 };
    this.viewportOrg = { x: 0, y: 0 };
    this.viewportExt = { cx: 1, cy: 1 };
    this.worldTransform = identityXForm();

    // Drawing state
    this.currentPosition = { x: 0, y: 0 };
    this.backgroundColor = { r: 255, g: 255, b: 255 };
    this.backgroundMode = BackgroundMode.OPAQUE;
    this.textColor = { r: 0, g: 0, b: 0 };
    this.textAlign = TextAlignment.TA_LEFT | TextAlignment.TA_TOP | TextAlignment.TA_NOUPDATECP;
    this.polyFillMode = PolyFillMode.ALTERNATE;
    this.rop2 = Rop2Mode.R2_COPYPEN;
    this.stretchBltMode = StretchMode.COLORONCOLOR;
    this.arcDirection = ArcDirection.AD_COUNTERCLOCKWISE;
    this.miterLimit = 10.0;
    this.brushOrg = { x: 0, y: 0 };

    // Current selected objects (stock defaults)
    this.currentPen = ObjectTable.getStockObject(StockObject.BLACK_PEN);
    this.currentBrush = ObjectTable.getStockObject(StockObject.WHITE_BRUSH);
    this.currentFont = ObjectTable.getStockObject(StockObject.SYSTEM_FONT);
    this.currentPalette = null;

    // Path state
    this.pathBracketOpen = false;
    this.path = []; // Array of SVG path command strings

    // Clipping state
    this.clipRegion = null; // Current clipping region (SVG clip path content)
    this.clipId = null; // Current SVG clipPath id

    // DC save stack
    this._saveStack = [];
  }

  /**
   * Save the current DC state (EMR_SAVEDC).
   * Pushes a deep copy of the current state onto the stack.
   */
  save() {
    this._saveStack.push(this._cloneState());
  }

  /**
   * Restore a saved DC state (EMR_RESTOREDC).
   * @param {number} savedDC - If negative, relative to current level.
   *   -1 = restore most recent save. If positive, absolute level.
   */
  restore(savedDC) {
    if (this._saveStack.length === 0) return;

    let targetIndex;
    if (savedDC < 0) {
      // Relative: -1 = pop 1 level, -2 = pop 2, etc.
      targetIndex = this._saveStack.length + savedDC;
    } else {
      // Absolute (1-based)
      targetIndex = savedDC - 1;
    }

    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= this._saveStack.length) return;

    // Restore state and pop everything above
    const state = this._saveStack[targetIndex];
    this._restoreState(state);
    this._saveStack.length = targetIndex;
  }

  /**
   * Select a GDI object into the device context.
   * @param {number} index - Object table index or stock object constant
   */
  selectObject(index) {
    const obj = this.objectTable.getObject(index);
    if (!obj) return;

    switch (obj.type) {
      case "pen":
        this.currentPen = obj;
        break;
      case "brush":
        this.currentBrush = obj;
        break;
      case "font":
        this.currentFont = obj;
        break;
      case "palette":
        this.currentPalette = obj;
        break;
    }
  }

  /**
   * Clone the current state for save/restore.
   */
  _cloneState() {
    return {
      mapMode: this.mapMode,
      windowOrg: { ...this.windowOrg },
      windowExt: { ...this.windowExt },
      viewportOrg: { ...this.viewportOrg },
      viewportExt: { ...this.viewportExt },
      worldTransform: cloneXForm(this.worldTransform),
      currentPosition: { ...this.currentPosition },
      backgroundColor: { ...this.backgroundColor },
      backgroundMode: this.backgroundMode,
      textColor: { ...this.textColor },
      textAlign: this.textAlign,
      polyFillMode: this.polyFillMode,
      rop2: this.rop2,
      stretchBltMode: this.stretchBltMode,
      arcDirection: this.arcDirection,
      miterLimit: this.miterLimit,
      brushOrg: { ...this.brushOrg },
      currentPen: this.currentPen,
      currentBrush: this.currentBrush,
      currentFont: this.currentFont,
      currentPalette: this.currentPalette,
      clipRegion: this.clipRegion,
      clipId: this.clipId,
      // Path state is NOT saved/restored per GDI spec
    };
  }

  /**
   * Restore state from a saved snapshot.
   */
  _restoreState(state) {
    this.mapMode = state.mapMode;
    this.windowOrg = state.windowOrg;
    this.windowExt = state.windowExt;
    this.viewportOrg = state.viewportOrg;
    this.viewportExt = state.viewportExt;
    this.worldTransform = state.worldTransform;
    this.currentPosition = state.currentPosition;
    this.backgroundColor = state.backgroundColor;
    this.backgroundMode = state.backgroundMode;
    this.textColor = state.textColor;
    this.textAlign = state.textAlign;
    this.polyFillMode = state.polyFillMode;
    this.rop2 = state.rop2;
    this.stretchBltMode = state.stretchBltMode;
    this.arcDirection = state.arcDirection;
    this.miterLimit = state.miterLimit;
    this.brushOrg = state.brushOrg;
    this.currentPen = state.currentPen;
    this.currentBrush = state.currentBrush;
    this.currentFont = state.currentFont;
    this.currentPalette = state.currentPalette;
    this.clipRegion = state.clipRegion;
    this.clipId = state.clipId;
  }
}


// --- style-helpers.js ---
/**
 * Style helpers — convert GDI pen/brush/font state to SVG attributes.
 *
 * @module style-helpers
 */



/**
 * Convert the current pen to SVG stroke attributes.
 * @param {Object} pen - The current pen from dc.currentPen
 * @returns {Object} SVG attribute key-value pairs
 */
function penToStrokeAttrs(pen) {
  if (!pen || pen.style === PenStyle.PS_NULL) {
    return { stroke: "none" };
  }

  const attrs = {
    stroke: colorToSvg(pen.color),
    strokeWidth: Math.max(pen.width, 1),
  };

  // Dash pattern
  switch (pen.style) {
    case PenStyle.PS_DASH:
      attrs.strokeDasharray = `${attrs.strokeWidth * 5} ${attrs.strokeWidth * 3}`;
      break;
    case PenStyle.PS_DOT:
      attrs.strokeDasharray = `${attrs.strokeWidth} ${attrs.strokeWidth * 2}`;
      break;
    case PenStyle.PS_DASHDOT:
      attrs.strokeDasharray = `${attrs.strokeWidth * 5} ${attrs.strokeWidth * 2} ${attrs.strokeWidth} ${attrs.strokeWidth * 2}`;
      break;
    case PenStyle.PS_DASHDOTDOT:
      attrs.strokeDasharray = `${attrs.strokeWidth * 5} ${attrs.strokeWidth * 2} ${attrs.strokeWidth} ${attrs.strokeWidth * 2} ${attrs.strokeWidth} ${attrs.strokeWidth * 2}`;
      break;
    case PenStyle.PS_USERSTYLE:
      if (pen.dashPattern) {
        attrs.strokeDasharray = pen.dashPattern.join(" ");
      }
      break;
    // PS_SOLID, PS_INSIDEFRAME, PS_ALTERNATE: no dash
  }

  // End cap
  switch (pen.endCap) {
    case PenStyle.PS_ENDCAP_FLAT:
      attrs.strokeLinecap = "butt";
      break;
    case PenStyle.PS_ENDCAP_SQUARE:
      attrs.strokeLinecap = "square";
      break;
    case PenStyle.PS_ENDCAP_ROUND:
    default:
      attrs.strokeLinecap = "round";
      break;
  }

  // Join
  switch (pen.join) {
    case PenStyle.PS_JOIN_BEVEL:
      attrs.strokeLinejoin = "bevel";
      break;
    case PenStyle.PS_JOIN_MITER:
      attrs.strokeLinejoin = "miter";
      break;
    case PenStyle.PS_JOIN_ROUND:
    default:
      attrs.strokeLinejoin = "round";
      break;
  }

  return attrs;
}

/**
 * Convert the current brush to SVG fill attributes.
 * @param {Object} brush - The current brush from dc.currentBrush
 * @param {import("./svg-builder.js").SvgBuilder} svg - For creating pattern defs
 * @returns {Object} SVG attribute key-value pairs
 */
function brushToFillAttrs(brush, svg) {
  if (!brush || brush.style === BrushStyle.BS_NULL) {
    return { fill: "none" };
  }

  if (brush.style === BrushStyle.BS_SOLID) {
    return { fill: colorToSvg(brush.color) };
  }

  if (brush.style === BrushStyle.BS_HATCHED && brush.hatch !== null) {
    const patId = createHatchPattern(brush.hatch, brush.color, svg);
    return { fill: `url(#${patId})` };
  }

  // DIB pattern brushes — for now, use a solid gray placeholder
  if (brush.style === BrushStyle.BS_DIBPATTERNPT ||
      brush.style === BrushStyle.BS_PATTERN ||
      brush.style === BrushStyle.BS_DIBPATTERN) {
    return { fill: "#cccccc" };
  }

  // Fallback
  return { fill: colorToSvg(brush.color) };
}

/**
 * Get fill-rule attribute from polyFillMode.
 */
function fillRule(polyFillMode) {
  return polyFillMode === PolyFillMode.WINDING ? "nonzero" : "evenodd";
}

/**
 * Combine pen stroke and brush fill into a single attrs object.
 */
function shapeAttrs(dc, svg) {
  return {
    ...penToStrokeAttrs(dc.currentPen),
    ...brushToFillAttrs(dc.currentBrush, svg),
  };
}

/**
 * Create an SVG hatch pattern in <defs> and return its ID.
 */
function createHatchPattern(hatchStyle, color, svg) {
  const c = colorToSvg(color);
  const sz = 8;
  let content;

  switch (hatchStyle) {
    case HatchStyle.HS_HORIZONTAL:
      content = `<line x1="0" y1="4" x2="8" y2="4" stroke="${c}" stroke-width="1"/>`;
      break;
    case HatchStyle.HS_VERTICAL:
      content = `<line x1="4" y1="0" x2="4" y2="8" stroke="${c}" stroke-width="1"/>`;
      break;
    case HatchStyle.HS_FDIAGONAL:
      content = `<line x1="0" y1="8" x2="8" y2="0" stroke="${c}" stroke-width="1"/>`;
      break;
    case HatchStyle.HS_BDIAGONAL:
      content = `<line x1="0" y1="0" x2="8" y2="8" stroke="${c}" stroke-width="1"/>`;
      break;
    case HatchStyle.HS_CROSS:
      content = `<line x1="0" y1="4" x2="8" y2="4" stroke="${c}" stroke-width="1"/>` +
                `<line x1="4" y1="0" x2="4" y2="8" stroke="${c}" stroke-width="1"/>`;
      break;
    case HatchStyle.HS_DIAGCROSS:
      content = `<line x1="0" y1="0" x2="8" y2="8" stroke="${c}" stroke-width="1"/>` +
                `<line x1="0" y1="8" x2="8" y2="0" stroke="${c}" stroke-width="1"/>`;
      break;
    default:
      content = `<rect width="8" height="8" fill="${c}"/>`;
      break;
  }

  return svg.addPattern(sz, sz, content);
}


// --- renderer.js ---
/**
 * EMF Renderer — dispatches parsed records to handlers and builds SVG.
 *
 * @module renderer
 */





// Record types that modify the world transform or window/viewport mapping.
// After any of these, we recompute the composite transform group.
const TRANSFORM_RECORDS = new Set([
  RecordType.EMR_SETWORLDTRANSFORM,
  RecordType.EMR_MODIFYWORLDTRANSFORM,
  RecordType.EMR_SETWINDOWEXTEX,
  RecordType.EMR_SETWINDOWORGEX,
  RecordType.EMR_SETVIEWPORTEXTEX,
  RecordType.EMR_SETVIEWPORTORGEX,
  RecordType.EMR_SETMAPMODE,
  RecordType.EMR_SCALEVIEWPORTEXTEX,
  RecordType.EMR_SCALEWINDOWEXTEX,
]);

class Renderer {
  constructor(options = {}) {
    this._handlers = {};
    this._dc = new DeviceContext();
    this._svg = new SvgBuilder();
    this._options = options;
    this._unhandledRecords = new Set();
    this._recordCount = 0;

    // Transform group state
    this._transformGroupOpen = false;
    this._lastTransformStr = null;

    // Clip group state
    this._clipGroupDepth = 0;
    this._savedClipDepths = []; // parallel to DC save stack
  }

  /**
   * Register record handlers.
   * @param {Object} handlerMap - Map of record type number → handler function
   *   Handler signature: handler(view, offset, size, dc, svg, renderer)
   *   - view: DataView of the full EMF buffer
   *   - offset: byte offset of the record data (after type+size header)
   *   - size: byte size of the record data (total record size - 8)
   *   - dc: DeviceContext
   *   - svg: SvgBuilder
   *   - renderer: Renderer (for cross-record state like options)
   */
  registerHandlers(handlerMap) {
    Object.assign(this._handlers, handlerMap);
  }

  /**
   * Render parsed EMF records to SVG.
   * @param {{ header: Object, records: Array, buffer: ArrayBuffer }} parsed
   * @returns {string} SVG string
   */
  render(parsed) {
    const { header, records, buffer } = parsed;
    const view = new DataView(buffer);

    // Set up the DC with the number of handles from the header
    this._dc = new DeviceContext(header.nHandles || 128);
    this._svg = new SvgBuilder();
    this._unhandledRecords = new Set();
    this._recordCount = 0;
    this._transformGroupOpen = false;
    this._lastTransformStr = null;
    this._clipGroupDepth = 0;
    this._savedClipDepths = [];

    // Compute SVG dimensions from the frame rectangle (0.01mm units)
    // Convert to pixels: frame is in 0.01mm, so divide by 100 to get mm, then multiply by DPI/25.4
    const frameWidthMm = header.frameWidth / 100;
    const frameHeightMm = header.frameHeight / 100;
    const dpi = header.dpiX || 96;
    const svgWidth = Math.round(frameWidthMm / 25.4 * dpi);
    const svgHeight = Math.round(frameHeightMm / 25.4 * dpi);

    this._svg.setDimensions(svgWidth, svgHeight);

    // ViewBox: use header bounds if valid, otherwise fall back to frame-based dimensions
    let vbW = header.boundsWidth;
    let vbH = header.boundsHeight;
    if (vbW > 0 && vbH > 0) {
      this._svg.setViewBox(header.bounds.left, header.bounds.top, vbW, vbH);
    } else {
      // Degenerate bounds — fall back to pixel dimensions
      this._svg.setViewBox(0, 0, svgWidth, svgHeight);
    }

    // Process all records
    for (const record of records) {
      this._recordCount++;
      const handler = this._handlers[record.type];

      if (handler) {
        // Run the handler
        handler(view, record.dataOffset, record.dataSize, this._dc, this._svg, this);

        // If this was a transform-related record, update the SVG transform group
        if (TRANSFORM_RECORDS.has(record.type)) {
          this._updateTransformGroup();
        }
      } else {
        this._unhandledRecords.add(record.type);
      }
    }

    return this._svg.toString();
  }

  /**
   * Get the device context.
   */
  get dc() {
    return this._dc;
  }

  /**
   * Get the SVG builder.
   */
  get svg() {
    return this._svg;
  }

  /**
   * Get the set of unhandled record types encountered during rendering.
   */
  get unhandledRecords() {
    return this._unhandledRecords;
  }

  /**
   * Get total records processed.
   */
  get recordCount() {
    return this._recordCount;
  }

  // ─── Composite Transform ───────────────────────────────────────

  /**
   * Compute the current composite transform: worldTransform × window/viewport mapping.
   * This is the full GDI coordinate pipeline:
   *   Logical (in EMF records) → World Transform → Window/Viewport → Device (SVG viewBox space)
   */
  _computeCompositeXForm() {
    const dc = this._dc;
    let composite = dc.worldTransform;

    // Apply window/viewport mapping for anisotropic/isotropic modes
    if (dc.mapMode === MapMode.MM_ANISOTROPIC || dc.mapMode === MapMode.MM_ISOTROPIC) {
      if (dc.windowExt.cx !== 0 && dc.windowExt.cy !== 0) {
        const wvXf = windowViewportToXForm(
          dc.windowOrg, dc.windowExt, dc.viewportOrg, dc.viewportExt
        );
        composite = multiplyXForm(composite, wvXf);
      }
    }

    return composite;
  }

  /**
   * Update the SVG transform group when the composite transform changes.
   */
  _updateTransformGroup() {
    const composite = this._computeCompositeXForm();

    if (isIdentityXForm(composite)) {
      // Close transform group if one was open
      if (this._transformGroupOpen) {
        this._svg.closeGroup();
        this._transformGroupOpen = false;
        this._lastTransformStr = null;
      }
      return;
    }

    const matrixStr = xformToSvgMatrix(composite);

    // If the transform hasn't changed, no need to update
    if (matrixStr === this._lastTransformStr) return;

    // Close previous transform group if one was open
    if (this._transformGroupOpen) {
      this._svg.closeGroup();
    }

    this._svg.openGroup({ transform: matrixStr });
    this._transformGroupOpen = true;
    this._lastTransformStr = matrixStr;
  }

  /**
   * Get the current composite transform as an SVG matrix string.
   * Returns null if the transform is identity.
   * Used by clipping handlers to transform clip path coordinates.
   */
  getCurrentTransformString() {
    const composite = this._computeCompositeXForm();
    if (isIdentityXForm(composite)) return null;
    return xformToSvgMatrix(composite);
  }

  // ─── Clip Group Management ─────────────────────────────────────

  /**
   * Open a clip group. Properly nests: clip group wraps transform group.
   * @param {string} clipId - The clip path ID
   */
  openClipGroup(clipId) {
    // Close transform group if open (clip must wrap transform)
    if (this._transformGroupOpen) {
      this._svg.closeGroup();
      this._transformGroupOpen = false;
    }

    this._svg.openGroup({ clipPath: `url(#${clipId})` });
    this._clipGroupDepth++;

    // Re-apply transform group inside the clip group
    this._lastTransformStr = null; // force re-emit
    this._updateTransformGroup();
  }

  /**
   * Close the most recently opened clip group.
   */
  closeClipGroup() {
    // Close transform group first (it's nested inside clip group)
    if (this._transformGroupOpen) {
      this._svg.closeGroup();
      this._transformGroupOpen = false;
      this._lastTransformStr = null;
    }

    if (this._clipGroupDepth > 0) {
      this._svg.closeGroup();
      this._clipGroupDepth--;
    }

    // Re-apply transform group after closing clip group
    this._updateTransformGroup();
  }

  // ─── SaveDC/RestoreDC Hooks ────────────────────────────────────

  /**
   * Called when EMR_SAVEDC is processed.
   * Saves the current clip group depth so RestoreDC can unwind.
   */
  onSaveDC() {
    this._savedClipDepths.push(this._clipGroupDepth);
  }

  /**
   * Called when EMR_RESTOREDC is processed.
   * Closes clip groups back to the saved depth and re-applies transform.
   */
  onRestoreDC(prevClipId, newClipId) {
    if (this._savedClipDepths.length === 0) return;

    const savedDepth = this._savedClipDepths.pop();

    // Close clip groups down to saved depth
    while (this._clipGroupDepth > savedDepth) {
      if (this._transformGroupOpen) {
        this._svg.closeGroup();
        this._transformGroupOpen = false;
        this._lastTransformStr = null;
      }
      this._svg.closeGroup();
      this._clipGroupDepth--;
    }

    // Re-apply the current transform group
    this._updateTransformGroup();
  }

  /**
   * Log unhandled records summary.
   */
  logUnhandled() {
    if (this._unhandledRecords.size > 0) {
      const names = [...this._unhandledRecords].map(t =>
        RecordTypeName[t] || `0x${t.toString(16)}`
      );
      console.warn(`Unhandled EMF records: ${names.join(", ")}`);
    }
  }
}


// --- records/control.js ---
/**
 * Control record handlers — EMR_HEADER, EMR_EOF
 */


const controlHandlers = {
  [RecordType.EMR_HEADER](view, offset, size, dc, svg, renderer) {
    // Header is already parsed by the parser. Nothing to do here.
    // The renderer sets up SVG dimensions from the parsed header.
  },

  [RecordType.EMR_EOF](view, offset, size, dc, svg, renderer) {
    // End of metafile. Close any open groups.
    svg.closeAllGroups();
  },
};


// --- records/state.js ---
/**
 * State record handlers — all records that modify the device context state
 * without producing drawing output.
 */




const stateHandlers = {
  [RecordType.EMR_SETWINDOWEXTEX](view, offset, size, dc) {
    dc.windowExt = { cx: view.getInt32(offset, true), cy: view.getInt32(offset + 4, true) };
  },

  [RecordType.EMR_SETWINDOWORGEX](view, offset, size, dc) {
    dc.windowOrg = { x: view.getInt32(offset, true), y: view.getInt32(offset + 4, true) };
  },

  [RecordType.EMR_SETVIEWPORTEXTEX](view, offset, size, dc) {
    dc.viewportExt = { cx: view.getInt32(offset, true), cy: view.getInt32(offset + 4, true) };
  },

  [RecordType.EMR_SETVIEWPORTORGEX](view, offset, size, dc) {
    dc.viewportOrg = { x: view.getInt32(offset, true), y: view.getInt32(offset + 4, true) };
  },

  [RecordType.EMR_SETBRUSHORGEX](view, offset, size, dc) {
    dc.brushOrg = { x: view.getInt32(offset, true), y: view.getInt32(offset + 4, true) };
  },

  [RecordType.EMR_SETMAPMODE](view, offset, size, dc) {
    dc.mapMode = view.getUint32(offset, true);
  },

  [RecordType.EMR_SETBKMODE](view, offset, size, dc) {
    dc.backgroundMode = view.getUint32(offset, true);
  },

  [RecordType.EMR_SETPOLYFILLMODE](view, offset, size, dc) {
    dc.polyFillMode = view.getUint32(offset, true);
  },

  [RecordType.EMR_SETROP2](view, offset, size, dc) {
    dc.rop2 = view.getUint32(offset, true);
  },

  [RecordType.EMR_SETSTRETCHBLTMODE](view, offset, size, dc) {
    dc.stretchBltMode = view.getUint32(offset, true);
  },

  [RecordType.EMR_SETTEXTALIGN](view, offset, size, dc) {
    dc.textAlign = view.getUint32(offset, true);
  },

  [RecordType.EMR_SETTEXTCOLOR](view, offset, size, dc) {
    dc.textColor = readColorRef(view, offset);
  },

  [RecordType.EMR_SETBKCOLOR](view, offset, size, dc) {
    dc.backgroundColor = readColorRef(view, offset);
  },

  [RecordType.EMR_MOVETOEX](view, offset, size, dc) {
    const x = view.getInt32(offset, true);
    const y = view.getInt32(offset + 4, true);
    dc.currentPosition = { x, y };
    if (dc.pathBracketOpen) {
      dc.path.push(`M${x} ${y}`);
    }
  },

  [RecordType.EMR_SAVEDC](view, offset, size, dc, svg, renderer) {
    dc.save();
    if (renderer && renderer.onSaveDC) renderer.onSaveDC();
  },

  [RecordType.EMR_RESTOREDC](view, offset, size, dc, svg, renderer) {
    const savedDC = view.getInt32(offset, true);
    const prevClipId = dc.clipId;
    dc.restore(savedDC);
    if (renderer && renderer.onRestoreDC) renderer.onRestoreDC(prevClipId, dc.clipId);
  },

  [RecordType.EMR_SETARCDIRECTION](view, offset, size, dc) {
    dc.arcDirection = view.getUint32(offset, true);
  },

  [RecordType.EMR_SETMITERLIMIT](view, offset, size, dc) {
    dc.miterLimit = view.getFloat32(offset, true);
  },

  [RecordType.EMR_SCALEVIEWPORTEXTEX](view, offset, size, dc) {
    const xNum = view.getInt32(offset, true);
    const xDenom = view.getInt32(offset + 4, true);
    const yNum = view.getInt32(offset + 8, true);
    const yDenom = view.getInt32(offset + 12, true);
    if (xDenom !== 0) dc.viewportExt.cx = Math.round(dc.viewportExt.cx * xNum / xDenom);
    if (yDenom !== 0) dc.viewportExt.cy = Math.round(dc.viewportExt.cy * yNum / yDenom);
  },

  [RecordType.EMR_SCALEWINDOWEXTEX](view, offset, size, dc) {
    const xNum = view.getInt32(offset, true);
    const xDenom = view.getInt32(offset + 4, true);
    const yNum = view.getInt32(offset + 8, true);
    const yDenom = view.getInt32(offset + 12, true);
    if (xDenom !== 0) dc.windowExt.cx = Math.round(dc.windowExt.cx * xNum / xDenom);
    if (yDenom !== 0) dc.windowExt.cy = Math.round(dc.windowExt.cy * yNum / yDenom);
  },

  // Trivially handled or ignored state records
  [RecordType.EMR_SETCOLORADJUSTMENT](view, offset, size, dc) {
    // Color adjustment — not relevant for SVG output
  },

  [RecordType.EMR_SETMAPPERFLAGS](view, offset, size, dc) {
    // Font mapper flags — not relevant for SVG
  },

  [RecordType.EMR_SETICMMODE](view, offset, size, dc) {
    // ICM mode — not relevant for SVG
  },

  [RecordType.EMR_SETLAYOUT](view, offset, size, dc) {
    // Layout mode (RTL) — could affect text direction, store for later
    dc.layoutMode = view.getUint32(offset, true);
  },

  [RecordType.EMR_SETLINKEDUFIS](view, offset, size, dc) {
    // Linked UFIs for font fallback — not relevant for SVG
  },

  [RecordType.EMR_SETTEXTJUSTIFICATION](view, offset, size, dc) {
    // Text justification extra space
    dc.textJustificationExtra = view.getInt32(offset, true);
    dc.textJustificationCount = view.getInt32(offset + 4, true);
  },

  [RecordType.EMR_REALIZEPALETTE](view, offset, size, dc) {
    // Palette realization — not relevant for SVG (we use true color)
  },

  [RecordType.EMR_SETPIXELV](view, offset, size, dc, svg) {
    // Set a single pixel — emit a tiny rect
    const x = view.getInt32(offset, true);
    const y = view.getInt32(offset + 4, true);
    const color = readColorRef(view, offset + 8);
    svg.addRect(x, y, 1, 1, { fill: colorToSvg(color), stroke: "none" });
  },

  [RecordType.EMR_SETICMPROFILEA](view, offset, size, dc) {
    // ICM profile — ignored
  },

  [RecordType.EMR_SETICMPROFILEW](view, offset, size, dc) {
    // ICM profile — ignored
  },
};


// --- records/transform-records.js ---
/**
 * Transform record handlers — SetWorldTransform, ModifyWorldTransform
 */




const transformHandlers = {
  [RecordType.EMR_SETWORLDTRANSFORM](view, offset, size, dc) {
    dc.worldTransform = readXForm(view, offset);
  },

  [RecordType.EMR_MODIFYWORLDTRANSFORM](view, offset, size, dc) {
    const xform = readXForm(view, offset);
    const mode = view.getUint32(offset + 24, true);

    switch (mode) {
      case ModifyWorldTransformMode.MWT_IDENTITY:
        dc.worldTransform = identityXForm();
        break;
      case ModifyWorldTransformMode.MWT_LEFTMULTIPLY:
        dc.worldTransform = multiplyXForm(xform, dc.worldTransform);
        break;
      case ModifyWorldTransformMode.MWT_RIGHTMULTIPLY:
        dc.worldTransform = multiplyXForm(dc.worldTransform, xform);
        break;
      case ModifyWorldTransformMode.MWT_SET:
        dc.worldTransform = cloneXForm(xform);
        break;
    }
  },
};


// --- records/objects.js ---
/**
 * Object creation/selection/deletion record handlers.
 *
 * Handles: CreatePen, ExtCreatePen, CreateBrushIndirect, CreateDIBPatternBrushPt,
 * ExtCreateFontIndirectW, SelectObject, DeleteObject, SelectPalette, CreatePalette
 */



const objectHandlers = {
  // ── EMR_CREATEPEN (0x26) ──────────────────────────────────────
  // Data layout (after 8-byte header):
  //   0x00  UINT32   ihPen
  //   0x04  UINT32   PenStyle
  //   0x08  INT32    Width.x (pen width)
  //   0x0C  INT32    Width.y (ignored)
  //   0x10  COLORREF Color
  [RecordType.EMR_CREATEPEN](view, offset, size, dc) {
    const ihPen = view.getUint32(offset, true);
    const penStyle = view.getUint32(offset + 4, true);
    const width = view.getInt32(offset + 8, true);
    const color = readColorRef(view, offset + 16);

    dc.objectTable.createObject(ihPen, {
      type: "pen",
      style: penStyle & PenStyle.PS_STYLE_MASK,
      endCap: penStyle & PenStyle.PS_ENDCAP_MASK,
      join: penStyle & PenStyle.PS_JOIN_MASK,
      width: Math.max(width, 0),
      color,
      dashPattern: null,
    });
  },

  // ── EMR_EXTCREATEPEN (0x5F) ───────────────────────────────────
  // Data layout (after 8-byte header):
  //   0x00  UINT32   ihPen
  //   0x04  UINT32   offBmi
  //   0x08  UINT32   cbBmi
  //   0x0C  UINT32   offBits
  //   0x10  UINT32   cbBits
  //   0x14  UINT32   elp.PenStyle
  //   0x18  UINT32   elp.Width
  //   0x1C  UINT32   elp.BrushStyle
  //   0x20  COLORREF elp.ColorRef
  //   0x24  UINT32   elp.BrushHatch
  //   0x28  UINT32   elp.NumStyleEntries
  //   0x2C  UINT32[] elp.StyleEntry[NumStyleEntries]
  [RecordType.EMR_EXTCREATEPEN](view, offset, size, dc) {
    const ihPen = view.getUint32(offset, true);
    const penStyle = view.getUint32(offset + 20, true);
    const width = view.getUint32(offset + 24, true);
    const color = readColorRef(view, offset + 32);
    const numStyleEntries = view.getUint32(offset + 40, true);

    let dashPattern = null;
    if ((penStyle & PenStyle.PS_STYLE_MASK) === PenStyle.PS_USERSTYLE && numStyleEntries > 0) {
      dashPattern = [];
      for (let i = 0; i < numStyleEntries; i++) {
        dashPattern.push(view.getUint32(offset + 44 + i * 4, true));
      }
    }

    dc.objectTable.createObject(ihPen, {
      type: "pen",
      style: penStyle & PenStyle.PS_STYLE_MASK,
      endCap: penStyle & PenStyle.PS_ENDCAP_MASK,
      join: penStyle & PenStyle.PS_JOIN_MASK,
      width,
      color,
      dashPattern,
    });
  },

  // ── EMR_CREATEBRUSHINDIRECT (0x27) ────────────────────────────
  // Data layout (after 8-byte header):
  //   0x00  UINT32   ihBrush
  //   0x04  UINT32   BrushStyle
  //   0x08  COLORREF Color
  //   0x0C  UINT32   BrushHatch
  [RecordType.EMR_CREATEBRUSHINDIRECT](view, offset, size, dc) {
    const ihBrush = view.getUint32(offset, true);
    const brushStyle = view.getUint32(offset + 4, true);
    const color = readColorRef(view, offset + 8);
    const brushHatch = view.getUint32(offset + 12, true);

    dc.objectTable.createObject(ihBrush, {
      type: "brush",
      style: brushStyle,
      color,
      hatch: brushStyle === BrushStyle.BS_HATCHED ? brushHatch : null,
    });
  },

  // ── EMR_CREATEDIBPATTERNBRUSHPT (0x5E) ────────────────────────
  // Data layout (after 8-byte header):
  //   0x00  UINT32  ihBrush
  //   0x04  UINT32  Usage (DIBColors enum)
  //   0x08  UINT32  offBmi  (from record start)
  //   0x0C  UINT32  cbBmi
  //   0x10  UINT32  offBits (from record start)
  //   0x14  UINT32  cbBits
  // We store the raw DIB data reference for later use (bitmap patterns).
  [RecordType.EMR_CREATEDIBPATTERNBRUSHPT](view, offset, size, dc) {
    const ihBrush = view.getUint32(offset, true);
    // Record start = offset - 8 (offset is after the type+size header)
    const recordStart = offset - 8;
    const offBmi = view.getUint32(offset + 8, true);
    const cbBmi = view.getUint32(offset + 12, true);
    const offBits = view.getUint32(offset + 16, true);
    const cbBits = view.getUint32(offset + 20, true);

    // For now, create a pattern brush with a reference to the DIB data.
    // The bitmap rendering will be completed in Phase 10.
    dc.objectTable.createObject(ihBrush, {
      type: "brush",
      style: BrushStyle.BS_DIBPATTERNPT,
      color: { r: 0, g: 0, b: 0 },
      hatch: null,
      dib: cbBmi > 0 ? {
        bmiOffset: recordStart + offBmi,
        bmiSize: cbBmi,
        bitsOffset: recordStart + offBits,
        bitsSize: cbBits,
      } : null,
    });
  },

  // ── EMR_EXTCREATEFONTINDIRECTW (0x52) ─────────────────────────
  // Data layout (after 8-byte header):
  //   0x00  UINT32  ihFonts
  //   0x04  LogFont (92 bytes) or LogFontExDv (320+ bytes)
  // LogFont layout:
  //   0x00  INT32   Height
  //   0x04  INT32   Width
  //   0x08  INT32   Escapement (tenths of degrees)
  //   0x0C  INT32   Orientation (tenths of degrees)
  //   0x10  INT32   Weight (400=normal, 700=bold)
  //   0x14  UINT8   Italic
  //   0x15  UINT8   Underline
  //   0x16  UINT8   StrikeOut
  //   0x17  UINT8   CharSet
  //   0x18  UINT8   OutPrecision
  //   0x19  UINT8   ClipPrecision
  //   0x1A  UINT8   Quality
  //   0x1B  UINT8   PitchAndFamily
  //   0x1C  WCHAR[32] Facename (64 bytes, UTF-16LE, null-terminated)
  [RecordType.EMR_EXTCREATEFONTINDIRECTW](view, offset, size, dc) {
    const ihFonts = view.getUint32(offset, true);
    const fontOff = offset + 4; // start of LogFont

    const height = view.getInt32(fontOff, true);
    const width = view.getInt32(fontOff + 4, true);
    const escapement = view.getInt32(fontOff + 8, true);
    const orientation = view.getInt32(fontOff + 12, true);
    const weight = view.getInt32(fontOff + 16, true);
    const italic = view.getUint8(fontOff + 20);
    const underline = view.getUint8(fontOff + 21);
    const strikeOut = view.getUint8(fontOff + 22);
    const charSet = view.getUint8(fontOff + 23);
    const pitchAndFamily = view.getUint8(fontOff + 27);
    const facename = readUTF16LE(view, fontOff + 28, 32);

    dc.objectTable.createObject(ihFonts, {
      type: "font",
      height,
      width,
      escapement,
      orientation,
      weight,
      italic: italic !== 0,
      underline: underline !== 0,
      strikeOut: strikeOut !== 0,
      charSet,
      pitchAndFamily,
      facename,
    });
  },

  // ── EMR_SELECTOBJECT (0x25) ───────────────────────────────────
  // Data: 0x00 UINT32 ihObject
  [RecordType.EMR_SELECTOBJECT](view, offset, size, dc) {
    const ihObject = view.getUint32(offset, true);
    dc.selectObject(ihObject);
  },

  // ── EMR_DELETEOBJECT (0x28) ───────────────────────────────────
  // Data: 0x00 UINT32 ihObject
  [RecordType.EMR_DELETEOBJECT](view, offset, size, dc) {
    const ihObject = view.getUint32(offset, true);
    dc.objectTable.deleteObject(ihObject);
  },

  // ── EMR_SELECTPALETTE (0x30) ──────────────────────────────────
  // Data: 0x00 UINT32 ihPal (stock DEFAULT_PALETTE or table index)
  [RecordType.EMR_SELECTPALETTE](view, offset, size, dc) {
    const ihPal = view.getUint32(offset, true);
    dc.selectObject(ihPal);
  },

  // ── EMR_CREATEPALETTE (0x31) ──────────────────────────────────
  // Data layout (after 8-byte header):
  //   0x00  UINT32  ihPal
  //   0x04  UINT16  Version (0x0300)
  //   0x06  UINT16  NumberOfEntries
  //   0x08  LogPaletteEntry[N] (4 bytes each: R, G, B, Flags)
  [RecordType.EMR_CREATEPALETTE](view, offset, size, dc) {
    const ihPal = view.getUint32(offset, true);
    const numEntries = view.getUint16(offset + 6, true);
    const entries = [];
    for (let i = 0; i < numEntries; i++) {
      const entOff = offset + 8 + i * 4;
      entries.push({
        r: view.getUint8(entOff),
        g: view.getUint8(entOff + 1),
        b: view.getUint8(entOff + 2),
      });
    }
    dc.objectTable.createObject(ihPal, {
      type: "palette",
      entries,
    });
  },
};


// --- records/drawing-shapes.js ---
/**
 * Shape drawing record handlers — Rectangle, Ellipse, RoundRect, LineTo,
 * Arc, ArcTo, Chord, Pie, AngleArc
 */




const drawingShapeHandlers = {
  // ── EMR_LINETO (0x36) ────────────────────────────────────────
  // Data: 0x00 INT32 x, 0x04 INT32 y
  [RecordType.EMR_LINETO](view, offset, size, dc, svg) {
    const x = view.getInt32(offset, true);
    const y = view.getInt32(offset + 4, true);

    if (dc.pathBracketOpen) {
      dc.path.push(`L${x} ${y}`);
    } else {
      svg.addLine(dc.currentPosition.x, dc.currentPosition.y, x, y, penToStrokeAttrs(dc.currentPen));
    }
    dc.currentPosition = { x, y };
  },

  // ── EMR_RECTANGLE (0x2B) ─────────────────────────────────────
  // Data: RectL (left, top, right, bottom)
  [RecordType.EMR_RECTANGLE](view, offset, size, dc, svg) {
    const box = readRectL(view, offset);
    const w = box.right - box.left;
    const h = box.bottom - box.top;

    if (dc.pathBracketOpen) {
      dc.path.push(`M${box.left} ${box.top}L${box.right} ${box.top}L${box.right} ${box.bottom}L${box.left} ${box.bottom}Z`);
    } else {
      svg.addRect(box.left, box.top, w, h, shapeAttrs(dc, svg));
    }
  },

  // ── EMR_ELLIPSE (0x2A) ───────────────────────────────────────
  // Data: RectL bounding box
  [RecordType.EMR_ELLIPSE](view, offset, size, dc, svg) {
    const box = readRectL(view, offset);
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    const rx = (box.right - box.left) / 2;
    const ry = (box.bottom - box.top) / 2;

    if (dc.pathBracketOpen) {
      // Approximate ellipse as path using two arcs
      dc.path.push(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}`);
    } else {
      svg.addEllipse(cx, cy, rx, ry, shapeAttrs(dc, svg));
    }
  },

  // ── EMR_ROUNDRECT (0x2C) ─────────────────────────────────────
  // Data: RectL box (16 bytes) + SizeL corner (8 bytes)
  [RecordType.EMR_ROUNDRECT](view, offset, size, dc, svg) {
    const box = readRectL(view, offset);
    const cornerW = view.getInt32(offset + 16, true);
    const cornerH = view.getInt32(offset + 20, true);
    const w = box.right - box.left;
    const h = box.bottom - box.top;
    const rx = Math.min(cornerW / 2, w / 2);
    const ry = Math.min(cornerH / 2, h / 2);

    if (dc.pathBracketOpen) {
      // Path for rounded rect
      const l = box.left, t = box.top, r = box.right, b = box.bottom;
      dc.path.push(
        `M${l + rx} ${t}L${r - rx} ${t}A${rx} ${ry} 0 0 1 ${r} ${t + ry}` +
        `L${r} ${b - ry}A${rx} ${ry} 0 0 1 ${r - rx} ${b}` +
        `L${l + rx} ${b}A${rx} ${ry} 0 0 1 ${l} ${b - ry}` +
        `L${l} ${t + ry}A${rx} ${ry} 0 0 1 ${l + rx} ${t}Z`
      );
    } else {
      svg.addRect(box.left, box.top, w, h, {
        rx, ry,
        ...shapeAttrs(dc, svg),
      });
    }
  },

  // ── EMR_ARC (0x2D) ───────────────────────────────────────────
  // Data: RectL box (16), PointL start (8), PointL end (8)
  [RecordType.EMR_ARC](view, offset, size, dc, svg) {
    const box = readRectL(view, offset);
    const start = { x: view.getInt32(offset + 16, true), y: view.getInt32(offset + 20, true) };
    const end = { x: view.getInt32(offset + 24, true), y: view.getInt32(offset + 28, true) };

    const d = emfArcPath(box, start, end, dc.arcDirection, false, false);
    if (dc.pathBracketOpen) {
      dc.path.push(d);
    } else {
      svg.addPath(d, { fill: "none", ...penToStrokeAttrs(dc.currentPen) });
    }
  },

  // ── EMR_ARCTO (0x37) ─────────────────────────────────────────
  // Same layout as Arc. Updates current position. Draws line from CP to arc start.
  [RecordType.EMR_ARCTO](view, offset, size, dc, svg) {
    const box = readRectL(view, offset);
    const start = { x: view.getInt32(offset + 16, true), y: view.getInt32(offset + 20, true) };
    const end = { x: view.getInt32(offset + 24, true), y: view.getInt32(offset + 28, true) };

    const { startPt, endPt, arcD } = emfArcData(box, start, end, dc.arcDirection);

    if (dc.pathBracketOpen) {
      // Line from current position to arc start, then the arc
      dc.path.push(`L${startPt.x} ${startPt.y}${arcD}`);
    } else {
      const d = `M${dc.currentPosition.x} ${dc.currentPosition.y}L${startPt.x} ${startPt.y}${arcD}`;
      svg.addPath(d, { fill: "none", ...penToStrokeAttrs(dc.currentPen) });
    }
    dc.currentPosition = { x: endPt.x, y: endPt.y };
  },

  // ── EMR_CHORD (0x2E) ─────────────────────────────────────────
  // Same layout as Arc. Closed with a straight line from end to start.
  [RecordType.EMR_CHORD](view, offset, size, dc, svg) {
    const box = readRectL(view, offset);
    const start = { x: view.getInt32(offset + 16, true), y: view.getInt32(offset + 20, true) };
    const end = { x: view.getInt32(offset + 24, true), y: view.getInt32(offset + 28, true) };

    const d = emfArcPath(box, start, end, dc.arcDirection, false, true);
    if (dc.pathBracketOpen) {
      dc.path.push(d);
    } else {
      svg.addPath(d, shapeAttrs(dc, svg));
    }
  },

  // ── EMR_PIE (0x2F) ───────────────────────────────────────────
  // Same layout as Arc. Closed as a pie (lines from end→center→start).
  [RecordType.EMR_PIE](view, offset, size, dc, svg) {
    const box = readRectL(view, offset);
    const start = { x: view.getInt32(offset + 16, true), y: view.getInt32(offset + 20, true) };
    const end = { x: view.getInt32(offset + 24, true), y: view.getInt32(offset + 28, true) };

    const d = emfArcPath(box, start, end, dc.arcDirection, true, true);
    if (dc.pathBracketOpen) {
      dc.path.push(d);
    } else {
      svg.addPath(d, shapeAttrs(dc, svg));
    }
  },
};

// ─── Arc math helpers ────────────────────────────────────────────

/**
 * Convert EMF arc parameters to an SVG path string.
 *
 * EMF arcs are defined by:
 * - A bounding rectangle (the ellipse)
 * - A start point (defines the starting radial)
 * - An end point (defines the ending radial)
 * - Arc direction (CW or CCW from start to end)
 *
 * The start/end points define radial lines from the center —
 * the actual arc starts/ends where these radials intersect the ellipse.
 */
function emfArcPath(box, start, end, arcDirection, isPie, isClosed) {
  const { startPt, endPt, arcD } = emfArcData(box, start, end, arcDirection);
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;

  let d = `M${startPt.x} ${startPt.y}${arcD}`;

  if (isPie) {
    d += `L${cx} ${cy}Z`;
  } else if (isClosed) {
    d += "Z";
  }

  return d;
}

/**
 * Compute arc data: actual start/end points on the ellipse and SVG arc command.
 */
function emfArcData(box, start, end, arcDirection) {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const rx = Math.abs(box.right - box.left) / 2;
  const ry = Math.abs(box.bottom - box.top) / 2;

  if (rx === 0 || ry === 0) {
    return { startPt: { x: cx, y: cy }, endPt: { x: cx, y: cy }, arcD: "" };
  }

  // Compute angles from center to start/end points
  const startAngle = Math.atan2(
    (start.y - cy) / ry,
    (start.x - cx) / rx,
  );
  const endAngle = Math.atan2(
    (end.y - cy) / ry,
    (end.x - cx) / rx,
  );

  // Actual intersection points on the ellipse
  const startPt = {
    x: cx + rx * Math.cos(startAngle),
    y: cy + ry * Math.sin(startAngle),
  };
  const endPt = {
    x: cx + rx * Math.cos(endAngle),
    y: cy + ry * Math.sin(endAngle),
  };

  // Compute sweep angle
  let sweep;
  if (arcDirection === ArcDirection.AD_COUNTERCLOCKWISE) {
    // CCW in GDI (y-axis points down) = CW in math
    sweep = startAngle - endAngle;
    if (sweep <= 0) sweep += 2 * Math.PI;
  } else {
    // CW in GDI = CCW in math
    sweep = endAngle - startAngle;
    if (sweep <= 0) sweep += 2 * Math.PI;
  }

  // SVG arc flags
  const largeArc = sweep > Math.PI ? 1 : 0;
  // SVG sweep-flag: 1 = clockwise in screen coords (y-down)
  const sweepFlag = arcDirection === ArcDirection.AD_CLOCKWISE ? 1 : 0;

  const arcD = `A${rx} ${ry} 0 ${largeArc} ${sweepFlag} ${endPt.x} ${endPt.y}`;

  return { startPt, endPt, arcD };
}


// --- records/drawing-poly.js ---
/**
 * Poly drawing record handlers — Polyline, Polygon, PolyBezier, PolyBezierTo,
 * PolyLineTo, PolyPolyline, PolyPolygon, and their 16-bit variants.
 */




const drawingPolyHandlers = {
  // ── 32-bit point variants ─────────────────────────────────────

  // EMR_POLYLINE (0x04) — RectL bounds (16) + UINT32 count (4) + PointL[count]
  [RecordType.EMR_POLYLINE](view, offset, size, dc, svg) {
    const count = view.getUint32(offset + 16, true);
    const points = readPointLArray(view, offset + 20, count);
    emitPolyline(points, dc, svg);
  },

  // EMR_POLYGON (0x03) — RectL bounds (16) + UINT32 count (4) + PointL[count]
  [RecordType.EMR_POLYGON](view, offset, size, dc, svg) {
    const count = view.getUint32(offset + 16, true);
    const points = readPointLArray(view, offset + 20, count);
    emitPolygon(points, dc, svg);
  },

  // EMR_POLYBEZIER (0x02) — RectL bounds (16) + UINT32 count (4) + PointL[count]
  [RecordType.EMR_POLYBEZIER](view, offset, size, dc, svg) {
    const count = view.getUint32(offset + 16, true);
    const points = readPointLArray(view, offset + 20, count);
    emitPolybezier(points, dc, svg);
  },

  // EMR_POLYBEZIERTO (0x05) — RectL bounds (16) + UINT32 count (4) + PointL[count]
  [RecordType.EMR_POLYBEZIERTO](view, offset, size, dc, svg) {
    const count = view.getUint32(offset + 16, true);
    const points = readPointLArray(view, offset + 20, count);
    emitPolybezierTo(points, dc, svg);
  },

  // EMR_POLYLINETO (0x06) — RectL bounds (16) + UINT32 count (4) + PointL[count]
  [RecordType.EMR_POLYLINETO](view, offset, size, dc, svg) {
    const count = view.getUint32(offset + 16, true);
    const points = readPointLArray(view, offset + 20, count);
    emitPolylineTo(points, dc, svg);
  },

  // EMR_POLYPOLYLINE (0x07) — RectL (16) + nPolys (4) + nPoints (4) + polyCounts[nPolys] + PointL[nPoints]
  [RecordType.EMR_POLYPOLYLINE](view, offset, size, dc, svg) {
    parsePolyPoly(view, offset, false, readPointLArray, dc, svg, false);
  },

  // EMR_POLYPOLYGON (0x08) — same layout
  [RecordType.EMR_POLYPOLYGON](view, offset, size, dc, svg) {
    parsePolyPoly(view, offset, false, readPointLArray, dc, svg, true);
  },

  // ── 16-bit point variants ────────────────────────────────────

  // EMR_POLYLINE16 (0x57) — RectL bounds (16) + UINT32 count (4) + PointS[count]
  [RecordType.EMR_POLYLINE16](view, offset, size, dc, svg) {
    const count = view.getUint32(offset + 16, true);
    const points = readPointSArray(view, offset + 20, count);
    emitPolyline(points, dc, svg);
  },

  // EMR_POLYGON16 (0x56)
  [RecordType.EMR_POLYGON16](view, offset, size, dc, svg) {
    const count = view.getUint32(offset + 16, true);
    const points = readPointSArray(view, offset + 20, count);
    emitPolygon(points, dc, svg);
  },

  // EMR_POLYBEZIER16 (0x55)
  [RecordType.EMR_POLYBEZIER16](view, offset, size, dc, svg) {
    const count = view.getUint32(offset + 16, true);
    const points = readPointSArray(view, offset + 20, count);
    emitPolybezier(points, dc, svg);
  },

  // EMR_POLYBEZIERTO16 (0x58)
  [RecordType.EMR_POLYBEZIERTO16](view, offset, size, dc, svg) {
    const count = view.getUint32(offset + 16, true);
    const points = readPointSArray(view, offset + 20, count);
    emitPolybezierTo(points, dc, svg);
  },

  // EMR_POLYLINETO16 (0x59)
  [RecordType.EMR_POLYLINETO16](view, offset, size, dc, svg) {
    const count = view.getUint32(offset + 16, true);
    const points = readPointSArray(view, offset + 20, count);
    emitPolylineTo(points, dc, svg);
  },

  // EMR_POLYPOLYLINE16 (0x5A)
  [RecordType.EMR_POLYPOLYLINE16](view, offset, size, dc, svg) {
    parsePolyPoly(view, offset, true, readPointSArray, dc, svg, false);
  },

  // EMR_POLYPOLYGON16 (0x5B)
  [RecordType.EMR_POLYPOLYGON16](view, offset, size, dc, svg) {
    parsePolyPoly(view, offset, true, readPointSArray, dc, svg, true);
  },
};

// ─── Emit helpers ────────────────────────────────────────────────

function emitPolyline(points, dc, svg) {
  if (points.length < 2) return;
  const d = `M${points[0].x} ${points[0].y}` +
    points.slice(1).map(p => `L${p.x} ${p.y}`).join("");

  if (dc.pathBracketOpen) {
    dc.path.push(d);
  } else {
    svg.addPath(d, { fill: "none", ...penToStrokeAttrs(dc.currentPen) });
  }
}

function emitPolygon(points, dc, svg) {
  if (points.length < 2) return;
  const d = `M${points[0].x} ${points[0].y}` +
    points.slice(1).map(p => `L${p.x} ${p.y}`).join("") + "Z";

  if (dc.pathBracketOpen) {
    dc.path.push(d);
  } else {
    svg.addPath(d, {
      fillRule: fillRule(dc.polyFillMode),
      ...shapeAttrs(dc, svg),
    });
  }
}

function emitPolybezier(points, dc, svg) {
  if (points.length < 4) return;
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i + 2 < points.length; i += 3) {
    d += `C${points[i].x} ${points[i].y},${points[i + 1].x} ${points[i + 1].y},${points[i + 2].x} ${points[i + 2].y}`;
  }

  if (dc.pathBracketOpen) {
    dc.path.push(d);
  } else {
    svg.addPath(d, { fill: "none", ...penToStrokeAttrs(dc.currentPen) });
  }
}

function emitPolybezierTo(points, dc, svg) {
  if (points.length < 3) return;
  let d = "";
  for (let i = 0; i + 2 < points.length; i += 3) {
    d += `C${points[i].x} ${points[i].y},${points[i + 1].x} ${points[i + 1].y},${points[i + 2].x} ${points[i + 2].y}`;
  }

  if (dc.pathBracketOpen) {
    dc.path.push(d);
  } else {
    const fullD = `M${dc.currentPosition.x} ${dc.currentPosition.y}${d}`;
    svg.addPath(fullD, { fill: "none", ...penToStrokeAttrs(dc.currentPen) });
  }

  // Update current position to last point
  const last = points[points.length - 1];
  dc.currentPosition = { x: last.x, y: last.y };
}

function emitPolylineTo(points, dc, svg) {
  if (points.length < 1) return;
  const d = points.map(p => `L${p.x} ${p.y}`).join("");

  if (dc.pathBracketOpen) {
    dc.path.push(d);
  } else {
    const fullD = `M${dc.currentPosition.x} ${dc.currentPosition.y}${d}`;
    svg.addPath(fullD, { fill: "none", ...penToStrokeAttrs(dc.currentPen) });
  }

  const last = points[points.length - 1];
  dc.currentPosition = { x: last.x, y: last.y };
}

/**
 * Parse PolyPolyline/PolyPolygon records (both 16 and 32-bit variants).
 * Layout: RectL bounds (16) + UINT32 nPolys (4) + UINT32 nPoints (4) +
 *         UINT32[nPolys] polyCounts + Point[nPoints]
 */
function parsePolyPoly(view, offset, is16bit, readFn, dc, svg, isPolygon) {
  const nPolys = view.getUint32(offset + 16, true);
  const nPoints = view.getUint32(offset + 20, true);

  // Read poly counts
  const polyCounts = [];
  let off = offset + 24;
  for (let i = 0; i < nPolys; i++) {
    polyCounts.push(view.getUint32(off, true));
    off += 4;
  }

  // Read all points
  const allPoints = readFn(view, off, nPoints);

  // Build path data for all sub-paths
  let d = "";
  let idx = 0;
  for (let i = 0; i < nPolys; i++) {
    const count = polyCounts[i];
    if (count < 2) { idx += count; continue; }

    d += `M${allPoints[idx].x} ${allPoints[idx].y}`;
    for (let j = 1; j < count; j++) {
      d += `L${allPoints[idx + j].x} ${allPoints[idx + j].y}`;
    }
    if (isPolygon) d += "Z";
    idx += count;
  }

  if (!d) return;

  if (dc.pathBracketOpen) {
    dc.path.push(d);
  } else if (isPolygon) {
    svg.addPath(d, {
      fillRule: fillRule(dc.polyFillMode),
      ...shapeAttrs(dc, svg),
    });
  } else {
    svg.addPath(d, { fill: "none", ...penToStrokeAttrs(dc.currentPen) });
  }
}


// --- records/path.js ---
/**
 * Path bracket and fill/stroke record handlers.
 *
 * Handles: BeginPath, EndPath, CloseFigure, AbortPath, FlattenPath, WidenPath,
 * FillPath, StrokeAndFillPath, StrokePath, SetMetaRgn
 */



/**
 * Ensure path data starts with M (moveto). SVG requires this.
 * If the path starts with L, C, or other commands (due to PolyBezierTo/PolyLineTo
 * being the first command after BeginPath without a preceding MoveToEx),
 * prepend M0 0 as a fallback.
 */
function safePath(d) {
  if (d.length > 0 && d[0] !== "M" && d[0] !== "m") {
    return "M0 0" + d;
  }
  return d;
}

const pathHandlers = {
  // ── EMR_BEGINPATH (0x3B) ──────────────────────────────────────
  [RecordType.EMR_BEGINPATH](view, offset, size, dc) {
    dc.pathBracketOpen = true;
    dc.path = [];
  },

  // ── EMR_ENDPATH (0x3C) ───────────────────────────────────────
  [RecordType.EMR_ENDPATH](view, offset, size, dc) {
    dc.pathBracketOpen = false;
    // Path data stays in dc.path until consumed by Fill/Stroke/SelectClipPath
  },

  // ── EMR_CLOSEFIGURE (0x3D) ───────────────────────────────────
  [RecordType.EMR_CLOSEFIGURE](view, offset, size, dc) {
    dc.path.push("Z");
  },

  // ── EMR_ABORTPATH (0x44) ─────────────────────────────────────
  [RecordType.EMR_ABORTPATH](view, offset, size, dc) {
    dc.pathBracketOpen = false;
    dc.path = [];
  },

  // ── EMR_FLATTENPATH (0x41) — no-op (SVG beziers need no flattening)
  [RecordType.EMR_FLATTENPATH]() {},

  // ── EMR_WIDENPATH (0x42) — no-op (pen widening not needed for SVG)
  [RecordType.EMR_WIDENPATH]() {},

  // ── EMR_FILLPATH (0x3E) ──────────────────────────────────────
  // Fills the current path with the current brush, then clears it.
  [RecordType.EMR_FILLPATH](view, offset, size, dc, svg) {
    if (dc.path.length === 0) return;
    const d = safePath(dc.path.join(""));
    svg.addPath(d, {
      fillRule: fillRule(dc.polyFillMode),
      ...brushToFillAttrs(dc.currentBrush, svg),
      stroke: "none",
    });
    dc.path = [];
  },

  // ── EMR_STROKEANDFILLPATH (0x3F) ─────────────────────────────
  // Fills and strokes the current path, then clears it.
  [RecordType.EMR_STROKEANDFILLPATH](view, offset, size, dc, svg) {
    if (dc.path.length === 0) return;
    const d = safePath(dc.path.join(""));
    svg.addPath(d, {
      fillRule: fillRule(dc.polyFillMode),
      ...brushToFillAttrs(dc.currentBrush, svg),
      ...penToStrokeAttrs(dc.currentPen),
    });
    dc.path = [];
  },

  // ── EMR_STROKEPATH (0x40) ────────────────────────────────────
  // Strokes the current path with the current pen, then clears it.
  [RecordType.EMR_STROKEPATH](view, offset, size, dc, svg) {
    if (dc.path.length === 0) return;
    const d = safePath(dc.path.join(""));
    svg.addPath(d, {
      fill: "none",
      ...penToStrokeAttrs(dc.currentPen),
    });
    dc.path = [];
  },

  // ── EMR_SETMETARGN (0x1C) ────────────────────────────────────
  // Intersects current clipping region with current meta region.
  // In practice this is a no-op for SVG since we handle clipping differently.
  [RecordType.EMR_SETMETARGN]() {},
};


// --- records/drawing-text.js ---
/**
 * Text rendering record handlers — ExtTextOutW, ExtTextOutA
 */




const drawingTextHandlers = {
  // ── EMR_EXTTEXTOUTW (0x54) ───────────────────────────────────
  // Data layout (after 8-byte header):
  //   0x00  RectL   Bounds (16 bytes)
  //   0x10  UINT32  iGraphicsMode
  //   0x14  FLOAT   exScale
  //   0x18  FLOAT   eyScale
  //   0x1C  EmrText (variable):
  //     0x1C  PointL  Reference (8 bytes)
  //     0x24  UINT32  nChars
  //     0x28  UINT32  offString (from record start)
  //     0x2C  UINT32  fOptions
  //     0x30  RectL   Rectangle (16 bytes, for ETO_OPAQUE/ETO_CLIPPED)
  //     0x40  UINT32  offDx (from record start)
  //     Then: string data at offString, Dx array at offDx
  [RecordType.EMR_EXTTEXTOUTW](view, offset, size, dc, svg) {
    emitTextOut(view, offset, dc, svg, true);
  },

  // ── EMR_EXTTEXTOUTA (0x53) ───────────────────────────────────
  // Same layout but ANSI string instead of Unicode.
  [RecordType.EMR_EXTTEXTOUTA](view, offset, size, dc, svg) {
    emitTextOut(view, offset, dc, svg, false);
  },
};

function emitTextOut(view, offset, dc, svg, isUnicode) {
  const recordStart = offset - 8; // record starts at the type field

  // Reference point
  const refX = view.getInt32(offset + 28, true);
  const refY = view.getInt32(offset + 32, true);
  const nChars = view.getUint32(offset + 36, true);
  const offString = view.getUint32(offset + 40, true);
  const fOptions = view.getUint32(offset + 44, true);

  if (nChars === 0) return;

  // Read the string
  let text;
  const strOffset = recordStart + offString;
  if (isUnicode) {
    text = readUTF16LE(view, strOffset, nChars);
  } else {
    // ANSI: read as single-byte characters
    const chars = [];
    for (let i = 0; i < nChars; i++) {
      const code = view.getUint8(strOffset + i);
      if (code === 0) break;
      chars.push(String.fromCharCode(code));
    }
    text = chars.join("");
  }

  if (!text) return;

  // Draw opaque background rectangle if needed
  if (fOptions & ExtTextOutOptions.ETO_OPAQUE) {
    const rect = readRectL(view, offset + 48);
    svg.addRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top, {
      fill: colorToSvg(dc.backgroundColor),
      stroke: "none",
    });
  }

  // Build text attributes
  const attrs = {};

  // Text color
  attrs.fill = colorToSvg(dc.textColor);

  // Font properties
  const font = dc.currentFont;
  if (font) {
    if (font.facename) {
      attrs.fontFamily = font.facename;
    }
    if (font.height !== 0) {
      // Font height: negative = character height (em), positive = cell height
      // SVG font-size corresponds roughly to the em height
      attrs.fontSize = Math.abs(font.height);
    }
    if (font.weight >= 700) {
      attrs.fontWeight = "bold";
    } else if (font.weight > 0 && font.weight < 400) {
      attrs.fontWeight = "lighter";
    }
    if (font.italic) {
      attrs.fontStyle = "italic";
    }
    if (font.underline || font.strikeOut) {
      const decs = [];
      if (font.underline) decs.push("underline");
      if (font.strikeOut) decs.push("line-through");
      attrs.textDecoration = decs.join(" ");
    }
    // Rotation (escapement is in tenths of degrees)
    if (font.escapement && font.escapement !== 0) {
      const degrees = -font.escapement / 10; // EMF: CCW positive; SVG: CW positive
      attrs.transform = `rotate(${degrees},${refX},${refY})`;
    }
  }

  // Horizontal alignment
  const hAlign = dc.textAlign & TextAlignment.TA_HORZ_MASK;
  if (hAlign === TextAlignment.TA_CENTER) {
    attrs.textAnchor = "middle";
  } else if (hAlign === TextAlignment.TA_RIGHT) {
    attrs.textAnchor = "end";
  }
  // TA_LEFT is the SVG default

  // Vertical alignment
  const vAlign = dc.textAlign & TextAlignment.TA_VERT_MASK;
  if (vAlign === TextAlignment.TA_BASELINE) {
    attrs.dominantBaseline = "auto"; // default (alphabetic baseline)
  } else if (vAlign === TextAlignment.TA_BOTTOM) {
    attrs.dominantBaseline = "text-after-edge";
  } else {
    // TA_TOP
    attrs.dominantBaseline = "text-before-edge";
  }

  svg.addText(text, refX, refY, attrs);
}


// --- records/clipping.js ---
/**
 * Clipping record handlers — IntersectClipRect, ExcludeClipRect,
 * ExtSelectClipRgn, SelectClipPath, OffsetClipRgn
 */



/**
 * Ensure path data starts with M for valid SVG.
 */

const clippingHandlers = {
  // ── EMR_INTERSECTCLIPRECT (0x1E) ─────────────────────────────
  // Data: RectL (16 bytes)
  // Sets clip to intersection of current clip and rectangle.
  [RecordType.EMR_INTERSECTCLIPRECT](view, offset, size, dc, svg, renderer) {
    const rect = readRectL(view, offset);

    // Apply the current composite transform to clip rect coordinates
    // so they match the device coordinate space
    const transformStr = renderer.getCurrentTransformString();
    const transformAttr = transformStr ? ` transform="${transformStr}"` : "";
    const rectContent = `<rect x="${rect.left}" y="${rect.top}" width="${rect.right - rect.left}" height="${rect.bottom - rect.top}"${transformAttr}/>`;

    const clipId = svg.addClipPath(rectContent);
    dc.clipId = clipId;

    // Route through renderer for proper group management
    renderer.openClipGroup(clipId);
  },

  // ── EMR_EXCLUDECLIPRECT (0x1D) ───────────────────────────────
  // Rarely used, stub for completeness.
  [RecordType.EMR_EXCLUDECLIPRECT](view, offset, size, dc) {
    // Exclude clip rect — complex to implement in SVG.
    // Would need to subtract a rect from the current clip region.
    // Very rarely used in practice (0 files in corpus).
  },

  // ── EMR_EXTSELECTCLIPRGN (0x4B) ──────────────────────────────
  // Data layout:
  //   0x00  UINT32  RgnDataSize
  //   0x04  UINT32  RegionMode
  //   0x08  RgnData (variable — only if RgnDataSize > 0)
  //
  // RGN_COPY = replace clip with region data
  // Other modes combine with existing clip
  // If RgnDataSize == 8 and mode == RGN_COPY, this resets to default (no clip)
  [RecordType.EMR_EXTSELECTCLIPRGN](view, offset, size, dc, svg, renderer) {
    const rgnDataSize = view.getUint32(offset, true);
    const regionMode = view.getUint32(offset + 4, true);

    if (regionMode === RegionMode.RGN_COPY && rgnDataSize <= 8) {
      // Reset clipping — close clip group through renderer
      if (dc.clipId) {
        renderer.closeClipGroup();
        dc.clipId = null;
      }
      return;
    }

    if (rgnDataSize <= 8) return;

    // Parse RgnData header: UINT32 size, UINT32 type, UINT32 count,
    //   UINT32 rgnSize, RectL bounds, then RectL[count] rectangles
    const rgnOffset = offset + 8;
    const rgnCount = view.getUint32(rgnOffset + 8, true);

    if (rgnCount === 0) return;

    // Apply the current composite transform to clip rect coordinates
    const transformStr = renderer.getCurrentTransformString();
    const transformAttr = transformStr ? ` transform="${transformStr}"` : "";

    // Build clip path from rectangles
    let clipContent = "";
    const rectsOffset = rgnOffset + 32; // after header (32 bytes)
    for (let i = 0; i < rgnCount; i++) {
      const rect = readRectL(view, rectsOffset + i * 16);
      clipContent += `<rect x="${rect.left}" y="${rect.top}" width="${rect.right - rect.left}" height="${rect.bottom - rect.top}"${transformAttr}/>`;
    }

    // Close any existing clip group before opening new one
    if (dc.clipId) {
      renderer.closeClipGroup();
    }

    const clipId = svg.addClipPath(clipContent);
    dc.clipId = clipId;
    renderer.openClipGroup(clipId);
  },

  // ── EMR_SELECTCLIPPATH (0x43) ────────────────────────────────
  // Data: UINT32 RegionMode
  // Uses the current path as the clip region.
  [RecordType.EMR_SELECTCLIPPATH](view, offset, size, dc, svg, renderer) {
    if (dc.path.length === 0) return;

    const d = safePath(dc.path.join(""));

    // Apply the current composite transform to clip path coordinates
    const transformStr = renderer.getCurrentTransformString();
    const transformAttr = transformStr ? ` transform="${transformStr}"` : "";
    const clipContent = `<path d="${d}"${transformAttr}/>`;

    // Close any existing clip group
    if (dc.clipId) {
      renderer.closeClipGroup();
    }

    const clipId = svg.addClipPath(clipContent);
    dc.clipId = clipId;
    dc.path = [];
    renderer.openClipGroup(clipId);
  },

  // ── EMR_OFFSETCLIPRGN (0x1A) ─────────────────────────────────
  // Not used in corpus, stub.
  [RecordType.EMR_OFFSETCLIPRGN]() {},
};


// --- records/bitmap.js ---
/**
 * Bitmap record handlers — StretchDIBits, BitBlt
 * Embeds bitmap images in SVG as base64 data URIs.
 */



const bitmapHandlers = {
  // ── EMR_STRETCHDIBITS (0x51) ──────────────────────────────────
  // Post-header offsets:
  //   0x00  RectL   Bounds (16)
  //   0x10  INT32   xDest
  //   0x14  INT32   yDest
  //   0x18  INT32   xSrc
  //   0x1C  INT32   ySrc
  //   0x20  INT32   cxSrc
  //   0x24  INT32   cySrc
  //   0x28  UINT32  offBmiSrc (from record start)
  //   0x2C  UINT32  cbBmiSrc
  //   0x30  UINT32  offBitsSrc (from record start)
  //   0x34  UINT32  cbBitsSrc
  //   0x38  UINT32  UsageSrc
  //   0x3C  UINT32  BitBltRasterOp
  //   0x40  INT32   cxDest
  //   0x44  INT32   cyDest
  [RecordType.EMR_STRETCHDIBITS](view, offset, size, dc, svg) {
    const recordStart = offset - 8;
    const xDest = view.getInt32(offset + 16, true);
    const yDest = view.getInt32(offset + 20, true);
    const offBmiSrc = view.getUint32(offset + 40, true);
    const cbBmiSrc = view.getUint32(offset + 44, true);
    const offBitsSrc = view.getUint32(offset + 48, true);
    const cbBitsSrc = view.getUint32(offset + 52, true);
    const cxDest = view.getInt32(offset + 64, true);
    const cyDest = view.getInt32(offset + 68, true);

    if (cbBmiSrc === 0 || cbBitsSrc === 0) return;

    const dataUri = dibToDataUri(view.buffer, recordStart + offBmiSrc, cbBmiSrc, recordStart + offBitsSrc, cbBitsSrc);
    if (dataUri) {
      svg.addImage(dataUri, xDest, yDest, Math.abs(cxDest), Math.abs(cyDest));
    }
  },

  // ── EMR_BITBLT (0x4C) ────────────────────────────────────────
  // Post-header offsets:
  //   0x00  RectL   Bounds (16)
  //   0x10  INT32   xDest
  //   0x14  INT32   yDest
  //   0x18  INT32   cxDest
  //   0x1C  INT32   cyDest
  //   0x20  UINT32  BitBltRasterOp
  //   0x24  INT32   xSrc
  //   0x28  INT32   ySrc
  //   0x2C  XForm   XformSrc (24 bytes)
  //   0x44  COLORREF BkColorSrc
  //   0x48  UINT32  UsageSrc
  //   0x4C  UINT32  offBmiSrc (from record start)
  //   0x50  UINT32  cbBmiSrc
  //   0x54  UINT32  offBitsSrc (from record start)
  //   0x58  UINT32  cbBitsSrc
  [RecordType.EMR_BITBLT](view, offset, size, dc, svg) {
    const recordStart = offset - 8;
    const xDest = view.getInt32(offset + 16, true);
    const yDest = view.getInt32(offset + 20, true);
    const cxDest = view.getInt32(offset + 24, true);
    const cyDest = view.getInt32(offset + 28, true);
    const rop = view.getUint32(offset + 32, true);
    const offBmiSrc = view.getUint32(offset + 76, true);
    const cbBmiSrc = view.getUint32(offset + 80, true);
    const offBitsSrc = view.getUint32(offset + 84, true);
    const cbBitsSrc = view.getUint32(offset + 88, true);

    // Handle PATCOPY and other no-source operations
    if (cbBmiSrc === 0 || cbBitsSrc === 0) {
      // Could be a solid fill operation (PATCOPY, BLACKNESS, WHITENESS)
      if (rop === TernaryRasterOp.BLACKNESS) {
        svg.addRect(xDest, yDest, cxDest, cyDest, { fill: "#000000", stroke: "none" });
      } else if (rop === TernaryRasterOp.WHITENESS) {
        svg.addRect(xDest, yDest, cxDest, cyDest, { fill: "#ffffff", stroke: "none" });
      }
      return;
    }

    const dataUri = dibToDataUri(view.buffer, recordStart + offBmiSrc, cbBmiSrc, recordStart + offBitsSrc, cbBitsSrc);
    if (dataUri) {
      svg.addImage(dataUri, xDest, yDest, Math.abs(cxDest), Math.abs(cyDest));
    }
  },
};

// ─── DIB to Data URI conversion ─────────────────────────────────

/**
 * Convert an embedded DIB (BITMAPINFOHEADER + pixel data) to a BMP data URI.
 * We construct a complete BMP file in memory, then base64-encode it.
 *
 * @param {ArrayBuffer} buffer - Full EMF buffer
 * @param {number} bmiOffset - Byte offset to BITMAPINFOHEADER
 * @param {number} bmiSize - Size of the header + color table
 * @param {number} bitsOffset - Byte offset to pixel data
 * @param {number} bitsSize - Size of pixel data
 * @returns {string|null} BMP data URI or null if cannot convert
 */
function dibToDataUri(buffer, bmiOffset, bmiSize, bitsOffset, bitsSize) {
  if (bmiSize < 40 || bitsSize === 0) return null;

  const headerView = new DataView(buffer, bmiOffset, bmiSize);
  const biCompression = headerView.getUint32(16, true);

  // Check if the bitmap data is already a JPEG or PNG
  if (biCompression === BICompression.BI_JPEG) {
    const bytes = new Uint8Array(buffer, bitsOffset, bitsSize);
    return "data:image/jpeg;base64," + uint8ToBase64(bytes);
  }
  if (biCompression === BICompression.BI_PNG) {
    const bytes = new Uint8Array(buffer, bitsOffset, bitsSize);
    return "data:image/png;base64," + uint8ToBase64(bytes);
  }

  // Construct a complete BMP file: FileHeader (14) + DIB header + color table + pixel data
  const fileHeaderSize = 14;
  const bmpSize = fileHeaderSize + bmiSize + bitsSize;
  const bmp = new Uint8Array(bmpSize);
  const bmpView = new DataView(bmp.buffer);

  // BMP file header (14 bytes)
  bmp[0] = 0x42; bmp[1] = 0x4D; // "BM"
  bmpView.setUint32(2, bmpSize, true);     // total file size
  bmpView.setUint16(6, 0, true);            // reserved1
  bmpView.setUint16(8, 0, true);            // reserved2
  bmpView.setUint32(10, fileHeaderSize + bmiSize, true); // offset to pixel data

  // Copy BITMAPINFOHEADER + color table
  bmp.set(new Uint8Array(buffer, bmiOffset, bmiSize), fileHeaderSize);

  // Copy pixel data
  bmp.set(new Uint8Array(buffer, bitsOffset, bitsSize), fileHeaderSize + bmiSize);

  return "data:image/bmp;base64," + uint8ToBase64(bmp);
}

/**
 * Convert Uint8Array to base64 string.
 * Works in both browser and Node.js.
 */
function uint8ToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    // Node.js
    return Buffer.from(bytes).toString("base64");
  }
  // Browser
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}


// --- records/comment.js ---
/**
 * Comment record handler — EMR_COMMENT
 *
 * EMR_COMMENT records can contain EMF+ data, spool data, or public comments.
 * We detect and log EMF+ presence but don't process the content.
 */


const commentHandlers = {
  // ── EMR_COMMENT (0x46) ───────────────────────────────────────
  // Data layout:
  //   0x00  UINT32  DataSize (size of comment data)
  //   0x04  bytes   CommentData[DataSize]
  //
  // If DataSize >= 4, the first 4 bytes of CommentData identify the type:
  //   0x2B464D45 = EMF+ records ("EMF+")
  //   0x43494447 = Public comment ("GDIC")
  //   Other = generic comment
  [RecordType.EMR_COMMENT](view, offset, size, dc, svg, renderer) {
    // Comments are informational — no SVG output needed.
    // We could parse EMF+ here in the future.
  },
};


// --- emf2svg.js ---
/**
 * EMF to SVG converter — public API.
 *
 * @module emf2svg
 *
 * Usage:
 *   import { emf2svg } from "./emf2svg.js";
 *   const result = emf2svg(arrayBuffer);
 *   // result.type === "svg"   → result.data is an SVG string
 *   // result.type === "image" → result.data is a PNG/BMP data URI
 */















// Record types that constitute "drawing" operations
const DRAWING_RECORDS = new Set([
  RecordType.EMR_POLYBEZIER, RecordType.EMR_POLYGON, RecordType.EMR_POLYLINE,
  RecordType.EMR_POLYBEZIERTO, RecordType.EMR_POLYLINETO,
  RecordType.EMR_POLYPOLYLINE, RecordType.EMR_POLYPOLYGON,
  RecordType.EMR_SETPIXELV, RecordType.EMR_ANGLEARC,
  RecordType.EMR_ELLIPSE, RecordType.EMR_RECTANGLE, RecordType.EMR_ROUNDRECT,
  RecordType.EMR_ARC, RecordType.EMR_CHORD, RecordType.EMR_PIE,
  RecordType.EMR_LINETO, RecordType.EMR_ARCTO,
  RecordType.EMR_FILLPATH, RecordType.EMR_STROKEANDFILLPATH, RecordType.EMR_STROKEPATH,
  RecordType.EMR_FILLRGN, RecordType.EMR_FRAMERGN,
  RecordType.EMR_EXTTEXTOUTA, RecordType.EMR_EXTTEXTOUTW,
  RecordType.EMR_POLYBEZIER16, RecordType.EMR_POLYGON16, RecordType.EMR_POLYLINE16,
  RecordType.EMR_POLYBEZIERTO16, RecordType.EMR_POLYLINETO16,
  RecordType.EMR_POLYPOLYLINE16, RecordType.EMR_POLYPOLYGON16,
  RecordType.EMR_BITBLT, RecordType.EMR_STRETCHBLT,
  RecordType.EMR_STRETCHDIBITS, RecordType.EMR_SETDIBITSTODEVICE,
  RecordType.EMR_ALPHABLEND, RecordType.EMR_TRANSPARENTBLT,
  RecordType.EMR_GRADIENTFILL,
]);

/**
 * Convert an EMF file (as ArrayBuffer) to SVG or image data URI.
 *
 * @param {ArrayBuffer} buffer - The EMF file data
 * @param {Object} [options]
 * @param {boolean} [options.quiet=false] - Suppress unhandled record warnings
 * @returns {{ type: "svg"|"image", data: string, unhandled?: string[] }}
 */
function emf2svg(buffer, options = {}) {
  const parsed = parseEMF(buffer);

  // BMP-wrapper detection: if the only drawing operation is a single bitmap record
  // covering the full frame, return the bitmap directly instead of wrapping in SVG.
  const bmpResult = detectBmpWrapper(parsed, buffer);
  if (bmpResult) {
    return bmpResult;
  }

  const renderer = new Renderer(options);

  // Register all record handlers
  renderer.registerHandlers(controlHandlers);
  renderer.registerHandlers(stateHandlers);
  renderer.registerHandlers(transformHandlers);
  renderer.registerHandlers(objectHandlers);
  renderer.registerHandlers(drawingShapeHandlers);
  renderer.registerHandlers(drawingPolyHandlers);
  renderer.registerHandlers(pathHandlers);
  renderer.registerHandlers(drawingTextHandlers);
  renderer.registerHandlers(clippingHandlers);
  renderer.registerHandlers(bitmapHandlers);
  renderer.registerHandlers(commentHandlers);

  const svgString = renderer.render(parsed);

  if (!options.quiet) {
    renderer.logUnhandled();
  }

  const result = { type: "svg", data: svgString };

  if (renderer.unhandledRecords.size > 0) {
    result.unhandled = [...renderer.unhandledRecords].map(t =>
      `0x${t.toString(16)}`
    );
  }

  return result;
}

/**
 * Detect BMP-wrapper EMFs: files whose only drawing operation is a single
 * StretchDIBits or BitBlt covering the full frame.
 *
 * @returns {{ type: "image", data: string }|null}
 */
function detectBmpWrapper(parsed, buffer) {
  const { records } = parsed;
  const view = new DataView(buffer);

  // Find all drawing records
  const drawingRecords = records.filter(r => DRAWING_RECORDS.has(r.type));

  // Must be exactly one bitmap drawing record
  if (drawingRecords.length !== 1) return null;
  const rec = drawingRecords[0];

  if (rec.type !== RecordType.EMR_STRETCHDIBITS && rec.type !== RecordType.EMR_BITBLT) {
    return null;
  }

  let offBmiSrc, cbBmiSrc, offBitsSrc, cbBitsSrc;

  if (rec.type === RecordType.EMR_STRETCHDIBITS) {
    offBmiSrc = view.getUint32(rec.dataOffset + 40, true);
    cbBmiSrc = view.getUint32(rec.dataOffset + 44, true);
    offBitsSrc = view.getUint32(rec.dataOffset + 48, true);
    cbBitsSrc = view.getUint32(rec.dataOffset + 52, true);
  } else {
    // BitBlt
    offBmiSrc = view.getUint32(rec.dataOffset + 76, true);
    cbBmiSrc = view.getUint32(rec.dataOffset + 80, true);
    offBitsSrc = view.getUint32(rec.dataOffset + 84, true);
    cbBitsSrc = view.getUint32(rec.dataOffset + 88, true);
  }

  if (cbBmiSrc === 0 || cbBitsSrc === 0) return null;

  // Build data URI (reuse logic from bitmap.js)
  const recordStart = rec.offset;
  const bmiOffset = recordStart + offBmiSrc;
  const bitsOffset = recordStart + offBitsSrc;

  if (bmiOffset + cbBmiSrc > buffer.byteLength || bitsOffset + cbBitsSrc > buffer.byteLength) {
    return null;
  }

  const headerView = new DataView(buffer, bmiOffset, Math.min(cbBmiSrc, 40));
  const biCompression = headerView.getUint32(16, true);

  // If already JPEG or PNG, extract directly
  if (biCompression === BICompression.BI_JPEG) {
    const bytes = new Uint8Array(buffer, bitsOffset, cbBitsSrc);
    return { type: "image", data: "data:image/jpeg;base64," + uint8ToBase64(bytes) };
  }
  if (biCompression === BICompression.BI_PNG) {
    const bytes = new Uint8Array(buffer, bitsOffset, cbBitsSrc);
    return { type: "image", data: "data:image/png;base64," + uint8ToBase64(bytes) };
  }

  // Build a complete BMP file
  const fileHeaderSize = 14;
  const bmpSize = fileHeaderSize + cbBmiSrc + cbBitsSrc;
  const bmp = new Uint8Array(bmpSize);
  const bmpView = new DataView(bmp.buffer);

  bmp[0] = 0x42; bmp[1] = 0x4D;
  bmpView.setUint32(2, bmpSize, true);
  bmpView.setUint16(6, 0, true);
  bmpView.setUint16(8, 0, true);
  bmpView.setUint32(10, fileHeaderSize + cbBmiSrc, true);
  bmp.set(new Uint8Array(buffer, bmiOffset, cbBmiSrc), fileHeaderSize);
  bmp.set(new Uint8Array(buffer, bitsOffset, cbBitsSrc), fileHeaderSize + cbBmiSrc);

  return { type: "image", data: "data:image/bmp;base64," + uint8ToBase64(bmp) };
}



// --- draw.io integration wrapper ---
function emfToSvg(buffer) {
  var result = emf2svg(buffer, { quiet: true });

  if (result.type === "image") {
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
      + '<image width="100%" height="100%" xlink:href="' + result.data + '"/>'
      + '</svg>';
  }

  return result.data;
}
window["emfToSvg"] = emfToSvg;

})();

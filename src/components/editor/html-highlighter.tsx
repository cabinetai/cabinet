"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  getPalette,
  highlight,
  resolveSwatch,
  type HighlightOptions,
  type MarkHandle,
  type MarkType,
  type PaletteName,
} from "@highlighters/core";
import { Pin, PinOff, Eye, EyeOff, Settings, BookOpen, Trash2 } from "lucide-react";
import { useAppStore } from "@/stores/app-store";

type PenType = "chisel" | "bullet" | "fine";
type EdgeStyle = "crisp" | "natural" | "messy";
type AnimationMode = "static" | "on-load" | "on-scroll";

interface HighlightStyle {
  markType: MarkType;
  color: string;
  palette?: PaletteName;
  swatch?: string;
  opacity: number;
  edgeStyle: EdgeStyle;
  glowEnabled: boolean;
  glowIntensity: number;
  animationMode: AnimationMode;
  tipAngle: number;
}

interface SavedHighlight {
  startPath: string;
  startOffset: number;
  endPath: string;
  endOffset: number;
  color: string;
  pen: PenType;
  style?: HighlightStyle;
}

interface HtmlHighlighterProps {
  htmlPath: string;
  children: React.ReactNode;
}

// Preset color swatches matching the website palette.
const SWATCHES = [
  { id: "brown", hex: "#6f584c" },
  { id: "blue", hex: "#3b7cf5" },
  { id: "green", hex: "#54c45f" },
  { id: "yellow", hex: "#f5c842" },
  { id: "red", hex: "#ee4a3d" },
];

const PALETTE_NAMES: PaletteName[] = ["fluorescent", "mild", "vintage", "neutral", "calm"];

const DEFAULT_STYLE: HighlightStyle = {
  markType: "highlight",
  color: "#f5c842",
  opacity: 0.55,
  edgeStyle: "natural",
  glowEnabled: false,
  glowIntensity: 0.45,
  animationMode: "on-load",
  tipAngle: 35,
};

function getHighlightOptions(style: HighlightStyle, pen: PenType): HighlightOptions {
  const edge = style.edgeStyle === "crisp"
    ? { waviness: 0, roughness: 0, cap: "square" as const, radius: 0 }
    : style.edgeStyle === "messy"
      ? { waviness: 3, roughness: 0.85, cap: "round" as const, radius: 3 }
      : { waviness: 1.25, roughness: 0.35, cap: "round" as const, radius: 2 };
  const animation = style.animationMode === "static"
    ? { draw: false }
    : style.animationMode === "on-scroll"
      ? { draw: true, trigger: "in-view" as const, duration: 650, threshold: 0.2 }
      : { draw: true, trigger: "immediate" as const, duration: 550 };

  return {
    markType: style.markType,
    color: style.palette && style.swatch
      ? { palette: style.palette, swatch: style.swatch }
      : style.color,
    opacity: style.opacity,
    edge,
    glow: {
      enabled: style.glowEnabled,
      intensity: style.glowIntensity,
      spread: style.glowEnabled ? 6 : 0,
    },
    animation,
    snap: "word",
    tip: { type: pen, angle: style.tipAngle },
    vivid: true,
  };
}

function getSavedStyle(highlightData: SavedHighlight): HighlightStyle {
  return highlightData.style ?? { ...DEFAULT_STYLE, color: highlightData.color };
}

function getHighlightsPath(htmlPath: string): string {
  const parts = htmlPath.split("/");
  const filename = parts.pop();
  parts.push(`.${filename}.highlights.json`);
  return parts.join("/");
}

// Serializes a DOM Node to an XPath string relative to the root node.
function getNodeXPath(node: Node, root: Node): string {
  const parts: string[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) break;

    let index = 0;
    let sibling = parent.firstChild;
    while (sibling && sibling !== current) {
      if (sibling.nodeType === current.nodeType) {
        if (
          current.nodeType === Node.ELEMENT_NODE &&
          (sibling as Element).tagName === (current as Element).tagName
        ) {
          index++;
        } else if (current.nodeType === Node.TEXT_NODE) {
          index++;
        }
      }
      sibling = sibling.nextSibling;
    }

    let part = "";
    if (current.nodeType === Node.ELEMENT_NODE) {
      const tagName = (current as Element).tagName.toLowerCase();
      part = `${tagName}[${index}]`;
    } else if (current.nodeType === Node.TEXT_NODE) {
      part = `text()[${index}]`;
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join("/");
}

// Deserializes an XPath string back to a DOM Node.
function getNodeByXPath(path: string, root: Node): Node | null {
  const parts = path.split("/");
  let current = root;
  for (const part of parts) {
    if (!part) continue;
    const match = part.match(/^([a-z0-9*-]+)\[(\d+)\]$/i);
    const textMatch = part.match(/^text\(\)\[(\d+)\]$/);
    if (textMatch) {
      const index = parseInt(textMatch[1], 10);
      let count = 0;
      let found: Node | null = null;
      for (let i = 0; i < current.childNodes.length; i++) {
        const child = current.childNodes[i];
        if (child.nodeType === Node.TEXT_NODE) {
          if (count === index) {
            found = child;
            break;
          }
          count++;
        }
      }
      if (!found) return null;
      current = found;
    } else if (match) {
      const tagName = match[1].toLowerCase();
      const index = parseInt(match[2], 10);
      let count = 0;
      let found: Element | null = null;
      for (let i = 0; i < current.childNodes.length; i++) {
        const child = current.childNodes[i];
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          (child as Element).tagName.toLowerCase() === tagName
        ) {
          if (count === index) {
            found = child as Element;
            break;
          }
          count++;
        }
      }
      if (!found) return null;
      current = found;
    } else {
      return null;
    }
  }
  return current;
}

// Pen component inside the capsule
const PenComponent = ({
  type,
  active,
  color,
  onClick,
}: {
  type: "chisel" | "bullet" | "fine";
  active: boolean;
  color: string;
  onClick: () => void;
}) => {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`relative w-8 h-18 flex flex-col items-center justify-end transition-all duration-200 cursor-pointer ${
        active ? "-translate-y-2.5" : "hover:-translate-y-1 hover:scale-102"
      }`}
    >
      {/* Pen Tip SVG */}
      <svg width="18" height="20" viewBox="0 0 18 20" fill="none" className="overflow-visible">
        {type === "chisel" && (
          <path
            d="M3 20 L3 12 L5 4 L13 1 L15 12 L15 20 Z"
            fill="#e5e2db"
            stroke="#bebab3"
            strokeWidth="0.5"
          />
        )}
        {type === "bullet" && (
          <path
            d="M3 20 L3 12 Q3 4 9 4 Q15 4 15 12 L15 20 Z"
            fill="#e5e2db"
            stroke="#bebab3"
            strokeWidth="0.5"
          />
        )}
        {type === "fine" && (
          <path
            d="M5 20 L5 12 L8 2 L10 2 L13 12 L13 20 Z"
            fill="#e5e2db"
            stroke="#bebab3"
            strokeWidth="0.5"
          />
        )}
        
        {/* Colored Tip Ink */}
        {type === "chisel" && (
          <path d="M5 4 L13 1 L15 10 L10 10 C9 10 7 7 5 10 Z" fill={color} />
        )}
        {type === "bullet" && (
          <path d="M3 10 Q3 4 9 4 Q15 4 15 10 Q12 9 9 11 Q6 9 3 10 Z" fill={color} />
        )}
        {type === "fine" && (
          <path d="M8 2 L10 2 L11 10 L7 10 Z" fill={color} />
        )}
      </svg>

      {/* Barrel body */}
      <div className="w-7 h-11 bg-[#f3f2ec] border border-black/10 rounded-t-sm rounded-b-md flex flex-col items-center justify-between py-1 relative shadow-[0_2px_4px_rgba(0,0,0,0.06)]">
        {/* Color ring */}
        <div style={{ backgroundColor: color }} className="w-full h-2 my-0.5 border-y border-black/5" />
        {/* Opacity Label */}
        <span className="text-[7.5px] font-bold text-black/45 scale-90">58</span>
        {/* Highlight shine */}
        <div className="absolute inset-y-0 left-1 w-0.5 bg-white/40 rounded-full" />
      </div>
    </button>
  );
};

// Interface for temporary document override patching
interface PatchedDocument {
  createRange: () => Range;
  createTreeWalker: (root: Node, whatToShow?: number, filter?: NodeFilter | null) => TreeWalker;
}

// Bypasses the WRONG_DOCUMENT_ERR DOMException and cross-realm iframe checks inside @highlighters/core
// by temporarily overriding parent document creation methods with the iframe document implementation.
const safeHighlight = (
  target: Selection,
  options: Parameters<typeof highlight>[1],
  host: HTMLElement,
  iframeDoc: Document
): MarkHandle => {
  const docObj = window.document as unknown as PatchedDocument;
  const originalCreateRange = docObj.createRange;
  const originalCreateTreeWalker = docObj.createTreeWalker;
  const overlayLayers = () => Array.from(iframeDoc.querySelectorAll<HTMLElement>("[aria-hidden='true']"))
    .filter((element) => element.style.position === "absolute" && element.style.pointerEvents === "none");
  const existingLayers = new Set(overlayLayers());
  let mark: MarkHandle;

  try {
    docObj.createRange = () => {
      return iframeDoc.createRange();
    };
    docObj.createTreeWalker = (
      root: Node,
      whatToShow?: number,
      filter?: NodeFilter | null
    ) => {
      return iframeDoc.createTreeWalker(root, whatToShow, filter);
    };

    mark = highlight(target, options, host);
  } finally {
    docObj.createRange = originalCreateRange;
    docObj.createTreeWalker = originalCreateTreeWalker;
  }

  let privateLayers = overlayLayers().filter((element) => !existingLayers.has(element));
  const setLayerVisibility = (visibility: "" | "hidden") => {
    privateLayers.forEach((element) => {
      element.style.visibility = visibility;
    });
  };

  return {
    get tier() {
      return mark.tier;
    },
    show() {
      mark.show();
      setLayerVisibility("");
    },
    hide() {
      mark.hide();
      setLayerVisibility("hidden");
    },
    isShowing() {
      return mark.isShowing();
    },
    update(nextOptions) {
      const beforeUpdate = new Set(overlayLayers());
      mark.update(nextOptions);
      privateLayers = [
        ...privateLayers,
        ...overlayLayers().filter((element) => !beforeUpdate.has(element)),
      ];
    },
    remove() {
      mark.remove();
      privateLayers = [];
    },
  };
};

export function HtmlHighlighter({ htmlPath, children }: HtmlHighlighterProps) {
  const setAppMode = useAppStore((state) => state.setAppMode);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const activeMarksRef = useRef<MarkHandle[]>([]);
  const highlightsRef = useRef<SavedHighlight[]>([]);
  const docRef = useRef<Document | null>(null);
  const isMenuPinnedRef = useRef(false);

  const [showMenu, setShowMenu] = useState(false);
  const [isMenuPinned, setIsMenuPinned] = useState(false);
  const [selectedRange, setSelectedRange] = useState<Range | null>(null);
  const [overlappingHighlight, setOverlappingHighlight] = useState<SavedHighlight | null>(null);

  // Tools state matching the PKColorPicker dock
  const [activePen, setActivePen] = useState<PenType>("chisel");
  const [activeColor, setActiveColor] = useState<string>("#f5c842"); // Default Yellow
  const [showAllHighlights, setShowAllHighlights] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [highlightStyle, setHighlightStyle] = useState<HighlightStyle>(DEFAULT_STYLE);

  const isPresetColor = SWATCHES.some((s) => s.hex === activeColor);

  const clearMarks = () => {
    activeMarksRef.current.forEach((m) => {
      try {
        m.remove();
      } catch (e) {
        console.error("Failed to remove highlight mark:", e);
      }
    });
    activeMarksRef.current = [];
  };

  const getOverlappingHighlight = (range: Range, currentHighlights: SavedHighlight[]): SavedHighlight | null => {
    const doc = docRef.current;
    if (!doc) return null;
    const body = doc.body;

    for (const h of currentHighlights) {
      const startNode = getNodeByXPath(h.startPath, body);
      const endNode = getNodeByXPath(h.endPath, body);
      if (startNode && endNode) {
        try {
          const hRange = doc.createRange();
          hRange.setStart(startNode, h.startOffset);
          hRange.setEnd(endNode, h.endOffset);

          const intersects =
            range.compareBoundaryPoints(Range.END_TO_START, hRange) < 0 &&
            range.compareBoundaryPoints(Range.START_TO_END, hRange) > 0;
          if (intersects) {
            return h;
          }
        } catch (e) {
          console.error("Failed to compare selection boundaries:", e);
        }
      }
    }
    return null;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const iframe = container.querySelector("iframe");
    if (!iframe) return;

    iframeRef.current = iframe;
    let cleanupSelectionListener: (() => void) | null = null;
    let mouseIsDown = false;

    const setupHighlights = async () => {
      try {
        clearMarks();
        if (cleanupSelectionListener) {
          cleanupSelectionListener();
          cleanupSelectionListener = null;
        }
        docRef.current = null;

        const doc = iframe.contentDocument;
        if (!doc) return;
        docRef.current = doc;

      // 1. Load saved highlights from sidecar
      const highlightsUrl = `/api/assets/${getHighlightsPath(htmlPath)}`;
      let saved: SavedHighlight[] = [];
      try {
        const res = await fetch(highlightsUrl);
        if (res.ok) {
          saved = await res.json();
        }
      } catch (e) {
        console.error("Failed to load highlights from sidecar:", e);
      }
      highlightsRef.current = saved;

      // 2. Apply highlights to iframe document body
      const body = doc.body;
      const newMarks: MarkHandle[] = [];
      saved.forEach((h) => {
        const range = doc.createRange();
        const startNode = getNodeByXPath(h.startPath, body);
        const endNode = getNodeByXPath(h.endPath, body);
        if (startNode && endNode) {
          try {
            range.setStart(startNode, h.startOffset);
            range.setEnd(endNode, h.endOffset);
            // Wrap in duck-typed Selection object to bypass cross-realm Range checks
            const mimicSelection = {
              getRangeAt: () => range,
              rangeCount: 1,
            };
            const mark = safeHighlight(
              mimicSelection as unknown as Selection,
              getHighlightOptions(getSavedStyle(h), h.pen || "chisel"),
              body,
              doc
            );
            newMarks.push(mark);
          } catch (e) {
            console.error("Failed to paint saved highlight:", e);
          }
        }
      });
      activeMarksRef.current = newMarks;

      // 3. Setup selection listener
      const handleMouseDown = () => {
        mouseIsDown = true;
      };

      const handleMouseUp = () => {
        mouseIsDown = false;
        handleSelection();
      };

      const handleSelection = () => {
        if (mouseIsDown) return;

        const selection = iframe.contentWindow?.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed && selection.toString().trim()) {
          try {
            const range = selection.getRangeAt(0);
            setSelectedRange(range);
            setOverlappingHighlight(getOverlappingHighlight(range, highlightsRef.current));
            setShowMenu(true);
          } catch (e) {
            console.error("Failed to measure selection coordinates:", e);
          }
        } else {
          setShowMenu(isMenuPinnedRef.current);
          setShowSettings(false);
          setSelectedRange(null);
          setOverlappingHighlight(null);
        }
      };

      const handleLinkClick = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof doc.defaultView!.Element)) return;
        const anchor = target.closest("a");
        if (!anchor || anchor.hasAttribute("download")) return;
        const href = anchor.getAttribute("href");
        if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return;
        try {
          const linkUrl = new URL(href, anchor.baseURI);
          if (
            linkUrl.origin !== window.location.origin &&
            (linkUrl.protocol === "http:" || linkUrl.protocol === "https:")
          ) {
            event.preventDefault();
            setAppMode("browse", linkUrl.toString());
          }
        } catch {}
      };

      doc.addEventListener("mousedown", handleMouseDown);
      doc.addEventListener("mouseup", handleMouseUp);
      doc.addEventListener("selectionchange", handleSelection);
      doc.addEventListener("click", handleLinkClick);

      cleanupSelectionListener = () => {
        doc.removeEventListener("mousedown", handleMouseDown);
        doc.removeEventListener("mouseup", handleMouseUp);
        doc.removeEventListener("selectionchange", handleSelection);
        doc.removeEventListener("click", handleLinkClick);
      };
    } catch (e) {
      if (e instanceof DOMException && e.name === "SecurityError") {
        docRef.current = null;
        return;
      }
      console.error("Failed to set up HTML highlighter:", e);
    }
    };

    const onIframeLoad = () => {
      void setupHighlights();
    };

    iframe.addEventListener("load", onIframeLoad);

    // Unconditionally setup immediately if the document body is already available
    if (iframe.contentDocument?.body) {
      void setupHighlights();
    }

    return () => {
      iframe.removeEventListener("load", onIframeLoad);
      clearMarks();
      if (cleanupSelectionListener) {
        cleanupSelectionListener();
      }
      highlightsRef.current = [];
      docRef.current = null;
      iframeRef.current = null;
    };
  }, [htmlPath, setAppMode]);

  const applyHighlight = async (
    colorHex: string,
    penType: PenType,
    styleOverride?: HighlightStyle
  ) => {
    if (!selectedRange || !iframeRef.current) return;
    const doc = docRef.current;
    if (!doc) return;

    const body = doc.body;
    const appliedStyle = { ...(styleOverride ?? highlightStyle), color: colorHex };
    try {
      // Wrap the range in a duck-typed Selection object to bypass cross-realm Range checks
      const mimicSelection = {
        getRangeAt: () => selectedRange,
        rangeCount: 1,
      };

      // 1. Paint stroke instantly
      const mark = safeHighlight(
        mimicSelection as unknown as Selection,
        getHighlightOptions(appliedStyle, penType),
        body,
        doc
      );
      activeMarksRef.current.push(mark);

      // 2. Save serialized coordinates
      const newHighlight: SavedHighlight = {
        startPath: getNodeXPath(selectedRange.startContainer, body),
        startOffset: selectedRange.startOffset,
        endPath: getNodeXPath(selectedRange.endContainer, body),
        endOffset: selectedRange.endOffset,
        color: colorHex,
        pen: penType,
        style: appliedStyle,
      };

      const nextHighlights = [...highlightsRef.current, newHighlight];
      highlightsRef.current = nextHighlights;

      // 3. Persist to sidecar highlights file
      const highlightsUrl = `/api/assets/${getHighlightsPath(htmlPath)}`;
      await fetch(highlightsUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextHighlights),
      });

      // Clear selection to hide bubble menu
      iframeRef.current.contentWindow?.getSelection()?.removeAllRanges();
      setShowMenu(isMenuPinnedRef.current);
      setShowSettings(false);
    } catch (e) {
      console.error("Failed to paint and save highlight selection:", e);
    }
  };

  const removeHighlight = async (hToDelete: SavedHighlight) => {
    const doc = docRef.current;
    if (!doc) return;
    const body = doc.body;

    const nextHighlights = highlightsRef.current.filter((h) => h !== hToDelete);
    highlightsRef.current = nextHighlights;

    try {
      // 1. Save updated array to disk
      const highlightsUrl = `/api/assets/${getHighlightsPath(htmlPath)}`;
      await fetch(highlightsUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextHighlights),
      });

      // 2. Re-create remaining marks to clear the deleted one
      clearMarks();
      const newMarks: MarkHandle[] = [];
      nextHighlights.forEach((h) => {
        const range = doc.createRange();
        const startNode = getNodeByXPath(h.startPath, body);
        const endNode = getNodeByXPath(h.endPath, body);
        if (startNode && endNode) {
          try {
            range.setStart(startNode, h.startOffset);
            range.setEnd(endNode, h.endOffset);
            const mimicSelection = {
              getRangeAt: () => range,
              rangeCount: 1,
            };
            const mark = safeHighlight(
              mimicSelection as unknown as Selection,
              getHighlightOptions(getSavedStyle(h), h.pen || "chisel"),
              body,
              doc
            );
            newMarks.push(mark);
          } catch (e) {
            console.error("Failed to paint remaining highlight:", e);
          }
        }
      });
      activeMarksRef.current = newMarks;

      // Clear selection
      iframeRef.current?.contentWindow?.getSelection()?.removeAllRanges();
      setShowMenu(isMenuPinnedRef.current);
      setShowSettings(false);
    } catch (e) {
      console.error("Failed to remove highlight:", e);
    }
  };

  // Toggles the visibility of all highlights on the page (Book icon action)
  const handleToggleAllHighlights = () => {
    const nextState = !showAllHighlights;
    setShowAllHighlights(nextState);
    activeMarksRef.current.forEach((m) => {
      try {
        if (nextState) {
          m.show();
        } else {
          m.hide();
        }
      } catch (e) {
        console.error("Failed to toggle mark visibility:", e);
      }
    });
  };

  const handleToggleMenuPin = () => {
    const nextPinned = !isMenuPinnedRef.current;
    isMenuPinnedRef.current = nextPinned;
    setIsMenuPinned(nextPinned);

    if (nextPinned) {
      setShowMenu(true);
      return;
    }

    const selection = iframeRef.current?.contentWindow?.getSelection();
    const hasSelection = Boolean(
      selection && selection.rangeCount > 0 && !selection.isCollapsed && selection.toString().trim()
    );
    setShowMenu(hasSelection);
    if (!hasSelection) {
      setShowSettings(false);
      setSelectedRange(null);
      setOverlappingHighlight(null);
    }
  };

  const selectedPalette = highlightStyle.palette ? getPalette(highlightStyle.palette) : null;

  return (
    <div ref={containerRef} className="w-full h-full relative flex flex-col flex-1 min-h-0">
      {children}
      {showMenu && (
        <div
          style={{
            position: "absolute",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
          }}
          className="flex items-center gap-6 p-3 px-6 bg-[#fbfbf9] border border-black/10 rounded-[32px] shadow-[0_12px_40px_rgba(0,0,0,0.12)] backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-200 select-none"
        >
          {/* Section 1: Left Navigation Buttons */}
          <div className="flex items-center gap-2">
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                handleToggleMenuPin();
              }}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer ${
                isMenuPinned ? "bg-[#6f584c] text-[#fbfbf9] hover:bg-[#6f584c]/90" : "bg-black/5 text-[#6f584c] hover:bg-black/10"
              }`}
              title={isMenuPinned ? "Unpin Highlighter menu" : "Pin Highlighter menu"}
              aria-pressed={isMenuPinned}
            >
              {isMenuPinned ? <PinOff className="w-4.5 h-4.5" /> : <Pin className="w-4.5 h-4.5" />}
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                handleToggleAllHighlights();
              }}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer ${
                showAllHighlights ? "bg-black/5 text-[#6f584c] hover:bg-black/10" : "bg-[#6f584c] text-[#fbfbf9] hover:bg-[#6f584c]/90"
              }`}
              title={showAllHighlights ? "Hide All Highlights" : "Show All Highlights"}
            >
              {showAllHighlights ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
            </button>
          </div>

          {/* Vertical Divider */}
          <div className="w-px h-10 bg-black/10" />

          {/* Section 2: Pen Nib Tools */}
          <div className="flex items-end gap-3 h-18">
            <PenComponent
              type="chisel"
              active={activePen === "chisel"}
              color={activeColor}
              onClick={() => setActivePen("chisel")}
            />
            <PenComponent
              type="bullet"
              active={activePen === "bullet"}
              color={activeColor}
              onClick={() => setActivePen("bullet")}
            />
            <PenComponent
              type="fine"
              active={activePen === "fine"}
              color={activeColor}
              onClick={() => setActivePen("fine")}
            />
          </div>

          {/* Vertical Divider */}
          <div className="w-px h-10 bg-black/10" />

          {/* Section 3: Colors Palette */}
          <div className="flex items-center gap-2">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const nextStyle = {
                    ...highlightStyle,
                    color: swatch.hex,
                    palette: undefined,
                    swatch: undefined,
                  };
                  setActiveColor(swatch.hex);
                  setHighlightStyle(nextStyle);
                  void applyHighlight(swatch.hex, activePen, nextStyle);
                }}
                style={{
                  backgroundColor: swatch.hex,
                  boxShadow: activeColor === swatch.hex
                    ? `0 0 0 2.5px #fbfbf9, 0 0 0 4.5px ${swatch.hex}`
                    : "inset 0 1px 3px rgba(0,0,0,0.12)",
                }}
                className="w-7 h-7 rounded-full border border-black/5 cursor-pointer transition-transform hover:scale-108 duration-100 flex items-center justify-center relative"
                title={`${swatch.id} ink`}
              />
            ))}

            {/* Custom Color Selector (PencilKit Gradient) */}
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                colorInputRef.current?.click();
              }}
              style={{
                background: isPresetColor
                  ? "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)"
                  : activeColor,
                boxShadow: !isPresetColor
                  ? `0 0 0 2.5px #fbfbf9, 0 0 0 4.5px ${activeColor}`
                  : "inset 0 1px 3px rgba(0,0,0,0.12)",
              }}
              className="w-7 h-7 rounded-full border border-black/5 cursor-pointer transition-transform hover:scale-108 duration-100 flex items-center justify-center relative"
              title="Custom ink"
            />
            <input
              ref={colorInputRef}
              type="color"
              value={activeColor}
              onChange={(e) => {
                const newColor = e.target.value;
                const nextStyle = {
                  ...highlightStyle,
                  color: newColor,
                  palette: undefined,
                  swatch: undefined,
                };
                setActiveColor(newColor);
                setHighlightStyle(nextStyle);
                void applyHighlight(newColor, activePen, nextStyle);
              }}
              className="hidden"
            />
          </div>

          {/* Vertical Divider */}
          <div className="w-px h-10 bg-black/10" />

          {/* Section 4: Actions & Apply/Delete */}
          <div className="relative flex items-center gap-2">
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setShowSettings((value) => !value);
              }}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer ${
                showSettings ? "bg-[#6f584c] text-[#fbfbf9]" : "bg-black/5 text-[#6f584c] hover:bg-black/10"
              }`}
              title="Highlight settings"
            >
              <Settings className="w-4.5 h-4.5" />
            </button>

            {showSettings && (
              <div className="absolute bottom-full right-0 mb-4 w-90 max-h-[min(620px,calc(100vh-140px))] overflow-y-auto rounded-2xl border border-black/10 bg-[#fbfbf9] p-4 text-[#3f352f] shadow-[0_18px_50px_rgba(0,0,0,0.2)] select-none">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Highlight style</div>
                    <div className="text-[11px] text-black/45">Applied to new marks</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-[#6f584c] hover:bg-black/5"
                  >
                    Done
                  </button>
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-black/45">Mark type</span>
                    <span className="grid grid-cols-4 gap-1 rounded-xl bg-black/5 p-1">
                      {(["highlight", "underline", "overline", "strike-through"] as MarkType[]).map((markType) => (
                        <button
                          key={markType}
                          type="button"
                          onClick={() => setHighlightStyle((style) => ({ ...style, markType }))}
                          className={`rounded-lg px-1.5 py-1.5 text-[10px] font-medium capitalize ${
                            highlightStyle.markType === markType ? "bg-white text-[#3f352f] shadow-sm" : "text-black/50 hover:text-black/75"
                          }`}
                        >
                          {markType === "strike-through" ? "Strike" : markType}
                        </button>
                      ))}
                    </span>
                  </label>

                  <div>
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-black/45">Color</span>
                    <div className="flex gap-2">
                      <select
                        value={highlightStyle.palette ?? "custom"}
                        onChange={(e) => {
                          if (e.target.value === "custom") {
                            setHighlightStyle((style) => ({ ...style, palette: undefined, swatch: undefined }));
                            return;
                          }
                          const palette = e.target.value as PaletteName;
                          const swatch = Object.keys(getPalette(palette).swatches)[0];
                          const color = resolveSwatch({ palette, swatch });
                          setActiveColor(color);
                          setHighlightStyle((style) => ({ ...style, palette, swatch, color }));
                        }}
                        className="h-8 flex-1 rounded-lg border border-black/10 bg-white px-2 text-xs outline-none focus:border-[#6f584c]/50"
                      >
                        <option value="custom">Custom color</option>
                        {PALETTE_NAMES.map((palette) => (
                          <option key={palette} value={palette}>{palette[0].toUpperCase() + palette.slice(1)}</option>
                        ))}
                      </select>
                      <input
                        type="color"
                        value={activeColor}
                        onChange={(e) => {
                          const color = e.target.value;
                          setActiveColor(color);
                          setHighlightStyle((style) => ({ ...style, color, palette: undefined, swatch: undefined }));
                        }}
                        className="h-8 w-10 cursor-pointer rounded-lg border border-black/10 bg-white p-1"
                        title="Custom color"
                      />
                    </div>
                    {selectedPalette && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(selectedPalette.swatches).map(([swatch, color]) => (
                          <button
                            key={swatch}
                            type="button"
                            onClick={() => {
                              const palette = highlightStyle.palette!;
                              const resolvedColor = resolveSwatch({ palette, swatch });
                              setActiveColor(resolvedColor);
                              setHighlightStyle((style) => ({ ...style, swatch, color: resolvedColor }));
                            }}
                            className="h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110"
                            style={{
                              backgroundColor: color,
                              boxShadow: highlightStyle.swatch === swatch ? `0 0 0 2px #fbfbf9, 0 0 0 4px ${color}` : undefined,
                            }}
                            title={swatch}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <label className="block">
                    <span className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-black/45">
                      <span>Opacity</span><span>{Math.round(highlightStyle.opacity * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min="0.2"
                      max="0.9"
                      step="0.05"
                      value={highlightStyle.opacity}
                      onChange={(e) => setHighlightStyle((style) => ({ ...style, opacity: Number(e.target.value) }))}
                      className="w-full accent-[#6f584c]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-black/45">Edge style</span>
                    <span className="grid grid-cols-3 gap-1 rounded-xl bg-black/5 p-1">
                      {(["crisp", "natural", "messy"] as EdgeStyle[]).map((edgeStyle) => (
                        <button
                          key={edgeStyle}
                          type="button"
                          onClick={() => setHighlightStyle((style) => ({ ...style, edgeStyle }))}
                          className={`rounded-lg px-2 py-1.5 text-xs font-medium capitalize ${
                            highlightStyle.edgeStyle === edgeStyle ? "bg-white shadow-sm" : "text-black/50 hover:text-black/75"
                          }`}
                        >
                          {edgeStyle}
                        </button>
                      ))}
                    </span>
                  </label>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-black/45">Fluorescent glow</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={highlightStyle.glowEnabled}
                        onClick={() => setHighlightStyle((style) => ({ ...style, glowEnabled: !style.glowEnabled }))}
                        className={`relative h-5 w-9 rounded-full transition-colors ${highlightStyle.glowEnabled ? "bg-[#6f584c]" : "bg-black/15"}`}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${highlightStyle.glowEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                    {highlightStyle.glowEnabled && (
                      <label className="mt-2 block">
                        <span className="mb-1 flex justify-between text-[10px] text-black/40"><span>Subtle</span><span>Strong</span></span>
                        <input
                          type="range"
                          min="0.2"
                          max="0.9"
                          step="0.05"
                          value={highlightStyle.glowIntensity}
                          onChange={(e) => setHighlightStyle((style) => ({ ...style, glowIntensity: Number(e.target.value) }))}
                          className="w-full accent-[#6f584c]"
                        />
                      </label>
                    )}
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-black/45">Animation</span>
                    <select
                      value={highlightStyle.animationMode}
                      onChange={(e) => setHighlightStyle((style) => ({ ...style, animationMode: e.target.value as AnimationMode }))}
                      className="h-8 w-full rounded-lg border border-black/10 bg-white px-2 text-xs outline-none focus:border-[#6f584c]/50"
                    >
                      <option value="static">Static</option>
                      <option value="on-load">Animate immediately</option>
                      <option value="on-scroll">Animate in view</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-black/45">
                      <span>Tip angle</span><span>{highlightStyle.tipAngle}°</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="60"
                      step="5"
                      value={highlightStyle.tipAngle}
                      onChange={(e) => setHighlightStyle((style) => ({ ...style, tipAngle: Number(e.target.value) }))}
                      className="w-full accent-[#6f584c]"
                    />
                  </label>
                </div>
              </div>
            )}
            
            {/* Draw Highlight Stroke Trigger */}
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setAppMode("browse", "https://highlighte.rs/docs");
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-[#6f584c] text-[#fbfbf9] hover:bg-[#6f584c]/90 shadow-sm transition-transform active:scale-95 duration-100 cursor-pointer"
              title="Open Highlighters documentation"
            >
              <BookOpen className="w-4.5 h-4.5" />
            </button>

            {overlappingHighlight && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  void removeHighlight(overlappingHighlight);
                }}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-white cursor-pointer transition-colors duration-100"
                title="Remove Highlight"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { Archive, Palette } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/layout/header";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { findNodeByPath } from "@/lib/cabinets/tree";
import { fetchPage } from "@/lib/api/client";
import type { TreeNode } from "@/types";
import { useLocale } from "@/i18n/use-locale";
import { renderLatexToHtml } from "@/components/editor/latex-render";
import { markdownToHtml } from "@/lib/markdown/to-html";

type CardSize = { width: number; height: number };
type CardPosition = { x: number; y: number };
type CanvasSnapshot = {
  whiteboardCardSizes?: Record<string, CardSize>;
  whiteboardCardPositions?: Record<string, CardPosition>;
  whiteboardCardPositionsByBoardPath?: Record<string, Record<string, CardPosition>>;
  whiteboardCardPositionsCenteredByBoardPath?: Record<string, boolean>;
  whiteboardCardPositionsCenterVersionByBoardPath?: Record<string, number>;
  whiteboardZoom?: number;
  whiteboardManualResizedByPath?: Record<string, boolean>;
  whiteboardAutoSizedByPath?: Record<string, boolean>;
  whiteboardCardBackgroundColorByPath?: Record<string, string>;
  whiteboardManualLayoutByBoardPath?: Record<string, boolean>;
  whiteboardManualPositionedByPath?: Record<string, boolean>;
};

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type ResizeState = {
  path: string;
  handle: ResizeHandle;
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};
type DragState = {
  path: string;
  pointerId: number;
  startX: number;
  startY: number;
  startCardX: number;
  startCardY: number;
  moved: boolean;
};
type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
};
type AutoSizeState = {
  path: string;
  width: number;
  height: number;
};

const CARD_MIN_WIDTH = 240;
const CARD_MAX_WIDTH = 980;
const CARD_MIN_HEIGHT = 120;
const CARD_MAX_HEIGHT = 900;
const CARD_DEFAULT_WIDTH = 360;
const CARD_DEFAULT_HEIGHT = 320;
const CARD_MARKDOWN_WIDTH = CARD_DEFAULT_WIDTH;
const CARD_MARKDOWN_HEIGHT = CARD_DEFAULT_HEIGHT;
const CARD_BODY_VERTICAL_OVERHEAD = 110;
const CARD_CANVAS_GAP = 16;
const CARD_CANVAS_COLUMNS = 3;
const WHITEBOARD_MIN_ZOOM = 0.5;
const WHITEBOARD_MAX_ZOOM = 2;
const WHITEBOARD_DEFAULT_ZOOM = 1;
const WHITEBOARD_CANVAS_BASE_SIZE = 12000;
const WHITEBOARD_CANVAS_ORIGIN_OFFSET = WHITEBOARD_CANVAS_BASE_SIZE / 2;
const WHITEBOARD_CENTER_VERSION = 3;
const WHITEBOARD_MINIMAP_WIDTH = 300;
const WHITEBOARD_MINIMAP_REVEAL_DISTANCE = 150;
const CANVAS_SELECTED_PALETTES_KEY = "cabinet-canvas-selected-palettes";

function isCardSize(value: unknown): value is CardSize {
  if (!value || typeof value !== "object") return false;
  const next = value as { width?: unknown; height?: unknown };
  return typeof next.width === "number" && typeof next.height === "number";
}

function isCardPosition(value: unknown): value is CardPosition {
  if (!value || typeof value !== "object") return false;
  const next = value as { x?: unknown; y?: unknown };
  return typeof next.x === "number" && typeof next.y === "number";
}

function isFolderObject(node: TreeNode): boolean {
  return node.type === "directory" || node.type === "cabinet";
}

function isPreviewFile(node: TreeNode): boolean {
  return (
    node.type === "file" ||
    node.type === "code" ||
    node.type === "image" ||
    node.type === "video" ||
    node.type === "pdf" ||
    node.type === "csv" ||
    node.type === "latex" ||
    node.type === "typst"
  );
}

function isCardObject(node: TreeNode): boolean {
  return isPreviewFile(node) || isFolderObject(node);
}

function getNodeKind(node: TreeNode): "cabinet" | "link-repo" | "page" {
  if (node.type === "cabinet") return "cabinet";
  if (node.hasRepo) return "link-repo";
  return "page";
}

function isComposedCard(node: TreeNode): boolean {
  if (node.type === "cabinet") return true;
  if (node.hasRepo) return true;
  if (!isFolderObject(node)) return false;
  return (node.children ?? []).some(isCardObject);
}

function getBoardNode(
  nodes: TreeNode[],
  selectedPath: string | null,
  fallbackPath: string
): TreeNode | null {
  if (selectedPath) {
    const selected = findNodeByPath(nodes, selectedPath);
    if (selected && isCardObject(selected)) return selected;
  }
  const fallback = findNodeByPath(nodes, fallbackPath);
  if (fallback && isCardObject(fallback)) return fallback;
  return null;
}

function assetUrl(nodePath: string): string {
  return `/api/assets/${nodePath.split("/").map(encodeURIComponent).join("/")}`;
}

function parseCsvPreview(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(current);
      current = "";
      continue;
    }

    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(current);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      current = "";
      if (ch === "\r") i++;
      if (rows.length >= 6) break;
      continue;
    }

    current += ch;
  }

  if (rows.length < 6) {
    row.push(current);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  return rows.map((r) => r.slice(0, 4));
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function makeScopedCardKey(boardPath: string, nodePath: string): string {
  return `${boardPath}::${nodePath}`;
}

function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? null;
}

function loadSelectedPaletteNames(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CANVAS_SELECTED_PALETTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function isMarkdownCard(node: TreeNode, content = ""): boolean {
  if (node.type === "file") return true;
  if (node.type === "code") {
    return /\.mdx?$/i.test(node.name) || /\.mdx?$/i.test(node.path);
  }
  if (isFolderObject(node)) {
    return content.trim().length > 0;
  }
  return false;
}
function getDefaultCardPosition(index: number): CardPosition {
  const column = index % CARD_CANVAS_COLUMNS;
  const row = Math.floor(index / CARD_CANVAS_COLUMNS);
  const rowWidth = CARD_CANVAS_COLUMNS * CARD_DEFAULT_WIDTH + (CARD_CANVAS_COLUMNS - 1) * CARD_CANVAS_GAP;
  const startX = WHITEBOARD_CANVAS_ORIGIN_OFFSET - Math.round(rowWidth / 2);
  const startY = WHITEBOARD_CANVAS_ORIGIN_OFFSET - Math.round(CARD_DEFAULT_HEIGHT / 2);
  return {
    x: startX + column * (CARD_DEFAULT_WIDTH + CARD_CANVAS_GAP),
    y: startY + row * (CARD_DEFAULT_HEIGHT + CARD_CANVAS_GAP),
  };
}

function computeAutoLayout(
  cards: TreeNode[],
  getSize: (node: TreeNode, index: number) => CardSize
): Record<string, CardPosition> {
  const layout: Record<string, CardPosition> = {};
  if (cards.length === 0) return layout;

  type Measured = { path: string; width: number; height: number };
  const measured: Measured[] = cards.map((node, index) => {
    const size = getSize(node, index);
    return {
      path: node.path,
      width: clamp(Math.round(size.width), CARD_MIN_WIDTH, CARD_MAX_WIDTH),
      height: clamp(Math.round(size.height), CARD_MIN_HEIGHT, CARD_MAX_HEIGHT),
    };
  });

  const count = measured.length;
  const targetRatio = 16 / 9;

  // Determine the column count that makes the overall grid closest to 16:9.
  // Using representative card dimensions, the ideal row count that yields a
  // 16:9 grid is R = sqrt(N * 9W / (16H)); we test the two nearest integers
  // and, for each, derive C = ceil(N / R), then pick the pair whose grid
  // aspect ratio (C*W)/(R*H) is closest to 16:9.
  const avgWidth = measured.reduce((sum, card) => sum + card.width, 0) / count;
  const avgHeight = measured.reduce((sum, card) => sum + card.height, 0) / count;
  const idealRows = Math.sqrt((count * 9 * avgWidth) / (16 * avgHeight));

  const rowCandidates = new Set<number>();
  for (const candidate of [Math.floor(idealRows), Math.ceil(idealRows)]) {
    rowCandidates.add(clamp(candidate, 1, count));
  }

  let columnCount = count;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const rowCount of rowCandidates) {
    const candidateColumns = Math.ceil(count / rowCount);
    const actualRows = Math.ceil(count / candidateColumns);
    const ratio = (candidateColumns * avgWidth) / (actualRows * avgHeight);
    const score = Math.abs(ratio - targetRatio);
    if (score < bestScore) {
      bestScore = score;
      columnCount = candidateColumns;
    }
  }

  // Place cards row-major in a clean grid aligned to per-column widths and
  // per-row heights, which guarantees no overlaps even with mixed sizes.
  const grid: Measured[][] = [];
  for (let index = 0; index < count; index += columnCount) {
    grid.push(measured.slice(index, index + columnCount));
  }

  const columnWidths: number[] = [];
  for (const row of grid) {
    row.forEach((card, columnIndex) => {
      columnWidths[columnIndex] = Math.max(columnWidths[columnIndex] ?? 0, card.width);
    });
  }
  const rowHeights = grid.map((row) => row.reduce((max, card) => Math.max(max, card.height), 0));

  const columnOffsets: number[] = [];
  let runningX = 0;
  for (let columnIndex = 0; columnIndex < columnWidths.length; columnIndex += 1) {
    columnOffsets[columnIndex] = runningX;
    runningX += columnWidths[columnIndex] + CARD_CANVAS_GAP;
  }

  const layoutWidth = columnWidths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, columnWidths.length - 1) * CARD_CANVAS_GAP;
  const layoutHeight = rowHeights.reduce((sum, height) => sum + height, 0) +
    Math.max(0, rowHeights.length - 1) * CARD_CANVAS_GAP;
  const startX = WHITEBOARD_CANVAS_ORIGIN_OFFSET - Math.round(layoutWidth / 2);
  const startY = WHITEBOARD_CANVAS_ORIGIN_OFFSET - Math.round(layoutHeight / 2);

  let cursorY = startY;
  grid.forEach((row, rowIndex) => {
    row.forEach((card, columnIndex) => {
      const cellX = startX + columnOffsets[columnIndex];
      layout[card.path] = {
        x: cellX + Math.round((columnWidths[columnIndex] - card.width) / 2),
        y: cursorY + Math.round((rowHeights[rowIndex] - card.height) / 2),
      };
    });
    cursorY += rowHeights[rowIndex] + CARD_CANVAS_GAP;
  });

  return layout;
}

function applyResize(
  handle: ResizeHandle,
  startWidth: number,
  startHeight: number,
  deltaX: number,
  deltaY: number
): CardSize {
  let width = startWidth;
  let height = startHeight;

  if (handle.includes("e")) width = startWidth + deltaX;
  if (handle.includes("w")) width = startWidth - deltaX;
  if (handle.includes("s")) height = startHeight + deltaY;
  if (handle.includes("n")) height = startHeight - deltaY;

  return {
    width: clamp(Math.round(width), CARD_MIN_WIDTH, CARD_MAX_WIDTH),
    height: clamp(Math.round(height), CARD_MIN_HEIGHT, CARD_MAX_HEIGHT),
  };
}

function fitCardSizeToContent(
  node: TreeNode,
  content: string,
  measuredWidth: number,
  measuredHeight: number,
  currentSize: CardSize
): CardSize {
  if (node.type === "pdf") {
    return {
      width: clamp(Math.round(currentSize.width), CARD_MIN_WIDTH, CARD_MAX_WIDTH),
      height: clamp(Math.round(currentSize.height), CARD_MIN_HEIGHT, CARD_MAX_HEIGHT),
    };
  }

  if (node.type === "image" && measuredWidth > 0 && measuredHeight > 0) {
    const targetWidth = clamp(Math.round(currentSize.width), CARD_MIN_WIDTH, CARD_MAX_WIDTH);
    const scaledHeight = Math.round((measuredHeight / measuredWidth) * targetWidth);
    return {
      width: targetWidth,
      height: clamp(scaledHeight + CARD_BODY_VERTICAL_OVERHEAD, CARD_MIN_HEIGHT, CARD_MAX_HEIGHT),
    };
  }

  if (node.type === "video" && measuredWidth > 0 && measuredHeight > 0) {
    const targetWidth = clamp(Math.round(currentSize.width), CARD_MIN_WIDTH, CARD_MAX_WIDTH);
    const scaledHeight = Math.round((measuredHeight / measuredWidth) * targetWidth);
    return {
      width: targetWidth,
      height: clamp(scaledHeight + CARD_BODY_VERTICAL_OVERHEAD, CARD_MIN_HEIGHT, CARD_MAX_HEIGHT),
    };
  }

  if (node.type === "file" || node.type === "code" || node.type === "latex" || node.type === "typst") {
    return {
      width: clamp(CARD_MARKDOWN_WIDTH, CARD_MIN_WIDTH, CARD_MAX_WIDTH),
      height: clamp(CARD_MARKDOWN_HEIGHT, CARD_MIN_HEIGHT, CARD_MAX_HEIGHT),
    };
  }

  if (node.type === "csv" && content.length > 0) {
    const lines = content.split(/\r?\n/);
    const visibleLines = Math.min(18, lines.length);
    const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const widthFromChars = Math.round(longestLine * 7.4 + 68);
    const heightFromLines = Math.round(visibleLines * 20 + 28);
    return {
      width: clamp(widthFromChars, CARD_MIN_WIDTH, CARD_MAX_WIDTH),
      height: clamp(heightFromLines + CARD_BODY_VERTICAL_OVERHEAD, CARD_MIN_HEIGHT, CARD_MAX_HEIGHT),
    };
  }

  if (measuredWidth > 0 && measuredHeight > 0) {
    return {
      width: clamp(Math.round(Math.max(currentSize.width, measuredWidth + 24)), CARD_MIN_WIDTH, CARD_MAX_WIDTH),
      height: clamp(Math.round(Math.max(currentSize.height, measuredHeight + CARD_BODY_VERTICAL_OVERHEAD)), CARD_MIN_HEIGHT, CARD_MAX_HEIGHT),
    };
  }

  return currentSize;
}

function MarkdownCardPreview({ content, pagePath }: { content: string; pagePath: string }) {
  const [html, setHtml] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    void markdownToHtml(content, pagePath).then((rendered) => {
      if (!cancelled) setHtml(rendered);
    });
    return () => {
      cancelled = true;
    };
  }, [content, pagePath]);

  if (!html) {
    return (
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg bg-transparent p-3 text-xs text-foreground/90">
        {content}
      </pre>
    );
  }

  return (
    <div
      className="prose prose-zinc prose-sm max-w-none dark:prose-invert min-h-0 flex-1 overflow-auto rounded-lg p-3 text-xs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function CardPreview({
  node,
  content,
  title,
  onMediaMeasure,
}: {
  node: TreeNode;
  content: string;
  title: string;
  onMediaMeasure?: (size: AutoSizeState) => void;
}) {
  if (node.type === "latex") {
    const rendered = content ? renderLatexToHtml(content) : null;
    if (rendered && rendered.ok) {
      return (
        <div
          className="latex-rendered prose prose-zinc prose-sm max-w-none dark:prose-invert min-h-0 flex-1 overflow-auto rounded-lg p-3 text-xs"
          dangerouslySetInnerHTML={{ __html: rendered.html }}
        />
      );
    }
  }

  if (node.type === "image") {
    return (
      <div className="pointer-events-none min-h-0 flex-1 overflow-hidden rounded-lg bg-muted/40">
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic local-asset URL served by the app's own /api/assets endpoint; next/image's optimizer/loader doesn't fit arbitrary cabinet file paths. */}
        <img
          src={assetUrl(node.path)}
          alt={title}
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
          onLoad={(event) => {
            const img = event.currentTarget;
            onMediaMeasure?.({ path: node.path, width: img.naturalWidth, height: img.naturalHeight });
          }}
        />
      </div>
    );
  }

  if (node.type === "video") {
    return (
      <div className="pointer-events-none min-h-0 flex-1 overflow-hidden rounded-lg bg-black/80">
        <video
          src={assetUrl(node.path)}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            const media = event.currentTarget;
            onMediaMeasure?.({ path: node.path, width: media.videoWidth, height: media.videoHeight });
          }}
        />
      </div>
    );
  }

  if (node.type === "pdf") {
    return (
      <iframe
        src={`${assetUrl(node.path)}#toolbar=0&navpanes=0`}
        title={title}
        className="pointer-events-none min-h-0 flex-1 rounded-lg border-0 bg-muted/40"
      />
    );
  }

  if (node.type === "csv") {
    const rows = parseCsvPreview(content);
    if (rows.length > 0) {
      return (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-muted/40 p-2">
          <table className="w-full table-fixed border-collapse text-left text-[11px]">
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${node.path}-row-${rowIndex}`} className={rowIndex === 0 ? "font-medium" : ""}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${node.path}-cell-${rowIndex}-${cellIndex}`}
                      className="max-w-0 truncate border border-border/50 px-1.5 py-1 align-top"
                      title={cell}
                    >
                      {cell || "\u00A0"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }

  if (isMarkdownCard(node, content)) {
    return <MarkdownCardPreview content={content} pagePath={node.path} />;
  }

  return (
    <pre
      className={`min-h-0 flex-1 overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg p-3 text-xs text-foreground/90 ${
        node.type === "file" ? "bg-transparent" : "bg-muted/40"
      }`}
    >
      {content}
    </pre>
  );
}

export function CanvasView() {
  const { t } = useLocale();
  const section = useAppStore((s) => s.section);
  const setSection = useAppStore((s) => s.setSection);
  const setAppMode = useAppStore((s) => s.setAppMode);
  const setCanvasSelectedCardPaths = useAppStore((s) => s.setCanvasSelectedCardPaths);
  const clearCanvasSelectedCardPaths = useAppStore((s) => s.clearCanvasSelectedCardPaths);
  const nodes = useTreeStore((s) => s.nodes);
  const selectedPath = useTreeStore((s) => s.selectedPath);
  const selectPage = useTreeStore((s) => s.selectPage);
  const loadPage = useEditorStore((s) => s.loadPage);

  const cabinetPath = section.cabinetPath || ROOT_CABINET_PATH;
  const boardNode = useMemo(
    () => getBoardNode(nodes, selectedPath, cabinetPath),
    [nodes, selectedPath, cabinetPath]
  );

  const boardCards = useMemo(() => {
    if (!boardNode) return [] as TreeNode[];
    if (!isFolderObject(boardNode)) return [boardNode];
    return [boardNode, ...(boardNode.children ?? []).filter(isCardObject)];
  }, [boardNode]);
  const boardScopePath = boardNode?.path ?? cabinetPath;

  const [pageContentByPath, setPageContentByPath] = useState<Record<string, string>>({});
  const [cardSizeByPath, setCardSizeByPath] = useState<Record<string, CardSize>>({});
  const [cardPositionByPath, setCardPositionByPath] = useState<Record<string, CardPosition>>({});
  const [cardPositionsByBoardPath, setCardPositionsByBoardPath] = useState<Record<string, Record<string, CardPosition>>>({});
  const [positionsCenteredByBoardPath, setPositionsCenteredByBoardPath] = useState<Record<string, boolean>>({});
  const [positionCenterVersionByBoardPath, setPositionCenterVersionByBoardPath] = useState<Record<string, number>>({});
  const [manualResizedByPath, setManualResizedByPath] = useState<Record<string, boolean>>({});
  const [autoSizedByPath, setAutoSizedByPath] = useState<Record<string, boolean>>({});
  const [mediaSizeByPath, setMediaSizeByPath] = useState<Record<string, AutoSizeState>>({});
  const [cardBackgroundColorByPath, setCardBackgroundColorByPath] = useState<Record<string, string>>({});
  const [manualLayoutByBoardPath, setManualLayoutByBoardPath] = useState<Record<string, boolean>>({});
  const [manualPositionedByPath, setManualPositionedByPath] = useState<Record<string, boolean>>({});
  const [selectedPaletteColors, setSelectedPaletteColors] = useState<string[]>([]);
  const [openColorPickerForPath, setOpenColorPickerForPath] = useState<string | null>(null);
  const [sizesLoaded, setSizesLoaded] = useState(false);
  const [persistTick, setPersistTick] = useState(0);
  const [boardZoom, setBoardZoom] = useState(WHITEBOARD_DEFAULT_ZOOM);
  const [minimapViewport, setMinimapViewport] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [showMinimap, setShowMinimap] = useState(false);
  const [selectedCardPaths, setSelectedCardPaths] = useState<string[]>([]);

  // Reset per-board UI state when switching boards, and prune the selection to
  // cards that still exist. Done during render (React's recommended pattern for
  // adjusting state in response to a prop/derived value changing) instead of in
  // effects, which avoids the cascading-render cost of synchronous setState in
  // an effect body. See https://react.dev/learn/you-might-not-need-an-effect.
  const [prevBoardScopePath, setPrevBoardScopePath] = useState(boardScopePath);
  if (prevBoardScopePath !== boardScopePath) {
    setPrevBoardScopePath(boardScopePath);
    setShowMinimap(false);
    setSelectedCardPaths([]);
    setOpenColorPickerForPath(null);
  }
  const [prevBoardCards, setPrevBoardCards] = useState(boardCards);
  if (prevBoardCards !== boardCards) {
    setPrevBoardCards(boardCards);
    setSelectedCardPaths((prev) => {
      const allowed = new Set(boardCards.map((node) => node.path));
      const next = prev.filter((path) => allowed.has(path));
      return next.length === prev.length ? prev : next;
    });
  }

  const resizingRef = useRef<ResizeState | null>(null);
  const draggingRef = useRef<DragState | null>(null);
  const panningRef = useRef<PanState | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const suppressNextCardClickRef = useRef(false);
  const didCenterBoardRef = useRef(false);
  const pendingZoomCenterRef = useRef<{ zoom: number; centerX: number; centerY: number } | null>(null);

  const getBoardCenter = useCallback(() => {
    const boardPositions = cardPositionsByBoardPath[boardScopePath] ?? {};
    const cards = boardCards.map((node, index) => {
      const scopedPath = makeScopedCardKey(boardScopePath, node.path);
      const size = cardSizeByPath[scopedPath] ?? cardSizeByPath[node.path] ?? {
        width: CARD_DEFAULT_WIDTH,
        height: CARD_DEFAULT_HEIGHT,
      };
      const position =
        cardPositionByPath[node.path] ??
        boardPositions[node.path] ??
        getDefaultCardPosition(index);
      return {
        left: position.x,
        top: position.y,
        right: position.x + size.width,
        bottom: position.y + size.height,
      };
    });
    const minLeft = cards.length > 0 ? Math.min(...cards.map((card) => card.left)) : WHITEBOARD_CANVAS_ORIGIN_OFFSET;
    const maxRight = cards.length > 0 ? Math.max(...cards.map((card) => card.right)) : WHITEBOARD_CANVAS_ORIGIN_OFFSET;
    const minTop = cards.length > 0 ? Math.min(...cards.map((card) => card.top)) : WHITEBOARD_CANVAS_ORIGIN_OFFSET;
    const maxBottom = cards.length > 0 ? Math.max(...cards.map((card) => card.bottom)) : WHITEBOARD_CANVAS_ORIGIN_OFFSET;
    return {
      centerX: (minLeft + maxRight) / 2,
      centerY: (minTop + maxBottom) / 2,
    };
  }, [boardCards, boardScopePath, cardPositionByPath, cardPositionsByBoardPath, cardSizeByPath]);

  const singleCardCenterKey = useMemo(() => {
    if (boardCards.length !== 1) return null;
    const node = boardCards[0];
    const scopedPath = makeScopedCardKey(boardScopePath, node.path);
    const size = cardSizeByPath[scopedPath] ?? cardSizeByPath[node.path] ?? {
      width: CARD_DEFAULT_WIDTH,
      height: CARD_DEFAULT_HEIGHT,
    };
    const boardPositions = cardPositionsByBoardPath[boardScopePath] ?? {};
    const position = cardPositionByPath[node.path] ?? boardPositions[node.path] ?? getDefaultCardPosition(0);
    return `${node.path}:${position.x}:${position.y}:${size.width}:${size.height}`;
  }, [boardCards, boardScopePath, cardPositionByPath, cardPositionsByBoardPath, cardSizeByPath]);

  const centerResetKey = `${boardScopePath}::${singleCardCenterKey ?? ""}`;

  const setZoomCenteredOnBoard = useCallback((nextZoom: number) => {
    const zoom = clamp(nextZoom, WHITEBOARD_MIN_ZOOM, WHITEBOARD_MAX_ZOOM);
    const center = getBoardCenter();
    pendingZoomCenterRef.current = {
      zoom,
      centerX: center.centerX,
      centerY: center.centerY,
    };
    setBoardZoom(zoom);
  }, [getBoardCenter]);

  useLayoutEffect(() => {
    const pending = pendingZoomCenterRef.current;
    if (!pending) return;
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;
    const targetLeft = pending.centerX * pending.zoom - scrollArea.clientWidth / 2;
    const targetTop = pending.centerY * pending.zoom - scrollArea.clientHeight / 2;
    scrollArea.scrollTo({ left: targetLeft, top: targetTop });
    pendingZoomCenterRef.current = null;
  }, [boardZoom]);

  const minimapMetrics = useMemo(() => {
    return {
      minX: 0,
      minY: 0,
      maxX: WHITEBOARD_CANVAS_BASE_SIZE,
      maxY: WHITEBOARD_CANVAS_BASE_SIZE,
      width: WHITEBOARD_CANVAS_BASE_SIZE,
      height: WHITEBOARD_CANVAS_BASE_SIZE,
      viewportLeft: minimapViewport.left,
      viewportTop: minimapViewport.top,
      viewportWidth: minimapViewport.width,
      viewportHeight: minimapViewport.height,
    };
  }, [minimapViewport]);

  const minimapScale = WHITEBOARD_MINIMAP_WIDTH / minimapMetrics.width;
  const minimapHeight = Math.max(1, Math.round(minimapMetrics.height * minimapScale));

  useEffect(() => {
    didCenterBoardRef.current = false;
  }, [centerResetKey]);

  useEffect(() => {
    if (!sizesLoaded || didCenterBoardRef.current) return;
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;
    const center = getBoardCenter();
    const targetLeft = center.centerX * boardZoom - scrollArea.clientWidth / 2;
    const targetTop = center.centerY * boardZoom - scrollArea.clientHeight / 2;
    scrollArea.scrollTo({ left: Math.max(0, targetLeft), top: Math.max(0, targetTop) });
    didCenterBoardRef.current = true;
  }, [sizesLoaded, boardScopePath, boardZoom, getBoardCenter]);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
       
      setMinimapViewport({ left: 0, top: 0, width: 0, height: 0 });
      return;
    }

    const updateViewport = () => {
      setMinimapViewport({
        left: scrollArea.scrollLeft / boardZoom,
        top: scrollArea.scrollTop / boardZoom,
        width: scrollArea.clientWidth / boardZoom,
        height: scrollArea.clientHeight / boardZoom,
      });
    };

    updateViewport();
    scrollArea.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);

    return () => {
      scrollArea.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, [boardZoom, boardScopePath, sizesLoaded]);

  // Board-switch resets to local UI state are handled during render above; this
  // effect only mirrors the cleared selection into the shared app store.
  useEffect(() => {
    clearCanvasSelectedCardPaths();
  }, [boardScopePath, clearCanvasSelectedCardPaths]);

  useEffect(() => {
    if (!openColorPickerForPath) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setOpenColorPickerForPath(null);
        return;
      }
      if (target.closest("[data-card-color-picker='true']")) return;
      if (target.closest("[data-card-color-trigger='true']")) return;
      setOpenColorPickerForPath(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openColorPickerForPath]);

  const selectedContextCardPaths = useMemo(() => {
    const cardByPath = new Map(boardCards.map((node) => [node.path, node]));
    return selectedCardPaths.filter((path) => {
      const node = cardByPath.get(path);
      return !!node && (isPreviewFile(node) || isFolderObject(node));
    });
  }, [boardCards, selectedCardPaths]);
  const lastPushedSelectedContextRef = useRef<string[]>([]);
  const selectedPaletteSwatches = useMemo(
    () =>
      Array.from(
        new Set(
          selectedPaletteColors
            .map((color) => color.toUpperCase())
            .filter(isHexColor)
        )
      ),
    [selectedPaletteColors]
  );

  useEffect(() => {
    const previous = lastPushedSelectedContextRef.current;
    if (
      previous.length === selectedContextCardPaths.length &&
      previous.every((path, index) => path === selectedContextCardPaths[index])
    ) {
      return;
    }
    lastPushedSelectedContextRef.current = selectedContextCardPaths;
    setCanvasSelectedCardPaths(selectedContextCardPaths);
  }, [selectedContextCardPaths, setCanvasSelectedCardPaths]);

  useEffect(() => {
    let cancelled = false;

    const loadPaletteColors = async () => {
      const selectedNames = loadSelectedPaletteNames();
      if (selectedNames.length === 0) {
        if (!cancelled) setSelectedPaletteColors([]);
        return;
      }
      try {
        const res = await fetch("/api/color-palettes", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setSelectedPaletteColors([]);
          return;
        }
        const data = (await res.json()) as { palettes?: Record<string, string[]> };
        const palettes = data.palettes ?? {};
        const merged = selectedNames.flatMap((name) => palettes[name] ?? []).filter(isHexColor);
        if (!cancelled) setSelectedPaletteColors(merged);
      } catch {
        if (!cancelled) setSelectedPaletteColors([]);
      }
    };

    void loadPaletteColors();

    const onFocus = () => {
      void loadPaletteColors();
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === CANVAS_SELECTED_PALETTES_KEY) {
        void loadPaletteColors();
      }
    };
    const onSelectedPalettesChanged = () => {
      void loadPaletteColors();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener("cabinet:canvas-selected-palettes-changed", onSelectedPalettesChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("cabinet:canvas-selected-palettes-changed", onSelectedPalettesChanged);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const query = new URLSearchParams();
        query.set("cabinetPath", cabinetPath);
        const res = await fetch(`/api/canvas?${query.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setCardSizeByPath({});
            setCardPositionByPath({});
            setCardPositionsByBoardPath({});
            setPositionsCenteredByBoardPath({});
            setPositionCenterVersionByBoardPath({});
            setManualResizedByPath({});
            setAutoSizedByPath({});
            setCardBackgroundColorByPath({});
            setManualLayoutByBoardPath({});
            setManualPositionedByPath({});
            setBoardZoom(WHITEBOARD_DEFAULT_ZOOM);
            setSizesLoaded(true);
          }
          return;
        }
        const snapshot = (await res.json()) as CanvasSnapshot;
        const nextSizes: Record<string, CardSize> = {};
        const nextPositions: Record<string, CardPosition> = {};
        const nextPositionsByBoardPath: Record<string, Record<string, CardPosition>> = {};
        const nextManual: Record<string, boolean> = {};
        const nextAuto: Record<string, boolean> = {};
        const nextBackgroundColors: Record<string, string> = {};
        const nextCenteredByBoardPath: Record<string, boolean> =
          snapshot.whiteboardCardPositionsCenteredByBoardPath &&
          typeof snapshot.whiteboardCardPositionsCenteredByBoardPath === "object"
            ? Object.fromEntries(
                Object.entries(snapshot.whiteboardCardPositionsCenteredByBoardPath).filter(
                  ([, value]) => value === true
                )
              )
            : {};
        const nextCenterVersionByBoardPath: Record<string, number> =
          snapshot.whiteboardCardPositionsCenterVersionByBoardPath &&
          typeof snapshot.whiteboardCardPositionsCenterVersionByBoardPath === "object"
            ? Object.fromEntries(
                Object.entries(snapshot.whiteboardCardPositionsCenterVersionByBoardPath)
                  .filter(([, value]) => typeof value === "number")
                  .map(([path, value]) => [path, Math.floor(value as number)])
              )
            : {};

        if (snapshot.whiteboardCardSizes && typeof snapshot.whiteboardCardSizes === "object") {
          for (const [path, size] of Object.entries(snapshot.whiteboardCardSizes)) {
            if (!isCardSize(size)) continue;
            nextSizes[path] = {
              width: clamp(Math.round(size.width), CARD_MIN_WIDTH, CARD_MAX_WIDTH),
              height: clamp(Math.round(size.height), CARD_MIN_HEIGHT, CARD_MAX_HEIGHT),
            };
          }
        }
        if (snapshot.whiteboardCardPositions && typeof snapshot.whiteboardCardPositions === "object") {
          for (const [path, position] of Object.entries(snapshot.whiteboardCardPositions)) {
            if (!isCardPosition(position)) continue;
            nextPositions[path] = {
              x: Math.round(position.x),
              y: Math.round(position.y),
            };
          }
        }
        if (snapshot.whiteboardCardPositionsByBoardPath && typeof snapshot.whiteboardCardPositionsByBoardPath === "object") {
          for (const [boardPath, boardPositions] of Object.entries(snapshot.whiteboardCardPositionsByBoardPath)) {
            if (!boardPositions || typeof boardPositions !== "object") continue;
            const nextBoardPositions: Record<string, CardPosition> = {};
            for (const [path, position] of Object.entries(boardPositions)) {
              if (!isCardPosition(position)) continue;
              nextBoardPositions[path] = {
                x: Math.round(position.x),
                y: Math.round(position.y),
              };
            }
            if (Object.keys(nextBoardPositions).length > 0) {
              nextPositionsByBoardPath[boardPath] = nextBoardPositions;
            }
          }
        }
        if (snapshot.whiteboardManualResizedByPath && typeof snapshot.whiteboardManualResizedByPath === "object") {
          for (const [path, value] of Object.entries(snapshot.whiteboardManualResizedByPath)) {
            if (value === true) nextManual[path] = true;
          }
        }
        if (snapshot.whiteboardAutoSizedByPath && typeof snapshot.whiteboardAutoSizedByPath === "object") {
          for (const [path, value] of Object.entries(snapshot.whiteboardAutoSizedByPath)) {
            if (value === true) nextAuto[path] = true;
          }
        }
        if (snapshot.whiteboardCardBackgroundColorByPath && typeof snapshot.whiteboardCardBackgroundColorByPath === "object") {
          for (const [path, color] of Object.entries(snapshot.whiteboardCardBackgroundColorByPath)) {
            if (typeof color !== "string" || !isHexColor(color)) continue;
            nextBackgroundColors[path] = color.toUpperCase();
          }
        }
        const nextManualPositioned: Record<string, boolean> = {};
        if (
          snapshot.whiteboardManualPositionedByPath &&
          typeof snapshot.whiteboardManualPositionedByPath === "object"
        ) {
          for (const [path, value] of Object.entries(snapshot.whiteboardManualPositionedByPath)) {
            if (value !== true) continue;
            const key = path.includes("::") ? path : makeScopedCardKey(boardScopePath, path);
            nextManualPositioned[key] = true;
          }
        }
        // A board is treated as manually arranged only when at least one of its
        // cards was explicitly dragged. This is derived from the per-card flags
        // above so it can't be corrupted by auto-generated positions.
        const nextManualLayout: Record<string, boolean> = {};
        for (const key of Object.keys(nextManualPositioned)) {
          const sep = key.indexOf("::");
          if (sep <= 0) continue;
          nextManualLayout[key.slice(0, sep)] = true;
        }
        for (const [path, size] of Object.entries(nextSizes)) {
          if (nextManual[path] || nextAuto[path]) continue;
          if (size.width !== CARD_DEFAULT_WIDTH || size.height !== CARD_DEFAULT_HEIGHT) {
            nextManual[path] = true;
          }
        }
        const persistedZoom =
          typeof snapshot.whiteboardZoom === "number"
            ? clamp(snapshot.whiteboardZoom, WHITEBOARD_MIN_ZOOM, WHITEBOARD_MAX_ZOOM)
            : WHITEBOARD_DEFAULT_ZOOM;
        const resolvedBoardPositions =
          nextPositionsByBoardPath[boardScopePath] ??
          (Object.keys(nextPositions).length > 0 ? nextPositions : {});
        const resolvedPositionsByBoardPath = { ...nextPositionsByBoardPath };
        if (!resolvedPositionsByBoardPath[boardScopePath]) {
          resolvedPositionsByBoardPath[boardScopePath] = resolvedBoardPositions;
        }
        const nextSizesScoped: Record<string, CardSize> = {};
        const nextManualScoped: Record<string, boolean> = {};
        const nextAutoScoped: Record<string, boolean> = {};
        const nextBackgroundScoped: Record<string, string> = {};
        for (const [path, size] of Object.entries(nextSizes)) {
          const key = path.includes("::") ? path : makeScopedCardKey(boardScopePath, path);
          nextSizesScoped[key] = size;
        }
        for (const [path, value] of Object.entries(nextManual)) {
          if (!value) continue;
          const key = path.includes("::") ? path : makeScopedCardKey(boardScopePath, path);
          nextManualScoped[key] = true;
        }
        for (const [path, value] of Object.entries(nextAuto)) {
          if (!value) continue;
          const key = path.includes("::") ? path : makeScopedCardKey(boardScopePath, path);
          nextAutoScoped[key] = true;
        }
        for (const [path, color] of Object.entries(nextBackgroundColors)) {
          const key = path.includes("::") ? path : makeScopedCardKey(boardScopePath, path);
          nextBackgroundScoped[key] = color;
        }
        if (!cancelled) {
          setCardSizeByPath(nextSizesScoped);
          setCardPositionsByBoardPath(resolvedPositionsByBoardPath);
          setCardPositionByPath(resolvedPositionsByBoardPath[boardScopePath] ?? {});
          setPositionsCenteredByBoardPath(nextCenteredByBoardPath);
          setPositionCenterVersionByBoardPath(nextCenterVersionByBoardPath);
          setManualResizedByPath(nextManualScoped);
          setAutoSizedByPath(nextAutoScoped);
          setCardBackgroundColorByPath(nextBackgroundScoped);
          setManualLayoutByBoardPath(nextManualLayout);
          setManualPositionedByPath(nextManualPositioned);
          setBoardZoom(persistedZoom);
          setSizesLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setCardSizeByPath({});
          setCardPositionByPath({});
          setCardPositionsByBoardPath({});
          setPositionsCenteredByBoardPath({});
          setPositionCenterVersionByBoardPath({});
          setManualResizedByPath({});
            setAutoSizedByPath({});
            setCardBackgroundColorByPath({});
            setManualLayoutByBoardPath({});
            setManualPositionedByPath({});
            setBoardZoom(WHITEBOARD_DEFAULT_ZOOM);
            setSizesLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cabinetPath, boardScopePath]);

  useEffect(() => {
     
    setCardSizeByPath((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const node of boardCards) {
        const scopedPath = makeScopedCardKey(boardScopePath, node.path);
        if (next[scopedPath]) continue;
        next[scopedPath] =
          prev[node.path] ?? {
            width: CARD_DEFAULT_WIDTH,
            height: CARD_DEFAULT_HEIGHT,
          };
        changed = true;
      }
      return changed ? next : prev;
    });
    setManualResizedByPath((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const node of boardCards) {
        const scopedPath = makeScopedCardKey(boardScopePath, node.path);
        if (next[scopedPath]) continue;
        if (prev[node.path]) {
          next[scopedPath] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setAutoSizedByPath((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const node of boardCards) {
        const scopedPath = makeScopedCardKey(boardScopePath, node.path);
        if (next[scopedPath]) continue;
        if (prev[node.path]) {
          next[scopedPath] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setMediaSizeByPath((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const node of boardCards) {
        const scopedPath = makeScopedCardKey(boardScopePath, node.path);
        if (next[scopedPath]) continue;
        const existing = prev[node.path];
        if (existing) {
          next[scopedPath] = existing;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [boardCards, boardScopePath]);

  useEffect(() => {
    if (!sizesLoaded) return;
    const scoped = cardPositionsByBoardPath[boardScopePath] ?? {};
     
    setCardPositionByPath((prev) => {
      const next: Record<string, CardPosition> = {};
      let changed = false;
      boardCards.forEach((node, index) => {
        const position = scoped[node.path] ?? getDefaultCardPosition(index);
        next[node.path] = position;
        const current = prev[node.path];
        if (!current || current.x !== position.x || current.y !== position.y) {
          changed = true;
        }
      });
      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev;
      }
      return next;
    });
    // `cardPositionsByBoardPath` is intentionally omitted: this effect only
    // re-derives the flat positions when the board or its cards change. The
    // inverse effect below writes `cardPositionsByBoardPath` from
    // `cardPositionByPath`, so depending on it here would create a sync loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardCards, boardScopePath, sizesLoaded]);

  useEffect(() => {
    if (!sizesLoaded || selectedPaletteColors.length === 0 || boardCards.length === 0) return;
    const paletteColors = selectedPaletteColors
      .map((color) => color.toUpperCase())
      .filter(isHexColor);
    if (paletteColors.length === 0) return;
    const paletteColorSet = new Set(paletteColors);
     
    setCardBackgroundColorByPath((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const node of boardCards) {
        const content = pageContentByPath[node.path] ?? "";
        if (!isMarkdownCard(node, content)) continue;
        const scopedPath = makeScopedCardKey(boardScopePath, node.path);
        const currentColor = (next[scopedPath] ?? "").toUpperCase();
        if (isHexColor(currentColor) && paletteColorSet.has(currentColor)) continue;
        const randomColor = pickRandom(paletteColors);
        if (!randomColor) continue;
        next[scopedPath] = randomColor;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [boardCards, boardScopePath, selectedPaletteColors, pageContentByPath, sizesLoaded]);

  useEffect(() => {
    if (!sizesLoaded || boardCards.length === 0) return;
    const currentCenterVersion = positionCenterVersionByBoardPath[boardScopePath] ?? 0;
    if (currentCenterVersion >= WHITEBOARD_CENTER_VERSION) return;
    const boardPositions = cardPositionsByBoardPath[boardScopePath] ?? {};
    const existingEntries = boardCards
      .map((node) => [node.path, boardPositions[node.path]] as const)
      .filter((entry): entry is readonly [string, CardPosition] => Boolean(entry[1]));
    if (existingEntries.length === 0) {
       
      setPositionsCenteredByBoardPath((prev) => ({ ...prev, [boardScopePath]: true }));
      setPositionCenterVersionByBoardPath((prev) => ({ ...prev, [boardScopePath]: WHITEBOARD_CENTER_VERSION }));
      return;
    }
    const xs = existingEntries.map(([, position]) => position.x);
    const ys = existingEntries.map(([, position]) => position.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const looksLegacyTopLeft = minX >= 0 && minY >= 0 && maxX < 3000 && maxY < 3000;
    if (!looksLegacyTopLeft) {
      setPositionsCenteredByBoardPath((prev) => ({ ...prev, [boardScopePath]: true }));
      setPositionCenterVersionByBoardPath((prev) => ({ ...prev, [boardScopePath]: WHITEBOARD_CENTER_VERSION }));
      return;
    }
    const target = getDefaultCardPosition(0);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const deltaX = Math.round(target.x - centerX);
    const deltaY = Math.round(target.y - centerY);
    const shiftedBoardPositions: Record<string, CardPosition> = {};
    for (const node of boardCards) {
      const current = boardPositions[node.path];
      if (!current) continue;
      shiftedBoardPositions[node.path] = { x: current.x + deltaX, y: current.y + deltaY };
    }
    setCardPositionsByBoardPath((prev) => ({
      ...prev,
      [boardScopePath]: { ...prev[boardScopePath], ...shiftedBoardPositions },
    }));
    setCardPositionByPath((prev) => {
      const next = { ...prev };
      for (const [path, position] of Object.entries(shiftedBoardPositions)) {
        next[path] = position;
      }
      return next;
    });
    setPositionsCenteredByBoardPath((prev) => ({ ...prev, [boardScopePath]: true }));
    setPositionCenterVersionByBoardPath((prev) => ({ ...prev, [boardScopePath]: WHITEBOARD_CENTER_VERSION }));
    setPersistTick((tick) => tick + 1);
  }, [boardCards, boardScopePath, cardPositionsByBoardPath, positionCenterVersionByBoardPath, sizesLoaded]);

  useEffect(() => {
    if (!sizesLoaded || boardCards.length <= 1) return;

    const boardPositions = cardPositionsByBoardPath[boardScopePath] ?? {};
    const resolved = boardCards
      .map((node, index) => boardPositions[node.path] ?? cardPositionByPath[node.path] ?? getDefaultCardPosition(index))
      .filter((position): position is CardPosition => Boolean(position));

    if (resolved.length <= 1) return;

    const unique = new Set(resolved.map((position) => `${position.x}:${position.y}`));
    if (unique.size > 1) return;

    const nextBoardPositions: Record<string, CardPosition> = {};
    boardCards.forEach((node, index) => {
      nextBoardPositions[node.path] = getDefaultCardPosition(index);
    });

     
    setCardPositionByPath((prev) => {
      const next = { ...prev };
      for (const [path, position] of Object.entries(nextBoardPositions)) {
        next[path] = position;
      }
      return next;
    });

    setCardPositionsByBoardPath((prev) => ({
      ...prev,
      [boardScopePath]: nextBoardPositions,
    }));

    setPositionCenterVersionByBoardPath((prev) => ({ ...prev, [boardScopePath]: WHITEBOARD_CENTER_VERSION }));
    setPersistTick((tick) => tick + 1);
  }, [sizesLoaded, boardCards, boardScopePath, cardPositionsByBoardPath, cardPositionByPath]);

  useEffect(() => {
    if (!sizesLoaded) return;
     
    setCardPositionsByBoardPath((prev) => {
      const currentBoardPositions = prev[boardScopePath] ?? {};
      const nextBoardPositions: Record<string, CardPosition> = {};
      let changed = false;
      boardCards.forEach((node, index) => {
        const position = cardPositionByPath[node.path] ?? currentBoardPositions[node.path] ?? getDefaultCardPosition(index);
        nextBoardPositions[node.path] = position;
        const current = currentBoardPositions[node.path];
        if (!current || current.x !== position.x || current.y !== position.y) {
          changed = true;
        }
      });
      if (!changed && Object.keys(currentBoardPositions).length === Object.keys(nextBoardPositions).length) {
        return prev;
      }
      return { ...prev, [boardScopePath]: nextBoardPositions };
    });
  }, [boardCards, boardScopePath, cardPositionByPath, sizesLoaded]);

  useEffect(() => {
    if (!sizesLoaded) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const query = new URLSearchParams();
          query.set("cabinetPath", cabinetPath);
          const getRes = await fetch(`/api/canvas?${query.toString()}`, { cache: "no-store" });
          let snapshot: CanvasSnapshot = {};
          if (getRes.ok) {
            const data = await getRes.json();
            if (data && typeof data === "object") snapshot = data as CanvasSnapshot;
          }
          snapshot.whiteboardCardSizes = cardSizeByPath;
          snapshot.whiteboardCardPositions = cardPositionByPath;
          snapshot.whiteboardCardPositionsByBoardPath = cardPositionsByBoardPath;
          snapshot.whiteboardCardPositionsCenteredByBoardPath = positionsCenteredByBoardPath;
          snapshot.whiteboardCardPositionsCenterVersionByBoardPath = positionCenterVersionByBoardPath;
          snapshot.whiteboardManualResizedByPath = manualResizedByPath;
          snapshot.whiteboardAutoSizedByPath = autoSizedByPath;
          snapshot.whiteboardCardBackgroundColorByPath = cardBackgroundColorByPath;
          snapshot.whiteboardManualLayoutByBoardPath = manualLayoutByBoardPath;
          snapshot.whiteboardManualPositionedByPath = manualPositionedByPath;
          snapshot.whiteboardZoom = boardZoom;
          // Don't materialise a canvas.json out of nothing: when no file
          // exists yet and there's no layout or non-default zoom to persist,
          // merely switching into the canvas view shouldn't create the file
          // (and pollute the sidebar). Once a file exists, keep it in sync.
          const hasLayoutData = [
            cardSizeByPath,
            cardPositionByPath,
            cardPositionsByBoardPath,
            positionsCenteredByBoardPath,
            positionCenterVersionByBoardPath,
            manualResizedByPath,
            autoSizedByPath,
            cardBackgroundColorByPath,
          ].some((record) => record && Object.keys(record).length > 0);
          const hasMeaningfulData =
            hasLayoutData || boardZoom !== WHITEBOARD_DEFAULT_ZOOM;
          if (!getRes.ok && !hasMeaningfulData) return;
          if (!cancelled) {
            await fetch(`/api/canvas?${query.toString()}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(snapshot),
            });
          }
        } catch {
        }
      })();
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cardSizeByPath, cardPositionByPath, cardPositionsByBoardPath, positionsCenteredByBoardPath, positionCenterVersionByBoardPath, manualResizedByPath, autoSizedByPath, cardBackgroundColorByPath, manualLayoutByBoardPath, manualPositionedByPath, cabinetPath, sizesLoaded, persistTick, boardZoom]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const activeResize = resizingRef.current;
      if (activeResize) {
        if (event.pointerId !== activeResize.pointerId) return;
        suppressNextCardClickRef.current = true;
        const deltaX = event.clientX - activeResize.startX;
        const deltaY = event.clientY - activeResize.startY;
        const nextSize = applyResize(
          activeResize.handle,
          activeResize.startWidth,
          activeResize.startHeight,
          deltaX,
          deltaY
        );
        setCardSizeByPath((prev) => {
          const scopedPath = makeScopedCardKey(boardScopePath, activeResize.path);
          const current = prev[scopedPath] ?? prev[activeResize.path];
          if (current && current.width === nextSize.width && current.height === nextSize.height) {
            return prev;
          }
          return { ...prev, [scopedPath]: nextSize };
        });
        setManualResizedByPath((prev) => {
          const scopedPath = makeScopedCardKey(boardScopePath, activeResize.path);
          return prev[scopedPath] ? prev : { ...prev, [scopedPath]: true };
        });
        return;
      }

      const activePan = panningRef.current;
      if (activePan) {
        if (event.pointerId !== activePan.pointerId) return;
        const scrollArea = scrollAreaRef.current;
        if (!scrollArea) return;
        const deltaX = event.clientX - activePan.startX;
        const deltaY = event.clientY - activePan.startY;
        scrollArea.scrollLeft = activePan.startScrollLeft - deltaX;
        scrollArea.scrollTop = activePan.startScrollTop - deltaY;
        if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
          suppressNextCardClickRef.current = true;
        }
        return;
      }

      const activeDrag = draggingRef.current;
      if (!activeDrag) return;
      const deltaX = Math.round((event.clientX - activeDrag.startX) / boardZoom);
      const deltaY = Math.round((event.clientY - activeDrag.startY) / boardZoom);
      if (!activeDrag.moved && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
        activeDrag.moved = true;
        suppressNextCardClickRef.current = true;
        setManualLayoutByBoardPath((prev) =>
          prev[boardScopePath] ? prev : { ...prev, [boardScopePath]: true }
        );
        const draggedScopedKey = makeScopedCardKey(boardScopePath, activeDrag.path);
        setManualPositionedByPath((prev) =>
          prev[draggedScopedKey] ? prev : { ...prev, [draggedScopedKey]: true }
        );
      }
      const nextX = activeDrag.startCardX + deltaX;
      const nextY = activeDrag.startCardY + deltaY;
      setCardPositionByPath((prev) => {
        const current = prev[activeDrag.path] ?? { x: activeDrag.startCardX, y: activeDrag.startCardY };
        if (current.x === nextX && current.y === nextY) return prev;
        return { ...prev, [activeDrag.path]: { x: nextX, y: nextY } };
      });
    };

    const stopInteractions = (event?: PointerEvent) => {
      const activeResize = resizingRef.current;
      if (activeResize && (!event || event.pointerId === activeResize.pointerId)) {
        resizingRef.current = null;
        setPersistTick((tick) => tick + 1);
      }

      const activeDrag = draggingRef.current;
      if (activeDrag && (!event || event.pointerId === activeDrag.pointerId)) {
        const moved = activeDrag.moved;
        draggingRef.current = null;
        if (moved) {
          setPersistTick((tick) => tick + 1);
        }
      }

      const activePan = panningRef.current;
      if (activePan && (!event || event.pointerId === activePan.pointerId)) {
        panningRef.current = null;
      }

      if (!resizingRef.current && !draggingRef.current && !panningRef.current && typeof document !== "undefined") {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopInteractions);
    window.addEventListener("pointercancel", stopInteractions);

    return () => {
      stopInteractions();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopInteractions);
      window.removeEventListener("pointercancel", stopInteractions);
    };
  }, [boardZoom, boardScopePath]);

  useEffect(() => {
    let cancelled = false;

    const contentPaths = boardCards
      .filter((node) => node.type === "file" || node.type === "code" || isFolderObject(node) || node.type === "csv" || node.type === "latex" || node.type === "typst")
      .slice(0, 300)
      .map((node) => node.path);

    if (contentPaths.length === 0) {
       
      setPageContentByPath({});
      return;
    }

    void (async () => {
      const entries = await Promise.all(
        contentPaths.map(async (nodePath) => {
          try {
            const data = await fetchPage(nodePath);
            return [nodePath, data.content] as const;
          } catch {
            const lower = nodePath.toLowerCase();
            if (!lower.endsWith(".csv") && !lower.endsWith(".tex") && !lower.endsWith(".latex") && !lower.endsWith(".typ")) {
              return [nodePath, ""] as const;
            }
            try {
              const assetRes = await fetch(`/api/assets/${nodePath}`, { cache: "no-store" });
              if (!assetRes.ok) return [nodePath, ""] as const;
              return [nodePath, await assetRes.text()] as const;
            } catch {
              return [nodePath, ""] as const;
            }
          }
        })
      );

      if (cancelled) return;

      setPageContentByPath(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [boardCards]);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("[data-whiteboard-scroll-area='true']")) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const nextZoom = Number((boardZoom + direction * 0.08).toFixed(2));
      setZoomCenteredOnBoard(nextZoom);
    };

    window.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      window.removeEventListener("wheel", onWheel);
    };
  }, [boardZoom, setZoomCenteredOnBoard]);

  useEffect(() => {
    if (!sizesLoaded) return;
     
    setCardSizeByPath((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const node of boardCards) {
        const scopedPath = makeScopedCardKey(boardScopePath, node.path);
        if (manualResizedByPath[scopedPath]) continue;
        const isMarkdownNote =
          node.type === "file" ||
          (node.type === "code" && (/\.mdx?$/i.test(node.name) || /\.mdx?$/i.test(node.path)));
        if (!isMarkdownNote && autoSizedByPath[scopedPath]) continue;
        const currentSize = prev[scopedPath] ?? prev[node.path] ?? { width: CARD_DEFAULT_WIDTH, height: CARD_DEFAULT_HEIGHT };
        if (
          node.type === "pdf" &&
          (currentSize.width !== CARD_DEFAULT_WIDTH || currentSize.height !== CARD_DEFAULT_HEIGHT)
        ) {
          continue;
        }
        const measured = mediaSizeByPath[scopedPath] ?? mediaSizeByPath[node.path];
        const fitted = fitCardSizeToContent(
          node,
          pageContentByPath[node.path] ?? "",
          measured?.width ?? 0,
          measured?.height ?? 0,
          currentSize
        );
        if (fitted.width !== currentSize.width || fitted.height !== currentSize.height) {
          next[scopedPath] = fitted;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setAutoSizedByPath((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const node of boardCards) {
        const scopedPath = makeScopedCardKey(boardScopePath, node.path);
        if (manualResizedByPath[scopedPath] || next[scopedPath]) continue;
        const measured = mediaSizeByPath[scopedPath] ?? mediaSizeByPath[node.path];
        const hasText = (pageContentByPath[node.path] ?? "").length > 0;
        if (node.type === "image" || node.type === "video") {
          if (!measured || measured.width <= 0 || measured.height <= 0) continue;
        } else if (node.type === "csv" || node.type === "file" || node.type === "code" || node.type === "pdf" || node.type === "latex" || node.type === "typst") {
          if (!hasText && node.type !== "pdf") continue;
        }
        next[scopedPath] = true;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [boardCards, boardScopePath, pageContentByPath, mediaSizeByPath, manualResizedByPath, autoSizedByPath, sizesLoaded]);

  useEffect(() => {
    if (!sizesLoaded || boardCards.length === 0) return;
    if (manualLayoutByBoardPath[boardScopePath]) return;

    const layout = computeAutoLayout(boardCards, (node) => {
      const scopedPath = makeScopedCardKey(boardScopePath, node.path);
      return (
        cardSizeByPath[scopedPath] ??
        cardSizeByPath[node.path] ?? {
          width: CARD_DEFAULT_WIDTH,
          height: CARD_DEFAULT_HEIGHT,
        }
      );
    });

    let changed = false;
     
    setCardPositionByPath((prev) => {
      const next = { ...prev };
      for (const node of boardCards) {
        const position = layout[node.path];
        if (!position) continue;
        const current = prev[node.path];
        if (!current || current.x !== position.x || current.y !== position.y) {
          next[node.path] = position;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    if (changed) {
      setCardPositionsByBoardPath((prev) => ({
        ...prev,
        [boardScopePath]: { ...(prev[boardScopePath] ?? {}), ...layout },
      }));
    }
  }, [boardCards, boardScopePath, cardSizeByPath, manualLayoutByBoardPath, sizesLoaded]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header />
      <div className="flex-1 flex min-h-0 flex-col">
        <div className="relative flex-1 min-h-0">
          <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex items-start justify-between gap-2">
            <h1 className="rounded-full border border-border/40 bg-background/30 px-3 py-1 text-sm font-semibold text-foreground backdrop-blur-sm">
              {t("editor:canvas.title")}
            </h1>
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoomCenteredOnBoard(boardZoom - 0.1)}
                className="rounded-full border border-border/40 bg-background/30 px-2 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm hover:bg-background/45"
              >
                -
              </button>
              <div className="rounded-full border border-border/40 bg-background/30 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                {Math.round(boardZoom * 100)}%
              </div>
              <button
                type="button"
                onClick={() => setZoomCenteredOnBoard(boardZoom + 0.1)}
                className="rounded-full border border-border/40 bg-background/30 px-2 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm hover:bg-background/45"
              >
                +
              </button>
              <div className="rounded-full border border-border/40 bg-background/30 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                {boardNode ? boardNode.path : cabinetPath === ROOT_CABINET_PATH ? "root" : cabinetPath}
              </div>
            </div>
          </div>
          <div
            ref={scrollAreaRef}
            className="h-full w-full overflow-auto px-4 pb-4"
            data-whiteboard-scroll-area="true"
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const withinCorner =
                rect.right - event.clientX <= WHITEBOARD_MINIMAP_REVEAL_DISTANCE &&
                rect.bottom - event.clientY <= WHITEBOARD_MINIMAP_REVEAL_DISTANCE;
              setShowMinimap(withinCorner);
            }}
            onPointerLeave={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Element && nextTarget.closest("[data-whiteboard-minimap='true']")) {
                return;
              }
              setShowMinimap(false);
            }}
            onPointerDown={(event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest("[data-canvas-card='true']")) return;
            if (target.closest("[data-whiteboard-minimap='true']")) return;
            setSelectedCardPaths([]);
            clearCanvasSelectedCardPaths();
            panningRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              startScrollLeft: event.currentTarget.scrollLeft,
              startScrollTop: event.currentTarget.scrollTop,
            };
            if (typeof document !== "undefined") {
              document.body.style.cursor = "grabbing";
              document.body.style.userSelect = "none";
            }
          }}
        >
          {boardCards.length === 0 ? (
            <div className="mb-4 rounded-3xl border border-border/70 bg-muted p-8 text-center text-sm text-muted-foreground">
              {t("editor:canvas.empty")}
            </div>
          ) : (
            <>
              <div
                className="relative min-h-full"
                style={{
                  transform: `scale(${boardZoom})`,
                  transformOrigin: "top left",
                  width: `${WHITEBOARD_CANVAS_BASE_SIZE}px`,
                  height: `${WHITEBOARD_CANVAS_BASE_SIZE}px`,
                }}
              >
                {boardCards.map((node, index) => {
                  const title = node.frontmatter?.title || node.name;
                  const content = pageContentByPath[node.path] ?? "";
                  const composed = isComposedCard(node);
                  const kind = getNodeKind(node);
                  const scopedPath = makeScopedCardKey(boardScopePath, node.path);
                  const isSelected = selectedCardPaths.includes(node.path);
                  const markdownCard = isMarkdownCard(node, content);
                  const cardBackgroundColor = cardBackgroundColorByPath[scopedPath] ?? "";
                  const hasCardBackgroundColor = markdownCard && isHexColor(cardBackgroundColor);

                  return (
                    <div
                      key={node.path}
                      onPointerDown={(event) => {
                        const target = event.target;
                        if (target instanceof Element && target.closest("[data-resize-handle='true']")) {
                          return;
                        }
                        const allowMultiSelect = event.metaKey || event.ctrlKey;
                        if (allowMultiSelect) {
                          setSelectedCardPaths((prev) =>
                            prev.includes(node.path)
                              ? prev.filter((path) => path !== node.path)
                              : [...prev, node.path]
                          );
                        } else {
                          setSelectedCardPaths([node.path]);
                        }
                        const position = cardPositionByPath[node.path] ?? getDefaultCardPosition(index);
                        draggingRef.current = {
                          path: node.path,
                          pointerId: event.pointerId,
                          startX: event.clientX,
                          startY: event.clientY,
                          startCardX: position.x,
                          startCardY: position.y,
                          moved: false,
                        };
                        if (typeof document !== "undefined") {
                          document.body.style.cursor = "grabbing";
                          document.body.style.userSelect = "none";
                        }
                      }}
                      onClick={() => {
                        if (suppressNextCardClickRef.current) {
                          suppressNextCardClickRef.current = false;
                        }
                      }}
                      style={{
                        width: cardSizeByPath[scopedPath]?.width ?? cardSizeByPath[node.path]?.width ?? CARD_DEFAULT_WIDTH,
                        height: cardSizeByPath[scopedPath]?.height ?? cardSizeByPath[node.path]?.height ?? CARD_DEFAULT_HEIGHT,
                        left: (cardPositionByPath[node.path] ?? getDefaultCardPosition(index)).x,
                        top: (cardPositionByPath[node.path] ?? getDefaultCardPosition(index)).y,
                        ...(hasCardBackgroundColor ? { backgroundColor: cardBackgroundColor } : {}),
                      }}
                      className={
                        composed
                          ? `group absolute flex shrink-0 flex-col rounded-2xl border bg-muted/40 p-4 text-left transition-colors hover:bg-muted ${isSelected ? "border-violet-600 border-[3px]" : "border-border/70"}`
                          : `group absolute flex shrink-0 flex-col rounded-2xl border bg-background p-4 text-left transition-colors hover:bg-muted/40 ${isSelected ? "border-violet-600 border-[3px]" : "border-border/70"}`
                      }
                      data-canvas-card="true"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                        }
                      }}
                    >
                      {markdownCard ? (
                        <>
                          <button
                            type="button"
                            aria-label="Change markdown card color"
                            title="Change markdown card color"
                            className="absolute right-12 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background/80 text-muted-foreground hover:bg-background"
                            data-card-color-trigger="true"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                            }}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setOpenColorPickerForPath((prev) => (prev === scopedPath ? null : scopedPath));
                            }}
                          >
                            <Palette className="h-3.5 w-3.5" />
                          </button>
                          {openColorPickerForPath === scopedPath ? (
                            <div
                              className="absolute right-12 top-11 z-20 flex max-w-55 flex-wrap gap-1 rounded-md border border-border/70 bg-background p-2 shadow-lg"
                              data-card-color-picker="true"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              {selectedPaletteSwatches.length > 0 ? (
                                selectedPaletteSwatches.map((swatch) => {
                                  const active = hasCardBackgroundColor && cardBackgroundColor.toUpperCase() === swatch;
                                  return (
                                    <button
                                      key={`${scopedPath}-${swatch}`}
                                      type="button"
                                      aria-label={`Set markdown card color ${swatch}`}
                                      title={swatch}
                                      className={`h-6 w-6 rounded border ${active ? "border-foreground" : "border-border/70"}`}
                                      style={{ backgroundColor: swatch }}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setCardBackgroundColorByPath((prev) => {
                                          if (prev[scopedPath] === swatch) return prev;
                                          return { ...prev, [scopedPath]: swatch };
                                        });
                                        setPersistTick((tick) => tick + 1);
                                        setOpenColorPickerForPath(null);
                                      }}
                                    />
                                  );
                                })
                              ) : (
                                <div className="px-1 py-0.5 text-xs text-muted-foreground">No checked palette colors</div>
                              )}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                      <button
                        type="button"
                        aria-label="Open in cabinet mode"
                        title="Open in cabinet mode"
                        className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background/80 text-muted-foreground hover:bg-background"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          selectPage(node.path);
                          void loadPage(node.path);
                          setSection({ type: "page", cabinetPath });
                          setAppMode("edit");
                        }}
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {composed ? `Composed ${kind}` : `Simple ${kind}`}
                      </div>
                      <button
                        type="button"
                        className="mb-2 line-clamp-2 self-start text-left text-base font-semibold hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (event.metaKey || event.ctrlKey) {
                            return;
                          }
                          selectPage(node.path);
                          if (node.type === "file" || node.type === "directory" || node.type === "cabinet") {
                            void loadPage(node.path);
                          }
                          setSection({ type: "page", cabinetPath });
                        }}
                      >
                        {title}
                      </button>
                      <div className="mb-2 min-w-0 wrap-break-word text-xs text-muted-foreground">{node.path}</div>
                      <CardPreview
                        node={node}
                        content={content}
                        title={title}
                        onMediaMeasure={(size) => {
                          const scopedPath = makeScopedCardKey(boardScopePath, size.path);
                          setMediaSizeByPath((prev) => {
                            const current = prev[scopedPath] ?? prev[size.path];
                            if (current && current.width === size.width && current.height === size.height) {
                              return prev;
                            }
                            return { ...prev, [scopedPath]: { ...size, path: scopedPath } };
                          });
                        }}
                      />
                      {([
                        ["n", "ns-resize", "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-10"],
                        ["s", "ns-resize", "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 h-2.5 w-10"],
                        ["e", "ew-resize", "right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-10 w-2.5"],
                        ["w", "ew-resize", "left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-10 w-2.5"],
                        ["ne", "nesw-resize", "right-0 top-0 translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5"],
                        ["nw", "nwse-resize", "left-0 top-0 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5"],
                        ["se", "nwse-resize", "right-0 bottom-0 translate-x-1/2 translate-y-1/2 h-3.5 w-3.5"],
                        ["sw", "nesw-resize", "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 h-3.5 w-3.5"],
                      ] as const).map(([handle, cursor, placement]) => (
                        <span
                          key={`${node.path}-${handle}`}
                          role="presentation"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const size = cardSizeByPath[scopedPath] ?? cardSizeByPath[node.path] ?? {
                              width: CARD_DEFAULT_WIDTH,
                              height: CARD_DEFAULT_HEIGHT,
                            };
                            resizingRef.current = {
                              path: node.path,
                              handle,
                              pointerId: event.pointerId,
                              startX: event.clientX,
                              startY: event.clientY,
                              startWidth: size.width,
                              startHeight: size.height,
                            };
                            if (typeof document !== "undefined") {
                              document.body.style.cursor = cursor;
                              document.body.style.userSelect = "none";
                            }
                          }}
                          className={`absolute z-10 rounded-full border border-border/70 bg-background/95 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 ${placement}`}
                          style={{ cursor }}
                          data-resize-handle="true"
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          </div>
          {showMinimap && boardCards.length > 0 ? (
            <button
              type="button"
              data-whiteboard-minimap="true"
              onPointerEnter={() => {
                setShowMinimap(true);
              }}
              onPointerLeave={(event) => {
                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Element && nextTarget.closest("[data-whiteboard-scroll-area='true']")) {
                  return;
                }
                setShowMinimap(false);
              }}
              className="absolute bottom-6 right-6 z-20 overflow-hidden rounded-lg border border-border/70 bg-background/20 backdrop-blur-sm"
              style={{ width: WHITEBOARD_MINIMAP_WIDTH, height: minimapHeight }}
              onClick={(event) => {
                event.stopPropagation();
                const scrollArea = scrollAreaRef.current;
                if (!scrollArea) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const ratioX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
                const ratioY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
                const targetCanvasX = minimapMetrics.minX + ratioX * minimapMetrics.width;
                const targetCanvasY = minimapMetrics.minY + ratioY * minimapMetrics.height;
                const targetLeft = targetCanvasX * boardZoom - scrollArea.clientWidth / 2;
                const targetTop = targetCanvasY * boardZoom - scrollArea.clientHeight / 2;
                scrollArea.scrollTo({
                  left: clamp(targetLeft, 0, Math.max(0, scrollArea.scrollWidth - scrollArea.clientWidth)),
                  top: clamp(targetTop, 0, Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight)),
                });
              }}
            >
              <div className="relative h-full w-full bg-background/5">
                {boardCards.map((node, index) => {
                  const scopedPath = makeScopedCardKey(boardScopePath, node.path);
                  const cardSize = cardSizeByPath[scopedPath] ?? cardSizeByPath[node.path] ?? {
                    width: CARD_DEFAULT_WIDTH,
                    height: CARD_DEFAULT_HEIGHT,
                  };
                  const cardPosition = cardPositionByPath[node.path] ?? getDefaultCardPosition(index);
                  const left = (cardPosition.x - minimapMetrics.minX) * minimapScale;
                  const top = (cardPosition.y - minimapMetrics.minY) * minimapScale;
                  const width = Math.max(3, cardSize.width * minimapScale);
                  const height = Math.max(3, cardSize.height * minimapScale);
                  return (
                    <span
                      key={`${node.path}-minimap`}
                      className="absolute rounded-sm border border-foreground/35 bg-foreground/20"
                      style={{ left, top, width, height }}
                    />
                  );
                })}
                <span
                  className="pointer-events-none absolute rounded-sm border border-primary/80 bg-transparent"
                  style={{
                    left: (minimapMetrics.viewportLeft - minimapMetrics.minX) * minimapScale,
                    top: (minimapMetrics.viewportTop - minimapMetrics.minY) * minimapScale,
                    width: Math.max(8, minimapMetrics.viewportWidth * minimapScale),
                    height: Math.max(8, minimapMetrics.viewportHeight * minimapScale),
                  }}
                />
              </div>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

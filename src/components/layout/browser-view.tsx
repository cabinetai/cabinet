"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Bookmark,
  BookMarked,
  ChevronLeft,
  Pencil,
  ChevronRight,
  ExternalLink,
  Folder,
  Globe,
  Icon,
  Plus,
  RefreshCw,
  Tags,
  Trash2,
  Blocks,
  Pin,
  PinOff,
} from "lucide-react";
import type { IconNode } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Header } from "@/components/layout/header";
import { useAppStore } from "@/stores/app-store";
import { useLocale } from "@/i18n/use-locale";

type BrowserViewBounds = { x: number; y: number; width: number; height: number };
type BrowserViewNavResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  loadedUrl?: string;
  primaryUrl?: string;
  fallbackUrl?: string | null;
  primaryError?: string;
  fallbackError?: string;
};
type BrowserBookmarkMenuItem = {
  id: string;
  name: string;
  type: "url" | "folder";
  url?: string;
  children?: BrowserBookmarkMenuItem[];
};

type BrowserBridge = {
  runtime: "electron";
  createBrowserView: (url: string) => Promise<{ ok: boolean; viewId?: string }>;
  loadBrowserViewUrl: (viewId: string, url: string) => Promise<BrowserViewNavResult>;
  setBrowserViewBounds: (viewId: string, bounds: BrowserViewBounds) => Promise<{ ok: boolean }>;
  setBrowserViewVisible: (viewId: string, visible: boolean) => Promise<{ ok: boolean }>;
  browserViewGoBack: (viewId: string) => Promise<BrowserViewNavResult>;
  browserViewGoForward: (viewId: string) => Promise<BrowserViewNavResult>;
  browserViewReload: (viewId: string) => Promise<BrowserViewNavResult>;
  showBrowserBookmarksMenu: (payload: {
    x: number;
    y: number;
    items: BrowserBookmarkMenuItem[];
  }) => Promise<{ ok: boolean; cancelled?: boolean; id?: string; url?: string }>;
  onBrowserViewNavigated: (
    listener: (payload: { viewId?: string; url?: string }) => void
  ) => () => void;
  onBrowserViewLoadFailed: (
    listener: (payload: {
      viewId?: string;
      requestedUrl?: string;
      primaryUrl?: string;
      fallbackUrl?: string;
      primaryError?: string;
      fallbackError?: string;
      errorCode?: number;
      errorDescription?: string;
      validatedUrl?: string;
    }) => void
  ) => () => void;
  destroyBrowserView: (viewId: string) => Promise<{ ok: boolean }>;
  getExtensions?: () => Promise<BrowserExtension[]>;
  updateExtension?: (id: string, updates: Partial<BrowserExtension>) => Promise<{ ok: boolean }>;
  showExtensionPopup?: (payload: { extensionId: string; x: number; y: number }) => Promise<{ ok: boolean }>;
};

type BrowserExtension = {
  id: string;
  name: string;
  version: string;
  path: string;
  description: string;
  enabled?: boolean;
  pinned?: boolean;
  iconDataUrl?: string | null;
  popupHtml?: string | null;
};

type BrowserSessionState = {
  history: string[];
  index: number;
  url: string | null;
};

type BookmarkUrlNode = {
  id: string;
  name: string;
  type: "url";
  url: string;
  date_added: string;
  date_last_used: string;
  tags: string[];
};

type BookmarkFolderNode = {
  id: string;
  name: string;
  type: "folder";
  date_added: string;
  date_modified: string;
  children: BookmarkNode[];
};

type BookmarkNode = BookmarkUrlNode | BookmarkFolderNode;

type BookmarkFile = {
  checksum: string;
  roots: {
    bookmark_bar: BookmarkFolderNode;
    other: BookmarkFolderNode;
  };
  version: number;
};

type BookmarkFolderOption = {
  id: string;
  label: string;
};

const BROWSER_SESSION_STORAGE_KEY = "cabinet.browser.session";

function normalizeBookmarkNodes(nodes: BookmarkNode[]): BookmarkNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function normalizeBookmarkUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "about:blank";
  if (trimmed.toLowerCase() === "about:blank") return "about:blank";
  // Protocol-relative → assume https.
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  // host:port (e.g. localhost:3000, 127.0.0.1:8080) — the colon is a port
  // separator, not a URL scheme, so keep the target and prefix https.
  if (/^[a-zA-Z0-9.-]+:\d+(?:[/?#]|$)/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  const schemeMatch = /^([a-zA-Z][a-zA-Z\d+.-]*):/.exec(trimmed);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    // Only allow web schemes; reject file:, javascript:, data:, etc.
    if (scheme === "http" || scheme === "https") return trimmed;
    return "about:blank";
  }
  return `https://${trimmed}`;
}

function toBridgeBookmarkMenuItems(nodes: BookmarkNode[]): BrowserBookmarkMenuItem[] {
  return normalizeBookmarkNodes(nodes).map((node) => {
    if (node.type === "folder") {
      return {
        id: node.id,
        name: node.name,
        type: "folder",
        children: toBridgeBookmarkMenuItems(node.children),
      };
    }
    return {
      id: node.id,
      name: node.name,
      type: "url",
      url: node.url,
    };
  });
}

function getBridge(): Partial<BrowserBridge> & { runtime?: "electron" } {
  // Guard for SSR / non-browser environments where `window` is undefined.
  if (typeof window === "undefined") return {};
  return (window as unknown as { CabinetDesktop?: Partial<BrowserBridge> & { runtime?: "electron" } })
    .CabinetDesktop ?? {};
}

const TAG_CLOUD_DATA_URL_PREFIX = "data:text/html;cabinet-tag-cloud=1;charset=utf-8,";

function isTagCloudDataUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith(TAG_CLOUD_DATA_URL_PREFIX);
}

function normalizeEnteredUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    if (typeof window !== "undefined") {
      try {
        return new URL(trimmed, window.location.origin).toString();
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) || trimmed.startsWith("//")) return trimmed;
  return `https://${trimmed}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type TagBookmarkEntry = {
  name: string;
  url: string;
};

type TagCloudEntry = {
  key: string;
  label: string;
  bookmarks: TagBookmarkEntry[];
};

function collectBookmarkTagEntries(nodes: BookmarkNode[]): TagCloudEntry[] {
  const tagsMap = new Map<string, TagCloudEntry>();
  const walk = (items: BookmarkNode[]) => {
    for (const node of items) {
      if (node.type === "folder") {
        walk(node.children);
        continue;
      }
      const bookmarkName = node.name.trim() || node.url;
      const bookmarkUrl = node.url.trim();
      if (!bookmarkUrl) continue;
      for (const rawTag of node.tags) {
        const label = rawTag.trim();
        if (!label) continue;
        const key = label.toLocaleLowerCase();
        const existing = tagsMap.get(key);
        if (!existing) {
          tagsMap.set(key, {
            key,
            label,
            bookmarks: [{ name: bookmarkName, url: bookmarkUrl }],
          });
          continue;
        }
        const duplicate = existing.bookmarks.some((bookmark) => bookmark.url === bookmarkUrl && bookmark.name === bookmarkName);
        if (!duplicate) {
          existing.bookmarks.push({ name: bookmarkName, url: bookmarkUrl });
        }
      }
    }
  };
  walk(nodes);
  const entries = Array.from(tagsMap.values()).map((entry) => ({
    ...entry,
    bookmarks: [...entry.bookmarks].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
  }));
  return entries.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

function buildTagCloudHtml(entries: TagCloudEntry[]): string {
  const tagAnchors = entries
    .map((entry) => `  <a class="tag" href="#" data-tag-key="${escapeHtml(entry.key)}">${escapeHtml(entry.label)}</a>`)
    .join("\n");
  const tagsPayload = JSON.stringify(
    entries.map((entry) => ({
      key: entry.key,
      label: entry.label,
      bookmarks: entry.bookmarks,
    }))
  ).replaceAll("</", "<\\/");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Bookmark Tags</title>
<style>
:root {
  --tag-bg-sat: 72%;
  --tag-bg-light: 68%;
  --tag-text: rgba(255,255,255,0.92);
  --tag-shadow:
    0 2px 6px rgba(72, 76, 160, 0.18),
    0 10px 18px rgba(72, 76, 160, 0.08);
  --tag-highlight:
    inset 0 1px 1px rgba(255,255,255,0.45),
    inset 0 -1px 1px rgba(255,255,255,0.08);
  --tag-blur: blur(10px);
  --cloud-bg: #efedf7;
}
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 24px;
  background: var(--cloud-bg);
  box-sizing: border-box;
}
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  width: min(95%, 1200px);
  padding: 32px;
  border-radius: 28px;
  background:
    radial-gradient(
      circle at top left,
      rgba(248, 238, 255, 0.9),
      rgb(224, 216, 255)
    );
  font-family:
    Inter,
    SF Pro Display,
    system-ui,
    sans-serif;
}
.tag {
  --hue: 240;
  --sat-multiplier: 1;
  --lightness: var(--tag-bg-light);
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 22px;
  border: 2px solid transparent;
  border-radius: 999px;
  color: var(--tag-text);
  text-decoration: none;
  white-space: nowrap;
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  backdrop-filter: var(--tag-blur);
  background:
    linear-gradient(
      145deg,
      hsla(
        var(--hue),
        calc(var(--tag-bg-sat) * var(--sat-multiplier)),
        calc(var(--lightness) + 6%),
        0.92
      ),
      hsla(
        var(--hue),
        calc(var(--tag-bg-sat) * var(--sat-multiplier)),
        var(--lightness),
        0.95
      )
    );
  box-shadow:
    var(--tag-shadow),
    var(--tag-highlight);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    filter 160ms ease;
}
.tag::before {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  background:
    linear-gradient(
      to bottom,
      rgba(255,255,255,0.22),
      rgba(255,255,255,0.02)
    );
  pointer-events: none;
}
.tag:hover {
  transform: translateY(-2px);
  filter: saturate(1.08);
  box-shadow:
    0 6px 16px rgba(72, 76, 160, 0.22),
    0 14px 30px rgba(72, 76, 160, 0.14),
    var(--tag-highlight);
}
.tag:nth-child(8n + 1) { --hue: 225; }
.tag:nth-child(8n + 2) { --hue: 232; }
.tag:nth-child(8n + 3) { --hue: 238; }
.tag:nth-child(8n + 4) { --hue: 245; }
.tag:nth-child(8n + 5) { --hue: 252; }
.tag:nth-child(8n + 6) { --hue: 258; }
.tag:nth-child(8n + 7) { --hue: 235; }
.tag:nth-child(8n + 8) { --hue: 248; }
.tag:nth-child(3n) {
  --sat-multiplier: 0.92;
}
.tag:nth-child(5n) {
  --lightness: 72%;
}
.tag:nth-child(7n) {
  --lightness: 64%;
}
.tag[data-weight="high"] {
  font-weight: 600;
  padding-inline: 26px;
  --lightness: 60%;
}
.tag[data-weight="low"] {
  opacity: 0.72;
  --sat-multiplier: 0.72;
}
.tag.is-selected {
  border: 2px solid #6d28d9;
}
.tag-cloud.is-filtering {
  opacity: 0.55;
}
.tag-results {
  margin-top: 16px;
  width: min(95%, 1200px);
  padding: 20px;
  border-radius: 20px;
  background: rgba(255,255,255,0.7);
  backdrop-filter: blur(6px);
  font-family:
    Inter,
    SF Pro Display,
    system-ui,
    sans-serif;
}
.tag-results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 0.95rem;
  color: rgba(50, 54, 110, 0.95);
}
.tag-results-close {
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  background: rgba(72, 76, 160, 0.12);
  color: rgba(36, 38, 93, 0.95);
  cursor: pointer;
}
.tag-results-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tag-result-link {
  color: rgba(48, 52, 128, 0.96);
  text-decoration: none;
  font-size: 0.92rem;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255,255,255,0.62);
}
.tag-result-link:hover {
  background: rgba(255,255,255,0.88);
}
.tag-results-empty {
  color: rgba(70, 74, 138, 0.7);
  font-size: 0.9rem;
}
</style>
</head>
<body>
<div class="tag-cloud" id="tagCloud">
${tagAnchors}
</div>
<div class="tag-results" id="tagResults" hidden>
  <div class="tag-results-header">
    <span id="tagResultsTitle"></span>
    <button type="button" id="tagResultsClose" class="tag-results-close">Close</button>
  </div>
  <div id="tagResultsBody" class="tag-results-body"></div>
</div>
<script id="tag-data" type="application/json">${tagsPayload}</script>
<script>
function stringToHue(str) {
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  return 220 + (Math.abs(hash) % 40);
}

const tagsData = (() => {
  const el = document.getElementById("tag-data");
  if (!el) return [];
  try {
    return JSON.parse(el.textContent || "[]");
  } catch {
    return [];
  }
})();

const tagCloud = document.getElementById("tagCloud");
const resultsPanel = document.getElementById("tagResults");
const resultsTitle = document.getElementById("tagResultsTitle");
const resultsBody = document.getElementById("tagResultsBody");
const resultsClose = document.getElementById("tagResultsClose");
let selectedTag = null;

document.querySelectorAll(".tag").forEach((element) => {
  const text = (element.textContent || "").trim();
  element.style.setProperty("--hue", String(stringToHue(text)));
  element.addEventListener("click", (event) => {
    event.preventDefault();
    if (selectedTag) {
      selectedTag.classList.remove("is-selected");
    }
    element.classList.add("is-selected");
    selectedTag = element;
    const tagKey = element.getAttribute("data-tag-key") || "";
    const match = tagsData.find((entry) => String(entry.key || "") === tagKey);
    if (!match) return;
    const bookmarks = Array.isArray(match.bookmarks) ? match.bookmarks : [];
    resultsTitle.textContent = String(match.label || "Tag") + " (" + String(bookmarks.length) + ")";
    resultsBody.innerHTML = "";
    if (bookmarks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tag-results-empty";
      empty.textContent = "No bookmarks";
      resultsBody.appendChild(empty);
    } else {
      bookmarks.forEach((bookmark) => {
        const link = document.createElement("a");
        link.className = "tag-result-link";
        link.href = String(bookmark.url || "about:blank");
        link.textContent = String(bookmark.name || bookmark.url || "Untitled");
        link.title = String(bookmark.url || "");
        resultsBody.appendChild(link);
      });
    }
    resultsPanel.hidden = false;
    tagCloud.classList.add("is-filtering");
  });
});

resultsClose.addEventListener("click", () => {
  resultsPanel.hidden = true;
  tagCloud.classList.remove("is-filtering");
  if (selectedTag) {
    selectedTag.classList.remove("is-selected");
    selectedTag = null;
  }
});
</script>
</body>
</html>`;
}

const folderBookmarkIconNode: IconNode = [
  ["path", { d: "M12 6v8l3-3 3 3V6", key: "v0froi" }],
  [
    "path",
    {
      d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z",
      key: "1wvlfi",
    },
  ],
];

function normalizeSessionUrl(value: string | null | undefined): string {
  const trimmed = (value || "about:blank").trim();
  return trimmed || "about:blank";
}

function toAddressBarValue(value: string | null | undefined): string {
  const normalized = normalizeSessionUrl(value);
  return isTagCloudDataUrl(normalized) ? "" : normalized;
}

function loadBrowserSessionState(): BrowserSessionState {
  if (typeof window === "undefined") {
    return { history: ["about:blank"], index: 0, url: "about:blank" };
  }
  try {
    const raw = window.sessionStorage.getItem(BROWSER_SESSION_STORAGE_KEY);
    if (!raw) {
      return { history: ["about:blank"], index: 0, url: "about:blank" };
    }
    const parsed = JSON.parse(raw) as {
      history?: unknown;
      index?: unknown;
      url?: unknown;
    };
    const history = Array.isArray(parsed.history)
      ? parsed.history.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];
    const cleanedHistory = history.length > 0 ? history.map((entry) => normalizeSessionUrl(entry)) : ["about:blank"];
    const nextIndex =
      typeof parsed.index === "number" && Number.isFinite(parsed.index)
        ? Math.max(0, Math.min(cleanedHistory.length - 1, Math.floor(parsed.index)))
        : cleanedHistory.length - 1;
    const nextUrl =
      typeof parsed.url === "string" && parsed.url.trim().length > 0
        ? normalizeSessionUrl(parsed.url)
        : cleanedHistory[nextIndex] || "about:blank";
    return {
      history: cleanedHistory,
      index: nextIndex,
      url: nextUrl,
    };
  } catch {
    return { history: ["about:blank"], index: 0, url: "about:blank" };
  }
}

function persistBrowserSessionState(state: BrowserSessionState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(BROWSER_SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function BrowserView() {
  const { t } = useLocale();
  const url = useAppStore((s) => s.browseUrl);
  const setAppMode = useAppStore((s) => s.setAppMode);

  // Sandbox for the fallback iframe. `allow-same-origin` is only safe for
  // *cross-origin* pages: there it just lets the external site use its own
  // origin, and it can't reach our app. For a page served from our OWN origin,
  // `allow-same-origin` + `allow-scripts` would let it script the host app and
  // escape the sandbox, so we omit it for same-origin/unknown URLs.
  const iframeSandbox = (() => {
    const base = "allow-scripts allow-forms allow-modals allow-top-navigation-by-user-activation";
    try {
      if (url && typeof window !== "undefined") {
        const u = new URL(url, window.location.origin);
        if (
          (u.protocol === "http:" || u.protocol === "https:") &&
          u.origin !== window.location.origin
        ) {
          return `${base} allow-same-origin`;
        }
      }
    } catch {
      // fall through to the restrictive sandbox
    }
    return base;
  })();
  const initialSessionRef = useRef<BrowserSessionState>(loadBrowserSessionState());
  const [addressValue, setAddressValue] = useState(toAddressBarValue(url ?? initialSessionRef.current.url ?? ""));
  const [browserMode, setBrowserMode] = useState<"initializing" | "electron" | "iframe">(() => {
    const bridge = getBridge();
    return bridge.createBrowserView && bridge.destroyBrowserView ? "initializing" : "iframe";
  });
  const [initAttempt, setInitAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookmarksMenuRef = useRef<HTMLDivElement | null>(null);
  const bookmarksTriggerRef = useRef<HTMLButtonElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeLoadTokenRef = useRef(0);
  const iframeLoadedTokenRef = useRef(0);
  const iframeHistoryRef = useRef<string[]>(initialSessionRef.current.history);
  const iframeHistoryIndexRef = useRef<number>(initialSessionRef.current.index);
  const iframeNavActionRef = useRef<"back" | "forward" | null>(null);
  const suppressNextElectronLoadRef = useRef(false);
  const [iframeReloadKey, setIframeReloadKey] = useState(0);
  const viewIdRef = useRef<string | null>(null);
  const updateBoundsRef = useRef<() => void>(() => {});
  const [iframeFailure, setIframeFailure] = useState<string | null>(null);
  const [electronFailure, setElectronFailure] = useState<string | null>(null);
  const [iframePolicyBlocked, setIframePolicyBlocked] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkFile | null>(null);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [bookmarksMenuOpen, setBookmarksMenuOpen] = useState(false);
  const [bookmarksMenuPosition, setBookmarksMenuPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [managerEditDialogOpen, setManagerEditDialogOpen] = useState(false);
  const [managerEditNodeId, setManagerEditNodeId] = useState<string | null>(null);
  const [managerEditNodeType, setManagerEditNodeType] = useState<"url" | "folder">("url");
  const [managerEditTitle, setManagerEditTitle] = useState("");
  const [managerEditUrl, setManagerEditUrl] = useState("");
  const [managerEditTags, setManagerEditTags] = useState("");
  const [managerEditParentId, setManagerEditParentId] = useState("1");
  const [bookmarksBarVisible, setBookmarksBarVisible] = useState(true);
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const [bookmarkTitle, setBookmarkTitle] = useState("");
  const [bookmarkUrl, setBookmarkUrl] = useState("");
  const [bookmarkTags, setBookmarkTags] = useState("");
  const [bookmarkParentId, setBookmarkParentId] = useState("1");
  const bookmarkTitleRequestRef = useRef(0);
  const [extensions, setExtensions] = useState<BrowserExtension[]>([]);

  useEffect(() => {
    if (url == null) return;
    setAddressValue(toAddressBarValue(url));

    // In iframe mode there's no Electron navigation event to record history
    // from (that's owned by onBrowserViewNavigated in electron mode), so track
    // it here. Without this, iframeHistoryRef never grows and Back/Forward
    // can't replay earlier pages.
    if (browserMode !== "iframe") return;
    const normalized = normalizeSessionUrl(url);
    const navAction = iframeNavActionRef.current;
    if (navAction === "back" || navAction === "forward") {
      // Back/forward already moved the index; just clear the pending action.
      iframeNavActionRef.current = null;
      persistBrowserSessionState({
        history: iframeHistoryRef.current,
        index: iframeHistoryIndexRef.current,
        url: normalized,
      });
      return;
    }
    const history = iframeHistoryRef.current;
    const currentIndex = iframeHistoryIndexRef.current;
    if (currentIndex >= 0 && history[currentIndex] === normalized) return;
    // Genuine navigation: drop any forward entries and push the new URL.
    const nextHistory = currentIndex >= 0 ? history.slice(0, currentIndex + 1) : [];
    nextHistory.push(normalized);
    iframeHistoryRef.current = nextHistory;
    iframeHistoryIndexRef.current = nextHistory.length - 1;
    persistBrowserSessionState({
      history: nextHistory,
      index: iframeHistoryIndexRef.current,
      url: normalized,
    });
  }, [url, browserMode]);

  useEffect(() => {
    const bridge = getBridge();
    if (bridge.getExtensions) {
      bridge.getExtensions().then(setExtensions);
    }
  }, []);

  const fetchBookmarks = async () => {
    setBookmarksLoading(true);
    try {
      const response = await fetch("/api/browser/bookmarks", { method: "GET", cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as BookmarkFile;
      setBookmarks(data);
    } finally {
      setBookmarksLoading(false);
    }
  };

  const resolveCurrentPageTitle = async (currentUrl: string): Promise<string> => {
    if (browserMode === "iframe") {
      try {
        const iframeTitle = iframeRef.current?.contentDocument?.title?.trim();
        if (iframeTitle) return iframeTitle;
      } catch {}
    }
    try {
      const response = await fetch("/api/browser/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolveTitle", url: currentUrl }),
      });
      if (!response.ok) return "";
      const data = (await response.json()) as { title?: string | null };
      return typeof data.title === "string" ? data.title : "";
    } catch {
      return "";
    }
  };

  const openBookmarkDialog = async () => {
    if (!url || url === "about:blank") return;
    const currentUrl = addressValue || url;
    const requestId = bookmarkTitleRequestRef.current + 1;
    bookmarkTitleRequestRef.current = requestId;
    setBookmarkUrl(currentUrl);
    setBookmarkTitle("");
    setBookmarkTags("");
    setBookmarkParentId(bookmarks?.roots.bookmark_bar.id ?? "1");
    setBookmarkDialogOpen(true);
    const nextTitle = await resolveCurrentPageTitle(currentUrl);
    if (bookmarkTitleRequestRef.current !== requestId) return;
    setBookmarkTitle(nextTitle);
  };

  const saveBookmarkFromDialog = async () => {
    const normalizedUrl = normalizeBookmarkUrl(bookmarkUrl);
    const tags = bookmarkTags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    const response = await fetch("/api/browser/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addBookmark",
        name: bookmarkTitle,
        url: normalizedUrl,
        parentId: bookmarkParentId,
        tags,
      }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as { bookmarks?: BookmarkFile };
    if (data.bookmarks) setBookmarks(data.bookmarks);
    setBookmarkDialogOpen(false);
  };

  const openManagerEditDialog = (node: BookmarkNode, parentId: string) => {
    setManagerEditNodeId(node.id);
    setManagerEditNodeType(node.type);
    setManagerEditTitle(node.name);
    setManagerEditUrl(node.type === "url" ? node.url : "");
    setManagerEditTags(node.type === "url" ? node.tags.join(", ") : "");
    setManagerEditParentId(parentId);
    setManagerOpen(false);
    setManagerEditDialogOpen(true);
  };

  const saveManagerEditDialog = async () => {
    if (!managerEditNodeId) return;
    const response = await fetch("/api/browser/bookmarks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: managerEditNodeId,
        name: managerEditTitle,
        ...(managerEditNodeType === "url"
          ? {
              url: normalizeBookmarkUrl(managerEditUrl),
              tags: managerEditTags
                .split(",")
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0),
              parentId: managerEditParentId,
            }
          : {}),
      }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as { bookmarks?: BookmarkFile };
    if (data.bookmarks) setBookmarks(data.bookmarks);
    setManagerEditDialogOpen(false);
    setManagerEditNodeId(null);
    setManagerOpen(true);
  };

  const markBookmarkUsed = async (id: string) => {
    const response = await fetch("/api/browser/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markUsed", id }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as { bookmarks?: BookmarkFile };
    if (data.bookmarks) setBookmarks(data.bookmarks);
  };

  const openBookmarkUrl = async (node: BookmarkUrlNode) => {
    await markBookmarkUsed(node.id);
    setBookmarksMenuOpen(false);
    setAppMode("browse", node.url);
    setAddressValue(toAddressBarValue(node.url));
  };

  const setElectronOverlayVisibility = async (visible: boolean) => {
    if (browserMode !== "electron") return;
    const bridge = getBridge();
    const viewId = viewIdRef.current;
    const setBrowserViewVisible = bridge.setBrowserViewVisible;
    if (!viewId || !setBrowserViewVisible) return;
    try {
      const result = await setBrowserViewVisible(viewId, visible);
      if (visible) {
        updateBoundsRef.current();
      }
      if (visible && !result?.ok) {
        setInitAttempt((value) => value + 1);
      }
    } catch {
      if (visible) {
        setInitAttempt((value) => value + 1);
      }
    }
  };

  const openBookmarksNativeMenu = async () => {
    const trigger = bookmarksTriggerRef.current;
    if (!trigger) return;
    const bridge = getBridge();
    const showBrowserBookmarksMenu = bridge.showBrowserBookmarksMenu;
    if (!showBrowserBookmarksMenu) {
      setBookmarksMenuOpen((open) => !open);
      return;
    }
    if (!bookmarks) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const x = Math.max(0, Math.round(rect.right - 4));
    const y = Math.max(0, Math.round(rect.bottom + 6));
    const items = toBridgeBookmarkMenuItems([
      ...bookmarks.roots.bookmark_bar.children,
      ...bookmarks.roots.other.children,
    ]);

    const result = await showBrowserBookmarksMenu({ x, y, items });
    if (!result?.ok || result.cancelled) return;
    if (typeof result.id === "string") {
      await markBookmarkUsed(result.id);
    }
    if (typeof result.url === "string" && result.url.trim().length > 0) {
      setAppMode("browse", result.url);
      setAddressValue(toAddressBarValue(result.url));
    }
  };

  const openTagsCloud = () => {
    const entries = bookmarks
      ? collectBookmarkTagEntries([
          bookmarks.roots.bookmark_bar,
          bookmarks.roots.other,
        ])
      : [];
    const html = buildTagCloudHtml(entries);
    const dataUrl = `${TAG_CLOUD_DATA_URL_PREFIX}${encodeURIComponent(html)}`;
    setAppMode("browse", dataUrl);
    setAddressValue("");
  };

  const handleToggleExtensionPin = async (ext: BrowserExtension) => {
    const bridge = getBridge();
    const newPinned = !ext.pinned;
    if (bridge.updateExtension) {
      await bridge.updateExtension(ext.id, { pinned: newPinned });
      setExtensions(prev => prev.map(e => e.id === ext.id ? { ...e, pinned: newPinned } : e));
    }
  };

  const handleRunExtension = async (ext: BrowserExtension, event: React.MouseEvent) => {
    const bridge = getBridge();
    if (bridge.showExtensionPopup) {
      const rect = event.currentTarget.getBoundingClientRect();
      await bridge.showExtensionPopup({
        extensionId: ext.id,
        x: Math.round(rect.left),
        y: Math.round(rect.bottom + 8),
      });
    }
  };

  const createFolder = async () => {
    const response = await fetch("/api/browser/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createFolder", name: "New Folder" }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as { bookmarks?: BookmarkFile };
    if (data.bookmarks) setBookmarks(data.bookmarks);
  };

  const deleteNode = async (id: string) => {
    const response = await fetch("/api/browser/bookmarks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as { bookmarks?: BookmarkFile };
    if (data.bookmarks) setBookmarks(data.bookmarks);
  };

  const navigateBack = () => {
    const applyAppHistoryBack = () => {
      const nextIndex = iframeHistoryIndexRef.current - 1;
      const target = nextIndex >= 0 ? iframeHistoryRef.current[nextIndex] : null;
      // No earlier real page to return to (we're at the first browsed page, and
      // index 0 is the empty session seed). Rather than dead-ending on
      // about:blank, fall back to the KB article we came from by exiting browse
      // mode — this is the "back to the article" affordance.
      if (nextIndex < 0 || !target || target === "about:blank") {
        iframeNavActionRef.current = null;
        setAppMode("edit");
        return;
      }
      iframeHistoryIndexRef.current = nextIndex;
      iframeNavActionRef.current = "back";
      setAppMode("browse", target);
    };
    if (browserMode === "electron") {
      const viewId = viewIdRef.current;
      const bridge = getBridge();
      if (viewId && bridge.browserViewGoBack) {
        iframeNavActionRef.current = "back";
        void bridge.browserViewGoBack(viewId)
          .then((result) => {
            if (result?.ok && !result.skipped) return;
            iframeNavActionRef.current = null;
            applyAppHistoryBack();
          })
          .catch(() => {
            iframeNavActionRef.current = null;
            applyAppHistoryBack();
          });
        return;
      }
      applyAppHistoryBack();
      return;
    }
    if (browserMode === "iframe") {
      try {
        iframeRef.current?.contentWindow?.history.back();
        return;
      } catch {
        applyAppHistoryBack();
      }
    }
  };

  const navigateForward = () => {
    const applyAppHistoryForward = () => {
      const nextIndex = iframeHistoryIndexRef.current + 1;
      if (nextIndex >= iframeHistoryRef.current.length) return;
      iframeHistoryIndexRef.current = nextIndex;
      iframeNavActionRef.current = "forward";
      setAppMode("browse", iframeHistoryRef.current[nextIndex] || "about:blank");
    };
    if (browserMode === "electron") {
      const viewId = viewIdRef.current;
      const bridge = getBridge();
      if (viewId && bridge.browserViewGoForward) {
        iframeNavActionRef.current = "forward";
        void bridge.browserViewGoForward(viewId)
          .then((result) => {
            if (result?.ok && !result.skipped) return;
            iframeNavActionRef.current = null;
            applyAppHistoryForward();
          })
          .catch(() => {
            iframeNavActionRef.current = null;
            applyAppHistoryForward();
          });
        return;
      }
      applyAppHistoryForward();
      return;
    }
    if (browserMode === "iframe") {
      applyAppHistoryForward();
    }
  };

  const reloadPage = () => {
    const applyReloadFallback = () => {
      setIframeReloadKey((k) => k + 1);
    };
    if (browserMode === "electron") {
      const viewId = viewIdRef.current;
      const bridge = getBridge();
      if (!viewId) {
        applyReloadFallback();
        return;
      }
      if (bridge.browserViewReload) {
        void bridge.browserViewReload(viewId)
          .then((result) => {
            if (result?.ok && !result.skipped) return;
            if (bridge.loadBrowserViewUrl) {
              void bridge.loadBrowserViewUrl(viewId, "__cabinet_nav_reload__")
                .then((fallbackResult) => {
                  if (fallbackResult?.ok && !fallbackResult.skipped) return;
                  applyReloadFallback();
                })
                .catch(() => {
                  applyReloadFallback();
                });
              return;
            }
            applyReloadFallback();
          })
          .catch(() => {
            if (bridge.loadBrowserViewUrl) {
              void bridge.loadBrowserViewUrl(viewId, "__cabinet_nav_reload__")
                .then((fallbackResult) => {
                  if (fallbackResult?.ok && !fallbackResult.skipped) return;
                  applyReloadFallback();
                })
                .catch(() => {
                  applyReloadFallback();
                });
              return;
            }
            applyReloadFallback();
          });
        return;
      }
      if (bridge.loadBrowserViewUrl) {
        void bridge.loadBrowserViewUrl(viewId, "__cabinet_nav_reload__")
          .then((result) => {
            if (result?.ok && !result.skipped) return;
            applyReloadFallback();
          })
          .catch(() => {
            applyReloadFallback();
          });
        return;
      }
      applyReloadFallback();
      return;
    }
    if (browserMode === "iframe") {
      applyReloadFallback();
    }
  };

  useEffect(() => {
    let cancelled = false;
    let retries = 0;
    const maxRetries = 20;
    let retryTimer: number | null = null;

    const cleanup = () => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const failToIframe = () => {
      setBrowserMode("iframe");
    };

    const hasElectronBrowserBridge = () => {
      const bridge = getBridge();
      return !!bridge.createBrowserView && !!bridge.destroyBrowserView;
    };

    const attemptInit = () => {
      if (cancelled) return;
      const bridge = getBridge();
      if (!hasElectronBrowserBridge()) {
        retries += 1;
        if (retries >= maxRetries) {
          failToIframe();
          return;
        }
        retryTimer = window.setTimeout(attemptInit, 100);
        return;
      }
      const createBrowserView = bridge.createBrowserView;
      const destroyBrowserView = bridge.destroyBrowserView;
      const loadBrowserViewUrl = bridge.loadBrowserViewUrl;
      if (!createBrowserView || !destroyBrowserView) {
        failToIframe();
        return;
      }
      void createBrowserView(useAppStore.getState().browseUrl || "about:blank")
        .then((result) => {
          if (cancelled) {
            // We unmounted while the view was being created — the cleanup ran
            // before viewIdRef was set, so destroy the now-orphaned view here
            // to avoid leaking a whole WebContentsView (a Chromium renderer).
            if (result?.ok && result.viewId && destroyBrowserView) {
              void destroyBrowserView(result.viewId);
            }
            return;
          }
          if (!result?.ok || !result.viewId) {
            failToIframe();
            return;
          }
          setBrowserMode("electron");
          setElectronFailure(null);
          viewIdRef.current = result.viewId;
          updateBoundsRef.current();
          const activeUrl = useAppStore.getState().browseUrl || "about:blank";
          if (loadBrowserViewUrl) {
            void loadBrowserViewUrl(result.viewId, activeUrl)
              .then((navResult) => {
                if (!navResult?.ok) {
                  setElectronFailure(navResult?.primaryError || navResult?.error || "load-failed");
                }
              })
              .catch(() => {
                setElectronFailure("load-failed");
              });
          }
        })
        .catch(() => {
          if (!cancelled) failToIframe();
        });
    };

    const existing = viewIdRef.current;
    if (existing) {
      const bridge = getBridge();
      const destroyBrowserView = bridge.destroyBrowserView;
      const setBrowserViewVisible = bridge.setBrowserViewVisible;
      viewIdRef.current = null;
      if (setBrowserViewVisible) {
        void setBrowserViewVisible(existing, false).catch(() => {});
      }
      if (destroyBrowserView) {
        void destroyBrowserView(existing);
      }
    }

    setBrowserMode(hasElectronBrowserBridge() ? "initializing" : "iframe");
    attemptInit();

    return () => {
      cancelled = true;
      cleanup();
      const bridge = getBridge();
      const destroyBrowserView = bridge.destroyBrowserView;
      const setBrowserViewVisible = bridge.setBrowserViewVisible;
      const current = viewIdRef.current;
      viewIdRef.current = null;
      if (current && setBrowserViewVisible) {
        void setBrowserViewVisible(current, false).catch(() => {});
      }
      if (current && destroyBrowserView) {
        void destroyBrowserView(current);
      }
    };
  }, [initAttempt]);

  useEffect(() => {
    const bridge = getBridge();
    const subscribe = bridge.onBrowserViewLoadFailed;
    if (!subscribe) return;
    const unsubscribe = subscribe((payload) => {
      const activeViewId = viewIdRef.current;
      if (!activeViewId || payload?.viewId !== activeViewId) return;
      const detail = [
        payload?.errorDescription,
        payload?.validatedUrl,
        payload?.primaryError,
        payload?.fallbackError,
      ]
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .join(" | ");
      setElectronFailure(detail || "load-failed");
    });
    return () => {
      unsubscribe();
    };
  }, []);


  useEffect(() => {
    const bridge = getBridge();
    const subscribe = bridge.onBrowserViewNavigated;
    if (!subscribe) return;
    const unsubscribe = subscribe((payload) => {
      const activeViewId = viewIdRef.current;
      if (!activeViewId || payload?.viewId !== activeViewId) return;
      const nextUrl = normalizeSessionUrl(payload?.url || "about:blank");
      const history = iframeHistoryRef.current;
      const currentIndex = iframeHistoryIndexRef.current;
      const navAction = iframeNavActionRef.current;
      if (navAction === "back" || navAction === "forward") {
        iframeNavActionRef.current = null;
        let nextIndex = navAction === "back" ? Math.max(0, currentIndex - 1) : Math.min(history.length - 1, currentIndex + 1);
        if (history[nextIndex] !== nextUrl) {
          const start = navAction === "back" ? Math.max(0, currentIndex - 1) : Math.min(history.length - 1, currentIndex + 1);
          const end = navAction === "back" ? 0 : history.length - 1;
          const step = navAction === "back" ? -1 : 1;
          let matchedIndex = -1;
          for (let i = start; navAction === "back" ? i >= end : i <= end; i += step) {
            if (history[i] === nextUrl) {
              matchedIndex = i;
              break;
            }
          }
          if (matchedIndex >= 0) {
            nextIndex = matchedIndex;
          } else {
            const nextHistory = currentIndex >= 0 ? history.slice(0, currentIndex + 1) : [];
            nextHistory.push(nextUrl);
            iframeHistoryRef.current = nextHistory;
            nextIndex = nextHistory.length - 1;
          }
        }
        iframeHistoryIndexRef.current = nextIndex;
        const nextHistory = iframeHistoryRef.current;
        persistBrowserSessionState({ history: nextHistory, index: nextIndex, url: nextUrl });
        setAddressValue(toAddressBarValue(nextUrl));
        if (useAppStore.getState().browseUrl !== nextUrl) {
          suppressNextElectronLoadRef.current = true;
          setAppMode("browse", nextUrl);
        }
        return;
      }
      if (currentIndex >= 0 && history[currentIndex] === nextUrl) {
        persistBrowserSessionState({ history, index: currentIndex, url: nextUrl });
        setAddressValue(toAddressBarValue(nextUrl));
        return;
      }
      const nextHistory = currentIndex >= 0 ? history.slice(0, currentIndex + 1) : [];
      nextHistory.push(nextUrl);
      iframeHistoryRef.current = nextHistory;
      iframeHistoryIndexRef.current = nextHistory.length - 1;
      persistBrowserSessionState({
        history: nextHistory,
        index: iframeHistoryIndexRef.current,
        url: nextUrl,
      });
      setAddressValue(toAddressBarValue(nextUrl));
      if (useAppStore.getState().browseUrl !== nextUrl) {
        suppressNextElectronLoadRef.current = true;
        setAppMode("browse", nextUrl);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [setAppMode]);

  useEffect(() => {
    const bridge = getBridge();
    const viewId = viewIdRef.current;
    if (!bridge.createBrowserView || !bridge.destroyBrowserView || !viewId || browserMode !== "electron") {
      return;
    }
    if (suppressNextElectronLoadRef.current) {
      suppressNextElectronLoadRef.current = false;
      return;
    }
    const loadBrowserViewUrl = bridge.loadBrowserViewUrl;
    if (!loadBrowserViewUrl) return;
    void loadBrowserViewUrl(viewId, url || "about:blank")
      .then((result) => {
        if (!result?.ok) {
          setElectronFailure(result?.primaryError || result?.error || "load-failed");
        } else {
          setElectronFailure(null);
        }
      })
      .catch(() => {
        setElectronFailure("load-failed");
      });
  }, [url, browserMode]);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge.createBrowserView || !bridge.destroyBrowserView || browserMode !== "electron") return;
    const setBrowserViewBounds = bridge.setBrowserViewBounds;
    if (!setBrowserViewBounds) return;
    const updateBounds = () => {
      const viewId = viewIdRef.current;
      const el = containerRef.current;
      if (!viewId || !el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.round(rect.left));
      const y = Math.max(0, Math.round(rect.top));
      const width = Math.max(0, Math.round(rect.width));
      const height = Math.max(0, Math.round(rect.height));
      if (width < 64 || height < 64) return;
      void setBrowserViewBounds(viewId, { x, y, width, height });
    };
    updateBoundsRef.current = updateBounds;
    const ro = new ResizeObserver(updateBounds);
    const el = containerRef.current;
    if (el) ro.observe(el);
    window.addEventListener("resize", updateBounds);
    updateBounds();
    const timer = window.setTimeout(updateBounds, 120);
    return () => {
      window.clearTimeout(timer);
      updateBoundsRef.current = () => {};
      ro.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [browserMode]);

  const isDialogOpen = managerOpen || bookmarkDialogOpen || managerEditDialogOpen;

  useEffect(() => {
    const bridge = getBridge();
    const viewId = viewIdRef.current;
    if (!bridge.createBrowserView || !bridge.destroyBrowserView || !viewId || browserMode !== "electron") {
      return;
    }
    const setBrowserViewVisible = bridge.setBrowserViewVisible;
    if (!setBrowserViewVisible) return;
    const shouldShow = !isDialogOpen;
    if (shouldShow) {
      updateBoundsRef.current();
    }
    void setBrowserViewVisible(viewId, shouldShow)
      .then((result) => {
        if (shouldShow) {
          window.setTimeout(() => {
            updateBoundsRef.current();
          }, 24);
        }
        if (shouldShow && !result?.ok) {
          setInitAttempt((value) => value + 1);
        }
      })
      .catch(() => {
        if (shouldShow) {
          setInitAttempt((value) => value + 1);
        }
      });
  }, [browserMode, isDialogOpen]);

  useEffect(() => {
    if (browserMode !== "iframe") {
      setIframePolicyBlocked(false);
      return;
    }
    if (!url || url === "about:blank") {
      setIframePolicyBlocked(false);
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`/api/browser/frame-check?url=${encodeURIComponent(url)}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setIframePolicyBlocked(data?.blocked === true);
        }
      } catch {
        if (!cancelled) {
          setIframePolicyBlocked(false);
        }
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [browserMode, url]);

  useEffect(() => {
    if (browserMode !== "iframe") {
      setIframeFailure(null);
      return;
    }
    if (!url || url === "about:blank") {
      setIframeFailure(null);
      return;
    }
    // Bump the token for each load attempt so the timeout below can tell
    // whether *this* load fired onLoad. onLoad copies this value into
    // iframeLoadedTokenRef; if it never does, loadedToken stays behind and we
    // flag a failure.
    iframeLoadTokenRef.current += 1;
    const loadToken = iframeLoadTokenRef.current;
    const timer = window.setTimeout(() => {
      if (iframePolicyBlocked) {
        setIframeFailure("blocked-or-failed");
        return;
      }
      if (iframeLoadedTokenRef.current < loadToken) {
        setIframeFailure("blocked-or-failed");
        return;
      }
      const iframe = iframeRef.current;
      if (!iframe) {
        setIframeFailure("blocked-or-failed");
        return;
      }
      try {
        const href = iframe.contentWindow?.location?.href || "";
        const doc = iframe.contentDocument;
        const title = (doc?.title || "").toLowerCase();
        const bodyText = (doc?.body?.innerText || "").toLowerCase();
        const hasConnectionErrorText =
          bodyText.includes("refused to connect") ||
          bodyText.includes("can't be reached") ||
          bodyText.includes("cannot be reached") ||
          bodyText.includes("connection") && bodyText.includes("failed");
        if (
          href === "about:blank" ||
          href.startsWith("chrome-error://") ||
          title.includes("error") ||
          hasConnectionErrorText
        ) {
          setIframeFailure("blocked-or-failed");
          return;
        }
      } catch {
        setIframeFailure(null);
        return;
      }
      setIframeFailure(null);
    }, 2500);
    return () => {
      window.clearTimeout(timer);
    };
    // NOTE: deliberately not depending on the load-completion signal — the
    // timer reads iframeLoadedTokenRef directly. Re-running on load completion
    // would bump the load token again and flag a false failure on a page that
    // actually loaded fine.
  }, [browserMode, url, iframeReloadKey, iframePolicyBlocked]);

  useEffect(() => {
    void fetchBookmarks();
  }, []);

  useEffect(() => {
    if (!bookmarksMenuOpen) {
      setBookmarksMenuPosition(null);
      return;
    }
    const updatePosition = () => {
      const trigger = bookmarksTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 320;
      const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
      const top = Math.max(8, rect.bottom + 6);
      const maxHeight = Math.max(120, window.innerHeight - top - 8);
      setBookmarksMenuPosition({ top, left, maxHeight });
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const menu = bookmarksMenuRef.current;
      const trigger = bookmarksTriggerRef.current;
      if (menu?.contains(target) || trigger?.contains(target)) return;
      setBookmarksMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBookmarksMenuOpen(false);
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [bookmarksMenuOpen]);

  const allTopLevelNodes = bookmarks
    ? normalizeBookmarkNodes([
        ...bookmarks.roots.bookmark_bar.children,
        ...bookmarks.roots.other.children,
      ])
    : [];

  const bookmarkBarNodes = bookmarks
    ? normalizeBookmarkNodes(bookmarks.roots.bookmark_bar.children).filter(
        (node): node is BookmarkUrlNode => node.type === "url"
      )
    : [];

  const bookmarkFolderOptions: BookmarkFolderOption[] = (() => {
    if (!bookmarks) return [];
    const options: BookmarkFolderOption[] = [];
    const pushFolderOptions = (nodes: BookmarkNode[], parentLabel: string) => {
      for (const node of normalizeBookmarkNodes(nodes)) {
        if (node.type !== "folder") continue;
        const label = `${parentLabel} / ${node.name}`;
        options.push({ id: node.id, label });
        pushFolderOptions(node.children, label);
      }
    };
    options.push({ id: bookmarks.roots.bookmark_bar.id, label: bookmarks.roots.bookmark_bar.name });
    pushFolderOptions(bookmarks.roots.bookmark_bar.children, bookmarks.roots.bookmark_bar.name);
    options.push({ id: bookmarks.roots.other.id, label: bookmarks.roots.other.name });
    pushFolderOptions(bookmarks.roots.other.children, bookmarks.roots.other.name);
    return options;
  })();

  const renderDropdownNodes = (nodes: BookmarkNode[], depth = 0): ReactNode => {
    return normalizeBookmarkNodes(nodes).map((node) => {
      if (node.type === "folder") {
        return (
          <div key={node.id} className="space-y-1">
            <div
              className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground"
              style={{ marginLeft: `${depth * 10}px` }}
            >
              <Folder className="h-3.5 w-3.5" />
              <span className="truncate">{node.name}</span>
            </div>
            {node.children.length > 0 ? (
              renderDropdownNodes(node.children, depth + 1)
            ) : (
              <div className="px-2 py-1 text-xs text-muted-foreground" style={{ marginLeft: `${(depth + 1) * 10}px` }}>
                Empty
              </div>
            )}
          </div>
        );
      }
      return (
        <button
          key={node.id}
          type="button"
          onClick={() => {
            void openBookmarkUrl(node);
          }}
          className="flex w-full items-center rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
          style={{ marginLeft: `${depth * 10}px` }}
        >
          <span className="truncate">{node.name}</span>
        </button>
      );
    });
  };

  const renderManagerNodes = (nodes: BookmarkNode[], parentId: string, depth = 0): ReactNode => {
    return normalizeBookmarkNodes(nodes).map((node) => {
      return (
        <div key={node.id} className="space-y-1">
          <div className="flex items-center gap-2 rounded border border-border/70 px-2 py-1">
            <div style={{ marginLeft: `${depth * 14}px` }} className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="truncate text-xs text-foreground">{node.name}</span>
            </div>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted"
              onClick={() => {
                openManagerEditDialog(node, parentId);
              }}
              title="Edit"
              aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-destructive hover:bg-destructive/10"
              onClick={() => {
                void deleteNode(node.id);
              }}
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {node.type === "folder" && node.children.length > 0 ? renderManagerNodes(node.children, node.id, depth + 1) : null}
        </div>
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div className="grid grid-cols-[1fr_minmax(0,720px)_1fr] items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 truncate">
            <button
              type="button"
              onClick={() => setBookmarksBarVisible((visible) => !visible)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-foreground hover:border-border hover:bg-muted"
              aria-label={bookmarksBarVisible ? "Hide bookmarks bar" : "Show bookmarks bar"}
              title={bookmarksBarVisible ? "Hide bookmarks bar" : "Show bookmarks bar"}
            >
              <Globe className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={navigateBack}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-foreground hover:border-border hover:bg-muted"
              aria-label={t("editor:browser.back")}
              title={t("editor:browser.back")}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={navigateForward}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-foreground hover:border-border hover:bg-muted"
              aria-label={t("editor:browser.forward")}
              title={t("editor:browser.forward")}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={reloadPage}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-foreground hover:border-border hover:bg-muted"
              aria-label={t("editor:browser.reload")}
              title={t("editor:browser.reload")}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={addressValue}
              onChange={(event) => setAddressValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const nextUrl = normalizeEnteredUrl(addressValue);
                setAppMode("browse", nextUrl);
                setAddressValue(toAddressBarValue(nextUrl));
              }}
              placeholder={t("editor:browser.noUrl")}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring"
            />
              <button
                type="button"
                onClick={openBookmarkDialog}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-foreground hover:border-border hover:bg-muted"
                title="Save bookmark"
                aria-label="Save bookmark"
              >
              <Bookmark className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                void setElectronOverlayVisibility(false).then(() => {
                  setManagerOpen(true);
                });
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-foreground hover:border-border hover:bg-muted"
              title="Bookmark manager"
              aria-label="Bookmark manager"
            >
              <BookMarked className="h-4 w-4" />
            </button>
            <button
              ref={bookmarksTriggerRef}
              type="button"
              onClick={() => {
                void openBookmarksNativeMenu();
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-foreground hover:border-border hover:bg-muted"
              title="Bookmarks"
              aria-label="Bookmarks"
              aria-expanded={bookmarksMenuOpen}
            >
              <Icon iconNode={folderBookmarkIconNode} className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={openTagsCloud}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-foreground hover:border-border hover:bg-muted"
              title="Tags"
              aria-label="Tags"
            >
              <Tags className="h-4 w-4" />
            </button>
            
            {/* Pinned Extensions */}
            {extensions.filter(ext => ext.enabled !== false && ext.pinned).map(ext => (
              <button
                key={ext.id}
                type="button"
                onClick={(e) => handleRunExtension(ext, e)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-foreground hover:border-border hover:bg-muted"
                title={ext.name}
                aria-label={ext.name}
              >
                {ext.iconDataUrl ? (
                  <img src={ext.iconDataUrl} alt="" className="w-4 h-4 object-contain" />
                ) : (
                  <Blocks className="h-4 w-4" />
                )}
              </button>
            ))}

            {/* Extensions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-foreground hover:border-border hover:bg-muted cursor-pointer"
                title="Extensions"
                aria-label="Extensions"
              >
                <Blocks className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {extensions.filter(ext => ext.enabled !== false).length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">No extensions enabled</div>
                ) : (
                  extensions.filter(ext => ext.enabled !== false).map(ext => (
                    <div key={ext.id} className="flex items-center justify-between px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm group">
                      <button
                        type="button"
                        onClick={(e) => handleRunExtension(ext, e)}
                        className="flex items-center gap-2 flex-1 overflow-hidden text-left cursor-pointer focus:outline-none"
                      >
                        {ext.iconDataUrl ? (
                          <img src={ext.iconDataUrl} alt="" className="w-4 h-4 object-contain shrink-0" />
                        ) : (
                          <Blocks className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{ext.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleExtensionPin(ext);
                        }}
                        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 p-1 hover:bg-muted rounded text-muted-foreground"
                        title={ext.pinned ? "Unpin extension" : "Pin extension"}
                      >
                        {ext.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex justify-end gap-2">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("editor:browser.openExternally")}
              </a>
            ) : null}
          </div>
        </div>
        {bookmarksBarVisible ? (
          <div className="border-b border-border/70 bg-background/80 px-4 py-1.5">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {bookmarkBarNodes.length > 0 ? (
                bookmarkBarNodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => {
                      void openBookmarkUrl(node);
                    }}
                    className="inline-flex h-7 max-w-55 shrink-0 items-center rounded-md border border-transparent px-2 text-xs text-foreground hover:border-border hover:bg-muted"
                    title={node.name}
                    aria-label={node.name}
                  >
                    <span className="truncate">{node.name}</span>
                  </button>
                ))
              ) : (
                <div className="px-1 text-xs text-muted-foreground">No bookmarks in Bookmarks bar</div>
              )}
            </div>
          </div>
        ) : null}
        <div ref={containerRef} className="relative flex-1 min-h-0">
          {browserMode === "iframe" ? (
            <>
              <iframe
                key={`${url || "about:blank"}:${iframeReloadKey}`}
                ref={iframeRef}
                title={t("editor:browser.openExternally")}
                src={url || "about:blank"}
                onLoad={() => {
                  iframeLoadedTokenRef.current = iframeLoadTokenRef.current;
                }}
                className="h-full w-full border-0 bg-white"
                sandbox={iframeSandbox}
              />
              {iframeFailure ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/85 p-6 text-center">
                  <div className="max-w-md rounded border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    <div>This page can’t be rendered in an iframe.</div>
                    <div className="mt-1">Use “Open externally”.</div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="h-full w-full bg-white" />
              {electronFailure ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/85 p-6 text-center">
                  <div className="max-w-xl rounded border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                    <div>This page failed to load.</div>
                    <div className="mt-1 break-all">{electronFailure}</div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      {bookmarksMenuOpen && bookmarksMenuPosition ? (
        <div
          ref={bookmarksMenuRef}
          className="fixed z-120 w-[320px] rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
          style={{ top: bookmarksMenuPosition.top, left: bookmarksMenuPosition.left }}
        >
          <div className="overflow-auto" style={{ maxHeight: `${bookmarksMenuPosition.maxHeight}px` }}>
            {bookmarksLoading ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading...</div>
            ) : allTopLevelNodes.length > 0 ? (
              renderDropdownNodes(allTopLevelNodes)
            ) : (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">No bookmarks</div>
            )}
          </div>
        </div>
      ) : null}
      <Dialog open={bookmarkDialogOpen} onOpenChange={setBookmarkDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bookmark</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Title</div>
              <input
                value={bookmarkTitle}
                onChange={(event) => setBookmarkTitle(event.target.value)}
                className="h-9 w-full rounded border border-border bg-background px-3 text-sm text-foreground"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">URL</div>
              <input
                value={bookmarkUrl}
                onChange={(event) => setBookmarkUrl(event.target.value)}
                className="h-9 w-full rounded border border-border bg-background px-3 text-sm text-foreground"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Tags</div>
              <input
                value={bookmarkTags}
                onChange={(event) => setBookmarkTags(event.target.value)}
                placeholder="tag1, tag2"
                className="h-9 w-full rounded border border-border bg-background px-3 text-sm text-foreground"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Folder</div>
              <select
                value={bookmarkParentId}
                onChange={(event) => setBookmarkParentId(event.target.value)}
                className="h-9 w-full rounded border border-border bg-background px-3 text-sm text-foreground"
              >
                {bookmarkFolderOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center rounded border border-border px-2 text-xs hover:bg-muted"
              onClick={() => {
                setBookmarkDialogOpen(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded border border-border px-2 text-xs hover:bg-muted"
              onClick={() => {
                void saveBookmarkFromDialog();
              }}
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={managerEditDialogOpen} onOpenChange={(open) => {
        setManagerEditDialogOpen(open);
        if (!open) {
          setManagerEditNodeId(null);
          setManagerOpen(true);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit bookmark</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Title</div>
              <input
                value={managerEditTitle}
                onChange={(event) => setManagerEditTitle(event.target.value)}
                className="h-9 w-full rounded border border-border bg-background px-3 text-sm text-foreground"
              />
            </div>
            {managerEditNodeType === "url" ? (
              <>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">URL</div>
                  <input
                    value={managerEditUrl}
                    onChange={(event) => setManagerEditUrl(event.target.value)}
                    className="h-9 w-full rounded border border-border bg-background px-3 text-sm text-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Tags</div>
                  <input
                    value={managerEditTags}
                    onChange={(event) => setManagerEditTags(event.target.value)}
                    placeholder="tag1, tag2"
                    className="h-9 w-full rounded border border-border bg-background px-3 text-sm text-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Folder</div>
                  <select
                    value={managerEditParentId}
                    onChange={(event) => setManagerEditParentId(event.target.value)}
                    className="h-9 w-full rounded border border-border bg-background px-3 text-sm text-foreground"
                  >
                    {bookmarkFolderOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center rounded border border-border px-2 text-xs hover:bg-muted"
              onClick={() => {
                setManagerEditDialogOpen(false);
                setManagerEditNodeId(null);
                setManagerOpen(true);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded border border-border px-2 text-xs hover:bg-muted"
              onClick={() => {
                void saveManagerEditDialog();
              }}
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bookmark manager</DialogTitle>
            <DialogDescription>Manage bookmarks and folders</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
            {bookmarks ? (
              <>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Bookmarks bar</div>
                  {bookmarks.roots.bookmark_bar.children.length > 0 ? (
                    renderManagerNodes(bookmarks.roots.bookmark_bar.children, bookmarks.roots.bookmark_bar.id)
                  ) : (
                    <div className="rounded border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">Empty</div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Other bookmarks</div>
                  {bookmarks.roots.other.children.length > 0 ? (
                    renderManagerNodes(bookmarks.roots.other.children, bookmarks.roots.other.id)
                  ) : (
                    <div className="rounded border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">Empty</div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded border border-dashed border-border px-2 py-2 text-xs text-muted-foreground">
                {bookmarksLoading ? "Loading..." : "No data"}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded border border-border px-2 text-xs hover:bg-muted"
              onClick={() => {
                void createFolder();
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              New folder
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded border border-border px-2 text-xs hover:bg-muted"
              onClick={() => {
                setManagerOpen(false);
              }}
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

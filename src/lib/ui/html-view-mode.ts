// Per-file view preference for lone .html/.htm files: render them as a live
// webpage ("preview") or show the highlighted source ("source"). Persisted in
// localStorage, keyed by path, and broadcast so an open viewer updates live
// when the choice is made from the sidebar context menu.
//
// A lone HTML file is a webpage, so it defaults to "preview" — the source is
// one click away via the viewer's toggle or the right-click menu.

export type HtmlViewMode = "preview" | "source";

const KEY = "cabinet.html-view-mode";
export const HTML_VIEW_EVENT = "cabinet:html-view-mode";

export interface HtmlViewModeDetail {
  path: string;
  mode: HtmlViewMode;
}

/** True for a path that a browser can render as a page. */
export function isHtmlPath(path: string): boolean {
  return /\.html?$/i.test(path);
}

function readMap(): Record<string, HtmlViewMode> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, HtmlViewMode>) : {};
  } catch {
    return {};
  }
}

export function getHtmlViewMode(path: string): HtmlViewMode {
  return readMap()[path] ?? "preview";
}

export function setHtmlViewMode(path: string, mode: HtmlViewMode): void {
  if (typeof window === "undefined") return;
  try {
    const map = readMap();
    map[path] = mode;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // ignore quota / parse errors — the event below still updates open viewers
  }
  window.dispatchEvent(
    new CustomEvent<HtmlViewModeDetail>(HTML_VIEW_EVENT, { detail: { path, mode } })
  );
}

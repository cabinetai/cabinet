/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

// Fan-out registries for browse-mode events pushed from the main process
// (electron/browser-views.cjs). The renderer subscribes via the bridge's
// onBrowserView* methods, which return an unsubscribe function.
const browserViewNavigateListeners = new Set();
const browserViewLoadFailedListeners = new Set();

ipcRenderer.on("cabinet:browser-view-navigated", (_event, payload) => {
  for (const listener of browserViewNavigateListeners) {
    try {
      listener(payload);
    } catch {}
  }
});

ipcRenderer.on("cabinet:browser-view-load-failed", (_event, payload) => {
  for (const listener of browserViewLoadFailedListeners) {
    try {
      listener(payload);
    } catch {}
  }
});

// Native full-screen state, pushed from main on enter/leave-full-screen and
// once on did-finish-load. `lastFullscreen` lets a late subscriber read the
// current value immediately (see onFullscreenChanged).
const fullscreenListeners = new Set();
let lastFullscreen = false;
ipcRenderer.on("cabinet:fullscreen-changed", (_event, isFull) => {
  lastFullscreen = !!isFull;
  for (const listener of fullscreenListeners) {
    try {
      listener(lastFullscreen);
    } catch {}
  }
});

function normalizeBridgeUrl(value) {
  return typeof value === "string" ? value.trim() : "";
}

contextBridge.exposeInMainWorld("CabinetDesktop", {
  runtime: "electron",
  platform: process.platform,
  // --- In-app browser ("browse mode") backed by a native WebContentsView ---
  createBrowserView: async (url) => {
    try {
      return await ipcRenderer.invoke("cabinet:create-browser-view", {
        url: normalizeBridgeUrl(url),
      });
    } catch {
      return { ok: false, error: "invoke-failed" };
    }
  },
  loadBrowserViewUrl: async (viewId, url) => {
    try {
      return await ipcRenderer.invoke("cabinet:load-browser-view-url", {
        viewId,
        url: normalizeBridgeUrl(url),
      });
    } catch {
      return { ok: false, error: "invoke-failed" };
    }
  },
  setBrowserViewBounds: (viewId, bounds) =>
    ipcRenderer.invoke("cabinet:set-browser-view-bounds", { viewId, bounds }),
  setBrowserViewVisible: (viewId, visible) =>
    ipcRenderer.invoke("cabinet:set-browser-view-visible", { viewId, visible }),
  browserViewGoBack: (viewId) =>
    ipcRenderer.invoke("cabinet:browser-view-go-back", { viewId }),
  browserViewGoForward: (viewId) =>
    ipcRenderer.invoke("cabinet:browser-view-go-forward", { viewId }),
  browserViewReload: (viewId) =>
    ipcRenderer.invoke("cabinet:browser-view-reload", { viewId }),
  showBrowserBookmarksMenu: (payload) =>
    ipcRenderer.invoke("cabinet:show-browser-bookmarks-menu", payload),
  destroyBrowserView: (viewId) =>
    ipcRenderer.invoke("cabinet:destroy-browser-view", { viewId }),
  onBrowserViewNavigated: (listener) => {
    if (typeof listener !== "function") return () => {};
    browserViewNavigateListeners.add(listener);
    return () => {
      browserViewNavigateListeners.delete(listener);
    };
  },
  onBrowserViewLoadFailed: (listener) => {
    if (typeof listener !== "function") return () => {};
    browserViewLoadFailedListeners.add(listener);
    return () => {
      browserViewLoadFailedListeners.delete(listener);
    };
  },
  /**
   * Trigger the in-app macOS uninstall flow. Returns
   * `{ ok: true, dataPath }` on success — the renderer should show a
   * confirmation toast referencing `dataPath` so the user knows their
   * cabinet content is preserved.
   */
  uninstallApp: () => ipcRenderer.invoke("cabinet:uninstall-app"),
  /**
   * Open a local file with the OS default application. Used for file://
   * links clicked in the editor (e.g. open a PDF in Preview).
   */
  openLocalFile: (filePath) => ipcRenderer.invoke("cabinet:open-local-file", { path: filePath }),
  /**
   * Open an http(s) URL in the user's SYSTEM default browser (never the in-app
   * browse view). Used for OAuth sign-in, where the embedded browser lacks the
   * user's provider session and some providers block webviews.
   */
  openExternal: (url) => ipcRenderer.invoke("cabinet:open-external", { url }),
  /**
   * The OS keyboard / input languages, most-preferred first, plus the
   * Electron app + system locale. Used on the first onboarding screen to
   * localize Cabinet out of the box. Renderer maps these BCP-47 tags onto a
   * shipped locale; an explicit user choice always wins over this.
   */
  getPreferredLanguages: () =>
    ipcRenderer.invoke("cabinet:get-preferred-languages"),
  /**
   * Open an additional desktop window scoped to a specific room/cabinet.
   * `hash` is a canonical app hash (e.g. "#/cabinet/research" or "#/home").
   * The new window reuses the running backend and binds its own room via the
   * hash route, so two windows can sit in different rooms at once.
   */
  openWindow: (hash) => ipcRenderer.invoke("cabinet:open-window", hash),
  /**
   * Subscribe to native full-screen changes (macOS hides the traffic lights in
   * full-screen). Fires immediately with the current state, then on every
   * change. Returns an unsubscribe function.
   */
  onFullscreenChanged: (listener) => {
    if (typeof listener !== "function") return () => {};
    fullscreenListeners.add(listener);
    listener(lastFullscreen);
    return () => {
      fullscreenListeners.delete(listener);
    };
  },
});

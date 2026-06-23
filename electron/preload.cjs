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

function normalizeBridgeUrl(value) {
  return typeof value === "string" ? value.trim() : "";
}

contextBridge.exposeInMainWorld("CabinetDesktop", {
  runtime: "electron",
  platform: process.platform,
  // --- In-app browser ("browse mode") backed by a native WebContentsView ---
  openLocalFile: (filePath) =>
    ipcRenderer.invoke("cabinet:open-local-file", { path: filePath }),
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
});

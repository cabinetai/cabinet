/* eslint-disable @typescript-eslint/no-require-imports */
//
// In-app browser ("browse mode") backed by Electron's native WebContentsView.
// Ported from cabinetai/cabinet PR #96. A WebContentsView is a real Chromium view,
// so unlike the iframe fallback it is NOT subject to `X-Frame-Options: DENY` /
// CSP `frame-ancestors` — sites like Google, GitHub and X load normally.
//
// The renderer (src/components/layout/browser-view.tsx) drives this over the
// `CabinetDesktop` bridge methods exposed in electron/preload.cjs. The view is
// parented to the main window's contentView and positioned/sized by the
// renderer via set-browser-view-bounds, so the React chrome (toolbar,
// bookmarks) renders around it.
//
// Browse mode loads two kinds of URLs: external web pages, and the app's own
// `/api/assets/...` KB content (opened from the viewer-toolbar Globe button or
// while browsing the tree). The latter sit behind the `kb-auth` cookie gate, so
// syncBrowserAuthCookie() copies that cookie into the browser session before
// each load.

const path = require("path");
const {
  BrowserWindow,
  WebContentsView,
  Menu,
  nativeImage,
  session,
  shell,
  ipcMain,
} = require("electron");
const { ElectronChromeExtensions } = require("electron-chrome-extensions");

const BROWSER_VIEW_PARTITION = "persist:cabinet-browser";

let extensionsManager = null;
let activeWebContents = null;
let openExtensionPanelWindow = null;

// Injected by initBrowserViews() so this module stays decoupled from main.cjs.
let getMainWindow = () => null;
let getBaseAppUrl = () => null;
let isDev = false;

const browserViews = new Map();
let nextBrowserViewId = 1;

function liveMainWindow() {
  try {
    const win = getMainWindow();
    return win && !win.isDestroyed() ? win : null;
  } catch {
    return null;
  }
}

function isMainRendererSender(event) {
  const win = liveMainWindow();
  return !!win && event.sender.id === win.webContents.id;
}

function sendBrowserViewNavigateEvent(ownerWebContentsId, viewId, url) {
  const win = liveMainWindow();
  if (!win) return;
  const wc = win.webContents;
  if (!wc || wc.id !== ownerWebContentsId || wc.isDestroyed()) return;
  try {
    wc.send("cabinet:browser-view-navigated", { viewId, url });
  } catch {}
}

function sendBrowserViewLoadFailedEvent(ownerWebContentsId, viewId, payload) {
  const win = liveMainWindow();
  if (!win) return;
  const wc = win.webContents;
  if (!wc || wc.id !== ownerWebContentsId || wc.isDestroyed()) return;
  try {
    wc.send("cabinet:browser-view-load-failed", { viewId, ...payload });
  } catch {}
}

function getBrowserSession() {
  return session.fromPartition(BROWSER_VIEW_PARTITION);
}

function getMainRendererSession() {
  const win = liveMainWindow();
  if (win) {
    const wc = win.webContents;
    if (wc && !wc.isDestroyed()) return wc.session;
  }
  return session.defaultSession;
}

function getBrowserBaseUrl() {
  const win = liveMainWindow();
  return (
    (win && win.webContents.getURL()) ||
    getBaseAppUrl() ||
    "http://127.0.0.1"
  );
}

// Report the real OS so client-sniffing sites don't misidentify Windows/Linux
// users as macOS (which can change layout, downloads, and shortcut hints).
function clientPlatformLabel() {
  switch (process.platform) {
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return "macOS";
  }
}

function userAgentPlatformToken() {
  switch (process.platform) {
    case "win32":
      return "Windows NT 10.0; Win64; x64";
    case "linux":
      return "X11; Linux x86_64";
    default:
      return "Macintosh; Intel Mac OS X 10_15_7";
  }
}

// Make Google (and other client-sniffing sites) treat the browser session as
// desktop Chrome rather than Electron, so they don't downgrade or block.
function setupBrowserSession() {
  const browserSession = getBrowserSession();

  try {
    extensionsManager = new ElectronChromeExtensions({
      session: browserSession,
      license: "GPL-3.0",
      createTab(details) {
        const url = typeof details?.url === "string" ? details.url : "";
        if (!url) return;
        if (url.startsWith("chrome-extension://")) {
          if (typeof openExtensionPanelWindow === "function") {
            openExtensionPanelWindow(url);
          }
        } else {
          if (activeWebContents && !activeWebContents.isDestroyed()) {
            activeWebContents.loadURL(url);
          }
        }
      },
      selectTab(tab) {
        let foundViewId = null;
        for (const [viewId, entry] of browserViews.entries()) {
          if (entry.view.webContents === tab) {
            foundViewId = viewId;
            break;
          }
        }
        if (foundViewId) {
          const entry = browserViews.get(foundViewId);
          if (entry && !entry.view.webContents.isDestroyed()) {
            entry.view.setVisible(true);
            activeWebContents = entry.view.webContents;
          }
        }
      },
      removeTab(tab) {
        let foundViewId = null;
        for (const [viewId, entry] of browserViews.entries()) {
          if (entry.view.webContents === tab) {
            foundViewId = viewId;
            break;
          }
        }
        if (foundViewId) {
          destroyBrowserView(foundViewId);
          const win = liveMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send("cabinet:browser-view-closed", { viewId: foundViewId });
          }
        }
      }
    });
  } catch (err) {
    console.error("[cabinet] Failed to initialize ElectronChromeExtensions:", err);
  }

  const filter = { urls: ["*://*.google.com/*"] };
  browserSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    details.requestHeaders["Sec-CH-UA"] =
      '"Google Chrome";v="136", "Chromium";v="136", "Not_A Brand";v="24"';
    details.requestHeaders["Sec-CH-UA-Mobile"] = "?0";
    details.requestHeaders["Sec-CH-UA-Platform"] = `"${clientPlatformLabel()}"`;
    details.requestHeaders["User-Agent"] =
      `Mozilla/5.0 (${userAgentPlatformToken()}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36`;
    callback({ requestHeaders: details.requestHeaders });
  });
}

// The browser session is a separate partition, so it doesn't share the main
// renderer's auth cookie. Copy the `kb-auth` cookie across before loading
// in-app `/api/assets/...` content so those requests aren't rejected by the gate.
async function syncBrowserAuthCookie() {
  const sourceSession = getMainRendererSession();
  const targetSession = getBrowserSession();
  let origin;
  try {
    origin = new URL(getBrowserBaseUrl()).origin;
  } catch {
    return;
  }
  try {
    const sourceCookies = await sourceSession.cookies.get({ url: origin, name: "kb-auth" });
    const authCookie = sourceCookies.find((cookie) => cookie && typeof cookie.value === "string");
    if (!authCookie) {
      try {
        await targetSession.cookies.remove(origin, "kb-auth");
      } catch {}
      return;
    }
    const cookieUrl = `${origin}${authCookie.path || "/"}`;
    const cookiePayload = {
      url: cookieUrl,
      name: authCookie.name,
      value: authCookie.value,
      path: authCookie.path || "/",
      secure: authCookie.secure,
      httpOnly: authCookie.httpOnly,
      sameSite: authCookie.sameSite,
    };
    if (typeof authCookie.expirationDate === "number") {
      cookiePayload.expirationDate = authCookie.expirationDate;
    }
    await targetSession.cookies.set(cookiePayload);
  } catch {}
}

function isAbortNavigationError(error) {
  if (!error || typeof error !== "object") return false;
  return error.code === "ERR_ABORTED" || error.errno === -3;
}

// Normalize a requested target to a loadable absolute URL. External URLs pass
// through; app-relative paths (incl. /api/assets KB content) resolve against the
// embedded server's base URL and load over http (the daemon always runs, so this
// works in dev and prod alike).
function resolveBrowserTarget(value) {
  if (typeof value !== "string") return { primaryUrl: null };
  const trimmed = value.trim();
  if (!trimmed) return { primaryUrl: null };
  if (trimmed === "about:blank") return { primaryUrl: trimmed };
  if (trimmed.startsWith("file://")) return { primaryUrl: trimmed };
  if (trimmed.startsWith("//")) return { primaryUrl: `https:${trimmed}` };
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    try {
      return { primaryUrl: new URL(trimmed, getBrowserBaseUrl()).toString() };
    } catch {
      return { primaryUrl: null };
    }
  }
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) return { primaryUrl: trimmed };
  return { primaryUrl: `https://${trimmed}` };
}

async function loadBrowserViewUrlSafe(webContents, nextUrl) {
  const { primaryUrl } = resolveBrowserTarget(nextUrl);
  if (!primaryUrl) {
    return {
      ok: false,
      error: "invalid-target-url",
      requestedUrl: typeof nextUrl === "string" ? nextUrl : "",
      primaryUrl: "",
      primaryError: "invalid-target-url",
    };
  }
  try {
    await webContents.loadURL(primaryUrl);
    return { ok: true, loadedUrl: primaryUrl };
  } catch (error) {
    if (isAbortNavigationError(error)) {
      return { ok: true, aborted: true, loadedUrl: primaryUrl };
    }
    return {
      ok: false,
      error: "load-failed",
      requestedUrl: typeof nextUrl === "string" ? nextUrl : "",
      primaryUrl,
      primaryError: error instanceof Error ? error.message : String(error),
    };
  }
}

function destroyBrowserView(viewId) {
  const entry = browserViews.get(viewId);
  const win = liveMainWindow();
  if (!entry || !win) {
    browserViews.delete(viewId);
    return;
  }
  if (activeWebContents === entry.view.webContents) {
    activeWebContents = null;
  }
  try {
    win.contentView.removeChildView(entry.view);
  } catch {}
  try {
    entry.view.webContents.close();
  } catch {}
  browserViews.delete(viewId);
}

function destroyAllBrowserViews() {
  for (const viewId of [...browserViews.keys()]) {
    destroyBrowserView(viewId);
  }
}

// ---------------------------------------------------------------------------
// Bookmarks context menu (native). The renderer hands us the bookmark tree and
// we pop a native menu, resolving with the chosen item's id/url.
// ---------------------------------------------------------------------------

function buildBookmarkSubmenuTemplate(items) {
  if (!Array.isArray(items)) return [];
  const template = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id : "";
    const name =
      typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Untitled";
    const type = item.type === "folder" ? "folder" : "url";
    if (type === "folder") {
      const children = buildBookmarkSubmenuTemplate(item.children);
      template.push({
        id,
        label: name,
        submenu: children.length > 0 ? children : [{ label: "Empty", enabled: false }],
      });
      continue;
    }
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!url) continue;
    template.push({ id, label: name, click: () => {} });
  }
  return template;
}

function findMenuItemById(items, id) {
  if (!Array.isArray(items) || typeof id !== "string") return null;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (item.id === id) return item;
    if (item.type === "folder") {
      const nested = findMenuItemById(item.children, id);
      if (nested) return nested;
    }
  }
  return null;
}

function applyClicksToSubmenu(submenu, items, resolveOnce) {
  if (!Array.isArray(submenu)) return [];
  return submenu.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    if (entry.submenu) {
      return {
        ...entry,
        submenu: applyClicksToSubmenu(entry.submenu, items, resolveOnce),
      };
    }
    if (!entry.id) return entry;
    return {
      ...entry,
      click: () => {
        const selected = findMenuItemById(items, entry.id);
        resolveOnce({ ok: true, id: entry.id, url: selected?.url });
      },
    };
  });
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

function registerHandlers() {
  // Open a local file with the OS default app (e.g. Preview for PDFs). file://
  // URLs can't load in a WebContentsView, so the renderer routes them here.
  ipcMain.handle("cabinet:open-local-file", async (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    try {
      const filePath = typeof payload?.path === "string" ? payload.path : "";
      if (!filePath) return { ok: false, error: "no-path" };
      const errorMessage = await shell.openPath(filePath);
      if (errorMessage) return { ok: false, error: errorMessage };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Open a URL in the user's SYSTEM default browser (not the in-app browse
  // view). Used for OAuth sign-in, where the embedded browser lacks the user's
  // provider session and some providers reject webviews. Restricted to http(s)
  // so a hostile link can't trigger file:/// or custom-scheme handlers.
  ipcMain.handle("cabinet:open-external", async (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const url = typeof payload?.url === "string" ? payload.url : "";
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: "blocked" };
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("cabinet:create-browser-view", async (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const win = liveMainWindow();
    if (!win) return { ok: false, error: "window-unavailable" };
    const initialUrl = typeof payload?.url === "string" ? payload.url.trim() : "";
    const viewId = String(nextBrowserViewId++);
    const view = new WebContentsView({
      webPreferences: {
        partition: BROWSER_VIEW_PARTITION,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "browser-preload.cjs"),
      },
    });
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    view.setVisible(false);
    view.setBackgroundColor("#00ffffff");
    if (typeof view.setBorderRadius === "function") {
      view.setBorderRadius(20);
    }

    const defaultUA = view.webContents.userAgent || "";
    view.webContents.userAgent = defaultUA
      .replace(/Electron\/[\d.]+ ?/g, "")
      .replace(/cabinet\/[\d.]+ ?/g, "");

    win.contentView.addChildView(view);
    browserViews.set(viewId, { view, ownerWebContentsId: event.sender.id });

    if (extensionsManager) {
      extensionsManager.addTab(view.webContents, win);
      extensionsManager.selectTab(view.webContents);
    }

    // Forward console messages from the browser view to the main renderer
    // so extension content-script errors are visible in the app's DevTools.
    view.webContents.on("console-message", (event) => {
      const level = event?.level;
      const message = event?.message ?? "";
      const sourceId = event?.sourceId ?? "";
      const line = event?.lineNumber ?? 0;
      const prefix = `[browser-view]`;
      const levelStr = typeof level === "string" ? level : String(level);
      if (levelStr === "error" || levelStr === "warning" || levelStr === "3" || levelStr === "2") {
        const fn = levelStr === "error" || levelStr === "3" ? console.error : console.warn;
        fn(`${prefix} ${message}`, sourceId ? `(${sourceId}:${line})` : "");
      }
    });

    view.webContents.on("did-finish-load", () => {
      const nextUrl = view.webContents.getURL();
      sendBrowserViewNavigateEvent(event.sender.id, viewId, String(nextUrl || "about:blank"));
    });
    view.webContents.on("did-navigate-in-page", (_navEvent, nextUrl) => {
      sendBrowserViewNavigateEvent(event.sender.id, viewId, String(nextUrl || "about:blank"));
    });
    view.webContents.on("did-fail-load", (_navEvent, errorCode, errorDescription, validatedUrl) => {
      if (errorCode === -3) return;
      sendBrowserViewLoadFailedEvent(event.sender.id, viewId, {
        errorCode,
        errorDescription: String(errorDescription || "load-failed"),
        validatedUrl: String(validatedUrl || ""),
      });
    });
    // Open popups/target=_blank in the same view rather than a new OS window.
    view.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
      void syncBrowserAuthCookie()
        .then(() => loadBrowserViewUrlSafe(view.webContents, nextUrl))
        .then((result) => {
          if (result?.ok) return;
          sendBrowserViewLoadFailedEvent(event.sender.id, viewId, {
            requestedUrl: typeof nextUrl === "string" ? nextUrl : "",
            primaryUrl: result?.primaryUrl || "",
            primaryError: result?.primaryError || result?.error || "load-failed",
          });
        })
        .catch(() => {});
      return { action: "deny" };
    });
    view.webContents.on("context-menu", (_menuEvent, params) => {
      const devToolsOpen = !!win && !win.isDestroyed() && win.webContents.isDevToolsOpened();
      const canInspect = isDev || devToolsOpen;
      const template = [{ role: "copy" }, { role: "paste" }, { role: "selectAll" }];
      if (canInspect) {
        template.push({ type: "separator" });
        template.push({
          label: "Inspect Element",
          click: () => {
            if (!view.webContents.isDevToolsOpened()) {
              view.webContents.openDevTools({ mode: "detach" });
            }
            view.webContents.inspectElement(params.x, params.y);
          },
        });
      }
      const menu = Menu.buildFromTemplate(template);
      const popupWindow = BrowserWindow.fromWebContents(event.sender);
      menu.popup({ window: popupWindow || undefined });
    });

    await syncBrowserAuthCookie();
    await loadBrowserViewUrlSafe(view.webContents, initialUrl);
    return { ok: true, viewId };
  });

  ipcMain.handle("cabinet:load-browser-view-url", async (event, payload) => {
    try {
      if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
      const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
      const nextUrl = typeof payload?.url === "string" ? payload.url.trim() : "";
      const entry = browserViews.get(viewId);
      if (!entry || entry.ownerWebContentsId !== event.sender.id) {
        return { ok: false, error: "not-found" };
      }
      const wc = entry.view.webContents;
      if (nextUrl === "__cabinet_nav_back__") {
        if (!wc.navigationHistory.canGoBack()) return { ok: true, skipped: true };
        wc.navigationHistory.goBack();
        return { ok: true };
      }
      if (nextUrl === "__cabinet_nav_forward__") {
        if (!wc.navigationHistory.canGoForward()) return { ok: true, skipped: true };
        wc.navigationHistory.goForward();
        return { ok: true };
      }
      if (nextUrl === "__cabinet_nav_reload__") {
        wc.reload();
        return { ok: true };
      }
      await syncBrowserAuthCookie();
      const result = await loadBrowserViewUrlSafe(wc, nextUrl);
      if (!result.ok) {
        sendBrowserViewLoadFailedEvent(event.sender.id, viewId, {
          requestedUrl: nextUrl,
          primaryUrl: result.primaryUrl || "",
          primaryError: result.primaryError || "",
        });
      }
      return result;
    } catch {
      return { ok: false, error: "handler-failed" };
    }
  });

  ipcMain.handle("cabinet:set-browser-view-bounds", (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
    const bounds = payload?.bounds;
    const entry = browserViews.get(viewId);
    if (!entry || entry.ownerWebContentsId !== event.sender.id) {
      return { ok: false, error: "not-found" };
    }
    const x = Number.isFinite(bounds?.x) ? Math.max(0, Math.round(bounds.x)) : 0;
    const y = Number.isFinite(bounds?.y) ? Math.max(0, Math.round(bounds.y)) : 0;
    const width = Number.isFinite(bounds?.width) ? Math.max(0, Math.round(bounds.width)) : 0;
    const height = Number.isFinite(bounds?.height) ? Math.max(0, Math.round(bounds.height)) : 0;
    if (width >= 64 && height >= 64) {
      entry.view.setBounds({ x, y, width, height });
    }
    return { ok: true };
  });

  ipcMain.handle("cabinet:set-browser-view-visible", (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
    const visible = payload?.visible === true;
    const entry = browserViews.get(viewId);
    if (!entry || entry.ownerWebContentsId !== event.sender.id) {
      return { ok: false, error: "not-found" };
    }
    try {
      entry.view.setVisible(visible);
      if (visible) {
        activeWebContents = entry.view.webContents;
        if (extensionsManager) {
          extensionsManager.selectTab(entry.view.webContents);
        }
      } else if (activeWebContents === entry.view.webContents) {
        activeWebContents = null;
      }
    } catch {}
    return { ok: true };
  });

  ipcMain.handle("cabinet:browser-view-go-back", async (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
    const entry = browserViews.get(viewId);
    if (!entry || entry.ownerWebContentsId !== event.sender.id) {
      return { ok: false, error: "not-found" };
    }
    const wc = entry.view.webContents;
    if (!wc.navigationHistory.canGoBack()) return { ok: true, skipped: true };
    wc.navigationHistory.goBack();
    return { ok: true };
  });

  ipcMain.handle("cabinet:browser-view-go-forward", async (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
    const entry = browserViews.get(viewId);
    if (!entry || entry.ownerWebContentsId !== event.sender.id) {
      return { ok: false, error: "not-found" };
    }
    const wc = entry.view.webContents;
    if (!wc.navigationHistory.canGoForward()) return { ok: true, skipped: true };
    wc.navigationHistory.goForward();
    return { ok: true };
  });

  ipcMain.handle("cabinet:browser-view-reload", async (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
    const entry = browserViews.get(viewId);
    if (!entry || entry.ownerWebContentsId !== event.sender.id) {
      return { ok: false, error: "not-found" };
    }
    entry.view.webContents.reload();
    return { ok: true };
  });

  ipcMain.handle("cabinet:destroy-browser-view", (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
    const entry = browserViews.get(viewId);
    if (!entry || entry.ownerWebContentsId !== event.sender.id) {
      return { ok: false, error: "not-found" };
    }
    destroyBrowserView(viewId);
    return { ok: true };
  });

  ipcMain.handle("cabinet:execute-browser-view-javascript", async (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
    const code = typeof payload?.code === "string" ? payload.code : "";
    const entry = browserViews.get(viewId);
    if (!entry || entry.ownerWebContentsId !== event.sender.id) {
      return { ok: false, error: "not-found" };
    }
    try {
      const result = await entry.view.webContents.executeJavaScript(code);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("cabinet:open-browser-view-devtools", async (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
    const entry = browserViews.get(viewId);
    if (!entry || entry.ownerWebContentsId !== event.sender.id) {
      return { ok: false, error: "not-found" };
    }
    try {
      if (!entry.view.webContents.isDevToolsOpened()) {
        entry.view.webContents.openDevTools({ mode: "detach" });
      } else {
        entry.view.webContents.closeDevTools();
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("cabinet:show-extensions-menu", async (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false, error: "window-unavailable" };

    const x = Number.isFinite(payload?.x) ? Math.max(0, Math.round(payload.x)) : 0;
    const y = Number.isFinite(payload?.y) ? Math.max(0, Math.round(payload.y)) : 0;
    const items = Array.isArray(payload?.items) ? payload.items : [];

    if (items.length === 0) return { ok: true, cancelled: true };

    return await new Promise((resolve) => {
      let resolved = false;
      const resolveOnce = (value) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      const template = items.map((item) => {
        let icon = null;
        if (item.iconDataUrl) {
          try {
            const img = nativeImage.createFromDataURL(item.iconDataUrl);
            if (!img.isEmpty()) {
              icon = img.resize({ width: 16, height: 16 });
            }
          } catch {}
        }
        return {
          label: item.name || item.id,
          ...(icon ? { icon } : {}),
          submenu: [
            {
              label: "Open",
              click: () => {
                resolveOnce({ ok: true, extensionId: item.id });
              },
            },
            { type: "separator" },
            {
              label: item.pinned ? "Unpin from toolbar" : "Pin to toolbar",
              click: () => {
                resolveOnce({ ok: true, togglePinId: item.id });
              },
            },
          ],
        };
      });

      const menu = Menu.buildFromTemplate(template);
      menu.popup({
        window: win,
        x,
        y,
        callback: () => {
          resolveOnce({ ok: true, cancelled: true });
        },
      });
    });
  });

  ipcMain.handle("cabinet:show-browser-bookmarks-menu", async (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false, error: "window-unavailable" };

    const x = Number.isFinite(payload?.x) ? Math.max(0, Math.round(payload.x)) : 0;
    const y = Number.isFinite(payload?.y) ? Math.max(0, Math.round(payload.y)) : 0;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const template = buildBookmarkSubmenuTemplate(items);

    if (template.length === 0) return { ok: true, cancelled: true };

    return await new Promise((resolve) => {
      let resolved = false;
      const resolveOnce = (value) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      const withClicks = template.map((entry) => {
        if (!entry.submenu) {
          return {
            ...entry,
            click: () => {
              const selected = findMenuItemById(items, entry.id);
              resolveOnce({ ok: true, id: entry.id, url: selected?.url });
            },
          };
        }
        return {
          ...entry,
          submenu: applyClicksToSubmenu(entry.submenu, items, resolveOnce),
        };
      });

      const menu = Menu.buildFromTemplate(withClicks);
      menu.popup({
        window: win,
        x,
        y,
        callback: () => {
          resolveOnce({ ok: true, cancelled: true });
        },
      });
    });
  });

  // Native toast popup — renders above the WebContentsView via Menu.popup(),
  // following the same pattern as the extensions/bookmarks menus.
  ipcMain.handle("cabinet:show-native-toast", async (event, payload) => {
    if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false, error: "window-unavailable" };
    showNativeToast(win, payload || {});
    return { ok: true };
  });

  // Return focus to the parent window after clicking the toast's copy button.
  ipcMain.on("cabinet:toast-refocus", (event) => {
    try {
      const senderWin = BrowserWindow.fromWebContents(event.sender);
      if (senderWin && !senderWin.isDestroyed()) {
        const parent = BrowserWindow.getAllWindows().find(
          (w) => !w.isDestroyed() && w !== senderWin && !w.isSkipTaskbar()
        );
        if (parent) parent.focus();
      }
    } catch {}
  });
}

/**
 * Show a toast popup above the BrowserView using a frameless BrowserWindow.
 * Unlike Menu.popup(), this gives full CSS control over styling and supports
 * a copy-to-clipboard button. The window is always-on-top, transparent, and
 * auto-dismisses after `durationMs` (default 4.5s).
 */
function showNativeToast(win, { kind, message, durationMs }) {
  if (!win || win.isDestroyed()) return;
  const ttl = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 4500;

  const iconColor =
    kind === "error" ? "#dc2626" :
    kind === "success" ? "#16a34a" :
    "#475569";
  const iconChar =
    kind === "error" ? "\u2715" :
    kind === "success" ? "\u2713" :
    "\u2139";

  const escapedMsg = String(message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    -webkit-user-select: none;
    user-select: none;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #f5f5f5;
    color: #333333;
    border: 1px solid #d0d0d0;
    border-radius: 8px;
    padding: 8px 12px 12px;
    font-size: 12px;
    line-height: 1.4;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    max-width: 440px;
  }
  .icon { color: ${iconColor}; font-size: 14px; flex-shrink: 0; }
  .msg { flex: 1; min-width: 0; word-break: break-word; }
  .copy-btn {
    flex-shrink: 0;
    background: none;
    border: 1px solid #bbb;
    border-radius: 4px;
    color: #666;
    cursor: pointer;
    padding: 3px 6px;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 3px;
    transition: all 0.15s;
  }
  .copy-btn:hover { background: #e8e8e8; color: #333; border-color: #999; }
  .copy-btn.copied { color: #2d9d5f; border-color: #2d9d5f; }
</style>
</head>
<body>
  <div class="toast">
    <span class="icon">${iconChar}</span>
    <span class="msg">${escapedMsg}</span>
    <button class="copy-btn" title="Copy message">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    </button>
  </div>
  <script>
    document.querySelector('.copy-btn').addEventListener('click', () => {
      try { require('electron').clipboard.writeText(${JSON.stringify(String(message))}); } catch(e) {}
      var btn = document.querySelector('.copy-btn');
      btn.classList.add('copied');
      setTimeout(function() { btn.classList.remove('copied'); }, 1500);
      // Return focus to the parent window so the toast doesn't keep it.
      try { require('electron').ipcRenderer.send('cabinet:toast-refocus'); } catch(e) {}
    });
    setTimeout(() => { window.close(); }, ${ttl});
  </script>
</body>
</html>`;

  const TOAST_WIDTH = 460;
  const TOAST_HEIGHT = 48;

  const [mw, mh] = win.getContentSize();
  const [px, py] = win.getPosition();
  const x = px + Math.max(0, Math.round((mw - TOAST_WIDTH) / 2));
  const y = py + Math.max(0, Math.round(mh - TOAST_HEIGHT - 16));

  const toastWin = new BrowserWindow({
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    hiddenInMissionControl: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  toastWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  toastWin.showInactive();

  // Close if the parent window closes
  if (win && !win.isDestroyed()) {
    win.once("closed", () => {
      try { toastWin.destroy(); } catch {}
    });
  }
}

/**
 * Wire up the native browse-mode handlers. Call once after `app` is ready.
 * @param {object} opts
 * @param {() => Electron.BrowserWindow | null} opts.getMainWindow resolver for
 *   the window the browser views attach to.
 * @param {() => string | null} [opts.getBaseAppUrl] resolver for the embedded
 *   server base URL, used to load app-relative /api/assets content.
 * @param {boolean} [opts.isDev] enables the "Inspect Element" context menu item.
 */
function initBrowserViews(opts) {
  getMainWindow = opts?.getMainWindow ?? (() => null);
  getBaseAppUrl = opts?.getBaseAppUrl ?? (() => null);
  isDev = opts?.isDev === true;
  openExtensionPanelWindow = opts?.openExtensionPanelWindow ?? (() => null);
  setupBrowserSession();
  registerHandlers();
}

function getExtensionsManager() {
  return extensionsManager;
}

module.exports = { initBrowserViews, destroyAllBrowserViews, getExtensionsManager };

/* eslint-disable @typescript-eslint/no-require-imports */
//
// In-app browser ("browse mode") backed by Electron's native WebContentsView.
// Ported from hilash/cabinet PR #96. A WebContentsView is a real Chromium view,
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
  session,
  shell,
  ipcMain,
} = require("electron");

const BROWSER_VIEW_PARTITION = "persist:cabinet-browser";

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

    const defaultUA = view.webContents.userAgent || "";
    view.webContents.userAgent = defaultUA
      .replace(/Electron\/[\d.]+ ?/g, "")
      .replace(/cabinet\/[\d.]+ ?/g, "");

    win.contentView.addChildView(view);
    browserViews.set(viewId, { view, ownerWebContentsId: event.sender.id });

    view.webContents.on("did-navigate", (_navEvent, nextUrl) => {
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
        if (!wc.canGoBack()) return { ok: true, skipped: true };
        wc.goBack();
        return { ok: true };
      }
      if (nextUrl === "__cabinet_nav_forward__") {
        if (!wc.canGoForward()) return { ok: true, skipped: true };
        wc.goForward();
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
    if (!wc.canGoBack()) return { ok: true, skipped: true };
    wc.goBack();
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
    if (!wc.canGoForward()) return { ok: true, skipped: true };
    wc.goForward();
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
  setupBrowserSession();
  registerHandlers();
}

module.exports = { initBrowserViews, destroyAllBrowserViews };

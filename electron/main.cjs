/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const { app, BrowserWindow, dialog, autoUpdater, ipcMain, WebContentsView, session, shell, webContents } = require("electron");
const { updateElectronApp } = require("update-electron-app");
const JSZip = require("jszip");
const {
  initBrowserViews,
  destroyAllBrowserViews,
  getExtensionsManager,
} = require("./browser-views.cjs");

if (require("electron-squirrel-startup")) {
  app.quit();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// BackForwardCache is known to crash the browser process (SIGSEGV) in
// Electron when navigating back/forward on pages where MV3 extension
// content scripts are injected. Disable it until upstream fixes land.
app.commandLine.appendSwitch("disable-features", "BackForwardCache");

const isDev = !app.isPackaged;

const userDataDir = app.getPath("userData");
const cabinetConfigPath = path.join(userDataDir, "cabinet-config.json");
const legacyDataDir = path.join(userDataDir, "cabinet-data");

function defaultUserVisibleDataDir() {
  // User-visible default: Cabinet stores user-owned content, so we put it
  // where users can find and back it up — not in hidden app-data dirs.
  // macOS/Windows → ~/Documents/Cabinet; Linux → ~/Cabinet (Linux distros
  // vary on whether ~/Documents exists; home-root is safer).
  const home = app.getPath("home");
  if (process.platform === "darwin" || process.platform === "win32") {
    return path.join(home, "Documents", "Cabinet");
  }
  return path.join(home, "Cabinet");
}

function readPersistedDataDir() {
  try {
    const raw = fs.readFileSync(cabinetConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.dataDir === "string" && parsed.dataDir.trim()) {
      return parsed.dataDir.trim();
    }
  } catch {
    // missing/invalid is fine
  }
  return null;
}

function writePersistedDataDir(dir) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync(cabinetConfigPath, "utf8")) || {};
    } catch {
      // start fresh
    }
    existing.dataDir = dir;
    fs.writeFileSync(cabinetConfigPath, JSON.stringify(existing, null, 2), "utf8");
  } catch {
    // best-effort
  }
}

function readPersistedExtensions() {
  try {
    const raw = fs.readFileSync(cabinetConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.extensions)) {
      return parsed.extensions;
    }
  } catch {
    // missing/invalid is fine
  }
  return [];
}

function writePersistedExtensions(extensions) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync(cabinetConfigPath, "utf8")) || {};
    } catch {
      // start fresh
    }
    existing.extensions = extensions;
    fs.writeFileSync(cabinetConfigPath, JSON.stringify(existing, null, 2), "utf8");
  } catch {
    // best-effort
  }
}

function readPersistedAppPort() {
  try {
    const raw = fs.readFileSync(cabinetConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    const port = parsed?.appPort;
    if (
      typeof port === "number" &&
      Number.isInteger(port) &&
      port > 0 &&
      port < 65536
    ) {
      return port;
    }
  } catch {
    // missing/invalid is fine
  }
  return null;
}

function persistAppPort(port) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync(cabinetConfigPath, "utf8")) || {};
    } catch {
      // start fresh
    }
    existing.appPort = port;
    fs.writeFileSync(cabinetConfigPath, JSON.stringify(existing, null, 2), "utf8");
  } catch {
    // best-effort
  }
}

function dirHasContent(dir) {
  try {
    const entries = fs.readdirSync(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

function resolveManagedDataDir() {
  // 1) Persisted choice wins.
  const persisted = readPersistedDataDir();
  if (persisted) return persisted;

  // 2) Silent-accept v0.4.3-and-earlier installs that already have data at
  //    the legacy <userData>/cabinet-data location. Migrate the config so
  //    next launch uses the persisted-choice path, but never move the bytes.
  if (dirHasContent(legacyDataDir)) {
    writePersistedDataDir(legacyDataDir);
    return legacyDataDir;
  }

  // 3) New install — use the user-visible default.
  const fresh = defaultUserVisibleDataDir();
  writePersistedDataDir(fresh);
  return fresh;
}

const managedDataDir = resolveManagedDataDir();

// `managedDataDir` is the PARENT data folder; the active cabinet is a root folder
// directly beneath it (Obsidian-style). Content (cabinets, agents, assets)
// lives under the cabinet, while shared state (.home, .cabinet-state, bookmarks)
// stays at the parent. The active cabinet name is persisted by the server in
// .home/home.json — read it here so asset deep-link resolution targets the
// same content root the server serves from. Falls back to "Cabinet".
const DEFAULT_CABINET_NAME = "Cabinet";

function resolveContentDir() {
  try {
    const homePath = path.join(managedDataDir, ".home", "home.json");
    const raw = fs.readFileSync(homePath, "utf8");
    const parsed = JSON.parse(raw);
    const activeVal = parsed ? (parsed.activeCabinet || parsed.activeVault) : null;
    const name = typeof activeVal === "string" && activeVal.trim()
      ? activeVal.trim()
      : DEFAULT_CABINET_NAME;
    return path.join(managedDataDir, name);
  } catch {
    return path.join(managedDataDir, DEFAULT_CABINET_NAME);
  }
}

// Diagnostic logging: console capture + crash markers into
// <dataDir>/.cabinet-state/logs/electron.log (LOGGING_AND_FILE_HISTORY_PRD §3).
try {
  require("./logger.cjs").initElectronLogging(managedDataDir);
} catch (err) {
  console.error("electron: initElectronLogging failed", err);
}

const updateStatusPath = path.join(managedDataDir, ".cabinet-state", "update-status.json");
let mainWindow = null;
let backendChildren = [];
// Base app URL (origin) of the embedded/dev Cabinet app. Captured the first
// time we create a window so secondary windows (multi-window rooms) can be
// spawned at `${baseAppUrl}${hash}` without re-bootstrapping the backend.
let baseAppUrl = null;
const DEV_APP_DISCOVERY_TIMEOUT_MS = 45_000;
const BROWSER_VIEW_PARTITION = "persist:cabinet-browser";
function getBrowserSession() {
  return session.fromPartition(BROWSER_VIEW_PARTITION);
}

function parseBrowserExtensions() {
  const raw = process.env.CABINET_CHROME_EXTENSIONS;
  if (!raw || !raw.trim()) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const runtimeExtensionIds = new Map();

/**
 * Patch extension JS files to replace unsupported Chrome APIs with
 * fallbacks that work in Electron:
 * - chrome.tabs.create({ url }) → window.open(url)
 * - chrome.sidePanel.open({ windowId }) → window.open(chrome.runtime.getURL('sidepanel/panel.html'))
 * - chrome.windows.getCurrent() → Promise.resolve({ id: 0 })
 * - chrome.windows.create({ url, ... }) → window.open(url)
 * - chrome.offscreen.* → no-op stubs
 * - chrome.tabCapture.* → stubs that reject gracefully
 */
function patchExtensionUnsupportedApis(extensionPath) {
  try {
    const allFiles = fs.readdirSync(extensionPath, { recursive: true });
    let patched = 0;

    // Read the manifest to find the side panel path, content scripts, and
    // background/service worker files so they receive our API stub wrapper.
    let defaultPanelPath = "sidepanel/panel.html";
    let contentScriptFiles = new Set();
    let backgroundFiles = new Set();
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, "manifest.json"), "utf8"));
      const sp = manifest.side_panel || manifest.__cabinet_side_panel;
      if (sp && typeof sp.default_path === "string") defaultPanelPath = sp.default_path;
      for (const cs of manifest.content_scripts || []) {
        for (const js of cs.js || []) contentScriptFiles.add(js.replace(/^\.\//, ""));
      }
      const bg = manifest.background;
      if (bg) {
        if (typeof bg.service_worker === "string") {
          backgroundFiles.add(bg.service_worker.replace(/^\.\//, ""));
        }
        for (const js of bg.scripts || []) {
          if (typeof js === "string") backgroundFiles.add(js.replace(/^\.\//, ""));
        }
      }
      if (backgroundFiles.size > 0) {
        console.log(`[cabinet] detected ${backgroundFiles.size} background file(s): ${Array.from(backgroundFiles).join(", ")}`);
      }
    } catch (e) {
      console.warn(`[cabinet] could not parse manifest.json: ${e?.message || e}`);
    }

    // A stub preamble that safely overrides unsupported chrome APIs.
    // This runs before any extension code, so all references to these APIs
    // will use our stubs instead of Electron's potentially-crashing native bindings.
    const STUB_PREAMBLE = `
;(function(){
  var nativeChrome = (typeof globalThis !== 'undefined' ? globalThis.chrome : undefined) || (typeof window !== 'undefined' ? window.chrome : undefined) || (typeof self !== 'undefined' ? self.chrome : undefined);
  if (!nativeChrome) return;
  if (nativeChrome.__cabinet_wrapped) return;

  var stubbedChrome = Object.create(nativeChrome);
  Object.defineProperty(stubbedChrome, "__cabinet_wrapped", {
    value: true,
    enumerable: false,
    configurable: true
  });

  // chrome.sidePanel — not supported. Track per-tab panel paths set via
  // setOptions so open() can navigate to the right page.
  var __cabinetPanelPaths = {};
  var __cabinetDefaultPanelPath = ${JSON.stringify(defaultPanelPath)};
  stubbedChrome.sidePanel = stubbedChrome.sidePanel || {};
  stubbedChrome.sidePanel.open = stubbedChrome.sidePanel.open || function(opts) {
    var tabId = opts && typeof opts.tabId === 'number' ? opts.tabId : undefined;
    var p = (tabId !== undefined && __cabinetPanelPaths[tabId]) || __cabinetDefaultPanelPath;
    var url = stubbedChrome.runtime.getURL(p);
    console.log("__cabinet_open_panel__:" + url);
    return Promise.resolve();
  };
  stubbedChrome.sidePanel.setOptions = stubbedChrome.sidePanel.setOptions || function(opts) {
    try {
      if (opts && typeof opts.tabId === 'number' && typeof opts.path === 'string') {
        __cabinetPanelPaths[opts.tabId] = opts.path;
      }
    } catch(e) {}
    return Promise.resolve();
  };
  stubbedChrome.sidePanel.setPanelBehavior = stubbedChrome.sidePanel.setPanelBehavior || function() { return Promise.resolve(); };

  // chrome.tabCapture — not supported
  stubbedChrome.tabCapture = stubbedChrome.tabCapture || {};
  stubbedChrome.tabCapture.getMediaStreamId = stubbedChrome.tabCapture.getMediaStreamId || function() { return Promise.reject(new Error('tabCapture not supported')); };

  // chrome.commands — not supported
  stubbedChrome.commands = stubbedChrome.commands || {};
  stubbedChrome.commands.onCommand = stubbedChrome.commands.onCommand || { addListener: function(){}, removeListener: function(){}, hasListener: function(){ return false; } };
  stubbedChrome.commands.getAll = stubbedChrome.commands.getAll || function(cb) {
    var cmds = (stubbedChrome.runtime.getManifest && stubbedChrome.runtime.getManifest().commands) || {};
    var list = Object.keys(cmds).map(function(name) {
      return { name: name, shortcut: cmds[name].suggested_key && cmds[name].suggested_key.default || '' };
    });
    if (typeof cb === 'function') { try { cb(list); } catch(e) {} }
    return Promise.resolve(list);
  };

  // chrome.permissions — not supported
  stubbedChrome.permissions = stubbedChrome.permissions || {};
  stubbedChrome.permissions.getAll = stubbedChrome.permissions.getAll || function(cb) {
    var result = { origins: [], permissions: [] };
    if (typeof cb === 'function') { try { cb(result); } catch(e) {} }
    return Promise.resolve(result);
  };
  stubbedChrome.permissions.contains = stubbedChrome.permissions.contains || function(perm, cb) {
    var ok = false;
    if (typeof cb === 'function') { try { cb(ok); } catch(e) {} }
    return Promise.resolve(ok);
  };
  stubbedChrome.permissions.request = stubbedChrome.permissions.request || function(perm, cb) {
    var ok = true;
    if (typeof cb === 'function') { try { cb(ok); } catch(e) {} }
    return Promise.resolve(ok);
  };
  stubbedChrome.permissions.remove = stubbedChrome.permissions.remove || function(perm, cb) {
    if (typeof cb === 'function') { try { cb(true); } catch(e) {} }
    return Promise.resolve(true);
  };

  // chrome.notifications — not supported
  var __noopEvent = { addListener: function(){}, removeListener: function(){}, hasListener: function(){ return false; } };
  stubbedChrome.notifications = stubbedChrome.notifications || {};
  stubbedChrome.notifications.create = stubbedChrome.notifications.create || function(a, b, cb) {
    var callback = typeof a === 'function' ? a : (typeof b === 'function' ? b : cb);
    if (typeof callback === 'function') { try { callback(''); } catch(e) {} }
    return Promise.resolve('');
  };
  stubbedChrome.notifications.clear = stubbedChrome.notifications.clear || function(id, cb) {
    if (typeof cb === 'function') { try { cb(true); } catch(e) {} }
    return Promise.resolve(true);
  };
  stubbedChrome.notifications.update = stubbedChrome.notifications.update || function() { return Promise.resolve(false); };
  stubbedChrome.notifications.onClicked = stubbedChrome.notifications.onClicked || __noopEvent;
  stubbedChrome.notifications.onClosed = stubbedChrome.notifications.onClosed || __noopEvent;
  stubbedChrome.notifications.onButtonClicked = stubbedChrome.notifications.onButtonClicked || __noopEvent;

  // chrome.action.onClicked / chrome.browserAction.onClicked — Electron
  // doesn't fire these from Cabinet's custom toolbar. Capture listeners so
  // the main process can trigger them via self.__cabinetTriggerActionClick(tab).
  var __cabinetActionListeners = [];
  function __cabinetWrapActionEvent(evt) {
    if (!evt) return;
    var listeners = evt.listeners || [];
    var origAdd = evt.addListener ? evt.addListener.bind(evt) : null;
    evt.addListener = function(listener) {
      listeners.push(listener);
      __cabinetActionListeners.push(listener);
      if (origAdd) try { origAdd(listener); } catch(e) {}
    };
    evt.listeners = listeners;
    if (!evt.removeListener) evt.removeListener = function(listener) {
      var idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
      idx = __cabinetActionListeners.indexOf(listener);
      if (idx >= 0) __cabinetActionListeners.splice(idx, 1);
    };
  }
  stubbedChrome.action = stubbedChrome.action || {};
  stubbedChrome.browserAction = stubbedChrome.browserAction || {};
  stubbedChrome.action.onClicked = stubbedChrome.action.onClicked || { addListener: function(){}, listeners: [] };
  stubbedChrome.browserAction.onClicked = stubbedChrome.browserAction.onClicked || { addListener: function(){}, listeners: [] };
  __cabinetWrapActionEvent(stubbedChrome.action.onClicked);
  __cabinetWrapActionEvent(stubbedChrome.browserAction.onClicked);

  self.__cabinetTriggerActionClick = function(tab) {
    for (var i = 0; i < __cabinetActionListeners.length; i++) {
      try { __cabinetActionListeners[i](tab); } catch(e) { console.error(e); }
    }
  };

  // Service-worker keepalive — periodic extension API call resets the idle timer.
  if (typeof window === 'undefined' && stubbedChrome.runtime && stubbedChrome.runtime.getPlatformInfo) {
    try {
      setInterval(function() {
        try { stubbedChrome.runtime.getPlatformInfo(function(){ void stubbedChrome.runtime.lastError; }); } catch(e) {}
      }, 20000);
    } catch(e) {}
  }

  try {
    Object.defineProperty(globalThis, 'chrome', {
      value: stubbedChrome,
      writable: true,
      configurable: true,
      enumerable: true
    });
  } catch(e) {
    try { globalThis.chrome = stubbedChrome; } catch(e) {}
  }
  try {
    Object.defineProperty(globalThis, 'browser', {
      value: globalThis.browser || stubbedChrome,
      writable: true,
      configurable: true,
      enumerable: true
    });
  } catch(e) {
    try { globalThis.browser = globalThis.browser || stubbedChrome; } catch(e) {}
  }
})();
`;

    for (const relPath of allFiles) {
      const fullPath = path.join(extensionPath, String(relPath));
      if (!fullPath.endsWith(".js") && !fullPath.endsWith(".mjs") && !fullPath.endsWith(".cjs")) continue;
      if (!fs.existsSync(fullPath)) continue;
      let content = fs.readFileSync(fullPath, "utf8");

      const normalizedRel = String(relPath).replace(/\\/g, "/");
      const isBackground = backgroundFiles.has(normalizedRel);
      const isContentScript = contentScriptFiles.has(normalizedRel);
      const needsStub =
        isContentScript ||
        isBackground ||
        content.includes("chrome.sidePanel") ||
        content.includes("browser.sidePanel") ||
        content.includes("chrome.tabCapture") ||
        content.includes("browser.tabCapture") ||
        content.includes("chrome.commands") ||
        content.includes("browser.commands") ||
        content.includes("chrome.permissions") ||
        content.includes("browser.permissions") ||
        content.includes("chrome.notifications") ||
        content.includes("browser.notifications") ||
        content.includes("chrome.action.onClicked") ||
        content.includes("browser.action.onClicked") ||
        content.includes("chrome.browserAction.onClicked") ||
        content.includes("browser.browserAction.onClicked");

      if (isContentScript || isBackground) {
        console.log(`[cabinet] detected ${isContentScript ? "content script" : "background"} file: ${normalizedRel}`);
      }

      if (!needsStub) continue;

      const STUB_VERSION = "v17";
      const beginMarker = "// __cabinet_api_stubs_begin__";
      const endMarker = "// __cabinet_api_stubs_end__";
      const versionMarker = `// __cabinet_api_stubs_${STUB_VERSION}__`;

      // Already patched with the current version
      if (content.includes(versionMarker)) continue;

      console.log(`[cabinet] patching ${relPath} (reason: ${isBackground ? "background file" : isContentScript ? "content script" : "uses unsupported APIs"})`);

      // Strip any older stub block (marker-delimited)
      const beginIdx = content.indexOf(beginMarker);
      const endIdx = content.indexOf(endMarker);
      if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
        content = content.slice(0, beginIdx) + content.slice(endIdx + endMarker.length);
      } else if (content.includes("__cabinet_api_stubs__")) {
        // Legacy v1 stub without end marker — cannot strip safely; skip and
        // let the extension be reinstalled fresh instead.
        console.warn(`[cabinet] ${relPath} has legacy stubs; reinstall the extension to update`);
        continue;
      }

      content = `${beginMarker}\n${versionMarker}\n${STUB_PREAMBLE}\n${endMarker}\n${content}`;
      fs.writeFileSync(fullPath, content, "utf8");
      patched++;
      console.log(`[cabinet] prepended API stubs (${STUB_VERSION}) to ${relPath}`);
    }
    if (patched > 0) {
      console.log(`[cabinet] patched ${patched} file(s) in ${extensionPath}`);
    }
  } catch (e) {
    console.warn(`[cabinet] could not patch unsupported APIs in ${extensionPath}:`, e?.message || e);
  }
}

/**
 * Strip unsupported permissions and manifest keys from the extension's
 * manifest.json before loading. Electron may crash (SIGSEGV) when it
 * encounters permissions like `sidePanel`, `tabCapture`, or `offscreen`
 * that it doesn't recognise.
 */
function patchExtensionManifest(extensionPath) {
  try {
    const manifestPath = path.join(extensionPath, "manifest.json");
    if (!fs.existsSync(manifestPath)) return;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    let modified = false;

    // Remove unsupported permissions
    const unsupportedPerms = ["sidePanel", "tabCapture", "offscreen", "notifications"];
    if (Array.isArray(manifest.permissions)) {
      const before = manifest.permissions.length;
      manifest.permissions = manifest.permissions.filter((p) => !unsupportedPerms.includes(p));
      if (manifest.permissions.length !== before) modified = true;
    }

    // Grant the `tabs` permission: in Electron, extensions relying on
    // `activeTab` never get tab URLs from chrome.tabs.query (activeTab's
    // click-time grant is not implemented), which breaks extensions that
    // need to identify the current page (e.g. MindStudio).
    if (Array.isArray(manifest.permissions) && manifest.permissions.includes("activeTab") && !manifest.permissions.includes("tabs")) {
      manifest.permissions.push("tabs");
      modified = true;
    }

    // Remove unsupported manifest keys (preserve the panel path for our stubs)
    if (manifest.side_panel) {
      manifest.__cabinet_side_panel = manifest.side_panel;
      delete manifest.side_panel;
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
      console.log(`[cabinet] stripped unsupported permissions/keys from manifest in ${extensionPath}`);
    }
  } catch (e) {
    console.warn(`[cabinet] could not patch manifest in ${extensionPath}:`, e?.message || e);
  }
}

async function loadBrowserExtensions() {
  const extensionPaths = parseBrowserExtensions();
  
  const persisted = readPersistedExtensions();
  for (const ext of persisted) {
    if (ext.enabled === false) continue;
    if (ext.path && !extensionPaths.includes(ext.path)) {
      extensionPaths.push(ext.path);
    }
  }

  if (extensionPaths.length === 0) return;
  const browserSession = getBrowserSession();

  for (const extensionPath of extensionPaths) {
    try {
      // Patch unsupported Chrome APIs before loading
      patchExtensionManifest(extensionPath);
      patchExtensionUnsupportedApis(extensionPath);
      // session.loadExtension is deprecated, fallback to session.extensions.loadExtension if available
      let ext;
      if (browserSession.extensions && browserSession.extensions.loadExtension) {
        ext = await browserSession.extensions.loadExtension(extensionPath, { allowFileAccess: true });
      } else {
        ext = await browserSession.loadExtension(extensionPath, { allowFileAccess: true });
      }
      runtimeExtensionIds.set(extensionPath, ext.id);
      console.log(`[cabinet] loaded browser extension: ${extensionPath} (Runtime ID: ${ext.id})`);
    } catch (error) {
      console.error(`[cabinet] failed to load browser extension: ${extensionPath}`);
      console.error(error);
    }
  }

  // Backfill contentScriptMatches, optionsPage, and popupHtml for extensions
  // installed before these fields were added to the persisted data.
  let updated = false;
  for (const ext of persisted) {
    if (!ext.path) continue;
    const manifestPath = path.join(ext.path, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    let manifest = null;
    function getManifest() {
      if (!manifest) {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        } catch {}
      }
      return manifest;
    }

    // Backfill contentScriptMatches
    if (!ext.contentScriptMatches) {
      const m = getManifest();
      if (m) {
        const matches = [];
        if (Array.isArray(m.content_scripts)) {
          for (const cs of m.content_scripts) {
            if (Array.isArray(cs.matches)) {
              for (const match of cs.matches) {
                if (typeof match === "string" && !matches.includes(match)) {
                  matches.push(match);
                }
              }
            }
          }
        }
        ext.contentScriptMatches = matches;
        updated = true;
      }
    }

    // Backfill optionsPage
    if (ext.optionsPage === undefined) {
      const m = getManifest();
      if (m) {
        ext.optionsPage = m.options_page || m.options_ui?.page || null;
        updated = true;
      }
    }

    // Backfill popupHtml
    if (ext.popupHtml === undefined) {
      const m = getManifest();
      if (m) {
        ext.popupHtml = m.action?.default_popup || m.browser_action?.default_popup || null;
        updated = true;
      }
    }
  }
  if (updated) writePersistedExtensions(persisted);
}

/** The primary window if it still exists and isn't destroyed, else null. */
function liveMainWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

/** Any live (non-destroyed) app window, or null. Multi-window aware. */
function anyLiveWindow() {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null;
}

function getElectronInstallKind() {
  return process.platform === "win32" ? "electron-windows" : "electron-macos";
}

function getBundledNodeBinaryName() {
  return process.platform === "win32" ? "node.exe" : "node";
}

function writeUpdateStatus(status) {
  fs.mkdirSync(path.dirname(updateStatusPath), { recursive: true });
  fs.writeFileSync(updateStatusPath, JSON.stringify(status, null, 2), "utf8");
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }
        reject(new Error("Could not allocate a loopback port."));
      });
    });
    server.on("error", reject);
  });
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

// Chromium scopes localStorage/IndexedDB/cookies by origin, and the port is
// part of the origin. A fresh random port every launch means a fresh empty
// storage bucket every launch, so the user's theme, locale, and other
// persisted UI state silently reset. Reuse the last app port so the renderer
// origin stays stable across launches; only allocate (and persist) a new port
// if the previous one is taken. The single-instance lock means the only
// realistic contender is an unrelated process, so this is stable in practice.
async function getStableAppPort() {
  const persisted = readPersistedAppPort();
  if (persisted && (await isPortAvailable(persisted))) {
    return persisted;
  }
  const fresh = await getFreePort();
  persistAppPort(fresh);
  return fresh;
}

async function waitForHealth(url, timeoutMs = 45_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`Timed out waiting for Cabinet at ${url}`);
}

async function checkHealth(url, timeoutMs = 1200) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Backends are restart-by-exit: the in-app Restart button (and any crash)
// just ends the child process, and this respawn logic brings it back on the
// same ports/env. `meta` carries the respawn identity; a child that lived
// under a minute counts toward a crash-loop, and after 5 consecutive quick
// deaths we stop trying so a broken backend can't spin forever.
let backendsQuitting = false;

function spawnBackend(command, args, env, meta) {
  const child = spawn(command, args, {
    env,
    stdio: "inherit",
  });
  backendChildren.push(child);
  const spawnedAt = Date.now();
  child.on("exit", () => {
    backendChildren = backendChildren.filter((c) => c !== child);
    if (backendsQuitting || !meta) {
      return;
    }
    meta.quickDeaths = Date.now() - spawnedAt > 60_000 ? 0 : (meta.quickDeaths || 0) + 1;
    if (meta.quickDeaths >= 5) {
      console.error(`electron: ${meta.name} backend is crash-looping — not respawning`);
      return;
    }
    console.warn(`electron: ${meta.name} backend exited — respawning`);
    setTimeout(() => {
      if (backendsQuitting) {
        return;
      }
      spawnBackend(command, args, env, meta);
      if (meta.healthUrl) {
        // The app server serves every window; once it's back on the same
        // port, reload windows so they recover from the connection error.
        waitForHealth(meta.healthUrl)
          .then(() => {
            for (const win of BrowserWindow.getAllWindows()) {
              if (!win.isDestroyed()) {
                win.webContents.reload();
              }
            }
          })
          .catch(() => {});
      }
    }, 1000);
  });
  return child;
}

function spawnNodeBackend(args, env, meta) {
  if (isDev) {
    return spawnBackend(process.execPath, args, env, meta);
  }

  const bundledNodePath = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    ".next",
    "standalone",
    "bin",
    getBundledNodeBinaryName()
  );

  if (fs.existsSync(bundledNodePath)) {
    return spawnBackend(bundledNodePath, args, env, meta);
  }

  return spawnBackend(
    process.execPath,
    args,
    {
      ...env,
      // Fallback for older packages that do not yet bundle a standalone Node
      // runtime alongside the embedded Next.js server.
      ELECTRON_RUN_AS_NODE: "1",
    },
    meta
  );
}

function packagedStandalonePath(...parts) {
  return path.join(process.resourcesPath, "app.asar.unpacked", ".next", "standalone", ...parts);
}

/**
 * macOS Sequoia+ blocks execution of native binaries inside .app bundles.
 * Copy node-pty to a writable location outside the bundle so spawn-helper
 * can execute, and return the external node_modules path for NODE_PATH.
 */
function extractNativeModules() {
  if (process.platform !== "darwin") {
    return packagedStandalonePath(".native");
  }

  const externalModulesDir = path.join(app.getPath("userData"), "native-modules");
  const externalNodePty = path.join(externalModulesDir, "node-pty");
  const bundledNodePty = packagedStandalonePath(".native", "node-pty");

  // Check if bundled version has changed (by comparing package.json mtime)
  const bundledPkgPath = path.join(bundledNodePty, "package.json");
  const externalPkgPath = path.join(externalNodePty, "package.json");
  let needsCopy = true;

  if (fs.existsSync(externalPkgPath) && fs.existsSync(bundledPkgPath)) {
    const bundledMtime = fs.statSync(bundledPkgPath).mtimeMs;
    const externalMtime = fs.statSync(externalPkgPath).mtimeMs;
    needsCopy = bundledMtime > externalMtime;
  }

  if (needsCopy) {
    fs.rmSync(externalNodePty, { recursive: true, force: true });
    fs.mkdirSync(externalModulesDir, { recursive: true });
    fs.cpSync(bundledNodePty, externalNodePty, { recursive: true });

    // Remove quarantine flags and ad-hoc codesign native binaries so macOS allows execution
    const prebuildsDir = path.join(externalNodePty, "prebuilds", "darwin-arm64");
    for (const name of ["spawn-helper", "pty.node"]) {
      const target = path.join(prebuildsDir, name);
      if (fs.existsSync(target)) {
        try {
          execFileSync("xattr", ["-dr", "com.apple.quarantine", target]);
        } catch {}
        try {
          execFileSync("codesign", ["--force", "--sign", "-", target]);
        } catch {}
      }
    }
  }

  return externalModulesDir;
}

/**
 * Copy bundled seed content (default pages, agent library, playbooks) into the
 * managed data directory.  Merges non-destructively: existing files are never
 * overwritten so user edits survive app updates.
 */
function seedDefaultContent() {
  const seedDir = packagedStandalonePath(".seed");
  if (!fs.existsSync(seedDir)) {
    return;
  }

  const copyRecursive = (src, dest) => {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src)) {
        copyRecursive(path.join(src, entry), path.join(dest, entry));
      }
    } else if (!fs.existsSync(dest)) {
      // Only copy if the destination file doesn't already exist
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  };

  copyRecursive(seedDir, managedDataDir);
}

function ensureManagedData() {
  fs.mkdirSync(managedDataDir, { recursive: true });
  // Seed default content (pages, agent library, playbooks).
  // Non-destructive: never overwrites existing files, so user edits survive
  // and new templates from app updates are added automatically.
  seedDefaultContent();
}

function readDevAppUrlFromRuntime() {
  try {
    const runtimePath = path.join(process.cwd(), "data", ".cabinet-state", "runtime-ports.json");
    const raw = fs.readFileSync(runtimePath, "utf8");
    const parsed = JSON.parse(raw);
    const origin = parsed?.app?.origin;
    return typeof origin === "string" && origin.trim() ? origin.trim() : null;
  } catch {
    return null;
  }
}

function getDevAppCandidates() {
  const candidates = new Set();
  const explicit = process.env.ELECTRON_START_URL?.trim();
  if (explicit) {
    candidates.add(explicit.replace(/\/+$/, ""));
  }

  const runtimeUrl = readDevAppUrlFromRuntime();
  if (runtimeUrl) {
    candidates.add(runtimeUrl);
  }

  for (let port = 4000; port <= 4010; port += 1) {
    candidates.add(`http://127.0.0.1:${port}`);
    candidates.add(`http://localhost:${port}`);
  }

  return [...candidates];
}

async function resolveDevAppUrl(timeoutMs = DEV_APP_DISCOVERY_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const candidates = getDevAppCandidates();

    for (const candidate of candidates) {
      if (await checkHealth(`${candidate}/api/health`, 500)) {
        return candidate;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(
    "Timed out waiting for a local Cabinet dev app. Start `npm run dev` first."
  );
}

async function startEmbeddedCabinet() {
  if (isDev) {
    return {
      appUrl: await resolveDevAppUrl(),
    };
  }

  ensureManagedData();

  const externalModulesDir = extractNativeModules();
  const [appPort, daemonPort] = await Promise.all([
    getStableAppPort(),
    getFreePort(),
  ]);
  const appOrigin = `http://127.0.0.1:${appPort}`;
  const daemonOrigin = `http://127.0.0.1:${daemonPort}`;
  const daemonWsOrigin = `ws://127.0.0.1:${daemonPort}`;

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(appPort),
    CABINET_RUNTIME: "electron",
    CABINET_INSTALL_KIND: getElectronInstallKind(),
    CABINET_DATA_DIR: managedDataDir,
    CABINET_USER_DATA: userDataDir,
    CABINET_APP_PORT: String(appPort),
    CABINET_DAEMON_PORT: String(daemonPort),
    CABINET_APP_ORIGIN: appOrigin,
    CABINET_DAEMON_URL: daemonOrigin,
    CABINET_PUBLIC_DAEMON_ORIGIN: daemonWsOrigin,
  };

  const serverEntry = packagedStandalonePath("server.js");
  const daemonEntry = packagedStandalonePath("server", "cabinet-daemon.cjs");

  // Daemon needs NODE_PATH to find node-pty outside the .app bundle
  const daemonEnv = {
    ...env,
    NODE_PATH: [externalModulesDir, env.NODE_PATH].filter(Boolean).join(path.delimiter),
  };

  backendsQuitting = false;
  spawnNodeBackend([serverEntry], env, {
    name: "app",
    healthUrl: `${appOrigin}/api/health`,
  });
  spawnNodeBackend([daemonEntry], daemonEnv, { name: "daemon" });

  await waitForHealth(`${appOrigin}/api/health`);
  return { appUrl: appOrigin };
}

function configureAutoUpdates() {
  if (process.platform !== "darwin") {
    return;
  }

  try {
    updateElectronApp({
      repo: "cabinetai/cabinet",
      updateInterval: "4 hours",
      notifyUser: false,
    });
  } catch (error) {
    writeUpdateStatus({
      state: "failed",
      completedAt: new Date().toISOString(),
      installKind: getElectronInstallKind(),
      message: "Electron update setup failed.",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  autoUpdater.on("checking-for-update", () => {
    writeUpdateStatus({
      state: "checking",
      startedAt: new Date().toISOString(),
      installKind: getElectronInstallKind(),
      message: "Checking for a newer Cabinet desktop release...",
    });
  });

  autoUpdater.on("update-available", () => {
    writeUpdateStatus({
      state: "available",
      startedAt: new Date().toISOString(),
      installKind: getElectronInstallKind(),
      message: "A new Cabinet desktop release is downloading in the background.",
    });
  });

  autoUpdater.on("update-not-available", () => {
    writeUpdateStatus({
      state: "idle",
      completedAt: new Date().toISOString(),
      installKind: getElectronInstallKind(),
      message: "Cabinet desktop is up to date.",
    });
  });

  autoUpdater.on("error", (error) => {
    writeUpdateStatus({
      state: "failed",
      completedAt: new Date().toISOString(),
      installKind: getElectronInstallKind(),
      message: "Cabinet desktop update failed.",
      error: error instanceof Error ? error.message : String(error),
    });
  });

  autoUpdater.on("update-downloaded", async () => {
    writeUpdateStatus({
      state: "restart-required",
      completedAt: new Date().toISOString(),
      installKind: getElectronInstallKind(),
      message: "Restart Cabinet to finish applying the desktop update.",
    });

    const updateDialogOptions = {
      type: "info",
      buttons: ["Restart to update", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Cabinet update ready",
      message: "A new Cabinet desktop release is ready.",
      detail:
        "Your desktop data stays outside the app bundle, but keeping a copy is still recommended while Cabinet is moving fast.",
    };
    // Anchor to a live window. With multi-window, the original `mainWindow`
    // may be closed/destroyed; passing a destroyed window to showMessageBox
    // throws "Object has been destroyed". Fall back to any live window, else
    // show the dialog unparented.
    const dialogParent = liveMainWindow() ?? anyLiveWindow();
    const prompt = dialogParent
      ? await dialog.showMessageBox(dialogParent, updateDialogOptions)
      : await dialog.showMessageBox(updateDialogOptions);

    if (prompt.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
}

function cleanupBackends() {
  destroyAllBrowserViews();
  backendsQuitting = true;
  for (const child of backendChildren) {
    child.kill("SIGTERM");
  }
  backendChildren = [];
}

/**
 * macOS uninstall — removes the .app bundle, caches, preferences, saved
 * application state, web storage, and logs. Does NOT touch user data at
 * `~/Library/Application Support/Cabinet/cabinet-data` (the cabinet itself).
 *
 * Spawns a detached shell that waits 2s for the app to quit, then deletes
 * the targets and exits. Quitting from inside the running app can't delete
 * its own .app bundle while it's executing — the deferred shell handles it.
 */
function macosUninstallApp() {
  if (process.platform !== "darwin") {
    return { ok: false, error: "Uninstall is macOS-only." };
  }
  const HOME = app.getPath("home");
  const APP_NAME = "Cabinet";
  const BUNDLE_ID = "com.runcabinet.cabinet";
  // Targets exclude `~/Library/Application Support/Cabinet/` — that's user data.
  const targets = [
    `/Applications/${APP_NAME}.app`,
    `${HOME}/Library/Caches/${APP_NAME}`,
    `${HOME}/Library/Caches/${BUNDLE_ID}`,
    `${HOME}/Library/Caches/${BUNDLE_ID}.ShipIt`,
    `${HOME}/Library/HTTPStorages/${BUNDLE_ID}`,
    `${HOME}/Library/HTTPStorages/${BUNDLE_ID}.binarycookies`,
    `${HOME}/Library/WebKit/${BUNDLE_ID}`,
    `${HOME}/Library/Preferences/${BUNDLE_ID}.plist`,
    `${HOME}/Library/Saved Application State/${BUNDLE_ID}.savedState`,
    `${HOME}/Library/Logs/${APP_NAME}`,
  ];
  // Build a shell script that sleeps then rm -rfs each target.
  const rmLines = targets
    .map((t) => `rm -rf ${JSON.stringify(t)}`)
    .join("\n");
  const script = `#!/bin/bash\nsleep 2\n${rmLines}\nexit 0\n`;
  const scriptPath = path.join(app.getPath("temp"), `cabinet-uninstall-${Date.now()}.sh`);
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  // Detach so the shell survives Electron quitting.
  const child = spawn("/bin/bash", [scriptPath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  // Quit shortly after; the script's 2s sleep covers shutdown.
  setTimeout(() => app.quit(), 200);
  return { ok: true, dataPath: managedDataDir };
}

ipcMain.handle("cabinet:uninstall-app", () => {
  return macosUninstallApp();
});

// Restart the whole desktop app. Switching the active cabinet changes the
// content root that the embedded Next server resolves at boot (DATA_DIR is a
// load-time constant), so the only safe way to rebind it is a full relaunch —
// this mirrors how Obsidian reloads when you open a different cabinet. The new
// process re-reads `.home/home.json` `activeCabinet` on start.
ipcMain.handle("cabinet:relaunch", () => {
  try {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});


// OS keyboard / input language for first-run locale auto-detection.
// getPreferredSystemLanguages() reflects the user's macOS/Windows language &
// keyboard ordering; getLocale()/getSystemLocale() are conservative fallbacks.
ipcMain.handle("cabinet:get-preferred-languages", () => {
  try {
    return {
      preferred:
        typeof app.getPreferredSystemLanguages === "function"
          ? app.getPreferredSystemLanguages()
          : [],
      locale: typeof app.getLocale === "function" ? app.getLocale() : "",
      system:
        typeof app.getSystemLocale === "function" ? app.getSystemLocale() : "",
    };
  } catch {
    return { preferred: [], locale: "", system: "" };
  }
});

function isMainRendererSender(event) {
  return !!mainWindow && event.sender.id === mainWindow.webContents.id;
}


function buildBrowserWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#111111",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });
  if (typeof win.setWindowButtonVisibility === "function") {
    try {
      win.setWindowButtonVisibility(true);
    } catch {}
  }
  // Tell the renderer when macOS hides/shows the traffic lights (native
  // full-screen) so it can drop/restore the --traffic-clearance reservation —
  // otherwise the ~80px reserved for the lights is an empty gap in full-screen.
  const sendFullscreen = () => {
    if (!win.isDestroyed()) {
      win.webContents.send("cabinet:fullscreen-changed", win.isFullScreen());
    }
  };
  win.on("enter-full-screen", sendFullscreen);
  win.on("leave-full-screen", sendFullscreen);
  win.webContents.on("did-finish-load", sendFullscreen);
  return win;
}

// In dev, the Next server may not be ready the instant a window loads. Retry by
// re-resolving the dev URL and re-appending the window's hash, so a secondary
// (per-room) window keeps its scope across the retry.
function attachDevReload(win, hash) {
  if (!isDev) return;
  win.webContents.on("did-fail-load", async (_event, errorCode, errorDescription) => {
    if (!win || win.isDestroyed()) {
      return;
    }

    if (errorCode === -3) {
      return;
    }

    try {
      const nextUrl = await resolveDevAppUrl(15_000);
      await win.loadURL(`${nextUrl}${hash || ""}`);
    } catch {
      dialog.showErrorBox(
        "Cabinet Dev Server Unavailable",
        `Electron could not reach the local Cabinet dev app.\n\nLast Chromium error: ${errorDescription} (${errorCode})\n\nStart \`npm run dev\` and try again.`
      );
    }
  });
}

async function createWindow() {
  const runtime = await startEmbeddedCabinet();
  baseAppUrl = runtime.appUrl;

  mainWindow = buildBrowserWindow();
  attachDevReload(mainWindow, "");
  await mainWindow.loadURL(runtime.appUrl);
}

// Spawn an additional window scoped to a specific room/cabinet via its URL hash
// (e.g. "#/cabinet/research"). Reuses the already-running backend.
async function openRoomWindow(suffix) {
  // `suffix` is a clean URL path ("/room/<path>") under clean-path routing
  // (PRD §11); it was a "#/..." hash before. Concatenation is identical.
  const safeSuffix = typeof suffix === "string" ? suffix : "";
  if (!baseAppUrl) {
    await createWindow();
    return { ok: true };
  }
  const win = buildBrowserWindow();
  attachDevReload(win, safeSuffix);
  await win.loadURL(`${baseAppUrl}${safeSuffix}`);
  win.focus();
  return { ok: true };
}

ipcMain.handle("cabinet:open-window", (_event, suffix) => openRoomWindow(suffix));

ipcMain.handle("cabinet:save-pdf", async (event, payload) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  let authorized = false;
  try {
    authorized = !!baseAppUrl && new URL(event.sender.getURL()).origin === new URL(baseAppUrl).origin;
  } catch {}
  if (!owner || owner.isDestroyed() || !authorized) {
    return { ok: false, error: "unauthorized" };
  }

  const paperSize = payload?.paperSize === "a4"
    ? "A4"
    : payload?.paperSize === "letter"
      ? "Letter"
      : null;
  const orientation = payload?.orientation;
  if (!paperSize || (orientation !== "portrait" && orientation !== "landscape")) {
    return { ok: false, error: "invalid-options" };
  }

  const rawFilename = typeof payload?.filename === "string" ? payload.filename : "page.pdf";
  const baseFilename = path.basename(rawFilename)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\.+$/, "")
    .trim() || "page";
  const filename = baseFilename.toLowerCase().endsWith(".pdf")
    ? baseFilename
    : `${baseFilename}.pdf`;

  try {
    const result = await dialog.showSaveDialog(owner, {
      title: "Save PDF",
      defaultPath: path.join(app.getPath("documents"), filename),
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };

    const data = await event.sender.printToPDF({
      pageSize: paperSize,
      landscape: orientation === "landscape",
      printBackground: true,
      preferCSSPageSize: true,
      generateTaggedPDF: true,
      generateDocumentOutline: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    await fs.promises.writeFile(result.filePath, data);
    return { ok: true, path: result.filePath };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "pdf-save-failed",
    };
  }
});

async function installExtensionFromWebStore(extensionId) {
  const prodversion = process.versions.chrome || "126.0.0.0";
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${prodversion}&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download extension CRX (HTTP ${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length < 16) {
    throw new Error("Chrome Web Store returned no CRX data. Check the extension ID and that the extension is still available.");
  }

  let zipDataOffset = 0;
  const magic = buffer.readUInt32LE(0);
  if (magic === 0x34327243) { // 'Cr24'
    const version = buffer.readUInt32LE(4);
    if (version === 3) {
      const headerSize = buffer.readUInt32LE(8);
      zipDataOffset = 12 + headerSize;
    } else if (version === 2) {
      const pubKeyLength = buffer.readUInt32LE(8);
      const sigLength = buffer.readUInt32LE(12);
      zipDataOffset = 16 + pubKeyLength + sigLength;
    } else {
      throw new Error("Unknown CRX version: " + version);
    }
  } else {
    zipDataOffset = 0;
  }

  const zipData = buffer.slice(zipDataOffset);
  const zip = await JSZip.loadAsync(zipData);

  const outDir = path.join(userDataDir, "extensions", extensionId);
  fs.mkdirSync(outDir, { recursive: true });

  for (const [relativePath, file] of Object.entries(zip.files)) {
    if (file.dir) {
      fs.mkdirSync(path.join(outDir, relativePath), { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(path.join(outDir, relativePath)), { recursive: true });
      const content = await file.async('nodebuffer');
      fs.writeFileSync(path.join(outDir, relativePath), content);
    }
  }

  const manifestPath = path.join(outDir, "manifest.json");
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  }

  const resolveI18n = (str) => {
    if (!str || typeof str !== "string" || !str.startsWith("__MSG_") || !str.endsWith("__")) return str;
    const msgKey = str.slice(6, -2);
    const defaultLocale = manifest.default_locale || "en";
    const messagesPath = path.join(outDir, "_locales", defaultLocale, "messages.json");
    if (fs.existsSync(messagesPath)) {
      try {
        const messages = JSON.parse(fs.readFileSync(messagesPath, "utf8"));
        // sometimes keys are case insensitive in chrome, but let's try exact first, then lower
        let match = messages[msgKey];
        if (!match) {
          const lowerKey = msgKey.toLowerCase();
          for (const key of Object.keys(messages)) {
            if (key.toLowerCase() === lowerKey) {
              match = messages[key];
              break;
            }
          }
        }
        if (match && match.message) {
          return match.message;
        }
      } catch (e) {}
    }
    return str;
  };

  const popupHtml = manifest.action?.default_popup || manifest.browser_action?.default_popup || null;
  const optionsPage = manifest.options_page || manifest.options_ui?.page || null;
  
  let iconDataUrl = null;
  const icons = manifest.icons || {};
  const iconPathRef = icons["128"] || icons["48"] || icons["16"] || manifest.action?.default_icon || manifest.browser_action?.default_icon;
  if (iconPathRef && typeof iconPathRef === "string") {
    const fullIconPath = path.join(outDir, iconPathRef);
    if (fs.existsSync(fullIconPath)) {
      try {
        const ext = path.extname(fullIconPath).slice(1) || "png";
        const base64 = fs.readFileSync(fullIconPath).toString("base64");
        iconDataUrl = `data:image/${ext};base64,${base64}`;
      } catch (e) {}
    }
  } else if (iconPathRef && typeof iconPathRef === "object") {
    // sometimes default_icon is an object { "16": "...", "32": "..." }
    const firstIcon = Object.values(iconPathRef)[0];
    if (firstIcon && typeof firstIcon === "string") {
      const fullIconPath = path.join(outDir, firstIcon);
      if (fs.existsSync(fullIconPath)) {
        try {
          const ext = path.extname(fullIconPath).slice(1) || "png";
          const base64 = fs.readFileSync(fullIconPath).toString("base64");
          iconDataUrl = `data:image/${ext};base64,${base64}`;
        } catch (e) {}
      }
    }
  }

  const browserSession = getBrowserSession();
  // Patch unsupported Chrome APIs before loading
  patchExtensionManifest(outDir);
  patchExtensionUnsupportedApis(outDir);
  let loadedExt;
  if (browserSession.extensions && browserSession.extensions.loadExtension) {
    loadedExt = await browserSession.extensions.loadExtension(outDir, { allowFileAccess: true });
  } else {
    loadedExt = await browserSession.loadExtension(outDir, { allowFileAccess: true });
  }
  runtimeExtensionIds.set(outDir, loadedExt.id);

  // Collect content-script match patterns so the renderer can navigate to
  // a supported page when the user clicks an extension with no popup.
  const contentScriptMatches = [];
  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      if (Array.isArray(cs.matches)) {
        for (const m of cs.matches) {
          if (typeof m === "string" && !contentScriptMatches.includes(m)) {
            contentScriptMatches.push(m);
          }
        }
      }
    }
  }

  const extData = {
    id: extensionId,
    name: resolveI18n(manifest.name) || extensionId,
    version: manifest.version || "unknown",
    path: outDir,
    description: resolveI18n(manifest.description) || "",
    popupHtml,
    iconDataUrl,
    contentScriptMatches,
    optionsPage,
  };

  const persisted = readPersistedExtensions();
  const existingIndex = persisted.findIndex((e) => e.id === extensionId);
  if (existingIndex >= 0) {
    persisted[existingIndex] = extData;
  } else {
    persisted.push(extData);
  }
  writePersistedExtensions(persisted);

  return extData;
}

function enrichExtension(ext) {
  if (!ext) return ext;
  const runtimeId = runtimeExtensionIds.get(ext.path) || ext.id;
  let optionsPage = ext.optionsPage;
  if (optionsPage === undefined) {
    try {
      const manifestPath = path.join(ext.path, "manifest.json");
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        optionsPage = manifest.options_page || manifest.options_ui?.page || null;
      }
    } catch {
      optionsPage = null;
    }
  }
  return {
    ...ext,
    runtimeId,
    optionsPage,
  };
}

ipcMain.handle("cabinet:web-store-install", async (event, payload) => {
  try {
    const ext = await installExtensionFromWebStore(payload.extensionId);
    const enriched = enrichExtension(ext);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cabinet:extension-installed", enriched);
    }
    return { ok: true, extension: enriched };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("cabinet:install-extension", async (event, payload) => {
  try {
    const raw = String(payload.urlOrId || "").trim();
    // Chrome extension IDs are exactly 32 chars in [a-p]. Extract from a bare
    // ID or from any Web Store URL shape (trailing slash, query params, etc.).
    const match = raw.match(/[a-p]{32}/);
    if (!match) {
      return { ok: false, error: "Could not find a valid extension ID in the input. Paste the Chrome Web Store URL or the 32-character extension ID." };
    }
    const ext = await installExtensionFromWebStore(match[0]);
    return { ok: true, extension: enrichExtension(ext) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("cabinet:toggle-extension", async (event, payload) => {
  try {
    const { id, enabled } = payload;
    let persisted = readPersistedExtensions();
    const extIndex = persisted.findIndex(e => e.id === id);
    if (extIndex < 0) return { ok: false, error: "Not found" };
    
    persisted[extIndex].enabled = enabled;
    writePersistedExtensions(persisted);

    const browserSession = getBrowserSession();
    const outDir = path.join(userDataDir, "extensions", id);
    
    if (enabled) {
      let loadedExt;
      if (browserSession.extensions && browserSession.extensions.loadExtension) {
        loadedExt = await browserSession.extensions.loadExtension(outDir, { allowFileAccess: true });
      } else {
        loadedExt = await browserSession.loadExtension(outDir, { allowFileAccess: true });
      }
      runtimeExtensionIds.set(outDir, loadedExt.id);
    } else {
      const runtimeId = runtimeExtensionIds.get(outDir);
      if (runtimeId) {
        if (browserSession.extensions && browserSession.extensions.removeExtension) {
          browserSession.extensions.removeExtension(runtimeId);
        } else {
          browserSession.removeExtension(runtimeId);
        }
        runtimeExtensionIds.delete(outDir);
      }
    }
    
    return { ok: true, extension: enrichExtension(persisted[extIndex]) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("cabinet:update-extension", async (event, payload) => {
  try {
    const { id, updates } = payload;
    let persisted = readPersistedExtensions();
    const extIndex = persisted.findIndex(e => e.id === id);
    if (extIndex < 0) return { ok: false, error: "Not found" };
    
    persisted[extIndex] = { ...persisted[extIndex], ...updates };
    writePersistedExtensions(persisted);
    return { ok: true, extension: enrichExtension(persisted[extIndex]) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

let currentExtensionPopup = null;
let extensionPanelWindow = null;

// Open an extension page (side panel, settings…) in a dedicated window
// docked to the right of the main window. Crucially this must NOT replace
// the page in the main browser view: extensions like MindStudio query the
// active tab for its URL/content, so the page they operate on has to stay
// loaded.
function openExtensionPanelWindow(url) {
  try {
    if (extensionPanelWindow && !extensionPanelWindow.isDestroyed()) {
      // Reloading aborts any in-flight work in the panel (e.g. a MindStudio
      // agent streaming its output) — only navigate when the target differs.
      const currentUrl = extensionPanelWindow.webContents.getURL();
      if (currentUrl !== url) {
        extensionPanelWindow.loadURL(url);
      }
      extensionPanelWindow.show();
      extensionPanelWindow.focus();
      return;
    }
    const panelWidth = 420;
    let x;
    let y;
    let height = 720;
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      x = b.x + b.width - panelWidth - 8;
      y = b.y + 60;
      height = Math.max(480, b.height - 120);
    }
    extensionPanelWindow = new BrowserWindow({
      width: panelWidth,
      height,
      ...(typeof x === "number" ? { x, y } : {}),
      title: "Extension",
      parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      webPreferences: {
        partition: BROWSER_VIEW_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Chromium throttles timers/rendering in unfocused windows, which can
        // stall or drop a streaming AI generation (WebSocket pings time out)
        // while the user reads the article in the main window.
        backgroundThrottling: false,
      },
    });
    extensionPanelWindow.on("closed", () => {
      extensionPanelWindow = null;
    });
    if (isDev) {
      // F12 / Cmd+Shift+I opens DevTools on the panel to debug extension
      // streaming issues (network tab shows dropped SSE/WebSocket streams).
      extensionPanelWindow.webContents.on("before-input-event", (_e, input) => {
        const combo = input.type === "keyDown" &&
          (input.key === "F12" || (input.key.toLowerCase() === "i" && input.meta && input.shift));
        if (combo) extensionPanelWindow.webContents.openDevTools({ mode: "detach" });
      });
    }
    extensionPanelWindow.loadURL(url);
  } catch (e) {
    console.warn("[cabinet] could not open extension panel window:", e?.message || e);
  }
}

// Open-url requests relayed from extension service workers through
// content-script stubs and the browser-view preload.
ipcMain.on("cabinet:extension-open-url", (_event, payload) => {
  const url = typeof payload?.url === "string" ? payload.url : "";
  if (!url) return;
  if (url.startsWith("chrome-extension://")) {
    openExtensionPanelWindow(url);
    return;
  }
  if (!/^https?:\/\//.test(url)) return;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cabinet:browser-view-navigate", { url });
    }
  } catch {}
});

ipcMain.handle("cabinet:show-extension-popup", async (event, payload) => {
  if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
  try {
    const { extensionId, x, y } = payload;
    let persisted = readPersistedExtensions();
    const ext = persisted.find(e => e.id === extensionId);
    if (!ext) return { ok: false, error: "Not found" };
    if (!ext.popupHtml) {
      // No popup — simulate chrome.action.onClicked in the extension's
      // service worker using the extensionsManager if available.
      const extensionsManager = getExtensionsManager();
      const allWC = webContents.getAllWebContents();
      let activeTab = allWC.find((wc) => {
        if (wc.isDestroyed()) return false;
        const url = wc.getURL();
        return /^https?:\/\//.test(url) &&
          !/^https?:\/\/(localhost|127\.0\.0\.1)([:\/]|$)/.test(url) &&
          wc.id !== mainWindow?.webContents?.id;
      });
      if (!activeTab) {
        const focusedWC = webContents.getFocusedWebContents();
        if (focusedWC && !focusedWC.isDestroyed()) {
          const url = focusedWC.getURL();
          if (/^https?:\/\//.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)([:\/]|$)/.test(url)) {
            activeTab = focusedWC;
          }
        }
      }
      if (!activeTab) {
        activeTab = allWC.find((wc) => {
          if (wc.isDestroyed()) return false;
          const url = wc.getURL();
          return /^https?:\/\//.test(url) && wc.id !== mainWindow?.webContents?.id;
        });
      }

      if (extensionsManager && extensionsManager.api && extensionsManager.api.browserAction && activeTab) {
        try {
          extensionsManager.api.browserAction.activateClick({
            extensionId: extensionId,
            tabId: activeTab.id,
            anchorRect: { x, y, width: 0, height: 0 },
            alignment: "left"
          });
          return { ok: true };
        } catch (err) {
          console.error(`[cabinet] failed to trigger action click via extensionsManager: ${err?.message || err}`);
        }
      }

      const runtimeId = runtimeExtensionIds.get(ext.path) || extensionId;
      const possibleExtensionIds = new Set([runtimeId, extensionId]);

      // Find the extension's service worker webContents.
      const swCandidates = allWC.filter((wc) => {
        if (wc.isDestroyed()) return false;
        const url = wc.getURL() || "";
        return [...possibleExtensionIds].some((id) =>
          url === `chrome-extension://${id}` || url.startsWith(`chrome-extension://${id}/`)
        );
      });

      const tab = activeTab
        ? {
            id: activeTab.id,
            url: activeTab.getURL(),
            title: activeTab.getTitle(),
            active: true,
            windowId: 0,
          }
        : { id: 0, url: "", title: "", active: false, windowId: 0 };

      for (const swWC of swCandidates) {
        try {
          await swWC.executeJavaScript(
            `self.__cabinetTriggerActionClick(${JSON.stringify(tab)})`
          );
          return { ok: true };
        } catch (err) {
          console.error(`[cabinet] failed to trigger action click in extension webContents ${swWC.id}: ${err?.message || err}`);
        }
      }

      if (!swCandidates.length) {
        const candidateUrls = allWC
          .filter((wc) => !wc.isDestroyed())
          .map((wc) => wc.getURL())
          .filter(Boolean);
        console.warn(`[cabinet] no extension webContents found for ${extensionId} (runtimeId=${runtimeId}). candidate URLs: ${JSON.stringify(candidateUrls)}`);
      } else if (!activeTab) {
        console.warn(`[cabinet] found ${swCandidates.length} extension webContents for ${extensionId}, but no active browser tab to pass to the click handler.`);
      } else {
        console.warn(`[cabinet] extension click dispatch failed for ${extensionId} (runtimeId=${runtimeId}) after trying ${swCandidates.length} candidate webContents.`);
      }

      console.warn(`[cabinet] showExtensionPopup returning No popup defined for ${extensionId} (runtimeId=${runtimeId})`);
      return { ok: false, error: "No popup defined" };
    }

    if (currentExtensionPopup) {
      try {
        mainWindow.contentView.removeChildView(currentExtensionPopup);
      } catch {}
      currentExtensionPopup = null;
    }

    const runtimeId = runtimeExtensionIds.get(ext.path) || extensionId;
    const popupUrl = `chrome-extension://${runtimeId}/${ext.popupHtml}`;
    const view = new WebContentsView({
      webPreferences: {
        partition: BROWSER_VIEW_PARTITION,
        contextIsolation: false,
        sandbox: true,
        nodeIntegration: false,
        enablePreferredSizeMode: true,
      },
    });

    let currentWidth = 360;
    let currentHeight = 480;
    const paddingX = 8;
    const paddingY = 8;
    
    const updateBounds = (w, h) => {
      // Chrome extension popups have a max size of 800x600
      const width = Math.min(Math.max(w, 100), 800);
      const height = Math.min(Math.max(h, 100), 600);
      
      const winBounds = mainWindow.getContentBounds();
      let finalX = x;
      let finalY = y;
      
      // align to the right side if the popup is too wide, similar to Chrome
      if (finalX + width > winBounds.width) finalX = winBounds.width - width - paddingX;
      if (finalY + height > winBounds.height) finalY = winBounds.height - height - paddingY;

      view.setBounds({ x: finalX, y: finalY, width, height });
    };

    view.webContents.on('preferred-size-changed', (event, size) => {
      updateBounds(size.width, size.height);
    });

    updateBounds(currentWidth, currentHeight);
    mainWindow.contentView.addChildView(view);

    currentExtensionPopup = view;

    // Forward console messages from the popup to the main renderer so
    // extension popup errors are visible in the app's DevTools console.
    view.webContents.on("console-message", (_e, level, message) => {
      const prefix = `[extension-popup]`;
      const levelName = ["verbose", "info", "warning", "error"][level] || "log";
      try {
        mainWindow.webContents.send("cabinet:browser-view-console", {
          level: levelName,
          message: `${prefix} ${message}`,
        });
      } catch {}
    });

    view.webContents.loadURL(popupUrl);
    view.webContents.focus();

    // Redirect navigations out of the popup (e.g. settings, side panel).
    // The API stubs use location.href navigation because window.open()
    // from chrome-extension:// pages crashes Electron's browser process.
    const redirectPopupUrl = (openUrl) => {
      if (openUrl.startsWith("chrome-extension://")) {
        // Open extension pages (settings, sidepanel) in the dedicated panel
        // window, keeping the current page in the browser view intact.
        openExtensionPanelWindow(openUrl);
      } else {
        // Open external URLs in the default OS browser
        try {
          shell.openExternal(openUrl);
        } catch {}
      }
      // Close the popup after redirecting
      if (currentExtensionPopup === view) {
        try {
          mainWindow.contentView.removeChildView(view);
        } catch {}
        currentExtensionPopup = null;
      }
    };

    view.webContents.setWindowOpenHandler(({ url: openUrl }) => {
      redirectPopupUrl(openUrl);
      return { action: "deny" };
    });

    view.webContents.on("will-navigate", (navEvent, navUrl) => {
      // Allow the initial popup load; redirect everything else.
      if (navUrl === popupUrl) return;
      navEvent.preventDefault();
      redirectPopupUrl(navUrl);
    });

    view.webContents.on("blur", () => {
      if (currentExtensionPopup === view) {
        try {
          mainWindow.contentView.removeChildView(view);
        } catch {}
        currentExtensionPopup = null;
      }
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("cabinet:uninstall-extension", async (event, payload) => {
  try {
    const { id } = payload;
    let persisted = readPersistedExtensions();
    const extIndex = persisted.findIndex(e => e.id === id);
    if (extIndex >= 0) {
      persisted.splice(extIndex, 1);
      writePersistedExtensions(persisted);
    }

    const browserSession = getBrowserSession();
    const outDir = path.join(userDataDir, "extensions", id);
    const runtimeId = runtimeExtensionIds.get(outDir);
    if (runtimeId) {
      try {
        if (browserSession.extensions && browserSession.extensions.removeExtension) {
          browserSession.extensions.removeExtension(runtimeId);
        } else {
          browserSession.removeExtension(runtimeId);
        }
      } catch {}
      runtimeExtensionIds.delete(outDir);
    }

    fs.rmSync(outDir, { recursive: true, force: true });
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cabinet:extension-uninstalled", { id });
    }
    
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("cabinet:get-extensions", () => {
  return readPersistedExtensions().map(enrichExtension);
});

// Read a file from the active cabinet's content directory. Used by the LaTeX
// embed extension to load .tex files for in-editor rendering. The path is
// resolved relative to the content root with path-traversal protection.
ipcMain.handle("cabinet:read-file", async (_event, payload) => {
  try {
    const relPath = typeof payload?.path === "string" ? payload.path.trim() : "";
    if (!relPath) return { ok: false, error: "no-path" };

    const contentDir = resolveContentDir();
    const resolved = path.resolve(contentDir, relPath);
    const relative = path.relative(contentDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return { ok: false, error: "path-traversal" };
    }

    const fs = require("fs");
    const content = fs.readFileSync(resolved, "utf8");
    return { ok: true, content };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
});

// Write file content back to the active cabinet's content directory. Used by
// the LaTeX embed extension when the user edits a .tex file inline.
ipcMain.handle("cabinet:write-file", async (_event, payload) => {
  try {
    const relPath = typeof payload?.path === "string" ? payload.path.trim() : "";
    const content = typeof payload?.content === "string" ? payload.content : "";
    if (!relPath) return { ok: false, error: "no-path" };

    const contentDir = resolveContentDir();
    const resolved = path.resolve(contentDir, relPath);
    const relative = path.relative(contentDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return { ok: false, error: "path-traversal" };
    }

    const fs = require("fs");
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, "utf8");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
});

// Note: the "cabinet:open-local-file" IPC handler lives in browser-views.cjs
// (registerHandlers); it's shared by editor file:// links and browse mode, and
// adds a same-renderer auth check. Don't register a second handler here —
// ipcMain.handle throws on a duplicate channel.

app.on("window-all-closed", () => {
  destroyAllBrowserViews();
  cleanupBackends();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

let isQuitting = false;

app.on("before-quit", (event) => {
  if (!isQuitting && baseAppUrl) {
    event.preventDefault();
    const syncUrl = `${baseAppUrl}/api/pages/public/sync`;
    fetch(syncUrl, { method: "POST" })
      .then((res) => {
        if (!res.ok) {
          console.error(`Sync API returned status: ${res.status}`);
        }
      })
      .catch((err) => {
        console.error("Failed to sync public directory on exit:", err);
      })
      .finally(() => {
        isQuitting = true;
        destroyAllBrowserViews();
        cleanupBackends();
        app.quit();
      });
  } else {
    destroyAllBrowserViews();
    cleanupBackends();
  }
});

app.on("second-instance", () => {
  // Focus a live window. The original `mainWindow` may be closed/destroyed
  // (multi-window, or the user closed it), so prefer any live window and
  // never touch a destroyed reference (that throws "Object has been destroyed").
  const win = liveMainWindow() ?? anyLiveWindow();
  if (!win) {
    return;
  }

  if (win.isMinimized()) {
    win.restore();
  }
  win.focus();
});

app.on("web-contents-created", (event, wc) => {
  wc.on("console-message", (event, level, message) => {
    if (message && message.startsWith("__cabinet_open_panel__:")) {
      const url = message.substring("__cabinet_open_panel__:".length);
      openExtensionPanelWindow(url);
    }
  });
});

app.whenReady().then(async () => {
  const defaultUA = app.userAgentFallback || "";
  app.userAgentFallback = defaultUA.replace(/Electron\/[\d\.]+ ?/g, "").replace(/cabinet\/[\d\.]+ ?/g, "").replace(/\s+/g, " ").trim() || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";


  await loadBrowserExtensions();
  configureAutoUpdates();
  // Native in-app browser (browse mode). Attaches WebContentsViews to the
  // current main window; getBaseAppUrl resolves app-relative /api/assets KB
  // URLs; isDev enables the "Inspect Element" context menu.
  initBrowserViews({
    getMainWindow: () => mainWindow,
    getBaseAppUrl: () => baseAppUrl,
    isDev,
    openExtensionPanelWindow: (url) => openExtensionPanelWindow(url),
  });
  try {
    await createWindow();
  } catch (error) {
    // Without this, a failed bootstrap (most commonly: no `npm run dev` server
    // for the dev build to attach to) rejects unhandled and leaves a silent,
    // windowless Electron process. Surface the cause instead.
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox(
      "Cabinet failed to start",
      isDev
        ? `${message}\n\nStart the dev server with \`npm run dev\` (or \`npm run dev:all\`) before \`npm run electron:start\`.`
        : message
    );
    app.quit();
    return;
  }


  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

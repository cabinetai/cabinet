/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const net = require("net");
const { spawn } = require("child_process");
const { app, BrowserWindow, dialog, autoUpdater, ipcMain, Menu, WebContentsView, session } = require("electron");
const { updateElectronApp } = require("update-electron-app");
const JSZip = require("jszip");

if (require("electron-squirrel-startup")) {
  app.quit();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

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

// `managedDataDir` is the PARENT data folder; the active vault is a root folder
// directly beneath it (Obsidian-style). Content (cabinets, agents, assets)
// lives under the vault, while shared state (.home, .cabinet-state, bookmarks)
// stays at the parent. The active vault name is persisted by the server in
// .home/home.json — read it here so asset deep-link resolution targets the
// same content root the server serves from. Falls back to "Cabinet".
const DEFAULT_VAULT_NAME = "Cabinet";

function resolveContentDir() {
  try {
    const homePath = path.join(managedDataDir, ".home", "home.json");
    const raw = fs.readFileSync(homePath, "utf8");
    const parsed = JSON.parse(raw);
    const name =
      parsed && typeof parsed.activeVault === "string" && parsed.activeVault.trim()
        ? parsed.activeVault.trim()
        : DEFAULT_VAULT_NAME;
    return path.join(managedDataDir, name);
  } catch {
    return path.join(managedDataDir, DEFAULT_VAULT_NAME);
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
const browserViews = new Map();
let nextBrowserViewId = 1;

function sendBrowserViewNavigateEvent(ownerWebContentsId, viewId, url) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (!wc || wc.id !== ownerWebContentsId || wc.isDestroyed()) return;
  try {
    wc.send("cabinet:browser-view-navigated", { viewId, url });
  } catch {}
}

function sendBrowserViewLoadFailedEvent(ownerWebContentsId, viewId, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (!wc || wc.id !== ownerWebContentsId || wc.isDestroyed()) return;
  try {
    wc.send("cabinet:browser-view-load-failed", { viewId, ...payload });
  } catch {}
}

function getBrowserSession() {
  return session.fromPartition(BROWSER_VIEW_PARTITION);
}

function setupBrowserSession() {
  const browserSession = getBrowserSession();
  const filter = { urls: ['*://*.google.com/*'] };
  browserSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    details.requestHeaders['Sec-CH-UA'] = '"Google Chrome";v="136", "Chromium";v="136", "Not_A Brand";v="24"';
    details.requestHeaders['Sec-CH-UA-Mobile'] = '?0';
    details.requestHeaders['Sec-CH-UA-Platform'] = '"macOS"';
    // Fallback user agent just in case
    details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
    
    callback({ requestHeaders: details.requestHeaders });
  });
}

function getMainRendererSession() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const wc = mainWindow.webContents;
    if (wc && !wc.isDestroyed()) {
      return wc.session;
    }
  }
  return session.defaultSession;
}

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

function parseBrowserExtensions() {
  const raw = process.env.CABINET_CHROME_EXTENSIONS;
  if (!raw || !raw.trim()) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const runtimeExtensionIds = new Map();

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

function spawnBackend(command, args, env) {
  const child = spawn(command, args, {
    env,
    stdio: "inherit",
  });
  backendChildren.push(child);
  return child;
}

function spawnNodeBackend(args, env) {
  if (isDev) {
    return spawnBackend(process.execPath, args, env);
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
    return spawnBackend(bundledNodePath, args, env);
  }

  return spawnBackend(process.execPath, args, {
    ...env,
    // Fallback for older packages that do not yet bundle a standalone Node
    // runtime alongside the embedded Next.js server.
    ELECTRON_RUN_AS_NODE: "1",
  });
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

  spawnNodeBackend([serverEntry], env);
  spawnNodeBackend([daemonEntry], daemonEnv);

  await waitForHealth(`${appOrigin}/api/health`);
  return { appUrl: appOrigin };
}

function configureAutoUpdates() {
  if (process.platform !== "darwin") {
    return;
  }

  try {
    updateElectronApp({
      repo: "hilash/cabinet",
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

// Restart the whole desktop app. Switching the active vault changes the
// content root that the embedded Next server resolves at boot (DATA_DIR is a
// load-time constant), so the only safe way to rebind it is a full relaunch —
// this mirrors how Obsidian reloads when you open a different vault. The new
// process re-reads `.home/home.json` `activeVault` on start.
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

function isAbortNavigationError(error) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error;
  return maybeError.code === "ERR_ABORTED" || maybeError.errno === -3;
}

function getBrowserBaseUrl() {
  return (
    (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.getURL()) ||
    runtime.appUrl ||
    "http://127.0.0.1"
  );
}

function toAbsoluteHttpUrl(value) {
  try {
    return new URL(value, getBrowserBaseUrl()).toString();
  } catch {
    return null;
  }
}

function resolveAssetFsPath(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = new URL(value, getBrowserBaseUrl());
    if (!parsed.pathname.startsWith("/api/assets/")) return null;
    const decodePathPart = (entry) => {
      try {
        return decodeURIComponent(entry);
      } catch {
        return entry;
      }
    };
    const encodedPath = parsed.pathname.slice("/api/assets/".length);
    const decodedPath = decodePathPart(encodedPath);
    return {
      ext: path.extname(decodedPath).toLowerCase(),
      fsPath: path.join(resolveContentDir(), ...encodedPath.split("/").map((entry) => decodePathPart(entry))),
    };
  } catch {
    return null;
  }
}

function isInlineCsvAssetUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const parsed = new URL(value, getBrowserBaseUrl());
    if (!parsed.pathname.startsWith("/api/assets/")) return false;
    if (parsed.searchParams.get("cabinet-inline") !== "1") return false;
    const asset = resolveAssetFsPath(value);
    return asset?.ext === ".csv";
  } catch {
    return false;
  }
}

function resolveBrowserTarget(value) {
  if (typeof value !== "string") return { primaryUrl: null, fallbackUrl: null };
  const trimmed = value.trim();
  if (!trimmed) return { primaryUrl: null, fallbackUrl: null };
  if (trimmed === "about:blank") return { primaryUrl: trimmed, fallbackUrl: null };
  if (trimmed.startsWith("file://")) return { primaryUrl: trimmed, fallbackUrl: null };
  if (trimmed.startsWith("/api/assets/")) {
    const httpUrl = toAbsoluteHttpUrl(trimmed);
    const suffix = trimmed.slice("/api/assets/".length);
    const suffixPathOnly = suffix.split(/[?#]/)[0] || "";
    const decodePathPart = (value) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };
    const decodedSuffix = decodePathPart(suffixPathOnly);
    const ext = path.extname(decodedSuffix).toLowerCase();
    const fsPath = path.join(
      resolveContentDir(),
      ...suffixPathOnly.split("/").map((segment) => decodePathPart(segment))
    );
    const fileUrl = pathToFileURL(fsPath).toString();
    if (ext === ".csv") {
      if (!httpUrl) {
        return { primaryUrl: null, fallbackUrl: null };
      }
      try {
        const csvUrl = new URL(httpUrl);
        csvUrl.searchParams.set("cabinet-inline", "1");
        return { primaryUrl: csvUrl.toString(), fallbackUrl: fileUrl };
      } catch {
        return { primaryUrl: httpUrl, fallbackUrl: fileUrl };
      }
    }
    if (isDev) {
      return { primaryUrl: httpUrl, fallbackUrl: null };
    }
    if (ext === ".pdf" || ext === ".md" || ext === ".markdown") {
      return { primaryUrl: httpUrl, fallbackUrl: fileUrl };
    }
    return { primaryUrl: fileUrl, fallbackUrl: httpUrl };
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return { primaryUrl: toAbsoluteHttpUrl(trimmed), fallbackUrl: null };
  }
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) || trimmed.startsWith("//")) {
    return { primaryUrl: trimmed, fallbackUrl: null };
  }
  return { primaryUrl: `https://${trimmed}`, fallbackUrl: null };
}

async function loadBrowserViewUrlSafe(webContents, nextUrl) {
  const { primaryUrl, fallbackUrl } = resolveBrowserTarget(nextUrl);
  if (!primaryUrl) {
    console.error("[cabinet] browser-view invalid target url", {
      requestedUrl: typeof nextUrl === "string" ? nextUrl : "",
    });
    return {
      ok: false,
      error: "invalid-target-url",
      requestedUrl: typeof nextUrl === "string" ? nextUrl : "",
      primaryUrl: "",
      fallbackUrl: fallbackUrl || null,
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
    const primaryError = error instanceof Error ? error.message : String(error);
    if (fallbackUrl && fallbackUrl !== primaryUrl) {
      try {
        await webContents.loadURL(fallbackUrl);
        return {
          ok: true,
          recovered: true,
          loadedUrl: fallbackUrl,
          primaryUrl,
          primaryError,
        };
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        return {
          ok: false,
          error: "load-failed",
          requestedUrl: typeof nextUrl === "string" ? nextUrl : "",
          primaryUrl,
          fallbackUrl,
          primaryError,
          fallbackError: fallbackMessage,
        };
      }
    }
    return {
      ok: false,
      error: "load-failed",
      requestedUrl: typeof nextUrl === "string" ? nextUrl : "",
      primaryUrl,
      fallbackUrl: null,
      primaryError,
    };
  }
}

function destroyBrowserView(viewId) {
  const entry = browserViews.get(viewId);
  if (!entry || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.contentView.removeChildView(entry.view);
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

ipcMain.handle("cabinet:create-browser-view", async (event, payload) => {
  if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
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
  const initialBounds = { x: 0, y: 0, width: 0, height: 0 };
  view.setBounds(initialBounds);
  view.setVisible(false);
  
  const defaultUA = view.webContents.userAgent || "";
  view.webContents.userAgent = defaultUA.replace(/Electron\/[\d\.]+ ?/g, "").replace(/cabinet\/[\d\.]+ ?/g, "");

  mainWindow.contentView.addChildView(view);
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
  view.webContents.setWindowOpenHandler(({ url: nextUrl, disposition }) => {
    const load = () =>
      loadBrowserViewUrlSafe(view.webContents, nextUrl).then((result) => {
        if (result?.ok) return;
        sendBrowserViewLoadFailedEvent(event.sender.id, viewId, {
          requestedUrl: typeof nextUrl === "string" ? nextUrl : "",
          primaryUrl: result?.primaryUrl || "",
          fallbackUrl: result?.fallbackUrl || "",
          primaryError: result?.primaryError || result?.error || "load-failed",
          fallbackError: result?.fallbackError || "",
        });
      });
    if (disposition === "save-to-disk" && isInlineCsvAssetUrl(nextUrl)) {
      void syncBrowserAuthCookie().then(load).catch(load);
      return { action: "deny" };
    }
    void syncBrowserAuthCookie().then(load).catch(load);
    return { action: "deny" };
  });
  view.webContents.on("did-create-window", (childWindow, details) => {
    const nextUrl = typeof details?.url === "string" ? details.url : "";
    if (nextUrl.trim().length > 0) {
      void syncBrowserAuthCookie()
        .then(() => loadBrowserViewUrlSafe(view.webContents, nextUrl))
        .then((result) => {
          if (result?.ok) return;
          sendBrowserViewLoadFailedEvent(event.sender.id, viewId, {
            requestedUrl: nextUrl,
            primaryUrl: result?.primaryUrl || "",
            fallbackUrl: result?.fallbackUrl || "",
            primaryError: result?.primaryError || result?.error || "load-failed",
            fallbackError: result?.fallbackError || "",
          });
        })
        .catch(() => {});
    }
    try {
      childWindow.close();
    } catch {}
  });
  view.webContents.on("context-menu", (_menuEvent, params) => {
    const devToolsOpen =
      mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.isDevToolsOpened();
    const canInspect = isDev || devToolsOpen;

    const template = [
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ];

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
    if (!entry || entry.ownerWebContentsId !== event.sender.id) return { ok: false, error: "not-found" };
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
      console.error("[cabinet] browser-view load failed", {
        viewId,
        requestedUrl: nextUrl,
        primaryUrl: result.primaryUrl || "",
        fallbackUrl: result.fallbackUrl || "",
        primaryError: result.primaryError || "",
        fallbackError: result.fallbackError || "",
      });
      sendBrowserViewLoadFailedEvent(event.sender.id, viewId, {
        requestedUrl: nextUrl,
        primaryUrl: result.primaryUrl || "",
        fallbackUrl: result.fallbackUrl || "",
        primaryError: result.primaryError || "",
        fallbackError: result.fallbackError || "",
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
  if (!entry || entry.ownerWebContentsId !== event.sender.id) return { ok: false, error: "not-found" };
  const x = Number.isFinite(bounds?.x) ? Math.max(0, Math.round(bounds.x)) : 0;
  const y = Number.isFinite(bounds?.y) ? Math.max(0, Math.round(bounds.y)) : 0;
  const width = Number.isFinite(bounds?.width) ? Math.max(0, Math.round(bounds.width)) : 0;
  const height = Number.isFinite(bounds?.height) ? Math.max(0, Math.round(bounds.height)) : 0;
  if (width >= 64 && height >= 64) {
    const nextBounds = { x, y, width, height };
    entry.view.setBounds(nextBounds);
  }
  return { ok: true };
});

ipcMain.handle("cabinet:destroy-browser-view", (event, payload) => {
  if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
  const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
  const entry = browserViews.get(viewId);
  if (!entry || entry.ownerWebContentsId !== event.sender.id) return { ok: false, error: "not-found" };
  destroyBrowserView(viewId);
  return { ok: true };
});

function setBrowserViewVisibility(viewId, visible) {
  const entry = browserViews.get(viewId);
  if (!entry || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    entry.view.setVisible(visible);
  } catch {}
}

ipcMain.handle("cabinet:set-browser-view-visible", (event, payload) => {
  if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
  const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
  const visible = payload?.visible === true;
  const entry = browserViews.get(viewId);
  if (!entry || entry.ownerWebContentsId !== event.sender.id) return { ok: false, error: "not-found" };
  setBrowserViewVisibility(viewId, visible);
  return { ok: true };
});

ipcMain.handle("cabinet:browser-view-go-back", async (event, payload) => {
  if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
  const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
  const entry = browserViews.get(viewId);
  if (!entry || entry.ownerWebContentsId !== event.sender.id) return { ok: false, error: "not-found" };
  const wc = entry.view.webContents;
  if (!wc.canGoBack()) return { ok: true, skipped: true };
  wc.goBack();
  return { ok: true };
});

ipcMain.handle("cabinet:browser-view-go-forward", async (event, payload) => {
  if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
  const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
  const entry = browserViews.get(viewId);
  if (!entry || entry.ownerWebContentsId !== event.sender.id) return { ok: false, error: "not-found" };
  const wc = entry.view.webContents;
  if (!wc.canGoForward()) return { ok: true, skipped: true };
  wc.goForward();
  return { ok: true };
});

ipcMain.handle("cabinet:browser-view-reload", async (event, payload) => {
  if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
  const viewId = typeof payload?.viewId === "string" ? payload.viewId : "";
  const entry = browserViews.get(viewId);
  if (!entry || entry.ownerWebContentsId !== event.sender.id) return { ok: false, error: "not-found" };
  entry.view.webContents.reload();
  return { ok: true };
});

function buildBookmarkSubmenuTemplate(items) {
  if (!Array.isArray(items)) return [];
  const template = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Untitled";
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
    template.push({
      id,
      label: name,
      click: () => {},
    });
  }
  return template;
}

ipcMain.handle("cabinet:show-browser-bookmarks-menu", async (event, payload) => {
  if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return { ok: false, error: "window-unavailable" };

  const x = Number.isFinite(payload?.x) ? Math.max(0, Math.round(payload.x)) : 0;
  const y = Number.isFinite(payload?.y) ? Math.max(0, Math.round(payload.y)) : 0;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const template = buildBookmarkSubmenuTemplate(items);

  if (template.length === 0) {
    return { ok: true, cancelled: true };
  }

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

function buildBrowserWindow() {
  return new BrowserWindow({
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
  mainWindow.setWindowButtonVisibility(true);
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

async function installExtensionFromWebStore(extensionId) {
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=114.0.0.0&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to download extension CRX");
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

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
  let loadedExt;
  if (browserSession.extensions && browserSession.extensions.loadExtension) {
    loadedExt = await browserSession.extensions.loadExtension(outDir, { allowFileAccess: true });
  } else {
    loadedExt = await browserSession.loadExtension(outDir, { allowFileAccess: true });
  }
  runtimeExtensionIds.set(outDir, loadedExt.id);

  const extData = {
    id: extensionId,
    name: resolveI18n(manifest.name) || extensionId,
    version: manifest.version || "unknown",
    path: outDir,
    description: resolveI18n(manifest.description) || "",
    popupHtml,
    iconDataUrl,
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

ipcMain.handle("cabinet:web-store-install", async (event, payload) => {
  try {
    const ext = await installExtensionFromWebStore(payload.extensionId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cabinet:extension-installed", ext);
    }
    return { ok: true, extension: ext };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("cabinet:install-extension", async (event, payload) => {
  try {
    let extensionId = payload.urlOrId;
    if (extensionId.includes("/")) {
      const parts = extensionId.split("/");
      extensionId = parts[parts.length - 1];
    }
    const ext = await installExtensionFromWebStore(extensionId);
    return { ok: true, extension: ext };
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
    
    return { ok: true, extension: persisted[extIndex] };
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
    return { ok: true, extension: persisted[extIndex] };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

let currentExtensionPopup = null;

ipcMain.handle("cabinet:show-extension-popup", async (event, payload) => {
  if (!isMainRendererSender(event)) return { ok: false, error: "unauthorized" };
  try {
    const { extensionId, x, y } = payload;
    let persisted = readPersistedExtensions();
    const ext = persisted.find(e => e.id === extensionId);
    if (!ext || !ext.popupHtml) return { ok: false, error: "No popup defined" };

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

    view.webContents.loadURL(popupUrl);
    view.webContents.focus();

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
  return readPersistedExtensions();
});

app.on("window-all-closed", () => {
  cleanupBackends();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  cleanupBackends();
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

app.whenReady().then(async () => {
  const defaultUA = app.userAgentFallback || "";
  app.userAgentFallback = defaultUA.replace(/Electron\/[\d\.]+ ?/g, "").replace(/cabinet\/[\d\.]+ ?/g, "").replace(/\s+/g, " ").trim() || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

  setupBrowserSession();
  await loadBrowserExtensions();
  configureAutoUpdates();
  await createWindow();


  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

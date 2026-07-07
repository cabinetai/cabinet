/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const { app, BrowserWindow, dialog, autoUpdater, ipcMain, WebContentsView, session } = require("electron");
const { updateElectronApp } = require("update-electron-app");
const JSZip = require("jszip");
const {
  initBrowserViews,
  destroyAllBrowserViews,
} = require("./browser-views.cjs");

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
  });
  await createWindow();


  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

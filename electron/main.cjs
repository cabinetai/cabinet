/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const { app, BrowserWindow, dialog, autoUpdater, ipcMain } = require("electron");
const { updateElectronApp } = require("update-electron-app");

if (require("electron-squirrel-startup")) {
  app.quit();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

const isDev = !app.isPackaged;
const PACKAGED_RUNTIME_CONFIG_PATH = path.join(
  process.resourcesPath || "",
  "app.asar.unpacked",
  ".next",
  "standalone",
  "optale-desktop-runtime.json"
);

function readPackagedRuntimeConfig() {
  if (isDev) return {};
  try {
    const parsed = JSON.parse(
      fs.readFileSync(PACKAGED_RUNTIME_CONFIG_PATH, "utf8")
    );
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizedDesktopProfile(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "partner" ||
    normalized === "customer" ||
    normalized === "restricted" ||
    normalized === "restricted_customer" ||
    normalized === "restricted-customer"
  ) {
    return normalized === "restricted" ? "restricted_customer" : normalized;
  }
  return "operator";
}

function runtimeModeForProfile(profile) {
  return normalizedDesktopProfile(profile) === "operator"
    ? "operator"
    : "restricted_customer";
}

function normalizedRuntimeMode(value, desktopProfile) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "restricted_customer" ||
    normalized === "restricted-customer" ||
    normalized === "customer_restricted" ||
    normalized === "customer-restricted"
  ) {
    return "restricted_customer";
  }
  if (normalized === "operator") return "operator";
  return runtimeModeForProfile(desktopProfile);
}

const packagedRuntimeConfig = readPackagedRuntimeConfig();
const PRODUCT_NAME = process.env.OPTALE_DESKTOP_APP_NAME || app.getName() || "Optale Console";
const APP_BUNDLE_ID = process.env.OPTALE_DESKTOP_BUNDLE_ID || "com.optale.console";
const UPDATE_REPO = process.env.OPTALE_RELEASE_REPO || "hilash/cabinet";
const DATA_DIR_BASENAME = process.env.OPTALE_DESKTOP_DATA_DIR_NAME || "cabinet-data";
const DEFAULT_CLOUD_ORIGIN = "https://console.optale.com";
const DESKTOP_PROFILE = normalizedDesktopProfile(
  process.env.OPTALE_DESKTOP_PROFILE ||
  process.env.NEXT_PUBLIC_OPTALE_DESKTOP_PROFILE ||
  packagedRuntimeConfig.desktopProfile ||
  "operator"
);
const RUNTIME_MODE = normalizedRuntimeMode(
  process.env.OPTALE_RUNTIME_MODE ||
  process.env.NEXT_PUBLIC_OPTALE_RUNTIME_MODE ||
  packagedRuntimeConfig.runtimeMode,
  DESKTOP_PROFILE
);
function normalizeHttpOrigin(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    const isHttps = parsed.protocol === "https:";
    const isLoopbackHttp =
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "::1" ||
        parsed.hostname === "[::1]");
    if (!isHttps && !isLoopbackHttp) return fallback;
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

function normalizedDesktopStartMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "cloud" ||
    normalized === "hosted" ||
    normalized === "remote" ||
    normalized === "azure"
  ) {
    return "cloud";
  }
  return "local";
}

const DESKTOP_CLOUD_ORIGIN = normalizeHttpOrigin(
  process.env.OPTALE_DESKTOP_CLOUD_ORIGIN ||
    process.env.NEXT_PUBLIC_OPTALE_DESKTOP_CLOUD_ORIGIN ||
    packagedRuntimeConfig.cloudOrigin,
  DEFAULT_CLOUD_ORIGIN
);
const DESKTOP_START_MODE = normalizedDesktopStartMode(
  process.env.OPTALE_DESKTOP_START_MODE ||
    process.env.NEXT_PUBLIC_OPTALE_DESKTOP_START_MODE ||
    packagedRuntimeConfig.startMode
);

process.env.OPTALE_DESKTOP_CLOUD_ORIGIN =
  process.env.OPTALE_DESKTOP_CLOUD_ORIGIN || DESKTOP_CLOUD_ORIGIN;
process.env.NEXT_PUBLIC_OPTALE_DESKTOP_CLOUD_ORIGIN =
  process.env.NEXT_PUBLIC_OPTALE_DESKTOP_CLOUD_ORIGIN || DESKTOP_CLOUD_ORIGIN;
process.env.OPTALE_DESKTOP_START_MODE =
  process.env.OPTALE_DESKTOP_START_MODE || DESKTOP_START_MODE;
process.env.NEXT_PUBLIC_OPTALE_DESKTOP_START_MODE =
  process.env.NEXT_PUBLIC_OPTALE_DESKTOP_START_MODE || DESKTOP_START_MODE;

const managedDataDir = path.join(app.getPath("userData"), DATA_DIR_BASENAME);
const updateStatusPath = path.join(managedDataDir, ".cabinet-state", "update-status.json");
let mainWindow = null;
let backendChildren = [];
const DEV_APP_DISCOVERY_TIMEOUT_MS = 45_000;

function copyRecursiveNoOverwrite(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursiveNoOverwrite(path.join(src, entry), path.join(dest, entry));
    }
  } else if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function hasUserContent(dir) {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((entry) => entry !== ".cabinet-state");
}

function legacyCabinetDataDir() {
  return path.join(app.getPath("appData"), "Cabinet", DATA_DIR_BASENAME);
}

function maybeMigrateLegacyCabinetData() {
  if (RUNTIME_MODE !== "operator") return;
  if (process.env.OPTALE_DESKTOP_MIGRATE_LEGACY_DATA === "0") return;

  const legacyDataDir = legacyCabinetDataDir();
  if (legacyDataDir === managedDataDir) return;
  if (!hasUserContent(legacyDataDir) || hasUserContent(managedDataDir)) return;

  copyRecursiveNoOverwrite(legacyDataDir, managedDataDir);
  fs.mkdirSync(path.join(managedDataDir, ".cabinet-state"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(managedDataDir, ".cabinet-state", "legacy-data-migration.json"),
    JSON.stringify(
      {
        migratedAt: new Date().toISOString(),
        from: legacyDataDir,
        to: managedDataDir,
      },
      null,
      2
    ),
    "utf8"
  );
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

  throw new Error(`Timed out waiting for ${PRODUCT_NAME} at ${url}`);
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
    "node"
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
  copyRecursiveNoOverwrite(seedDir, managedDataDir);
}

function ensureManagedData() {
  fs.mkdirSync(managedDataDir, { recursive: true });
  maybeMigrateLegacyCabinetData();
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
    `Timed out waiting for a local ${PRODUCT_NAME} dev app. Start \`npm run dev\` first.`
  );
}

async function startEmbeddedCabinet() {
  if (DESKTOP_START_MODE === "cloud") {
    return {
      appUrl: DESKTOP_CLOUD_ORIGIN,
      startMode: "cloud",
    };
  }

  if (isDev) {
    return {
      appUrl: await resolveDevAppUrl(),
      startMode: "local",
    };
  }

  ensureManagedData();

  const externalModulesDir = extractNativeModules();
  const [appPort, daemonPort] = await Promise.all([getFreePort(), getFreePort()]);
  const appOrigin = `http://127.0.0.1:${appPort}`;
  const daemonOrigin = `http://127.0.0.1:${daemonPort}`;
  const daemonWsOrigin = `ws://127.0.0.1:${daemonPort}`;

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(appPort),
    CABINET_RUNTIME: "electron",
    CABINET_INSTALL_KIND: "electron-macos",
    CABINET_DATA_DIR: managedDataDir,
    CABINET_APP_PORT: String(appPort),
    CABINET_DAEMON_PORT: String(daemonPort),
    CABINET_APP_ORIGIN: appOrigin,
    CABINET_DAEMON_URL: daemonOrigin,
    CABINET_PUBLIC_DAEMON_ORIGIN: daemonWsOrigin,
    NEXT_PUBLIC_OPTALE_PRODUCT_NAME:
      process.env.NEXT_PUBLIC_OPTALE_PRODUCT_NAME || PRODUCT_NAME,
    NEXT_PUBLIC_OPTALE_PRODUCT_SHORT_NAME:
      process.env.NEXT_PUBLIC_OPTALE_PRODUCT_SHORT_NAME || "Console",
    OPTALE_DESKTOP_PROFILE: DESKTOP_PROFILE,
    OPTALE_RUNTIME_MODE: RUNTIME_MODE,
    NEXT_PUBLIC_OPTALE_DESKTOP_PROFILE:
      process.env.NEXT_PUBLIC_OPTALE_DESKTOP_PROFILE || DESKTOP_PROFILE,
    NEXT_PUBLIC_OPTALE_RUNTIME_MODE:
      process.env.NEXT_PUBLIC_OPTALE_RUNTIME_MODE || RUNTIME_MODE,
    OPTALE_DESKTOP_CLOUD_ORIGIN: DESKTOP_CLOUD_ORIGIN,
    NEXT_PUBLIC_OPTALE_DESKTOP_CLOUD_ORIGIN: DESKTOP_CLOUD_ORIGIN,
    OPTALE_DESKTOP_START_MODE: DESKTOP_START_MODE,
    NEXT_PUBLIC_OPTALE_DESKTOP_START_MODE: DESKTOP_START_MODE,
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
  return { appUrl: appOrigin, startMode: "local" };
}

function configureAutoUpdates() {
  if (process.platform !== "darwin") {
    return;
  }

  try {
    updateElectronApp({
      repo: UPDATE_REPO,
      updateInterval: "4 hours",
      notifyUser: false,
    });
  } catch (error) {
    writeUpdateStatus({
      state: "failed",
      completedAt: new Date().toISOString(),
      installKind: "electron-macos",
      message: "Electron update setup failed.",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  autoUpdater.on("checking-for-update", () => {
    writeUpdateStatus({
      state: "checking",
      startedAt: new Date().toISOString(),
      installKind: "electron-macos",
      message: `Checking for a newer ${PRODUCT_NAME} desktop release...`,
    });
  });

  autoUpdater.on("update-available", () => {
    writeUpdateStatus({
      state: "available",
      startedAt: new Date().toISOString(),
      installKind: "electron-macos",
      message: `A new ${PRODUCT_NAME} desktop release is downloading in the background.`,
    });
  });

  autoUpdater.on("update-not-available", () => {
    writeUpdateStatus({
      state: "idle",
      completedAt: new Date().toISOString(),
      installKind: "electron-macos",
      message: `${PRODUCT_NAME} desktop is up to date.`,
    });
  });

  autoUpdater.on("error", (error) => {
    writeUpdateStatus({
      state: "failed",
      completedAt: new Date().toISOString(),
      installKind: "electron-macos",
      message: `${PRODUCT_NAME} desktop update failed.`,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  autoUpdater.on("update-downloaded", async () => {
    writeUpdateStatus({
      state: "restart-required",
      completedAt: new Date().toISOString(),
      installKind: "electron-macos",
      message: `Restart ${PRODUCT_NAME} to finish applying the desktop update.`,
    });

    const prompt = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Restart to update", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: `${PRODUCT_NAME} update ready`,
      message: `A new ${PRODUCT_NAME} desktop release is ready.`,
      detail:
        `Your desktop data stays outside the app bundle, but keeping a copy is still recommended while ${PRODUCT_NAME} is moving fast.`,
    });

    if (prompt.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
}

function cleanupBackends() {
  for (const child of backendChildren) {
    child.kill("SIGTERM");
  }
  backendChildren = [];
}

/**
 * macOS uninstall — removes the .app bundle, caches, preferences, saved
 * application state, web storage, and logs. Does NOT touch user data at
 * the managed desktop data directory (the cabinet itself).
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
  // Targets exclude the app userData directory because that is user data.
  const targets = [
    `/Applications/${PRODUCT_NAME}.app`,
    `${HOME}/Library/Caches/${PRODUCT_NAME}`,
    `${HOME}/Library/Caches/${APP_BUNDLE_ID}`,
    `${HOME}/Library/Caches/${APP_BUNDLE_ID}.ShipIt`,
    `${HOME}/Library/HTTPStorages/${APP_BUNDLE_ID}`,
    `${HOME}/Library/HTTPStorages/${APP_BUNDLE_ID}.binarycookies`,
    `${HOME}/Library/WebKit/${APP_BUNDLE_ID}`,
    `${HOME}/Library/Preferences/${APP_BUNDLE_ID}.plist`,
    `${HOME}/Library/Saved Application State/${APP_BUNDLE_ID}.savedState`,
    `${HOME}/Library/Logs/${PRODUCT_NAME}`,
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

ipcMain.handle("cabinet:desktop-runtime", () => {
  return {
    runtime: "electron",
    platform: process.platform,
    startMode: DESKTOP_START_MODE,
    cloudOrigin: DESKTOP_CLOUD_ORIGIN,
    profile: DESKTOP_PROFILE,
    mode: RUNTIME_MODE,
  };
});

async function createWindow() {
  const runtime = await startEmbeddedCabinet();

  mainWindow = new BrowserWindow({
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

  if (isDev && runtime.startMode === "local") {
    mainWindow.webContents.on("did-fail-load", async (_event, errorCode, errorDescription) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }

      if (errorCode === -3) {
        return;
      }

      try {
        const nextUrl = await resolveDevAppUrl(15_000);
        await mainWindow.loadURL(nextUrl);
      } catch {
        dialog.showErrorBox(
          `${PRODUCT_NAME} Dev Server Unavailable`,
          `Electron could not reach the local ${PRODUCT_NAME} dev app.\n\nLast Chromium error: ${errorDescription} (${errorCode})\n\nStart \`npm run dev\` and try again.`
        );
      }
    });
  }

  await mainWindow.loadURL(runtime.appUrl);
}

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
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

app.whenReady().then(async () => {
  configureAutoUpdates();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("CabinetDesktop", {
  runtime: "electron",
  platform: process.platform,
  startMode: process.env.NEXT_PUBLIC_OPTALE_DESKTOP_START_MODE || "local",
  cloudOrigin: process.env.NEXT_PUBLIC_OPTALE_DESKTOP_CLOUD_ORIGIN || null,
  getRuntime: () => ipcRenderer.invoke("cabinet:desktop-runtime"),
  /**
   * Trigger the in-app macOS uninstall flow. Returns
   * `{ ok: true, dataPath }` on success — the renderer should show a
   * confirmation toast referencing `dataPath` so the user knows their
   * cabinet content is preserved.
   */
  uninstallApp: () => ipcRenderer.invoke("cabinet:uninstall-app"),
});

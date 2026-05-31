import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";

/**
 * Multi-window support. A window's scope lives entirely in the URL hash
 * (see `useHashRoute`), so opening a room/cabinet in its own window is just
 * "open the app at this hash". In Electron we ask the main process to spawn a
 * real BrowserWindow; on the web we open a new browser window/tab.
 */

/** Build the canonical hash for a room/cabinet path (root → #/home). */
export function buildRoomHash(cabinetPath: string): string {
  if (!cabinetPath || cabinetPath === ROOT_CABINET_PATH) return "#/home";
  const encoded = cabinetPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `#/cabinet/${encoded}`;
}

interface CabinetDesktopApi {
  openWindow?: (hash: string) => unknown;
}

function desktopApi(): CabinetDesktopApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { CabinetDesktop?: CabinetDesktopApi })
    .CabinetDesktop;
}

/** True when running inside the Electron desktop shell. */
export function isDesktop(): boolean {
  return !!desktopApi();
}

/**
 * Open the given room/cabinet in a new window.
 * - Electron: spawns a native BrowserWindow at the same app URL + hash.
 * - Web: opens a new browser window/tab at the current origin + hash.
 */
export function openRoomWindow(cabinetPath: string): void {
  if (typeof window === "undefined") return;
  const hash = buildRoomHash(cabinetPath);

  const desktop = desktopApi();
  if (desktop?.openWindow) {
    desktop.openWindow(hash);
    return;
  }

  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  window.open(`${base}${hash}`, "_blank", "noopener");
}

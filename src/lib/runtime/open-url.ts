"use client";

interface CabinetDesktopBridge {
  runtime?: "electron";
  openLocalFile?: (path: string) => Promise<{ ok: boolean; error?: string }>;
  openExternal?: (url: string) => Promise<{ ok: boolean; error?: string }>;
}

function getBridge(): CabinetDesktopBridge {
  return (window as unknown as { CabinetDesktop?: CabinetDesktopBridge })
    .CabinetDesktop ?? {};
}

export function openUrlInAppropriateContext(
  url: string,
  openInBrowseMode: (url: string) => void
): void {
  const bridge = getBridge();
  const isElectron = bridge.runtime === "electron";

  // file:// URLs can't be loaded in a browser view or window.open —
  // Electron blocks them. Use shell.openPath to open with the OS default app.
  if (url.startsWith("file://")) {
    const filePath = decodeURIComponent(url.slice("file://".length));
    if (isElectron && bridge.openLocalFile) {
      void bridge.openLocalFile(filePath);
      return;
    }
    // In browser mode, there's no way to open local files — show a toast
    // with the file path and a "Copy path" action so the user can open it
    // manually in Finder/File Explorer.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: {
            kind: "info",
            message: `Local file: ${filePath}`,
            actionLabel: "Copy path",
            onAction: () => {
              navigator.clipboard?.writeText(filePath).catch(() => {});
            },
          },
        })
      );
    }
    return;
  }

  if (isElectron) {
    openInBrowseMode(url);
  } else {
    window.open(url, "_blank");
  }
}

/**
 * Open a URL in the user's SYSTEM default browser (never the in-app browse
 * view). Used for OAuth sign-in flows where the embedded browser lacks the
 * user's provider session. Falls back to window.open in the web build.
 */
export function openExternalUrl(url: string): void {
  const bridge = getBridge();
  if (bridge.runtime === "electron" && bridge.openExternal) {
    void bridge.openExternal(url);
    return;
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

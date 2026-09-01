"use client"

import * as React from "react"
import { useAppStore } from "@/stores/app-store"

/**
 * Rendered inside popup portals so it mounts only while the popup is open.
 * The native Electron browser view paints above the entire DOM, so browse
 * mode hides the view while any popup is open (see browser-view.tsx).
 */
function BrowserOverlayGuard() {
  React.useEffect(() => {
    const { pushBrowserOverlay, popBrowserOverlay } = useAppStore.getState()
    pushBrowserOverlay()
    return popBrowserOverlay
  }, [])
  return null
}

export { BrowserOverlayGuard }

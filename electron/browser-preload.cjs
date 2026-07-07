const { ipcRenderer, webFrame } = require("electron");

// Spoof navigator.userAgentData and provide a fake chrome.webstorePrivate to pass Google's strict client-side checks
webFrame.executeJavaScript(`
  Object.defineProperty(navigator, 'userAgentData', {
    get: () => ({
      brands: [
        { brand: "Google Chrome", version: "136" },
        { brand: "Chromium", version: "136" },
        { brand: "Not_A Brand", version: "24" }
      ],
      mobile: false,
      platform: "macOS"
    })
  });
  window.chrome = window.chrome || {};
  window.chrome.webstorePrivate = window.chrome.webstorePrivate || {};
`);

document.addEventListener(
  "click",
  (e) => {
    if (window.location.hostname !== "chromewebstore.google.com") return;

    // Check if the clicked element or any of its ancestors is a button that looks like "Add to Chrome"
    const target = e.target;
    const button = target.closest("button");
    if (!button) return;

    const text = button.textContent.toLowerCase();
    const ariaLabel = (button.getAttribute("aria-label") || "").toLowerCase();

    const isInstallButton =
      text.includes("add to chrome") ||
      text.includes("add to brave") ||
      ariaLabel.includes("add to chrome");

    if (isInstallButton) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const parts = window.location.pathname.split("/");
      const extensionId = parts[parts.length - 1];

      if (extensionId && extensionId.length === 32) {
        button.textContent = "Installing...";
        button.disabled = true;

        ipcRenderer.invoke("cabinet:web-store-install", { extensionId }).then((res) => {
          if (res.ok) {
            button.textContent = "Installed";
          } else {
            button.textContent = "Failed";
            button.disabled = false;
          }
        }).catch(() => {
          button.textContent = "Failed";
          button.disabled = false;
        });
      }
    }
  },
  true // Use capture phase to intercept before React or other handlers
);

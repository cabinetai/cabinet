/* eslint-disable @typescript-eslint/no-require-imports */
const { webFrame } = require("electron");

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

import type { NextConfig } from "next";

// Next.js 15 blocks cross-origin dev requests (HMR, /_next/*) from any Host
// not listed here. Loopback works for local desktop use, but Cabinet is also
// run on a LAN box / home server / VPS and accessed from another machine,
// in which case the operator sets CABINET_APP_ORIGIN. Auto-allow its host.
function resolveAllowedDevOrigins(): string[] {
  const origins = new Set<string>(["127.0.0.1", "localhost"]);
  const appOrigin = process.env.CABINET_APP_ORIGIN?.trim();
  if (appOrigin) {
    try {
      const { hostname } = new URL(appOrigin);
      if (hostname) origins.add(hostname);
    } catch {
      // Malformed CABINET_APP_ORIGIN — ignore.
    }
  }
  return Array.from(origins);
}

const nextConfig: NextConfig = {
  allowedDevOrigins: resolveAllowedDevOrigins(),
  compiler: {
    removeConsole: {
      exclude: ["error", "warn"],
    },
  },
  output: "standalone",
  // Audit #219 / #220: the floating Next.js dev indicator sat on top of the
  // sidebar "New Page" button and was visible in the product chrome even in
  // dev. Disable it entirely — actual Next.js compile errors still surface
  // via the terminal and the error overlay.
  devIndicators: false,
  serverExternalPackages: ["node-pty", "simple-git", "better-sqlite3"],
  outputFileTracingExcludes: {
    "/*": [
      ".next/dev/**/*",
      ".next/cache/**/*",
      ".git/**/*",
      ".github/**/*",
      ".claude/**/*",
      ".agents/**/*",
      "coverage/**/*",
      "out/**/*",
      "test/**/*",
      "**/.DS_Store",
    ],
  },
};

export default nextConfig;

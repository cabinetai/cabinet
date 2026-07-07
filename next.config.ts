import type { NextConfig } from "next";

// Next.js 15 blocks cross-origin dev requests (HMR, /_next/*) from any Host
// not listed here. Loopback works for local desktop use, but Cabinet is also
// run on a LAN box / home server / VPS and accessed from another machine,
// in which case the operator sets CABINET_APP_ORIGIN. Auto-allow its host.
function resolveAllowedDevOrigins(): string[] {
  const origins = new Set<string>(["127.0.0.1", "localhost"]);
  // CABINET_APP_ORIGIN may carry one URL or a comma-separated list (the
  // daemon already supports the list form for its browser-origin allowlist;
  // mirror that here so a single env var configures both surfaces).
  const raw = process.env.CABINET_APP_ORIGIN?.trim();
  if (raw) {
    for (const candidate of raw.split(",").map((v) => v.trim()).filter(Boolean)) {
      try {
        const { hostname } = new URL(candidate);
        if (hostname) origins.add(hostname);
      } catch {
        // Malformed entry — skip it but keep parsing the rest.
      }
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
  async rewrites() {
    return [
      {
        source: "/room/:path*\\.:ext(html|pdf|csv|ipynb|tex|latex|typ)",
        destination: "/room/:path*",
      },
    ];
  },
};

export default nextConfig;

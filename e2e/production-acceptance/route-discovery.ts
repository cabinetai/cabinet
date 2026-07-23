import fs from "node:fs/promises";
import path from "node:path";

import type { RouteChecklistEntry } from "./contracts";

const EXCLUDED_PREFIXES = ["/api", "/demo", "/agents-demo", "/agent-preview", "/providers-demo"];

function routeFromPage(appRoot: string, file: string): RouteChecklistEntry {
  const relative = path.relative(appRoot, path.dirname(file));
  const segments = relative === "" ? [] : relative.split(path.sep);
  const route =
    "/" +
    segments
      .filter((segment) => !segment.startsWith("("))
      .map((segment) => {
        if (segment === "[...slug]") return "*";
        const dynamic = segment.match(/^\[(.+)]$/);
        return dynamic ? `:${dynamic[1]}` : segment;
      })
      .join("/");
  return {
    route: route === "/*" ? "/*" : route.replace(/\/$/, "") || "/",
    source: path.relative(process.cwd(), file),
    kind: route.includes(":") ? "dynamic" : route === "/*" ? "spa" : "static",
    discovered: true,
    exercised: false,
    status: "not_run",
  };
}

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(target);
      return entry.isFile() && entry.name === "page.tsx" ? [target] : [];
    })
  );
  return nested.flat();
}

export async function discoverRouteManifest(repoRoot: string): Promise<RouteChecklistEntry[]> {
  const appRoot = path.join(repoRoot, "src/app");
  const pages = await walk(appRoot);
  const discovered = pages
    .map((file) => routeFromPage(appRoot, file))
    .filter((entry) => !EXCLUDED_PREFIXES.some((prefix) => entry.route.startsWith(prefix)));

  const requiredSpaRoutes: RouteChecklistEntry[] = [
    ["/room/acceptance-cabinet", "room data"],
    ["/room/acceptance-cabinet/-/agents", "Team"],
    ["/room/acceptance-cabinet/-/tasks", "Tasks"],
    ["/hermes", "Operator"],
    ["/hermes?mode=developer&section=developer", "Developer"],
    ["/settings/providers", "Advanced Hermes"],
  ].map(([route, note]) => ({
    route,
    source: "SPA navigation contract",
    kind: "spa",
    discovered: true,
    exercised: false,
    status: "not_run",
    note,
  }));

  return [...discovered, ...requiredSpaRoutes].sort((a, b) => a.route.localeCompare(b.route));
}

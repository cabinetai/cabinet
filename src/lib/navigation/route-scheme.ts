import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import type { SelectedSection } from "@/stores/app-store";

/**
 * Clean-path URL scheme (PRD §11). The app moves off hash routing onto real
 * paths that mirror the file tree:
 *
 *   /                                  → home (room list)
 *   /room/<path>                       → content: a cabinet overview OR a page
 *                                        (resolved downstream — see CleanRoute.content)
 *   /room/<cab>/-/agents[/<sub|slug>]  → a cabinet's agents view / sub-tab / agent
 *   /room/<cab>/-/tasks[/<id>]         → a cabinet's tasks / a task
 *   /settings[/<tab>]  /integrations[/<id>]  /help  /registry
 *
 * `-` is a reserved view marker that terminates the cabinet path (a folder
 * can't be named `-`). `#` is left entirely for in-page section anchors.
 *
 * This module is the single source of truth for build+parse; it is pure and
 * fully unit-tested. The cabinet-vs-page distinction for `/room/<path>` is
 * deliberately NOT made here (it needs the cabinet set / tree): parse returns
 * a `content` route and the apply layer decides overview vs editor.
 */

export type AgentsTab = "agents" | "routines" | "heartbeats" | "schedule" | "channels";

export type CleanRoute =
  | { kind: "home" }
  | { kind: "settings"; slug?: string }
  | { kind: "integrations"; slug?: string }
  | { kind: "help" }
  | { kind: "registry" }
  | { kind: "content"; path: string }
  | { kind: "agents"; cabinetPath: string; agentsTab?: AgentsTab }
  | { kind: "agent"; cabinetPath: string; slug: string }
  | { kind: "tasks"; cabinetPath: string }
  | { kind: "task"; cabinetPath: string; taskId: string };

const VIEW_MARKER = "-";

function isAgentsTab(v: string | undefined): v is AgentsTab {
  return v === "agents" || v === "routines" || v === "heartbeats" || v === "schedule" || v === "channels";
}

/** Encode each path segment individually so the joining `/` stays literal. */
function enc(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function isRealCabinet(cabinetPath?: string): cabinetPath is string {
  return !!cabinetPath && cabinetPath !== ROOT_CABINET_PATH;
}

/** Build a clean URL path (leading `/`, no hash) from the app's section. */
export function buildPath(
  section: SelectedSection,
  pagePath: string | null
): string {
  const cab = isRealCabinet(section.cabinetPath) ? section.cabinetPath : null;

  switch (section.type) {
    case "home":
      return "/";
    case "settings":
      return section.slug ? `/settings/${enc(section.slug)}` : "/settings";
    case "integrations":
      return section.slug ? `/integrations/${enc(section.slug)}` : "/integrations";
    case "help":
      return "/help";
    case "registry":
      return "/registry";
    case "page": {
      const p = pagePath || cab;
      return p ? `/room/${enc(p)}` : "/";
    }
    case "cabinet":
      return cab ? `/room/${enc(cab)}` : "/";
    case "agents": {
      if (!cab) return "/";
      const tab =
        section.agentsTab && section.agentsTab !== "agents"
          ? `/${section.agentsTab}`
          : "";
      return `/room/${enc(cab)}/${VIEW_MARKER}/agents${tab}`;
    }
    case "agent":
      return cab && section.slug
        ? `/room/${enc(cab)}/${VIEW_MARKER}/agents/${enc(section.slug)}`
        : "/";
    case "tasks":
      return cab ? `/room/${enc(cab)}/${VIEW_MARKER}/tasks` : "/";
    case "task":
      return cab && section.taskId
        ? `/room/${enc(cab)}/${VIEW_MARKER}/tasks/${enc(section.taskId)}`
        : "/";
    default:
      return "/";
  }
}

/** Parse a clean URL path into a CleanRoute. Inverse of buildPath. */
export function parsePath(pathname: string): CleanRoute {
  const segs = pathname
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });

  if (segs.length === 0) return { kind: "home" };
  const [head, ...rest] = segs;

  if (head === "home") return { kind: "home" };
  if (head === "help") return { kind: "help" };
  if (head === "registry") return { kind: "registry" };
  if (head === "settings") return { kind: "settings", slug: rest[0] };
  if (head === "integrations") return { kind: "integrations", slug: rest[0] };

  if (head === "room") {
    const markerIdx = rest.indexOf(VIEW_MARKER);
    if (markerIdx === -1) {
      // No view marker → bare content. Cabinet-vs-page resolved downstream.
      return { kind: "content", path: rest.join("/") };
    }
    const cabinetPath = rest.slice(0, markerIdx).join("/");
    const view = rest[markerIdx + 1];
    const arg = rest[markerIdx + 2];

    if (view === "agents") {
      if (isAgentsTab(arg) && arg !== "agents") {
        return { kind: "agents", cabinetPath, agentsTab: arg };
      }
      if (arg) return { kind: "agent", cabinetPath, slug: arg };
      return { kind: "agents", cabinetPath };
    }
    if (view === "tasks") {
      if (arg) return { kind: "task", cabinetPath, taskId: arg };
      return { kind: "tasks", cabinetPath };
    }
    // Unknown view marker → treat the prefix as a cabinet root (content).
    return { kind: "content", path: cabinetPath };
  }

  // Anything else isn't part of our scheme (real Next routes are served
  // server-side and never reach this parser); fall back to home.
  return { kind: "home" };
}

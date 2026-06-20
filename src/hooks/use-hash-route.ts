"use client";

import { useEffect, useRef } from "react";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { buildTaskHash, buildTasksHash } from "@/lib/navigation/task-route";
import { buildPath, parsePath, type CleanRoute } from "@/lib/navigation/route-scheme";
import { findNodeByPath } from "@/lib/cabinets/tree";
import { normalizeVirtualPath } from "@/lib/virtual-paths";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";

/**
 * Sync app navigation state with URL hash + localStorage persistence.
 *
 * Canonical hash forms (audit #122/#124 — clean, human-readable URLs):
 *
 * Root cabinet (implicit):
 *   #/home
 *   #/p/{pagePath}           ← page in root cabinet
 *   #/agents                 ← agents list (root cabinet)
 *   #/a/{slug}               ← agent detail (root cabinet)
 *   #/tasks                  ← tasks list (root cabinet)
 *   #/tasks/{taskId}         ← task detail (root cabinet)
 *   #/settings
 *   #/settings/{tab}
 *   #/integrations           ← integrations hub
 *   #/integrations/{id}      ← integration detail (e.g. discord)
 *   #/help
 *
 * Named sub-cabinets (cabinet path explicit):
 *   #/cabinet/{cabinetPath}
 *   #/cabinet/{cabinetPath}/data/{pagePath}
 *   #/cabinet/{cabinetPath}/agents
 *   #/cabinet/{cabinetPath}/agents/{slug}
 *   #/cabinet/{cabinetPath}/tasks
 *   #/cabinet/{cabinetPath}/tasks/{taskId}
 *
 * Legacy back-compat: `#/page/...`, `#/cabinet/./...` are still parsed
 * and rewritten to the canonical form on the next navigation.
 */

type SectionState = ReturnType<typeof useAppStore.getState>["section"];

interface RouteState {
  section: SectionState;
  pagePath: string | null;
}

// Audit #011: encode each path segment individually so the joining `/`
// stays literal in the URL. Previously a nested path like
// `marketing/drafts/foo` rendered as `marketing%2Fdrafts%2Ffoo` — ugly
// to copy/paste, hard to read in the address bar, and a regression of
// the prior audit's clean-URL choice (#141 from 2026-04-25).
function encodePathSegment(value: string): string {
  if (!value) return value;
  return value
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function decodePathSegment(value?: string): string {
  if (!value) return ROOT_CABINET_PATH;
  try {
    return value
      .split("/")
      .map((seg) => decodeURIComponent(seg))
      .join("/") || ROOT_CABINET_PATH;
  } catch {
    return value || ROOT_CABINET_PATH;
  }
}

const AGENTS_SUB_TABS = ["agents", "routines", "heartbeats", "schedule", "channels"] as const;
type AgentsSubTab = (typeof AGENTS_SUB_TABS)[number];

function isAgentsSubTab(value: string | undefined): value is AgentsSubTab {
  return !!value && (AGENTS_SUB_TABS as readonly string[]).includes(value);
}

function normalizeRoutePath(value: string): string {
  if (value === ROOT_CABINET_PATH) return ROOT_CABINET_PATH;
  return normalizeVirtualPath(value);
}

function buildHash(section: SectionState, pagePath: string | null): string {
  const cabinetPath = normalizeRoutePath(section.cabinetPath || ROOT_CABINET_PATH);
  const normalizedPagePath = pagePath ? normalizeRoutePath(pagePath) : null;
  const isRoot = cabinetPath === ROOT_CABINET_PATH;

  if (section.type === "page" && normalizedPagePath) {
    if (isRoot) {
      // Clean short form: #/p/data/audit-fix-progress
      return `#/p/${encodePathSegment(normalizedPagePath)}`;
    }
    return `#/cabinet/${encodePathSegment(cabinetPath)}/data/${encodePathSegment(normalizedPagePath)}`;
  }
  if (section.type === "cabinet") {
    if (isRoot) return "#/home";
    return `#/cabinet/${encodePathSegment(cabinetPath)}`;
  }
  if (section.type === "agent" && section.slug) {
    if (isRoot) {
      // Clean short form: #/a/harel
      return `#/a/${encodePathSegment(section.slug)}`;
    }
    return `#/cabinet/${encodePathSegment(cabinetPath)}/agents/${encodePathSegment(section.slug)}`;
  }
  if (section.type === "agents") {
    const tabSuffix =
      section.agentsTab && section.agentsTab !== "agents"
        ? `/${section.agentsTab}`
        : "";
    if (isRoot) return `#/agents${tabSuffix}`;
    return `#/cabinet/${encodePathSegment(cabinetPath)}/agents${tabSuffix}`;
  }
  if (section.type === "task" && section.taskId) {
    return buildTaskHash(section.taskId, cabinetPath);
  }
  if (section.type === "tasks") {
    return buildTasksHash(cabinetPath);
  }
  if (section.type === "settings") {
    return section.slug
      ? `#/settings/${encodePathSegment(section.slug)}`
      : "#/settings";
  }
  if (section.type === "integrations") {
    // `slug` carries the selected integration id (e.g. "discord").
    return section.slug
      ? `#/integrations/${encodePathSegment(section.slug)}`
      : "#/integrations";
  }
  if (section.type === "help") return "#/help";
  if (section.type === "home") return "#/home";
  return "#/home";
}

function parseHash(hash: string): RouteState {
  const raw = hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean);

  if (parts.length === 0 || parts[0] === "home") {
    return { section: { type: "home" }, pagePath: null };
  }

  // New canonical short forms (audit #122)
  if (parts[0] === "p") {
    return {
      section: { type: "page", cabinetPath: ROOT_CABINET_PATH },
      pagePath: normalizeRoutePath(decodePathSegment(parts.slice(1).join("/"))),
    };
  }

  if (parts[0] === "a") {
    if (parts[1]) {
      const slug = decodePathSegment(parts[1]);
      return {
        section: {
          type: "agent",
          cabinetPath: ROOT_CABINET_PATH,
          slug,
          agentScopedId: `${ROOT_CABINET_PATH}::agent::${slug}`,
        },
        pagePath: null,
      };
    }
    return {
      section: { type: "agents", cabinetPath: ROOT_CABINET_PATH },
      pagePath: null,
    };
  }

  if (parts[0] === "page") {
    // Legacy form — still accepted so old bookmarks keep working.
    return {
      section: { type: "page", cabinetPath: ROOT_CABINET_PATH },
      pagePath: normalizeRoutePath(decodePathSegment(parts.slice(1).join("/"))),
    };
  }

  if (parts[0] === "cabinet") {
    // Marker-scan (fixes the nested-cabinet reload bug): the cabinet path can
    // be many segments (`a/b/c`), so we can't assume it's `parts[1]`. Scan for
    // the FIRST structural marker (`data`/`agents`/`tasks`) — everything before
    // it is the cabinet path, the marker says what view follows, everything
    // after is the page/slug/id. Page paths that themselves contain the words
    // `data`/`agents`/`tasks` round-trip because the FIRST marker is the
    // structural one and the rest is taken verbatim. A cabinet must therefore
    // not be named exactly `data`/`agents`/`tasks` (reserved). With no marker
    // the whole tail is a cabinet path (a cabinet-root view) — this is what
    // makes `#/cabinet/a/b/c` reload correctly instead of collapsing to `a`.
    // Path outputs are run through normalizeRoutePath so Windows `\` separators
    // (PR #93 / virtual-paths) collapse to `/` before they reach app state.
    const CABINET_MARKERS = new Set(["data", "agents", "tasks"]);
    const rest = parts.slice(1);
    const markerIdx = rest.findIndex((seg) => CABINET_MARKERS.has(seg));

    if (markerIdx === -1) {
      return {
        section: {
          type: "cabinet",
          cabinetPath: normalizeRoutePath(decodePathSegment(rest.join("/"))),
        },
        pagePath: null,
      };
    }

    const cabinetPath = normalizeRoutePath(decodePathSegment(rest.slice(0, markerIdx).join("/")));
    const marker = rest[markerIdx];
    const after = rest.slice(markerIdx + 1);

    if (marker === "data") {
      if (after.length === 0) {
        return { section: { type: "cabinet", cabinetPath }, pagePath: null };
      }
      return {
        section: { type: "page", cabinetPath },
        pagePath: normalizeRoutePath(decodePathSegment(after.join("/"))),
      };
    }

    if (marker === "agents") {
      if (after[0] && isAgentsSubTab(after[0])) {
        return {
          section: { type: "agents", cabinetPath, agentsTab: after[0] },
          pagePath: null,
        };
      }
      if (after[0]) {
        const slug = decodePathSegment(after[0]);
        return {
          section: {
            type: "agent",
            cabinetPath,
            slug,
            agentScopedId: `${cabinetPath}::agent::${slug}`,
          },
          pagePath: null,
        };
      }
      return { section: { type: "agents", cabinetPath }, pagePath: null };
    }

    // marker === "tasks"
    if (after[0]) {
      return {
        section: { type: "task", cabinetPath, taskId: decodePathSegment(after[0]) },
        pagePath: null,
      };
    }
    return { section: { type: "tasks", cabinetPath }, pagePath: null };
  }

  if (parts[0] === "settings") {
    return {
      section: {
        type: "settings",
        slug: parts[1] ? decodePathSegment(parts[1]) : undefined,
      },
      pagePath: null,
    };
  }

  if (parts[0] === "integrations") {
    // `#/integrations` (hub) or `#/integrations/{id}` (detail) — id in `slug`.
    return {
      section: {
        type: "integrations",
        slug: parts[1] ? decodePathSegment(parts[1]) : undefined,
      },
      pagePath: null,
    };
  }

  if (parts[0] === "help") {
    return { section: { type: "help" }, pagePath: null };
  }

  // Bare-route aliases scoped to the root cabinet. Lets every shared link of
  // the form `/#/tasks`, `/#/agents` land on the correct view without having
  // to know about the internal `/#/cabinet/./tasks` shape. Audit #11, #12.
  if (parts[0] === "agents") {
    // `#/agents/{sub-tab}` for the new V2 layout — sub-tab takes priority
    // over the legacy `#/agents/{slug}` form (which is now under `#/a/`).
    if (parts[1] && isAgentsSubTab(parts[1])) {
      return {
        section: {
          type: "agents",
          cabinetPath: ROOT_CABINET_PATH,
          agentsTab: parts[1],
        },
        pagePath: null,
      };
    }
    if (parts[1]) {
      const slug = decodePathSegment(parts[1]);
      return {
        section: {
          type: "agent",
          cabinetPath: ROOT_CABINET_PATH,
          slug,
          agentScopedId: `${ROOT_CABINET_PATH}::agent::${slug}`,
        },
        pagePath: null,
      };
    }
    return {
      section: { type: "agents", cabinetPath: ROOT_CABINET_PATH },
      pagePath: null,
    };
  }

  if (parts[0] === "tasks") {
    if (parts[1]) {
      return {
        section: {
          type: "task",
          cabinetPath: ROOT_CABINET_PATH,
          taskId: decodePathSegment(parts[1]),
        },
        pagePath: null,
      };
    }
    return {
      section: { type: "tasks", cabinetPath: ROOT_CABINET_PATH },
      pagePath: null,
    };
  }

  return { section: { type: "home" }, pagePath: null };
}

function expandParents(pagePath: string) {
  const parts = pagePath.split("/").filter(Boolean);
  const expandPath = useTreeStore.getState().expandPath;
  for (let i = 1; i < parts.length; i++) {
    expandPath(parts.slice(0, i).join("/"));
  }
}

/**
 * Decide whether a bare `/room/<path>` is a cabinet overview or a content
 * page (PRD §11). A single segment is always a top-level room (overview). For
 * deeper paths we check the in-memory tree first (instant for in-app nav) and
 * fall back to the server on a cold-load deep link where the tree isn't loaded.
 */
async function resolveIsCabinet(p: string): Promise<boolean> {
  if (!p) return false;
  if (!p.includes("/")) return true; // top-level room
  const node = findNodeByPath(useTreeStore.getState().nodes, p);
  if (node) return node.type === "cabinet";
  try {
    const res = await fetch(`/api/cabinets/classify?path=${encodeURIComponent(p)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { isCabinet?: boolean };
      return !!data.isCabinet;
    }
  } catch {
    // fall through — treat as a page
  }
  return false;
}

async function applyCleanRoute(route: CleanRoute): Promise<void> {
  const { setSection } = useAppStore.getState();
  const { selectPage } = useTreeStore.getState();
  const { loadPage, clear } = useEditorStore.getState();

  const scopeTo = async (cabinetPath: string) => {
    selectPage(cabinetPath);
    await loadPage(cabinetPath);
    if (cabinetPath !== ROOT_CABINET_PATH) expandParents(cabinetPath);
  };
  const goGlobal = (section: SectionState) => {
    setSection(section);
    selectPage(null);
    clear();
  };

  switch (route.kind) {
    case "home":
      return goGlobal({ type: "home" });
    case "settings":
      return goGlobal({ type: "settings", slug: route.slug });
    case "integrations":
      return goGlobal({ type: "integrations", slug: route.slug });
    case "help":
      return goGlobal({ type: "help" });
    case "registry":
      return goGlobal({ type: "registry" });
    case "agents":
      setSection({ type: "agents", cabinetPath: route.cabinetPath, agentsTab: route.agentsTab });
      return scopeTo(route.cabinetPath);
    case "agent":
      setSection({
        type: "agent",
        cabinetPath: route.cabinetPath,
        slug: route.slug,
        agentScopedId: `${route.cabinetPath}::agent::${route.slug}`,
      });
      return scopeTo(route.cabinetPath);
    case "tasks":
      setSection({ type: "tasks", cabinetPath: route.cabinetPath });
      return scopeTo(route.cabinetPath);
    case "task":
      setSection({ type: "task", cabinetPath: route.cabinetPath, taskId: route.taskId });
      return scopeTo(route.cabinetPath);
    case "content": {
      if (!route.path) return goGlobal({ type: "home" });
      if (await resolveIsCabinet(route.path)) {
        setSection({ type: "cabinet", cabinetPath: route.path });
        return scopeTo(route.path);
      }
      // A page: scope to its room (first segment); load the page itself.
      setSection({ type: "page", cabinetPath: route.path.split("/")[0] });
      selectPage(route.path);
      await loadPage(route.path);
      expandParents(route.path);
      return;
    }
  }
}

// Re-exported for unit tests; the parser/builder are otherwise internals of
// the hook implementation and shouldn't be used by app code.
export { parseHash as parseHashForTest, buildHash as buildHashForTest };

/**
 * Clean-path router (PRD §11). The URL is `window.location.pathname`
 * (`/room/<path>`, `/-/` views, globals) — the `#` is free for in-page
 * section anchors. Old `#/...` links are translated to clean paths on load.
 */
export function useRoute() {
  const suppress = useRef(false);

  // Initial load: translate any legacy `#/...` link to a clean path, then
  // apply whatever the pathname says.
  useEffect(() => {
    // Only a route-shaped hash (`#/...`) is a legacy link to translate; a bare
    // `#section` is an in-page anchor and must be left for the scroll handler.
    const hash = window.location.hash;
    if (hash.startsWith("#/") && hash !== "#/") {
      try {
        const legacy = parseHash(hash);
        const cleanPath = buildPath(legacy.section, legacy.pagePath);
        // Preserve any trailing in-page anchor on the legacy URL.
        window.history.replaceState(null, "", cleanPath);
      } catch {
        // ignore a malformed legacy hash
      }
    }

    const route = parsePath(window.location.pathname);
    suppress.current = true;
    void applyCleanRoute(route).finally(() => {
      // Canonicalize: re-derive the URL from the resolved section so an entry
      // form (or content that resolved to a cabinet) settles on one shape.
      const canonical = buildPath(
        useAppStore.getState().section,
        useTreeStore.getState().selectedPath
      );
      if (window.location.pathname !== canonical) {
        window.history.replaceState(null, "", canonical);
      }
      useAppStore.getState().recordNav(canonical);
      requestAnimationFrame(() => {
        suppress.current = false;
      });
    });
  }, []);

  // Reflect store changes into the URL (replaceState, matching the prior
  // behavior; the app's own back/forward uses the nav history below).
  useEffect(() => {
    const writeUrl = (path: string) => {
      if (window.location.pathname !== path) {
        window.history.replaceState(null, "", path);
        useAppStore.getState().recordNav(path);
      }
    };
    const unsubApp = useAppStore.subscribe((state, prev) => {
      if (suppress.current) return;
      if (
        state.section.type !== prev.section.type ||
        state.section.slug !== prev.section.slug ||
        state.section.cabinetPath !== prev.section.cabinetPath ||
        state.section.agentsTab !== prev.section.agentsTab ||
        state.section.taskId !== prev.section.taskId
      ) {
        writeUrl(buildPath(state.section, useTreeStore.getState().selectedPath));
      }
    });
    const unsubTree = useTreeStore.subscribe((state, prev) => {
      if (suppress.current) return;
      if (state.selectedPath !== prev.selectedPath && state.selectedPath) {
        writeUrl(buildPath(useAppStore.getState().section, state.selectedPath));
      }
    });
    return () => {
      unsubApp();
      unsubTree();
    };
  }, []);

  // popstate fires on browser back/forward AND on our goBack/goForward (which
  // replaceState then dispatch a popstate). Re-apply from the pathname.
  useEffect(() => {
    function onPop() {
      const route = parsePath(window.location.pathname);
      suppress.current = true;
      void applyCleanRoute(route).finally(() => {
        useAppStore.getState().recordNav(window.location.pathname);
        requestAnimationFrame(() => {
          suppress.current = false;
        });
      });
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}

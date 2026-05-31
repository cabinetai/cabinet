"use client";

import { useEffect, useRef } from "react";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { buildTaskHash, buildTasksHash } from "@/lib/navigation/task-route";
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

const LS_KEY = "cabinet.last-route";
const SESSION_KEY = "cabinet.tab-visited";

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

const AGENTS_SUB_TABS = ["agents", "routines", "heartbeats", "schedule"] as const;
type AgentsSubTab = (typeof AGENTS_SUB_TABS)[number];

function isAgentsSubTab(value: string | undefined): value is AgentsSubTab {
  return !!value && (AGENTS_SUB_TABS as readonly string[]).includes(value);
}

function buildHash(section: SectionState, pagePath: string | null): string {
  const cabinetPath = section.cabinetPath || ROOT_CABINET_PATH;
  const isRoot = cabinetPath === ROOT_CABINET_PATH;

  if (section.type === "page" && pagePath) {
    if (isRoot) {
      // Clean short form: #/p/data/audit-fix-progress
      return `#/p/${encodePathSegment(pagePath)}`;
    }
    return `#/cabinet/${encodePathSegment(cabinetPath)}/data/${encodePathSegment(pagePath)}`;
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
      pagePath: decodePathSegment(parts.slice(1).join("/")),
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
      pagePath: decodePathSegment(parts.slice(1).join("/")),
    };
  }

  if (parts[0] === "cabinet") {
    const cabinetPath = decodePathSegment(parts[1]);
    const leaf = parts[2];

    if (!leaf) {
      return {
        section: { type: "cabinet", cabinetPath },
        pagePath: null,
      };
    }

    if (leaf === "agents" && parts[3] && isAgentsSubTab(parts[3])) {
      return {
        section: { type: "agents", cabinetPath, agentsTab: parts[3] },
        pagePath: null,
      };
    }

    if (leaf === "agents" && parts[3]) {
      const slug = decodePathSegment(parts[3]);
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

    if (leaf === "agents") {
      return {
        section: { type: "agents", cabinetPath },
        pagePath: null,
      };
    }

    if (leaf === "tasks" && parts[3]) {
      return {
        section: {
          type: "task",
          cabinetPath,
          taskId: decodePathSegment(parts[3]),
        },
        pagePath: null,
      };
    }

    if (leaf === "tasks") {
      return {
        section: { type: "tasks", cabinetPath },
        pagePath: null,
      };
    }

    if (leaf === "data" && parts[3]) {
      const pagePath = decodePathSegment(parts.slice(3).join("/"));
      return {
        section: { type: "page", cabinetPath },
        pagePath,
      };
    }

    // Audit #021: legacy / shorter form `#/cabinet/{cabinetPath}/{pagePath}`
    // (no /data/ segment) used to fall through to the home route, which
    // broke deep-links. Interpret the remaining segments as a page path
    // under the cabinet so reload keeps the user on the page they were on.
    const pagePath = decodePathSegment(parts.slice(2).join("/"));
    return {
      section: { type: "page", cabinetPath },
      pagePath,
    };
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

function saveToLocalStorage(hash: string) {
  try {
    localStorage.setItem(LS_KEY, hash);
  } catch {
    // ignore storage failures
  }
}

function loadFromLocalStorage(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

function expandParents(pagePath: string) {
  const parts = pagePath.split("/").filter(Boolean);
  const expandPath = useTreeStore.getState().expandPath;
  for (let i = 1; i < parts.length; i++) {
    expandPath(parts.slice(0, i).join("/"));
  }
}

async function applyRoute(route: RouteState) {
  const { setSection } = useAppStore.getState();
  const { selectPage } = useTreeStore.getState();
  const { loadPage, clear } = useEditorStore.getState();

  setSection(route.section);

  if (route.pagePath) {
    selectPage(route.pagePath);
    await loadPage(route.pagePath);
    expandParents(route.pagePath);
    return;
  }

  if (route.section.cabinetPath) {
    selectPage(route.section.cabinetPath);
    await loadPage(route.section.cabinetPath);
    if (route.section.cabinetPath !== ROOT_CABINET_PATH) {
      expandParents(route.section.cabinetPath);
    }
    return;
  }

  selectPage(null);
  clear();
}

// Re-exported for unit tests; the parser is otherwise an internal of the
// hook implementation and shouldn't be used by app code.
export { parseHash as parseHashForTest };

export function useHashRoute() {
  const suppressHashUpdate = useRef(false);

  useEffect(() => {
    const hash = window.location.hash;
    // Fresh tabs always land on home — last-route only restores inside a
    // tab that has already rendered the app (manual reload, in-tab nav).
    // Audit #7: reopening `/` used to hijack returning users to whatever
    // route they were last on (frequently `#/settings/providers`).
    const isSameTabContinuation =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(SESSION_KEY) === "1";
    let route: RouteState;

    if (hash && hash !== "#" && hash !== "#/") {
      route = parseHash(hash);
    } else if (isSameTabContinuation) {
      const saved = loadFromLocalStorage();
      if (saved) {
        route = parseHash(saved);
        window.history.replaceState(null, "", saved);
      } else {
        route = { section: { type: "home" }, pagePath: null };
      }
    } else {
      route = { section: { type: "home" }, pagePath: null };
    }

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // sessionStorage can be disabled in some privacy modes; non-fatal.
    }

    suppressHashUpdate.current = true;
    void applyRoute(route).finally(() => {
      // Audit #121: if we entered via a legacy URL form (`#/page/<x>`,
      // bare `#agents`, etc.), rewrite the hash to the canonical shape
      // now. The store subscriber wouldn't fire for this — suppressHash
      // was true while section + selection were being set — so the URL
      // would otherwise stay on the legacy form for the user's session.
      const canonical = buildHash(
        useAppStore.getState().section,
        useTreeStore.getState().selectedPath
      );
      if (window.location.hash && window.location.hash !== canonical) {
        window.history.replaceState(null, "", canonical);
        saveToLocalStorage(canonical);
      }
      // Seed the back/forward history with this initial route. recordNav is
      // idempotent if the hash already matches the current entry.
      useAppStore.getState().recordNav(window.location.hash || canonical);
      requestAnimationFrame(() => {
        suppressHashUpdate.current = false;
      });
    });
  }, []);

  useEffect(() => {
    const unsubApp = useAppStore.subscribe((state, prev) => {
      if (suppressHashUpdate.current) return;

      if (
        state.section.type !== prev.section.type ||
        state.section.slug !== prev.section.slug ||
        state.section.cabinetPath !== prev.section.cabinetPath ||
        state.section.agentsTab !== prev.section.agentsTab
      ) {
        const selectedPath = useTreeStore.getState().selectedPath;
        const hash = buildHash(state.section, selectedPath);
        if (window.location.hash !== hash) {
          window.history.replaceState(null, "", hash);
          saveToLocalStorage(hash);
          useAppStore.getState().recordNav(hash);
        }
      }
    });

    const unsubTree = useTreeStore.subscribe((state, prev) => {
      if (suppressHashUpdate.current) return;
      if (state.selectedPath !== prev.selectedPath && state.selectedPath) {
        const hash = buildHash(useAppStore.getState().section, state.selectedPath);
        if (window.location.hash !== hash) {
          window.history.replaceState(null, "", hash);
          saveToLocalStorage(hash);
          useAppStore.getState().recordNav(hash);
        }
      }
    });

    return () => {
      unsubApp();
      unsubTree();
    };
  }, []);

  useEffect(() => {
    function onHashChange() {
      const route = parseHash(window.location.hash);
      suppressHashUpdate.current = true;
      void applyRoute(route).finally(() => {
        saveToLocalStorage(window.location.hash);
        // recordNav is a no-op when the new hash matches the current history
        // entry (the case for goBack/goForward), so this safely covers both
        // user-driven hash changes (browser back, manual edit) and our own
        // back/forward replays.
        useAppStore.getState().recordNav(window.location.hash);
        requestAnimationFrame(() => {
          suppressHashUpdate.current = false;
        });
      });
    }

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
}

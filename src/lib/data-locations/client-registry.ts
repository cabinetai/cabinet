import type { DataLocation } from "./types";

export const CLIENT_DATA_LOCATIONS: DataLocation[] = [
  {
    id: "ls-wizard-done",
    label: "Onboarding wizard completed",
    pathOrKey: "cabinet.wizard-done",
    contains: "Flag set after the welcome wizard finishes.",
    leavesDevice: false,
    scope: "localStorage",
    onboarding: true,
  },
  {
    id: "ls-tour-done",
    label: "Tour completed",
    pathOrKey: "cabinet.tour-done",
    contains: "Flag set after the in-app tour finishes.",
    leavesDevice: false,
    scope: "localStorage",
    onboarding: true,
  },
  {
    id: "ls-agents-intro",
    label: "Agents intro dismissals",
    pathOrKey: "cabinet.agents.intro-dismissed.",
    prefix: true,
    contains: "Per-cabinet flag for the agents-page intro card.",
    leavesDevice: false,
    scope: "localStorage",
    onboarding: true,
  },
  {
    id: "ls-agents-explainer",
    label: "Team page tab explainers",
    pathOrKey: "cabinet.agents.explainer.",
    prefix: true,
    contains:
      "Per-tab dismissal flag for the Team page explainer cards (Agents / Routines / Heartbeats / Schedule).",
    leavesDevice: false,
    scope: "localStorage",
    onboarding: true,
  },
  {
    id: "ls-feedback-prompted",
    label: "Feedback popup state",
    pathOrKey: "cabinet.feedback.",
    prefix: true,
    contains:
      "Counters and flags used to schedule the feedback popup (e.g. app launch count, prompted-at flags).",
    leavesDevice: false,
    scope: "localStorage",
    onboarding: true,
  },
  {
    id: "ls-data-dir-confirmed",
    label: "Data folder confirmation",
    pathOrKey: "cabinet.dataDirConfirmed",
    contains:
      "Set after the user confirms (or replaces) the data folder on first launch.",
    leavesDevice: false,
    scope: "localStorage",
    onboarding: true,
  },
  {
    id: "ls-prefs-theme",
    label: "Theme preferences",
    pathOrKey: "cabinet-theme",
    contains: "Selected theme + light/dark mode.",
    leavesDevice: false,
    scope: "localStorage",
    onboarding: false,
  },
  {
    id: "ls-prefs-sidebar",
    label: "Sidebar preferences",
    pathOrKey: "cabinet.sidebar.",
    prefix: true,
    contains: "Sidebar width, collapsed state, current drawer.",
    leavesDevice: false,
    scope: "localStorage",
    onboarding: false,
  },
  {
    id: "ls-prefs-terminal",
    label: "Terminal preferences",
    pathOrKey: "cabinet.terminal.",
    prefix: true,
    contains: "Terminal panel size and dock position.",
    leavesDevice: false,
    scope: "localStorage",
    onboarding: false,
  },
  {
    id: "ls-tree-cache",
    label: "Sidebar tree cache",
    pathOrKey: "kb-tree-cache",
    contains: "Last-known sidebar tree, painted instantly on reload.",
    leavesDevice: false,
    scope: "localStorage",
    onboarding: false,
  },
  {
    id: "ls-page-cache",
    label: "Last-page cache",
    pathOrKey: "kb-page-cache",
    contains: "Last-opened page contents, painted instantly on reload.",
    leavesDevice: false,
    scope: "localStorage",
    onboarding: false,
  },
];

export function matchesClientLocation(
  location: DataLocation,
  storageKey: string
): boolean {
  if (location.scope !== "localStorage") return false;
  if (location.prefix) return storageKey.startsWith(location.pathOrKey);
  return storageKey === location.pathOrKey;
}

export function listMatchingLocalStorageKeys(location: DataLocation): string[] {
  if (typeof window === "undefined") return [];
  if (location.scope !== "localStorage") return [];
  const matches: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && matchesClientLocation(location, key)) matches.push(key);
  }
  return matches;
}

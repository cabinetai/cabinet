import { isLegacyAdapterType } from "./adapters/legacy-ids";

/**
 * Client-side cache of "is this task terminal-mode?" keyed by task id.
 *
 * TaskConversationPage uses this to mount the xterm shell before its own
 * detail fetch resolves — any surface that has already seen the task in a
 * conversations-list response (sidebar RecentTasks, tasks board, etc.) warms
 * the cache via conversationMetaToTaskMeta. A hit lets the terminal start
 * connecting seconds earlier on warm navigation and much earlier on cold.
 *
 * The cache is intentionally tiny (boolean per id) and lives in
 * sessionStorage so it survives hash navigations inside a tab without
 * needing a shared Zustand store.
 */

const MEMORY = new Map<string, boolean>();
const STORAGE_KEY = "cabinet:terminal-mode-cache:v1";
let hydrated = false;

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean") MEMORY.set(k, v);
    }
  } catch {
    // session storage unavailable or corrupted — fall back to memory-only.
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, boolean> = {};
    for (const [k, v] of MEMORY.entries()) obj[k] = v;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Quota or disabled storage; memory cache is still useful.
  }
}

export function rememberTaskRuntime(
  taskId: string,
  adapterType?: string | null
): void {
  if (!taskId) return;
  hydrate();
  const isTerminal = isLegacyAdapterType(adapterType);
  const existing = MEMORY.get(taskId);
  if (existing === isTerminal) return;
  MEMORY.set(taskId, isTerminal);
  persist();
}

/**
 * Returns `true`/`false` if the task's runtime mode is known, `null` when
 * we've never seen it. Callers should fall back to their normal fetch path
 * on null.
 */
export function peekTaskIsTerminal(taskId: string): boolean | null {
  if (!taskId) return null;
  hydrate();
  if (!MEMORY.has(taskId)) return null;
  return MEMORY.get(taskId) ?? false;
}

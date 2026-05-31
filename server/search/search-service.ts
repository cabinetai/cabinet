import type { SearchIndex } from "./index-builder";
import type {
  AgentHit,
  IndexedPageRecord,
  PageHit,
  SearchMatch,
  SearchResponse,
  SearchScope,
  TaskHit,
} from "./types";

const MAX_MATCHES_PER_PAGE = 8;
const MAX_PAGES = 50;
const MAX_AGENTS = 20;
const MAX_TASKS = 20;
const SNIPPET_RADIUS = 60;

const FIELD_WEIGHTS: Record<string, number> = {
  title: 100,
  headings: 50,
  tags: 30,
  body: 10,
  path: 5,
};

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function findLineMatches(
  record: IndexedPageRecord,
  tokens: string[],
  full: string
): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const fullLower = full.toLowerCase();
  const lines = record.lines;

  const primary: string[] = [];
  if (fullLower) primary.push(fullLower);
  for (const t of tokens) {
    if (t !== fullLower && !primary.includes(t)) primary.push(t);
  }

  for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_PAGE; i++) {
    const lineText = lines[i];
    if (!lineText) continue;
    const lineLower = lineText.toLowerCase();
    for (const needle of primary) {
      const col = lineLower.indexOf(needle);
      if (col === -1) continue;
      const start = Math.max(0, col - SNIPPET_RADIUS);
      const end = Math.min(lineText.length, col + needle.length + SNIPPET_RADIUS);
      let context = lineText.slice(start, end);
      if (start > 0) context = "…" + context;
      if (end < lineText.length) context = context + "…";
      matches.push({
        line: i + 1,
        column: col,
        length: needle.length,
        context,
      });
      break;
    }
  }
  return matches;
}

function scoreRecord(
  record: IndexedPageRecord,
  fields: string[],
  tokens: string[]
): number {
  let score = 0;
  for (const f of fields) score += FIELD_WEIGHTS[f] ?? 0;

  const titleLower = record.title.toLowerCase();
  const pathLower = record.path.toLowerCase();
  for (const t of tokens) {
    if (titleLower === t) score += 200;
    else if (titleLower.startsWith(t)) score += 120;
    else if (titleLower.includes(t)) score += 60;
    if (pathLower.includes(t)) score += 5;
  }

  if (record.modified) {
    const age = Date.now() - new Date(record.modified).getTime();
    if (!Number.isNaN(age) && age >= 0) {
      const days = age / (1000 * 60 * 60 * 24);
      score += Math.max(0, 20 - Math.log2(1 + days) * 4);
    }
  }

  return score;
}

export interface AgentDoc {
  slug: string;
  title: string;
  role?: string;
  department?: string;
  provider?: string;
  tags?: string[];
  /** Top-level room slug this agent lives in (for room-scoped search). */
  cabinet?: string;
  searchText: string;
}

export interface TaskDoc {
  id: string;
  title: string;
  agent?: string;
  status?: string;
  trigger?: string;
  createdAt?: string;
  /** Top-level room slug this task lives in (for room-scoped search). */
  cabinet?: string;
  searchText: string;
}

export interface SearchSources {
  pages: SearchIndex;
  agents: () => AgentDoc[];
  tasks: () => TaskDoc[];
  indexReady: () => boolean;
}

export function runSearch(
  sources: SearchSources,
  query: string,
  scope: SearchScope,
  limit = MAX_PAGES,
  cabinet?: string
): SearchResponse {
  const t0 = Date.now();
  const trimmed = query.trim();
  const tokens = tokenize(trimmed);
  const fullLower = trimmed.toLowerCase();

  // Rooms v3: scope every result to the active room's subtree so search never
  // crosses room boundaries. A room's own nested cabinets share the prefix and
  // stay visible; sibling rooms do not.
  const roomPrefix = cabinet && cabinet !== "." ? cabinet : null;
  const inRoom = (p: string | undefined): boolean => {
    if (!roomPrefix) return true;
    if (!p) return false;
    return p === roomPrefix || p.startsWith(roomPrefix + "/");
  };

  const resp: SearchResponse = {
    query: trimmed,
    scope,
    pages: [],
    agents: [],
    tasks: [],
    tookMs: 0,
    indexReady: sources.indexReady(),
  };

  if (!trimmed) {
    resp.tookMs = Date.now() - t0;
    return resp;
  }

  if (scope === "all" || scope === "pages") {
    const raw = sources.pages.search(trimmed, Math.max(limit * 2, 80));
    const hits: Array<{ hit: PageHit; score: number }> = [];
    for (const { id, fields } of raw) {
      const record = sources.pages.get(id);
      if (!record) continue;
      if (!inRoom(record.path)) continue;
      const matches = findLineMatches(record, tokens, fullLower);
      if (matches.length === 0 && !fields.includes("title") && !fields.includes("tags") && !fields.includes("headings")) {
        continue;
      }
      const score = scoreRecord(record, fields, tokens);
      hits.push({
        score,
        hit: {
          kind: "page",
          id: record.id,
          title: record.title,
          path: record.path,
          icon: record.icon,
          tags: record.tagList,
          modified: record.modified,
          matchCount: matches.length,
          matches,
          matchedFields: fields.filter((f): f is PageHit["matchedFields"][number] =>
            ["title", "headings", "tags", "body", "path"].includes(f)
          ),
        },
      });
    }
    hits.sort((a, b) => b.score - a.score);
    resp.pages = hits.slice(0, limit).map((h) => h.hit);
  }

  if (scope === "all" || scope === "agents") {
    const agents = sources.agents();
    const hits: Array<{ hit: AgentHit; score: number }> = [];
    for (const a of agents) {
      if (!inRoom(a.cabinet)) continue;
      const text = a.searchText.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (a.title.toLowerCase() === t) score += 200;
        else if (a.title.toLowerCase().startsWith(t)) score += 100;
        else if (text.includes(t)) score += 20;
      }
      if (fullLower && text.includes(fullLower)) score += 10;
      if (score === 0) continue;
      const col = text.indexOf(fullLower || tokens[0] || "");
      const contextStart = Math.max(0, col - SNIPPET_RADIUS);
      const contextEnd = Math.min(a.searchText.length, col + 120);
      const context =
        col >= 0
          ? (contextStart > 0 ? "…" : "") +
            a.searchText.slice(contextStart, contextEnd) +
            (contextEnd < a.searchText.length ? "…" : "")
          : a.searchText.slice(0, 120);
      hits.push({
        score,
        hit: {
          kind: "agent",
          id: a.slug,
          slug: a.slug,
          title: a.title,
          role: a.role,
          department: a.department,
          provider: a.provider,
          tags: a.tags,
          matches: [
            {
              line: 1,
              column: Math.max(0, col),
              length: (fullLower || tokens[0] || "").length,
              context,
            },
          ],
        },
      });
    }
    hits.sort((a, b) => b.score - a.score);
    resp.agents = hits.slice(0, MAX_AGENTS).map((h) => h.hit);
  }

  if (scope === "all" || scope === "tasks") {
    const tasks = sources.tasks();
    const hits: Array<{ hit: TaskHit; score: number }> = [];
    for (const task of tasks) {
      if (!inRoom(task.cabinet)) continue;
      const text = task.searchText.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (task.title.toLowerCase().includes(t)) score += 50;
        else if (text.includes(t)) score += 10;
      }
      if (fullLower && text.includes(fullLower)) score += 10;
      if (score === 0) continue;
      const col = text.indexOf(fullLower || tokens[0] || "");
      const contextStart = Math.max(0, col - SNIPPET_RADIUS);
      const contextEnd = Math.min(task.searchText.length, col + 160);
      const context =
        col >= 0
          ? (contextStart > 0 ? "…" : "") +
            task.searchText.slice(contextStart, contextEnd) +
            (contextEnd < task.searchText.length ? "…" : "")
          : task.searchText.slice(0, 160);
      hits.push({
        score,
        hit: {
          kind: "task",
          id: task.id,
          title: task.title,
          agent: task.agent,
          status: task.status,
          trigger: task.trigger,
          createdAt: task.createdAt,
          matches: [
            {
              line: 1,
              column: Math.max(0, col),
              length: (fullLower || tokens[0] || "").length,
              context,
            },
          ],
        },
      });
    }
    hits.sort((a, b) => b.score - a.score);
    resp.tasks = hits.slice(0, MAX_TASKS).map((h) => h.hit);
  }

  resp.tookMs = Date.now() - t0;
  return resp;
}

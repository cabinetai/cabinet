export type SearchScope = "all" | "pages" | "agents" | "tasks";

export interface SearchMatch {
  line: number;
  column: number;
  length: number;
  context: string;
}

export interface PageHit {
  kind: "page";
  id: string;
  title: string;
  path: string;
  icon?: string;
  tags: string[];
  modified?: string;
  matchCount: number;
  matches: SearchMatch[];
  matchedFields: Array<"title" | "headings" | "tags" | "body" | "path">;
}

export interface AgentHit {
  kind: "agent";
  id: string;
  slug: string;
  title: string;
  role?: string;
  department?: string;
  provider?: string;
  tags?: string[];
  matches: SearchMatch[];
}

export interface TaskHit {
  kind: "task";
  id: string;
  title: string;
  agent?: string;
  status?: string;
  trigger?: string;
  createdAt?: string;
  matches: SearchMatch[];
}

export interface SearchResponse {
  query: string;
  scope: SearchScope;
  pages: PageHit[];
  agents: AgentHit[];
  tasks: TaskHit[];
  tookMs: number;
  indexReady: boolean;
}

export interface IndexedPageRecord {
  id: string;
  title: string;
  path: string;
  headings: string;
  tags: string;
  body: string;
  lines: string[];
  tagList: string[];
  icon?: string;
  modified?: string;
}

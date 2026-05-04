"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Brain,
  Building2,
  CheckCircle2,
  CircleDot,
  Database,
  FileText,
  GitPullRequest,
  Inbox,
  Loader2,
  MessageSquare,
  Network,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { hasOptaleCapability } from "@/lib/optale/capabilities";
import { AgentHarnessObservatoryPanel } from "@/components/optale/agent-harness-observatory-panel";

type BrainView =
  | "overview"
  | "vault"
  | "memory"
  | "graph"
  | "entities"
  | "dreams"
  | "observatory"
  | "company-brain"
  | "admin";
type ExploreView = "vault" | "graph";
type SourceStatus = "enabled" | "healthy" | "blocked" | "unconfigured" | "error";
type SourceKind =
  | "vault"
  | "memory"
  | "graph"
  | "dreams"
  | "company_brain"
  | "action_graph"
  | "crm"
  | "project"
  | "communications"
  | "code";

interface BrainSourceSummary {
  id: string;
  name: string;
  kind: SourceKind;
  mcpServerId?: string;
  status: SourceStatus;
  permissions: string[];
  toolGroups: string[];
}

interface BrainContext {
  subjectType: "company" | "personal" | "system";
  tenantId?: string;
  companyId?: string;
  personId?: string;
  ownerId?: string;
  cabinetPath: string;
  dataRoot: string;
  vaultNamespace: string;
  memoryNamespace: string;
  graphNamespace: string;
  entityNamespace: string;
  qmdProfile: string;
  graphProfile: string;
  entityProfile: string;
  companyBrainTargetId?: string;
  mcpPolicyId?: string;
  mcpClientProfile: string;
  secretsRef: string;
  allowedScopes: Array<"company" | "personal" | "system">;
  source: string;
}

interface CommandBridgeStatus {
  enabled: boolean;
  configured: boolean;
  readOnly: true;
  authModeConfigured: boolean;
  reason?: string;
  allowedRoutes: Array<{
    id: string;
    pattern: string;
    upstreamPattern: string;
  }>;
}

interface BrainCoreStatus {
  version: 1;
  generatedAt: string;
  provisioning: {
    subjectType: "company" | "personal" | "system";
    tenantId?: string;
    cabinetPath: string;
    vaultNamespace: string;
    memoryNamespace: string;
    graphNamespace: string;
    entityNamespace: string;
    copyPersonalVault: false;
    copyPersonalMemory: false;
  };
  boundary: {
    privateToCompanyAutomaticWrite: false;
    browserDirectSourceWrites: false;
    companyWritesRequirePromotion: true;
    companyWritesRequireAgentReview: true;
    companyWritesRequireHumanApproval: true;
    companyWritesRequireReadBackVerification: true;
    enabledWriteCapabilities: string[];
  };
  sources: Array<{
    id: string;
    name?: string;
    kind?: string;
    status: "healthy" | "blocked" | "unconfigured" | "error";
    statusReason?: string;
    source: "native" | "bridge" | "planned";
    permissions?: string[];
    capabilities?: string[];
    namespace?: string;
    profile?: string;
  }>;
  migration: {
    commandBridgeEnabled: boolean;
    commandBridgeConfigured: boolean;
    commandBridgeReadOnly: true;
    canonicalOwner: "observatory";
  };
}

interface BrainSummary {
  generatedAt: string;
  cabinet: {
    path: string;
    name: string;
    scope: {
      scope: "company" | "personal" | "system";
      source: string;
    };
  };
  context: BrainContext;
  counts: {
    files: number;
    markdown: number;
    memoryFiles: number;
    agents: number;
    jobs: number;
    tasks: number;
    conversations: number;
    runningConversations: number;
    pendingTasks: number;
    pendingActions: number;
  };
  mcpPolicy: {
    source: string;
    enforcementMode: string;
    defaultDecision: string;
    enabledServers: number;
    totalServers: number;
  };
  sources: BrainSourceSummary[];
}

interface VaultItem {
  kind: "file";
  title: string;
  path: string;
  snippet: string;
  updatedAt: string;
  size: number;
}

interface ToolCallView {
  name: string;
  ok: boolean;
  status?: "ok" | "error";
  text: string;
  json?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

type GraphNodeType =
  | "space"
  | "agent"
  | "job"
  | "task"
  | "conversation"
  | "document"
  | "entity"
  | "fact"
  | "episode";

interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  status?: string;
  meta?: Record<string, string | number | boolean>;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface DerivedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: Record<GraphNodeType, number>;
}

interface SemanticGraphNode {
  id: string;
  label: string;
  kind: string;
  summary?: string;
  createdAt?: string;
}

interface SemanticGraphFact {
  id: string;
  label: string;
  sourceId?: string;
  targetId?: string;
  sourceLabel?: string;
  targetLabel?: string;
  createdAt?: string;
  validAt?: string;
  invalidAt?: string | null;
}

interface SemanticGraphEpisode {
  id: string;
  label: string;
  summary?: string;
  createdAt?: string;
  source?: string;
}

interface SemanticGraph {
  nodes: SemanticGraphNode[];
  facts: SemanticGraphFact[];
  episodes: SemanticGraphEpisode[];
  stats: {
    nodesLoaded: number;
    factsLoaded: number;
    episodesLoaded: number;
    edgesLoaded: number;
    nodesTotal?: number;
    factsTotal?: number;
    episodesTotal?: number;
  };
  nodeMessage?: string;
  factMessage?: string;
  episodeMessage?: string;
}

interface ExploreResponse {
  generatedAt: string;
  cabinetPath: string;
  context: BrainContext;
  source: "vault" | "graph";
  query: string;
  items: VaultItem[];
  graph?: DerivedGraph;
  semantic?: SemanticGraph;
  downstream: ToolCallView[];
}

interface VaultAdapterResponse {
  generatedAt: string;
  request: {
    brain: BrainContext;
  };
  query: string;
  documents: VaultItem[];
  downstream: ToolCallView[];
}

interface GraphAdapterResponse {
  generatedAt: string;
  request: {
    brain: BrainContext;
  };
  query: string;
  graph: DerivedGraph;
  semantic: SemanticGraph;
  downstream: ToolCallView[];
}

interface MemoryPeer {
  id: string;
  created_at?: string;
  metadata: Record<string, unknown>;
}

interface MemorySession {
  id: string;
  is_active: boolean;
  created_at?: string;
  metadata: Record<string, unknown>;
}

interface MemoryConclusion {
  id: string;
  content: string;
  observer_id?: string;
  observed_id?: string;
  session_id?: string | null;
  created_at?: string;
}

interface MemoryDetail {
  peerId: string;
  card: string[];
  context: unknown;
  sessions: MemorySession[];
  conclusions: MemoryConclusion[];
  errors: {
    card: string | null;
    context: string | null;
    sessions: string | null;
    conclusions: string | null;
  };
}

interface MemoryAdapterResponse {
  generatedAt: string;
  request: {
    brain: BrainContext;
  };
  source: {
    id: string;
    status: "healthy" | "blocked" | "unconfigured" | "error";
    statusReason?: string;
    permissions: string[];
  };
  query: string;
  workspace: string;
  namespace: string;
  profile: string;
  defaultPeer: string;
  selectedPeer: string;
  peers: MemoryPeer[];
  peerTotal: number;
  queue: unknown;
  detail: MemoryDetail | null;
  downstream: ToolCallView[];
  errors: {
    peers: string | null;
    queue: string | null;
  };
  stats: {
    memoryEnabled: boolean;
    authConfigured: boolean;
    peersLoaded: number;
    sessionsLoaded: number;
    conclusionsLoaded: number;
    downstreamCalls: number;
  };
}

interface EntityNode {
  id: string;
  title: string;
  type: string;
  category?: string;
  status?: string;
  owner?: string;
  vaultPath?: string;
  summary?: string;
  snippet?: string;
  health?: {
    key: string;
    label: string;
    severity?: string;
  };
}

interface EntityEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  fact?: string;
  validAt?: string;
  active?: boolean;
}

interface EntityCluster {
  id: string;
  label: string;
  nodeCount: number;
  edgeCount: number;
  relationshipTypes: Record<string, number>;
}

interface EntitiesAdapterResponse {
  generatedAt: string;
  request: {
    brain: BrainContext;
  };
  source: {
    id: string;
    status: "healthy" | "blocked" | "unconfigured" | "error";
    statusReason?: string;
    permissions: string[];
  };
  query: string;
  limit: number;
  offset: number;
  namespace: string;
  profile: string;
  graph: {
    nodes: EntityNode[];
    edges: EntityEdge[];
    clusters: EntityCluster[];
    meta: {
      graphName?: string;
      edgeCount: number;
      nodeCount: number;
      clusterCount: number;
      limit: number;
      offset: number;
      totalEdgeCount: number;
      hasPrevious: boolean;
      hasNext: boolean;
      relationship: string;
      asOf?: string | null;
      temporalMode?: string;
      timeRange?: {
        min?: string | null;
        max?: string | null;
      };
      availableLenses: Array<{ key: string; label: string }>;
    };
  };
  downstream: ToolCallView[];
  stats: {
    entitiesEnabled: boolean;
    apiConfigured: boolean;
    downstreamCalls: number;
    downstreamErrors: number;
    nodesLoaded: number;
    edgesLoaded: number;
    clustersLoaded: number;
  };
}

type DreamAction = "approve" | "reject-soft" | "reject-hard";

interface DreamStats {
  messages: number;
  sessions: number;
  observationsByLevel: Record<string, number>;
  queue: Record<string, Record<string, number>>;
  activeRejections: number;
  newExplicit24h: number;
}

interface DreamProposal {
  id: string;
  file: string;
  path: string;
  target?: string | null;
  summary: string;
  confidence: number | null;
  levels: string[];
  sourceIds: string[];
  created?: string;
  mtime?: number;
  body: string;
}

interface DreamRejection {
  id: string;
  rejectionType: string;
  content: string;
  rejectedAt?: string;
  expiresAt?: string | null;
}

interface DreamRuleSection {
  id: string;
  label: string;
  description?: string;
  source?: string;
  settings: Record<string, string>;
}

interface DreamsAdapterResponse {
  generatedAt: string;
  request: {
    brain: BrainContext;
  };
  source: {
    id: string;
    status: "healthy" | "blocked" | "unconfigured" | "error";
    statusReason?: string;
    permissions: string[];
  };
  query: string;
  limit: number;
  namespace: string;
  profile: string;
  dashboard: {
    stats: DreamStats;
    proposals: DreamProposal[];
    proposalTotal: number;
    proposalFilteredTotal: number;
    rejections: DreamRejection[];
    rules: DreamRuleSection[];
  };
  downstream: ToolCallView[];
  stats: {
    dreamsEnabled: boolean;
    apiConfigured: boolean;
    downstreamCalls: number;
    downstreamErrors: number;
    proposalsLoaded: number;
    rejectionsLoaded: number;
    rulesLoaded: number;
  };
}

interface DreamMutationResponse {
  ok: boolean;
  status: number;
  action: string;
  result: unknown;
  error?: string;
  downstream: ToolCallView[];
}

type BrainCoreSource = BrainCoreStatus["sources"][number];

interface CompanyBrainTarget {
  targetId: string;
  label: string;
  companyName: string;
  description?: string;
  status: string;
  scopes: Record<string, unknown>;
  policies: Record<string, unknown>;
}

interface CompanyBrainHealthSource {
  id: string;
  state: string;
  configured: boolean;
  missing: string[];
  error?: string;
  sample?: unknown;
}

interface CompanyBrainHealth {
  targetId: string;
  status: string;
  healthy: number;
  missing: number;
  failing: number;
  sources: CompanyBrainHealthSource[];
}

interface CompanyBrainPromotion {
  id?: string;
  promotionId: string;
  targetId: string;
  sourceType: string;
  title: string;
  summary: string;
  content: string;
  status: string;
  sensitivity: string;
  entityTypes: string[];
  tags: string[];
  reviewerNotes?: string;
  agentReview: {
    status?: string;
    confidence?: number | null;
    contradictions: unknown[];
    duplicates: unknown[];
    recommendations: string[];
    rationale?: string;
    model?: string;
    provider?: string;
    checkedAt?: string;
  };
  reviewHistory: unknown[];
  writeResult: {
    status?: string;
    adapter?: string;
    attempts?: number;
    completedAt?: string;
    failedAt?: string;
    error?: string;
    writes: Array<{
      tool?: string;
      ok?: boolean;
      verification?: {
        status?: string;
        tool?: string;
        checkedAt?: string;
        matchedAt?: string;
        attempts: unknown[];
        result?: unknown;
      };
    }>;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface CompanyBrainReviewQueueJob {
  id: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  targetId?: string;
  promotionId?: string;
  trigger?: string;
  queuedAt?: string;
  createdAt?: number;
  updatedAt?: number;
  result?: unknown;
  error?: {
    name?: string;
    message?: string;
  };
}

interface CompanyBrainReviewQueue {
  queueName: string;
  available: boolean;
  enabled: boolean;
  autoReviewEnabled: boolean;
  workerConcurrency: number;
  maxAttempts: number;
  pending: number;
  processing: number;
  pendingJobs: CompanyBrainReviewQueueJob[];
  processingJobs: CompanyBrainReviewQueueJob[];
  completedJobs: CompanyBrainReviewQueueJob[];
  failedJobs: CompanyBrainReviewQueueJob[];
}

interface CompanyBrainAdapterResponse {
  version: 1;
  generatedAt: string;
  httpStatus: number;
  request: {
    brain: BrainContext;
  };
  addon: {
    id: "company-brain-reviewer";
    enabled: boolean;
    reason?: string;
    source: "scope-label" | "env-allowlist" | "env-global" | "disabled";
    targetId?: string;
    labels: string[];
  };
  source: BrainCoreSource;
  bridge: CommandBridgeStatus;
  actions: {
    enabled: boolean;
    reason?: string;
    allowed: CompanyBrainAction[];
  };
  targetId?: string;
  statusFilter: string;
  targets: CompanyBrainTarget[];
  overview: {
    target: CompanyBrainTarget | null;
    health: CompanyBrainHealth | null;
    counts: Record<string, number>;
    recentPromotions: CompanyBrainPromotion[];
  } | null;
  promotions: CompanyBrainPromotion[];
  reviewQueue: CompanyBrainReviewQueue | null;
  downstream: ToolCallView[];
  stats: {
    addonEnabled: boolean;
    bridgeEnabled: boolean;
    bridgeConfigured: boolean;
    targetSelected: boolean;
    targetsLoaded: number;
    promotionsLoaded: number;
    recentPromotionsLoaded: number;
    queueJobsLoaded: number;
    downstreamCalls: number;
    downstreamErrors: number;
  };
}

type CompanyBrainAction =
  | "run-agent-review"
  | "mark-in-review"
  | "request-changes"
  | "approve"
  | "reject"
  | "promote"
  | "promote-dry-run";

interface CompanyBrainActionResponse {
  version: 1;
  httpStatus: number;
  ok: boolean;
  action: CompanyBrainAction | "invalid";
  targetId?: string;
  promotionId?: string;
  promotion?: CompanyBrainPromotion;
  result: unknown;
  error?: string;
}

interface CompanyBrainPromotionCreateResponse {
  version: 1;
  httpStatus: number;
  ok: boolean;
  submitted: boolean;
  targetId?: string;
  promotion?: CompanyBrainPromotion;
  reviewJob?: unknown;
  result: unknown;
  error?: string;
}

interface CompanyBrainPromotionDraft {
  title: string;
  summary: string;
  content: string;
  sourceType: string;
  sensitivity: string;
  tags: string;
  entityTypes: string;
  notes: string;
}

const VIEW_LABELS: Record<BrainView, string> = {
  overview: "Brain",
  vault: "Vault",
  memory: "Memory",
  graph: "Graph",
  entities: "Entities",
  dreams: "Dreams",
  observatory: "Observatory",
  "company-brain": "Company Brain",
  admin: "Admin",
};

const COMPANY_BRAIN_FILTERS = [
  { id: "drafts", label: "Drafts", statuses: "draft" },
  { id: "queue", label: "Queue", statuses: "submitted,in_review,needs_changes" },
  { id: "approved", label: "Approved", statuses: "approved" },
  { id: "promoted", label: "Promoted", statuses: "promoted" },
  { id: "rejected", label: "Rejected", statuses: "rejected,failed" },
  {
    id: "all",
    label: "All",
    statuses: "draft,submitted,in_review,needs_changes,approved,rejected,failed,promoted,withdrawn",
  },
];

const EMPTY_COMPANY_BRAIN_PROMOTION_DRAFT: CompanyBrainPromotionDraft = {
  title: "",
  summary: "",
  content: "",
  sourceType: "manual",
  sensitivity: "internal",
  tags: "",
  entityTypes: "",
  notes: "",
};

function numberLabel(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function statusClass(status: SourceStatus) {
  if (status === "enabled" || status === "healthy") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "blocked") return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "error") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

function workflowStatusClass(status?: string) {
  const normalized = (status || "").toLowerCase();
  if (["approved", "promoted", "ok", "completed", "verified"].includes(normalized)) {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (["submitted", "in_review", "pending", "queued", "processing"].includes(normalized)) {
    return "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
  if (["needs_changes", "missing_config", "not_required"].includes(normalized)) {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (["rejected", "failed", "error"].includes(normalized)) {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  return "border-border bg-muted text-muted-foreground";
}

function toolLabel(name: string): string {
  return name.replace("__", " / ").replace(/_/g, " ");
}

function compactPayload(call: ToolCallView): string {
  if (call.error) {
    const detail = call.text && call.text !== call.error.message ? `\n\n${call.text}` : "";
    return `${call.error.message}${call.error.retryable ? " You can retry this request." : ""}${detail}`;
  }
  if (call.json && typeof call.json === "object") {
    return JSON.stringify(call.json, null, 2);
  }
  return call.text;
}

function isExploreView(view: BrainView): view is ExploreView {
  return view === "vault" || view === "graph";
}

function useBrainSummary(cabinetPath: string) {
  const [summary, setSummary] = useState<BrainSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ cabinetPath });
      const response = await fetch(`/api/optale/brain?${params.toString()}`);
      if (!response.ok) throw new Error(`Brain request failed: ${response.status}`);
      setSummary((await response.json()) as BrainSummary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brain request failed");
    } finally {
      setLoading(false);
    }
  }, [cabinetPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, loading, error, refresh };
}

function useExplore(input: {
  view: BrainView;
  cabinetPath: string;
  query: string;
}) {
  const [data, setData] = useState<ExploreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isExploreView(input.view)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cabinetPath: input.cabinetPath,
        limit: "12",
      });
      if (input.query.trim()) params.set("q", input.query.trim());
      const endpoint =
        input.view === "vault" ? "/api/optale/brain/vault" : "/api/optale/brain/graph";
      const response = await fetch(`${endpoint}?${params.toString()}`);
      if (!response.ok) throw new Error(`Explore request failed: ${response.status}`);
      const payload = (await response.json()) as VaultAdapterResponse | GraphAdapterResponse;
      if (input.view === "vault") {
        const vaultPayload = payload as VaultAdapterResponse;
        setData({
          generatedAt: vaultPayload.generatedAt,
          cabinetPath: vaultPayload.request.brain.cabinetPath,
          context: vaultPayload.request.brain,
          source: "vault",
          query: vaultPayload.query,
          items: vaultPayload.documents,
          downstream: vaultPayload.downstream,
        });
      } else {
        const graphPayload = payload as GraphAdapterResponse;
        setData({
          generatedAt: graphPayload.generatedAt,
          cabinetPath: graphPayload.request.brain.cabinetPath,
          context: graphPayload.request.brain,
          source: "graph",
          query: graphPayload.query,
          items: [],
          graph: graphPayload.graph,
          semantic: graphPayload.semantic,
          downstream: graphPayload.downstream,
        });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Explore request failed");
    } finally {
      setLoading(false);
    }
  }, [input.cabinetPath, input.query, input.view]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

function useMemory(input: {
  active: boolean;
  cabinetPath: string;
  query: string;
  peer: string;
}) {
  const [data, setData] = useState<MemoryAdapterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!input.active) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cabinetPath: input.cabinetPath,
        limit: "12",
      });
      if (input.query.trim()) params.set("q", input.query.trim());
      if (input.peer.trim()) params.set("peer", input.peer.trim());
      const response = await fetch(`/api/optale/brain/memory?${params.toString()}`);
      if (!response.ok) throw new Error(`Memory request failed: ${response.status}`);
      setData((await response.json()) as MemoryAdapterResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Memory request failed");
    } finally {
      setLoading(false);
    }
  }, [input.active, input.cabinetPath, input.peer, input.query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

function useEntities(input: {
  active: boolean;
  cabinetPath: string;
  query: string;
  offset: number;
}) {
  const [data, setData] = useState<EntitiesAdapterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!input.active) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cabinetPath: input.cabinetPath,
        limit: "100",
      });
      if (input.offset > 0) params.set("offset", String(input.offset));
      if (input.query.trim()) params.set("q", input.query.trim());
      const response = await fetch(`/api/optale/brain/entities?${params.toString()}`);
      if (!response.ok) throw new Error(`Entities request failed: ${response.status}`);
      setData((await response.json()) as EntitiesAdapterResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Entities request failed");
    } finally {
      setLoading(false);
    }
  }, [input.active, input.cabinetPath, input.offset, input.query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

function useDreams(input: {
  active: boolean;
  cabinetPath: string;
  query: string;
}) {
  const [data, setData] = useState<DreamsAdapterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!input.active) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cabinetPath: input.cabinetPath,
        limit: "25",
      });
      if (input.query.trim()) params.set("q", input.query.trim());
      const response = await fetch(`/api/optale/brain/dreams?${params.toString()}`);
      if (!response.ok) throw new Error(`Dreams request failed: ${response.status}`);
      setData((await response.json()) as DreamsAdapterResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dreams request failed");
    } finally {
      setLoading(false);
    }
  }, [input.active, input.cabinetPath, input.query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitAction = useCallback(
    async (proposalPath: string, action: DreamAction) => {
      const response = await fetch("/api/optale/brain/dreams/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cabinetPath: input.cabinetPath,
          proposalPath,
          action,
        }),
      });
      const payload = (await response.json()) as DreamMutationResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Dream action failed: ${response.status}`);
      }
      await refresh();
      return payload;
    },
    [input.cabinetPath, refresh]
  );

  const ask = useCallback(
    async (question: string) => {
      const response = await fetch("/api/optale/brain/dreams/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cabinetPath: input.cabinetPath,
          question,
        }),
      });
      const payload = (await response.json()) as DreamMutationResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Dream question failed: ${response.status}`);
      }
      return payload;
    },
    [input.cabinetPath]
  );

  return { data, loading, error, refresh, submitAction, ask };
}

function useCommandBridgeStatus(active: boolean) {
  const [status, setStatus] = useState<CommandBridgeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const response = await fetch("/api/optale/brain/command");
      if (!response.ok) throw new Error(`Bridge status failed: ${response.status}`);
      setStatus((await response.json()) as CommandBridgeStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bridge status failed");
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, error, refresh };
}

function useBrainCoreStatus(active: boolean, cabinetPath: string) {
  const [status, setStatus] = useState<BrainCoreStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ cabinetPath });
      const response = await fetch(`/api/optale/brain/core?${params.toString()}`);
      if (!response.ok) throw new Error(`Core status failed: ${response.status}`);
      setStatus((await response.json()) as BrainCoreStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Core status failed");
    } finally {
      setLoading(false);
    }
  }, [active, cabinetPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, error, refresh };
}

function useCompanyBrain(input: {
  active: boolean;
  cabinetPath: string;
  status: string;
  targetId?: string;
}) {
  const [data, setData] = useState<CompanyBrainAdapterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!input.active) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cabinetPath: input.cabinetPath,
        status: input.status,
      });
      if (input.targetId) params.set("targetId", input.targetId);
      const response = await fetch(`/api/optale/brain/company-brain?${params.toString()}`);
      const payload = (await response.json()) as CompanyBrainAdapterResponse;
      setData(payload);
      if (!response.ok) {
        setError(payload.addon.reason || `Company Brain request failed: ${response.status}`);
        return;
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Company Brain request failed");
    } finally {
      setLoading(false);
    }
  }, [input.active, input.cabinetPath, input.status, input.targetId]);

  const submitAction = useCallback(
    async (actionInput: {
      targetId?: string;
      promotionId: string;
      action: CompanyBrainAction;
      reviewerNotes?: string;
      force?: boolean;
      dryRun?: boolean;
    }) => {
      const response = await fetch("/api/optale/brain/company-brain/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cabinetPath: input.cabinetPath,
          targetId: actionInput.targetId,
          promotionId: actionInput.promotionId,
          action: actionInput.action,
          reviewerNotes: actionInput.reviewerNotes,
          force: actionInput.force,
          dryRun: actionInput.dryRun,
        }),
      });
      const payload = (await response.json()) as CompanyBrainActionResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Company Brain action failed: ${response.status}`);
      }
      await refresh();
      return payload;
    },
    [input.cabinetPath, refresh]
  );

  const createPromotion = useCallback(
    async (draft: CompanyBrainPromotionDraft & { targetId?: string; submit: boolean }) => {
      const response = await fetch("/api/optale/brain/company-brain/promotion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cabinetPath: input.cabinetPath,
          targetId: draft.targetId,
          sourceType: draft.sourceType,
          title: draft.title,
          summary: draft.summary,
          content: draft.content,
          sensitivity: draft.sensitivity,
          tags: draft.tags,
          entityTypes: draft.entityTypes,
          notes: draft.notes,
          submit: draft.submit,
        }),
      });
      const payload = (await response.json()) as CompanyBrainPromotionCreateResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error || `Company Brain promotion create failed: ${response.status}`
        );
      }
      await refresh();
      return payload;
    },
    [input.cabinetPath, refresh]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh, submitAction, createPromotion };
}

export function OptaleBrainWorkspace({
  initialView,
  cabinetPath = ROOT_CABINET_PATH,
}: {
  initialView: BrainView;
  cabinetPath?: string;
}) {
  const canViewCompanyBrain = hasOptaleCapability("company_brain.view");
  const canViewRawDiagnostics = hasOptaleCapability("diagnostics.raw");
  const normalizedInitialView =
    initialView === "company-brain" && !canViewCompanyBrain
      ? "overview"
      : (initialView === "admin" ||
            initialView === "dreams" ||
            initialView === "observatory") &&
          !canViewRawDiagnostics
        ? "overview"
        : initialView;
  const [view, setView] = useState<BrainView>(normalizedInitialView);
  const [query, setQuery] = useState("");
  const [memoryPeer, setMemoryPeer] = useState("");
  const [entitiesOffset, setEntitiesOffset] = useState(0);
  const [companyBrainStatus, setCompanyBrainStatus] = useState(
    COMPANY_BRAIN_FILTERS[0].statuses
  );
  const setSection = useAppStore((s) => s.setSection);
  const selectPage = useTreeStore((s) => s.selectPage);
  const loadPage = useEditorStore((s) => s.loadPage);
  const summaryState = useBrainSummary(cabinetPath);
  const exploreState = useExplore({ view, cabinetPath, query });
  const memoryState = useMemory({
    active: view === "memory",
    cabinetPath,
    query,
    peer: memoryPeer,
  });
  const entitiesState = useEntities({
    active: view === "entities",
    cabinetPath,
    query,
    offset: entitiesOffset,
  });
  const dreamsState = useDreams({
    active: canViewRawDiagnostics && view === "dreams",
    cabinetPath,
    query,
  });
  const coreState = useBrainCoreStatus(true, cabinetPath);
  const companyBrainSource = useMemo(
    () => coreState.status?.sources.find((source) => source.id === "company-brain"),
    [coreState.status?.sources]
  );
  const companyBrainVisible =
    canViewCompanyBrain &&
    (view === "company-brain" ||
      Boolean(companyBrainSource && companyBrainSource.status !== "blocked"));
  const companyBrainState = useCompanyBrain({
    active: view === "company-brain",
    cabinetPath,
    status: companyBrainStatus,
    targetId: companyBrainSource?.namespace,
  });
  const navigationViews = useMemo<BrainView[]>(() => {
    const views: BrainView[] = ["overview", "vault", "memory", "graph", "entities"];
    if (canViewRawDiagnostics) views.push("dreams", "observatory");
    if (companyBrainVisible) views.push("company-brain");
    if (canViewRawDiagnostics) views.push("admin");
    return views;
  }, [canViewRawDiagnostics, companyBrainVisible]);

  useEffect(() => {
    setView(normalizedInitialView);
  }, [normalizedInitialView]);

  const sourceById = useMemo(() => {
    return new Map(summaryState.summary?.sources.map((source) => [source.id, source]));
  }, [summaryState.summary?.sources]);
  const vaultSource = sourceById.get("vault");
  const memorySource = sourceById.get("memory");
  const graphSource = sourceById.get("memory-graph");
  const entitiesSource = sourceById.get("action-graph");
  const dreamsSource = sourceById.get("dreams");

  const navigate = useCallback(
    (next: BrainView) => {
      const target =
        (next === "dreams" || next === "observatory" || next === "admin") &&
        !canViewRawDiagnostics
          ? "overview"
          : next === "company-brain" && !canViewCompanyBrain
            ? "overview"
            : next;

      setView(target);
      if (target === "overview") setSection({ type: "brain", cabinetPath });
      if (target === "vault") setSection({ type: "vault", cabinetPath });
      if (target === "memory") setSection({ type: "memory", cabinetPath });
      if (target === "graph") setSection({ type: "graph", cabinetPath });
      if (target === "entities") setSection({ type: "entities", cabinetPath });
      if (target === "dreams") setSection({ type: "dreams", cabinetPath });
      if (target === "company-brain" && canViewCompanyBrain) {
        setSection({ type: "company-brain", cabinetPath });
      }
    },
    [cabinetPath, canViewCompanyBrain, canViewRawDiagnostics, setSection]
  );

  const openVaultItem = useCallback(
    async (item: VaultItem) => {
      selectPage(item.path);
      await loadPage(item.path);
      setSection({ type: "page", cabinetPath });
    },
    [cabinetPath, loadPage, selectPage, setSection]
  );

  const refreshAll = useCallback(() => {
    void summaryState.refresh();
    void exploreState.refresh();
    void memoryState.refresh();
    void entitiesState.refresh();
    void dreamsState.refresh();
    void coreState.refresh();
    void companyBrainState.refresh();
  }, [
    companyBrainState,
    coreState,
    dreamsState,
    entitiesState,
    exploreState,
    memoryState,
    summaryState,
  ]);

  const anyLoading =
    summaryState.loading ||
    exploreState.loading ||
    memoryState.loading ||
    entitiesState.loading ||
    dreamsState.loading ||
    coreState.loading ||
    companyBrainState.loading;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="border-b border-border/70 bg-background/95 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <CircleDot className="size-3.5 text-primary" />
              <span>Optale Observatory</span>
            </div>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight">
              {VIEW_LABELS[view]}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border/70 bg-card p-1">
              {navigationViews.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => navigate(entry)}
                  className={cn(
                    "rounded px-3 py-1.5 text-[12px] font-medium transition-colors",
                    view === entry
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {VIEW_LABELS[entry]}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshAll}
              title="Refresh"
              aria-label="Refresh"
              disabled={anyLoading}
            >
              {anyLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto overflow-x-hidden px-5 py-5 pb-12">
        {summaryState.error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {summaryState.error}
          </div>
        ) : null}
        {view === "overview" ? (
          <Overview
            summary={summaryState.summary}
            loading={summaryState.loading}
            onOpenVault={() => navigate("vault")}
            onOpenMemory={() => navigate("memory")}
            onOpenGraph={() => navigate("graph")}
            onOpenEntities={() => navigate("entities")}
            onOpenDreams={() => navigate("dreams")}
            canOpenDreams={canViewRawDiagnostics}
            showDiagnostics={canViewRawDiagnostics}
            companyBrainAvailable={companyBrainVisible}
            onOpenCompanyBrain={() => navigate("company-brain")}
          />
        ) : view === "memory" ? (
          <MemoryView
            query={query}
            setQuery={setQuery}
            peer={memoryPeer}
            setPeer={setMemoryPeer}
            data={memoryState.data}
            loading={memoryState.loading}
            error={memoryState.error}
            source={memorySource}
            onRefresh={memoryState.refresh}
          />
        ) : view === "entities" ? (
          <EntitiesView
            query={query}
            setQuery={(value) => {
              setEntitiesOffset(0);
              setQuery(value);
            }}
            data={entitiesState.data}
            loading={entitiesState.loading}
            error={entitiesState.error}
            source={entitiesSource}
            onRefresh={entitiesState.refresh}
            onOffsetChange={setEntitiesOffset}
          />
        ) : view === "dreams" && canViewRawDiagnostics ? (
          <DreamsView
            query={query}
            setQuery={setQuery}
            data={dreamsState.data}
            loading={dreamsState.loading}
            error={dreamsState.error}
            source={dreamsSource}
            onRefresh={dreamsState.refresh}
            onSubmitAction={dreamsState.submitAction}
            onAsk={dreamsState.ask}
          />
        ) : view === "observatory" && canViewRawDiagnostics ? (
          <AgentHarnessObservatoryPanel />
        ) : view === "company-brain" && canViewCompanyBrain ? (
          <CompanyBrainView
            data={companyBrainState.data}
            loading={companyBrainState.loading}
            error={companyBrainState.error || coreState.error}
            source={companyBrainSource}
            statusFilter={companyBrainStatus}
            setStatusFilter={setCompanyBrainStatus}
            onRefresh={companyBrainState.refresh}
            onSubmitAction={companyBrainState.submitAction}
            onCreatePromotion={companyBrainState.createPromotion}
          />
        ) : view === "admin" && canViewRawDiagnostics ? (
          <Admin
            summary={summaryState.summary}
            loading={summaryState.loading}
            cabinetPath={cabinetPath}
          />
        ) : view === "vault" || view === "graph" ? (
          <Explore
            view={view}
            query={query}
            setQuery={setQuery}
            data={exploreState.data}
            loading={exploreState.loading}
            error={exploreState.error}
            source={view === "vault" ? vaultSource : graphSource}
            onRefresh={exploreState.refresh}
            onOpenVaultItem={openVaultItem}
          />
        ) : (
          <Overview
            summary={summaryState.summary}
            loading={summaryState.loading}
            onOpenVault={() => navigate("vault")}
            onOpenMemory={() => navigate("memory")}
            onOpenGraph={() => navigate("graph")}
            onOpenEntities={() => navigate("entities")}
            onOpenDreams={() => navigate("dreams")}
            canOpenDreams={canViewRawDiagnostics}
            showDiagnostics={canViewRawDiagnostics}
            companyBrainAvailable={companyBrainVisible}
            onOpenCompanyBrain={() => navigate("company-brain")}
          />
        )}
      </main>
    </section>
  );
}

function Overview({
  summary,
  loading,
  onOpenVault,
  onOpenMemory,
  onOpenGraph,
  onOpenEntities,
  onOpenDreams,
  canOpenDreams,
  showDiagnostics,
  companyBrainAvailable,
  onOpenCompanyBrain,
}: {
  summary: BrainSummary | null;
  loading: boolean;
  onOpenVault: () => void;
  onOpenMemory: () => void;
  onOpenGraph: () => void;
  onOpenEntities: () => void;
  onOpenDreams: () => void;
  canOpenDreams: boolean;
  showDiagnostics: boolean;
  companyBrainAvailable: boolean;
  onOpenCompanyBrain: () => void;
}) {
  const visibleSources =
    summary?.sources.filter((source) => canOpenDreams || source.id !== "dreams") ?? [];
  const enabledSources = visibleSources.filter((source) => source.status === "enabled");
  const sourceTotal = visibleSources.length + (companyBrainAvailable ? 1 : 0);
  const enabledTotal = enabledSources.length + (companyBrainAvailable ? 1 : 0);
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <div className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border/70 bg-card">
          <div className="grid divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Metric
              icon={<FileText className="size-4 text-sky-500" />}
              label="Vault files"
              value={summary ? numberLabel(summary.counts.markdown) : "-"}
              sub={summary ? `${numberLabel(summary.counts.files)} total files` : "loading"}
            />
            <Metric
              icon={<Database className="size-4 text-amber-500" />}
              label="Memory notes"
              value={summary ? numberLabel(summary.counts.memoryFiles) : "-"}
              sub="agent memory"
            />
            <Metric
              icon={<Network className="size-4 text-emerald-500" />}
              label="Operational nodes"
              value={
                summary
                  ? numberLabel(
                      summary.counts.agents +
                        summary.counts.tasks +
                        summary.counts.conversations
                    )
                  : "-"
              }
              sub="agents, tasks, conversations"
            />
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Brain className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">Brain sources</h2>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {summary ? `${enabledTotal}/${sourceTotal} enabled` : "Loading"}
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {visibleSources.map((source) => (
              <div key={source.id} className="flex items-center gap-3 px-4 py-3">
                <SourceIcon kind={source.kind} className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{source.name}</span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", statusClass(source.status))}>
                      {source.status}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {showDiagnostics
                      ? `${source.mcpServerId ?? "native"} · ${
                          source.permissions.join(", ") || "policy pending"
                        }`
                      : source.status === "enabled"
                        ? "Available"
                        : "Unavailable"}
                  </p>
                </div>
                {source.id === "vault" ? (
                  <Button variant="ghost" size="sm" onClick={onOpenVault}>
                    Open
                  </Button>
                ) : null}
                {source.id === "memory" ? (
                  <Button variant="ghost" size="sm" onClick={onOpenMemory}>
                    Open
                  </Button>
                ) : null}
                {source.id === "memory-graph" ? (
                  <Button variant="ghost" size="sm" onClick={onOpenGraph}>
                    Open
                  </Button>
                ) : null}
                {source.id === "action-graph" ? (
                  <Button variant="ghost" size="sm" onClick={onOpenEntities}>
                    Open
                  </Button>
                ) : null}
                {source.id === "dreams" && canOpenDreams ? (
                  <Button variant="ghost" size="sm" onClick={onOpenDreams}>
                    Open
                  </Button>
                ) : null}
              </div>
            ))}
            {companyBrainAvailable ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <Building2 className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">Company Brain</span>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", statusClass("healthy"))}>
                      add-on
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    reviewer target · read-only bridge
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={onOpenCompanyBrain}>
                  Open
                </Button>
              </div>
            ) : null}
            {loading && !summary ? (
              <div className="flex items-center gap-2 px-4 py-6 text-[12px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading brain
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <aside className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <h2 className="text-[14px] font-semibold">MCP policy</h2>
          </div>
          <dl className="mt-4 space-y-3 text-[12px]">
            <KeyValue label="Scope" value={summary?.cabinet.scope.scope ?? "-"} />
            <KeyValue label="Source" value={summary?.mcpPolicy.source ?? "-"} />
            <KeyValue
              label="Servers"
              value={
                summary
                  ? `${summary.mcpPolicy.enabledServers}/${summary.mcpPolicy.totalServers}`
                  : "-"
              }
            />
            <KeyValue label="Mode" value={summary?.mcpPolicy.enforcementMode ?? "-"} />
          </dl>
        </div>
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Current space</h2>
          </div>
          <dl className="mt-4 space-y-3 text-[12px]">
            <KeyValue label="Name" value={summary?.cabinet.name ?? "-"} />
            <KeyValue label="Path" value={summary?.cabinet.path ?? ROOT_CABINET_PATH} />
            <KeyValue
              label="Active work"
              value={
                summary
                  ? `${summary.counts.runningConversations} running · ${summary.counts.pendingTasks} pending`
                  : "-"
              }
            />
          </dl>
        </div>
      </aside>
    </div>
  );
}

function Admin({
  summary,
  loading,
  cabinetPath,
}: {
  summary: BrainSummary | null;
  loading: boolean;
  cabinetPath: string;
}) {
  const context = summary?.context;
  const bridge = useCommandBridgeStatus(true);
  const core = useBrainCoreStatus(true, cabinetPath);
  const value = (input?: string) => input || "-";
  const allowedScopes = context?.allowedScopes.join(", ") || "-";
  const sources = summary?.sources ?? [];
  const healthyCoreSources =
    core.status?.sources.filter((source) => source.status === "healthy").length ?? 0;

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
      <div className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Brain context</h2>
          </div>
          <dl className="mt-4 grid gap-3 text-[12px] sm:grid-cols-2">
            <KeyValue label="Subject" value={context?.subjectType ?? "-"} />
            <KeyValue label="Source" value={context?.source ?? "-"} />
            <KeyValue label="Tenant" value={value(context?.tenantId)} />
            <KeyValue label="Company" value={value(context?.companyId)} />
            <KeyValue label="Person" value={value(context?.personId)} />
            <KeyValue label="Owner" value={value(context?.ownerId)} />
            <KeyValue label="Cabinet" value={context?.cabinetPath ?? ROOT_CABINET_PATH} />
            <KeyValue label="Data root" value={context ? "server-side" : "-"} />
          </dl>
        </div>

        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <CircleDot className="size-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Core contract</h2>
          </div>
          {core.error ? (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {core.error}
            </div>
          ) : null}
          <dl className="mt-4 grid gap-3 text-[12px] sm:grid-cols-2">
            <KeyValue label="Owner" value={core.status?.migration.canonicalOwner ?? "observatory"} />
            <KeyValue label="Version" value={core.status ? String(core.status.version) : "-"} />
            <KeyValue
              label="Sources"
              value={core.status ? `${healthyCoreSources}/${core.status.sources.length} healthy` : "-"}
            />
            <KeyValue
              label="Bridge"
              value={core.status?.migration.commandBridgeEnabled ? "enabled" : "disabled"}
            />
            <KeyValue
              label="Auto company write"
              value={core.status?.boundary.privateToCompanyAutomaticWrite ? "yes" : "no"}
            />
            <KeyValue
              label="Copy personal data"
              value={
                core.status
                  ? core.status.provisioning.copyPersonalVault ||
                    core.status.provisioning.copyPersonalMemory
                    ? "yes"
                    : "no"
                  : "-"
              }
            />
          </dl>
          {core.loading && !core.status ? (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading core contract
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Namespaces</h2>
          </div>
          <dl className="mt-4 grid gap-3 text-[12px] sm:grid-cols-2">
            <KeyValue label="Vault" value={value(context?.vaultNamespace)} />
            <KeyValue label="Memory" value={value(context?.memoryNamespace)} />
            <KeyValue label="Graph" value={value(context?.graphNamespace)} />
            <KeyValue label="Entities" value={value(context?.entityNamespace)} />
            <KeyValue label="QMD profile" value={value(context?.qmdProfile)} />
            <KeyValue label="Graph profile" value={value(context?.graphProfile)} />
            <KeyValue label="Entity profile" value={value(context?.entityProfile)} />
            <KeyValue label="Secrets ref" value={context?.secretsRef ? "configured" : "-"} />
          </dl>
        </div>
      </div>

      <aside className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Policy binding</h2>
          </div>
          <dl className="mt-4 space-y-3 text-[12px]">
            <KeyValue label="MCP policy" value={value(context?.mcpPolicyId)} />
            <KeyValue label="MCP client" value={value(context?.mcpClientProfile)} />
            <KeyValue label="Allowed scopes" value={allowedScopes} />
            <KeyValue label="Company Brain" value={value(context?.companyBrainTargetId)} />
            <KeyValue
              label="Mode"
              value={summary?.mcpPolicy.enforcementMode ?? "-"}
            />
            <KeyValue
              label="Default"
              value={summary?.mcpPolicy.defaultDecision ?? "-"}
            />
          </dl>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Brain className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">Source bindings</h2>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {summary ? `${sources.length} sources` : "Loading"}
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {sources.map((source) => (
              <div key={source.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{source.name}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {source.mcpServerId ?? "native"}
                    </div>
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", statusClass(source.status))}>
                    {source.status}
                  </span>
                </div>
              </div>
            ))}
            {loading && !summary ? (
              <div className="flex items-center gap-2 px-4 py-6 text-[12px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading context
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Network className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">Command Brain bridge</h2>
            </div>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", statusClass(bridge.status?.enabled ? "enabled" : bridge.status?.configured ? "blocked" : "unconfigured"))}>
              {bridge.status?.enabled ? "enabled" : bridge.status?.configured ? "blocked" : "disabled"}
            </span>
          </div>
          <div className="p-4">
            {bridge.error ? (
              <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {bridge.error}
              </div>
            ) : null}
            <dl className="space-y-3 text-[12px]">
              <KeyValue label="Configured" value={bridge.status?.configured ? "yes" : "no"} />
              <KeyValue label="Read only" value={bridge.status?.readOnly ? "yes" : "no"} />
              <KeyValue label="Auth mode" value={bridge.status?.authModeConfigured ? "configured" : "disabled"} />
              <KeyValue label="Routes" value={bridge.status ? String(bridge.status.allowedRoutes.length) : "-"} />
            </dl>
            {bridge.status?.reason ? (
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {bridge.status.reason}
              </p>
            ) : null}
            <div className="mt-3 max-h-36 overflow-auto rounded-md border border-border/60 bg-background">
              {(bridge.status?.allowedRoutes ?? []).slice(0, 12).map((route) => (
                <div key={route.id} className="border-b border-border/50 px-3 py-2 last:border-b-0">
                  <div className="truncate text-[11px] font-medium">{route.id}</div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {route.upstreamPattern}
                  </div>
                </div>
              ))}
              {bridge.loading && !bridge.status ? (
                <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading bridge
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function WorkflowBadge({ value, label }: { value?: string; label?: string }) {
  const display = (label || value || "unknown").replace(/_/g, " ");
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize", workflowStatusClass(value))}>
      {display}
    </span>
  );
}

function shortDate(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function firstVerification(promotion?: CompanyBrainPromotion) {
  return promotion?.writeResult.writes.find((write) => write.verification)?.verification;
}

function CompanyBrainView({
  data,
  loading,
  error,
  source,
  statusFilter,
  setStatusFilter,
  onRefresh,
  onSubmitAction,
  onCreatePromotion,
}: {
  data: CompanyBrainAdapterResponse | null;
  loading: boolean;
  error: string | null;
  source?: BrainCoreSource;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  onRefresh: () => void;
  onSubmitAction: (input: {
    targetId?: string;
    promotionId: string;
    action: CompanyBrainAction;
    reviewerNotes?: string;
    force?: boolean;
    dryRun?: boolean;
  }) => Promise<CompanyBrainActionResponse>;
  onCreatePromotion: (
    input: CompanyBrainPromotionDraft & { targetId?: string; submit: boolean }
  ) => Promise<CompanyBrainPromotionCreateResponse>;
}) {
  const [selectedPromotionId, setSelectedPromotionId] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [draft, setDraft] = useState<CompanyBrainPromotionDraft>(
    EMPTY_COMPANY_BRAIN_PROMOTION_DRAFT
  );
  const [pendingAction, setPendingAction] = useState<CompanyBrainAction | null>(null);
  const [pendingCreate, setPendingCreate] = useState<"draft" | "submit" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const sourceStatus = (data?.source.status || source?.status || "unconfigured") as SourceStatus;
  const target = data?.overview?.target || data?.targets[0] || null;
  const health = data?.overview?.health || null;
  const queue = data?.reviewQueue || null;
  const promotions = data?.promotions ?? [];
  const selectedPromotion =
    promotions.find((promotion) => promotion.promotionId === selectedPromotionId) ||
    promotions[0] ||
    data?.overview?.recentPromotions[0];
  const verification = firstVerification(selectedPromotion);
  const downstreamErrors = data?.downstream.filter((call) => !call.ok) ?? [];
  const actionsEnabled = data?.actions?.enabled === true;
  const actionsReason = data?.actions?.reason;

  useEffect(() => {
    if (selectedPromotion?.promotionId && selectedPromotion.promotionId !== selectedPromotionId) {
      setSelectedPromotionId(selectedPromotion.promotionId);
    }
  }, [selectedPromotion?.promotionId, selectedPromotionId]);

  const runCompanyBrainAction = useCallback(
    async (action: CompanyBrainAction, options: { force?: boolean; dryRun?: boolean } = {}) => {
      if (!selectedPromotion?.promotionId) return;
      setPendingAction(action);
      setActionError(null);
      setActionMessage(null);
      try {
        const response = await onSubmitAction({
          targetId: data?.targetId,
          promotionId: selectedPromotion.promotionId,
          action,
          reviewerNotes: reviewNotes,
          force: options.force,
          dryRun: options.dryRun,
        });
        setActionMessage(`${action.replace(/-/g, " ")} completed`);
        if (response.promotion?.promotionId) {
          setSelectedPromotionId(response.promotion.promotionId);
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Company Brain action failed");
      } finally {
        setPendingAction(null);
      }
    },
    [data?.targetId, onSubmitAction, reviewNotes, selectedPromotion?.promotionId]
  );

  const updateDraft = useCallback(
    (key: keyof CompanyBrainPromotionDraft, value: string) => {
      setDraft((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const createPromotion = useCallback(
    async (submit: boolean) => {
      setPendingCreate(submit ? "submit" : "draft");
      setCreateError(null);
      setCreateMessage(null);
      try {
        const response = await onCreatePromotion({
          ...draft,
          targetId: data?.targetId,
          submit,
        });
        if (response.promotion?.promotionId) {
          setSelectedPromotionId(response.promotion.promotionId);
        }
        setStatusFilter(
          submit ? COMPANY_BRAIN_FILTERS[1].statuses : COMPANY_BRAIN_FILTERS[0].statuses
        );
        setDraft(EMPTY_COMPANY_BRAIN_PROMOTION_DRAFT);
        setCreateMessage(submit ? "Promotion submitted for review" : "Promotion draft saved");
      } catch (err) {
        setCreateError(
          err instanceof Error ? err.message : "Company Brain promotion create failed"
        );
      } finally {
        setPendingCreate(null);
      }
    },
    [data?.targetId, draft, onCreatePromotion, setStatusFilter]
  );

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <div className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Building2 className="size-4 text-primary" />
              <div className="min-w-0">
                <h2 className="truncate text-[14px] font-semibold">
                  {target?.label || data?.targetId || source?.namespace || "Company Brain"}
                </h2>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {target?.companyName || data?.targetId || "reviewer add-on"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", statusClass(sourceStatus))}>
                {sourceStatus}
              </span>
              <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                <span>Refresh</span>
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
              {error}
            </div>
          ) : null}
          {loading && !data ? (
            <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading Company Brain
            </div>
          ) : null}
          {data && !data.addon.enabled ? (
            <div className="mt-3 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
              {data.addon.reason || "Company Brain reviewer is not enabled for this scope."}
            </div>
          ) : null}
          {data?.addon.enabled && !data.bridge.enabled ? (
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
              {data.bridge.reason || "Command Brain bridge is not configured."}
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-card">
            <Metric
              icon={<Target className="size-4 text-sky-500" />}
              label="Targets"
              value={data ? numberLabel(data.stats.targetsLoaded) : "-"}
              sub={data?.targetId || "no target"}
            />
          </div>
          <div className="rounded-lg border border-border/70 bg-card">
            <Metric
              icon={<ShieldCheck className="size-4 text-emerald-500" />}
              label="Healthy"
              value={health ? numberLabel(health.healthy) : "-"}
              sub={health ? `${health.missing} missing · ${health.failing} failing` : "sources"}
            />
          </div>
          <div className="rounded-lg border border-border/70 bg-card">
            <Metric
              icon={<GitPullRequest className="size-4 text-amber-500" />}
              label="Promotions"
              value={data ? numberLabel(data.stats.promotionsLoaded) : "-"}
              sub={statusFilter.replace(/_/g, " ")}
            />
          </div>
          <div className="rounded-lg border border-border/70 bg-card">
            <Metric
              icon={<Inbox className="size-4 text-violet-500" />}
              label="Queue"
              value={queue ? numberLabel(queue.pending + queue.processing) : "-"}
              sub={queue ? `${queueJobsLabel(queue)}` : "review worker"}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <div>
                <h2 className="text-[14px] font-semibold">Promotion packet</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {data?.targetId || source?.namespace || "No target bound"}
                </p>
              </div>
            </div>
            <WorkflowBadge
              value={actionsEnabled ? "ok" : "blocked"}
              label={actionsEnabled ? "actions enabled" : "actions disabled"}
            />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <input
              value={draft.title}
              onChange={(event) => updateDraft("title", event.target.value)}
              placeholder="Title"
              className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={draft.sourceType}
                onChange={(event) => updateDraft("sourceType", event.target.value)}
                className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="manual">Manual</option>
                <option value="vault_doc">Vault doc</option>
                <option value="memory_conclusion">Memory</option>
                <option value="graphiti_fact">Graph fact</option>
                <option value="orm_entity">Entity</option>
                <option value="honcho_conclusion">Dream</option>
                <option value="other">Other</option>
              </select>
              <select
                value={draft.sensitivity}
                onChange={(event) => updateDraft("sensitivity", event.target.value)}
                className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="internal">Internal</option>
                <option value="personal">Personal</option>
                <option value="confidential">Confidential</option>
                <option value="restricted">Restricted</option>
              </select>
              <input
                value={draft.tags}
                onChange={(event) => updateDraft("tags", event.target.value)}
                placeholder="Tags"
                className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <textarea
              value={draft.summary}
              onChange={(event) => updateDraft("summary", event.target.value)}
              placeholder="Summary"
              className="min-h-24 resize-y rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 lg:col-span-2"
            />
            <textarea
              value={draft.content}
              onChange={(event) => updateDraft("content", event.target.value)}
              placeholder="Content"
              className="min-h-28 resize-y rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 lg:col-span-2"
            />
            <div className="grid gap-2 sm:grid-cols-2 lg:col-span-2">
              <input
                value={draft.entityTypes}
                onChange={(event) => updateDraft("entityTypes", event.target.value)}
                placeholder="Entity types"
                className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <input
                value={draft.notes}
                onChange={(event) => updateDraft("notes", event.target.value)}
                placeholder="Notes"
                className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-muted-foreground">
              {actionsEnabled
                ? "Draft privately or submit into the governed review queue."
                : actionsReason || "Promotion actions are disabled for this target."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!actionsEnabled || !draft.title.trim() || Boolean(pendingCreate)}
                onClick={() => void createPromotion(false)}
              >
                {pendingCreate === "draft" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileText className="size-3.5" />
                )}
                Save draft
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!actionsEnabled || !draft.title.trim() || Boolean(pendingCreate)}
                onClick={() => void createPromotion(true)}
              >
                {pendingCreate === "submit" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <GitPullRequest className="size-3.5" />
                )}
                Submit
              </Button>
            </div>
          </div>
          {createError ? (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {createError}
            </div>
          ) : null}
          {createMessage ? (
            <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
              {createMessage}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <GitPullRequest className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">Promotion queue</h2>
            </div>
            <div className="flex flex-wrap gap-1">
              {COMPANY_BRAIN_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setStatusFilter(filter.statuses)}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                    statusFilter === filter.statuses
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-border/60">
            {promotions.map((promotion) => (
              <button
                key={promotion.promotionId}
                type="button"
                onClick={() => setSelectedPromotionId(promotion.promotionId)}
                className={cn(
                  "block w-full px-4 py-3 text-left transition-colors hover:bg-accent/50",
                  selectedPromotion?.promotionId === promotion.promotionId
                    ? "bg-primary/5"
                    : "bg-transparent"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{promotion.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <WorkflowBadge value={promotion.status} />
                      <WorkflowBadge value={promotion.agentReview.status || "pending"} label={`agent ${promotion.agentReview.status || "pending"}`} />
                      {firstVerification(promotion) ? (
                        <WorkflowBadge value={firstVerification(promotion)?.status} label={`verify ${firstVerification(promotion)?.status || "pending"}`} />
                      ) : null}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {shortDate(promotion.updatedAt || promotion.createdAt)}
                  </span>
                </div>
                {promotion.summary ? (
                  <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                    {promotion.summary}
                  </p>
                ) : null}
              </button>
            ))}
            {promotions.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-6 text-[12px] text-muted-foreground">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Inbox className="size-4" />}
                {loading ? "Loading promotions" : "No promotions for this filter"}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Selected promotion</h2>
          </div>
          {selectedPromotion ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <dl className="space-y-3 text-[12px]">
                <KeyValue label="Title" value={selectedPromotion.title} />
                <KeyValue label="Status" value={selectedPromotion.status} />
                <KeyValue label="Sensitivity" value={selectedPromotion.sensitivity} />
                <KeyValue label="Agent review" value={selectedPromotion.agentReview.status || "pending"} />
                <KeyValue
                  label="Confidence"
                  value={
                    selectedPromotion.agentReview.confidence === null ||
                    selectedPromotion.agentReview.confidence === undefined
                      ? "-"
                      : String(selectedPromotion.agentReview.confidence)
                  }
                />
                <KeyValue label="Write status" value={selectedPromotion.writeResult.status || "-"} />
                <KeyValue label="Verification" value={verification?.status || "-"} />
              </dl>
              <div className="min-w-0 space-y-3">
                <div className="rounded-md border border-border/60 bg-background p-3">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Agent rationale
                  </div>
                  <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-muted-foreground">
                    {selectedPromotion.agentReview.rationale || selectedPromotion.summary || "No rationale loaded"}
                  </p>
                </div>
                {selectedPromotion.agentReview.recommendations.length > 0 ? (
                  <div className="rounded-md border border-border/60 bg-background p-3">
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Recommendations
                    </div>
                    <div className="space-y-1.5 text-[12px] text-muted-foreground">
                      {selectedPromotion.agentReview.recommendations.slice(0, 5).map((item) => (
                        <div key={item} className="break-words">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 rounded-md border border-border/60 bg-background p-3 lg:col-span-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Reviewer actions
                    </div>
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      {actionsEnabled
                        ? "Server-side actions are enabled for this target."
                        : actionsReason || "Actions are disabled for this target."}
                    </div>
                  </div>
                  <WorkflowBadge value={actionsEnabled ? "ok" : "blocked"} label={actionsEnabled ? "enabled" : "disabled"} />
                </div>
                <textarea
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value)}
                  placeholder="Reviewer notes"
                  className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-[12px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <CompanyBrainActionButton
                    action="run-agent-review"
                    pendingAction={pendingAction}
                    disabled={!actionsEnabled || loading}
                    onRun={runCompanyBrainAction}
                  >
                    <Sparkles className="size-3.5" />
                    Agent review
                  </CompanyBrainActionButton>
                  <CompanyBrainActionButton
                    action="mark-in-review"
                    pendingAction={pendingAction}
                    disabled={!actionsEnabled || loading}
                    onRun={runCompanyBrainAction}
                  >
                    <CircleDot className="size-3.5" />
                    In review
                  </CompanyBrainActionButton>
                  <CompanyBrainActionButton
                    action="request-changes"
                    pendingAction={pendingAction}
                    disabled={!actionsEnabled || loading}
                    onRun={runCompanyBrainAction}
                  >
                    <MessageSquare className="size-3.5" />
                    Changes
                  </CompanyBrainActionButton>
                  <CompanyBrainActionButton
                    action="approve"
                    pendingAction={pendingAction}
                    disabled={!actionsEnabled || loading}
                    onRun={runCompanyBrainAction}
                  >
                    <CheckCircle2 className="size-3.5" />
                    Approve
                  </CompanyBrainActionButton>
                  <CompanyBrainActionButton
                    action="reject"
                    pendingAction={pendingAction}
                    disabled={!actionsEnabled || loading}
                    onRun={runCompanyBrainAction}
                  >
                    <XCircle className="size-3.5" />
                    Reject
                  </CompanyBrainActionButton>
                  <CompanyBrainActionButton
                    action="promote-dry-run"
                    pendingAction={pendingAction}
                    disabled={!actionsEnabled || loading}
                    onRun={(action) => runCompanyBrainAction(action, { dryRun: true })}
                  >
                    <ShieldCheck className="size-3.5" />
                    Dry run
                  </CompanyBrainActionButton>
                  <CompanyBrainActionButton
                    action="promote"
                    pendingAction={pendingAction}
                    disabled={!actionsEnabled || loading}
                    onRun={runCompanyBrainAction}
                  >
                    <GitPullRequest className="size-3.5" />
                    Promote
                  </CompanyBrainActionButton>
                </div>
                {actionError ? (
                  <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                    {actionError}
                  </div>
                ) : null}
                {actionMessage ? (
                  <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
                    {actionMessage}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-[12px] text-muted-foreground">
              No promotion selected
            </div>
          )}
        </div>
      </div>

      <aside className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Target binding</h2>
          </div>
          <dl className="mt-4 space-y-3 text-[12px]">
            <KeyValue label="Target" value={data?.targetId || source?.namespace || "-"} />
            <KeyValue label="Add-on" value={data?.addon.enabled ? data.addon.source : "disabled"} />
            <KeyValue label="Bridge" value={data?.bridge.enabled ? "enabled" : "disabled"} />
            <KeyValue label="Browser writes" value={data?.bridge.readOnly ? "disabled" : "-"} />
            <KeyValue label="Actions" value={data?.actions?.enabled ? "enabled" : "disabled"} />
            <KeyValue label="Auth" value={data?.bridge.authModeConfigured ? "configured" : "disabled"} />
          </dl>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">Health sources</h2>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {health ? `${health.sources.length} sources` : "Loading"}
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {(health?.sources ?? []).map((entry) => (
              <div key={entry.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium">{entry.id}</div>
                    {entry.error || entry.missing.length > 0 ? (
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {entry.error || entry.missing.join(", ")}
                      </div>
                    ) : null}
                  </div>
                  <WorkflowBadge value={entry.state} />
                </div>
              </div>
            ))}
            {!health || health.sources.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-6 text-[12px] text-muted-foreground">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
                {loading ? "Loading health" : "No health payload loaded"}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Inbox className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">Review worker</h2>
            </div>
            <WorkflowBadge value={queue?.enabled ? "ok" : "missing_config"} label={queue?.enabled ? "enabled" : "disabled"} />
          </div>
          <div className="p-4">
            <dl className="space-y-3 text-[12px]">
              <KeyValue label="Queue" value={queue?.queueName || "-"} />
              <KeyValue label="Pending" value={queue ? String(queue.pending) : "-"} />
              <KeyValue label="Processing" value={queue ? String(queue.processing) : "-"} />
              <KeyValue label="Auto review" value={queue?.autoReviewEnabled ? "yes" : "no"} />
            </dl>
            <div className="mt-4 max-h-48 overflow-auto rounded-md border border-border/60 bg-background">
              {queueJobs(queue).slice(0, 12).map((job) => (
                <div key={job.id} className="border-b border-border/50 px-3 py-2 last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-[11px] font-medium">
                      {job.promotionId || job.id}
                    </div>
                    <WorkflowBadge value={job.status} />
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {job.trigger || shortDate(job.queuedAt)}
                  </div>
                </div>
              ))}
              {queueJobs(queue).length === 0 ? (
                <div className="px-3 py-3 text-[12px] text-muted-foreground">
                  No worker jobs loaded
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Network className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">Downstream</h2>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {data ? `${downstreamErrors.length}/${data.downstream.length} errors` : "Loading"}
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {(data?.downstream ?? []).map((call) => (
              <details key={call.name} className="group px-4 py-3">
                <summary className="flex cursor-pointer items-center justify-between gap-2 text-[12px]">
                  <span className="min-w-0 truncate font-medium">{toolLabel(call.name)}</span>
                  <WorkflowBadge value={call.ok ? "ok" : "error"} />
                </summary>
                <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 text-[11px] leading-relaxed text-muted-foreground">
                  {compactPayload(call)}
                </pre>
              </details>
            ))}
            {data?.downstream.length === 0 ? (
              <div className="px-4 py-6 text-[12px] text-muted-foreground">
                No downstream calls
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

function queueJobs(queue: CompanyBrainReviewQueue | null): CompanyBrainReviewQueueJob[] {
  if (!queue) return [];
  return [
    ...queue.pendingJobs,
    ...queue.processingJobs,
    ...queue.failedJobs,
    ...queue.completedJobs,
  ];
}

function CompanyBrainActionButton({
  action,
  pendingAction,
  disabled,
  onRun,
  children,
}: {
  action: CompanyBrainAction;
  pendingAction: CompanyBrainAction | null;
  disabled: boolean;
  onRun: (action: CompanyBrainAction) => void;
  children: ReactNode;
}) {
  const pending = pendingAction === action;
  return (
    <Button
      type="button"
      variant={action === "promote" ? "default" : "outline"}
      size="sm"
      disabled={disabled || Boolean(pendingAction)}
      onClick={() => onRun(action)}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : children}
    </Button>
  );
}

function queueJobsLabel(queue: CompanyBrainReviewQueue): string {
  const failed = queue.failedJobs.length;
  const completed = queue.completedJobs.length;
  if (failed > 0) return `${failed} failed · ${completed} completed`;
  return `${completed} completed`;
}

function jsonPreview(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function memoryStatus(input: {
  source?: BrainSourceSummary;
  data: MemoryAdapterResponse | null;
}): SourceStatus {
  if (input.source?.status) return input.source.status;
  if (input.data?.source.status === "healthy") return "enabled";
  if (input.data?.source.status === "error" || input.data?.source.status === "blocked") {
    return "blocked";
  }
  return "unconfigured";
}

function MemoryView({
  query,
  setQuery,
  peer,
  setPeer,
  data,
  loading,
  error,
  source,
  onRefresh,
}: {
  query: string;
  setQuery: (value: string) => void;
  peer: string;
  setPeer: (value: string) => void;
  data: MemoryAdapterResponse | null;
  loading: boolean;
  error: string | null;
  source?: BrainSourceSummary;
  onRefresh: () => void;
}) {
  const activePeer = peer || data?.selectedPeer || "";
  const status = memoryStatus({ source, data });
  const peerOptions = data?.peers ?? [];
  const detail = data?.detail;

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <div className="min-w-0 space-y-4">
        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            onRefresh();
          }}
        >
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Memory"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <select
            value={activePeer}
            onChange={(event) => setPeer(event.target.value)}
            className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            {activePeer ? null : <option value="">Peer</option>}
            {peerOptions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id}
              </option>
            ))}
            {activePeer && !peerOptions.some((entry) => entry.id === activePeer) ? (
              <option value={activePeer}>{activePeer}</option>
            ) : null}
          </select>
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            <span>Search</span>
          </Button>
        </form>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        ) : null}
        {data?.errors.peers ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
            {data.errors.peers}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">Peers</h2>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {data ? `${data.peers.length}/${data.peerTotal} loaded` : "Loading"}
            </span>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {peerOptions.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setPeer(entry.id)}
                className={cn(
                  "min-w-0 rounded-md border px-3 py-2 text-left transition-colors",
                  activePeer === entry.id
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/70 bg-background hover:bg-accent"
                )}
              >
                <div className="truncate text-[12px] font-medium">{entry.id}</div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  {entry.created_at || "memory peer"}
                </div>
              </button>
            ))}
            {peerOptions.length === 0 ? (
              <div className="col-span-full flex items-center gap-2 px-1 py-5 text-[12px] text-muted-foreground">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
                {loading ? "Loading Memory" : "No Memory peers found"}
              </div>
            ) : null}
          </div>
        </div>

        <MemoryDetailView detail={detail} loading={loading} />
      </div>

      <aside className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SourceIcon kind="memory" className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">{source?.name ?? "Memory"}</h2>
            </div>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", statusClass(status))}>
              {status}
            </span>
          </div>
          <dl className="mt-4 space-y-3 text-[12px]">
            <KeyValue label="Source" value={source?.mcpServerId ?? "honcho"} />
            <KeyValue label="Workspace" value={data?.workspace || "-"} />
            <KeyValue label="Namespace" value={data?.namespace || "-"} />
            <KeyValue label="Profile" value={data?.profile || "-"} />
            <KeyValue label="Auth" value={data?.stats.authConfigured ? "configured" : "not required"} />
            <KeyValue label="Selected peer" value={data?.selectedPeer || "-"} />
          </dl>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Queue</h2>
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words p-4 text-[11px] leading-relaxed text-muted-foreground">
            {jsonPreview(data?.queue).slice(0, 2400) || (loading ? "Loading" : "No queue payload")}
          </pre>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Downstream</h2>
            <span className="text-[11px] text-muted-foreground">
              {data ? `${data.downstream.length} calls` : "Loading"}
            </span>
          </div>
          <div className="max-h-[520px] overflow-auto p-3">
            {(data?.downstream ?? []).map((call) => (
              <div key={call.name} className="mb-3 rounded-md border border-border/70 bg-background p-3 last:mb-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium capitalize">{toolLabel(call.name)}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", call.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive")}>
                    {call.ok ? "ok" : "error"}
                  </span>
                </div>
                <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                  {compactPayload(call).slice(0, 2000) || "No payload"}
                </pre>
              </div>
            ))}
            {loading && !data ? (
              <div className="flex items-center gap-2 px-1 py-3 text-[12px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

function MemoryDetailView({
  detail,
  loading,
}: {
  detail: MemoryDetail | null | undefined;
  loading: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="text-[14px] font-semibold">Peer card</h2>
          <span className="text-[11px] text-muted-foreground">
            {detail ? `${detail.card.length} entries` : "Loading"}
          </span>
        </div>
        <div className="divide-y divide-border/60">
          {(detail?.card ?? []).map((entry, index) => (
            <div key={`${index}-${entry.slice(0, 16)}`} className="px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
              {entry}
            </div>
          ))}
          {detail?.errors.card ? (
            <div className="px-4 py-3 text-[12px] text-amber-700 dark:text-amber-300">
              {detail.errors.card}
            </div>
          ) : null}
          {!detail || detail.card.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-muted-foreground">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
              {loading ? "Loading peer card" : "No peer card entries"}
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="text-[14px] font-semibold">Conclusions</h2>
          <span className="text-[11px] text-muted-foreground">
            {detail ? `${detail.conclusions.length} shown` : "Loading"}
          </span>
        </div>
        <div className="divide-y divide-border/60">
          {(detail?.conclusions ?? []).map((entry) => (
            <div key={entry.id || entry.content.slice(0, 24)} className="px-4 py-3">
              <div className="text-[12px] leading-relaxed text-foreground">{entry.content}</div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground">
                {[entry.observer_id, entry.observed_id, entry.created_at].filter(Boolean).join(" / ")}
              </div>
            </div>
          ))}
          {detail?.errors.conclusions ? (
            <div className="px-4 py-3 text-[12px] text-amber-700 dark:text-amber-300">
              {detail.errors.conclusions}
            </div>
          ) : null}
          {!detail || detail.conclusions.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-muted-foreground">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {loading ? "Loading conclusions" : "No conclusions found"}
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="text-[14px] font-semibold">Sessions</h2>
          <span className="text-[11px] text-muted-foreground">
            {detail ? `${detail.sessions.length} loaded` : "Loading"}
          </span>
        </div>
        <div className="divide-y divide-border/60">
          {(detail?.sessions ?? []).map((entry) => (
            <div key={entry.id} className="flex min-w-0 items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium">{entry.id}</div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {entry.created_at || "session"}
                </div>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", entry.is_active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
                {entry.is_active ? "active" : "closed"}
              </span>
            </div>
          ))}
          {detail?.errors.sessions ? (
            <div className="px-4 py-3 text-[12px] text-amber-700 dark:text-amber-300">
              {detail.errors.sessions}
            </div>
          ) : null}
          {!detail || detail.sessions.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-muted-foreground">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <CircleDot className="size-4" />}
              {loading ? "Loading sessions" : "No sessions loaded"}
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <div className="border-b border-border/60 px-4 py-3">
          <h2 className="text-[14px] font-semibold">Context</h2>
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-4 text-[11px] leading-relaxed text-muted-foreground">
          {jsonPreview(detail?.context).slice(0, 5000) || (loading ? "Loading context" : "No context payload")}
        </pre>
      </div>
    </div>
  );
}

function entityStatus(input: {
  source?: BrainSourceSummary;
  data: EntitiesAdapterResponse | null;
}): SourceStatus {
  if (input.source?.status) return input.source.status;
  if (input.data?.source.status === "healthy") return "healthy";
  if (input.data?.source.status === "error" || input.data?.source.status === "blocked") {
    return input.data.source.status;
  }
  return "unconfigured";
}

function healthClass(severity?: string): string {
  if (severity === "ok") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (severity === "medium") return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (severity === "high") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

function EntitiesView({
  query,
  setQuery,
  data,
  loading,
  error,
  source,
  onRefresh,
  onOffsetChange,
}: {
  query: string;
  setQuery: (value: string) => void;
  data: EntitiesAdapterResponse | null;
  loading: boolean;
  error: string | null;
  source?: BrainSourceSummary;
  onRefresh: () => void;
  onOffsetChange: (offset: number) => void;
}) {
  const status = entityStatus({ source, data });
  const graph = data?.graph;
  const nodeById = useMemo(
    () => new Map((graph?.nodes ?? []).map((node) => [node.id, node])),
    [graph?.nodes]
  );
  const meta = graph?.meta;
  const nextOffset = meta ? meta.offset + meta.limit : 0;
  const previousOffset = meta ? Math.max(0, meta.offset - meta.limit) : 0;

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <div className="min-w-0 space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onOffsetChange(0);
            onRefresh();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Entities"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            <span>Search</span>
          </Button>
        </form>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Brain className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">Operational entities</h2>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {meta ? `${meta.nodeCount} nodes · ${meta.edgeCount} edges` : "Loading"}
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {(graph?.nodes ?? []).slice(0, 18).map((node) => (
              <div key={node.id} className="min-w-0 px-4 py-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full bg-cyan-500" />
                      <h3 className="min-w-0 truncate text-[13px] font-medium">{node.title}</h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {node.type}
                      </span>
                      {node.health ? (
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", healthClass(node.health.severity))}>
                          {node.health.label}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                      {node.snippet || node.summary || node.vaultPath || node.id}
                    </p>
                    {node.vaultPath ? (
                      <p className="mt-2 break-all text-[11px] text-muted-foreground/80">
                        {node.vaultPath}
                      </p>
                    ) : null}
                  </div>
                  {node.status ? (
                    <span className="shrink-0 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                      {node.status}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            {(!graph || graph.nodes.length === 0) ? (
              <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-muted-foreground">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                {loading ? "Loading entities" : "No entities returned"}
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Relationships</h2>
            <span className="text-[11px] text-muted-foreground">
              {graph ? `${graph.edges.length} shown` : "Loading"}
            </span>
          </div>
          <div className="space-y-1.5 p-4">
            {(graph?.edges ?? []).slice(0, 18).map((edge) => {
              const sourceNode = nodeById.get(edge.source);
              const targetNode = nodeById.get(edge.target);
              return (
                <div
                  key={edge.id}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-md bg-muted/45 px-2.5 py-1.5 text-[11px]"
                >
                  <span className="truncate">{sourceNode?.title || edge.source}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-muted-foreground">
                    {edge.type}
                  </span>
                  <span className="truncate text-right">{targetNode?.title || edge.target}</span>
                </div>
              );
            })}
            {(!graph || graph.edges.length === 0) ? (
              <div className="flex items-center gap-2 px-1 py-4 text-[12px] text-muted-foreground">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Network className="size-4" />}
                {loading ? "Loading relationships" : "No relationships returned"}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <aside className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SourceIcon kind={source?.kind ?? "action_graph"} className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">{source?.name ?? "Action Graph"}</h2>
            </div>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", statusClass(status))}>
              {status}
            </span>
          </div>
          <dl className="mt-4 space-y-3 text-[12px]">
            <KeyValue label="Namespace" value={data?.namespace || "loading"} />
            <KeyValue label="Profile" value={data?.profile || "loading"} />
            <KeyValue label="Graph" value={meta?.graphName || "loading"} />
            <KeyValue label="Time range" value={meta?.timeRange?.max ? `${meta.timeRange.min || "-"} to ${meta.timeRange.max}` : "current"} />
            <KeyValue label="Source" value={data?.stats.apiConfigured ? "configured" : "unconfigured"} />
          </dl>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Pages</h2>
            <span className="text-[11px] text-muted-foreground">
              {meta ? `${meta.offset + 1}-${meta.offset + (graph?.edges.length || 0)} / ${meta.totalEdgeCount}` : "Loading"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 p-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={loading || !meta?.hasPrevious}
              onClick={() => onOffsetChange(previousOffset)}
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={loading || !meta?.hasNext}
              onClick={() => onOffsetChange(nextOffset)}
            >
              Next
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Clusters</h2>
          </div>
          <div className="divide-y divide-border/60">
            {(graph?.clusters ?? []).slice(0, 8).map((cluster) => (
              <div key={cluster.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-medium">{cluster.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {cluster.nodeCount} nodes
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {cluster.edgeCount} edges
                </p>
              </div>
            ))}
            {(!graph || graph.clusters.length === 0) ? (
              <div className="px-4 py-6 text-[12px] text-muted-foreground">
                {loading ? "Loading clusters" : "No clusters returned"}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Downstream</h2>
          </div>
          <div className="max-h-[420px] overflow-auto p-3">
            {(data?.downstream ?? []).map((call) => (
              <div key={call.name} className="mb-3 rounded-md border border-border/70 bg-background p-3 last:mb-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium capitalize">{toolLabel(call.name)}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", call.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive")}>
                    {call.ok ? "ok" : "error"}
                  </span>
                </div>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                  {compactPayload(call).slice(0, 1600) || "No payload"}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function dreamStatus(input: {
  source?: BrainSourceSummary;
  data: DreamsAdapterResponse | null;
}): SourceStatus {
  if (input.source?.status) return input.source.status;
  if (input.data?.source.status === "healthy") return "healthy";
  if (input.data?.source.status === "error" || input.data?.source.status === "blocked") {
    return input.data.source.status;
  }
  return "unconfigured";
}

function confidenceClass(value: number | null): string {
  if (value === null) return "bg-muted text-muted-foreground";
  if (value >= 0.7) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (value >= 0.45) return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

function queuePending(stats?: DreamStats): number {
  if (!stats) return 0;
  return Object.values(stats.queue).reduce(
    (total, entry) => total + (entry.pending || 0),
    0
  );
}

function DreamsView({
  query,
  setQuery,
  data,
  loading,
  error,
  source,
  onRefresh,
  onSubmitAction,
  onAsk,
}: {
  query: string;
  setQuery: (value: string) => void;
  data: DreamsAdapterResponse | null;
  loading: boolean;
  error: string | null;
  source?: BrainSourceSummary;
  onRefresh: () => void;
  onSubmitAction: (proposalPath: string, action: DreamAction) => Promise<DreamMutationResponse>;
  onAsk: (question: string) => Promise<DreamMutationResponse>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const status = dreamStatus({ source, data });
  const stats = data?.dashboard.stats;
  const proposals = data?.dashboard.proposals ?? [];

  const runAction = useCallback(
    async (proposalPath: string, action: DreamAction) => {
      setPendingAction(`${proposalPath}:${action}`);
      setActionError(null);
      try {
        await onSubmitAction(proposalPath, action);
        setExpanded(null);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Dream action failed");
      } finally {
        setPendingAction(null);
      }
    },
    [onSubmitAction]
  );

  const askDream = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setAsking(true);
    setActionError(null);
    try {
      const result = await onAsk(trimmed);
      const payload = result.result as { content?: string; error?: string } | string | null;
      if (typeof payload === "string") setAnswer(payload);
      else setAnswer(payload?.content || payload?.error || "No answer returned");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Dream question failed");
    } finally {
      setAsking(false);
    }
  }, [onAsk, question]);

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <div className="min-w-0 space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onRefresh();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Dreams"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            <span>Search</span>
          </Button>
        </form>

        {error || actionError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {error || actionError}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-card">
            <Metric
              icon={<MessageSquare className="size-4 text-sky-500" />}
              label="Messages"
              value={stats ? numberLabel(stats.messages) : "-"}
              sub={stats ? `${numberLabel(stats.sessions)} sessions` : "loading"}
            />
          </div>
          <div className="rounded-lg border border-border/70 bg-card">
            <Metric
              icon={<Brain className="size-4 text-emerald-500" />}
              label="Explicit"
              value={stats ? numberLabel(stats.observationsByLevel.explicit || 0) : "-"}
              sub={stats ? `+${numberLabel(stats.newExplicit24h)} in 24h` : "loading"}
            />
          </div>
          <div className="rounded-lg border border-border/70 bg-card">
            <Metric
              icon={<Sparkles className="size-4 text-amber-500" />}
              label="Dreams"
              value={stats ? numberLabel(stats.observationsByLevel.dream || 0) : "-"}
              sub="consolidated beliefs"
            />
          </div>
          <div className="rounded-lg border border-border/70 bg-card">
            <Metric
              icon={<CircleDot className="size-4 text-primary" />}
              label="Queue"
              value={stats ? numberLabel(queuePending(stats)) : "-"}
              sub={data ? `${data.dashboard.proposalTotal} proposals` : "loading"}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">Proposal review</h2>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {data ? `${data.dashboard.proposalFilteredTotal}/${data.dashboard.proposalTotal} matching` : "Loading"}
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {proposals.map((proposal) => {
              const isOpen = expanded === proposal.path;
              return (
                <div key={proposal.path} className="min-w-0 px-4 py-3">
                  <button
                    type="button"
                    className="block w-full min-w-0 text-left"
                    onClick={() => setExpanded(isOpen ? null : proposal.path)}
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", confidenceClass(proposal.confidence))}>
                        {proposal.confidence === null ? "-" : proposal.confidence.toFixed(2)}
                      </span>
                      {proposal.levels.slice(0, 3).map((level) => (
                        <span key={level} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {level}
                        </span>
                      ))}
                      <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {proposal.summary || proposal.file}
                      </h3>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {proposal.target || proposal.path}
                    </p>
                  </button>
                  {isOpen ? (
                    <div className="mt-3 rounded-md border border-border/70 bg-background p-3">
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                        {proposal.body || proposal.summary}
                      </pre>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          disabled={Boolean(pendingAction)}
                          onClick={() => void runAction(proposal.path, "approve")}
                        >
                          {pendingAction === `${proposal.path}:approve` ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                          <span>Approve</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={Boolean(pendingAction)}
                          onClick={() => void runAction(proposal.path, "reject-soft")}
                        >
                          {pendingAction === `${proposal.path}:reject-soft` ? <Loader2 className="size-3.5 animate-spin" /> : <CircleDot className="size-3.5" />}
                          <span>Not now</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={Boolean(pendingAction)}
                          onClick={() => void runAction(proposal.path, "reject-hard")}
                        >
                          {pendingAction === `${proposal.path}:reject-hard` ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />}
                          <span>Wrong</span>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {proposals.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-muted-foreground">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {loading ? "Loading Dreams" : "No Dream proposals returned"}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <aside className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SourceIcon kind="dreams" className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">{source?.name ?? "Dreams"}</h2>
            </div>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", statusClass(status))}>
              {status}
            </span>
          </div>
          <dl className="mt-4 space-y-3 text-[12px]">
            <KeyValue label="Namespace" value={data?.namespace || "loading"} />
            <KeyValue label="Profile" value={data?.profile || "loading"} />
            <KeyValue label="Source" value={data?.stats.apiConfigured ? "configured" : "unconfigured"} />
            <KeyValue label="Permissions" value={source?.permissions.join(", ") || data?.source.permissions.join(", ") || "-"} />
          </dl>
        </div>

        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Ask Dream</h2>
          </div>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            className="mt-3 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-[12px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            placeholder="Ask about private memory patterns"
          />
          <Button size="sm" className="mt-2" disabled={asking || !question.trim()} onClick={() => void askDream()}>
            {asking ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquare className="size-3.5" />}
            <span>Ask</span>
          </Button>
          {answer ? (
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
              {answer}
            </pre>
          ) : null}
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Rejections</h2>
            <span className="text-[11px] text-muted-foreground">
              {data ? `${data.dashboard.rejections.length} active` : "Loading"}
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {(data?.dashboard.rejections ?? []).slice(0, 8).map((entry) => (
              <div key={entry.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-medium">{entry.content || entry.id}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {entry.rejectionType}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {[entry.rejectedAt, entry.expiresAt ? `expires ${entry.expiresAt}` : "permanent"].filter(Boolean).join(" / ")}
                </p>
              </div>
            ))}
            {(data?.dashboard.rejections ?? []).length === 0 ? (
              <div className="px-4 py-6 text-[12px] text-muted-foreground">
                {loading ? "Loading rejections" : "No active rejections"}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Rules</h2>
          </div>
          <div className="max-h-[420px] overflow-auto divide-y divide-border/60">
            {(data?.dashboard.rules ?? []).map((rule) => (
              <div key={rule.id} className="px-4 py-3">
                <div className="text-[12px] font-medium capitalize">{rule.label}</div>
                {rule.description ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {rule.description}
                  </p>
                ) : null}
                <div className="mt-2 grid gap-1 text-[11px]">
                  {Object.entries(rule.settings).slice(0, 6).map(([key, value]) => (
                    <KeyValue key={key} label={key} value={value} />
                  ))}
                </div>
              </div>
            ))}
            {(data?.dashboard.rules ?? []).length === 0 ? (
              <div className="px-4 py-6 text-[12px] text-muted-foreground">
                {loading ? "Loading rules" : "No rules returned"}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Downstream</h2>
          </div>
          <div className="max-h-[360px] overflow-auto p-3">
            {(data?.downstream ?? []).map((call) => (
              <div key={call.name} className="mb-3 rounded-md border border-border/70 bg-background p-3 last:mb-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium capitalize">{toolLabel(call.name)}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", call.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive")}>
                    {call.ok ? "ok" : "error"}
                  </span>
                </div>
                <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                  {compactPayload(call).slice(0, 1400) || "No payload"}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Explore({
  view,
  query,
  setQuery,
  data,
  loading,
  error,
  source,
  onRefresh,
  onOpenVaultItem,
}: {
  view: ExploreView;
  query: string;
  setQuery: (value: string) => void;
  data: ExploreResponse | null;
  loading: boolean;
  error: string | null;
  source?: BrainSourceSummary;
  onRefresh: () => void;
  onOpenVaultItem: (item: VaultItem) => void;
}) {
  const primaryCall = data?.downstream.find((call) =>
    view === "vault" ? call.name === "qmd__status" : call.name === "graphiti__get_status"
  );
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
      <div className="min-w-0 space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onRefresh();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={view === "vault" ? "Search Vault" : "Search Graph"}
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-[13px] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            <span>Search</span>
          </Button>
        </form>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        ) : null}

        {view === "vault" ? (
          <VaultResults
            items={data?.items ?? []}
            loading={loading}
            onOpen={onOpenVaultItem}
          />
        ) : (
          <GraphResults
            graph={data?.graph}
            semantic={data?.semantic}
            calls={data?.downstream ?? []}
            loading={loading}
          />
        )}
      </div>

      <aside className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SourceIcon kind={source?.kind ?? (view === "vault" ? "vault" : "graph")} className="size-4 text-primary" />
              <h2 className="text-[14px] font-semibold">{source?.name ?? VIEW_LABELS[view]}</h2>
            </div>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", statusClass(source?.status ?? "unconfigured"))}>
              {source?.status ?? "unconfigured"}
            </span>
          </div>
          <dl className="mt-4 space-y-3 text-[12px]">
            <KeyValue label="MCP" value={source?.mcpServerId ?? (view === "vault" ? "qmd" : "graphiti")} />
            <KeyValue label="Permissions" value={source?.permissions.join(", ") || "read"} />
            <KeyValue
              label="Connection"
              value={primaryCall ? (primaryCall.ok ? "reachable" : "error") : "checking"}
            />
          </dl>
        </div>

        <div className="rounded-lg border border-border/70 bg-card">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-[14px] font-semibold">Downstream</h2>
          </div>
          <div className="max-h-[520px] overflow-auto p-3">
            {(data?.downstream ?? []).map((call) => (
              <div key={call.name} className="mb-3 rounded-md border border-border/70 bg-background p-3 last:mb-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium capitalize">{toolLabel(call.name)}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", call.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive")}>
                    {call.ok ? "ok" : "error"}
                  </span>
                </div>
                <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                  {compactPayload(call).slice(0, 2000) || "No payload"}
                </pre>
              </div>
            ))}
            {loading && !data ? (
              <div className="flex items-center gap-2 px-1 py-3 text-[12px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

function VaultResults({
  items,
  loading,
  onOpen,
}: {
  items: VaultItem[];
  loading: boolean;
  onOpen: (item: VaultItem) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="text-[14px] font-semibold">Vault files</h2>
        <span className="text-[11px] text-muted-foreground">{items.length} shown</span>
      </div>
      <div className="divide-y divide-border/60">
        {items.map((item) => (
          <div key={item.path} className="min-w-0 px-4 py-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 shrink-0 text-sky-500" />
                  <h3 className="truncate text-[13px] font-medium">{item.title}</h3>
                </div>
                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                  {item.snippet || item.path}
                </p>
                <p className="mt-2 break-all text-[11px] text-muted-foreground/80">
                  {item.path} · {formatBytes(item.size)}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onOpen(item)}>
                Open
              </Button>
            </div>
          </div>
        ))}
        {items.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-muted-foreground">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {loading ? "Loading Vault" : "No Vault files found"}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GraphResults({
  graph,
  semantic,
  calls,
  loading,
}: {
  graph?: DerivedGraph;
  semantic?: SemanticGraph;
  calls: ToolCallView[];
  loading: boolean;
}) {
  const resultCalls = calls.filter((call) => call.name !== "graphiti__get_status");
  return (
    <div className="space-y-4">
      <DerivedGraphView graph={graph} loading={loading} />
      <SemanticGraphView semantic={semantic} loading={loading} />
      <div className="rounded-lg border border-border/70 bg-card">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h2 className="text-[14px] font-semibold">Graphiti payload</h2>
          <span className="text-[11px] text-muted-foreground">{resultCalls.length} calls</span>
        </div>
        <div className="divide-y divide-border/60">
          {resultCalls.map((call) => (
            <div key={call.name} className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Network className="size-4 text-emerald-500" />
                  <h3 className="text-[13px] font-medium capitalize">{toolLabel(call.name)}</h3>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", call.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive")}>
                  {call.ok ? "ok" : "error"}
                </span>
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                {compactPayload(call).slice(0, 4000) || "No payload"}
              </pre>
            </div>
          ))}
          {resultCalls.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-muted-foreground">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Network className="size-4" />}
              {loading ? "Loading Graph" : "No Graphiti payload"}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function loadedTotal(loaded: number, total?: number): string {
  return total === undefined ? `${loaded} loaded` : `${loaded} / ${total}`;
}

function SemanticGraphView({
  semantic,
  loading,
}: {
  semantic?: SemanticGraph;
  loading: boolean;
}) {
  const facts = semantic?.facts ?? [];
  const nodes = semantic?.nodes ?? [];
  const episodes = semantic?.episodes ?? [];
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <CircleDot className="size-4 text-primary" />
          <h2 className="text-[14px] font-semibold">Semantic results</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>{loadedTotal(semantic?.stats.nodesLoaded ?? 0, semantic?.stats.nodesTotal)} nodes</span>
          <span>{loadedTotal(semantic?.stats.factsLoaded ?? 0, semantic?.stats.factsTotal)} facts</span>
          <span>{loadedTotal(semantic?.stats.episodesLoaded ?? 0, semantic?.stats.episodesTotal)} episodes</span>
        </div>
      </div>

      {semantic ? (
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-medium">Entities</h3>
              {semantic.nodeMessage ? (
                <span className="truncate text-[11px] text-muted-foreground">{semantic.nodeMessage}</span>
              ) : null}
            </div>
            <div className="space-y-2">
              {nodes.slice(0, 8).map((node) => (
                <div key={node.id} className="min-w-0 rounded-md border border-border/70 bg-background px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full bg-emerald-500" />
                    <span className="min-w-0 truncate text-[12px] font-medium">{node.label}</span>
                    <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {node.kind}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {node.summary || node.createdAt || node.id}
                  </p>
                </div>
              ))}
              {nodes.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/70 px-3 py-6 text-[12px] text-muted-foreground">
                  {loading ? "Loading entities" : "No entities returned"}
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-medium">{facts.length > 0 ? "Facts" : "Episodes"}</h3>
              {(semantic.factMessage || semantic.episodeMessage) ? (
                <span className="truncate text-[11px] text-muted-foreground">
                  {semantic.factMessage || semantic.episodeMessage}
                </span>
              ) : null}
            </div>
            <div className="space-y-2">
              {facts.slice(0, 8).map((fact) => (
                <div key={fact.id} className="rounded-md border border-border/70 bg-background px-3 py-2">
                  <p className="text-[12px] font-medium leading-relaxed">{fact.label}</p>
                  <div className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{fact.sourceLabel || fact.sourceId || "source"}</span>
                    <span>to</span>
                    <span className="truncate text-right">{fact.targetLabel || fact.targetId || "target"}</span>
                  </div>
                </div>
              ))}
              {facts.length === 0
                ? episodes.slice(0, 8).map((episode) => (
                    <div key={episode.id} className="rounded-md border border-border/70 bg-background px-3 py-2">
                      <p className="truncate text-[12px] font-medium">{episode.label}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                        {episode.summary || episode.createdAt || episode.source || episode.id}
                      </p>
                    </div>
                  ))
                : null}
              {facts.length === 0 && episodes.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/70 px-3 py-6 text-[12px] text-muted-foreground">
                  {loading ? "Loading facts" : "No facts or episodes returned"}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-muted-foreground">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <CircleDot className="size-4" />}
          {loading ? "Loading semantic graph" : "No semantic graph loaded"}
        </div>
      )}
    </div>
  );
}

function DerivedGraphView({
  graph,
  loading,
}: {
  graph?: DerivedGraph;
  loading: boolean;
}) {
  const nodeById = useMemo(
    () => new Map((graph?.nodes ?? []).map((node) => [node.id, node])),
    [graph?.nodes]
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-primary" />
          <h2 className="text-[14px] font-semibold">Memory graph</h2>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {graph ? `${graph.nodes.length} nodes · ${graph.edges.length} edges` : "Loading"}
        </span>
      </div>

      {graph ? (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(graph.counts).map(([type, count]) => (
              <div key={type} className="rounded-md border border-border/70 bg-background p-2">
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {type}
                </div>
                <div className="mt-1 text-[18px] font-semibold">{count}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 text-[12px] font-medium">Nodes</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {graph.nodes.slice(0, 16).map((node) => (
                <div
                  key={node.id}
                  className="min-w-0 rounded-md border border-border/70 bg-background px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("size-2.5 shrink-0 rounded-full", nodeDotClass(node.type))} />
                    <span className="min-w-0 truncate text-[12px] font-medium">
                      {node.label}
                    </span>
                    {node.status ? (
                      <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {node.status}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {node.type}
                    {node.meta?.path ? ` · ${String(node.meta.path)}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[12px] font-medium">Edges</div>
            <div className="space-y-1.5">
              {graph.edges.slice(0, 14).map((edge) => {
                const source = nodeById.get(edge.source);
                const target = nodeById.get(edge.target);
                return (
                  <div
                    key={edge.id}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-md bg-muted/45 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="truncate">{source?.label || edge.source}</span>
                    <span className="rounded-full bg-background px-2 py-0.5 text-muted-foreground">
                      {edge.label}
                    </span>
                    <span className="truncate text-right">{target?.label || edge.target}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-muted-foreground">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Network className="size-4" />}
          {loading ? "Building graph" : "No derived graph"}
        </div>
      )}
    </div>
  );
}

function nodeDotClass(type: GraphNodeType): string {
  if (type === "space") return "bg-cyan-500";
  if (type === "agent") return "bg-emerald-500";
  if (type === "job") return "bg-amber-500";
  if (type === "task") return "bg-sky-500";
  if (type === "conversation") return "bg-fuchsia-500";
  if (type === "entity") return "bg-emerald-500";
  if (type === "fact") return "bg-violet-500";
  if (type === "episode") return "bg-cyan-500";
  return "bg-slate-500";
}

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-[28px] font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
    </div>
  );
}

function SourceIcon({
  kind,
  className,
}: {
  kind: SourceKind;
  className?: string;
}) {
  if (kind === "vault") return <Search className={className} />;
  if (kind === "memory") return <Database className={className} />;
  if (kind === "graph") return <Network className={className} />;
  if (kind === "dreams") return <Sparkles className={className} />;
  if (kind === "company_brain") return <Building2 className={className} />;
  if (kind === "action_graph") return <Brain className={className} />;
  if (kind === "crm") return <Database className={className} />;
  if (kind === "project") return <ShieldCheck className={className} />;
  if (kind === "communications") return <Server className={className} />;
  return <FileText className={className} />;
}

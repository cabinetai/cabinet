"use client";

import {
  BookOpen,
  Brain,
  Database,
  GitBranch,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OptaleCompanyBrainAddonResponse } from "@/lib/optale/brain-company-brain-adapter";
import type { OptaleBrainPublicCoreStatus } from "@/lib/optale/brain-contracts";
import type { OptaleBrainDreamsResponse } from "@/lib/optale/brain-dreams-adapter";
import type { OptaleBrainGraphResponse } from "@/lib/optale/brain-graph-adapter";
import type { OptaleBrainIngestionPreflightPayload } from "@/lib/optale/brain-ingestion-preflight";
import type { OptaleBrainIsolationPayload } from "@/lib/optale/brain-isolation";
import type { OptaleBrainMemoryResponse } from "@/lib/optale/brain-memory-adapter";
import type { OptaleBrainMountedVaultImportLog } from "@/lib/optale/brain-mounted-vault-imports";
import type { OptaleBrainFixtureLifecyclePayload } from "@/lib/optale/brain-fixtures";
import type { OptaleBrainSemanticOperationLog } from "@/lib/optale/brain-semantic-operations";
import type { OptaleBrainSummary } from "@/lib/optale/brain-summary";
import type { OptaleBrainVaultResponse } from "@/lib/optale/brain-vault-adapter";
import type { OptaleIdentitySnapshot } from "@/lib/optale/identity-shared";
import { cn } from "@/lib/utils";
import {
  ContextSection,
  DataTable,
  SplitSurface,
  SurfaceHeader,
} from "./primitives";
import type { TableRow } from "./types";

type BrainConsoleView =
  | "knowledge"
  | "sources"
  | "dreams"
  | "memory"
  | "graph"
  | "company"
  | "retrieval";
type BrainWorkspaceScope = "company" | "personal";

type BrainEndpointState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

type BrainEndpointResult<T> = {
  requestKey: string;
  data: T | null;
  error: string | null;
};

type BrainImportActionState = {
  busy: boolean;
  error: string | null;
};

type BrainRowKind =
  | "document"
  | "source"
  | "dream"
  | "memory"
  | "graph"
  | "company"
  | "retrieval"
  | "empty";

type BrainTableRow = TableRow & {
  __key: string;
  __kind: BrainRowKind;
  __id: string;
};

type BrainInspectorDetail = {
  kind: BrainRowKind;
  title: string;
  subtitle: string;
  summary?: string;
  rows: [string, string][];
  relatedTitle: string;
  related: [string, string][];
};

export function ConsoleBrainSurface({
  subpage,
  identity,
}: {
  subpage: string;
  identity: OptaleIdentitySnapshot | null;
}) {
  const view = brainViewFromSubpage(subpage);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<BrainWorkspaceScope>("company");
  const [refreshKey, setRefreshKey] = useState(0);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [importAction, setImportAction] = useState<BrainImportActionState>({
    busy: false,
    error: null,
  });
  const [semanticAction, setSemanticAction] = useState<BrainImportActionState>({
    busy: false,
    error: null,
  });
  const [fixtureAction, setFixtureAction] = useState<BrainImportActionState>({
    busy: false,
    error: null,
  });
  const cabinetPath = cabinetPathForScope(scope, identity);
  const personalCabinetPath = cabinetPathForScope("personal", identity);
  const preflightSourcePath = ingestionSourcePathForScope(scope);
  const operationsActive = view === "knowledge" && operationsOpen;
  const summary = useBrainEndpoint<OptaleBrainSummary>(
    brainUrl("/api/optale/brain", cabinetPath, { limit: "8" }),
    refreshKey,
  );
  const core = useBrainEndpoint<OptaleBrainPublicCoreStatus>(
    brainUrl("/api/optale/brain/core", cabinetPath),
    refreshKey,
  );
  const isolation = useBrainEndpoint<OptaleBrainIsolationPayload>(
    brainIsolationUrl(personalCabinetPath),
    refreshKey,
  );
  const preflight = useBrainEndpoint<OptaleBrainIngestionPreflightPayload>(
    operationsActive
      ? brainIngestionPreflightUrl(cabinetPath, preflightSourcePath, personalCabinetPath)
      : null,
    refreshKey,
  );
  const mountedVaultImports = useBrainEndpoint<OptaleBrainMountedVaultImportLog>(
    operationsActive ? brainMountedVaultImportsUrl() : null,
    refreshKey,
  );
  const fixtures = useBrainEndpoint<OptaleBrainFixtureLifecyclePayload>(
    operationsActive ? brainFixturesUrl() : null,
    refreshKey,
  );
  const semanticOperations = useBrainEndpoint<OptaleBrainSemanticOperationLog>(
    operationsActive ? brainSemanticOperationsUrl() : null,
    refreshKey,
  );
  const activeUrl = useMemo(
    () => endpointForView(view, query, cabinetPath),
    [cabinetPath, query, view],
  );
  const active = useBrainEndpoint<BrainActivePayload>(activeUrl, refreshKey);
  const loading =
    summary.loading ||
    core.loading ||
    isolation.loading ||
    preflight.loading ||
    mountedVaultImports.loading ||
    fixtures.loading ||
    semanticOperations.loading ||
    active.loading;

  async function recordMountedVaultImport() {
    setImportAction({ busy: true, error: null });
    try {
      await mutateBrainEndpoint("/api/optale/admin/brain-mounted-vault-imports", {
        cabinetPath,
        sourcePath: preflightSourcePath,
        personalCabinetPath,
      });
      setImportAction({ busy: false, error: null });
      setRefreshKey((current) => current + 1);
    } catch (error: unknown) {
      setImportAction({
        busy: false,
        error: error instanceof Error ? error.message : "Import audit failed",
      });
    }
  }

  async function queueSemanticIngestion() {
    setSemanticAction({ busy: true, error: null });
    try {
      const reviewedPreflight = preflight.data;
      if (!reviewedPreflight?.manifest.sha256) {
        throw new Error("Reviewed source manifest is not ready.");
      }
      await mutateBrainEndpoint("/api/optale/admin/brain-semantic-operations", {
        action: "semantic-ingest",
        cabinetPath,
        sourcePath: preflightSourcePath,
        personalCabinetPath,
        reviewedManifestSha256: reviewedPreflight.manifest.sha256,
        reviewedDocumentCount: reviewedPreflight.documents.length,
        reviewedDocumentSha256s: reviewedPreflight.documents.map((document) => document.sha256),
        reviewedSourcePath: reviewedPreflight.source.sourcePath,
        reviewedVirtualRoot: reviewedPreflight.source.virtualRoot,
      });
      setSemanticAction({ busy: false, error: null });
      setRefreshKey((current) => current + 1);
    } catch (error: unknown) {
      setSemanticAction({
        busy: false,
        error: error instanceof Error ? error.message : "Semantic ingestion failed",
      });
    }
  }

  async function resetSemanticCanary() {
    setSemanticAction({ busy: true, error: null });
    try {
      await mutateBrainEndpoint("/api/optale/admin/brain-semantic-operations", {
        action: "semantic-reset",
      });
      setSemanticAction({ busy: false, error: null });
      setRefreshKey((current) => current + 1);
    } catch (error: unknown) {
      setSemanticAction({
        busy: false,
        error: error instanceof Error ? error.message : "Semantic reset failed",
      });
    }
  }

  async function mutateFixture(action: "seed" | "remove") {
    setFixtureAction({ busy: true, error: null });
    try {
      await mutateBrainEndpoint("/api/optale/admin/brain-fixtures", { action });
      setFixtureAction({ busy: false, error: null });
      setRefreshKey((current) => current + 1);
    } catch (error: unknown) {
      setFixtureAction({
        busy: false,
        error: error instanceof Error ? error.message : "Fixture action failed",
      });
    }
  }

  return (
    <section className="space-y-5 px-4 py-5 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SurfaceHeader
          eyebrow="Brain"
          title={subpage}
          description={descriptionForView(view)}
        />
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <div className="flex border border-white/10 bg-[#15171b] p-1">
            {(["company", "personal"] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setScope(entry)}
                className={cn(
                  "h-7 px-3 text-xs font-medium capitalize transition-colors",
                  scope === entry
                    ? "bg-[#b8d47a] text-[#141619]"
                    : "text-[#aeb3b7] hover:bg-white/5 hover:text-white",
                )}
              >
                {entry}
              </button>
            ))}
          </div>
          <label className="relative block min-w-0">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[#8f9498]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-[min(52vw,260px)] border border-white/10 bg-[#0f1115] pl-8 pr-3 text-sm text-white outline-none placeholder:text-[#73787d] focus:border-[#b8d47a]/70"
              placeholder="Search Brain"
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 border border-white/10 text-[#aeb3b7] hover:bg-white/5 hover:text-white"
            onClick={() => setRefreshKey((current) => current + 1)}
            aria-label="Refresh Brain"
            title="Refresh"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
        </div>
      </div>

      <BrainNotice
        error={
          summary.error ||
          core.error ||
          isolation.error ||
          preflight.error ||
          mountedVaultImports.error ||
          fixtures.error ||
          fixtureAction.error ||
          importAction.error ||
          semanticOperations.error ||
          semanticAction.error ||
          active.error
        }
      />

      <BrainIsolationStrip isolation={isolation.data} loading={isolation.loading} />

      {view === "knowledge" ? (
        <KnowledgeBaseView
          summary={summary.data}
          core={core.data}
          data={isVaultPayload(active.data) ? active.data : null}
          loading={active.loading}
          cabinetPath={cabinetPath}
          preflight={preflight.data}
          preflightSourcePath={preflightSourcePath}
          importLog={mountedVaultImports.data}
          importAction={importAction}
          fixtures={fixtures.data}
          fixtureAction={fixtureAction}
          semanticLog={semanticOperations.data}
          semanticAction={semanticAction}
          operationsOpen={operationsOpen}
          onOperationsOpenChange={setOperationsOpen}
          onRecordImport={recordMountedVaultImport}
          onSeedFixture={() => mutateFixture("seed")}
          onRemoveFixture={() => mutateFixture("remove")}
          onQueueSemanticIngestion={queueSemanticIngestion}
          onResetSemanticCanary={resetSemanticCanary}
        />
      ) : view === "sources" ? (
        <SourcesView summary={summary.data} core={core.data} />
      ) : view === "dreams" ? (
        <DreamsView data={isDreamsPayload(active.data) ? active.data : null} />
      ) : view === "memory" ? (
        <MemoryView data={isMemoryPayload(active.data) ? active.data : null} />
      ) : view === "graph" ? (
        <GraphView data={isGraphPayload(active.data) ? active.data : null} />
      ) : view === "company" ? (
        <CompanyBrainView
          data={isCompanyPayload(active.data) ? active.data : null}
          core={core.data}
        />
      ) : (
        <RetrievalView summary={summary.data} core={core.data} />
      )}
    </section>
  );
}

function KnowledgeBaseView({
  summary,
  core,
  data,
  loading,
  cabinetPath,
  preflight,
  preflightSourcePath,
  importLog,
  importAction,
  fixtures,
  fixtureAction,
  semanticLog,
  semanticAction,
  operationsOpen,
  onOperationsOpenChange,
  onRecordImport,
  onSeedFixture,
  onRemoveFixture,
  onQueueSemanticIngestion,
  onResetSemanticCanary,
}: {
  summary: OptaleBrainSummary | null;
  core: OptaleBrainPublicCoreStatus | null;
  data: OptaleBrainVaultResponse | null;
  loading: boolean;
  cabinetPath: string;
  preflight: OptaleBrainIngestionPreflightPayload | null;
  preflightSourcePath: string;
  importLog: OptaleBrainMountedVaultImportLog | null;
  importAction: BrainImportActionState;
  fixtures: OptaleBrainFixtureLifecyclePayload | null;
  fixtureAction: BrainImportActionState;
  semanticLog: OptaleBrainSemanticOperationLog | null;
  semanticAction: BrainImportActionState;
  operationsOpen: boolean;
  onOperationsOpenChange: (open: boolean) => void;
  onRecordImport: () => void;
  onSeedFixture: () => void;
  onRemoveFixture: () => void;
  onQueueSemanticIngestion: () => void;
  onResetSemanticCanary: () => void;
}) {
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const rows: BrainTableRow[] =
    data?.documents.map((document) => ({
      __key: `document:${document.path}`,
      __kind: "document",
      __id: document.path,
      document: document.title,
      path: document.path,
      source: document.source,
      updated: formatDate(document.updatedAt),
      size: formatBytes(document.size),
    })) ?? [];
  const latestImport = importLog?.records[0] ?? null;
  const latestFixture = fixtures?.records[0] ?? null;
  const fixtureState = fixtures?.state ?? null;
  const latestSemantic = semanticLog?.records[0] ?? null;
  const importReady = Boolean(
    preflight?.readyForReview &&
      preflight.target.scope === "company" &&
      preflight.manifest.present &&
      preflight.stats.markdownFiles > 0,
  );
  const visibleRows = loading && rows.length === 0 ? loadingRows("document") : rows;
  const activeRowKey = selectableBrainRowKey(visibleRows, selectedRowKey);

  return (
    <SplitSurface
      eyebrow="Knowledge"
      title="Vault Documents"
      description="Markdown and source documents available to governed Brain retrieval."
      table={
        <DataTable
          columns={["document", "path", "source", "updated", "size"]}
          rows={visibleRows}
          rowKey={(row, index) => row.__key || `${row.document}-${index}`}
          selectedRowKey={activeRowKey}
          onRowSelect={(row) => {
            if (!brainRowIsSelectable(row)) return;
            setSelectedRowKey(row.__key);
          }}
        />
      }
      side={
        <div className="space-y-5">
          <BrainInspector detail={documentInspectorDetail(activeRowKey, data)} />
          <ContextSection
            title="Cabinet"
            rows={[
              ["Name", summary?.cabinet.name ?? "Loading"],
              ["Path", cabinetPath],
              ["Scope", summary?.cabinet.scope.scope ?? "Loading"],
              ["Markdown", String(summary?.counts.markdown ?? 0)],
              ["Files", String(summary?.counts.files ?? 0)],
            ]}
          />
          <ContextSection
            title="Policy"
            rows={[
              ["Mode", summary?.mcpPolicy.enforcementMode ?? "Loading"],
              ["Default", summary?.mcpPolicy.defaultDecision ?? "Loading"],
              ["Servers", serverCount(summary)],
              ["Bridge", core?.migration.commandBridgeEnabled ? "Enabled" : "Read-only"],
            ]}
          />
          <div className="border-t border-white/10 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8f9498]">
                  Operations
                </h3>
                <div className="mt-1 text-sm text-[#ebe9df]">
                  {operationsOpen ? "Open" : "Closed"}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-8 border border-white/10 bg-white/[0.02] px-3 text-xs text-[#aeb3b7] hover:bg-white/5 hover:text-white"
                onClick={() => onOperationsOpenChange(!operationsOpen)}
              >
                {operationsOpen ? "Hide" : "Open"}
              </Button>
            </div>
            {operationsOpen ? (
              <div className="mt-5 space-y-5">
                <ContextSection
                  title="Ingestion Preflight"
                  rows={[
                    ["State", preflightStateLabel(preflight)],
                    ["Source", preflight?.source.sourcePath || preflightSourcePath || "n/a"],
                    ["Target", preflight?.target.scope ?? "Loading"],
                    ["Markdown", String(preflight?.stats.markdownFiles ?? 0)],
                    ["Manifest", preflight?.manifest.present ? "Present" : "Missing"],
                    ["Manifest SHA", shortHash(preflight?.manifest.sha256)],
                    ["Review Gate", importReady ? "Hash locked" : "Waiting"],
                    ["Dry run", preflight?.dryRunOnly ? "Yes" : "Loading"],
                  ]}
                />
                <ContextSection
                  title="Fixture"
                  rows={[
                    ["State", fixtureState?.status ?? "Loading"],
                    ["Source", fixtureState?.fixture.sourcePath ?? "n/a"],
                    ["Files", fixtureFileCount(fixtures)],
                    ["Unexpected", String(fixtureState?.counts.unexpectedFiles ?? 0)],
                    ["Semantic touched", boolLabel(fixtureState?.safety.semanticDatasetTouched)],
                    ["Latest", latestFixture ? fixtureActionLabel(latestFixture.action) : "n/a"],
                  ]}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 border-[#b8d47a]/40 bg-[#b8d47a]/10 text-sm text-[#dbe8b4] hover:bg-[#b8d47a]/16 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-[#73787d]"
                    disabled={fixtureAction.busy || fixtureState?.status === "dirty"}
                    onClick={onSeedFixture}
                  >
                    {fixtureAction.busy ? "Working" : "Seed Fixture"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 border border-white/10 bg-white/[0.02] text-sm text-[#aeb3b7] hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:text-[#73787d]"
                    disabled={
                      fixtureAction.busy ||
                      fixtureState?.status === "absent" ||
                      fixtureState?.status === "dirty"
                    }
                    onClick={onRemoveFixture}
                  >
                    Remove Files
                  </Button>
                </div>
                <ContextSection
                  title="Semantic"
                  rows={[
                    ["State", latestSemantic?.status ?? "None"],
                    ["Harness", latestSemantic?.harness.status ?? "n/a"],
                    ["Action", latestSemantic ? semanticActionLabel(latestSemantic.action) : "n/a"],
                    ["Dataset", latestSemantic?.harness.datasetName ?? "n/a"],
                    ["Job", latestSemantic?.harness.ingestionJobId ?? "n/a"],
                    ["Updated", latestSemantic ? formatDate(latestSemantic.createdAt) : "n/a"],
                  ]}
                />
                <div className="grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full border-[#8fd2ef]/35 bg-[#8fd2ef]/10 text-sm text-[#c8eaf6] hover:bg-[#8fd2ef]/16 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-[#73787d]"
                    disabled={!importReady || semanticAction.busy}
                    onClick={onQueueSemanticIngestion}
                  >
                    {semanticAction.busy ? "Working" : "Queue Reviewed Ingestion"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 w-full border border-white/10 bg-white/[0.02] text-sm text-[#aeb3b7] hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:text-[#73787d]"
                    disabled={semanticAction.busy}
                    onClick={onResetSemanticCanary}
                  >
                    Reset Canary
                  </Button>
                </div>
                <ContextSection
                  title="Latest Import"
                  rows={[
                    ["State", latestImport?.status ?? "None"],
                    ["Source", latestImport?.source.sourcePath ?? "n/a"],
                    ["Documents", String(latestImport?.documents.length ?? 0)],
                    ["Actor", latestImport?.actor.email || latestImport?.actor.subject || "n/a"],
                    ["Recorded", latestImport ? formatDate(latestImport.createdAt) : "n/a"],
                  ]}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full border-[#b8d47a]/40 bg-[#b8d47a]/10 text-sm text-[#dbe8b4] hover:bg-[#b8d47a]/16 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-[#73787d]"
                  disabled={!importReady || importAction.busy}
                  onClick={onRecordImport}
                >
                  {importAction.busy ? "Recording" : "Record Import"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      }
    />
  );
}

function SourcesView({
  summary,
  core,
}: {
  summary: OptaleBrainSummary | null;
  core: OptaleBrainPublicCoreStatus | null;
}) {
  const coreSources = core?.sources ?? [];
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const rows: BrainTableRow[] =
    coreSources.length > 0
      ? coreSources.map((source) => ({
          __key: `source:${source.id}`,
          __kind: "source",
          __id: source.id,
          source: source.name || source.id,
          kind: source.kind || "source",
          owner: source.source || "policy",
          state: source.status,
          permissions: source.permissions?.join(", ") || "none",
          namespace: source.namespace || source.profile || "scope-bound",
        }))
      : summary?.sources.map((source) => ({
          __key: `source:${source.id}`,
          __kind: "source",
          __id: source.id,
          source: source.name,
          kind: source.kind,
          owner: source.serverName || "policy",
          state: source.status,
          permissions: source.permissions.join(", ") || "none",
          namespace: source.scopes.join(", ") || "scope-bound",
        })) ?? [];
  const activeRowKey = selectableBrainRowKey(rows, selectedRowKey);

  return (
    <SplitSurface
      eyebrow="Sources"
      title="Brain Source Registry"
      description="Read bindings for vault, memory, graph, entity, communications, and company Brain lanes."
      table={
        <DataTable
          columns={["source", "kind", "owner", "state", "permissions", "namespace"]}
          rows={rows}
          rowKey={(row, index) => row.__key || `${row.source}-${index}`}
          selectedRowKey={activeRowKey}
          onRowSelect={(row) => {
            if (!brainRowIsSelectable(row)) return;
            setSelectedRowKey(row.__key);
          }}
        />
      }
      side={
        <div className="space-y-5">
          <BrainInspector detail={sourceInspectorDetail(activeRowKey, summary, core)} />
          <ContextSection
            title="Boundary"
            rows={[
              ["Private auto-write", boolLabel(core?.boundary.privateToCompanyAutomaticWrite)],
              ["Browser writes", boolLabel(core?.boundary.browserDirectSourceWrites)],
              ["Promotion required", boolLabel(core?.boundary.companyWritesRequirePromotion)],
              ["Human approval", boolLabel(core?.boundary.companyWritesRequireHumanApproval)],
            ]}
          />
        </div>
      }
    />
  );
}

function DreamsView({ data }: { data: OptaleBrainDreamsResponse | null }) {
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const rows: BrainTableRow[] =
    data?.dashboard.proposals.map((proposal) => ({
      __key: `dream:${proposal.id}`,
      __kind: "dream",
      __id: proposal.id,
      proposal: proposal.summary || proposal.id,
      target: proposal.target || "Unassigned",
      confidence:
        proposal.confidence === null
          ? "n/a"
          : `${Math.round(proposal.confidence * 100)}%`,
      levels: proposal.levels.join(", ") || "none",
      updated: formatDate(proposal.created || String(proposal.mtime || "")),
    })) ?? [];
  const activeRowKey = selectableBrainRowKey(rows, selectedRowKey);

  return (
    <SplitSurface
      eyebrow="Dreams"
      title="Promotion Candidates"
      description="Drafted observations and candidate knowledge that still need explicit approval."
      table={
        <DataTable
          columns={["proposal", "target", "confidence", "levels", "updated"]}
          rows={rows}
          rowKey={(row, index) => row.__key || `${row.proposal}-${index}`}
          selectedRowKey={activeRowKey}
          onRowSelect={(row) => {
            if (!brainRowIsSelectable(row)) return;
            setSelectedRowKey(row.__key);
          }}
        />
      }
      side={
        <div className="space-y-5">
          <BrainInspector detail={dreamInspectorDetail(activeRowKey, data)} />
          <ContextSection
            title="Dreams"
            rows={[
              ["State", data?.source.status ?? "Loading"],
              ["Messages", String(data?.dashboard.stats.messages ?? 0)],
              ["Sessions", String(data?.dashboard.stats.sessions ?? 0)],
              ["Proposals", String(data?.dashboard.proposalTotal ?? 0)],
              ["Active rejects", String(data?.dashboard.stats.activeRejections ?? 0)],
            ]}
          />
        </div>
      }
    />
  );
}

function MemoryView({ data }: { data: OptaleBrainMemoryResponse | null }) {
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const conclusionRows: BrainTableRow[] =
    data?.detail?.conclusions.map((conclusion) => ({
      __key: `memory:conclusion:${conclusion.id}`,
      __kind: "memory",
      __id: `conclusion:${conclusion.id}`,
      memory: conclusion.content || conclusion.id,
      observer: conclusion.observer_id || "n/a",
      observed: conclusion.observed_id || "n/a",
      session: conclusion.session_id || "n/a",
      created: formatDate(conclusion.created_at),
    })) ?? [];
  const peerRows: BrainTableRow[] =
    conclusionRows.length > 0
      ? conclusionRows
      : data?.peers.map((peer) => ({
          __key: `memory:peer:${peer.id}`,
          __kind: "memory",
          __id: `peer:${peer.id}`,
          memory: peer.id,
          observer: "Peer",
          observed: Object.keys(peer.metadata).slice(0, 3).join(", ") || "n/a",
          session: "n/a",
          created: formatDate(peer.created_at),
        })) ?? [];
  const activeRowKey = selectableBrainRowKey(peerRows, selectedRowKey);

  return (
    <SplitSurface
      eyebrow="Memory"
      title="Brain Memory"
      description="Scoped memory peers, sessions, and conclusions exposed through the Brain read adapter."
      table={
        <DataTable
          columns={["memory", "observer", "observed", "session", "created"]}
          rows={peerRows}
          rowKey={(row, index) => row.__key || `${row.memory}-${index}`}
          selectedRowKey={activeRowKey}
          onRowSelect={(row) => {
            if (!brainRowIsSelectable(row)) return;
            setSelectedRowKey(row.__key);
          }}
        />
      }
      side={
        <div className="space-y-5">
          <BrainInspector detail={memoryInspectorDetail(activeRowKey, data)} />
          <ContextSection
            title="Memory"
            rows={[
              ["State", data?.source.status ?? "Loading"],
              ["Workspace", data?.workspace || "n/a"],
              ["Namespace", data?.namespace || "n/a"],
              ["Peers", String(data?.peerTotal ?? 0)],
              ["Conclusions", String(data?.detail?.conclusions.length ?? 0)],
            ]}
          />
        </div>
      }
    />
  );
}

function GraphView({ data }: { data: OptaleBrainGraphResponse | null }) {
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const rows: BrainTableRow[] =
    data?.graph.nodes.map((node) => ({
      __key: `graph:${node.id}`,
      __kind: "graph",
      __id: node.id,
      node: node.label,
      type: node.type,
      state: node.status || "Loaded",
      detail: metaSummary(node.meta),
      id: node.id,
    })) ?? [];
  const activeRowKey = selectableBrainRowKey(rows, selectedRowKey);

  return (
    <SplitSurface
      eyebrow="Graph"
      title="Semantic Graph"
      description="Derived entity, fact, and episode graph exposed through scoped Relationship Graph reads."
      table={
        <DataTable
          columns={["node", "type", "state", "detail", "id"]}
          rows={rows}
          rowKey={(row, index) => row.__key || `${row.node}-${index}`}
          selectedRowKey={activeRowKey}
          onRowSelect={(row) => {
            if (!brainRowIsSelectable(row)) return;
            setSelectedRowKey(row.__key);
          }}
        />
      }
      side={
        <div className="space-y-5">
          <BrainInspector detail={graphInspectorDetail(activeRowKey, data)} />
          <ContextSection
            title="Graph"
            rows={[
              ["State", data?.source.status ?? "Loading"],
              ["Namespace", data?.namespace || "n/a"],
              ["Nodes", String(data?.semantic.stats.nodesLoaded ?? 0)],
              ["Facts", String(data?.semantic.stats.factsLoaded ?? 0)],
              ["Episodes", String(data?.semantic.stats.episodesLoaded ?? 0)],
            ]}
          />
        </div>
      }
    />
  );
}

function CompanyBrainView({
  data,
  core,
}: {
  data: OptaleCompanyBrainAddonResponse | null;
  core: OptaleBrainPublicCoreStatus | null;
}) {
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const rows: BrainTableRow[] =
    data?.promotions.map((promotion) => ({
      __key: `company:${promotion.promotionId || promotion.id || promotion.title}`,
      __kind: "company",
      __id: promotion.promotionId || promotion.id || promotion.title,
      document: promotion.title,
      source: promotion.sourceType,
      state: promotion.status,
      sensitivity: promotion.sensitivity,
      updated: formatDate(promotion.updatedAt || promotion.createdAt),
    })) ?? [];
  const companySource = core?.sources.find((source) => source.id === "company-brain");
  const activeRowKey = selectableBrainRowKey(rows, selectedRowKey);

  return (
    <SplitSurface
      eyebrow="Company Brain"
      title="Promotion Review"
      description="Shared company knowledge stays behind promotion review, approval, and read-back verification."
      table={
        <DataTable
          columns={["document", "source", "state", "sensitivity", "updated"]}
          rows={rows}
          rowKey={(row, index) => row.__key || `${row.document}-${index}`}
          selectedRowKey={activeRowKey}
          onRowSelect={(row) => {
            if (!brainRowIsSelectable(row)) return;
            setSelectedRowKey(row.__key);
          }}
        />
      }
      side={
        <div className="space-y-5">
          <BrainInspector detail={companyInspectorDetail(activeRowKey, data)} />
          <ContextSection
            title="Target"
            rows={[
              ["State", data?.source.status ?? companySource?.status ?? "Loading"],
              ["Target", data?.targetId || companySource?.namespace || "n/a"],
              ["Bridge", data?.bridge.enabled ? "Enabled" : "Read-only"],
              ["Actions", data?.actions.enabled ? "Enabled" : "Disabled"],
            ]}
          />
          <ContextSection
            title="Queue"
            rows={[
              ["Promotions", String(data?.stats.promotionsLoaded ?? 0)],
              ["Recent", String(data?.stats.recentPromotionsLoaded ?? 0)],
              ["Pending jobs", String(data?.reviewQueue?.pending ?? 0)],
              ["Processing", String(data?.reviewQueue?.processing ?? 0)],
            ]}
          />
        </div>
      }
    />
  );
}

function RetrievalView({
  summary,
  core,
}: {
  summary: OptaleBrainSummary | null;
  core: OptaleBrainPublicCoreStatus | null;
}) {
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const rows: BrainTableRow[] =
    summary?.sources.map((source) => ({
      __key: `retrieval:${source.id}`,
      __kind: "retrieval",
      __id: source.id,
      lane: source.name,
      scope: source.status,
      tools: source.toolGroups.join(", ") || "none",
      permissions: source.permissions.join(", ") || "none",
      policy: summary.mcpPolicy.enforcementMode,
    })) ?? [];
  const activeRowKey = selectableBrainRowKey(rows, selectedRowKey);

  return (
    <SplitSurface
      eyebrow="Retrieval"
      title="Context Policy"
      description="Runtime context reads are scoped by cabinet, subject, MCP policy, and source permissions."
      table={
        <DataTable
          columns={["lane", "scope", "tools", "permissions", "policy"]}
          rows={rows}
          rowKey={(row, index) => row.__key || `${row.lane}-${index}`}
          selectedRowKey={activeRowKey}
          onRowSelect={(row) => {
            if (!brainRowIsSelectable(row)) return;
            setSelectedRowKey(row.__key);
          }}
        />
      }
      side={
        <div className="space-y-5">
          <BrainInspector detail={retrievalInspectorDetail(activeRowKey, summary, core)} />
          <ContextSection
            title="Request Context"
            rows={[
              ["Subject", core?.request.brain.subjectType ?? "Loading"],
              ["Vault", core?.request.brain.vaultNamespace ?? "n/a"],
              ["Memory", core?.request.brain.memoryNamespace ?? "n/a"],
              ["Graph", core?.request.brain.graphNamespace ?? "n/a"],
              ["Knowledge", core?.request.brain.qmdProfile ?? "n/a"],
            ]}
          />
        </div>
      }
    />
  );
}

function selectableBrainRowKey(
  rows: BrainTableRow[],
  selectedKey: string | null,
): string | null {
  if (selectedKey && rows.some((row) => brainRowIsSelectable(row) && row.__key === selectedKey)) {
    return selectedKey;
  }
  return rows.find(brainRowIsSelectable)?.__key ?? null;
}

function brainRowIsSelectable(row: TableRow): row is BrainTableRow {
  return Boolean(row.__key && row.__id && row.__kind !== "empty");
}

function BrainInspector({ detail }: { detail: BrainInspectorDetail | null }) {
  return (
    <section className="border-b border-white/10 pb-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center border border-white/10 bg-white/[0.03] text-[#b8d47a]">
          <BrainInspectorIcon kind={detail?.kind} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">
            {detail?.title ?? "No Brain row selected"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#8f9498]">
            {detail?.subtitle ?? "Select a visible row to inspect its Brain context."}
          </p>
        </div>
      </div>
      {detail ? (
        <div className="mt-4 space-y-4">
          {detail.summary ? (
            <p className="text-sm leading-6 text-[#d7d9dc]">{detail.summary}</p>
          ) : null}
          <ContextSection title="Selection" rows={detail.rows} />
          {detail.related.length > 0 ? (
            <ContextSection title={detail.relatedTitle} rows={detail.related} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function BrainInspectorIcon({ kind }: { kind: BrainRowKind | undefined }) {
  if (kind === "document") return <BookOpen className="size-4" />;
  if (kind === "source" || kind === "retrieval") return <Database className="size-4" />;
  if (kind === "dream") return <Sparkles className="size-4" />;
  if (kind === "graph") return <GitBranch className="size-4" />;
  if (kind === "company") return <ShieldCheck className="size-4" />;
  return <Brain className="size-4" />;
}

function keyValue(key: string | null, prefix: string): string {
  return key?.startsWith(prefix) ? key.slice(prefix.length) : "";
}

function documentInspectorDetail(
  key: string | null,
  data: OptaleBrainVaultResponse | null,
): BrainInspectorDetail | null {
  const path = keyValue(key, "document:");
  const document = data?.documents.find((entry) => entry.path === path);
  if (!document) return null;
  return {
    kind: "document",
    title: document.title,
    subtitle: document.path,
    summary: document.snippet,
    rows: [
      ["Source", document.source],
      ["Score", String(document.score)],
      ["Size", formatBytes(document.size)],
      ["Updated", formatDate(document.updatedAt)],
      ["Query", data?.query || "none"],
    ],
    relatedTitle: "Retrieval",
    related: [
      ["QMD enabled", boolLabel(data?.stats.qmdEnabled)],
      ["Local files", String(data?.stats.scannedLocalFiles ?? 0)],
      ["Returned", String(data?.stats.returnedLocalFiles ?? 0)],
      ["Downstream calls", String(data?.stats.downstreamCalls ?? 0)],
    ],
  };
}

function sourceInspectorDetail(
  key: string | null,
  summary: OptaleBrainSummary | null,
  core: OptaleBrainPublicCoreStatus | null,
): BrainInspectorDetail | null {
  const id = keyValue(key, "source:");
  const coreSource = core?.sources.find((source) => source.id === id);
  if (coreSource) {
    return {
      kind: "source",
      title: coreSource.name || coreSource.id,
      subtitle: `${coreSource.kind} / ${coreSource.source}`,
      summary: coreSource.description,
      rows: [
        ["ID", coreSource.id],
        ["State", coreSource.status],
        ["Read only", coreSource.readOnly ? "Yes" : "No"],
        ["Namespace", coreSource.namespace || coreSource.profile || "n/a"],
        ["Scopes", coreSource.scopes.join(", ") || "none"],
        ["Permissions", coreSource.permissions.join(", ") || "none"],
      ],
      relatedTitle: "Capabilities",
      related: coreSource.capabilities.slice(0, 8).map((capability) => [
        capability,
        coreSource.mcpServerId || "native",
      ]),
    };
  }

  const source = summary?.sources.find((entry) => entry.id === id);
  if (!source) return null;
  return {
    kind: "source",
    title: source.name,
    subtitle: `${source.kind} / ${source.serverName}`,
    rows: [
      ["ID", source.id],
      ["State", source.status],
      ["Scopes", source.scopes.join(", ") || "none"],
      ["Permissions", source.permissions.join(", ") || "none"],
      ["Tool groups", source.toolGroups.join(", ") || "none"],
    ],
    relatedTitle: "Policy",
    related: [
      ["Allowed tools", countList(source.allowedTools)],
      ["Denied tools", countList(source.deniedTools)],
      ["Enforcement", summary?.mcpPolicy.enforcementMode ?? "n/a"],
    ],
  };
}

function dreamInspectorDetail(
  key: string | null,
  data: OptaleBrainDreamsResponse | null,
): BrainInspectorDetail | null {
  const id = keyValue(key, "dream:");
  const proposal = data?.dashboard.proposals.find((entry) => entry.id === id);
  if (!proposal) return null;
  return {
    kind: "dream",
    title: proposal.summary || proposal.id,
    subtitle: proposal.target || "Unassigned target",
    summary: proposal.body || proposal.summary,
    rows: [
      ["Proposal ID", proposal.id],
      ["Confidence", proposal.confidence === null ? "n/a" : `${Math.round(proposal.confidence * 100)}%`],
      ["Levels", proposal.levels.join(", ") || "none"],
      ["Source IDs", countList(proposal.sourceIds)],
      ["File", proposal.file],
      ["Updated", formatDate(proposal.created || String(proposal.mtime || ""))],
    ],
    relatedTitle: "Dreams",
    related: [
      ["Proposals", String(data?.dashboard.proposalTotal ?? 0)],
      ["Filtered", String(data?.dashboard.proposalFilteredTotal ?? 0)],
      ["Rejections", String(data?.dashboard.rejections.length ?? 0)],
      ["Rules", String(data?.dashboard.rules.length ?? 0)],
    ],
  };
}

function memoryInspectorDetail(
  key: string | null,
  data: OptaleBrainMemoryResponse | null,
): BrainInspectorDetail | null {
  const id = keyValue(key, "memory:");
  if (id.startsWith("conclusion:")) {
    const conclusionId = id.slice("conclusion:".length);
    const conclusion = data?.detail?.conclusions.find((entry) => entry.id === conclusionId);
    if (!conclusion) return null;
    return {
      kind: "memory",
      title: conclusion.content || conclusion.id,
      subtitle: "Memory conclusion",
      rows: [
        ["Conclusion ID", conclusion.id],
        ["Observer", conclusion.observer_id || "n/a"],
        ["Observed", conclusion.observed_id || "n/a"],
        ["Session", conclusion.session_id || "n/a"],
        ["Created", formatDate(conclusion.created_at)],
        ["Peer", data?.detail?.peerId || data?.selectedPeer || "n/a"],
      ],
      relatedTitle: "Memory",
      related: [
        ["Workspace", data?.workspace || "n/a"],
        ["Namespace", data?.namespace || "n/a"],
        ["Sessions", String(data?.detail?.sessions.length ?? 0)],
        ["Card lines", String(data?.detail?.card.length ?? 0)],
      ],
    };
  }

  const peerId = id.startsWith("peer:") ? id.slice("peer:".length) : id;
  const peer = data?.peers.find((entry) => entry.id === peerId);
  if (!peer) return null;
  return {
    kind: "memory",
    title: peer.id,
    subtitle: "Memory peer",
    rows: [
      ["Peer ID", peer.id],
      ["Created", formatDate(peer.created_at)],
      ["Metadata keys", Object.keys(peer.metadata).slice(0, 6).join(", ") || "none"],
      ["Selected", data?.selectedPeer === peer.id ? "Yes" : "No"],
      ["Default", data?.defaultPeer === peer.id ? "Yes" : "No"],
    ],
    relatedTitle: "Memory",
    related: [
      ["Workspace", data?.workspace || "n/a"],
      ["Namespace", data?.namespace || "n/a"],
      ["Peers", String(data?.peerTotal ?? 0)],
      ["Conclusions", String(data?.detail?.conclusions.length ?? 0)],
    ],
  };
}

function graphInspectorDetail(
  key: string | null,
  data: OptaleBrainGraphResponse | null,
): BrainInspectorDetail | null {
  const id = keyValue(key, "graph:");
  const node = data?.graph.nodes.find((entry) => entry.id === id);
  if (!node || !data) return null;
  const semanticNode = data.semantic.nodes.find((entry) => entry.id === id);
  const fact = data.semantic.facts.find((entry) => entry.id === id);
  const episode = data.semantic.episodes.find((entry) => entry.id === id);
  const edges = data.graph.edges.filter(
    (edge) => edge.source === node.id || edge.target === node.id,
  );
  return {
    kind: "graph",
    title: node.label,
    subtitle: `${node.type} / ${data.namespace || "scope-bound"}`,
    summary: semanticNode?.summary || fact?.label || episode?.summary,
    rows: [
      ["Node ID", node.id],
      ["Type", node.type],
      ["State", node.status || "Loaded"],
      ["Detail", metaSummary(node.meta)],
      ["Namespace", data.namespace || "n/a"],
      ["Profile", data.profile || "n/a"],
    ],
    relatedTitle: "Edges",
    related:
      edges.length > 0
        ? edges.slice(0, 6).map((edge) => [edge.label, edge.source === node.id ? `to ${edge.target}` : `from ${edge.source}`])
        : [
            ["Semantic nodes", String(data.semantic.stats.nodesLoaded)],
            ["Facts", String(data.semantic.stats.factsLoaded)],
            ["Episodes", String(data.semantic.stats.episodesLoaded)],
          ],
  };
}

function companyInspectorDetail(
  key: string | null,
  data: OptaleCompanyBrainAddonResponse | null,
): BrainInspectorDetail | null {
  const id = keyValue(key, "company:");
  const promotion = data?.promotions.find(
    (entry) => (entry.promotionId || entry.id || entry.title) === id,
  );
  if (!promotion) return null;
  return {
    kind: "company",
    title: promotion.title,
    subtitle: `${promotion.status} / ${promotion.sensitivity}`,
    summary: promotion.summary || promotion.content,
    rows: [
      ["Promotion ID", promotion.promotionId || promotion.id || "n/a"],
      ["Target", promotion.targetId],
      ["Source", promotion.sourceType],
      ["Agent review", promotion.agentReview.status || "n/a"],
      ["Confidence", promotion.agentReview.confidence === null || promotion.agentReview.confidence === undefined ? "n/a" : `${Math.round(promotion.agentReview.confidence * 100)}%`],
      ["Write result", promotion.writeResult.status || "n/a"],
      ["Updated", formatDate(promotion.updatedAt || promotion.createdAt)],
    ],
    relatedTitle: "Review",
    related: [
      ["Entities", promotion.entityTypes.join(", ") || "none"],
      ["Tags", promotion.tags.join(", ") || "none"],
      ["Recommendations", String(promotion.agentReview.recommendations.length)],
      ["Writes", String(promotion.writeResult.writes.length)],
    ],
  };
}

function retrievalInspectorDetail(
  key: string | null,
  summary: OptaleBrainSummary | null,
  core: OptaleBrainPublicCoreStatus | null,
): BrainInspectorDetail | null {
  const id = keyValue(key, "retrieval:");
  const source = summary?.sources.find((entry) => entry.id === id);
  if (!source) return null;
  return {
    kind: "retrieval",
    title: source.name,
    subtitle: `${source.status} / ${summary?.mcpPolicy.enforcementMode ?? "policy"}`,
    rows: [
      ["Source ID", source.id],
      ["Server", source.serverName],
      ["Kind", source.kind],
      ["Scopes", source.scopes.join(", ") || "none"],
      ["Permissions", source.permissions.join(", ") || "none"],
      ["Allowed tools", countList(source.allowedTools)],
      ["Denied tools", countList(source.deniedTools)],
    ],
    relatedTitle: "Request Context",
    related: [
      ["Subject", core?.request.brain.subjectType ?? "n/a"],
      ["Vault", core?.request.brain.vaultNamespace ?? "n/a"],
      ["Memory", core?.request.brain.memoryNamespace ?? "n/a"],
      ["Graph", core?.request.brain.graphNamespace ?? "n/a"],
      ["Knowledge", core?.request.brain.qmdProfile ?? "n/a"],
    ],
  };
}

function BrainNotice({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="border border-[#c9a86a]/30 bg-[#c9a86a]/8 px-3 py-2 text-sm text-[#d8c18c]">
      {error}
    </div>
  );
}

function BrainIsolationStrip({
  isolation,
  loading,
}: {
  isolation: OptaleBrainIsolationPayload | null;
  loading: boolean;
}) {
  const counts = isolation?.checks.reduce(
    (total, entry) => ({
      green: total.green + (entry.status === "green" ? 1 : 0),
      yellow: total.yellow + (entry.status === "yellow" ? 1 : 0),
      red: total.red + (entry.status === "red" ? 1 : 0),
    }),
    { green: 0, yellow: 0, red: 0 },
  ) ?? { green: 0, yellow: 0, red: 0 };
  const blocking = isolation?.checks.filter((entry) => entry.status !== "green") ?? [];
  const ready = Boolean(isolation?.readyForIngestion);

  return (
    <div
      className={cn(
        "grid gap-3 border px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto]",
        ready
          ? "border-[#b8d47a]/30 bg-[#b8d47a]/8 text-[#dbe8b4]"
          : "border-[#c9a86a]/30 bg-[#c9a86a]/8 text-[#d8c18c]",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {ready ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#b8d47a]" />
        ) : (
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#c9a86a]" />
        )}
        <div className="min-w-0 space-y-1">
          <div className="font-medium text-white">
            {loading ? "Checking isolation" : ready ? "Isolation Gate Ready" : "Isolation Gate"}
          </div>
          <div className="text-xs text-[#aeb3b7]">
            {loading
              ? "Company and personal Brain boundaries are being checked."
              : ready
                ? "Company and personal Brain lanes are separate and ready for ingestion."
                : blocking[0]?.message || "Isolation status is not loaded yet."}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-right text-xs md:min-w-[220px]">
        <div>
          <div className="text-[#73787d]">Green</div>
          <div className="font-mono text-white">{counts.green}</div>
        </div>
        <div>
          <div className="text-[#73787d]">Warn</div>
          <div className="font-mono text-white">{counts.yellow}</div>
        </div>
        <div>
          <div className="text-[#73787d]">Block</div>
          <div className="font-mono text-white">{counts.red}</div>
        </div>
      </div>
    </div>
  );
}

function useBrainEndpoint<T>(
  url: string | null,
  refreshKey: number,
): BrainEndpointState<T> {
  const requestKey = url ? `${url}::${refreshKey}` : "";
  const [state, setState] = useState<BrainEndpointResult<T>>({
    requestKey: "",
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!url) return;
    const currentRequestKey = requestKey;

    const controller = new AbortController();

    void fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as T | null;
        const error = response.ok ? null : errorFromPayload(payload, response.status);
        setState({ requestKey: currentRequestKey, data: payload, error });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          requestKey: currentRequestKey,
          data: null,
          error: error instanceof Error ? error.message : "Brain request failed",
        });
      });

    return () => controller.abort();
  }, [requestKey, url]);

  if (!url) return { data: null, error: null, loading: false };
  const settled = state.requestKey === requestKey;
  return {
    data: settled ? state.data : null,
    error: settled ? state.error : null,
    loading: !settled,
  };
}

type BrainActivePayload =
  | OptaleBrainVaultResponse
  | OptaleBrainDreamsResponse
  | OptaleBrainMemoryResponse
  | OptaleBrainGraphResponse
  | OptaleCompanyBrainAddonResponse;

function endpointForView(
  view: BrainConsoleView,
  query: string,
  cabinetPath: string,
): string | null {
  const params = { limit: "8", q: query };
  if (view === "knowledge") {
    return brainUrl("/api/optale/brain/vault", cabinetPath, params);
  }
  if (view === "dreams") {
    return brainUrl("/api/optale/brain/dreams", cabinetPath, params);
  }
  if (view === "memory") {
    return brainUrl("/api/optale/brain/memory", cabinetPath, params);
  }
  if (view === "graph") {
    return brainUrl("/api/optale/brain/graph", cabinetPath, params);
  }
  if (view === "company") {
    return brainUrl("/api/optale/brain/company-brain", cabinetPath, {
      status: "pending_review,in_review,approved,promoted,failed",
    });
  }
  return null;
}

function brainUrl(
  pathname: string,
  cabinetPath: string,
  params: Record<string, string> = {},
) {
  const search = new URLSearchParams({ cabinetPath });
  for (const [key, value] of Object.entries(params)) {
    if (value.trim()) search.set(key, value.trim());
  }
  return `${pathname}?${search.toString()}`;
}

function brainIsolationUrl(personalCabinetPath: string): string {
  const search = new URLSearchParams({
    companyCabinetPath: ".",
    personalCabinetPath,
  });
  return `/api/optale/admin/brain-isolation?${search.toString()}`;
}

function brainIngestionPreflightUrl(
  cabinetPath: string,
  sourcePath: string,
  personalCabinetPath: string,
): string {
  const search = new URLSearchParams({
    cabinetPath,
    sourcePath,
    personalCabinetPath,
  });
  return `/api/optale/admin/brain-ingestion-preflight?${search.toString()}`;
}

function brainMountedVaultImportsUrl(): string {
  return "/api/optale/admin/brain-mounted-vault-imports?limit=10";
}

function brainFixturesUrl(): string {
  return "/api/optale/admin/brain-fixtures?limit=10";
}

function brainSemanticOperationsUrl(): string {
  return "/api/optale/admin/brain-semantic-operations?limit=10";
}

function ingestionSourcePathForScope(scope: BrainWorkspaceScope): string {
  return scope === "company" ? "company-brain" : "";
}

function cabinetPathForScope(
  scope: BrainWorkspaceScope,
  identity: OptaleIdentitySnapshot | null,
): string {
  if (scope === "company") return ".";
  const subject =
    identity?.email || identity?.subject || identity?.name || "local-operator";
  return `personal/${slugSegment(subject, "operator")}`;
}

function slugSegment(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/@.+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function brainViewFromSubpage(subpage: string): BrainConsoleView {
  const normalized = subpage.toLowerCase();
  if (normalized.includes("source")) return "sources";
  if (normalized.includes("dream")) return "dreams";
  if (normalized.includes("memory")) return "memory";
  if (normalized.includes("graph")) return "graph";
  if (normalized.includes("company")) return "company";
  if (normalized.includes("retrieval")) return "retrieval";
  return "knowledge";
}

function descriptionForView(view: BrainConsoleView): string {
  if (view === "sources") return "The live source registry and read boundaries for Brain.";
  if (view === "dreams") return "Candidate observations before they become approved knowledge.";
  if (view === "memory") return "Scoped long-term memory surfaced through the Brain adapter.";
  if (view === "graph") return "Entity and relationship context available to retrieval.";
  if (view === "company") return "Approved shared knowledge and the promotion queue.";
  if (view === "retrieval") return "How agents and tools are allowed to retrieve Brain context.";
  return "Knowledge base documents and source material available for retrieval.";
}

function isVaultPayload(value: BrainActivePayload | null): value is OptaleBrainVaultResponse {
  return Boolean(value && "documents" in value);
}

function isDreamsPayload(value: BrainActivePayload | null): value is OptaleBrainDreamsResponse {
  return Boolean(value && "dashboard" in value);
}

function isMemoryPayload(value: BrainActivePayload | null): value is OptaleBrainMemoryResponse {
  return Boolean(value && "peers" in value && "detail" in value);
}

function isGraphPayload(value: BrainActivePayload | null): value is OptaleBrainGraphResponse {
  return Boolean(value && "semantic" in value && "graph" in value);
}

function isCompanyPayload(
  value: BrainActivePayload | null,
): value is OptaleCompanyBrainAddonResponse {
  return Boolean(value && "addon" in value && "promotions" in value);
}

function errorFromPayload(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const error = record.error || record.message;
    if (typeof error === "string" && error.trim()) return error;
    const addon = record.addon;
    if (addon && typeof addon === "object") {
      const reason = (addon as Record<string, unknown>).reason;
      if (typeof reason === "string" && reason.trim()) return reason;
    }
  }
  return `Brain request failed: ${status}`;
}

async function mutateBrainEndpoint(
  url: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(errorFromPayload(payload, response.status));
  }
  return payload;
}

function boolLabel(value: boolean | undefined): string {
  if (value === undefined) return "Loading";
  return value ? "Yes" : "No";
}

function shortHash(value: string | undefined): string {
  return value ? value.slice(0, 12) : "n/a";
}

function serverCount(summary: OptaleBrainSummary | null): string {
  if (!summary) return "Loading";
  return `${summary.mcpPolicy.enabledServers}/${summary.mcpPolicy.totalServers}`;
}

function preflightStateLabel(
  preflight: OptaleBrainIngestionPreflightPayload | null,
): string {
  if (!preflight) return "Loading";
  if (!preflight.readyForReview) return "Blocked";
  if (preflight.stats.markdownFiles === 0) return "No docs";
  return "Ready";
}

function semanticActionLabel(action: string): string {
  return action
    .replace(/^semantic_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fixtureActionLabel(action: string): string {
  return action
    .replace(/^fixture_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fixtureFileCount(fixtures: OptaleBrainFixtureLifecyclePayload | null): string {
  if (!fixtures) return "Loading";
  return `${fixtures.state.counts.matchingFiles}/${fixtures.state.counts.expectedFiles}`;
}

function countList(values: unknown[] | undefined): string {
  return String(values?.length ?? 0);
}

function loadingRows(primaryColumn: string): BrainTableRow[] {
  return [
    {
      __key: "empty:loading",
      __kind: "empty",
      __id: "loading",
      [primaryColumn]: "Loading",
      path: "n/a",
      source: "n/a",
      updated: "n/a",
      size: "n/a",
    },
  ];
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`;
  return `${Math.round(value / 1024 / 102.4) / 10} MB`;
}

function formatDate(value: string | undefined): string {
  if (!value) return "n/a";
  const parsed = Number(value);
  const date = Number.isFinite(parsed) && parsed > 0 ? new Date(parsed) : new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function metaSummary(meta: Record<string, string | number | boolean> | undefined): string {
  if (!meta) return "n/a";
  const entries = Object.entries(meta).slice(0, 2);
  if (entries.length === 0) return "n/a";
  return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

"use client";

import { Box, GitBranch, Layers3, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConsoleEndpoint } from "./live-endpoint";
import {
  ContextSection,
  DataTable,
  SplitSurface,
} from "./primitives";
import type { TableRow } from "./types";

type ObjectFact = {
  label: string;
  value: string | number | boolean;
};

type ObjectResource = {
  id: string;
  kind: string;
  label: string;
  status?: string;
  source: string;
  cabinetPath?: string;
  updatedAt?: string;
  facts?: ObjectFact[];
  operationalSpine?: {
    refs?: Record<string, { status?: string }>;
  };
  oag?: {
    objectType?: string;
    scope?: string;
    schemaRef?: string;
  };
  oagSchema?: {
    schemaRef?: string;
    objectType?: string;
    label?: string;
    category?: string;
    fieldCount?: number;
    relationshipCount?: number;
    actionCount?: number;
    sourceSystems?: string[];
  };
};

type ResourceRegistryPayload = {
  generatedAt: string;
  resources: ObjectResource[];
  counts: Record<string, number>;
  operationalSpine?: {
    bindingCount?: number;
    capabilities?: Record<string, Record<string, number>>;
  };
};

type ActionGraphNode = {
  id: string;
  title: string;
  type: string;
  category?: string;
  status?: string;
  owner?: string;
  summary?: string;
  health?: {
    key?: string;
    label?: string;
    severity?: string;
  };
  raw?: {
    workspace_id?: string;
    ontology_id?: string;
    lens?: Record<string, { key?: string; label?: string; severity?: string }>;
  } & Record<string, unknown>;
};

type ActionGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  fact?: string;
  validAt?: string;
  active?: boolean;
  raw?: {
    first_seen_at?: string;
    valid_at?: string;
  } & Record<string, unknown>;
};

type ActionGraphCluster = {
  id: string;
  label: string;
  nodeCount: number;
  edgeCount: number;
  relationshipTypes: Record<string, number>;
};

type ActionGraphPayload = {
  generatedAt: string;
  namespace: string;
  profile: string;
  source: {
    status?: string;
    statusReason?: string;
  };
  graph: {
    nodes: ActionGraphNode[];
    edges: ActionGraphEdge[];
    clusters: ActionGraphCluster[];
    meta: {
      graphName?: string;
      workspaceId?: string;
      ontologyId?: string;
      nodeCount: number;
      edgeCount: number;
      totalEdgeCount: number;
      relationship: string;
      hasNext: boolean;
    };
  };
  stats: {
    entitiesEnabled: boolean;
    apiConfigured: boolean;
    downstreamCalls: number;
    downstreamErrors: number;
    nodesLoaded: number;
    edgesLoaded: number;
    clustersLoaded: number;
  };
};

type ObjectRowKind = "node" | "resource" | "edge" | "type" | "schema" | "empty";

type ObjectTableRow = TableRow & {
  __key: string;
  __kind: ObjectRowKind;
  __id: string;
};

export function ObjectsSurface({ subpage }: { subpage: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const registry = useConsoleEndpoint<ResourceRegistryPayload>(
    "/api/optale/resources?limit=120",
    refreshKey,
  );
  const actionGraph = useConsoleEndpoint<ActionGraphPayload>(
    "/api/optale/brain/entities?limit=120",
    refreshKey,
  );
  const columns = objectColumnsForSubpage(subpage);
  const rows = objectRowsForSubpage(
    subpage,
    registry.data,
    actionGraph.data,
    registry.loading || actionGraph.loading,
  );
  const activeRowKey = selectableRowKey(rows, selectedRowKey);

  return (
    <SplitSurface
      eyebrow="Objects"
      title={subpage}
      description="Projects, tasks, CRM, conversations, spaces, agents, and source records are represented as governed ontology objects."
      table={
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 border border-white/10 text-[#aeb3b7] hover:bg-white/5 hover:text-white"
              onClick={() => setRefreshKey((current) => current + 1)}
              aria-label="Refresh Objects"
              title="Refresh"
            >
              {registry.loading || actionGraph.loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </div>
          {registry.error ? <LiveError message={registry.error} /> : null}
          {actionGraph.error ? <LiveError message={actionGraph.error} /> : null}
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row, index) => row.__key || `${row[columns[0]]}-${index}`}
            selectedRowKey={activeRowKey}
            onRowSelect={(row) => {
              if (!rowIsSelectable(row)) return;
              setSelectedRowKey(row.__key);
            }}
          />
        </div>
      }
      side={
        <div className="space-y-5">
          <ObjectInspector
            selectedKey={activeRowKey}
            registry={registry.data}
            actionGraph={actionGraph.data}
          />
          <ContextSection
            title="Registry"
            rows={[
              ["Objects", String(registry.data?.resources.length ?? 0)],
              ["Spaces", String(registry.data?.counts.space ?? 0)],
              ["Agents", String(registry.data?.counts.agent ?? 0)],
              ["Tasks", String(registry.data?.counts.task ?? 0)],
              ["Conversations", String(registry.data?.counts.conversation ?? 0)],
              ["Updated", formatDate(registry.data?.generatedAt)],
            ]}
          />
          <ContextSection
            title="Ontology"
            rows={[
              ["Source", actionGraphSourceLabel(actionGraph.data)],
              ["Workspace", actionGraph.data?.graph.meta.workspaceId ?? "n/a"],
              ["Ontology", actionGraph.data?.graph.meta.ontologyId ?? "n/a"],
              ["Schemas", String(schemaCount(registry.data))],
              ["Audit refs", capabilityCount(registry.data, "audit_event")],
              ["Lineage refs", capabilityCount(registry.data, "lineage_edge")],
              ["Policy refs", capabilityCount(registry.data, "policy_decision")],
            ]}
          />
          <ContextSection
            title="Action Graph"
            rows={[
              ["Status", actionGraph.data?.source.status ?? "loading"],
              ["Nodes", String(actionGraph.data?.stats.nodesLoaded ?? 0)],
              ["Edges", String(actionGraph.data?.stats.edgesLoaded ?? 0)],
              ["Clusters", String(actionGraph.data?.stats.clustersLoaded ?? 0)],
              ["Downstream errors", String(actionGraph.data?.stats.downstreamErrors ?? 0)],
            ]}
          />
        </div>
      }
    />
  );
}

function objectColumnsForSubpage(subpage: string): string[] {
  const normalized = subpage.toLowerCase();
  if (normalized.includes("schema")) {
    return ["schema", "object", "category", "fields", "relationships", "actions"];
  }
  if (normalized.includes("relationship")) {
    return ["source", "relationship", "target", "state", "fact", "valid at"];
  }
  if (normalized.includes("ontology")) {
    return ["type", "records", "state", "source", "scope", "schema"];
  }
  return ["object", "type", "state", "source", "scope", "updated"];
}

function objectRowsForSubpage(
  subpage: string,
  registry: ResourceRegistryPayload | null,
  actionGraph: ActionGraphPayload | null,
  loading: boolean,
): ObjectTableRow[] {
  if (loading) return [stateRowForSubpage(subpage, "Loading", "Loading")];
  const resources = registry?.resources ?? [];
  const nodes = actionGraph?.graph.nodes ?? [];
  const edges = actionGraph?.graph.edges ?? [];
  if (resources.length === 0 && nodes.length === 0) return emptyRowsForSubpage(subpage);

  const normalized = subpage.toLowerCase();
  if (normalized.includes("schema")) {
    const rows = schemaRows(resources);
    return rows.length > 0 ? rows : emptyRowsForSubpage(subpage);
  }
  if (normalized.includes("relationship")) {
    const rows = edges.length > 0
      ? actionGraphRelationshipRows(actionGraph)
      : relationshipRows(resources);
    return rows.length > 0 ? rows : emptyRowsForSubpage(subpage);
  }
  if (normalized.includes("ontology")) {
    const rows = nodes.length > 0 ? actionGraphOntologyRows(actionGraph) : ontologyRows(resources);
    return rows.length > 0 ? rows : emptyRowsForSubpage(subpage);
  }
  return actionGraphRegistryRows(actionGraph).concat(resourceRows(resources)).slice(0, 80);
}

function stateRowForSubpage(
  subpage: string,
  label: string,
  state: string,
): ObjectTableRow {
  const normalized = subpage.toLowerCase();
  if (normalized.includes("schema")) {
    return {
      __key: "empty:schema",
      __kind: "empty",
      __id: "empty",
      schema: label,
      object: "n/a",
      category: "n/a",
      fields: "0",
      relationships: "0",
      actions: "0",
    };
  }
  if (normalized.includes("relationship")) {
    return {
      __key: "empty:relationship",
      __kind: "empty",
      __id: "empty",
      source: label,
      relationship: "n/a",
      target: "n/a",
      state,
      fact: "n/a",
      "valid at": "n/a",
    };
  }
  if (normalized.includes("ontology")) {
    return {
      __key: "empty:ontology",
      __kind: "empty",
      __id: "empty",
      type: label,
      records: "0",
      state,
      source: "n/a",
      scope: "n/a",
      schema: "n/a",
    };
  }
  return {
    __key: "empty:registry",
    __kind: "empty",
    __id: "empty",
    object: label,
    type: "n/a",
    state,
    source: "n/a",
    scope: "n/a",
    updated: "n/a",
  };
}

function emptyRowsForSubpage(subpage: string): ObjectTableRow[] {
  return [stateRowForSubpage(subpage, emptyLabelForSubpage(subpage), "Empty")];
}

function emptyLabelForSubpage(subpage: string): string {
  const normalized = subpage.toLowerCase();
  if (normalized.includes("schema")) return "No schemas visible";
  if (normalized.includes("relationship")) return "No relationship refs visible";
  if (normalized.includes("ontology")) return "No object types visible";
  return "No objects visible";
}

function resourceRows(resources: ObjectResource[]): ObjectTableRow[] {
  return resources.map((resource) => ({
    __key: `resource:${resource.id}`,
    __kind: "resource",
    __id: resource.id,
    object: resource.label,
    type: objectTypeLabel(resource),
    state: resource.status ?? "registered",
    source: sourceLabel(resource.source),
    scope: objectScope(resource),
    updated: formatDate(resource.updatedAt),
  }));
}

function actionGraphRegistryRows(actionGraph: ActionGraphPayload | null): ObjectTableRow[] {
  if (!actionGraph) return [];
  return actionGraph.graph.nodes.map((node) => ({
    __key: `node:${node.id}`,
    __kind: "node",
    __id: node.id,
    object: node.title || node.id,
    type: node.type || "object",
    state: node.status || "linked",
    source: "Action Graph",
    scope: actionGraph.graph.meta.workspaceId || actionGraph.namespace,
    updated: formatDate(actionGraph.generatedAt),
  }));
}

function schemaRows(resources: ObjectResource[]): ObjectTableRow[] {
  const schemas = new Map<string, ObjectTableRow>();
  for (const resource of resources) {
    const schema = resource.oagSchema;
    const schemaRef = schema?.schemaRef || resource.oag?.schemaRef;
    if (!schemaRef || schemas.has(schemaRef)) continue;
    schemas.set(schemaRef, {
      __key: `schema:${schemaRef}`,
      __kind: "schema",
      __id: schemaRef,
      schema: schemaRef,
      object: schema?.label || schema?.objectType || objectTypeLabel(resource),
      category: schema?.category || "n/a",
      fields: String(schema?.fieldCount ?? 0),
      relationships: String(schema?.relationshipCount ?? 0),
      actions: String(schema?.actionCount ?? 0),
    });
  }
  return Array.from(schemas.values()).slice(0, 80);
}

function actionGraphRelationshipRows(actionGraph: ActionGraphPayload | null): ObjectTableRow[] {
  if (!actionGraph) return [];
  const nodeLabels = new Map(
    actionGraph.graph.nodes.map((node) => [node.id, node.title || node.id]),
  );
  return actionGraph.graph.edges.slice(0, 80).map((edge) => ({
    __key: `edge:${edge.id}`,
    __kind: "edge",
    __id: edge.id,
    source: nodeLabels.get(edge.source) || edge.source,
    relationship: edge.type,
    target: nodeLabels.get(edge.target) || edge.target,
    state: edge.active === false ? "inactive" : "active",
    fact: edge.fact || "n/a",
    "valid at": edge.validAt ? formatDate(edge.validAt) : "n/a",
  }));
}

function relationshipRows(resources: ObjectResource[]): ObjectTableRow[] {
  return resources.slice(0, 80).map((resource) => ({
    __key: `resource:${resource.id}`,
    __kind: "resource",
    __id: resource.id,
    source: resource.label,
    relationship: objectTypeLabel(resource),
    target: objectScope(resource),
    state: resource.status ?? "registered",
    fact: `Audit ${spineStatus(resource, "audit_event")}; lineage ${spineStatus(resource, "lineage_edge")}; policy ${spineStatus(resource, "policy_decision")}`,
    "valid at": formatDate(resource.updatedAt),
  }));
}

function actionGraphOntologyRows(actionGraph: ActionGraphPayload | null): ObjectTableRow[] {
  if (!actionGraph) return [];
  const groups = new Map<string, { count: number; categories: Set<string> }>();
  for (const node of actionGraph.graph.nodes) {
    const type = node.type || "object";
    const group = groups.get(type) ?? { count: 0, categories: new Set<string>() };
    group.count += 1;
    if (node.category) group.categories.add(node.category);
    groups.set(type, group);
  }
  return Array.from(groups.entries()).map(([type, group]) => ({
    __key: `type:${type}`,
    __kind: "type",
    __id: type,
    type,
    records: String(group.count),
    state: "Linked",
    source: "Action Graph",
    scope: actionGraph.graph.meta.workspaceId || actionGraph.namespace,
    schema: group.categories.size > 0 ? Array.from(group.categories).join(", ") : "n/a",
  }));
}

function ontologyRows(resources: ObjectResource[]): ObjectTableRow[] {
  const groups = new Map<string, { count: number; source: Set<string>; scope: Set<string>; schema: Set<string> }>();
  for (const resource of resources) {
    const type = objectTypeLabel(resource);
    const group = groups.get(type) ?? {
      count: 0,
      source: new Set<string>(),
      scope: new Set<string>(),
      schema: new Set<string>(),
    };
    group.count += 1;
    group.source.add(sourceLabel(resource.source));
    group.scope.add(objectScope(resource));
    if (resource.oagSchema?.schemaRef || resource.oag?.schemaRef) {
      group.schema.add(resource.oagSchema?.schemaRef || resource.oag?.schemaRef || "");
    }
    groups.set(type, group);
  }
  return Array.from(groups.entries()).map(([type, group]) => ({
    __key: `type:${type}`,
    __kind: "type",
    __id: type,
    type,
    records: String(group.count),
    state: group.count > 0 ? "Registered" : "Empty",
    source: Array.from(group.source).join(", ") || "n/a",
    scope: Array.from(group.scope).join(", ") || "n/a",
    schema: Array.from(group.schema).filter(Boolean).join(", ") || "n/a",
  }));
}

function selectableRowKey(
  rows: ObjectTableRow[],
  selectedKey: string | null,
): string | null {
  if (selectedKey && rows.some((row) => rowIsSelectable(row) && row.__key === selectedKey)) {
    return selectedKey;
  }
  return rows.find(rowIsSelectable)?.__key ?? null;
}

function rowIsSelectable(row: TableRow): row is ObjectTableRow {
  return Boolean(row.__key && row.__id && row.__kind !== "empty");
}

function ObjectInspector({
  selectedKey,
  registry,
  actionGraph,
}: {
  selectedKey: string | null;
  registry: ResourceRegistryPayload | null;
  actionGraph: ActionGraphPayload | null;
}) {
  const detail = selectedKey
    ? inspectorDetailForKey(selectedKey, registry, actionGraph)
    : null;
  const Icon =
    detail?.kind === "edge" ? GitBranch : detail?.kind === "type" ? Layers3 : Box;

  return (
    <section className="border-b border-white/10 pb-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center border border-white/10 bg-white/[0.03] text-[#b8d47a]">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">
            {detail?.title ?? "No object selected"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#8f9498]">
            {detail?.subtitle ?? "Select a visible row to inspect its ontology binding."}
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

type InspectorDetail = {
  kind: ObjectRowKind;
  title: string;
  subtitle: string;
  summary?: string;
  rows: [string, string][];
  relatedTitle: string;
  related: [string, string][];
};

function inspectorDetailForKey(
  key: string,
  registry: ResourceRegistryPayload | null,
  actionGraph: ActionGraphPayload | null,
): InspectorDetail | null {
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  if (!id) return null;
  if (kind === "node") return nodeInspectorDetail(id, actionGraph);
  if (kind === "edge") return edgeInspectorDetail(id, actionGraph);
  if (kind === "type") return typeInspectorDetail(id, registry, actionGraph);
  if (kind === "schema") return schemaInspectorDetail(id, registry);
  if (kind === "resource") return resourceInspectorDetail(id, registry);
  return null;
}

function nodeInspectorDetail(
  id: string,
  actionGraph: ActionGraphPayload | null,
): InspectorDetail | null {
  const node = actionGraph?.graph.nodes.find((entry) => entry.id === id);
  if (!node || !actionGraph) return null;
  const edges = actionGraph.graph.edges.filter(
    (edge) => edge.source === node.id || edge.target === node.id,
  );
  const nodeLabels = nodeLabelMap(actionGraph);
  return {
    kind: "node",
    title: node.title || node.id,
    subtitle: `${node.type || "object"} / ${node.category || "uncategorized"}`,
    summary: node.summary,
    rows: [
      ["ID", node.id],
      ["Type", node.type || "object"],
      ["Category", node.category || "n/a"],
      ["State", node.status || "linked"],
      ["Health", node.health?.label || lensLabel(node, "health") || "n/a"],
      ["Workspace", node.raw?.workspace_id || actionGraph.graph.meta.workspaceId || actionGraph.namespace],
      ["Ontology", node.raw?.ontology_id || actionGraph.graph.meta.ontologyId || "n/a"],
    ],
    relatedTitle: "Relationships",
    related: edges.slice(0, 5).map((edge) => [
      edge.type,
      edge.source === node.id
        ? `to ${nodeLabels.get(edge.target) || edge.target}`
        : `from ${nodeLabels.get(edge.source) || edge.source}`,
    ]),
  };
}

function edgeInspectorDetail(
  id: string,
  actionGraph: ActionGraphPayload | null,
): InspectorDetail | null {
  const edge = actionGraph?.graph.edges.find((entry) => entry.id === id);
  if (!edge || !actionGraph) return null;
  const nodeLabels = nodeLabelMap(actionGraph);
  return {
    kind: "edge",
    title: edge.type,
    subtitle: `${nodeLabels.get(edge.source) || edge.source} -> ${nodeLabels.get(edge.target) || edge.target}`,
    summary: edge.fact,
    rows: [
      ["Source", nodeLabels.get(edge.source) || edge.source],
      ["Target", nodeLabels.get(edge.target) || edge.target],
      ["State", edge.active === false ? "inactive" : "active"],
      ["Workspace", actionGraph.graph.meta.workspaceId || actionGraph.namespace],
      ["Ontology", actionGraph.graph.meta.ontologyId || "n/a"],
      ["Valid at", formatDate(edge.validAt || edge.raw?.valid_at)],
      ["First seen", formatDate(edge.raw?.first_seen_at)],
    ],
    relatedTitle: "Identifiers",
    related: [["Edge ID", edge.id]],
  };
}

function typeInspectorDetail(
  id: string,
  registry: ResourceRegistryPayload | null,
  actionGraph: ActionGraphPayload | null,
): InspectorDetail | null {
  const nodes = actionGraph?.graph.nodes.filter((node) => node.type === id) ?? [];
  if (nodes.length > 0 && actionGraph) {
    const categories = uniqueLabels(nodes.map((node) => node.category));
    const relationshipCount = actionGraph.graph.edges.filter((edge) =>
      nodes.some((node) => node.id === edge.source || node.id === edge.target),
    ).length;
    return {
      kind: "type",
      title: id,
      subtitle: "Action Graph object type",
      rows: [
        ["Records", String(nodes.length)],
        ["Categories", categories || "n/a"],
        ["Relationships", String(relationshipCount)],
        ["Workspace", actionGraph.graph.meta.workspaceId || actionGraph.namespace],
        ["Ontology", actionGraph.graph.meta.ontologyId || "n/a"],
      ],
      relatedTitle: "Objects",
      related: nodes.slice(0, 5).map((node) => [
        node.title || node.id,
        node.status || node.category || "linked",
      ]),
    };
  }

  const resources = registry?.resources.filter(
    (resource) => objectTypeLabel(resource) === id,
  ) ?? [];
  if (resources.length === 0) return null;
  return {
    kind: "type",
    title: id,
    subtitle: "Registered object type",
    rows: [
      ["Records", String(resources.length)],
      ["Source", uniqueLabels(resources.map((resource) => sourceLabel(resource.source)))],
      ["Scope", uniqueLabels(resources.map(objectScope))],
      ["Schemas", uniqueLabels(resources.map((resource) => resource.oagSchema?.schemaRef || resource.oag?.schemaRef)) || "n/a"],
    ],
    relatedTitle: "Objects",
    related: resources.slice(0, 5).map((resource) => [
      resource.label,
      resource.status || "registered",
    ]),
  };
}

function schemaInspectorDetail(
  schemaRef: string,
  registry: ResourceRegistryPayload | null,
): InspectorDetail | null {
  const resources = registry?.resources.filter(
    (resource) => resource.oagSchema?.schemaRef === schemaRef || resource.oag?.schemaRef === schemaRef,
  ) ?? [];
  const schema = resources.find((resource) => resource.oagSchema)?.oagSchema;
  if (resources.length === 0 && !schema) return null;
  return {
    kind: "schema",
    title: schema?.label || schema?.objectType || schemaRef,
    subtitle: schemaRef,
    rows: [
      ["Object", schema?.objectType || objectTypeLabel(resources[0])],
      ["Category", schema?.category || "n/a"],
      ["Fields", String(schema?.fieldCount ?? 0)],
      ["Relationships", String(schema?.relationshipCount ?? 0)],
      ["Actions", String(schema?.actionCount ?? 0)],
      ["Systems", uniqueLabels(schema?.sourceSystems) || "n/a"],
    ],
    relatedTitle: "Resources",
    related: resources.slice(0, 5).map((resource) => [
      resource.label,
      resource.status || "registered",
    ]),
  };
}

function resourceInspectorDetail(
  id: string,
  registry: ResourceRegistryPayload | null,
): InspectorDetail | null {
  const resource = registry?.resources.find((entry) => entry.id === id);
  if (!resource) return null;
  return {
    kind: "resource",
    title: resource.label,
    subtitle: `${objectTypeLabel(resource)} / ${sourceLabel(resource.source)}`,
    rows: [
      ["ID", resource.id],
      ["Kind", resource.kind],
      ["State", resource.status || "registered"],
      ["Scope", objectScope(resource)],
      ["Schema", resource.oagSchema?.schemaRef || resource.oag?.schemaRef || "n/a"],
      ["Updated", formatDate(resource.updatedAt)],
    ],
    relatedTitle: "Operational Spine",
    related: [
      ["Audit", spineStatus(resource, "audit_event")],
      ["Lineage", spineStatus(resource, "lineage_edge")],
      ["Policy", spineStatus(resource, "policy_decision")],
    ],
  };
}

function nodeLabelMap(actionGraph: ActionGraphPayload): Map<string, string> {
  return new Map(
    actionGraph.graph.nodes.map((node) => [node.id, node.title || node.id]),
  );
}

function lensLabel(node: ActionGraphNode, key: string): string | undefined {
  return node.raw?.lens?.[key]?.label;
}

function uniqueLabels(values: Array<string | undefined> | undefined): string {
  if (!values) return "";
  return Array.from(new Set(values.filter(Boolean) as string[])).join(", ");
}

function actionGraphSourceLabel(actionGraph: ActionGraphPayload | null): string {
  if (!actionGraph) return "loading";
  if (!actionGraph.stats.apiConfigured) return "unconfigured";
  if (!actionGraph.stats.entitiesEnabled) return "disabled";
  return "Live OAG";
}

function LiveError({ message }: { message: string }) {
  return (
    <div className="border border-[#c9a86a]/30 bg-[#c9a86a]/8 px-3 py-2 text-sm text-[#d8c18c]">
      {message}
    </div>
  );
}

function objectTypeLabel(resource: ObjectResource): string {
  return resource.oag?.objectType || resource.oagSchema?.objectType || resource.kind.replace(/_/g, " ");
}

function objectScope(resource: ObjectResource): string {
  const explicit = resource.oag?.scope || factValue(resource.facts, "Scope");
  return explicit || "scope-bound";
}

function factValue(facts: ObjectFact[] | undefined, label: string): string | undefined {
  const value = facts?.find((fact) => fact.label === label)?.value;
  return value === undefined ? undefined : String(value);
}

function spineStatus(resource: ObjectResource, capability: string): string {
  return resource.operationalSpine?.refs?.[capability]?.status ?? "reserved";
}

function sourceLabel(value: string): string {
  return value.replace(/-/g, " ");
}

function schemaCount(registry: ResourceRegistryPayload | null): number {
  if (!registry) return 0;
  return new Set(
    registry.resources
      .map((resource) => resource.oagSchema?.schemaRef || resource.oag?.schemaRef)
      .filter(Boolean),
  ).size;
}

function capabilityCount(
  registry: ResourceRegistryPayload | null,
  capability: string,
): string {
  const counts = registry?.operationalSpine?.capabilities?.[capability];
  if (!counts) return "0";
  return String((counts.active ?? 0) + (counts.reserved ?? 0) + (counts.planned ?? 0));
}

function formatDate(value: string | undefined): string {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

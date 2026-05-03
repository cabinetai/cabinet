import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOptaleResourceRegistry,
  sortOptaleResources,
  type OptaleResourceRecord,
} from "./resource-registry";

test("buildOptaleResourceRegistry projects command center and context records", () => {
  const registry = buildOptaleResourceRegistry({
    commandCenter: {
      cabinet: { path: ".", name: "Root" },
      parent: null,
      children: [],
      visibleCabinets: [
        {
          path: ".",
          name: "Root",
          cabinetDepth: 0,
          optaleScope: {
            cabinetPath: ".",
            scope: "system",
            source: "inferred",
          },
        },
      ],
      visibilityMode: "all",
      mcpPolicy: {
        version: 1,
        cabinetPath: ".",
        scope: "system",
        source: "derived",
        enforcementMode: "proxy",
        defaultDecision: "deny",
        commandCenterManaged: true,
        servers: [],
      },
      mcp: {
        clients: [
          {
            id: "ops",
            enabled: true,
            lockCabinet: false,
            agentScope: "system",
            permissions: ["read"],
            allowedTools: [],
            deniedTools: [],
            auditEnabled: true,
            remoteActionsEnabled: false,
            source: "registry",
            tokenConfigured: true,
          },
        ],
        audit: {
          generatedAt: "2026-05-03T00:00:00.000Z",
          events: [],
          toolCalls: 0,
          totalEvents: 0,
        },
        counts: {
          clients: 1,
          enabledClients: 1,
          disabledClients: 0,
          registryClients: 1,
          legacyEnvClients: 0,
          clientsWithBudgets: 0,
          auditEnabledClients: 1,
          remoteActionClients: 0,
        },
      },
      controls: ["launch_conversation"],
      counts: {
        cabinets: 1,
        agents: 1,
        activeAgents: 1,
        jobs: 0,
        enabledJobs: 0,
        mcpClients: 1,
        activeMcpClients: 1,
        mcpToolCallsToday: 0,
        mcpAuditEventsToday: 0,
        tasks: 1,
        taskStatus: {
          pending: 1,
          in_progress: 0,
          completed: 0,
          failed: 0,
        },
        conversations: 1,
        conversationStatus: {
          idle: 0,
          running: 1,
          completed: 0,
          failed: 0,
          cancelled: 0,
        },
        pendingActions: 0,
      },
      agents: [
        {
          scopedId: ".::agent::research",
          name: "Research",
          slug: "research",
          emoji: "R",
          role: "Research agent",
          active: true,
          jobCount: 0,
          taskCount: 1,
          cabinetPath: ".",
          cabinetName: "Root",
          cabinetDepth: 0,
          inherited: false,
        },
      ],
      jobs: [],
      tasks: [
        {
          id: "task-1",
          fromAgent: "operator",
          toAgent: "research",
          title: "Map sources",
          description: "Collect source inventory.",
          kbRefs: [],
          status: "pending",
          priority: 2,
          createdAt: "2026-05-03T00:00:00.000Z",
          updatedAt: "2026-05-03T00:01:00.000Z",
          cabinetPath: ".",
        },
      ],
      conversations: [
        {
          id: "run-1",
          agentSlug: "research",
          cabinetPath: ".",
          title: "Source run",
          trigger: "manual",
          status: "running",
          startedAt: "2026-05-03T00:02:00.000Z",
          promptPath: ".agents/.conversations/run-1/prompt.md",
          transcriptPath: ".agents/.conversations/run-1/transcript.md",
          mentionedPaths: [],
          artifactPaths: [],
        },
      ],
    } as never,
    context: {
      brainSources: [
        {
          id: "vault",
          name: "Vault",
          kind: "vault",
          scopes: ["system"],
          description: "Knowledge.",
          mcpServer: "knowledge-search",
        },
      ],
      mcp: {
        currentMode: "governed-run-config",
        targetMode: "governed-native-client-and-server",
        servers: [
          {
            id: "knowledge-search",
            name: "Knowledge Search",
            scopes: ["system"],
            description: "Search.",
            status: "configured",
          },
        ],
      },
    } as never,
  });

  assert.equal(registry.counts.space, 1);
  assert.equal(registry.counts.agent, 1);
  assert.equal(registry.counts.task, 1);
  assert.equal(registry.counts.conversation, 1);
  assert.equal(registry.counts.brain_source, 1);
  assert.equal(registry.counts.mcp_client, 1);
  assert.equal(registry.counts.action_type, 1);
  assert.ok(registry.resources.some((resource) => resource.id === "space:."));
  assert.ok(
    registry.resources.some(
      (resource) =>
        resource.id === "action-type:launch_conversation" &&
        resource.label === "Launch Conversation",
    ),
  );
});

test("sortOptaleResources groups by kind order before label", () => {
  const resources: OptaleResourceRecord[] = [
    {
      id: "task:b",
      kind: "task",
      label: "B task",
      source: "agent-harness",
      facts: [],
    },
    {
      id: "space:a",
      kind: "space",
      label: "A space",
      source: "cabinet",
      facts: [],
    },
    {
      id: "agent:z",
      kind: "agent",
      label: "Z agent",
      source: "agent-harness",
      facts: [],
    },
  ];

  assert.deepEqual(
    sortOptaleResources(resources).map((resource) => resource.kind),
    ["space", "agent", "task"],
  );
});

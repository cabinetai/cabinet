import { createHash } from "node:crypto";

import type {
  AcceptanceConversationObservation,
  ConversationCheckpointEvidence,
  ConversationPersistenceEvidence,
  ConversationTurnDiagnostic,
} from "./contracts";

export const ACCEPTANCE_NAME = "CABINET ACP EXACT RESPONSE FINAL V2 — 2026-07-23";
export const INITIAL_PROMPT =
  "This is a local Cabinet acceptance test. Do not use tools or contact external systems. Reply with exactly CABINET_ACCEPTANCE_OK.";
export const FOLLOW_UP_PROMPT =
  "Reply with the exact acceptance token from your previous response.";
export const TRANSPORT_TOKEN = "CABINET_ACCEPTANCE_OK";

export function assertExactAcceptanceToken(
  value: string,
  turn: "initial" | "follow-up",
): void {
  if (value !== TRANSPORT_TOKEN) {
    throw new Error(`${turn} response was not the exact acceptance token`);
  }
}

export type CabinetTransportTarget = {
  appUrl: string;
  restart(): Promise<void>;
};

type ConversationMeta = {
  id: string;
  status: "idle" | "running" | "completed" | "failed";
  exitCode?: number;
  errorKind?: string;
};

type ConversationDetail = {
  meta: ConversationMeta;
  turns?: Array<{
    id?: string;
    turn?: number;
    role: string;
    content: string;
    status?: string;
    pending?: boolean;
    exitCode?: number | null;
    error?: string;
  }>;
  session?: { resumeId?: string; alive?: boolean } | null;
  persistence?: {
    pendingRequiredWrites?: number;
    inMemoryCounts?: {
      user: number;
      assistant: number;
      completedAssistant: number;
      total: number;
    };
  };
  acceptanceObservability?: AcceptanceConversationObservation | null;
};

export interface AcceptanceConversation {
  conversationId: string;
  firstResponse: string;
  secondResponse: string;
  sameSession: boolean;
  cabinetRestart: boolean;
  userTurns: number;
  completedAssistantTurns: number;
  responseExactness: AcceptanceConversationObservation["responseExactness"];
}

export interface AcceptanceTransport {
  readonly id: string;
  readonly sendsLiveModelMessages: boolean;
  runTwoTurnContract(
    cabinet: CabinetTransportTarget,
    onEvidence?: (evidence: ConversationPersistenceEvidence) => void,
    onRequest?: (method: string, pathname: string) => void,
  ): Promise<AcceptanceConversation>;
}

async function payload(response: Response, operation: string): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (!response.ok) throw new Error(`${operation} failed with HTTP ${response.status}`);
  return JSON.parse(body) as Record<string, unknown>;
}

async function detail(cabinet: CabinetTransportTarget, id: string): Promise<ConversationDetail> {
  const response = await fetch(
    `${cabinet.appUrl}/api/agents/conversations/${encodeURIComponent(id)}?withTurns=1`,
  );
  const detailValue = await payload(
    response,
    "conversation detail",
  ) as unknown as ConversationDetail;
  if (process.env.CABINET_ACCEPTANCE_OBSERVABILITY !== "1") {
    return detailValue;
  }
  const observationResponse = await fetch(
    `${cabinet.appUrl}/api/agents/conversations/${encodeURIComponent(id)}/acceptance-observability`,
  );
  const observation = await payload(
    observationResponse,
    "acceptance observability",
  ) as unknown as AcceptanceConversationObservation;
  if (
    observation.contract !== "cabinet.acceptance.conversation-observability" ||
    observation.schemaVersion !== 1
  ) {
    throw new Error("acceptance observability returned an unknown contract");
  }
  return { ...detailValue, acceptanceObservability: observation };
}

async function waitForCompletion(
  cabinet: CabinetTransportTarget,
  id: string,
  onSnapshot?: (detailValue: ConversationDetail) => void,
  timeoutMs = 240_000,
): Promise<ConversationDetail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const current = await detail(cabinet, id);
    onSnapshot?.(current);
    if (current.meta.status === "completed") return current;
    if (current.meta.status === "failed") {
      throw new Error(
        `conversation failed (exitCode=${current.meta.exitCode}, errorKind=${current.meta.errorKind})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("conversation completion timed out");
}

function settledTurns(detailValue: ConversationDetail, role: string): string[] {
  return (detailValue.turns ?? [])
    .filter((turn) => turn.role === role && turn.status !== "failed")
    .map((turn) => turn.content);
}

function fingerprint(value: string | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function turnDiagnostic(
  conversationId: string,
  turn: NonNullable<ConversationDetail["turns"]>[number],
  index: number,
): ConversationTurnDiagnostic | null {
  if (turn.role !== "user" && turn.role !== "agent") return null;
  const identity = fingerprint(turn.id ?? `${conversationId}:${turn.turn ?? index}:${turn.role}`);
  if (!identity) return null;
  return {
    identity,
    sequence: turn.turn ?? index + 1,
    role: turn.role,
    lifecycleState: turn.pending
      ? "pending"
      : turn.error || (typeof turn.exitCode === "number" && turn.exitCode !== 0)
        ? "failed"
        : "completed",
  };
}

export function buildConversationCheckpoint(
  checkpoint: ConversationCheckpointEvidence["checkpoint"],
  eventType: string,
  detailValue: ConversationDetail | null,
  requestIdentity: ConversationCheckpointEvidence["requestIdentity"],
): ConversationCheckpointEvidence {
  const conversationId = detailValue?.meta.id ?? "";
  const turns = (detailValue?.turns ?? [])
    .map((turn, index) => turnDiagnostic(conversationId, turn, index))
    .filter((turn): turn is ConversationTurnDiagnostic => turn !== null);
  const identities = turns.map((turn) => turn.identity);
  const user = turns.filter((turn) => turn.role === "user").length;
  const assistant = turns.filter((turn) => turn.role === "agent").length;
  const completedAssistant = turns.filter(
    (turn) => turn.role === "agent" && turn.lifecycleState === "completed",
  ).length;
  return {
    checkpoint,
    recordedAt: new Date().toISOString(),
    eventType,
    conversationIdentity: fingerprint(conversationId),
    nativeSessionIdentity: fingerprint(detailValue?.session?.resumeId),
    requestIdentity,
    turns,
    durableStoreCounts: detailValue
      ? {
          user,
          assistant,
          completedAssistant,
          total: turns.length,
          duplicateTurnIdentities: identities.length - new Set(identities).size,
        }
      : null,
    inMemoryCounts: detailValue?.persistence?.inMemoryCounts ?? null,
    pendingRequiredWrites: detailValue?.persistence?.pendingRequiredWrites ?? null,
    observability: detailValue?.acceptanceObservability ?? null,
  };
}

export class LiveCabinetAcpTransport implements AcceptanceTransport {
  readonly id = "hermes-acp-official-sdk";
  readonly sendsLiveModelMessages = true;

  async runTwoTurnContract(
    cabinet: CabinetTransportTarget,
    onEvidence?: (evidence: ConversationPersistenceEvidence) => void,
    onRequest?: (method: string, pathname: string) => void,
  ): Promise<AcceptanceConversation> {
    const checkpoints: ConversationCheckpointEvidence[] = [
      buildConversationCheckpoint("A", "before_initial_submission", null, null),
    ];
    let first: ConversationDetail | null = null;
    let finalDetail: ConversationDetail | null = null;
    let secondRestartCompleted = false;
    let lastObserved: ConversationDetail | null = null;
    try {
      onRequest?.("POST", "/api/agents/conversations");
      const createdResponse = await fetch(`${cabinet.appUrl}/api/agents/conversations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentSlug: "editor",
          source: "manual",
          title: ACCEPTANCE_NAME,
          userMessage: INITIAL_PROMPT,
        }),
      });
      const created = await payload(createdResponse, "initial conversation");
      const conversation = created.conversation as ConversationMeta | undefined;
      if (!conversation?.id) throw new Error("initial conversation returned no identity");
      const conversationId = conversation.id;

      try {
        first = await waitForCompletion(
          cabinet,
          conversationId,
          (snapshot) => {
            lastObserved = snapshot;
          },
        );
      } catch (error) {
        if (lastObserved) {
          checkpoints.push(
            buildConversationCheckpoint(
              "B",
              "initial_failure_observed",
              lastObserved,
              "initial",
            ),
          );
        }
        throw error;
      }
      checkpoints.push(
        buildConversationCheckpoint("B", "initial_completed_emitted", first, "initial"),
      );
      const firstDurable = await detail(cabinet, conversationId);
      checkpoints.push(
        buildConversationCheckpoint("C", "initial_persistence_drained", firstDurable, "initial"),
      );

      await cabinet.restart();
      const afterRestart = await detail(cabinet, conversationId);
      checkpoints.push(
        buildConversationCheckpoint("D", "first_restart_reloaded", afterRestart, null),
      );

      const continuePath =
        `/api/agents/conversations/${encodeURIComponent(conversationId)}/continue`;
      onRequest?.("POST", continuePath);
      const continuedResponse = await fetch(
        `${cabinet.appUrl}${continuePath}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userMessage: FOLLOW_UP_PROMPT }),
        },
      );
      await payload(continuedResponse, "follow-up conversation");
      const acceptedFollowUp = await detail(cabinet, conversationId);
      checkpoints.push(
        buildConversationCheckpoint("E", "follow_up_accepted", acceptedFollowUp, "follow-up"),
      );

      lastObserved = acceptedFollowUp;
      let second: ConversationDetail;
      try {
        second = await waitForCompletion(
          cabinet,
          conversationId,
          (snapshot) => {
            lastObserved = snapshot;
          },
        );
      } catch (error) {
        if (lastObserved) {
          checkpoints.push(
            buildConversationCheckpoint(
              "F",
              "follow_up_failure_observed",
              lastObserved,
              "follow-up",
            ),
          );
        }
        throw error;
      }
      checkpoints.push(
        buildConversationCheckpoint("F", "follow_up_completed_emitted", second, "follow-up"),
      );
      const secondDurable = await detail(cabinet, conversationId);
      checkpoints.push(
        buildConversationCheckpoint("G", "follow_up_persistence_drained", secondDurable, "follow-up"),
      );

      await cabinet.restart();
      finalDetail = await detail(cabinet, conversationId);
      secondRestartCompleted = true;
      checkpoints.push(
        buildConversationCheckpoint("H", "second_restart_reloaded", finalDetail, null),
      );

      const firstAssistants = settledTurns(first, "agent");
      const assistants = settledTurns(finalDetail, "agent");
      const users = settledTurns(finalDetail, "user");
      const firstSession = first.session?.resumeId ?? "";
      const finalSession = finalDetail.session?.resumeId ?? "";
      if (!firstSession || firstAssistants.length !== 1) {
        throw new Error("initial conversation did not persist one native session response");
      }
      if (assistants.length !== 2 || users.length !== 2) {
        throw new Error("follow-up did not persist exactly two user and two assistant turns");
      }

      return {
        conversationId,
        firstResponse: firstAssistants[0],
        secondResponse: assistants[1],
        sameSession: firstSession === finalSession && firstSession.length > 0,
        cabinetRestart: true,
        userTurns: users.length,
        completedAssistantTurns: assistants.length,
        responseExactness: {
          initial: {
            rawModelFinalExact:
              firstDurable.acceptanceObservability?.responseExactness.initial.rawModelFinalExact
              ?? null,
            acpNormalizedExact:
              firstDurable.acceptanceObservability?.responseExactness.initial.acpNormalizedExact
              ?? null,
          },
          followUp: {
            rawModelFinalExact:
              secondDurable.acceptanceObservability?.responseExactness.followUp.rawModelFinalExact
              ?? null,
            acpNormalizedExact:
              secondDurable.acceptanceObservability?.responseExactness.followUp.acpNormalizedExact
              ?? null,
          },
        },
      };
    } finally {
      const sessionIdentities = checkpoints
        .map((checkpoint) => checkpoint.nativeSessionIdentity)
        .filter((identity): identity is string => identity !== null);
      const finalCounts = checkpoints.at(-1)?.checkpoint === "H"
        ? checkpoints.at(-1)?.durableStoreCounts
        : null;
      onEvidence?.({
        schemaVersion: 1,
        transport: this.id,
        checkpoints,
        nativeSessionIdentityStable:
          sessionIdentities.length > 0 ? new Set(sessionIdentities).size === 1 : null,
        exactFinalCardinality:
          finalCounts
            ? finalCounts.user === 2 &&
              finalCounts.completedAssistant === 2 &&
              finalCounts.total === 4 &&
              finalCounts.duplicateTurnIdentities === 0
            : null,
        secondRestartCompleted,
        unavailableMeasurements: checkpoints.some(
          (checkpoint) =>
            checkpoint.inMemoryCounts === null || checkpoint.pendingRequiredWrites === null,
        )
          ? ["inMemoryCounts", "pendingRequiredWrites"]
          : [],
      });
    }
  }
}

export class FixtureAcceptanceTransport implements AcceptanceTransport {
  readonly id = "fixture-non-model";
  readonly sendsLiveModelMessages = false;

  async runTwoTurnContract(): Promise<AcceptanceConversation> {
    return {
      conversationId: "fixture-acceptance-conversation",
      firstResponse: TRANSPORT_TOKEN,
      secondResponse: TRANSPORT_TOKEN,
      sameSession: true,
      cabinetRestart: false,
      userTurns: 2,
      completedAssistantTurns: 2,
      responseExactness: {
        initial: {
          rawModelFinalExact: null,
          acpNormalizedExact: true,
        },
        followUp: {
          rawModelFinalExact: null,
          acpNormalizedExact: true,
        },
      },
    };
  }
}

export class DeliberateFailureTransport implements AcceptanceTransport {
  readonly id = "fixture-deliberate-conversation-failure";
  readonly sendsLiveModelMessages = false;

  async runTwoTurnContract(): Promise<AcceptanceConversation> {
    throw new Error("deliberate conversation failure");
  }
}

export function selectTransport(): AcceptanceTransport {
  const selected = process.env.CABINET_ACCEPTANCE_TRANSPORT ?? "fixture";
  if (selected === "fixture") return new FixtureAcceptanceTransport();
  if (selected === "deliberate-failure") return new DeliberateFailureTransport();
  if (selected === "acp") return new LiveCabinetAcpTransport();
  throw new Error(`Acceptance transport "${selected}" is not registered.`);
}

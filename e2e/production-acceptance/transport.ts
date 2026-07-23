export const ACCEPTANCE_NAME = "CABINET ACP FINAL INTEGRATION — 2026-07-23";
export const INITIAL_PROMPT =
  "This is a local Cabinet acceptance test. Do not use tools or contact external systems. Reply with exactly CABINET_ACCEPTANCE_OK.";
export const FOLLOW_UP_PROMPT =
  "Reply with the exact acceptance token from your previous response.";
export const TRANSPORT_TOKEN = "CABINET_ACCEPTANCE_OK";

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
  turns?: Array<{ role: string; content: string; status?: string }>;
  session?: { resumeId?: string; alive?: boolean } | null;
};

export interface AcceptanceConversation {
  conversationId: string;
  firstResponse: string;
  secondResponse: string;
  sameSession: boolean;
  cabinetRestart: boolean;
  userTurns: number;
  completedAssistantTurns: number;
}

export interface AcceptanceTransport {
  readonly id: string;
  readonly sendsLiveModelMessages: boolean;
  runTwoTurnContract(cabinet: CabinetTransportTarget): Promise<AcceptanceConversation>;
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
  return await payload(response, "conversation detail") as unknown as ConversationDetail;
}

async function waitForCompletion(
  cabinet: CabinetTransportTarget,
  id: string,
  timeoutMs = 240_000,
): Promise<ConversationDetail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const current = await detail(cabinet, id);
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
    .map((turn) => turn.content.trim());
}

export class LiveCabinetAcpTransport implements AcceptanceTransport {
  readonly id = "hermes-acp-official-sdk";
  readonly sendsLiveModelMessages = true;

  async runTwoTurnContract(cabinet: CabinetTransportTarget): Promise<AcceptanceConversation> {
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

    const first = await waitForCompletion(cabinet, conversation.id);
    const firstSession = first.session?.resumeId ?? "";
    const firstAssistants = settledTurns(first, "agent");
    if (!firstSession || firstAssistants.length !== 1) {
      throw new Error("initial conversation did not persist one native session response");
    }

    await cabinet.restart();
    const continuedResponse = await fetch(
      `${cabinet.appUrl}/api/agents/conversations/${encodeURIComponent(conversation.id)}/continue`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userMessage: FOLLOW_UP_PROMPT }),
      },
    );
    await payload(continuedResponse, "follow-up conversation");
    const second = await waitForCompletion(cabinet, conversation.id);
    const secondSession = second.session?.resumeId ?? "";
    const assistants = settledTurns(second, "agent");
    const users = settledTurns(second, "user");
    if (assistants.length !== 2 || users.length !== 2) {
      throw new Error("follow-up did not persist exactly two user and two assistant turns");
    }

    return {
      conversationId: conversation.id,
      firstResponse: firstAssistants[0],
      secondResponse: assistants[1],
      sameSession: firstSession === secondSession && firstSession.length > 0,
      cabinetRestart: true,
      userTurns: users.length,
      completedAssistantTurns: assistants.length,
    };
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

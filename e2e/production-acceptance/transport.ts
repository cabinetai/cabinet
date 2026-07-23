export const INITIAL_PROMPT =
  "This is a local Cabinet transport acceptance test. Do not use tools or contact external systems. Reply with exactly CABINET_TRANSPORT_OK.";
export const FOLLOW_UP_PROMPT =
  "Reply with the exact transport token from your previous response.";
export const TRANSPORT_TOKEN = "CABINET_TRANSPORT_OK";

export interface AcceptanceConversation {
  conversationId: string;
  firstResponse: string;
  secondResponse: string;
  sameSession: boolean;
}

export interface AcceptanceTransport {
  readonly id: string;
  readonly sendsLiveModelMessages: boolean;
  runTwoTurnContract(): Promise<AcceptanceConversation>;
}

/**
 * Development-only, non-model transport. It proves runner orchestration and
 * the exact prompt/token contract without claiming that Cabinet's live Hermes
 * transport works.
 */
export class FixtureAcceptanceTransport implements AcceptanceTransport {
  readonly id = "fixture-non-model";
  readonly sendsLiveModelMessages = false;

  async runTwoTurnContract(): Promise<AcceptanceConversation> {
    return {
      conversationId: "fixture-acceptance-conversation",
      firstResponse: TRANSPORT_TOKEN,
      secondResponse: TRANSPORT_TOKEN,
      sameSession: true,
    };
  }
}

export function selectTransport(): AcceptanceTransport {
  const selected = process.env.CABINET_ACCEPTANCE_TRANSPORT ?? "fixture";
  if (selected === "fixture") return new FixtureAcceptanceTransport();
  throw new Error(
    `Acceptance transport "${selected}" is not registered. Refusing to improvise a live transport.`
  );
}

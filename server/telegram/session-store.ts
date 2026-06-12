/**
 * Per-chat gateway state. In-memory ONLY (locked decision, PRD §2): a daemon
 * restart resets every chat to a fresh conversation in home with verbose off.
 * The only on-disk artifact the gateway keeps is the owner.json getUpdates
 * marker (gateway.ts) — never session state.
 */

export interface QueuedMessage {
  text: string;
  /** `@slug` target when the queued message carried one. */
  atMention: string | null;
  queuedAt: number;
}

export interface ActiveRun {
  conversationId: string;
  /**
   * The pollable daemon session id: conversation id for first turns,
   * `${conversationId}::t<N>::<uuid>` for continued turns (resolved by
   * prefix scan when stopping).
   */
  kind: "start" | "continue";
  startedAt: number;
  /** True once /stop fired so the finalizer reports "stopped" not "failed". */
  stopRequested: boolean;
}

export interface ChatState {
  chatId: number;
  /**
   * Synchronous busy flag: set the moment a runnable message is accepted,
   * before any await. The poll loop doesn't await message handling, so this
   * is what prevents two quick messages from racing into parallel runs
   * (activeRun is only populated a few awaits later).
   */
  busy: boolean;
  /** Current conversation pointer; null = next message starts fresh. */
  conversationId: string | null;
  /** Active room cabinetPath; null = home cabinet. */
  roomPath: string | null;
  /**
   * Whether roomPath has been resolved for this chat. On first contact the
   * router defaults to a real room (home-config default → last active →
   * first listed) because the Rooms-v3 home is a neutral container, not a
   * cabinet agents should write into. null roomPath + initialized=true means
   * the user explicitly chose home (or no rooms exist).
   */
  roomInitialized: boolean;
  verbose: boolean;
  activeRun: ActiveRun | null;
  queued: QueuedMessage | null;
  /** Virtual paths (DATA_DIR-relative) staged by a prior file/photo. */
  stagedAttachments: string[];
  /** Cached orchestrator slug for the active room; cleared on /room. */
  orchestratorSlug: string | null;
  /**
   * Per-chat runtime override (set via /model). Null = each agent's own
   * persona default. Sticky across /new and /room until /model reset.
   */
  providerOverride: string | null;
  modelOverride: string | null;
  effortOverride: string | null;
  /** Rolling message timestamps for the 10-per-60s rate limit. */
  recentMessageTimes: number[];
  /** Whether this denied sender already got the one refusal reply. */
  refusalSent: boolean;
}

const chats = new Map<number, ChatState>();

export function getChatState(chatId: number): ChatState {
  let state = chats.get(chatId);
  if (!state) {
    state = {
      chatId,
      busy: false,
      conversationId: null,
      roomPath: null,
      roomInitialized: false,
      verbose: false,
      activeRun: null,
      queued: null,
      stagedAttachments: [],
      orchestratorSlug: null,
      providerOverride: null,
      modelOverride: null,
      effortOverride: null,
      recentMessageTimes: [],
      refusalSent: false,
    };
    chats.set(chatId, state);
  }
  return state;
}

export function resetConversation(state: ChatState): void {
  state.conversationId = null;
}

export function switchRoom(state: ChatState, roomPath: string | null): void {
  state.roomPath = roomPath;
  state.roomInitialized = true;
  // Fresh room = fresh orchestrator resolution + fresh conversation.
  state.orchestratorSlug = null;
  state.conversationId = null;
}

export function clearAllChatState(): void {
  chats.clear();
}

export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Rolling-window rate check. Records the hit when allowed. */
export function checkAndRecordRate(state: ChatState, now: number): boolean {
  state.recentMessageTimes = state.recentMessageTimes.filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (state.recentMessageTimes.length >= RATE_LIMIT_MAX) return false;
  state.recentMessageTimes.push(now);
  return true;
}

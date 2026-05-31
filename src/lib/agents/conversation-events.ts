import { EventEmitter } from "events";

// Keep the event shape compatible with v1's TaskEvent so the UI (which
// subscribes via SSE and reloads the conversation on any event) doesn't
// care whether the event came from a task or a conversation.
export interface ConversationEvent {
  type:
    | "turn.appended"
    | "turn.updated"
    | "task.updated"
    | "task.deleted"
    | "task.error";
  taskId: string; // conversation id
  cabinetPath?: string;
  ts: string;
  /**
   * Monotonic per-conversation sequence number, matching the seq written to
   * events.log. Used by SSE clients as `Last-Event-ID` for reconnect replay.
   */
  seq?: number;
  payload?: Record<string, unknown>;
}

class ConversationEventBus extends EventEmitter {
  emitEvent(event: ConversationEvent): void {
    this.emit("event", event);
    this.emit(`task:${event.taskId}`, event);
  }

  subscribe(
    taskId: string | undefined,
    listener: (event: ConversationEvent) => void
  ): () => void {
    const channel = taskId ? `task:${taskId}` : "event";
    this.on(channel, listener);
    return () => {
      this.off(channel, listener);
    };
  }
}

const globalKey = "__cabinetConversationEventBus__";
const globalScope = globalThis as unknown as { [globalKey]?: ConversationEventBus };

export const conversationEvents: ConversationEventBus =
  globalScope[globalKey] ??
  (() => {
    const instance = new ConversationEventBus();
    instance.setMaxListeners(200);
    globalScope[globalKey] = instance;
    return instance;
  })();

export function publishConversationEvent(
  event: Omit<ConversationEvent, "ts"> & { ts?: string }
): void {
  conversationEvents.emitEvent({
    ...event,
    ts: event.ts ?? new Date().toISOString(),
  });
}

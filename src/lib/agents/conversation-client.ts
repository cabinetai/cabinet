"use client";

import type {
  CreateConversationRequest,
  CreateConversationResponse,
} from "@/types/conversations";
import { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type Locale } from "@/i18n";

function getErrorMessage(
  fallback: string,
  payload: unknown
): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim()
  ) {
    return payload.error;
  }

  return fallback;
}

function readClientLocale(): Locale | undefined {
  if (typeof window === "undefined") return undefined;
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
  return undefined;
}

export async function createConversation(
  request: CreateConversationRequest,
  errorMessage = "Failed to start conversation"
): Promise<CreateConversationResponse> {
  // Inject the user's UI locale so the server can instruct the agent to
  // respond in that language. Caller-provided `locale` wins so any future
  // per-agent override still works.
  const requestWithLocale = {
    locale: readClientLocale(),
    ...request,
  };
  const response = await fetch("/api/agents/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestWithLocale),
  });

  const payload = (await response.json().catch(() => null)) as
    | CreateConversationResponse
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(getErrorMessage(errorMessage, payload));
  }

  if (!payload || typeof payload !== "object" || !("conversation" in payload)) {
    throw new Error(errorMessage);
  }

  return payload as CreateConversationResponse;
}

export interface EditDraftInput {
  userMessage: string;
  mentionedPaths?: string[];
  mentionedSkills?: string[];
  /** Reassign the draft to a different agent (defaults to its current one). */
  agentSlug?: string;
  providerId?: string;
  adapterType?: string;
  model?: string;
  effort?: string;
  runtimeMode?: "native" | "terminal";
  locale?: string;
}

/**
 * Rewrites an unstarted inbox draft in place (prompt, agent, runtime) so the
 * user can refine a saved task idea instead of deleting and recreating it.
 * Backed by `PATCH /api/agents/conversations/[id] { action: "edit-draft" }`;
 * the server rejects anything that has already started with 409.
 */
export async function editDraftConversation(
  id: string,
  input: EditDraftInput,
  cabinetPath?: string,
  errorMessage = "Failed to save changes"
): Promise<void> {
  const params = new URLSearchParams();
  if (cabinetPath) params.set("cabinetPath", cabinetPath);
  const qs = params.toString();
  const response = await fetch(
    `/api/agents/conversations/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit-draft", ...input }),
    }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(getErrorMessage(errorMessage, payload));
  }
}

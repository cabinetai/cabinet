/**
 * Agent tool definitions for Gmail (Phase 1).
 * These are documented as skill context for agents — not registered as
 * function-call tools in the LLM API payload.
 *
 * Tool names use the `email_` prefix so they remain stable when Phase 2
 * replaces the IMAP/SMTP implementation with the Gmail API.
 */

export const GMAIL_TOOLS_DOCS = `
## Email tools (Gmail — IMAP/SMTP)

### email_search
Search emails by date range, sender, subject, or read status.
Parameters:
  - from?: string        — filter by sender address or name
  - subject?: string     — filter by subject keyword
  - since?: string       — ISO date string, e.g. "2024-01-01"
  - before?: string      — ISO date string
  - unseen?: boolean     — if true, return only unread emails
Returns: array of { messageId, threadId, subject, sender, date, snippet }

### email_read_thread
Fetch the full content of a message thread.
Parameters:
  - messageId: string    — message ID from email_search results
Returns: { messages: [{ from, to, date, subject, bodyText }] }

### email_get_unread
Fetch unread messages, newest first.
Parameters:
  - maxResults?: number  — default 20
Returns: array of { messageId, threadId, subject, sender, date, snippet }

### email_send
Compose and send a new email. Always requires human approval before dispatch.
Parameters:
  - to: string[]         — recipient addresses
  - subject: string
  - body: string
Returns: SEND_EMAIL action proposal (routed through human approval)

### email_reply
Reply to an existing email thread. Always requires human approval before dispatch.
Parameters:
  - messageId: string    — message ID to reply to
  - body: string         — reply body text
Returns: SEND_EMAIL action proposal (routed through human approval)
`.trim();

export interface EmailSearchTool {
  name: "email_search";
  from?: string;
  subject?: string;
  since?: string;
  before?: string;
  unseen?: boolean;
}

export interface EmailReadThreadTool {
  name: "email_read_thread";
  messageId: string;
}

export interface EmailGetUnreadTool {
  name: "email_get_unread";
  maxResults?: number;
}

export interface EmailSendTool {
  name: "email_send";
  to: string[];
  subject: string;
  body: string;
}

export interface EmailReplyTool {
  name: "email_reply";
  messageId: string;
  body: string;
}

export type GmailTool =
  | EmailSearchTool
  | EmailReadThreadTool
  | EmailGetUnreadTool
  | EmailSendTool
  | EmailReplyTool;

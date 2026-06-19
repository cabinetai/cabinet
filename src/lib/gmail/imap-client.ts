/**
 * IMAP client for Gmail using imapflow.
 * Server-side only.
 */

import { ImapFlow } from "imapflow";
import { getDb } from "@/lib/db";
import { decryptPassword } from "@/lib/gmail/crypto";

// These hosts are hardcoded intentionally — never user-configurable.
const IMAP_HOST = "imap.gmail.com";
const IMAP_PORT = 993;

export interface GmailCredentials {
  email: string;
  password: string;
}

export interface EmailSummary {
  messageId: string;
  threadId: string;
  subject: string;
  sender: string;
  date: string;
  snippet: string;
}

export interface EmailMessage {
  from: string;
  to: string;
  date: string;
  subject: string;
  bodyText: string;
}

export interface EmailThread {
  messages: EmailMessage[];
}

export interface SearchCriteria {
  since?: Date;
  before?: Date;
  from?: string;
  subject?: string;
  unseen?: boolean;
}

export function getCredentials(): GmailCredentials {
  const db = getDb();
  const row = db
    .prepare("SELECT email, imap_password FROM gmail_credentials WHERE id = 'default'")
    .get() as { email: string; imap_password: string } | undefined;
  if (!row) throw new Error("Gmail not connected");
  return {
    email: row.email,
    password: decryptPassword(row.imap_password),
  };
}

export function createImapClient(creds?: GmailCredentials): ImapFlow {
  const credentials = creds ?? getCredentials();
  return new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: {
      user: credentials.email,
      pass: credentials.password,
    },
    logger: false,
  });
}

function extractSnippet(text: string, maxLen = 200): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export async function searchEmails(criteria: SearchCriteria): Promise<EmailSummary[]> {
  const client = createImapClient();
  await client.connect();
  const results: EmailSummary[] = [];

  try {
    await client.mailboxOpen("INBOX");

    const searchQuery: Record<string, unknown> = {};
    if (criteria.since) searchQuery.since = criteria.since;
    if (criteria.before) searchQuery.before = criteria.before;
    if (criteria.from) searchQuery.from = criteria.from;
    if (criteria.subject) searchQuery.subject = criteria.subject;
    if (criteria.unseen) searchQuery.seen = false;

    const messages = client.fetch(searchQuery, {
      envelope: true,
      bodyStructure: true,
      bodyParts: ["TEXT"],
      uid: true,
    });

    for await (const msg of messages) {
      const env = msg.envelope;
      const from = env?.from?.[0]
        ? `${env.from[0].name ?? ""} <${env.from[0].address ?? ""}>`.trim()
        : "";
      const subject = env?.subject ?? "";
      const date = env?.date ? env.date.toISOString() : "";
      const messageId = env?.messageId ?? String(msg.uid);
      // Gmail doesn't expose thread IDs over IMAP — use messageId as proxy
      const threadId = messageId;
      // Extract snippet from text body part
      let snippet = "";
      const textPart = msg.bodyParts?.get("TEXT");
      if (textPart) {
        snippet = extractSnippet(textPart.toString());
      }
      results.push({ messageId, threadId, subject, sender: from, date, snippet });
    }
  } finally {
    await client.logout();
  }

  return results;
}

export async function readThread(messageId: string): Promise<EmailThread> {
  const client = createImapClient();
  await client.connect();
  const messages: EmailMessage[] = [];

  try {
    await client.mailboxOpen("INBOX");

    // Search for the message by message-id header, then fetch it
    const searchResult = await client.search({ header: { "message-id": messageId } }, { uid: true });
    const uids: number[] = Array.isArray(searchResult) ? searchResult : [];

    const fetchSeq = uids.length > 0 ? uids.map(String).join(",") : "1";
    const fetched = client.fetch(fetchSeq, { envelope: true, source: true, uid: true });

    for await (const msg of fetched) {
      const env = msg.envelope;
      const from = env?.from?.[0]
        ? `${env.from[0].name ?? ""} <${env.from[0].address ?? ""}>`.trim()
        : "";
      const to = env?.to?.[0]?.address ?? "";
      const date = env?.date ? env.date.toISOString() : "";
      const subject = env?.subject ?? "";
      const rawSource = msg.source?.toString() ?? "";
      // Extract plain text portion from raw source (very basic)
      const bodyText = extractBodyText(rawSource);
      messages.push({ from, to, date, subject, bodyText });
    }
  } finally {
    await client.logout();
  }

  return { messages };
}

function extractBodyText(raw: string): string {
  // Find the boundary between headers and body
  const sep = raw.indexOf("\r\n\r\n");
  if (sep === -1) return raw.slice(0, 2000);
  return raw.slice(sep + 4, sep + 4 + 4000).replace(/\s+/g, " ").trim();
}

export async function getUnread(maxResults = 20): Promise<EmailSummary[]> {
  const all = await searchEmails({ unseen: true });
  // Sort newest first
  return all
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, maxResults);
}

/**
 * Validate credentials without persisting them.
 * Throws if connection fails.
 */
export async function validateCredentials(email: string, password: string): Promise<void> {
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });
  await client.connect();
  await client.logout();
}

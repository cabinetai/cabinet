import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import type {
  ConversationArtifact,
  ConversationDetail,
  ConversationErrorKind,
  ConversationMeta,
  ConversationStatus,
  ConversationTokens,
  ConversationTrigger,
  ConversationTurn,
  SessionHandle,
  TurnRole,
  TurnTokens,
} from "../../types/conversations";
import {
  deserializeTurn,
  eventsLogPath as eventsLogFsPath,
  parseTurnFilename,
  serializeTurn,
  sessionPath as sessionFsPath,
  shortId,
  turnFilePath as turnFileFs,
  turnsDir as turnsDirFs,
} from "./conversation-turns";
import { publishConversationEvent } from "./conversation-events";
import { discoverCabinetPaths } from "../cabinets/discovery";
import { buildConversationInstanceKey } from "./conversation-identity";
import { fingerprint, parseAgentActions } from "./action-parser";
import {
  computeWarnings,
  personaCanDispatch,
} from "./action-validator";
import { listPersonas, readPersona, type AgentPersona } from "./persona-manager";
import type { PendingAction } from "../../types/actions";
import {
  buildConversationNotificationIdentity,
  dedupeConversationNotifications,
  shouldEnqueueConversationNotification,
  shouldEnqueueConversationStart,
} from "./conversation-notification-utils";
import { DATA_DIR, sanitizeFilename, virtualPathFromFs } from "../storage/path-utils";
import {
  deleteFileOrDir,
  ensureDirectory,
  fileExists,
  listDirectory,
  readFileContent,
  writeFileContent,
} from "../storage/fs-operations";

export const CONVERSATIONS_DIR = path.join(DATA_DIR, ".agents", ".conversations");

function resolveConversationsDir(cabinetPath?: string): string {
  if (cabinetPath) return path.join(DATA_DIR, cabinetPath, ".agents", ".conversations");
  return CONVERSATIONS_DIR;
}

// ── In-memory notification queue for conversation start + terminal events ──
export interface ConversationNotification {
  id: string;
  agentSlug: string;
  cabinetPath?: string;
  title: string;
  status: ConversationStatus;
  summary?: string;
  // ISO timestamp of the event (completedAt for terminal rows, startedAt for
  // "running" start rows). Field name kept for back-compat with the existing
  // SSE payload + toast UI.
  completedAt: string;
  // Populated only for start notifications so the toast can render a
  // trigger-specific subtitle ("Scheduled: daily-standup", "Heartbeat", etc).
  trigger?: ConversationTrigger;
  jobName?: string;
  scheduledAt?: string;
}

const notificationQueue: ConversationNotification[] = [];

export function drainConversationNotifications(): ConversationNotification[] {
  return dedupeConversationNotifications(
    notificationQueue.splice(0, notificationQueue.length)
  );
}

/**
 * Enqueue a conversation notification, deduping by identity
 * (`cabinetPath::id::status`). Safe to call from multiple paths — the daemon
 * process writes into its own queue, and Next.js-side callers (e.g.
 * `waitForConversationCompletion`) write into theirs. Only the Next.js queue
 * is drained by the SSE tick, so the Next.js-side call is the one that
 * actually lands as a toast.
 */
export function enqueueConversationNotification(
  notification: ConversationNotification
): void {
  const key = buildConversationNotificationIdentity(notification);
  const alreadyQueued = notificationQueue.some(
    (existing) => buildConversationNotificationIdentity(existing) === key
  );
  if (alreadyQueued) return;
  notificationQueue.push(notification);
}

interface CreateConversationInput {
  agentSlug: string;
  cabinetPath?: string;
  title: string;
  trigger: ConversationTrigger;
  prompt: string;
  providerId?: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  mentionedPaths?: string[];
  /**
   * Composer attachments sent with the kickoff message. Stored on
   * ConversationMeta so the synthetic turn-1 view can render the
   * thumbnails inline without a separate lookup.
   */
  attachmentPaths?: string[];
  jobId?: string;
  jobName?: string;
  scheduledAt?: string;
  startedAt?: string;
  initialStatus?: ConversationStatus;
}

interface ListConversationFilters {
  agentSlug?: string;
  cabinetPath?: string;
  trigger?: ConversationTrigger;
  status?: ConversationStatus;
  pagePath?: string;
  limit?: number;
}

interface ParsedCabinetBlock {
  summary?: string;
  contextSummary?: string;
  artifactPaths: string[];
}

interface PromptEchoMatchers {
  normalizedLines: Set<string>;
  compactLines: Set<string>;
  compactFragments: string[];
}

const PLACEHOLDER_SUMMARY = "one short summary line";
const PLACEHOLDER_CONTEXT = "optional lightweight memory/context summary";
const PLACEHOLDER_ARTIFACT_HINT = "relative/path/to/file for every KB file you created or updated";
const PLACEHOLDER_SUMMARY_FINGERPRINT = compactCabinetValue(PLACEHOLDER_SUMMARY);
const PLACEHOLDER_CONTEXT_FINGERPRINT = compactCabinetValue(PLACEHOLDER_CONTEXT);
const PLACEHOLDER_ARTIFACT_FINGERPRINT = compactCabinetValue(PLACEHOLDER_ARTIFACT_HINT);

function formatTimestampSegment(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sanitizeSegment(value: string, fallback: string): string {
  return sanitizeFilename(value) || fallback;
}

function cabinetScopeSegment(cabinetPath?: string): string {
  const normalized = cabinetPath?.trim() || "__root__";
  return createHash("sha1").update(normalized).digest("hex").slice(0, 8);
}

function conversationDir(id: string, cabinetPath?: string): string {
  return path.join(resolveConversationsDir(cabinetPath), id);
}

function metaPath(id: string, cabinetPath?: string): string {
  return path.join(conversationDir(id, cabinetPath), "meta.json");
}

function transcriptPathFs(id: string, cabinetPath?: string): string {
  return path.join(conversationDir(id, cabinetPath), "transcript.txt");
}

function promptPathFs(id: string, cabinetPath?: string): string {
  return path.join(conversationDir(id, cabinetPath), "prompt.md");
}

function mentionsPathFs(id: string, cabinetPath?: string): string {
  return path.join(conversationDir(id, cabinetPath), "mentions.json");
}

function artifactsPathFs(id: string, cabinetPath?: string): string {
  return path.join(conversationDir(id, cabinetPath), "artifacts.json");
}

function makeSummaryFromOutput(output: string): string | undefined {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("```"));
  return lines[0]?.slice(0, 300);
}

/**
 * Strip the trailing "Attached files (read with the Read tool...)" section
 * appended to adapter prompts by `buildAttachmentContext`. Defensive: even
 * once attachmentPaths are stored on meta/turns, old conversations may
 * still have the block baked into the extracted user request.
 */
function stripAttachmentTrailer(text: string): string {
  const idx = text.search(
    /\n*\s*Attached files \(read with the Read tool/i
  );
  if (idx === -1) return text;
  return text.slice(0, idx).trimEnd();
}

export function extractConversationRequest(prompt: string): string {
  const normalized = prompt.replace(/\r+/g, "\n");
  const markers = ["User request:\n", "Job instructions:\n"];

  for (const marker of markers) {
    const index = normalized.lastIndexOf(marker);
    if (index !== -1) {
      return stripAttachmentTrailer(
        normalized.slice(index + marker.length).trim()
      );
    }
  }

  return stripAttachmentTrailer(normalized.trim());
}

// Agents sometimes cram multiple files onto one ARTIFACT: line (e.g.
// "ARTIFACT: a.md, b.md"). Split on commas / semicolons / whitespace between
// path-like tokens before normalizing each one.
export function normalizeArtifactPaths(rawPath: string): string[] {
  const trimmed = sanitizeCabinetFieldValue(rawPath).trim();
  if (!trimmed) return [];
  if (isPlaceholderCabinetValue(trimmed)) return [];
  if (trimmed.includes("for every KB file")) return [];
  if (compactCabinetValue(trimmed).includes(PLACEHOLDER_ARTIFACT_FINGERPRINT)) {
    return [];
  }
  if (
    /(?:\*\*|##\s|User request:|Working Style|Current Context|Output Structure|Brand voice|You are the\b)/i.test(
      trimmed
    )
  ) {
    return [];
  }

  const candidates = splitArtifactCandidates(trimmed);
  const normalizedPaths: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeSingleArtifactCandidate(candidate);
    if (normalized && !normalizedPaths.includes(normalized)) {
      normalizedPaths.push(normalized);
    }
  }
  return normalizedPaths;
}

function splitArtifactCandidates(value: string): string[] {
  const hasMultiFileSeparator = /[,;]|\s{2,}/.test(value);
  const hasMultipleExtensions =
    (value.match(/\.[A-Za-z0-9]+(?=[\s,;]|$)/g)?.length ?? 0) > 1;
  if (!hasMultiFileSeparator && !hasMultipleExtensions) {
    return [value];
  }
  return value
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSingleArtifactCandidate(raw: string): string | null {
  const candidate = (() => {
    const extensionMatch = raw.match(/^(.+?\.[A-Za-z0-9]+)(?:\s|$)/);
    if (extensionMatch?.[1]) {
      return extensionMatch[1];
    }
    return raw;
  })();

  if (candidate.startsWith("/data/")) {
    return candidate.replace(/^\/data\//, "");
  }

  if (candidate.startsWith(DATA_DIR)) {
    return virtualPathFromFs(candidate);
  }

  let normalized = candidate.replace(/^\.?\//, "");
  // Agents sometimes emit relative "data/..." paths (no leading slash). The
  // KB tree is rooted AT data/, so the prefix is redundant and breaks path
  // matching on the UI side (tree node path has no data/ prefix).
  if (normalized.startsWith("data/")) {
    normalized = normalized.slice(5);
  }
  if (!normalized || normalized.startsWith("..")) return null;
  if (/^relative\/path\/to\/file\d*$/i.test(normalized)) return null;

  // Strict path guard. Agents sometimes return multi-sentence prose that the
  // upstream splitter fails to reject — fragments like "line per file you
  // created or updated. Do not list multiple files on a single" used to show
  // up as file names in the "Recent work" block (UX audit #73).
  //
  // A real artifact path either contains a directory separator or ends in a
  // known file extension; and it must not contain whitespace in the segment
  // before the extension / separator. Anything else is prose.
  const hasSeparator = normalized.includes("/");
  const hasExtension = /\.[A-Za-z0-9]{1,8}$/.test(normalized);
  if (!hasSeparator && !hasExtension) return null;
  const pathHead = hasExtension
    ? normalized.replace(/\.[A-Za-z0-9]{1,8}$/, "")
    : normalized;
  if (/\s/.test(pathHead)) return null;
  // Paths we generate are short — 200 chars is already a runaway match.
  if (normalized.length > 200) return null;
  return normalized;
}

function sanitizeCabinetFieldValue(value: string): string {
  return value
    .replace(/\s+[✢✳✶✻✽·].*$/g, "")
    .replace(/\s*⎿\s*Tip:.*$/g, "")
    .replace(/\s*Tip:\s.*$/g, "")
    .replace(/\s*[─-]{8,}.*$/g, "")
    .replace(/\s*❯\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactCabinetValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isPlaceholderCabinetValue(value?: string): boolean {
  if (!value) return false;
  const normalized = compactCabinetValue(value.trim());
  return (
    normalized === PLACEHOLDER_SUMMARY_FINGERPRINT ||
    normalized === PLACEHOLDER_CONTEXT_FINGERPRINT ||
    normalized === PLACEHOLDER_ARTIFACT_FINGERPRINT
  );
}

export function parseCabinetBlock(output: string, prompt?: string): ParsedCabinetBlock {
  const cleaned = cleanConversationOutputForParsing(output, prompt);
  const promptEchoMatchers = buildPromptEchoMatchers(prompt);
  const matches = Array.from(cleaned.matchAll(/```cabinet\s*([\s\S]*?)```/gi));
  const match = matches.at(-1);
  const artifactPaths: string[] = [];
  let summary = "";
  let contextSummary = "";

  if (match) {
    const lines = match[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (isPromptEchoLine(line, promptEchoMatchers)) {
        continue;
      }
      if (line.startsWith("SUMMARY:")) {
        summary = sanitizeCabinetFieldValue(line.slice("SUMMARY:".length));
        continue;
      }
      if (line.startsWith("CONTEXT:")) {
        contextSummary = sanitizeCabinetFieldValue(line.slice("CONTEXT:".length));
        continue;
      }
      if (line.startsWith("ARTIFACT:")) {
        for (const normalized of normalizeArtifactPaths(line.slice("ARTIFACT:".length))) {
          if (!artifactPaths.includes(normalized)) {
            artifactPaths.push(normalized);
          }
        }
      }
    }

    return {
      summary: summary && !isPlaceholderCabinetValue(summary) ? summary : undefined,
      contextSummary:
        contextSummary && !isPlaceholderCabinetValue(contextSummary)
          ? contextSummary
          : undefined,
      artifactPaths,
    };
  }

  const fieldMatches = Array.from(
    cleaned.matchAll(/(?:^|\n)\s*(SUMMARY|CONTEXT|ARTIFACT):\s*(.*)$/gm)
  );
  if (fieldMatches.length === 0) {
    return { artifactPaths: [] };
  }

  const lastSummaryMatch = [...fieldMatches].reverse().find((entry) => entry[1] === "SUMMARY");
  const relevantStart = lastSummaryMatch?.index ?? 0;

  for (const entry of fieldMatches) {
    if ((entry.index ?? 0) < relevantStart) continue;

    const field = entry[1];
    const rawValue = entry[2] || "";
    const rawLine = `${field}: ${rawValue}`.trim();
    if (isPromptEchoLine(rawLine, promptEchoMatchers)) {
      continue;
    }
    const value = sanitizeCabinetFieldValue(entry[2] || "");
    if (field === "SUMMARY") {
      summary = value;
      continue;
    }
    if (field === "CONTEXT") {
      contextSummary = value;
      continue;
    }
    if (field === "ARTIFACT") {
      for (const normalized of normalizeArtifactPaths(value)) {
        if (!artifactPaths.includes(normalized)) {
          artifactPaths.push(normalized);
        }
      }
    }
  }

  return {
    summary: summary && !isPlaceholderCabinetValue(summary) ? summary : undefined,
    contextSummary:
      contextSummary && !isPlaceholderCabinetValue(contextSummary)
        ? contextSummary
        : undefined,
    artifactPaths,
  };
}

export function buildConversationId(input: {
  agentSlug: string;
  trigger: ConversationTrigger;
  jobName?: string;
  cabinetPath?: string;
  now?: Date;
}): string {
  const now = input.now || new Date();
  const parts = [
    formatTimestampSegment(now),
    cabinetScopeSegment(input.cabinetPath),
    sanitizeSegment(input.agentSlug, "agent"),
    input.trigger,
  ];

  if (input.trigger === "job" && input.jobName) {
    parts.push(sanitizeSegment(input.jobName, "job"));
  }

  return parts.join("-");
}

export async function ensureConversationsDir(cabinetPath?: string): Promise<void> {
  await ensureDirectory(resolveConversationsDir(cabinetPath));
}

export async function createConversation(
  input: CreateConversationInput
): Promise<ConversationMeta> {
  await ensureConversationsDir(input.cabinetPath);

  const startedAt = input.startedAt || new Date().toISOString();
  const id = buildConversationId({
    agentSlug: input.agentSlug,
    trigger: input.trigger,
    jobName: input.jobName || input.jobId,
    cabinetPath: input.cabinetPath,
    now: new Date(startedAt),
  });
  const cp = input.cabinetPath;
  const dir = conversationDir(id, cp);
  await ensureDirectory(dir);

  const meta: ConversationMeta = {
    id,
    agentSlug: input.agentSlug,
    cabinetPath: cp,
    title: input.title,
    trigger: input.trigger,
    status: input.initialStatus ?? "running",
    startedAt,
    jobId: input.jobId,
    jobName: input.jobName,
    scheduledAt: input.scheduledAt,
    providerId: input.providerId,
    adapterType: input.adapterType,
    adapterConfig: input.adapterConfig,
    promptPath: virtualPathFromFs(promptPathFs(id, cp)),
    transcriptPath: virtualPathFromFs(transcriptPathFs(id, cp)),
    mentionedPaths: input.mentionedPaths || [],
    attachmentPaths:
      input.attachmentPaths && input.attachmentPaths.length > 0
        ? input.attachmentPaths
        : undefined,
    artifactPaths: [],
  };

  await Promise.all([
    writeFileContent(promptPathFs(id, cp), input.prompt),
    writeFileContent(transcriptPathFs(id, cp), ""),
    writeFileContent(
      mentionsPathFs(id, cp),
      JSON.stringify(input.mentionedPaths || [], null, 2)
    ),
    writeFileContent(artifactsPathFs(id, cp), JSON.stringify([], null, 2)),
    writeFileContent(metaPath(id, cp), JSON.stringify(meta, null, 2)),
  ]);

  // Broadcast the freshly-created conversation so the task list/board can
  // render it without waiting for a manual refresh. `task.updated` is the
  // event shape the UI already knows how to handle.
  const createdSeq = await appendEventLog(
    id,
    { type: "task.updated", status: meta.status },
    cp
  );
  publishConversationEvent({
    type: "task.updated",
    taskId: id,
    cabinetPath: cp,
    seq: createdSeq ?? undefined,
    payload: { status: meta.status },
  });

  if (shouldEnqueueConversationStart(meta.trigger)) {
    enqueueConversationNotification({
      id,
      agentSlug: meta.agentSlug,
      cabinetPath: cp,
      title: meta.title,
      status: "running",
      completedAt: startedAt,
      trigger: meta.trigger,
      jobName: meta.jobName,
      scheduledAt: meta.scheduledAt,
    });
  }

  return meta;
}

export async function readConversationMeta(
  id: string,
  cabinetPath?: string
): Promise<ConversationMeta | null> {
  const resolvedCabinetPath = await resolveConversationCabinetPath(id, cabinetPath);
  if (resolvedCabinetPath === null) return null;

  const filePath = metaPath(id, resolvedCabinetPath);
  try {
    const raw = await readFileContent(filePath);
    const parsed = JSON.parse(raw) as ConversationMeta;
    // Always trust the resolved on-disk path over whatever is stored in
    // meta.json. Some older meta files carry a stale cabinetPath (left over
    // from a cabinet rename/migration) that no longer matches the directory
    // they actually live in. Returning the resolved path keeps downstream
    // writes + API calls pointing at the real storage location.
    if (typeof resolvedCabinetPath === "string") {
      parsed.cabinetPath = resolvedCabinetPath;
    } else if (!resolvedCabinetPath) {
      parsed.cabinetPath = undefined;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function resolveConversationCabinetPath(
  id: string,
  cabinetPath?: string
): Promise<string | null> {
  if (typeof cabinetPath === "string") {
    if (await fileExists(metaPath(id, cabinetPath))) return cabinetPath;
    // Fall through to discovery: callers sometimes pass a stale cabinetPath
    // sourced from an old meta.json. Rather than 404, locate the conversation
    // by scanning known cabinets.
  }

  for (const candidate of await discoverCabinetPaths()) {
    if (await fileExists(metaPath(id, candidate))) {
      return candidate;
    }
  }

  return null;
}

function stripAnsiText(str: string): string {
  return str
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B[P^_][\s\S]*?\u001B\\/g, "")
    // Replace cursor-movement CSI sequences with a space to preserve word boundaries
    .replace(/\u001B\[\d*[CGHID]/g, " ")
    // Strip remaining CSI sequences (colors, formatting, erasing)
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001B[@-_]/g, "")
    // Remaining single-char ESC sequences: DECSC/DECRC (\u001B7 / \u001B8),
    // RIS (\u001Bc), keypad mode (\u001B= / \u001B>), etc. Final byte in
    // 0x30-0x3F or 0x60-0x7E. Without this, \u001B7 leaks into
    // meta.summary as literal "\u001B7\u001B8─────" garbage for TUI-heavy agents.
    .replace(/\u001B[\u0030-\u003F\u0060-\u007E]/g, "")
    // Charset designate two-byte sequences: \u001B ( B | \u001B ) 0 | etc.
    .replace(/\u001B[()*+\-./][\u0020-\u007E]/g, "")
    .replace(/[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/g, "")
    // Collapse runs of spaces produced by cursor replacements
    .replace(/ {2,}/g, " ");
}

function normalizeDisplayLine(line: string): string {
  return line
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPromptEchoMatchers(prompt?: string): PromptEchoMatchers {
  if (!prompt) {
    return {
      normalizedLines: new Set<string>(),
      compactLines: new Set<string>(),
      compactFragments: [],
    };
  }

  const normalizedLines = new Set<string>();
  const compactLines = new Set<string>();
  for (const line of stripAnsiText(prompt).replace(/\r+/g, "\n").split("\n")) {
    const normalized = normalizeDisplayLine(line);
    if (normalized.length >= 4) {
      normalizedLines.add(normalized);
    }
    const compact = compactCabinetValue(line);
    if (compact.length >= 12) {
      compactLines.add(compact);
    }
  }

  return {
    normalizedLines,
    compactLines,
    compactFragments: [...compactLines]
      .filter((fragment) => fragment.length >= 24)
      .sort((left, right) => right.length - left.length),
  };
}

function stripPromptEchoFromTranscript(transcript: string, prompt?: string): string {
  const promptEchoMatchers = buildPromptEchoMatchers(prompt);
  if (
    promptEchoMatchers.normalizedLines.size === 0 &&
    promptEchoMatchers.compactLines.size === 0
  ) {
    return transcript;
  }

  return transcript
    .split("\n")
    .filter((line) => {
      return !isPromptEchoLine(line, promptEchoMatchers);
    })
    .join("\n");
}

function isPromptEchoLine(line: string, promptEchoMatchers: PromptEchoMatchers): boolean {
  const normalized = normalizeDisplayLine(line);
  if (!normalized) return false;
  if (promptEchoMatchers.normalizedLines.has(normalized)) return true;

  const compact = compactCabinetValue(line);
  if (compact && promptEchoMatchers.compactLines.has(compact)) {
    return true;
  }

  let fragmentMatches = 0;
  for (const fragment of promptEchoMatchers.normalizedLines) {
    if (fragment.length < 12) continue;
    if (normalized.includes(fragment)) {
      fragmentMatches += 1;
      if (fragmentMatches >= 2) return true;
    }
  }

  if (compact.length >= 24) {
    for (const fragment of promptEchoMatchers.compactFragments) {
      if (compact === fragment) return true;
      if (compact.includes(fragment)) return true;
    }
  }

  return false;
}

function cleanConversationOutputForParsing(output: string, prompt?: string): string {
  return stripPromptEchoFromTranscript(
    stripAnsiText(output)
      .replace(/\u00A0/g, " ")
      .replace(/\r+/g, "\n")
      .replace(/\s*(SUMMARY:|CONTEXT:|ARTIFACT:)\s*/g, "\n$1"),
    prompt
  );
}

function isClaudeIdleTailNoise(line: string): boolean {
  const normalized = normalizeDisplayLine(line);
  if (!normalized) return true;
  if (/^[─-]{8,}$/.test(normalized)) return true;
  if (/^⏵⏵/.test(normalized)) return true;
  if (/^[✢✳✶✻✽·]$/.test(normalized)) return true;
  if (/^⎿\s*Tip:/i.test(normalized) || /^Tip:/i.test(normalized)) return true;

  // Completion timing line: "Brewed for 1m 43s", "✻ Sautéed for 30s", etc.
  // Claude Code uses many cooking/creative verbs — match generically.
  if (/^[✢✳✶✻✽]\s*\S+\s+for\b/i.test(normalized)) return true;
  if (/\bfor\s+(?:\d+m\s*)?\d+s\b/i.test(normalized)) return true;
  if (/^\S+\s+for\s+\d/i.test(normalized)) return true;

  const compact = compactCabinetValue(line);
  if (!compact) return true;
  if (compact.includes("esctointerrupt")) return false;
  if (compact.includes("bypasspermissionson")) return true;
  if (compact.includes("shifttabtocycle")) return true;
  if (/\wfor\d/.test(compact)) return true;
  if (
    /(orbiting|sublimating|sketching|brewing|thinking|manifesting|twisting|lollygagging|contemplating|vibing|improvising|envisioning|churning)/i.test(
      normalized
    )
  ) {
    return false;
  }

  return false;
}

function hasClaudePromptTail(transcript: string, prompt?: string): boolean {
  const cleaned = cleanConversationOutputForParsing(transcript, prompt)
    .replace(/[─-]{8,}/g, "\n")
    .replace(/❯\s*(?=(?:SUMMARY|CONTEXT|ARTIFACT):)/g, "\n");
  const lines = cleaned.split("\n");

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeDisplayLine(lines[index] || "");
    if (!normalized) continue;
    if (/^[❯>](?:\s|$)/.test(normalized)) {
      return true;
    }
    if (isClaudeIdleTailNoise(lines[index] || "")) {
      continue;
    }
    return false;
  }

  return false;
}

/**
 * Extract the human-readable portion of an agent's turn: strip ANSI, prompt
 * echo, the trailing ```cabinet``` block, and unwrap any
 * `<ask_user>…</ask_user>` markers. Unlike
 * formatConversationTranscriptForDisplay (which is CLI-terminal-focused),
 * this returns the body the user actually typed/read — suitable for
 * rendering a chat turn.
 */
export function extractAgentTurnContent(
  transcript: string,
  prompt?: string
): string {
  const cleaned = cleanConversationOutputForParsing(transcript, prompt);
  const withoutCabinet = cleaned.replace(/```cabinet[\s\S]*?```/gi, "").trim();
  const unwrapped = withoutCabinet.replace(
    /<ask_user>([\s\S]*?)<\/ask_user>/gi,
    (_, inner: string) => inner.trim()
  );
  if (unwrapped.trim()) return unwrapped.trim();
  return formatConversationTranscriptForDisplay(transcript, prompt);
}

export function formatConversationTranscriptForDisplay(
  transcript: string,
  prompt?: string
): string {
  const cleaned = cleanConversationOutputForParsing(transcript, prompt);
  const promptEchoMatchers = buildPromptEchoMatchers(prompt);
  const normalized = cleaned
    .replace(/[─-]{8,}/g, "\n")
    .replace(/\s*(SUMMARY:|CONTEXT:|ARTIFACT:)\s*/g, "\n$1")
    .replace(/❯\s*(?=(?:SUMMARY|CONTEXT|ARTIFACT):)/g, "\n");

  function isTerminalNoise(trimmed: string): boolean {
    const normalizedLine = normalizeDisplayLine(trimmed);
    return (
      !trimmed ||
      isPromptEchoLine(trimmed, promptEchoMatchers) ||
      normalizedLine === PLACEHOLDER_SUMMARY ||
      normalizedLine === PLACEHOLDER_CONTEXT ||
      normalizedLine === PLACEHOLDER_ARTIFACT_HINT ||
      /^[─-]{8,}$/.test(trimmed) ||
      /^[❯>]\s*$/.test(trimmed) ||
      /^⏵⏵/.test(trimmed) ||
      /^◐\s+\w+\s+·\s+\/effort/.test(trimmed) ||
      /\/effort\b/.test(trimmed) ||
      /^\d+\s+MCP server failed\b/.test(trimmed) ||
      /^[✢✳✶✻✽·]\s*$/.test(trimmed) ||
      /^[0-9]+(?:;[0-9]+){2,}m/.test(trimmed) ||
      /(?:^|[\s·])(?:Orbiting|Sublimating)…?(?:\s+\(thinking\))?$/.test(trimmed) ||
      /(?:Sketching|Brewing|Thinking|Manifesting|Twisting|Lollygagging|Contemplating|Vibing|Sautéed)/i.test(trimmed) ||
      /\(thinking\)/.test(trimmed) ||
      trimmed.includes("ClaudeCodev") ||
      trimmed.includes("Sonnet4.6") ||
      trimmed.includes("~/Development/cabinet") ||
      trimmed.includes("bypasspermissionson") ||
      trimmed.includes("[Pastedtext#")
    );
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));

  const filtered: string[] = [];
  let blankCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (isTerminalNoise(trimmed)) {
      if (!trimmed) {
        blankCount += 1;
        if (blankCount <= 1) {
          filtered.push("");
        }
      }
      continue;
    }

    blankCount = 0;
    filtered.push(line);
  }

  const summaryIndex = filtered.findLastIndex((line) => line.trim().startsWith("SUMMARY:"));
  if (summaryIndex !== -1) {
    let start = filtered
      .slice(0, summaryIndex + 1)
      .findLastIndex((line) => line.trim().startsWith("⏺"));

    if (start === -1) {
      start = summaryIndex;
      for (let index = summaryIndex - 1; index >= 0; index -= 1) {
        const trimmed = filtered[index].trim();
        if (!trimmed) {
          if (start < summaryIndex) break;
          continue;
        }
        start = index;
      }
    }

    let end = filtered.length;
    for (let index = summaryIndex + 1; index < filtered.length; index += 1) {
      const trimmed = filtered[index].trim();
      if (!trimmed) continue;
      if (/^(?:CONTEXT|ARTIFACT):/.test(trimmed)) continue;
      if (isTerminalNoise(trimmed)) {
        end = index;
        break;
      }
    }

    return filtered.slice(start, end).join("\n").trim();
  }

  return filtered.join("\n").trim();
}

function hasMeaningfulCabinetResult(transcript: string, prompt?: string): boolean {
  const parsed = parseCabinetBlock(transcript, prompt);
  return Boolean(parsed.summary || parsed.contextSummary || parsed.artifactPaths.length > 0);
}

/**
 * True when the agent's reply does not contain a usable `cabinet` metadata
 * block. The runner uses this to trigger a single synthetic follow-up turn
 * asking the agent to emit the block before recording the run as complete.
 */
export function isCabinetBlockMissing(output: string, prompt?: string): boolean {
  if (!output || !output.trim()) return true;
  return !hasMeaningfulCabinetResult(output, prompt);
}

export function transcriptShowsCompletedRun(transcript: string, prompt?: string): boolean {
  // Keep this prompt-aware. A looser regex here will treat the echoed prompt's
  // cabinet instructions as a finished run and force the UI out of streaming mode.
  if (!hasMeaningfulCabinetResult(transcript, prompt)) {
    return false;
  }
  return hasClaudePromptTail(transcript, prompt);
}

async function maybeResolveCompletedConversation(
  meta: ConversationMeta | null
): Promise<ConversationMeta | null> {
  if (!meta) return meta;

  const cabinetPath = meta.cabinetPath;
  const transcript = await readConversationTranscript(meta.id, cabinetPath);
  const prompt = (await fileExists(promptPathFs(meta.id, cabinetPath)))
    ? await readFileContent(promptPathFs(meta.id, cabinetPath))
    : "";
  // Manual terminal-mode sessions stay "running" until the user closes
  // them explicitly (Done button or /exit in the xterm). An idle CLI
  // prompt is awaiting-input, not completed. Never silently flip these
  // to status=completed from a detail-fetch side effect.
  if (meta.status === "running" && meta.trigger === "manual") {
    return meta;
  }
  if (meta.status === "running" && !transcriptShowsCompletedRun(transcript, prompt)) {
    return meta;
  }
  const parsed = parseCabinetBlock(transcript, prompt);
  const needsRepair =
    meta.status === "running" ||
    isPlaceholderCabinetValue(meta.summary) ||
    isPlaceholderCabinetValue(meta.contextSummary) ||
    meta.artifactPaths.some((artifactPath) => isPlaceholderCabinetValue(artifactPath)) ||
    (!!parsed.summary && parsed.summary !== meta.summary) ||
    (!!parsed.contextSummary && parsed.contextSummary !== meta.contextSummary) ||
    (parsed.artifactPaths.length > 0 &&
      parsed.artifactPaths.join("|") !== meta.artifactPaths.join("|"));

  if (!needsRepair) {
    return meta;
  }

  return (
    await finalizeConversation(meta.id, {
      status: meta.status === "running" ? "completed" : meta.status,
      exitCode: meta.status === "running" ? 0 : meta.exitCode,
      output: transcript,
    }, cabinetPath)
  ) || meta;
}

export async function writeConversationMeta(meta: ConversationMeta): Promise<void> {
  await ensureDirectory(conversationDir(meta.id, meta.cabinetPath));
  await writeFileContent(metaPath(meta.id, meta.cabinetPath), JSON.stringify(meta, null, 2));
}

// Throttle state for transcript-driven task.updated events. Streaming stdout
// can fire 100+ times per second; we coalesce to ~one event per 500 ms per
// conversation so the UI refetch cadence stays sane.
const TRANSCRIPT_EVENT_THROTTLE_MS = 500;
const transcriptEventThrottle = new Map<string, number>();

export async function appendConversationTranscript(
  id: string,
  chunk: string,
  cabinetPath?: string
): Promise<void> {
  await ensureDirectory(conversationDir(id, cabinetPath));
  await fs.appendFile(transcriptPathFs(id, cabinetPath), chunk, "utf-8");

  const now = Date.now();
  const lastAt = transcriptEventThrottle.get(id) ?? 0;
  if (now - lastAt < TRANSCRIPT_EVENT_THROTTLE_MS) return;
  transcriptEventThrottle.set(id, now);

  // Fire-and-forget task.updated so the task page can refetch the partial
  // transcript and stream it into the rendered turn while the adapter runs.
  publishConversationEvent({
    type: "task.updated",
    taskId: id,
    cabinetPath,
    payload: { streaming: true },
  });
}

export async function replaceConversationArtifacts(
  id: string,
  artifacts: ConversationArtifact[],
  cabinetPath?: string
): Promise<void> {
  await ensureDirectory(conversationDir(id, cabinetPath));
  await writeFileContent(artifactsPathFs(id, cabinetPath), JSON.stringify(artifacts, null, 2));
}

/**
 * Agents occasionally copy the cabinet epilogue block (```cabinet SUMMARY: ...
 * ARTIFACT: ... ```) into the body of a KB file they're writing, instead of
 * keeping it as a pure transcript meta-annotation. This strips a trailing
 * ```cabinet ... ``` fence from each .md artifact so the file stays clean.
 * Defensive: the prompt also tells the agent not to do this, but some models
 * slip up when the file content IS the bulk of the response.
 */
const CABINET_TRAILER_REGEX = /\n*```cabinet\b[\s\S]*?\n```[\s\r\n]*$/i;

export async function sanitizeArtifactCabinetBlocks(
  artifactPaths: string[]
): Promise<void> {
  const dataDirWithSep = DATA_DIR.endsWith(path.sep) ? DATA_DIR : DATA_DIR + path.sep;
  for (const relPath of artifactPaths) {
    if (!relPath.toLowerCase().endsWith(".md")) continue;
    const resolved = path.resolve(DATA_DIR, relPath);
    if (!resolved.startsWith(dataDirWithSep) && resolved !== DATA_DIR) continue;
    try {
      const content = await fs.readFile(resolved, "utf8");
      if (!CABINET_TRAILER_REGEX.test(content)) continue;
      const stripped = content.replace(CABINET_TRAILER_REGEX, "").replace(/\s+$/, "");
      const trailing = content.endsWith("\n") ? "\n" : "";
      await fs.writeFile(resolved, stripped + trailing, "utf8");
    } catch {
      // File missing or unreadable — skip. This is best-effort cleanup.
    }
  }
}

export async function finalizeConversation(
  id: string,
  input: {
    status: ConversationStatus;
    exitCode?: number | null;
    output?: string;
    /** Token usage for this first-turn run, written to `meta.tokens`. */
    tokens?: ConversationTokens;
    errorKind?: ConversationErrorKind | null;
    errorHint?: string | null;
    errorRetryAfterSec?: number | null;
  },
  cabinetPath?: string
): Promise<ConversationMeta | null> {
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) return null;
  const cp = meta.cabinetPath || cabinetPath;

  const hasPrompt = await fileExists(promptPathFs(id, cp));
  const [output, prompt] = await Promise.all([
    input.output ? Promise.resolve(input.output) : readConversationTranscript(id, cp),
    hasPrompt ? readFileContent(promptPathFs(id, cp)) : Promise.resolve(""),
  ]);
  const cleanedOutput = cleanConversationOutputForParsing(output, prompt);
  const parsed = parseCabinetBlock(cleanedOutput, prompt);
  const artifacts = parsed.artifactPaths.map((artifactPath) => ({
    path: artifactPath,
  }));

  // Re-parse on every finalize so follow-up turns that propose new actions
  // (e.g. user redirects "send to copywriter" → agent emits cabinet-actions
  // on resume) are picked up. Dedupe against already-pending and
  // already-dispatched actions by fingerprint so nothing double-queues.
  try {
    // Pass the raw transcript (not cleanedOutput) — the prompt-echo filter
    // used to build cleanedOutput strips the ```cabinet-actions fence line
    // because it appears verbatim in the system prompt, which would hide
    // the entire JSON block from the parser. The parser has its own
    // action-level echo filter via fingerprintsFromPrompt.
    const pending = await proposePendingActions(meta, output, prompt);
    if (pending.length > 0) {
      const existing = new Set<string>();
      for (const p of meta.pendingActions || []) existing.add(fingerprint(p.action));
      for (const d of meta.dispatchedActions || []) existing.add(fingerprint(d.action));
      const fresh = pending.filter((p) => !existing.has(fingerprint(p.action)));
      if (fresh.length > 0) {
        meta.pendingActions = [...(meta.pendingActions || []), ...fresh];
      }
    }
    meta.actionsProposedAt = new Date().toISOString();
  } catch {
    // Never fail a conversation finalize because action parsing threw.
  }

  const previousStatus = meta.status;
  meta.status = input.status;
  meta.completedAt =
    meta.completedAt && previousStatus === input.status
      ? meta.completedAt
      : new Date().toISOString();
  meta.exitCode = input.exitCode ?? null;
  // Preserve any values that were already set by `scheduleStreamCabinetExtraction`
  // during the live run. That path parses fenced `cabinet` blocks as they
  // stream in and writes clean SUMMARY/ARTIFACT values to meta. If the
  // finalize-time parse comes back empty (e.g. we passed a distilled
  // one-liner for PTY sessions, or the TUI redraw noise never produced a
  // fence), clobbering those good values with `makeSummaryFromOutput` of
  // the raw transcript is how we ended up with `"78─────"`-type
  // summaries and artifactPaths full of prompt-echo fragments.
  if (parsed.summary) {
    meta.summary = parsed.summary;
  } else if (!meta.summary) {
    meta.summary = makeSummaryFromOutput(cleanedOutput);
  }
  if (parsed.contextSummary) {
    meta.contextSummary = parsed.contextSummary;
  }
  if (artifacts.length > 0) {
    meta.artifactPaths = artifacts.map((artifact) => artifact.path);
  } else if (!meta.artifactPaths) {
    meta.artifactPaths = [];
  }

  // First-turn tokens — G7. Only write when the caller provided a reading and
  // we don't already have one (continue-turns handle aggregation via
  // aggregateTokens in appendAgentTurn/updateAgentTurn).
  if (input.tokens) {
    const existing = meta.tokens;
    // Prefer the larger reading: if the continue path already aggregated, we
    // won't clobber with a potentially smaller first-turn number.
    if (!existing || (existing.total ?? 0) < input.tokens.total) {
      meta.tokens = input.tokens;
    }
  }

  // Terminal statuses always exit the "awaiting-input" state — the session
  // is gone, there's nothing left to input into. Without this, a manual
  // terminal session that was mid-idle when the user clicked Done would
  // render in the UI as "awaiting-input" after exit (deriveStatus prefers
  // awaitingInput over doneAt/status).
  if (input.status === "completed" || input.status === "failed") {
    meta.awaitingInput = false;
  }

  if (input.status === "completed") {
    // Clear any stale error classification on success.
    meta.errorKind = undefined;
    meta.errorHint = undefined;
    meta.errorRetryAfterSec = undefined;
  } else if (input.status === "failed") {
    if (input.errorKind) {
      meta.errorKind = input.errorKind;
    }
    if (input.errorHint !== undefined) {
      meta.errorHint = input.errorHint ?? undefined;
    }
    if (input.errorRetryAfterSec !== undefined) {
      meta.errorRetryAfterSec = input.errorRetryAfterSec ?? undefined;
    }
  }

  // Keep artifacts.json in sync with the value we actually committed to
  // meta.artifactPaths above — if we preserved a prior stream-extracted
  // list (because this finalize had no fresh artifacts), write that back
  // instead of a blank array.
  const artifactsToWrite =
    artifacts.length > 0
      ? artifacts
      : (meta.artifactPaths ?? []).map((artifactPath) => ({ path: artifactPath }));
  await Promise.all([
    writeConversationMeta(meta),
    replaceConversationArtifacts(id, artifactsToWrite, cp),
    sanitizeArtifactCabinetBlocks(meta.artifactPaths),
  ]);

  // Broadcast a task.updated so every subscribed surface (task page, tasks
  // board, sidebar file tree) can refresh without waiting on an explicit
  // turn.appended event (first-turn runs never hit that path).
  const seq = await appendEventLog(
    id,
    {
      type: "task.updated",
      status: meta.status,
      artifactPaths: meta.artifactPaths,
    },
    cp
  );
  publishConversationEvent({
    type: "task.updated",
    taskId: id,
    cabinetPath: cp,
    seq: seq ?? undefined,
    payload: {
      status: meta.status,
      artifactPaths: meta.artifactPaths,
    },
  });

  // Push notification for terminal statuses
  if (shouldEnqueueConversationNotification(previousStatus, meta.status)) {
    notificationQueue.push({
      id: meta.id,
      agentSlug: meta.agentSlug,
      cabinetPath: meta.cabinetPath,
      title: meta.title,
      status: meta.status,
      summary: meta.summary,
      completedAt: meta.completedAt || new Date().toISOString(),
    });
  }

  // Skill mount cleanup: tmpdirs created by `syncSkillsToTmpdir` /
  // `prepareSkillMount` for this session are removed when the conversation
  // is finalized. Pre-finalize this was a slow leak under /tmp/cabinet-skills.
  // Lazy-imported to avoid pulling skill loader code into the store at load.
  try {
    const { cleanupSkillsTmpdir } = await import(
      "./adapters/_shared/skills-injection"
    );
    cleanupSkillsTmpdir(id);
  } catch {
    /* cleanup is best-effort */
  }

  return meta;
}

export async function readConversationTranscript(id: string, cabinetPath?: string): Promise<string> {
  const resolvedCabinetPath = await resolveConversationCabinetPath(id, cabinetPath);
  if (resolvedCabinetPath === null) return "";

  const filePath = transcriptPathFs(id, resolvedCabinetPath);
  if (!(await fileExists(filePath))) return "";
  return readFileContent(filePath);
}

export async function readConversationDetail(
  id: string,
  cabinetPath?: string,
  options: { withTurns?: boolean } = {}
): Promise<ConversationDetail | null> {
  const meta = await maybeResolveCompletedConversation(await readConversationMeta(id, cabinetPath));
  if (!meta) return null;
  const cp = meta.cabinetPath || cabinetPath;

  const [hasPrompt, hasMentions, hasArtifacts] = await Promise.all([
    fileExists(promptPathFs(id, cp)),
    fileExists(mentionsPathFs(id, cp)),
    fileExists(artifactsPathFs(id, cp)),
  ]);

  const [prompt, transcript, mentionsRaw, artifactsRaw] = await Promise.all([
    hasPrompt ? readFileContent(promptPathFs(id, cp)) : Promise.resolve(""),
    readConversationTranscript(id, cp),
    hasMentions ? readFileContent(mentionsPathFs(id, cp)) : Promise.resolve("[]"),
    hasArtifacts ? readFileContent(artifactsPathFs(id, cp)) : Promise.resolve("[]"),
  ]);

  let mentions: string[] = [];
  let artifacts: ConversationArtifact[] = [];

  try {
    mentions = JSON.parse(mentionsRaw) as string[];
  } catch {
    mentions = [];
  }

  try {
    artifacts = JSON.parse(artifactsRaw) as ConversationArtifact[];
  } catch {
    artifacts = [];
  }

  const [turns, session] = options.withTurns
    ? await Promise.all([
        readConversationTurns(id, cp),
        readSession(id, cp),
      ])
    : [undefined, undefined];

  return {
    meta,
    prompt,
    request: extractConversationRequest(prompt),
    rawTranscript: transcript,
    transcript: formatConversationTranscriptForDisplay(transcript, prompt),
    mentions,
    artifacts,
    turns,
    session,
  };
}

export async function listConversationMetas(
  filters: ListConversationFilters = {}
): Promise<ConversationMeta[]> {
  const cabinetPaths = filters.cabinetPath
    ? [filters.cabinetPath]
    : await discoverCabinetPaths();

  const groups = await Promise.all(
    cabinetPaths.map(async (cabinetPath) => {
      const convsDir = resolveConversationsDir(cabinetPath);
      await ensureDirectory(convsDir);
      const entries = await listDirectory(convsDir);

      return (
        await Promise.all(
          entries
            .filter((entry) => entry.isDirectory)
            .map(async (entry) =>
              maybeResolveCompletedConversation(
                await readConversationMeta(entry.name, cabinetPath)
              )
            )
        )
      ).filter(Boolean) as ConversationMeta[];
    })
  );

  const metas = groups.flat();

  const filtered = metas.filter((meta) => {
    if (filters.agentSlug && meta.agentSlug !== filters.agentSlug) return false;
    if (filters.trigger && meta.trigger !== filters.trigger) return false;
    if (filters.status && meta.status !== filters.status) return false;
    if (filters.pagePath && !meta.mentionedPaths.includes(filters.pagePath)) return false;
    return true;
  });

  filtered.sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  const deduped = new Map<string, ConversationMeta>();
  for (const meta of filtered) {
    const key = buildConversationInstanceKey(meta);
    if (!deduped.has(key)) {
      deduped.set(key, meta);
    }
  }

  return Array.from(deduped.values()).slice(0, filters.limit || 200);
}

export async function getRunningConversationCounts(): Promise<Record<string, number>> {
  const running = await listConversationMetas({ status: "running", limit: 1000 });
  return running.reduce<Record<string, number>>((acc, meta) => {
    acc[meta.agentSlug] = (acc[meta.agentSlug] || 0) + 1;
    return acc;
  }, {});
}

export async function deleteConversation(id: string, cabinetPath?: string): Promise<boolean> {
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) return false;

  const dir = conversationDir(id, meta.cabinetPath || cabinetPath);
  await deleteFileOrDir(dir);
  return true;
}

/**
 * Walk every cabinet's `.agents/.conversations/_pending/` directory and
 * delete staging dirs older than `maxAgeMs` (default 24h). Called by the
 * daemon on startup and daily thereafter so attachments pasted into the
 * composer without being sent don't leak forever. Best-effort — errors
 * on individual entries are logged and the sweep continues.
 */
export async function cleanupStaleStagingAttachments(
  maxAgeMs: number = 24 * 60 * 60 * 1000
): Promise<{ scanned: number; removed: number }> {
  const now = Date.now();
  let scanned = 0;
  let removed = 0;

  // Collect candidate _pending dirs: the root one plus every cabinet's.
  const pendingDirs: string[] = [path.join(CONVERSATIONS_DIR, "_pending")];
  try {
    // Walk top-level dirs under DATA_DIR to find cabinet scopes.
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".agents") continue; // root is already covered
      const cabinetPending = path.join(
        DATA_DIR,
        entry.name,
        ".agents",
        ".conversations",
        "_pending"
      );
      pendingDirs.push(cabinetPending);
    }
  } catch {
    // ignore — DATA_DIR may not exist in some test envs
  }

  for (const pendingDir of pendingDirs) {
    if (!(await fileExists(pendingDir))) continue;
    let entries: import("fs").Dirent[];
    try {
      entries = (await fs.readdir(pendingDir, {
        withFileTypes: true,
      })) as unknown as import("fs").Dirent[];
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      scanned += 1;
      const entryPath = path.join(pendingDir, entry.name);
      try {
        const stat = await fs.stat(entryPath);
        const age = now - stat.mtimeMs;
        if (age > maxAgeMs) {
          await fs.rm(entryPath, { recursive: true, force: true });
          removed += 1;
        }
      } catch (err) {
        console.warn(
          `[cleanupStaleStagingAttachments] skipped ${entryPath}:`,
          err
        );
      }
    }
  }

  return { scanned, removed };
}

/**
 * Overwrite the stored prompt.md for an existing conversation. Used by
 * the runner after attachments are moved out of the staging dir so the
 * on-disk prompt reflects the final cwd-relative attachment paths. Runs
 * after createConversation has written the base prompt; safe to call
 * idempotently.
 */
export async function updateConversationPrompt(
  id: string,
  prompt: string,
  cabinetPath?: string
): Promise<void> {
  await writeFileContent(promptPathFs(id, cabinetPath), prompt);
}

/**
 * Move composer attachments from a kickoff staging directory into the
 * newly-created conversation's attachments directory. Returns the rewritten
 * virtual paths (one per input path) so the caller can feed them into the
 * adapter prompt. Paths that don't match the staging pattern are passed
 * through unchanged.
 *
 * The expected input paths look like:
 *   `{cabinetPath?}/.agents/.conversations/_pending/{stagingClientUuid}/attachments/{file}`
 * and get rewritten to:
 *   `{cabinetPath?}/.agents/.conversations/{conversationId}/attachments/{file}`
 *
 * Move strategy: rename the whole staging `attachments/` subdir when the
 * target doesn't exist (fast, atomic). Falls back to per-file moves when
 * the target already exists (edge case).
 */
export async function moveStagingAttachments(args: {
  stagingClientUuid: string;
  conversationId: string;
  cabinetPath?: string;
  attachmentPaths: string[];
}): Promise<string[]> {
  const { stagingClientUuid, conversationId, cabinetPath, attachmentPaths } = args;
  if (!stagingClientUuid || attachmentPaths.length === 0) return attachmentPaths;

  const convDir = conversationDir(conversationId, cabinetPath);
  const stagingDirFs = path.join(
    resolveConversationsDir(cabinetPath),
    "_pending",
    stagingClientUuid,
    "attachments"
  );
  const finalDirFs = path.join(convDir, "attachments");

  // If the staging dir doesn't exist, nothing to move. This is fine —
  // callers may pass attachment paths that were already uploaded straight
  // to the conversation dir (continuation turns).
  if (!(await fileExists(stagingDirFs))) {
    return attachmentPaths;
  }

  await ensureDirectory(convDir);

  try {
    // Fast path: target doesn't exist, rename the whole dir.
    if (!(await fileExists(finalDirFs))) {
      await fs.rename(stagingDirFs, finalDirFs);
    } else {
      // Slow path: target exists, move files one by one.
      const entries = await listDirectory(stagingDirFs);
      for (const entry of entries) {
        const from = path.join(stagingDirFs, entry.name);
        const to = path.join(finalDirFs, entry.name);
        await fs.rename(from, to);
      }
      // Drop the now-empty staging dir.
      try {
        await fs.rmdir(stagingDirFs);
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.warn(
      `[moveStagingAttachments] move failed for ${stagingClientUuid}:`,
      err
    );
    // Best-effort: pass through original paths so the adapter can still
    // find the files in the staging dir.
    return attachmentPaths;
  }

  // Clean up the now-empty parent `{cabinet?}/_pending/{uuid}/` wrapper.
  try {
    const pendingWrapper = path.dirname(stagingDirFs);
    await fs.rmdir(pendingWrapper);
  } catch {
    // ignore — either non-empty (other files) or already gone
  }

  // Rewrite the virtual paths. The staging segment includes the cabinet
  // prefix (if any) + `.agents/.conversations/_pending/{uuid}/attachments/`
  // and gets replaced with `.agents/.conversations/{conversationId}/attachments/`.
  const stagingSegment = `/.agents/.conversations/_pending/${stagingClientUuid}/attachments/`;
  const finalSegment = `/.agents/.conversations/${conversationId}/attachments/`;
  // Handle both cabinet-scoped and root variants (root paths start with the
  // segment itself without a leading cabinet).
  const rootStagingPrefix = `.agents/.conversations/_pending/${stagingClientUuid}/attachments/`;
  const rootFinalPrefix = `.agents/.conversations/${conversationId}/attachments/`;

  return attachmentPaths.map((p) => {
    if (p.includes(stagingSegment)) {
      return p.replace(stagingSegment, finalSegment);
    }
    if (p.startsWith(rootStagingPrefix)) {
      return rootFinalPrefix + p.slice(rootStagingPrefix.length);
    }
    return p;
  });
}

// ---------------------------------------------------------------------------
// Multi-turn extensions (v2)
//
// Turn 1 = existing prompt.md (user) + transcript.txt (agent) pair.
// Turns 2+ = turns/NNN-{user,agent}.md files alongside.
// Single-shot conversations read back as turnCount=1 with zero turn files.
// ---------------------------------------------------------------------------

export interface AppendUserTurnInput {
  content: string;
  mentionedPaths?: string[];
  /**
   * Composer attachments for this user turn. Persisted on the turn file
   * frontmatter so the UI can render inline thumbnails when the
   * conversation is reloaded.
   */
  attachmentPaths?: string[];
  ts?: string;
}

export interface AppendAgentTurnInput {
  content: string;
  ts?: string;
  sessionId?: string;
  tokens?: TurnTokens;
  awaitingInput?: boolean;
  pending?: boolean;
  exitCode?: number | null;
  error?: string;
  artifacts?: string[];
}

export interface UpdateAgentTurnInput {
  content?: string;
  sessionId?: string;
  tokens?: TurnTokens;
  awaitingInput?: boolean;
  pending?: boolean;
  exitCode?: number | null;
  error?: string;
  artifacts?: string[];
}

/**
 * Synthesize turn 1 from prompt.md + transcript.txt. Returns null when the
 * conversation is missing both.
 */
async function readTurnOne(
  id: string,
  meta: ConversationMeta,
  cabinetPath?: string
): Promise<{ user: ConversationTurn; agent: ConversationTurn | null }> {
  const cp = meta.cabinetPath || cabinetPath;

  const prompt = (await fileExists(promptPathFs(id, cp)))
    ? await readFileContent(promptPathFs(id, cp))
    : "";
  const transcript = (await fileExists(transcriptPathFs(id, cp)))
    ? await readFileContent(transcriptPathFs(id, cp))
    : "";

  const userContent = extractConversationRequest(prompt) || prompt;
  const user: ConversationTurn = {
    id: `${id}-t1u`,
    turn: 1,
    role: "user",
    ts: meta.startedAt,
    content: userContent,
    mentionedPaths: meta.mentionedPaths,
    attachmentPaths:
      meta.attachmentPaths && meta.attachmentPaths.length > 0
        ? meta.attachmentPaths
        : undefined,
  };

  // Turn 1 agent: while the conversation is still running and the daemon
  // hasn't streamed any bytes yet, show a "Working on it…" placeholder so
  // the UI isn't blank during the adapter cold-start + first-poll window.
  // Continue turns already do this via `continueConversationRun` writing an
  // explicit pending turn file; the first turn has no turn file, so we
  // fabricate the placeholder here at read time. For any non-running status
  // (failed/cancelled/completed-with-empty-output) keep returning null so
  // error paths aren't masked behind a fake placeholder.
  if (!transcript.trim()) {
    if (meta.status === "running") {
      const placeholder: ConversationTurn = {
        id: `${id}-t1a`,
        turn: 1,
        role: "agent",
        ts: meta.startedAt,
        content: "Working on it…",
        pending: true,
      };
      return { user, agent: placeholder };
    }
    return { user, agent: null };
  }

  const agentContent = extractAgentTurnContent(transcript, prompt);
  const agent: ConversationTurn = {
    id: `${id}-t1a`,
    turn: 1,
    role: "agent",
    ts: meta.completedAt || meta.startedAt,
    content: agentContent,
    exitCode: meta.exitCode,
    artifacts: meta.artifactPaths,
    awaitingInput: meta.awaitingInput,
    // Pending when the conversation hasn't finalized yet AND turn 1 is the
    // only turn. Once later turns exist, turn 1 agent is historical.
    pending:
      meta.status === "running" && !meta.completedAt ? true : undefined,
  };

  return { user, agent };
}

async function readAdditionalTurns(
  id: string,
  cabinetPath?: string
): Promise<ConversationTurn[]> {
  const dir = turnsDirFs(conversationDir(id, cabinetPath));
  if (!(await fileExists(dir))) return [];

  const entries = await listDirectory(dir);
  const turnFiles = entries
    .filter((e) => !e.isDirectory && e.name.endsWith(".md"))
    .map((e) => ({ ...parseTurnFilename(e.name), name: e.name }))
    .filter((e): e is { turn: number; role: TurnRole; name: string } => !!e.turn)
    .sort((a, b) => a.turn - b.turn || (a.role === "user" ? -1 : 1));

  return Promise.all(
    turnFiles.map(async (entry) => {
      const raw = await readFileContent(path.join(dir, entry.name));
      return deserializeTurn(raw, { turn: entry.turn, role: entry.role });
    })
  );
}

/**
 * Read the full turn list for a conversation.
 * Turn 1 is synthesized from prompt.md + transcript.txt.
 * Turns 2+ come from the turns/ directory.
 */
export async function readConversationTurns(
  id: string,
  cabinetPath?: string
): Promise<ConversationTurn[]> {
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) return [];
  const cp = meta.cabinetPath || cabinetPath;

  const { user, agent } = await readTurnOne(id, meta, cp);
  const extras = await readAdditionalTurns(id, cp);

  const turns: ConversationTurn[] = [user];
  if (agent) {
    // If later turns exist, turn 1 is by definition historical (not pending)
    // regardless of current conversation status.
    if (extras.length > 0 && agent.pending) {
      agent.pending = undefined;
    }
    turns.push(agent);
  }
  turns.push(...extras);
  return turns;
}

export async function readSession(
  id: string,
  cabinetPath?: string
): Promise<SessionHandle | null> {
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) return null;
  const cp = meta.cabinetPath || cabinetPath;
  const filePath = sessionFsPath(conversationDir(id, cp));
  if (!(await fileExists(filePath))) return null;
  try {
    return JSON.parse(await readFileContent(filePath)) as SessionHandle;
  } catch {
    return null;
  }
}

export async function writeSession(
  id: string,
  handle: SessionHandle,
  cabinetPath?: string
): Promise<void> {
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) return;
  const cp = meta.cabinetPath || cabinetPath;
  const dir = conversationDir(id, cp);
  await ensureDirectory(dir);
  await writeFileContent(sessionFsPath(dir), JSON.stringify(handle, null, 2));
}

// In-memory per-conversation seq counter. Initialized from the existing
// events.log line count on first use so restarts pick up where they left off.
const eventSeqByConversation = new Map<string, number>();

async function nextEventSeq(
  id: string,
  dirPath: string
): Promise<number> {
  const cached = eventSeqByConversation.get(id);
  if (typeof cached === "number") {
    const next = cached + 1;
    eventSeqByConversation.set(id, next);
    return next;
  }
  // Cold start: count existing lines in events.log.
  const logPath = eventsLogFsPath(dirPath);
  let initial = 0;
  try {
    const raw = await readFileContent(logPath);
    initial = raw.split("\n").filter((line) => line.trim().length > 0).length;
  } catch {
    initial = 0;
  }
  const next = initial + 1;
  eventSeqByConversation.set(id, next);
  return next;
}

export async function appendEventLog(
  id: string,
  event: Record<string, unknown>,
  cabinetPath?: string
): Promise<number | null> {
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) return null;
  const cp = meta.cabinetPath || cabinetPath;
  const dir = conversationDir(id, cp);
  await ensureDirectory(dir);
  const seq = await nextEventSeq(id, dir);
  const payload = JSON.stringify({
    seq,
    ts: new Date().toISOString(),
    ...event,
  });
  await fs.appendFile(eventsLogFsPath(dir), `${payload}\n`, "utf-8");
  return seq;
}

/**
 * Read the events.log for a conversation, optionally filtered to events with
 * `seq > fromSeq` (for SSE reconnect replay). Returns [] if the log is
 * missing or unparseable.
 */
export async function readEventLog(
  id: string,
  options: { cabinetPath?: string; fromSeq?: number } = {}
): Promise<Array<Record<string, unknown>>> {
  const meta = await readConversationMeta(id, options.cabinetPath);
  if (!meta) return [];
  const cp = meta.cabinetPath || options.cabinetPath;
  const dir = conversationDir(id, cp);
  const logPath = eventsLogFsPath(dir);
  if (!(await fileExists(logPath))) return [];
  try {
    const raw = await readFileContent(logPath);
    const events = raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((e): e is Record<string, unknown> => !!e);
    if (typeof options.fromSeq === "number") {
      return events.filter((e) => {
        const seq = e.seq;
        return typeof seq === "number" && seq > options.fromSeq!;
      });
    }
    return events;
  } catch {
    return [];
  }
}

function aggregateTokens(turns: ConversationTurn[]): ConversationTokens {
  let input = 0;
  let output = 0;
  let cache = 0;
  for (const turn of turns) {
    if (!turn.tokens) continue;
    input += turn.tokens.input;
    output += turn.tokens.output;
    cache += turn.tokens.cache ?? 0;
  }
  return { input, output, cache, total: input + output };
}

async function nextTurnNumber(id: string, cabinetPath?: string): Promise<number> {
  const turns = await readConversationTurns(id, cabinetPath);
  const last = turns[turns.length - 1]?.turn ?? 1;
  // If last is turn 1 (from prompt+transcript), the next new turn is 2.
  // If last is an extras turn with role "user", the next is same number + 1
  // once the agent replies — but append-user-then-agent sequence means we
  // consistently increment when the same role slot is already taken.
  // Simpler: always look at the highest turn number and add 1 only when
  // both roles for that turn exist.
  const lastTurn = turns[turns.length - 1];
  if (!lastTurn) return 1;
  if (lastTurn.turn === last && lastTurn.role === "user") {
    // Agent hasn't replied for `last` yet — return same number so appendAgent
    // can write NNN-agent.md
    return last;
  }
  return last + 1;
}

async function writeTurnFile(
  id: string,
  cabinetPath: string | undefined,
  turn: ConversationTurn
): Promise<void> {
  const dir = conversationDir(id, cabinetPath);
  const turnsPath = turnsDirFs(dir);
  await ensureDirectory(turnsPath);
  await writeFileContent(turnFileFs(dir, turn.turn, turn.role), serializeTurn(turn));
}

function mergeArtifactPaths(
  existing: string[],
  incoming: string[] | undefined
): string[] {
  if (!incoming || incoming.length === 0) return existing;
  const seen = new Set(existing);
  const merged = [...existing];
  for (const p of incoming) {
    if (!seen.has(p)) {
      merged.push(p);
      seen.add(p);
    }
  }
  return merged;
}

/**
 * Append a user turn. Returns the created turn.
 * If the conversation is still on turn 1 (no extras yet), writes turn 2.
 */
export async function appendUserTurn(
  id: string,
  input: AppendUserTurnInput,
  cabinetPath?: string
): Promise<ConversationTurn | null> {
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) return null;
  const cp = meta.cabinetPath || cabinetPath;

  const turnNumber = await nextTurnNumber(id, cp);
  const ts = input.ts || new Date().toISOString();

  const turn: ConversationTurn = {
    id: shortId(),
    turn: turnNumber,
    role: "user",
    ts,
    content: input.content,
    mentionedPaths: input.mentionedPaths,
    attachmentPaths:
      input.attachmentPaths && input.attachmentPaths.length > 0
        ? input.attachmentPaths
        : undefined,
  };

  await writeTurnFile(id, cp, turn);

  // Update meta: bump turnCount, lastActivityAt, status back to running
  const allTurns = await readConversationTurns(id, cp);
  const updatedMeta: ConversationMeta = {
    ...meta,
    turnCount: Math.max(allTurns.length / 2 | 0, 1),
    lastActivityAt: ts,
    status: "running",
    awaitingInput: false,
    // User sending a new turn reopens a done or archived task.
    doneAt: undefined,
    archivedAt: undefined,
    mentionedPaths: mergeArtifactPaths(meta.mentionedPaths, input.mentionedPaths),
  };
  await writeConversationMeta(updatedMeta);

  const seq = await appendEventLog(
    id,
    { type: "turn.appended", turn: turnNumber, role: "user" },
    cp
  );
  publishConversationEvent({
    type: "turn.appended",
    taskId: id,
    cabinetPath: cp,
    seq: seq ?? undefined,
    payload: { turn: turnNumber, role: "user" },
  });

  return turn;
}

/**
 * Strip the trailing ```cabinet``` block from an agent turn's display
 * content — the metadata is already surfaced via frontmatter (artifacts,
 * tokens, sessionId) and meta.summary / contextSummary / artifactPaths,
 * so we don't want to show the block again in the rendered bubble.
 */
function stripCabinetTrailer(content: string): string {
  return content
    .replace(/```cabinet[\s\S]*?```/gi, "")
    .replace(/<ask_user>([\s\S]*?)<\/ask_user>/gi, (_, inner: string) =>
      inner.trim()
    )
    .trim();
}

/**
 * Append an agent turn. Merges parsed cabinet-block artifacts into meta.
 * Returns the created turn.
 */
export async function appendAgentTurn(
  id: string,
  input: AppendAgentTurnInput,
  cabinetPath?: string
): Promise<ConversationTurn | null> {
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) return null;
  const cp = meta.cabinetPath || cabinetPath;

  const turnNumber = await nextTurnNumber(id, cp);
  const ts = input.ts || new Date().toISOString();

  // Parse cabinet block on the agent output (unless pending placeholder).
  const parsed = input.pending
    ? { summary: undefined, contextSummary: undefined, artifactPaths: [] }
    : parseCabinetBlock(input.content);

  const displayContent = input.pending
    ? input.content
    : stripCabinetTrailer(input.content) || input.content;

  const turn: ConversationTurn = {
    id: shortId(),
    turn: turnNumber,
    role: "agent",
    ts,
    content: displayContent,
    sessionId: input.sessionId,
    tokens: input.tokens,
    awaitingInput: input.awaitingInput,
    pending: input.pending,
    exitCode: input.exitCode,
    error: input.error,
    artifacts: input.artifacts ?? parsed.artifactPaths,
  };

  await writeTurnFile(id, cp, turn);

  const allTurns = await readConversationTurns(id, cp);
  const tokens = aggregateTokens(allTurns);
  const failed =
    (typeof input.exitCode === "number" && input.exitCode !== 0) || !!input.error;

  const updatedMeta: ConversationMeta = {
    ...meta,
    turnCount: Math.max(Math.ceil(allTurns.length / 2), 1),
    lastActivityAt: ts,
    tokens,
    awaitingInput: input.awaitingInput ? true : false,
    artifactPaths: mergeArtifactPaths(meta.artifactPaths, turn.artifacts),
    // Rolling summary/context: only update when we got a fresh SUMMARY and
    // the user hasn't recently hand-edited.
    summary: (() => {
      if (!parsed.summary) return meta.summary;
      const editedAt = meta.summaryEditedAt
        ? new Date(meta.summaryEditedAt).getTime()
        : 0;
      const recent = Date.now() - editedAt < 5 * 60 * 1000;
      return recent ? meta.summary : parsed.summary;
    })(),
    contextSummary: parsed.contextSummary || meta.contextSummary,
    status: input.pending
      ? "running"
      : failed
        ? "failed"
        : "completed",
    exitCode: input.pending ? meta.exitCode : (input.exitCode ?? meta.exitCode ?? null),
  };
  await writeConversationMeta(updatedMeta);
  if (!input.pending && turn.artifacts?.length) {
    await sanitizeArtifactCabinetBlocks(turn.artifacts);
  }

  const seq = await appendEventLog(
    id,
    { type: "turn.appended", turn: turnNumber, role: "agent", pending: !!input.pending },
    cp
  );
  publishConversationEvent({
    type: "turn.appended",
    taskId: id,
    cabinetPath: cp,
    seq: seq ?? undefined,
    payload: { turn: turnNumber, role: "agent", pending: !!input.pending },
  });

  return turn;
}

/**
 * Update an existing agent turn in place (used to settle a pending turn).
 */
export async function updateAgentTurn(
  id: string,
  turnNumber: number,
  patch: UpdateAgentTurnInput,
  cabinetPath?: string
): Promise<ConversationTurn | null> {
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) return null;
  const cp = meta.cabinetPath || cabinetPath;
  const dir = conversationDir(id, cp);
  const filePath = turnFileFs(dir, turnNumber, "agent");
  if (!(await fileExists(filePath))) return null;

  const existing = deserializeTurn(await readFileContent(filePath), {
    turn: turnNumber,
    role: "agent",
  });

  const rawContent = patch.content ?? existing.content;
  const parsed = patch.pending
    ? { summary: undefined, contextSummary: undefined, artifactPaths: [] }
    : parseCabinetBlock(rawContent);
  const content = patch.pending
    ? rawContent
    : stripCabinetTrailer(rawContent) || rawContent;

  const nextTurn: ConversationTurn = {
    ...existing,
    content,
    sessionId: patch.sessionId ?? existing.sessionId,
    tokens: patch.tokens ?? existing.tokens,
    awaitingInput: patch.awaitingInput ?? existing.awaitingInput,
    pending: patch.pending,
    exitCode: patch.exitCode ?? existing.exitCode,
    error: patch.error ?? existing.error,
    artifacts: patch.artifacts ?? parsed.artifactPaths ?? existing.artifacts,
  };

  await writeTurnFile(id, cp, nextTurn);

  const allTurns = await readConversationTurns(id, cp);
  const tokens = aggregateTokens(allTurns);
  const failed =
    (typeof nextTurn.exitCode === "number" && nextTurn.exitCode !== 0) ||
    !!nextTurn.error;

  const updatedMeta: ConversationMeta = {
    ...meta,
    lastActivityAt: new Date().toISOString(),
    tokens,
    awaitingInput: nextTurn.awaitingInput ? true : false,
    artifactPaths: mergeArtifactPaths(meta.artifactPaths, nextTurn.artifacts),
    summary: (() => {
      if (!parsed.summary) return meta.summary;
      const editedAt = meta.summaryEditedAt
        ? new Date(meta.summaryEditedAt).getTime()
        : 0;
      const recent = Date.now() - editedAt < 5 * 60 * 1000;
      return recent ? meta.summary : parsed.summary;
    })(),
    contextSummary: parsed.contextSummary || meta.contextSummary,
    status: nextTurn.pending
      ? "running"
      : failed
        ? "failed"
        : "completed",
    exitCode: nextTurn.pending
      ? meta.exitCode
      : nextTurn.exitCode ?? meta.exitCode ?? null,
  };
  await writeConversationMeta(updatedMeta);
  if (!nextTurn.pending && nextTurn.artifacts?.length) {
    await sanitizeArtifactCabinetBlocks(nextTurn.artifacts);
  }

  const seq = await appendEventLog(
    id,
    { type: "turn.updated", turn: turnNumber, role: "agent" },
    cp
  );
  publishConversationEvent({
    type: "turn.updated",
    taskId: id,
    cabinetPath: cp,
    seq: seq ?? undefined,
    payload: { turn: turnNumber, role: "agent" },
  });

  return nextTurn;
}

// ── Agent action proposals ────────────────────────────────────────────────
//
// When an agent finishes a turn, parse any LAUNCH_TASK / SCHEDULE_JOB /
// SCHEDULE_TASK markers it emitted and attach them to the ConversationMeta as
// a pending approval queue. No dispatch happens here — the human reviews and
// approves via the PendingActionsPanel in the UI.

function makePendingId(): string {
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function proposePendingActions(
  meta: ConversationMeta,
  cleanedOutput: string,
  prompt: string
): Promise<PendingAction[]> {
  const { actions } = parseAgentActions(cleanedOutput, prompt);
  if (actions.length === 0) return [];

  const dispatcher = meta.agentSlug
    ? await readPersona(meta.agentSlug, meta.cabinetPath).catch(() => null)
    : null;

  const personas = await listPersonas(meta.cabinetPath).catch(() => [] as AgentPersona[]);
  const lookup = new Map<string, AgentPersona>();
  for (const p of personas) {
    lookup.set(p.slug, p);
    if (p.displayName) lookup.set(p.displayName, p);
  }

  // Walk lineage up to 3 levels for cycle detection — we can't recurse across
  // cabinets here cheaply, so we only walk within this cabinet. Good enough.
  const ancestors: string[] = [];
  let cursor: ConversationMeta | null = meta;
  for (let i = 0; i < 3 && cursor; i++) {
    if (cursor.agentSlug) ancestors.push(cursor.agentSlug);
    if (!cursor.parentTaskId) break;
    cursor = await readConversationMeta(cursor.parentTaskId, cursor.cabinetPath).catch(
      () => null
    );
  }

  const now = new Date().toISOString();
  const out: PendingAction[] = [];
  for (const action of actions) {
    const warnings = computeWarnings(meta, dispatcher, action, lookup, ancestors);
    out.push({
      id: makePendingId(),
      action,
      warnings,
      createdAt: now,
    });
  }
  // Silence unused-import warning on personaCanDispatch — exported for reuse.
  void personaCanDispatch;
  return out;
}

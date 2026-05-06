import fs from "node:fs/promises";
import path from "path";
import { ensureDirectory } from "@/lib/storage/fs-operations";
import { CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";
import type {
  OptaleSlackAgentPolicy,
  OptaleSlackAgentPolicyPayload,
  OptaleSlackResponseMode,
} from "./slack-agent-policy-shared";

type PolicyOptions = {
  rootDir?: string;
  now?: Date;
};

type PolicyInput = Partial<{
  enabled: unknown;
  responseMode: unknown;
  context: unknown;
  tools: unknown;
  memory: unknown;
}>;

const DEFAULT_POLICY: OptaleSlackAgentPolicy = {
  version: 1,
  enabled: true,
  responseMode: "reply",
  context: {
    currentThread: true,
    linkedThreads: true,
    timeReferences: true,
    maxThreadMessages: 20,
    maxReferencedThreads: 3,
  },
  tools: {
    postReplies: true,
    inspectThreads: true,
    runCommand: false,
    readObjects: true,
    useAgents: false,
    promoteBrain: false,
  },
  memory: {
    personalBrain: false,
    companyBrain: true,
    clientBrain: false,
  },
  updatedAt: new Date(0).toISOString(),
};

function policyRoot(options: PolicyOptions = {}): string {
  return (
    options.rootDir ||
    process.env.OPTALE_SLACK_AGENT_POLICY_ROOT?.trim() ||
    CABINET_INTERNAL_DIR
  );
}

function policyPath(options: PolicyOptions = {}): string {
  return path.join(policyRoot(options), "optale-console", "slack-agent-policy.json");
}

function timestamp(options: PolicyOptions = {}): string {
  return (options.now || new Date()).toISOString();
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function responseMode(value: unknown, fallback: OptaleSlackResponseMode): OptaleSlackResponseMode {
  return value === "observe" || value === "reply" ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeOptaleSlackAgentPolicy(
  input: unknown,
  fallback: OptaleSlackAgentPolicy = DEFAULT_POLICY,
): OptaleSlackAgentPolicy {
  const raw = record(input);
  const context = record(raw.context);
  const tools = record(raw.tools);
  const memory = record(raw.memory);

  return {
    version: 1,
    enabled: booleanValue(raw.enabled, fallback.enabled),
    responseMode: responseMode(raw.responseMode, fallback.responseMode),
    context: {
      currentThread: booleanValue(
        context.currentThread,
        fallback.context.currentThread,
      ),
      linkedThreads: booleanValue(
        context.linkedThreads,
        fallback.context.linkedThreads,
      ),
      timeReferences: booleanValue(
        context.timeReferences,
        fallback.context.timeReferences,
      ),
      maxThreadMessages: numberValue(
        context.maxThreadMessages,
        fallback.context.maxThreadMessages,
        1,
        20,
      ),
      maxReferencedThreads: numberValue(
        context.maxReferencedThreads,
        fallback.context.maxReferencedThreads,
        0,
        5,
      ),
    },
    tools: {
      postReplies: booleanValue(tools.postReplies, fallback.tools.postReplies),
      inspectThreads: booleanValue(
        tools.inspectThreads,
        fallback.tools.inspectThreads,
      ),
      runCommand: booleanValue(tools.runCommand, fallback.tools.runCommand),
      readObjects: booleanValue(tools.readObjects, fallback.tools.readObjects),
      useAgents: booleanValue(tools.useAgents, fallback.tools.useAgents),
      promoteBrain: booleanValue(
        tools.promoteBrain,
        fallback.tools.promoteBrain,
      ),
    },
    memory: {
      personalBrain: booleanValue(
        memory.personalBrain,
        fallback.memory.personalBrain,
      ),
      companyBrain: booleanValue(
        memory.companyBrain,
        fallback.memory.companyBrain,
      ),
      clientBrain: booleanValue(memory.clientBrain, fallback.memory.clientBrain),
    },
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt.trim()
        ? raw.updatedAt.trim()
        : fallback.updatedAt,
  };
}

export async function readOptaleSlackAgentPolicy(
  options: PolicyOptions = {},
): Promise<OptaleSlackAgentPolicy> {
  try {
    const raw = await fs.readFile(policyPath(options), "utf8");
    return normalizeOptaleSlackAgentPolicy(JSON.parse(raw));
  } catch {
    return {
      ...DEFAULT_POLICY,
      updatedAt: timestamp(options),
    };
  }
}

export async function writeOptaleSlackAgentPolicy(
  input: PolicyInput,
  options: PolicyOptions = {},
): Promise<OptaleSlackAgentPolicy> {
  const current = await readOptaleSlackAgentPolicy(options);
  const next = normalizeOptaleSlackAgentPolicy(
    {
      ...current,
      ...input,
      context: { ...current.context, ...record(input.context) },
      tools: { ...current.tools, ...record(input.tools) },
      memory: { ...current.memory, ...record(input.memory) },
      updatedAt: timestamp(options),
    },
    current,
  );
  const filePath = policyPath(options);
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function buildOptaleSlackAgentPolicyPayload(input: {
  canManage: boolean;
  now?: Date;
}): Promise<OptaleSlackAgentPolicyPayload> {
  return {
    generatedAt: (input.now || new Date()).toISOString(),
    policy: await readOptaleSlackAgentPolicy({ now: input.now }),
    canManage: input.canManage,
  };
}

export function optaleSlackPolicyServiceToken(): string {
  return (
    process.env.OPTALE_CONSOLE_POLICY_API_KEY?.trim() ||
    process.env.OPTALE_AGENT_HARNESS_API_KEY?.trim() ||
    ""
  );
}

export function isValidOptaleSlackPolicyServiceRequest(headers: Headers): boolean {
  const token = optaleSlackPolicyServiceToken();
  if (!token) return false;

  const authorization = headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const harnessKey = headers.get("x-harness-api-key")?.trim();
  return bearer === token || harnessKey === token;
}

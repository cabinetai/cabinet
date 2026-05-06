import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import { CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";
import { ensureDirectory, fileExists, readFileContent } from "@/lib/storage/fs-operations";
import type { OptaleIdentitySnapshot } from "@/lib/optale/identity-shared";

export type OptaleBrainFixtureAction = "fixture_seeded" | "fixture_removed";
export type OptaleBrainFixtureStatus = "present" | "absent" | "dirty";

export interface OptaleBrainFixtureActor {
  subject: string;
  email: string | null;
  name: string | null;
  role: string;
  provider: string;
  source: string;
}

export interface OptaleBrainFixtureFile {
  path: string;
  sha256: string;
  size: number;
  expected: boolean;
  matchesExpected: boolean;
}

export interface OptaleBrainFixtureState {
  version: 1;
  generatedAt: string;
  fixture: {
    id: string;
    name: string;
    cabinetPath: ".";
    sourcePath: string;
    synthetic: true;
  };
  status: OptaleBrainFixtureStatus;
  manifest: {
    present: boolean;
    path: string;
    sha256?: string;
    matchesExpected: boolean;
  };
  files: OptaleBrainFixtureFile[];
  counts: {
    expectedFiles: number;
    presentFiles: number;
    matchingFiles: number;
    unexpectedFiles: number;
  };
  safety: {
    removable: boolean;
    reason: string;
    semanticDatasetTouched: false;
    realDataIncluded: false;
  };
}

export interface OptaleBrainFixtureRecord {
  id: string;
  version: 1;
  action: OptaleBrainFixtureAction;
  status: OptaleBrainFixtureStatus;
  createdAt: string;
  actor: OptaleBrainFixtureActor;
  fixture: OptaleBrainFixtureState["fixture"];
  before: OptaleBrainFixtureState;
  after: OptaleBrainFixtureState;
  result: {
    filesWritten: number;
    filesRemoved: number;
    semanticDatasetTouched: false;
    realDataIncluded: false;
  };
}

export interface OptaleBrainFixtureLifecyclePayload {
  version: 1;
  generatedAt: string;
  state: OptaleBrainFixtureState;
  records: OptaleBrainFixtureRecord[];
  counts: {
    records: number;
  };
}

const DEFAULT_FIXTURE_LOG_ROOT = path.join(CABINET_INTERNAL_DIR, "optale-console");
const FIXTURE_LOG_FILE = "brain-fixtures.jsonl";
const FIXTURE_ID = "company-brain-canary-2026-05-05";
const FIXTURE_SOURCE_PATH = "company-brain/canary/2026-05-05";
const FIXTURE_MANIFEST_DOCUMENTS = [
  "optale-console-canary.md",
  "brain-isolation-canary.md",
  "slack-agent-canary.md",
];

const FIXTURE_DOCUMENTS: readonly { name: string; content: string }[] = [
  {
    name: "brain-isolation-canary.md",
    content: [
      "title: Brain Isolation Canary",
      "",
      "# Brain Isolation Canary",
      "",
      "This canary verifies that company Brain material is separate from personal Brain",
      "material before any private admin ingestion is attempted.",
      "",
      "Expected isolation:",
      "",
      "- Company memory namespace: company:optale",
      "- Thor personal memory namespace: personal:thor",
      "- Shared company Brain target: optale-company",
      "- Private-to-company automatic writes: disabled",
      "",
    ].join("\n"),
  },
  {
    name: "slack-agent-canary.md",
    content: [
      "title: Slack Agent Canary",
      "",
      "# Slack Agent Canary",
      "",
      "This is a synthetic shared-company reference for the Slack agent policy smoke.",
      "",
      "The Slack agent should use admin-controlled policy, scoped context, and governed",
      "tool access. This document contains no private user vault, ORM, memory, graph,",
      "or client material.",
      "",
    ].join("\n"),
  },
  {
    name: "optale-console-canary.md",
    content: [
      "title: Optale Console Canary",
      "",
      "# Optale Console Canary",
      "",
      "This is a synthetic company Brain canary document for Azure staging.",
      "",
      "It confirms that Optale Console can surface company-scoped knowledge from the",
      "Azure Files mounted vault without using Thor personal sources.",
      "",
      "Canary scope: company-only.",
      "Canary namespace: company:optale.",
      "Created: 2026-05-05.",
      "",
    ].join("\n"),
  },
];

function fixtureManifestContent(): string {
  return `${JSON.stringify(
    {
      version: 1,
      createdAt: "2026-05-05T16:55:00Z",
      purpose: "company-brain-canary",
      target: {
        environment: "azure-internal-dev",
        containerApp: "optale-command-web-staging",
        cabinetPath: ROOT_CABINET_PATH,
        scope: "company",
        memoryNamespace: "company:optale",
        companyBrainTargetId: "optale-company",
      },
      boundaries: {
        privateSourcesIncluded: false,
        thorPersonalSourcesIncluded: false,
        ormSourcesIncluded: false,
        graphSourcesIncluded: false,
        semanticCogneeIngestion: false,
        azureFilesMountedVaultCanary: true,
      },
      documents: FIXTURE_MANIFEST_DOCUMENTS,
    },
    null,
    2,
  )}\n`;
}

function expectedFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const document of FIXTURE_DOCUMENTS) {
    files.set(document.name, document.content);
  }
  files.set("manifest.json", fixtureManifestContent());
  return files;
}

function fixtureLogRoot(): string {
  return process.env.OPTALE_BRAIN_FIXTURE_AUDIT_ROOT || DEFAULT_FIXTURE_LOG_ROOT;
}

function fixtureLogPath(): string {
  return path.join(fixtureLogRoot(), FIXTURE_LOG_FILE);
}

function randomId(): string {
  const id = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `brain_fixture_${id}`;
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function actorSnapshot(identity: OptaleIdentitySnapshot): OptaleBrainFixtureActor {
  return {
    subject: identity.subject || identity.email || "unknown",
    email: identity.email,
    name: identity.name,
    role: identity.role,
    provider: identity.provider,
    source: identity.source,
  };
}

function fixtureRoot(): string {
  const cabinetDir = resolveCabinetDir(ROOT_CABINET_PATH);
  const root = path.resolve(cabinetDir, FIXTURE_SOURCE_PATH);
  const relative = path.relative(cabinetDir, root);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Brain fixture source path escapes the root cabinet.");
  }
  return root;
}

function virtualPath(name: string): string {
  return `${FIXTURE_SOURCE_PATH}/${name}`.replace(/\/+/g, "/");
}

function fixtureDescriptor(): OptaleBrainFixtureState["fixture"] {
  return {
    id: FIXTURE_ID,
    name: "Company Brain Canary",
    cabinetPath: ROOT_CABINET_PATH,
    sourcePath: FIXTURE_SOURCE_PATH,
    synthetic: true,
  };
}

async function listFixtureFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFixtureFiles(fullPath);
      files.push(...nested.map((file) => `${entry.name}/${file}`));
    } else if (entry.isFile()) {
      files.push(entry.name);
    }
  }
  return files.sort();
}

export async function readOptaleBrainFixtureState(): Promise<OptaleBrainFixtureState> {
  const root = fixtureRoot();
  const expected = expectedFiles();
  const names = new Set([...expected.keys(), ...(await listFixtureFiles(root))]);
  const files: OptaleBrainFixtureFile[] = [];

  for (const name of Array.from(names).sort()) {
    const fullPath = path.join(root, name);
    const expectedContent = expected.get(name);
    const content = await fs.readFile(fullPath).catch(() => null);
    if (!content) continue;

    files.push({
      path: virtualPath(name),
      sha256: sha256(content),
      size: content.length,
      expected: expected.has(name),
      matchesExpected: expectedContent ? sha256(content) === sha256(expectedContent) : false,
    });
  }

  const presentFiles = files.length;
  const matchingFiles = files.filter((file) => file.expected && file.matchesExpected).length;
  const unexpectedFiles = files.filter((file) => !file.expected).length;
  const expectedFileCount = expected.size;
  const hasDirtyExpected = files.some((file) => file.expected && !file.matchesExpected);
  const allExpectedPresent = matchingFiles === expectedFileCount;
  const manifestFile = files.find((file) => file.path.endsWith("/manifest.json"));
  const status: OptaleBrainFixtureStatus =
    presentFiles === 0
      ? "absent"
      : allExpectedPresent && unexpectedFiles === 0
        ? "present"
        : "dirty";
  const removable = presentFiles > 0 && unexpectedFiles === 0 && !hasDirtyExpected;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    fixture: fixtureDescriptor(),
    status,
    manifest: {
      present: Boolean(manifestFile),
      path: virtualPath("manifest.json"),
      sha256: manifestFile?.sha256,
      matchesExpected: Boolean(manifestFile?.matchesExpected),
    },
    files,
    counts: {
      expectedFiles: expectedFileCount,
      presentFiles,
      matchingFiles,
      unexpectedFiles,
    },
    safety: {
      removable,
      reason: removable
        ? "Only known synthetic fixture files are present."
        : presentFiles === 0
          ? "Fixture files are absent."
          : "Fixture folder contains unknown or modified files.",
      semanticDatasetTouched: false,
      realDataIncluded: false,
    },
  };
}

function parseRecord(line: string): OptaleBrainFixtureRecord | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Partial<OptaleBrainFixtureRecord>;
    if (
      typeof record.id !== "string" ||
      record.version !== 1 ||
      (record.action !== "fixture_seeded" && record.action !== "fixture_removed")
    ) {
      return null;
    }
    return record as OptaleBrainFixtureRecord;
  } catch {
    return null;
  }
}

async function readFixtureRecords(): Promise<OptaleBrainFixtureRecord[]> {
  const logPath = fixtureLogPath();
  const content = (await fileExists(logPath)) ? await readFileContent(logPath) : "";
  return content
    .split(/\r?\n/)
    .map(parseRecord)
    .filter((record): record is OptaleBrainFixtureRecord => Boolean(record))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

async function appendRecord(record: OptaleBrainFixtureRecord): Promise<OptaleBrainFixtureRecord> {
  await ensureDirectory(fixtureLogRoot());
  await fs.appendFile(fixtureLogPath(), `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

export async function readOptaleBrainFixtureLifecycle(input: {
  limit?: number | null;
} = {}): Promise<OptaleBrainFixtureLifecyclePayload> {
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit || 25)));
  const records = await readFixtureRecords();
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    state: await readOptaleBrainFixtureState(),
    records: records.slice(0, limit),
    counts: {
      records: records.length,
    },
  };
}

function assertCleanForWrite(state: OptaleBrainFixtureState): void {
  if (state.counts.unexpectedFiles > 0) {
    throw new Error("Brain fixture folder contains unexpected files; refusing to modify it.");
  }
  if (state.files.some((file) => file.expected && !file.matchesExpected)) {
    throw new Error("Brain fixture folder contains modified expected files; refusing to overwrite.");
  }
}

export async function seedOptaleBrainCompanyFixture(input: {
  actor: OptaleIdentitySnapshot;
}): Promise<OptaleBrainFixtureRecord> {
  const before = await readOptaleBrainFixtureState();
  assertCleanForWrite(before);

  const root = fixtureRoot();
  const expected = expectedFiles();
  await ensureDirectory(root);
  let filesWritten = 0;

  for (const [name, content] of expected) {
    const fullPath = path.join(root, name);
    const existing = await fs.readFile(fullPath).catch(() => null);
    if (existing && sha256(existing) === sha256(content)) continue;
    await ensureDirectory(path.dirname(fullPath));
    await fs.writeFile(fullPath, content, "utf8");
    filesWritten += 1;
  }

  const after = await readOptaleBrainFixtureState();
  return appendRecord({
    id: randomId(),
    version: 1,
    action: "fixture_seeded",
    status: after.status,
    createdAt: new Date().toISOString(),
    actor: actorSnapshot(input.actor),
    fixture: after.fixture,
    before,
    after,
    result: {
      filesWritten,
      filesRemoved: 0,
      semanticDatasetTouched: false,
      realDataIncluded: false,
    },
  });
}

export async function removeOptaleBrainCompanyFixture(input: {
  actor: OptaleIdentitySnapshot;
}): Promise<OptaleBrainFixtureRecord> {
  const before = await readOptaleBrainFixtureState();
  if (before.counts.presentFiles > 0) assertCleanForWrite(before);

  const root = fixtureRoot();
  let filesRemoved = 0;
  for (const name of expectedFiles().keys()) {
    const fullPath = path.join(root, name);
    if (!(await fileExists(fullPath))) continue;
    await fs.rm(fullPath, { force: true });
    filesRemoved += 1;
  }
  await pruneEmptyFixtureDirs(root);

  const after = await readOptaleBrainFixtureState();
  return appendRecord({
    id: randomId(),
    version: 1,
    action: "fixture_removed",
    status: after.status,
    createdAt: new Date().toISOString(),
    actor: actorSnapshot(input.actor),
    fixture: before.fixture,
    before,
    after,
    result: {
      filesWritten: 0,
      filesRemoved,
      semanticDatasetTouched: false,
      realDataIncluded: false,
    },
  });
}

async function pruneEmptyFixtureDirs(root: string): Promise<void> {
  const cabinetDir = resolveCabinetDir(ROOT_CABINET_PATH);
  let current = root;
  while (current.startsWith(cabinetDir) && current !== cabinetDir) {
    const entries = await fs.readdir(current).catch(() => null);
    if (!entries || entries.length > 0) return;
    await fs.rmdir(current).catch(() => undefined);
    current = path.dirname(current);
  }
}

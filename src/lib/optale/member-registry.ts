import fs from "node:fs/promises";
import path from "path";
import { ensureDirectory } from "@/lib/storage/fs-operations";
import { CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";
import {
  normalizeOptaleConsoleRole,
  type OptaleConsoleRole,
  type OptaleIdentitySnapshot,
} from "./identity-shared";

export type OptaleStoredConsoleMember = {
  id: string;
  principal: string;
  email: string | null;
  role: OptaleConsoleRole;
  source: string;
  groups: string[];
  state: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
};

type MemberRegistryDocument = {
  version: 1;
  members: OptaleStoredConsoleMember[];
};

type RegistryOptions = {
  rootDir?: string;
  now?: Date;
};

const MEMBER_ID_FALLBACK = "local-operator";

function registryRoot(options: RegistryOptions = {}): string {
  return (
    options.rootDir ||
    process.env.OPTALE_CONSOLE_MEMBER_REGISTRY_ROOT?.trim() ||
    CABINET_INTERNAL_DIR
  );
}

function registryPath(options: RegistryOptions = {}): string {
  return path.join(registryRoot(options), "optale-console", "members.json");
}

function timestamp(options: RegistryOptions = {}): string {
  return (options.now || new Date()).toISOString();
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || MEMBER_ID_FALLBACK;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter(
          (entry): entry is string =>
            typeof entry === "string" && entry.trim() !== "",
        )
        .map((entry) => entry.trim()),
    ),
  );
}

function trimString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStoredMember(raw: unknown): OptaleStoredConsoleMember | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = trimString(record.id);
  const principal = trimString(record.principal) || trimString(record.name);
  const role = normalizeOptaleConsoleRole(record.role);
  if (!id || !principal || !role) return null;

  const state = record.state === "disabled" ? "disabled" : "active";
  return {
    id,
    principal,
    email: trimString(record.email),
    role,
    source: trimString(record.source) || "manual",
    groups: stringArray(record.groups),
    state,
    createdAt:
      trimString(record.createdAt) ||
      trimString(record.updatedAt) ||
      new Date(0).toISOString(),
    updatedAt:
      trimString(record.updatedAt) ||
      trimString(record.createdAt) ||
      new Date(0).toISOString(),
  };
}

async function readDocument(
  options: RegistryOptions = {},
): Promise<MemberRegistryDocument> {
  try {
    const raw = await fs.readFile(registryPath(options), "utf8");
    const parsed = JSON.parse(raw) as { members?: unknown };
    const members = Array.isArray(parsed.members)
      ? parsed.members
          .map(normalizeStoredMember)
          .filter((member): member is OptaleStoredConsoleMember => member !== null)
      : [];
    return { version: 1, members };
  } catch {
    return { version: 1, members: [] };
  }
}

async function writeDocument(
  document: MemberRegistryDocument,
  options: RegistryOptions = {},
): Promise<void> {
  const filePath = registryPath(options);
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

export function optaleConsoleMemberIdForIdentity(
  identity: Pick<OptaleIdentitySnapshot, "subject" | "email" | "name">,
): string {
  return `human:${slug(identity.subject || identity.email || identity.name || "")}`;
}

function sourceLabel(identity: OptaleIdentitySnapshot): string {
  if (identity.provider === "authelia") return "Authelia trusted proxy";
  if (identity.provider === "better-auth") return "Better Auth";
  if (identity.provider === "cabinet-password") return "Cabinet password gate";
  if (identity.provider === "local") return "Local Console";
  return "Manual";
}

function principalForIdentity(identity: OptaleIdentitySnapshot): string {
  return (
    identity.name ||
    identity.email ||
    identity.subject ||
    "Current operator"
  );
}

function findIdentityMemberIndex(
  members: OptaleStoredConsoleMember[],
  identity: OptaleIdentitySnapshot,
): number {
  const id = optaleConsoleMemberIdForIdentity(identity);
  const email = identity.email?.trim().toLowerCase();
  const byId = members.findIndex((member) => member.id === id);
  if (byId >= 0) return byId;
  if (!email) return -1;
  return members.findIndex(
    (member) => member.email?.trim().toLowerCase() === email,
  );
}

export async function ensureOptaleConsoleIdentityMember(
  identity: OptaleIdentitySnapshot,
  options: RegistryOptions = {},
): Promise<OptaleStoredConsoleMember[]> {
  const document = await readDocument(options);
  if (!identity.authenticated) return document.members;

  const now = timestamp(options);
  const index = findIdentityMemberIndex(document.members, identity);
  const nextIdentityFields = {
    principal: principalForIdentity(identity),
    email: identity.email || null,
    source: sourceLabel(identity),
    groups: identity.groups,
  };

  if (index >= 0) {
    const current = document.members[index];
    const changed =
      current.principal !== nextIdentityFields.principal ||
      current.email !== nextIdentityFields.email ||
      current.source !== nextIdentityFields.source ||
      current.groups.join("\n") !== nextIdentityFields.groups.join("\n");

    if (changed) {
      document.members[index] = {
        ...current,
        ...nextIdentityFields,
        updatedAt: now,
      };
      await writeDocument(document, options);
    }
    return document.members;
  }

  document.members.push({
    id: optaleConsoleMemberIdForIdentity(identity),
    ...nextIdentityFields,
    role: identity.role,
    state: "active",
    createdAt: now,
    updatedAt: now,
  });
  await writeDocument(document, options);
  return document.members;
}

export async function listOptaleConsoleMembers(
  options: RegistryOptions = {},
): Promise<OptaleStoredConsoleMember[]> {
  return (await readDocument(options)).members;
}

export async function resolveRegisteredOptaleConsoleRole(
  identity: OptaleIdentitySnapshot,
  options: RegistryOptions = {},
): Promise<OptaleConsoleRole | null> {
  if (!identity.authenticated) return null;
  const members = await listOptaleConsoleMembers(options);
  const index = findIdentityMemberIndex(members, identity);
  if (index < 0) return null;
  const member = members[index];
  return member?.state === "active" ? member.role : null;
}

export async function createOptaleConsoleMember(
  input: {
    principal?: unknown;
    email?: unknown;
    role?: unknown;
    groups?: unknown;
  },
  options: RegistryOptions = {},
): Promise<OptaleStoredConsoleMember[]> {
  const principal = trimString(input.principal);
  const email = trimString(input.email);
  if (!principal && !email) {
    throw new Error("Member name or email is required.");
  }

  const role = normalizeOptaleConsoleRole(input.role) || "viewer";
  const groups = stringArray(input.groups);
  const document = await readDocument(options);
  const id = `human:${slug(email || principal || "")}`;
  const existing = document.members.find((member) => member.id === id);
  if (existing) throw new Error("Member already exists.");

  const now = timestamp(options);
  document.members.push({
    id,
    principal: principal || email || "Workspace member",
    email,
    role,
    source: "manual",
    groups,
    state: "active",
    createdAt: now,
    updatedAt: now,
  });
  await writeDocument(document, options);
  return document.members;
}

export async function updateOptaleConsoleMemberRole(
  input: {
    id?: unknown;
    role?: unknown;
  },
  options: RegistryOptions = {},
): Promise<OptaleStoredConsoleMember[]> {
  const id = trimString(input.id);
  const role = normalizeOptaleConsoleRole(input.role);
  if (!id) throw new Error("Member id is required.");
  if (!role) throw new Error("Console role is invalid.");

  const document = await readDocument(options);
  const index = document.members.findIndex((member) => member.id === id);
  if (index < 0) throw new Error("Member was not found.");

  const nextMembers = document.members.map((member, memberIndex) =>
    memberIndex === index
      ? { ...member, role, updatedAt: timestamp(options) }
      : member,
  );
  const activeAdmins = nextMembers.filter(
    (member) => member.state === "active" && member.role === "admin",
  );
  if (activeAdmins.length === 0) {
    throw new Error("At least one active Console admin must remain.");
  }

  document.members = nextMembers;
  await writeDocument(document, options);
  return document.members;
}

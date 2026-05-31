import path from "path";
import fs from "fs/promises";
import os from "os";
import { DATA_DIR } from "@/lib/storage/path-utils";

export interface UserProfile {
  name: string;
  email?: string;       // captured in onboarding; PII, stored locally
  displayName?: string;
  role?: string;
  iconKey?: string;
  color?: string;
  avatar?: string;      // "" | preset id | "custom"
  avatarExt?: string;   // png | jpg | svg, only when avatar === "custom"
}

export interface WorkspaceFields {
  workspaceName?: string;
  description?: string;
  teamSize?: string;
  homeName?: string;
}

const CONFIG_DIR = path.join(DATA_DIR, ".agents", ".config");
const USER_FILE = path.join(CONFIG_DIR, "user.json");
const WORKSPACE_FILE = path.join(CONFIG_DIR, "workspace.json");
const COMPANY_FILE = path.join(CONFIG_DIR, "company.json");

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

interface WorkspaceJsonV2 {
  version?: number;
  home?: { name?: string };
  cabinet?: { name?: string; description?: string; size?: string };
}

interface CompanyJson {
  company?: { name?: string; description?: string; teamSize?: string };
}

/**
 * Read the user profile. If user.json doesn't exist yet, seed it from
 * workspace.json (home.name → profile.name) so existing installs get a
 * usable profile on first read.
 */
export async function readUserProfile(): Promise<UserProfile> {
  const existing = await readJson<UserProfile>(USER_FILE);
  if (existing) {
    // Audit #039: legacy installs shipped with `name: "You"` baked in. Upgrade
    // those silently — re-seed from the workspace home name / OS username.
    // Anything the user explicitly typed (even "you") wins, so we treat the
    // upgrade as opt-out: only swap when name is exactly "You" (case-sensitive
    // — matches the legacy literal, not user-typed variants).
    if (existing.name === "You") {
      const seeded = await seedProfileFromOnboarding();
      const upgraded: UserProfile = { ...existing, name: seeded.name };
      await writeJson(USER_FILE, upgraded);
      return upgraded;
    }
    return existing;
  }

  const seeded = await seedProfileFromOnboarding();
  // Only persist when the name came from onboarding (the workspace home name).
  // A pure OS-username fallback (e.g. a profile read during the wizard, before
  // onboarding has written workspace.json) must stay transient — otherwise it
  // sticks and overrides the name the user actually types. (Bug: the starter
  // task showed "Hi, I'm <os-username>!" instead of the onboarding name.)
  const workspace = await readJson<WorkspaceJsonV2>(WORKSPACE_FILE);
  if (workspace?.home?.name?.trim()) {
    await writeJson(USER_FILE, seeded);
  }
  return seeded;
}

function inferOsName(): string {
  try {
    const raw = os.userInfo().username || "";
    if (!raw) return "";
    // Username may be lowercase; capitalize first letter for display.
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  } catch {
    return "";
  }
}

async function seedProfileFromOnboarding(): Promise<UserProfile> {
  const workspace = await readJson<WorkspaceJsonV2>(WORKSPACE_FILE);
  const home = workspace?.home?.name?.trim() || "";
  // "Jane's Home" → "Jane"
  const inferredName = home.replace(/['’]s Home$/i, "").trim();
  return {
    name: inferredName || inferOsName() || "",
    displayName: "",
    role: "",
    avatar: "",
  };
}

export async function writeUserProfile(
  patch: Partial<UserProfile>
): Promise<UserProfile> {
  const current = await readUserProfile();
  const next: UserProfile = { ...current, ...patch };
  await writeJson(USER_FILE, next);
  return next;
}

export async function readWorkspaceFields(): Promise<WorkspaceFields> {
  const workspace = await readJson<WorkspaceJsonV2>(WORKSPACE_FILE);
  const company = await readJson<CompanyJson>(COMPANY_FILE);
  return {
    workspaceName: workspace?.cabinet?.name || company?.company?.name || "",
    description:
      workspace?.cabinet?.description || company?.company?.description || "",
    teamSize: workspace?.cabinet?.size || company?.company?.teamSize || "",
    homeName: workspace?.home?.name || "",
  };
}

export async function writeWorkspaceFields(
  patch: Partial<WorkspaceFields>
): Promise<WorkspaceFields> {
  const existing =
    (await readJson<WorkspaceJsonV2 & { setupDate?: string }>(WORKSPACE_FILE)) || {};
  const next = {
    ...existing,
    version: existing.version ?? 2,
    home: {
      ...(existing.home || {}),
      ...(patch.homeName !== undefined ? { name: patch.homeName } : {}),
    },
    cabinet: {
      ...(existing.cabinet || {}),
      ...(patch.workspaceName !== undefined ? { name: patch.workspaceName } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.teamSize !== undefined ? { size: patch.teamSize } : {}),
    },
  };
  await writeJson(WORKSPACE_FILE, next);

  // Mirror into the legacy company.json so older code paths stay in sync.
  const legacy =
    (await readJson<CompanyJson & { setupDate?: string; exists?: boolean }>(
      COMPANY_FILE
    )) || {};
  const legacyNext = {
    ...legacy,
    exists: true,
    company: {
      ...(legacy.company || {}),
      ...(patch.workspaceName !== undefined ? { name: patch.workspaceName } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.teamSize !== undefined ? { teamSize: patch.teamSize } : {}),
    },
  };
  await writeJson(COMPANY_FILE, legacyNext);

  return readWorkspaceFields();
}

/** The directory where `user-avatar.{ext}` lives. */
export function getUserAvatarDir(): string {
  return CONFIG_DIR;
}

export const USER_AVATAR_PREFIX = "user-avatar";

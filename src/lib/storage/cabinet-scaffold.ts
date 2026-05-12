import path from "path";
import fs from "fs/promises";
import yaml from "js-yaml";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";

export interface ScaffoldCabinetOptions {
  name: string;
  kind: "root" | "child";
  description?: string;
  /** Extra markdown content written after the H1 in index.md */
  body?: string;
  tags?: string[];
  /**
   * When true, existing .cabinet and index.md are not overwritten.
   * Useful for re-running onboarding on an already-initialized directory.
   */
  skipExisting?: boolean;
  /**
   * User's locale ("en" | "he"). Determines which getting-started seed
   * directory is copied into the cabinet. Falls back to the English seed
   * when no locale-specific directory exists.
   */
  locale?: string;
}

const GETTING_STARTED_DIRNAME = "getting-started";

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectoryMerge(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryMerge(srcPath, destPath);
      continue;
    }

    if (await pathExists(destPath)) {
      continue;
    }

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(srcPath, destPath);
  }
}

async function resolveGettingStartedSeedDir(
  targetDir: string,
  locale: string | undefined,
): Promise<string | null> {
  const destinationDir = path.resolve(targetDir, GETTING_STARTED_DIRNAME);

  // Try locale-specific seed first (e.g. getting-started-he) then fall
  // back to the canonical English seed. The English seed always exists;
  // additional locales are opt-in directories shipped with the app.
  const candidates: string[] = [];
  if (locale && locale !== "en") {
    candidates.push(
      path.join(PROJECT_ROOT, "resources", `${GETTING_STARTED_DIRNAME}-${locale}`),
    );
  }
  candidates.push(path.join(PROJECT_ROOT, "resources", GETTING_STARTED_DIRNAME));

  for (const sourceDir of candidates) {
    if (path.resolve(sourceDir) === destinationDir) continue;
    if (await pathExists(sourceDir)) return sourceDir;
  }
  return null;
}

export async function seedGettingStartedDir(
  targetDir: string,
  locale?: string,
): Promise<void> {
  const sourceDir = await resolveGettingStartedSeedDir(targetDir, locale);
  if (!sourceDir) {
    return;
  }

  await copyDirectoryMerge(
    sourceDir,
    path.join(targetDir, GETTING_STARTED_DIRNAME)
  );
}

/**
 * Bootstrap the canonical cabinet directory structure:
 *   .cabinet          — YAML identity manifest
 *   index.md          — entry point
 *   .agents/          — agent personas
 *   .jobs/            — scheduled automations
 *   .cabinet-state/   — runtime state
 */
export async function scaffoldCabinet(
  targetDir: string,
  options: ScaffoldCabinetOptions
): Promise<void> {
  const { name, kind, description = "", body = "", tags = [], skipExisting = false, locale } = options;

  // Directories — always idempotent
  await fs.mkdir(path.join(targetDir, ".agents"), { recursive: true });
  await fs.mkdir(path.join(targetDir, ".jobs"), { recursive: true });
  await fs.mkdir(path.join(targetDir, ".cabinet-state"), { recursive: true });

  // .cabinet manifest
  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const manifest = {
    schemaVersion: 1,
    id: `${slug}-${kind}`,
    name,
    kind,
    version: "0.1.0",
    description: description || `${name} cabinet.`,
    entry: "index.md",
  };

  const writeManifest = () =>
    fs.writeFile(
      path.join(targetDir, ".cabinet"),
      yaml.dump(manifest, { lineWidth: -1 }),
      "utf-8"
    );

  if (skipExisting) {
    await writeManifest().catch(() => {});
  } else {
    await writeManifest();
  }

  // index.md
  const now = new Date().toISOString();
  const frontmatterLines = [
    "---",
    `title: "${name}"`,
    `created: "${now}"`,
    `modified: "${now}"`,
  ];
  if (tags.length > 0) {
    frontmatterLines.push("tags:");
    for (const tag of tags) frontmatterLines.push(`  - ${tag}`);
  }
  frontmatterLines.push("---");

  const bodyLines = ["", `# ${name}`, ""];
  if (body) bodyLines.push(body, "");

  const indexContent = [...frontmatterLines, ...bodyLines].join("\n");

  const writeIndex = () =>
    fs.writeFile(
      path.join(targetDir, "index.md"),
      indexContent,
      skipExisting ? { flag: "wx" } : "utf-8"
    );

  if (skipExisting) {
    await writeIndex().catch(() => {});
  } else {
    await writeIndex();
  }

  await seedGettingStartedDir(targetDir, locale);
}

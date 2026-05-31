import fs from "fs/promises";
import path from "path";
import { listSkills } from "./loader";

/**
 * Materialize linked-repo skills into a cabinet bundle dir so export
 * recipients see the same skills the source cabinet used at runtime.
 *
 * Plan ref: docs/SKILLS_PLAN.md Decisions §6.
 *
 * Cabinet export isn't implemented yet — call this from the export pipeline
 * when it lands. Returns the list of materialized skill keys + provenance
 * metadata so callers can include it in the export manifest.
 */

export interface BundledSkillRecord {
  key: string;
  /** Absolute path inside the bundle dir where the skill was placed. */
  destPath: string;
  /** Where it came from (linked-repo absolute path). */
  originalSource: string;
  /** Original origin classification before bundling. */
  originalOrigin: string;
}

export interface BundleOptions {
  /** Cabinet whose skills are being exported. */
  cabinetPath?: string;
  /** Absolute path to the bundle dir (typically `<exportRoot>/.agents/skills/`). */
  bundleDir: string;
  /**
   * When true, also materialize System-origin skills referenced by personas
   * in this cabinet. Default false — system skills aren't part of the cabinet
   * by design (see C4); only include them when the operator opts in.
   */
  includeSystemSkillsReferencedByPersonas?: boolean;
  /** Persona's `skills:` lists referenced in this cabinet — used to filter. */
  referencedKeys?: string[];
}

export async function bundleLinkedRepoSkillsForExport(
  opts: BundleOptions,
): Promise<BundledSkillRecord[]> {
  const skills = await listSkills({ cabinetPath: opts.cabinetPath });
  const filterSet = opts.referencedKeys ? new Set(opts.referencedKeys) : null;

  const candidates = skills.filter((skill) => {
    if (filterSet && !filterSet.has(skill.key)) return false;
    if (skill.origin === "linked-repo") return true;
    if (skill.origin === "system" && opts.includeSystemSkillsReferencedByPersonas) return true;
    return false;
  });

  await fs.mkdir(opts.bundleDir, { recursive: true });
  const records: BundledSkillRecord[] = [];

  for (const skill of candidates) {
    const dest = path.join(opts.bundleDir, skill.key);
    await fs.cp(skill.path, dest, { recursive: true });
    records.push({
      key: skill.key,
      destPath: dest,
      originalSource: skill.path,
      originalOrigin: skill.origin,
    });
  }

  return records;
}

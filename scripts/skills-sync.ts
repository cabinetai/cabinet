/**
 * `npm run skills:sync` — reconcile `skills-lock.json` against the live
 * skills on disk. Reports any drift (modified files, missing skills, or
 * skills without a lock entry).
 *
 * Plan ref: docs/SKILLS_PLAN.md Phase 4.
 */
import { verifySkillsLock, readSkillsLock } from "@/lib/agents/skills/lock";
import { listSkills } from "@/lib/agents/skills/loader";

async function main() {
  const reports = await verifySkillsLock();
  const lock = await readSkillsLock();
  const skills = await listSkills();

  const lockedKeys = new Set(Object.keys(lock.skills));
  const onDiskCabinetKeys = new Set(
    skills
      .filter((s) => s.origin === "cabinet-root" || s.origin === "cabinet-scoped")
      .map((s) => s.key),
  );

  const unlocked = Array.from(onDiskCabinetKeys).filter((key) => !lockedKeys.has(key));

  let exitCode = 0;
  for (const report of reports) {
    if (report.drift === "missing") {
      console.warn(`✗ ${report.key} — locked but missing from disk (scope: ${report.scope})`);
      exitCode = 1;
    } else if (report.drift === "modified") {
      console.warn(
        `⚠ ${report.key} — modified since install (${report.changedFiles?.length} file${
          report.changedFiles?.length === 1 ? "" : "s"
        })`,
      );
      for (const file of report.changedFiles ?? []) console.warn(`    ~ ${file}`);
    } else if (report.drift === "no-lock") {
      console.warn(`? ${report.key} — locked but no per-file SHA recorded (legacy v1 entry)`);
    } else {
      console.log(`✓ ${report.key} — unmodified`);
    }
  }

  if (unlocked.length > 0) {
    console.warn(`\n${unlocked.length} cabinet skill(s) on disk without a lock entry:`);
    for (const key of unlocked) console.warn(`    ! ${key} (consider running an import to record provenance)`);
  }

  console.log(
    `\nSummary: ${reports.length} locked, ${unlocked.length} unlocked, ${
      reports.filter((r) => r.drift === "modified").length
    } modified.`,
  );

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

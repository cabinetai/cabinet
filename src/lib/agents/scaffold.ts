import path from "path";
import { ensureDirectory } from "@/lib/storage/fs-operations";

// Skills are NOT a per-agent subdirectory — they live in shared origins
// (cabinet-root, cabinet-scoped, system, linked-repo, legacy-home). Agents
// only *reference* skills by key in their persona's `skills:` field.
// See `src/lib/agents/skills/loader.ts` for the origin model.
export const STANDARD_AGENT_SUBDIRECTORIES = [
  "jobs",
  "sessions",
  "memory",
  "workspace",
] as const;

export async function ensureAgentScaffold(agentDir: string): Promise<void> {
  await Promise.all(
    STANDARD_AGENT_SUBDIRECTORIES.map((subdir) =>
      ensureDirectory(path.join(agentDir, subdir))
    )
  );
}

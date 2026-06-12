import path from "path";
import type { ConversationMeta } from "@/types/conversations";
import {
  appendHistoryEvent,
  repoForCabinetRoot,
  readHistoryConfig,
  actorAuthor,
  normalizeCabinetRoot,
  isInternalHistoryPath as isInternal,
  type AgentActor,
  type HistoryEvent,
} from "@/lib/history/engine";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";

/**
 * Run-boundary capture for agent edits (PRD §4.3). Agent CLIs write straight
 * to disk, so at finalize we diff the cabinet (`git status --porcelain`),
 * commit the dirty content paths as the agent, and journal one event per
 * file — replacing "trust the ARTIFACT block" with "observe the filesystem"
 * (ARTIFACT stays as a hint, unioned in).
 */


async function agentDisplayName(
  slug: string,
  cabinetPath: string | undefined
): Promise<string | undefined> {
  try {
    const { readPersona } = await import("@/lib/agents/persona-manager");
    const persona = await readPersona(slug, cabinetPath);
    return persona?.displayName?.trim() || persona?.name?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function commitAgentRun(meta: ConversationMeta): Promise<void> {
  try {
    const cabinetRootVirtual = normalizeCabinetRoot(meta.cabinetPath);
    const handle = await repoForCabinetRoot(cabinetRootVirtual);
    const config = readHistoryConfig(cabinetRootVirtual);

    const actor: AgentActor = {
      kind: "agent",
      slug: meta.agentSlug,
      cabinetPath: cabinetRootVirtual,
      conversationId: meta.id,
      displayName: await agentDisplayName(meta.agentSlug, meta.cabinetPath),
      runtime: meta.adapterType ?? meta.providerId ?? undefined,
      trigger: meta.trigger,
    };

    // The cabinet's location inside the repo (the run only touched files
    // under its own cabinet — scope status to that subtree).
    const cabinetFs = resolveCabinetDir(meta.cabinetPath);
    let scope = ".";
    if (handle) {
      const fsReal = await import("fs").then((fs) => {
        try {
          return fs.realpathSync(cabinetFs);
        } catch {
          return cabinetFs;
        }
      });
      const rel = path.relative(handle.root, fsReal);
      scope = rel && !rel.startsWith("..") ? rel.split(path.sep).join("/") : ".";
    }

    let changed: string[] = [];
    if (handle) {
      try {
        const status = await handle.git.status(
          scope === "." ? [] : ["--", scope]
        );
        changed = status.files.map((f) => f.path).filter((p) => !isInternal(p));
      } catch (err) {
        console.error(`[history] agent-run status failed for ${meta.id}:`, err);
      }
    }

    // Journal: observed changes ∪ self-reported ARTIFACT paths.
    const journalPaths = new Set<string>();
    for (const repoRel of changed) {
      // repo-relative → DATA_DIR-virtual: scope prefix maps to the cabinet.
      const inCabinet =
        scope === "." ? repoRel : path.posix.relative(scope, repoRel);
      if (inCabinet.startsWith("..")) continue;
      journalPaths.add(
        cabinetRootVirtual ? `${cabinetRootVirtual}/${inCabinet}` : inCabinet
      );
    }
    for (const artifact of meta.artifactPaths ?? []) {
      const vp = artifact.startsWith(cabinetRootVirtual)
        ? artifact
        : cabinetRootVirtual
          ? `${cabinetRootVirtual}/${artifact}`
          : artifact;
      journalPaths.add(vp.replace(/^\/+/, ""));
    }

    const skipped: HistoryEvent["skipped"] | undefined =
      handle && !handle.managed
        ? "foreign-repo"
        : config.journalOnly
          ? "journal-only"
          : undefined;

    const ts = new Date().toISOString();
    for (const vp of journalPaths) {
      appendHistoryEvent(cabinetRootVirtual, {
        ts,
        op: "write",
        path: vp,
        actor,
        ...(skipped ? { skipped } : {}),
      });
    }

    // Commit (managed repos only, never journal-only tier, only real changes).
    if (!handle || !handle.managed || config.journalOnly || !changed.length) {
      return;
    }
    const title = (meta.title || "run").slice(0, 60);
    const trailers = [
      `Cabinet-Agent: ${cabinetRootVirtual}#${meta.agentSlug}`,
      `Cabinet-Run: ${meta.id}`,
    ];
    const message = `agent(${meta.agentSlug}): ${title}\n\n${trailers.join("\n")}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await handle.git.raw(["add", "-A", "--", ...changed]);
        await handle.git.commit(message, changed, {
          "--author": actorAuthor(actor),
        });
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("index.lock") || attempt === 2) {
          console.error(`[history] agent-run commit failed for ${meta.id}:`, msg);
          break;
        }
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  } catch (err) {
    // Never fail a finalize over history capture.
    console.error(`[history] commitAgentRun failed for ${meta.id}:`, err);
  }
}

/** Virtual path existence guard used by callers that pre-validate. */
export function virtualPathOf(absPath: string): string {
  return absPath.replace(DATA_DIR, "").replace(/^\/+/, "");
}

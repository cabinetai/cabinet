// Next.js boot hook: runs once on server start. Used here to bootstrap
// agents that ship as shared, cabinet-spanning globals so they exist on
// disk before any persona lookup hits.
//
// Documented at https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Load `.cabinet.env` into process.env so Cabinet's own server-side reads
  // (e.g. process.env.GITHUB_TOKEN in the skills catalog route) see the
  // values without a shell restart. Spawn-time helpers also re-merge from
  // the file directly, but loading here keeps in-process consumers honest.
  try {
    const { loadCabinetEnv } = await import("./lib/runtime/cabinet-env");
    loadCabinetEnv();
  } catch (err) {
    console.error("instrumentation: loadCabinetEnv failed", err);
  }
  try {
    const { ensureGlobalAgents } = await import("./lib/agents/library-manager");
    await ensureGlobalAgents();
  } catch (err) {
    console.error("instrumentation: ensureGlobalAgents failed", err);
  }
}

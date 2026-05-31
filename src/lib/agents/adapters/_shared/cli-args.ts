/**
 * Shared helpers for building CLI argument lists from adapter-config blobs.
 *
 * Every adapter needs to pluck `model`, `effort`, `command`, etc. from a
 * loosely-typed `Record<string, unknown>` config and turn them into CLI flags.
 * Rather than reimplementing `readStringConfig` in each adapter file — the
 * paperclip-style `_shared/cli-args.ts` centralizes the pattern so adding a
 * new flag shape is a single-file change.
 *
 * Intentionally dependency-free so both server and client can import it
 * without pulling in `child_process`.
 */

/**
 * Read a string config value from a loosely-typed config blob. Returns the
 * trimmed string if it's a non-empty string, or `undefined` otherwise.
 * Matches the identical private helper duplicated across every adapter
 * before this was extracted.
 */
export function readStringConfig(
  config: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (!config) return undefined;
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Read an effort value from a config blob. Providers accept either `effort`
 * or `reasoningEffort` as the key — both historical names are tried, in order.
 */
export function readEffortConfig(
  config: Record<string, unknown> | undefined
): string | undefined {
  return (
    readStringConfig(config, "effort") ||
    readStringConfig(config, "reasoningEffort")
  );
}

import type { AgentProvider, ProviderStatus } from "../provider-interface";
import {
  checkCliProviderAvailable,
  execCli,
  resolveCliCommand,
} from "../provider-cli";

const PI_THINKING_LEVELS = [
  { id: "off", name: "Off", description: "No extra reasoning" },
  { id: "minimal", name: "Minimal", description: "Tiny reasoning budget" },
  { id: "low", name: "Low", description: "Quick reasoning" },
  { id: "medium", name: "Medium", description: "Balanced depth" },
  { id: "high", name: "High", description: "Thorough reasoning" },
  { id: "xhigh", name: "Extra High", description: "Maximum depth" },
] as const;

// Used only when `pi --list-models` discovery fails. Refreshed 2026-05-03.
const PI_FALLBACK_MODELS = [
  { id: "xai/grok-4.3", name: "xai/grok-4.3" },
  { id: "anthropic/claude-opus-4-7", name: "anthropic/claude-opus-4-7" },
  { id: "anthropic/claude-sonnet-4-6", name: "anthropic/claude-sonnet-4-6" },
  { id: "openai/gpt-5.4", name: "openai/gpt-5.4" },
  { id: "openai/gpt-5.3-codex", name: "openai/gpt-5.3-codex" },
  { id: "google/gemini-3.1-pro", name: "google/gemini-3.1-pro" },
] as const;

function withThinkingLevels<T extends { id: string; name: string }>(
  models: readonly T[]
) {
  return models.map((model) => ({
    ...model,
    effortLevels: [...PI_THINKING_LEVELS],
  }));
}

/**
 * Pure parser for `pi --list-models` stdout. Pi routes to whatever providers
 * the user has keyed, so this list is per-machine.
 *
 * `pi --list-models` emits a whitespace-columned table, e.g.:
 *
 *   provider  model                              context  max-out  thinking  images
 *   tfm       glm/glm-5.2                        128K     16.4K    no        no
 *   tfm       kai/nvidia/nemotron-3-super-…:free 128K     16.4K    no        no
 *
 * Columns are separated by runs of 2+ spaces. The model id Pi expects is
 * `<provider>/<model>` (e.g. `tfm/glm/glm-5.2`); `splitProviderModel` later
 * splits on the first `/` into `--provider tfm --model glm/glm-5.2`. The model
 * column need not contain a `/` (e.g. `xai  grok-4.3` → `xai/grok-4.3`). The
 * header row is identified by its `provider`/`model` labels and dropped.
 *
 * For robustness we also keep the legacy single-bare-id-per-line shape
 * (`vendor/model` with no internal runs of spaces) so older Pi CLIs and the
 * offline fallback path still parse.
 *
 * Blank lines and `#` comments/banners are dropped; if nothing survives (empty
 * output, output that is *only* a banner, or output with no recognizable
 * model rows) we fall back to the offline list so the picker is never blank —
 * the same hardening applied to OpenCode (§11 #22).
 */
export function parsePiModels(stdout: string | null | undefined) {
  const out = (stdout || "").trim();
  if (!out) return withThinkingLevels(PI_FALLBACK_MODELS);
  const parsed = out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => modelIdFromLine(line))
    .filter((id): id is string => Boolean(id))
    .map((id) => ({
      id,
      name: id,
      effortLevels: [...PI_THINKING_LEVELS],
    }));
  return parsed.length > 0 ? parsed : withThinkingLevels(PI_FALLBACK_MODELS);
}

/**
 * The `pi --list-models` table's header row, identified explicitly by its first
 * two column labels rather than by the (unreliable) absence of a `/`. Pi
 * providers/models with plain slugs would otherwise be mistaken for a header.
 */
function isPiTableHeader(tokens: string[]): boolean {
  return (
    tokens.length >= 2 &&
    tokens[0].toLowerCase() === "provider" &&
    tokens[1].toLowerCase() === "model"
  );
}

/**
 * Extract a Pi model id from one non-empty `--list-models` line.
 *
 * - Header row (`provider  model  context  …`): dropped.
 * - col0 already a full id (contains `/`): return col0 verbatim, dropping any
 *   trailing stat columns — e.g. `glm/glm-5.2  128K  no` → `glm/glm-5.2`.
 * - Table row (≥2 tokens, col0 a bare provider slug): reconstruct as
 *   `<col0 provider>/<col1 model>` → e.g. `tfm/glm/glm-5.2` or `xai/grok-4.3`.
 *   The model column need NOT contain a `/`. Remaining columns are dropped.
 * - Single token: legacy bare `vendor/model` id, returned when it has a `/`.
 *
 * Returns `null` for lines that yield no usable id (header rows, stray labels
 * without a `/`).
 */
function modelIdFromLine(line: string): string | null {
  const tokens = line.split(/ {2,}/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return null;
  if (isPiTableHeader(tokens)) return null;

  // col0 is already a full `<provider>/<model>` id (provider slugs never carry
  // a `/`). Trailing tokens are stat columns — drop them, don't weld them on.
  if (tokens[0].includes("/")) return tokens[0];

  // Table row: bare provider slug in col0, model in col1 (with or without an
  // internal `/`), followed by stat columns.
  if (tokens.length >= 2) return `${tokens[0]}/${tokens[1]}`;

  // Single token: legacy bare `vendor/model` id (no internal multi-space run).
  const id = tokens[0];
  return id.includes("/") ? id : null;
}

/**
 * Repair a stored Pi model id if — and only if — it looks like a
 * `pi --list-models` table row.
 *
 * Before the parser fix, selecting a row (or the header row) could persist the
 * *entire line* as the model id (e.g. `tfm       glm/glm-5.2  128K  …  no`),
 * which then broke every path that interpolates it raw into `--model`. This
 * collapses such stale values on read so they heal without a data migration.
 *
 * Pi-specific by construction: a Pi table row is the only model value that
 * ever contains an internal run of 2+ spaces, so that is the sole trigger. The
 * leading token is a Pi provider (`tfm`, `openai`, …), so a real row is
 * reconstructed as `<pi-provider>/<model>` only when one of the first two
 * columns carries a `/`.
 *
 *   tfm       glm/glm-5.2  128K  …  → tfm/glm/glm-5.2
 *   glm/glm-5.2               128K  → glm/glm-5.2  (col0 already a full id)
 *   provider  model  context  …     → undefined   (header row)
 *   glm/glm-5.2                     → glm/glm-5.2  (already clean)
 *
 * Returns `undefined` for empty/whitespace input or an unrecoverable header row.
 */
export function normalizePiModelId(raw: string | null | undefined): string | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined;
  // Only a Pi table row has an internal run of 2+ spaces. Anything else is
  // already a clean id — return it untouched.
  if (!/ {2,}/.test(trimmed)) return trimmed;
  // Reuse the same row parser the model list uses, so healing and parsing stay
  // in lockstep (slash-safe col0 handling, explicit header detection).
  return modelIdFromLine(trimmed) ?? undefined;
}

export const piProvider: AgentProvider = {
  id: "pi",
  name: "Pi (Inflection)",
  type: "cli",
  icon: "pi",
  iconAsset: "/providers/pi.svg",
  installMessage: "Pi CLI not found. Install with: npm i -g @pi/cli",
  installSteps: [
    {
      title: "Install Pi",
      detail: "Pi is a multi-provider AI coding agent. Install the CLI:",
      command: "npm i -g @pi/cli",
    },
    {
      title: "Configure a provider",
      detail:
        "Set API keys for the provider(s) you want Pi to route to (e.g. XAI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY).",
      command: "pi --list-models",
      link: {
        label: "Pi docs",
        url: "https://pi.ai/docs",
      },
    },
    {
      title: "Verify setup",
      detail: "Confirm headless mode works:",
      command: "pi --mode json -p 'Reply with exactly OK'",
    },
  ],
  detachedPromptLaunchMode: "one-shot",
  models: PI_FALLBACK_MODELS.map((model) => ({
    id: model.id,
    name: model.name,
    effortLevels: [...PI_THINKING_LEVELS],
  })),
  effortLevels: [...PI_THINKING_LEVELS],
  command: "pi",
  commandCandidates: [
    `${process.env.HOME || ""}/.local/bin/pi`,
    "/usr/local/bin/pi",
    "/opt/homebrew/bin/pi",
    "pi",
  ],

  buildArgs(prompt: string, _workdir: string): string[] {
    return ["-p", prompt];
  },

  buildOneShotInvocation(prompt: string, workdir: string, opts) {
    const baseArgs = this.buildArgs ? this.buildArgs(prompt, workdir) : [];
    const args = [...baseArgs];
    if (opts?.model) {
      // Heal stale persisted table-row values before interpolating into --model.
      const healed = normalizePiModelId(opts.model) ?? opts.model;
      args.push("--model", healed);
    }
    if (opts?.effort) {
      args.push("--thinking", opts.effort);
    }
    return {
      command: this.command || "pi",
      args,
    };
  },

  buildVerifyCommand(defaultModel?: string | null): string {
    // Mirrors the install step (`pi --mode json -p 'Reply with exactly OK'`)
    // but pins the resolved default model so verification exercises the
    // user's actual path, not Pi's internal default.
    const healed =
      defaultModel && (normalizePiModelId(defaultModel) ?? defaultModel);
    const modelArg = healed ? ` --model '${healed}'` : "";
    return `pi --mode json${modelArg} -p 'Reply with exactly OK'`;
  },

  async listModels() {
    // Throws on a genuine CLI failure so the models API route serves the
    // offline fallback with `dynamic:false` (honest "offline defaults" hint).
    // `parsePiModels` still guards empty / banner-only output.
    const cmd = resolveCliCommand(this);
    const out = await execCli(cmd, ["--list-models"], { timeout: 15_000 });
    return parsePiModels(out);
  },

  async isAvailable(): Promise<boolean> {
    return checkCliProviderAvailable(this);
  },

  async healthCheck(): Promise<ProviderStatus> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        return {
          available: false,
          authenticated: false,
          error: this.installMessage,
        };
      }

      try {
        const cmd = resolveCliCommand(this);
        const version = await execCli(cmd, ["--version"], { timeout: 5000 });

        return {
          available: true,
          authenticated: true,
          version: version ? `Pi ${version}` : "Pi installed",
        };
      } catch {
        return {
          available: true,
          authenticated: false,
          error: "Pi is installed but not verified. Configure at least one provider API key.",
        };
      }
    } catch (error) {
      return {
        available: false,
        authenticated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};

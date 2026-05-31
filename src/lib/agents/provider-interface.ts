export interface ProviderStatus {
  available: boolean;
  authenticated: boolean;
  version?: string;
  error?: string;
}

export interface CliProviderInvocation {
  command: string;
  args: string[];
  initialPrompt?: string;
  readyStrategy?: "claude";
}

export interface OneShotInvocationOptions {
  model?: string;
  effort?: string;
  /**
   * Provider-specific session id captured from a previous PTY run. When
   * present, the provider appends the CLI's own resume flag (Claude
   * `--resume`, Cursor `--resume`, OpenCode `--session`) so the follow-up
   * turn reads into the same context instead of starting fresh.
   */
  resumeId?: string;
}

/**
 * Per-turn options passed to `buildSessionInvocation`. Session mode is the
 * Claude REPL-style launch; for most providers one-shot is what terminal-mode
 * actually uses and they accept `resumeId` through `OneShotInvocationOptions`.
 */
export interface SessionInvocationOptions {
  resumeId?: string;
}

export type ProviderModelRequires = "any" | "chatgpt_plan" | "api_key";

export interface ProviderModel {
  id: string;
  name: string;
  description?: string;
  effortLevels?: ProviderEffortLevel[];
  /**
   * Auth/plan gate for this model. `"api_key"` means the provider's backend
   * only accepts the model when the user is authenticated with a direct API
   * key (not a consumer subscription like ChatGPT Codex). UIs should badge
   * these models and the user should know up-front why a pick might fail.
   * Defaults to `"any"` (no gating) when omitted.
   */
  requires?: ProviderModelRequires;
}

export interface ProviderEffortLevel {
  id: string;
  name: string;
  description?: string;
}

export interface AgentProvider {
  id: string;
  name: string;
  type: "cli" | "api";
  icon: string;
  iconAsset?: string;
  installMessage?: string;
  installSteps?: Array<{
    title: string;
    detail: string;
    command?: string;
    link?: { label: string; url: string };
  }>;
  models?: ProviderModel[];
  effortLevels?: ProviderEffortLevel[];
  detachedPromptLaunchMode?: "session" | "one-shot";

  // CLI providers
  command?: string;
  commandCandidates?: string[];
  buildArgs?(prompt: string, workdir: string): string[];
  buildOneShotInvocation?(
    prompt: string,
    workdir: string,
    opts?: OneShotInvocationOptions
  ): CliProviderInvocation;
  buildSessionInvocation?(
    prompt: string | undefined,
    workdir: string,
    opts?: SessionInvocationOptions
  ): CliProviderInvocation;
  /**
   * Optional. The shell command the in-UI verifier runs instead of the
   * static "Verify setup" install step. Multi-provider routers
   * (OpenCode/Pi) implement this so verification exercises the *resolved
   * default model* — then "verify passed" means the user's actual path
   * works, not the CLI's opaque internal default. `defaultModel` is passed
   * only when this provider is the configured default. Omit the method
   * entirely → the verifier uses the install step command unchanged (every
   * other provider).
   */
  buildVerifyCommand?(defaultModel?: string | null): string;
  /**
   * Whether this provider's CLI accepts a `resumeId` in the terminal-mode
   * launch spec. UI surfaces (continue composer, "new session" advisory)
   * key off this flag to decide whether a follow-up turn will actually
   * resume the prior session or start fresh. Optional — defaults to
   * false for safety.
   */
  supportsTerminalResume?: boolean;

  // API providers
  apiKeyEnvVar?: string;
  runPrompt?(prompt: string, context: string): Promise<string>;

  /**
   * Optional dynamic model discovery. Providers that can list their available
   * models via a CLI command (e.g. `opencode models`) implement this hook.
   * Results are cached for 60s server-side by the models API route.
   */
  listModels?(): Promise<ProviderModel[]>;

  // Common
  isAvailable(): Promise<boolean>;
  healthCheck(): Promise<ProviderStatus>;
}

export interface ProviderRegistry {
  providers: Map<string, AgentProvider>;
  defaultProvider: string;

  register(provider: AgentProvider): void;
  get(id: string): AgentProvider | undefined;
  getDefault(): AgentProvider | undefined;
  listAll(): AgentProvider[];
  listAvailable(): Promise<AgentProvider[]>;
}

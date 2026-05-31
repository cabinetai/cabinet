import cron from "node-cron";
import type { AgentAction, ActionWarning } from "@/types/actions";
import type { AgentPersona } from "./persona-manager";
import type { ConversationMeta } from "@/types/conversations";
import { providerRegistry } from "./provider-registry";

export type PersonaLookup = Map<string, AgentPersona>;

export function personaCanDispatch(persona: AgentPersona): boolean {
  // v0.4.1: every agent dispatches by default. Per-persona opt-out via
  // `canDispatch: false` in YAML frontmatter still works.
  if (typeof persona.canDispatch === "boolean") return persona.canDispatch;
  return true;
}

export function computeWarnings(
  meta: ConversationMeta,
  dispatcher: AgentPersona | null,
  action: AgentAction,
  personas: PersonaLookup,
  ancestorAgentSlugs: string[]
): ActionWarning[] {
  const warnings: ActionWarning[] = [];

  if (!dispatcher || !personaCanDispatch(dispatcher)) {
    warnings.push({
      code: "persona_cannot_dispatch",
      severity: "hard",
      message:
        "This agent does not have permission to assign tasks. Enable " +
        "'Can assign tasks to other team members' on its agent page.",
    });
  }

  const target = personas.get(action.agent);
  if (!target) {
    warnings.push({
      code: "unknown_agent",
      severity: "hard",
      message: `No agent named "${action.agent}" was found in this cabinet.`,
    });
  } else {
    if (target.active === false) {
      warnings.push({
        code: "inactive_target",
        severity: "soft",
        message: `${target.name} is currently inactive.`,
      });
    }
    if (
      typeof target.budget === "number" &&
      typeof target.heartbeatsUsed === "number" &&
      target.heartbeatsUsed + 1 > target.budget
    ) {
      warnings.push({
        code: "budget_low",
        severity: "soft",
        message: `${target.name} is near its monthly budget (${target.heartbeatsUsed}/${target.budget}).`,
      });
    }
  }

  if (action.type === "LAUNCH_TASK" && dispatcher && action.agent === dispatcher.slug) {
    warnings.push({
      code: "self_dispatch",
      severity: "soft",
      message: "This task is being dispatched to the same agent that proposed it.",
    });
  }

  if (ancestorAgentSlugs.includes(action.agent)) {
    warnings.push({
      code: "cycle_risk",
      severity: "soft",
      message: `${action.agent} is already part of this dispatch chain.`,
    });
  }

  const depth = (meta.spawnDepth ?? 0) + 1;
  if (depth >= 3) {
    warnings.push({
      code: "depth_warning",
      severity: "soft",
      message: `This would be ${depth} levels deep in the dispatch chain.`,
    });
  }

  if (action.type === "SCHEDULE_JOB" && !cron.validate(action.schedule)) {
    warnings.push({
      code: "invalid_schedule",
      severity: "hard",
      message: `"${action.schedule}" is not a valid cron expression.`,
    });
  }

  if (action.type === "SCHEDULE_TASK") {
    const when = new Date(action.when);
    if (Number.isNaN(when.getTime())) {
      warnings.push({
        code: "invalid_when",
        severity: "hard",
        message: `"${action.when}" is not a valid ISO datetime.`,
      });
    }
  }

  // Action-authored providerId override: reject if the provider isn't
  // registered. The install/auth state of a provider is async to compute,
  // so we only gate on registry presence here — the CLI itself will fail
  // loudly via the adapter's error-classifier if unauthenticated (and
  // `codex-local` now surfaces the real reason after the Gap-3 fix).
  if (action.providerId) {
    const provider = providerRegistry.get(action.providerId);
    if (!provider) {
      warnings.push({
        code: "provider_unavailable",
        severity: "hard",
        message: `Provider "${action.providerId}" is not registered.`,
      });
    }
  }

  // Soft info: when the parent ran on a different provider than the target
  // persona's declared default, the new resolver pushes the parent's
  // runtime down. Flag this so humans reviewing the action can spot the
  // shift (e.g. "copywriter is declared codex-cli but will run on claude").
  if (target) {
    const parentProvider = meta.providerId?.trim();
    const resolvedProvider =
      action.providerId?.trim() || parentProvider || target.provider;
    if (
      resolvedProvider &&
      target.provider &&
      resolvedProvider !== target.provider
    ) {
      warnings.push({
        code: "cross_provider_push",
        severity: "soft",
        message:
          `${target.name} normally runs on ${target.provider}, but this ` +
          `sub-task will run on ${resolvedProvider} (inherited from the ` +
          `parent conversation).`,
      });
    }
  }

  return warnings;
}

export function hasHardWarnings(warnings: ActionWarning[]): boolean {
  return warnings.some((w) => w.severity === "hard");
}

"use client";

import { Sparkles } from "lucide-react";
import type { ConversationMeta } from "@/types/conversations";
import { useLocale } from "@/i18n/use-locale";

/**
 * Per-run "Skills offered" footer.
 *
 * Lists which skills were attached to this run — something we know for sure
 * because we put them there. Doesn't claim which skills the model actually
 * expanded; that signal isn't reliable across providers.
 *
 * Reads `adapterConfig.skills` populated by `prepareSkillMount` in
 * `src/lib/agents/skills/sync.ts`. Trust gating is intentionally absent —
 * the operator's act of attaching a skill IS the trust signal.
 */
export function SkillsOfferedFooter({ meta }: { meta: ConversationMeta }) {
  const { t } = useLocale();
  const config = (meta.adapterConfig || {}) as { skills?: string[] };
  const offered = config.skills ?? [];

  if (offered.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border/60 text-[11px]">
      <div className="flex items-start gap-2 text-muted-foreground">
        <Sparkles className="size-3 mt-0.5 shrink-0" />
        <div>
          <span className="font-medium">{t("tinyExtras:skillsOffered")}</span>{" "}
          {offered.map((key, i) => (
            <span key={key}>
              {i > 0 && ", "}
              <span title={`Skill: ${key} — manage in Settings → Skills`}>{key}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

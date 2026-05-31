"use client";

import { Plug } from "lucide-react";
import { useLocale } from "@/i18n/use-locale";

/**
 * Settings → Integrations → "Connected integrations" card.
 *
 * Restored from `a27fd58` (Matan, "skills-initial") — points users at where
 * to configure things today (API keys above, MCP servers via CLI) while
 * Cabinet's own OAuth flows are still on the roadmap.
 */
export function ConnectedIntegrationsCard() {
  const { t } = useLocale();
  return (
    <section className="border-t border-border pt-6">
      <h3 className="text-[14px] font-semibold mb-1 flex items-center gap-1.5">
        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
        Connected integrations
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Prebuilt OAuth flows for services like Gmail, Slack, and Google
        Calendar. Connect once and Cabinet handles tokens, scopes, and
        refresh.
      </p>
      <div className="bg-card border border-dashed border-border rounded-lg px-4 py-6 text-center">
        <span className="text-[12px] font-semibold">{t("tinyExtras:comingSoon")}</span>
        <p className="text-[11px] text-muted-foreground mt-1">
          For now, set service-specific API tokens above and add MCP
          servers in your CLI config.
        </p>
      </div>
    </section>
  );
}

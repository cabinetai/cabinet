"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PREVIEW_INTEGRATIONS,
  INTEGRATION_BY_ID,
  filterIntegrations,
  connectTargetFor,
} from "@/lib/integrations/preview-catalog";
import { IntegrationDetailPage } from "@/components/integrations/hub/integration-detail-page";
import { LayoutGallery } from "@/components/integrations/hub/layouts/layout-gallery";
import { useAppStore } from "@/stores/app-store";
import { CliMcpSection } from "@/components/settings/cli-mcp-section";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { BuiltInToolsSection } from "@/components/settings/built-in-tools-section";

/**
 * The full-page Integrations Hub. Three tabs:
 *  - Integrations — the "logo wall" gallery of connectors (click → detail page).
 *  - MCPs         — the read-only list of MCP servers configured in your CLIs,
 *                   plus the agents' built-in tools.
 *  - API Keys     — the `.cabinet.env` secrets manager.
 * (The MCPs + API Keys panels used to live under Settings → Integrations.)
 */

type HubTab = "integrations" | "mcps" | "keys";

const TABS: { id: HubTab; label: string }[] = [
  { id: "integrations", label: "Integrations" },
  { id: "mcps", label: "MCPs" },
  { id: "keys", label: "API Keys" },
];

export function IntegrationsHubPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<HubTab>("integrations");
  // The selected connector lives in the route (section.slug) so the address bar
  // reflects it and it deep-links / back-buttons.
  const selectedId = useAppStore((s) =>
    s.section.type === "integrations" ? s.section.slug ?? null : null,
  );
  const setSection = useAppStore((s) => s.setSection);

  // Which connectors (and suites) are actually connected — drives the only badge
  // we show. Re-checked when returning from a detail (a connect may have landed).
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    fetch("/api/agents/config/mcp-catalog", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data?.approved) return;
        setConnectedIds(
          new Set(
            (data.approved as { id: string; connectedProviderIds?: string[] }[])
              .filter((a) => (a.connectedProviderIds?.length ?? 0) > 0)
              .map((a) => a.id),
          ),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const filtered = useMemo(
    () => filterIntegrations(PREVIEW_INTEGRATIONS, query),
    [query],
  );

  // Opening a connector is a full-page detail view, reached from the gallery.
  const selected = selectedId ? INTEGRATION_BY_ID[selectedId] : null;
  if (selected) {
    return (
      <IntegrationDetailPage
        item={selected}
        onBack={() => setSection({ type: "integrations" })}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="shrink-0 border-b border-border">
        <div className="mx-auto max-w-6xl px-6 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Integrations
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Connect Cabinet to everything that runs your work — your agents can act on all of it.
              </p>
            </div>

            {/* Search — only relevant on the gallery tab */}
            {tab === "integrations" && (
              <div className="relative w-44 shrink-0 sm:w-64">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search integrations…"
                  className="h-9 w-full rounded-lg border border-border bg-card ps-9 pe-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-foreground/20"
                />
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-4 flex items-center gap-6" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative pb-3 text-[13px] font-medium transition-colors",
                  tab === t.id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content (each tab owns its own scroll) */}
      <div className="min-h-0 flex-1">
        {tab === "integrations" && (
          <LayoutGallery
            items={filtered}
            connectedIds={connectedIds}
            onOpen={(id) =>
              setSection({
                type: "integrations",
                // Google Drive (Drive-for-Desktop) and Gmail (IMAP) each have
                // their own detail page rather than folding into the Google
                // Workspace OAuth suite.
                slug:
                  id === "google-drive" || id === "gmail"
                    ? id
                    : connectTargetFor(id),
              })
            }
          />
        )}
        {tab === "mcps" && (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-4xl space-y-8 px-6 py-6">
              <CliMcpSection />
              <BuiltInToolsSection />
            </div>
          </div>
        )}
        {tab === "keys" && (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-4xl px-6 py-6">
              <ApiKeysSection />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

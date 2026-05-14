"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Search,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

/**
 * Search-first browse for skills.sh. Single search input + result list,
 * each row showing the install count + audit-pass summary, sorted by
 * installs. No source picker, no mode tabs — search is the primary surface.
 *
 * Hits `/api/agents/skills/catalog?q=<query>` which proxies skills.sh's
 * search API and enriches results with the audit endpoint
 * (`add-skill.vercel.sh/audit`). See plan Wave 12.
 */

interface AuditSummary {
  passed: number;
  total: number;
  available: boolean;
}

interface SearchResult {
  id: string;
  skillId: string;
  name: string;
  source: string;
  installs: number;
  audits: AuditSummary;
}

interface CatalogResponse {
  mode: "search";
  query: string;
  source?: "cache" | "fresh";
  skills: SearchResult[];
}

interface SkillCatalogBrowserProps {
  /** Called when the user picks a result. The caller (parent dialog) should
   *  populate its source field with this value and trigger preview/install. */
  onPick: (source: string) => void;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_CHARS = 2;

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function AuditBadge({ audits }: { audits: AuditSummary }) {
  const { t } = useLocale();
  if (!audits.available || audits.total === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70"
        title={t("skillCatalog:auditUnavailable")}
      >
        <Shield className="size-3" />
        audits unavailable
      </span>
    );
  }
  const allPass = audits.passed === audits.total;
  const Icon = allPass ? ShieldCheck : ShieldAlert;
  const tint = allPass
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-amber-600 dark:text-amber-400";
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[10px]", tint)}
      title={`${audits.passed}/${audits.total} skills.sh audits passed (Alibaba Threat Hunter, Socket, Snyk, zeroleaks)`}
    >
      <Icon className="size-3" />
      {audits.passed}/{audits.total} audits passed
    </span>
  );
}

export function SkillCatalogBrowser({ onPick }: SkillCatalogBrowserProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < MIN_QUERY_CHARS) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }
    const myRequest = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/skills/catalog?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`search failed (${res.status})`);
      const body = (await res.json()) as CatalogResponse;
      // Drop stale responses if the user kept typing.
      if (myRequest !== requestIdRef.current) return;
      setResults(body.skills ?? []);
      setHasSearched(true);
    } catch (err) {
      if (myRequest !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "search failed");
    } finally {
      if (myRequest === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("skillCatalog:searchPlaceholder")}
          autoFocus
          className={cn(
            "w-full text-xs pl-9 pr-9 py-2 bg-card border border-border rounded-md",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && (
        <div className="text-xs text-destructive flex items-start gap-1.5 px-1">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {!hasSearched && !loading && !error && (
        <div className="text-[11px] text-muted-foreground text-center py-6">
          Type to search skills.sh.
        </div>
      )}

      {hasSearched && !loading && results.length === 0 && (
        <div className="text-[11px] text-muted-foreground text-center py-6">
          No skills matched <code className="font-mono">{query}</code>.
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto">
          {results.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onPick(`github:${entry.source}@${entry.skillId}`)}
              className={cn(
                "flex flex-col gap-1.5 px-3 py-2 rounded-md text-left",
                "border border-border bg-background hover:bg-muted/40 transition-colors",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[12px] font-semibold truncate">{entry.name}</span>
                  </div>
                  <code className="text-[10px] font-mono text-muted-foreground">
                    {entry.source}
                  </code>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Download className="size-3" />
                  {formatInstalls(entry.installs)}
                </div>
              </div>
              <AuditBadge audits={entry.audits} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Plug, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Settings → Integrations → "MCP Servers".
 *
 * Read-only surface that lists MCP servers the user has already configured
 * in their Claude Code, Codex CLI, and Gemini CLI configs. Cabinet does
 * NOT modify these files — editing happens via each CLI's own commands.
 * The "Editing coming soon" pill makes the read-only nature explicit.
 */

type ServerEntry = {
  name: string;
  type?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  scope: "global" | "project";
  project?: string;
};

type ProviderResult = {
  id: "claude-code" | "codex-cli" | "gemini-cli";
  name: string;
  configPath: string;
  servers: ServerEntry[];
  error?: string;
};

const ADD_HINT: Record<ProviderResult["id"], string> = {
  "claude-code": "claude mcp add <name> <command>",
  "codex-cli": "Edit ~/.codex/config.toml ([mcp_servers.<name>])",
  "gemini-cli": "Edit ~/.gemini/settings.json (mcpServers)",
};

function projectBasename(p: string): string {
  const trimmed = p.replace(/\/$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function commandLine(server: ServerEntry): string {
  if (server.url) return server.url;
  const parts: string[] = [];
  if (server.command) parts.push(server.command);
  if (server.args && server.args.length > 0) parts.push(...server.args);
  return parts.join(" ");
}

export function CliMcpSection() {
  const [providers, setProviders] = useState<ProviderResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agents/config/cli-mcp-servers");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { providers: ProviderResult[] };
        if (!cancelled) {
          setProviders(data.providers);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="border-t border-border pt-6">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-[14px] font-semibold flex items-center gap-1.5">
          <Plug className="h-3.5 w-3.5 text-muted-foreground" />
          MCP Servers
        </h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          Editing coming soon
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        MCP servers configured in your CLIs. Cabinet auto-discovers them from
        Claude Code, Codex, and Gemini — edit via the CLI for now.
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Reading CLI configs…
        </div>
      )}

      {fetchError && !loading && (
        <div className="flex items-center gap-2 text-[12px] text-destructive py-3">
          <AlertCircle className="h-3.5 w-3.5" />
          Could not load MCP servers: {fetchError}
        </div>
      )}

      {providers && (
        <div className="space-y-5">
          {providers.map((p) => (
            <ProviderBlock key={p.id} provider={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProviderBlock({ provider }: { provider: ProviderResult }) {
  const empty = provider.servers.length === 0;
  return (
    <div className={cn(empty && "opacity-70")}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[12px] font-semibold">{provider.name}</span>
        <span className="text-[10px] font-mono text-muted-foreground/70">
          {provider.configPath}
        </span>
      </div>

      {provider.error && (
        <div className="text-[11px] text-destructive mb-2 flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3" />
          {provider.error}
        </div>
      )}

      {empty && !provider.error && (
        <p className="text-[11px] text-muted-foreground italic">
          No MCP servers configured. Add via{" "}
          <code className="font-mono not-italic">{ADD_HINT[provider.id]}</code>.
        </p>
      )}

      {!empty && (
        <div className="space-y-1.5">
          {provider.servers.map((server, i) => (
            <ServerRow key={`${provider.id}-${server.name}-${i}`} server={server} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServerRow({ server }: { server: ServerEntry }) {
  const cmd = commandLine(server);
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium truncate">{server.name}</span>
            {server.type && (
              <span className="text-[9px] uppercase tracking-wide font-mono text-muted-foreground/70">
                {server.type}
              </span>
            )}
          </div>
          {cmd && (
            <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5" title={cmd}>
              {cmd}
            </p>
          )}
        </div>
        <ScopeChip server={server} />
      </div>
    </div>
  );
}

function ScopeChip({ server }: { server: ServerEntry }) {
  if (server.scope === "global") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
        global
      </span>
    );
  }
  const label = server.project ? projectBasename(server.project) : "project";
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0 max-w-[140px] truncate"
      title={server.project}
    >
      {label}
    </span>
  );
}

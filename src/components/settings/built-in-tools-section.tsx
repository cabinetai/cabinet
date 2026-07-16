"use client";

import { useEffect, useState } from "react";
import {
  Wrench,
  MessageSquare,
  ListChecks,
  Asterisk,
  Terminal,
  Globe,
  type LucideIcon,
} from "lucide-react";

/**
 * Settings → Integrations → Built-in tools.
 *
 * Read-only, informational cards for capabilities every agent already has
 * (no setup). Sits alongside the connectable Integrations Hub so users see
 * the full picture of what an agent can do.
 */

interface BuiltIn {
  id: string;
  label: string;
  description: string;
  icon: string;
  href?: string;
}

const ICONS: Record<string, LucideIcon> = {
  MessageSquare,
  ListChecks,
  Asterisk,
  Terminal,
  Globe,
};

export function BuiltInToolsSection(): React.ReactElement | null {
  const [items, setItems] = useState<BuiltIn[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agents/config/mcp-catalog");
        if (!res.ok) return;
        const data = (await res.json()) as { builtins?: BuiltIn[] };
        if (!cancelled) setItems(Array.isArray(data.builtins) ? data.builtins : []);
      } catch {
        /* non-critical surface — stay silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-[14px] font-semibold flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          Built-in tools
        </h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          Always available
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Capabilities every agent has out of the box, no setup needed.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((tool) => {
          const Icon = ICONS[tool.icon] ?? Wrench;
          const inner = (
            <div className="flex items-start gap-2.5 bg-foreground/[0.03] rounded-xl px-3 py-2.5 h-full transition-colors hover:bg-foreground/[0.06]">
              <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium">{tool.label}</div>
                <p className="text-[11px] text-muted-foreground">{tool.description}</p>
              </div>
            </div>
          );
          return tool.href ? (
            <a key={tool.id} href={tool.href} className="block hover:opacity-90 transition-opacity">
              {inner}
            </a>
          ) : (
            <div key={tool.id}>{inner}</div>
          );
        })}
      </div>
    </section>
  );
}

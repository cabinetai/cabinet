"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ProductTool {
  name: string;
  label: string;
  description: string;
  category: string;
  tags: string[];
}

interface ProductToolsResponse {
  tools?: ProductTool[];
}

export function TaskProductToolPicker({
  value,
  onChange,
  disabled,
  compact = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [tools, setTools] = useState<ProductTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/optale/product-tools", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as ProductToolsResponse;
      })
      .then((body) => {
        if (!cancelled) setTools(Array.isArray(body.tools) ? body.tools : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load tools");
          setTools([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => new Set(value), [value]);
  const selectedTools = tools.filter((tool) => selected.has(tool.name));
  const label =
    selectedTools.length === 0
      ? "Tools"
      : selectedTools.length === 1
        ? selectedTools[0].label
        : `${selectedTools.length} tools`;

  const toggle = (name: string) => {
    if (selected.has(name)) {
      onChange(value.filter((entry) => entry !== name));
    } else {
      onChange([...value, name]);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 min-w-0 gap-1.5 px-2 text-[11px]",
              compact ? "max-w-[9.5rem] sm:max-w-[13rem]" : "max-w-[220px]"
            )}
            disabled={disabled || loading || (tools.length === 0 && !error)}
            title="Choose governed product tools for this turn"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Wrench className="size-3.5" />
            )}
            <span className="min-w-0 truncate">{label}</span>
            {selectedTools.length > 0 ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold tabular-nums text-primary">
                {selectedTools.length}
              </span>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-primary" />
          Governed tools
        </DropdownMenuLabel>
        <div className="px-1.5 pb-1 text-[11px] leading-4 text-muted-foreground">
          Product-facing tool names only. Internal MCP ids stay server-side.
        </div>
        <DropdownMenuSeparator />
        {error ? (
          <div className="px-2 py-2 text-xs text-destructive">
            Failed to load tools: {error}
          </div>
        ) : tools.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            No governed product tools are available.
          </div>
        ) : (
          tools.map((tool) => {
            const checked = selected.has(tool.name);
            return (
              <DropdownMenuItem
                key={tool.name}
                onClick={(event) => {
                  event.preventDefault();
                  toggle(tool.name);
                }}
                className="items-start gap-2 py-2"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-transparent"
                  )}
                >
                  <Check className="size-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">
                    {tool.label}
                  </span>
                  <span className="line-clamp-2 block text-[11px] leading-4 text-muted-foreground">
                    {tool.description}
                  </span>
                </span>
              </DropdownMenuItem>
            );
          })
        )}
        {value.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onChange([])}
              className="text-[12px] text-muted-foreground"
            >
              Clear tool selection
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

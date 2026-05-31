"use client";

import { useEffect, useMemo, useState } from "react";
import { OfficeChrome } from "./office-chrome";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  path: string;
  title: string;
}

interface Sheet {
  name: string;
  html: string;
}

export function XlsxViewer({ path, title }: Props) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSheets(null);
    (async () => {
      try {
        const [XLSX, res] = await Promise.all([
          import("xlsx"),
          fetch(`/api/assets/${path}`),
        ]);
        if (cancelled) return;
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const wb = XLSX.read(buf, { type: "array", cellDates: true, cellStyles: true });
        const result: Sheet[] = wb.SheetNames.map((name) => ({
          name,
          html: XLSX.utils.sheet_to_html(wb.Sheets[name], { editable: false }),
        }));
        if (cancelled) return;
        setSheets(result);
        setActive(0);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to parse spreadsheet");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const current = useMemo(() => sheets?.[active] ?? null, [sheets, active]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <OfficeChrome path={path} title={title} extLabel="XLSX" />
      {sheets && sheets.length > 1 && (
        <div className="flex items-center gap-0.5 border-b border-border bg-muted/40 px-2 overflow-x-auto scrollbar-none">
          {sheets.map((s, i) => (
            <button
              key={s.name + i}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "px-3 py-1.5 text-[12px] rounded-t whitespace-nowrap transition-colors",
                i === active
                  ? "bg-background text-foreground font-medium border-t border-x border-border -mb-px"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {loading && !error && (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Parsing spreadsheet…
          </div>
        )}
        {error && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground">
                Try downloading the file and opening it externally.
              </p>
            </div>
          </div>
        )}
        {current && (
          <div
            className="xlsx-sheet p-3 text-[12px]"
            dangerouslySetInnerHTML={{ __html: current.html }}
          />
        )}
      </div>
    </div>
  );
}

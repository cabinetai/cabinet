"use client";

import { useEffect, useState } from "react";
import type { PageTypeKind } from "@/lib/ui/page-type-icons";

export interface PageMetaEntry {
  path: string;
  title: string;
  type: PageTypeKind;
}

export function usePageMeta(paths: string[]): Map<string, PageMetaEntry> {
  const [meta, setMeta] = useState<Map<string, PageMetaEntry>>(new Map());
  const key = paths.slice().sort().join("|");

  useEffect(() => {
    if (paths.length === 0) {
      setMeta(new Map());
      return;
    }
    let cancelled = false;
    fetch("/api/kb/pages/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paths }),
    })
      .then((r) => r.json())
      .then((data: { entries?: PageMetaEntry[] }) => {
        if (cancelled) return;
        const next = new Map<string, PageMetaEntry>();
        for (const entry of data.entries ?? []) {
          next.set(entry.path, entry);
        }
        setMeta(next);
      })
      .catch(() => {
        if (!cancelled) setMeta(new Map());
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return meta;
}

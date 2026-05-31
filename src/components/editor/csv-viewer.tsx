"use client";

import { useEffect, useState, useCallback } from "react";
import { Code2, Save, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { useLocale } from "@/i18n/use-locale";

interface CsvViewerProps {
  path: string;
  title: string;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(current);
        current = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        row.push(current);
        current = "";
        if (row.length > 0) rows.push(row);
        row = [];
        if (ch === "\r") i++;
      } else {
        current += ch;
      }
    }
  }
  row.push(current);
  if (row.some((c) => c !== "")) rows.push(row);

  return rows;
}

function rowsToCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join(",")
    )
    .join("\n");
}

export function CsvViewer({ path }: CsvViewerProps) {
  const { t } = useLocale();
  const [rows, setRows] = useState<string[][]>([]);
  const [rawText, setRawText] = useState("");
  const [sourceMode, setSourceMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editCell, setEditCell] = useState<{ r: number; c: number } | null>(null);

  const csvUrl = `/api/assets/${path}`;

  useEffect(() => {
    fetch(csvUrl)
      .then((r) => r.text())
      .then((text) => {
        setRawText(text);
        setRows(parseCsv(text));
        setDirty(false);
      });
  }, [csvUrl]);

  const updateCell = useCallback(
    (r: number, c: number, value: string) => {
      setRows((prev) => {
        const next = prev.map((row) => [...row]);
        // Ensure row and column exist
        while (next.length <= r) next.push([]);
        while (next[r].length <= c) next[r].push("");
        next[r][c] = value;
        return next;
      });
      setDirty(true);
    },
    []
  );

  const addRow = () => {
    const cols = rows[0]?.length || 1;
    setRows((prev) => [...prev, new Array(cols).fill("")]);
    setDirty(true);
  };

  const addColumn = () => {
    setRows((prev) => prev.map((row) => [...row, ""]));
    setDirty(true);
  };

  const deleteRow = (r: number) => {
    setRows((prev) => prev.filter((_, i) => i !== r));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const csv = sourceMode ? rawText : rowsToCsv(rows);
    try {
      await fetch(`/api/assets/${path}`, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: csv,
      });
      if (!sourceMode) {
        setRawText(csv);
      } else {
        setRows(parseCsv(rawText));
      }
      setDirty(false);
    } catch (e) {
      console.error("Failed to save CSV:", e);
    }
    setSaving(false);
  };

  const toggleSource = () => {
    if (sourceMode) {
      // Switching back to table — parse the raw text
      setRows(parseCsv(rawText));
    } else {
      // Switching to source — serialize current table
      setRawText(rowsToCsv(rows));
    }
    setSourceMode(!sourceMode);
  };

  const headers = rows[0] || [];
  const dataRows = rows.slice(1);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ViewerToolbar
        path={path}
        badge={`CSV${rows.length > 0 ? ` (${rows.length - 1} rows)` : ""}`}
      >
        {dirty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        )}
        <button
          onClick={toggleSource}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md transition-colors border border-border ${
            sourceMode
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent"
          }`}
        >
          <Code2 className="h-3 w-3" />
          {sourceMode ? "Table" : "Source"}
        </button>
        <button
          onClick={() => window.open(csvUrl, "_blank")}
          className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          title={t("csvViewer:downloadCsv")}
        >
          <Download className="h-4 w-4" />
        </button>
      </ViewerToolbar>

      {sourceMode ? (
        <div className="flex-1 overflow-y-auto p-4">
          <textarea
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              setDirty(true);
            }}
            className="w-full h-full min-h-[calc(100vh-12rem)] bg-transparent font-mono text-[13px] leading-relaxed resize-none focus:outline-none"
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/80 backdrop-blur-sm">
                <th className="border border-border px-1 py-1 text-center text-[10px] text-muted-foreground w-8">
                  #
                </th>
                {headers.map((header, c) => (
                  <th
                    key={c}
                    className="border border-border px-3 py-1.5 text-left font-medium text-foreground min-w-[100px]"
                  >
                    {editCell?.r === 0 && editCell?.c === c ? (
                      <input
                        autoFocus
                        className="w-full bg-transparent outline-none"
                        value={header}
                        onChange={(e) => updateCell(0, c, e.target.value)}
                        onBlur={() => setEditCell(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") setEditCell(null);
                          if (e.key === "Tab") {
                            e.preventDefault();
                            setEditCell({ r: 0, c: c + 1 < headers.length ? c + 1 : 0 });
                          }
                        }}
                      />
                    ) : (
                      <span
                        className="cursor-text"
                        onDoubleClick={() => setEditCell({ r: 0, c })}
                      >
                        {header || "\u00A0"}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => {
                const r = ri + 1; // actual row index (0 is header)
                return (
                  <tr
                    key={ri}
                    className="hover:bg-accent/30 transition-colors group"
                  >
                    <td className="border border-border px-1 py-1 text-center text-[10px] text-muted-foreground/50">
                      <span className="group-hover:hidden">{ri + 1}</span>
                      <button
                        className="hidden group-hover:inline text-red-400 hover:text-red-300 text-[10px]"
                        onClick={() => deleteRow(r)}
                        title={t("csvViewer:deleteRow")}
                      >
                        ×
                      </button>
                    </td>
                    {headers.map((_, c) => {
                      const value = row[c] ?? "";
                      const isEditing = editCell?.r === r && editCell?.c === c;
                      return (
                        <td
                          key={c}
                          className="border border-border px-3 py-1.5"
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              className="w-full bg-transparent outline-none"
                              value={value}
                              onChange={(e) => updateCell(r, c, e.target.value)}
                              onBlur={() => setEditCell(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditCell(null);
                                if (e.key === "Enter") setEditCell({ r: r + 1, c });
                                if (e.key === "Tab") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    setEditCell({ r, c: Math.max(0, c - 1) });
                                  } else {
                                    setEditCell({
                                      r: c + 1 >= headers.length ? r + 1 : r,
                                      c: c + 1 >= headers.length ? 0 : c + 1,
                                    });
                                  }
                                }
                              }}
                            />
                          ) : (
                            <span
                              className="cursor-text"
                              onDoubleClick={() => setEditCell({ r, c })}
                            >
                              {value || "\u00A0"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Add row/column buttons */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border">
            <button
              onClick={addRow}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
            >
              + Add row
            </button>
            <button
              onClick={addColumn}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
            >
              + Add column
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

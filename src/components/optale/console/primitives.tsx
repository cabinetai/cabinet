import type { ReactNode } from "react";
import { Circle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableRow } from "./types";

export function TableSurface({
  eyebrow,
  title,
  description,
  columns,
  rows,
}: {
  eyebrow: string;
  title: string;
  description: string;
  columns: string[];
  rows: TableRow[];
}) {
  return (
    <section className="space-y-5 px-4 py-5 lg:px-6">
      <SurfaceHeader eyebrow={eyebrow} title={title} description={description} />
      <DataTable columns={columns} rows={rows} />
    </section>
  );
}

export function SplitSurface({
  eyebrow,
  title,
  description,
  table,
  side,
}: {
  eyebrow: string;
  title: string;
  description: string;
  table: ReactNode;
  side: ReactNode;
}) {
  return (
    <section className="space-y-5 px-4 py-5 lg:px-6">
      <SurfaceHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {table}
        <aside className="border border-white/10 bg-[#181a1e] p-4">{side}</aside>
      </div>
    </section>
  );
}

export function SurfaceHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#b8d47a]">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#aeb3b7]">{description}</p>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  rowKey,
  selectedRowKey,
  onRowSelect,
}: {
  columns: string[];
  rows: TableRow[];
  rowKey?: (row: TableRow, index: number) => string;
  selectedRowKey?: string | null;
  onRowSelect?: (row: TableRow, index: number) => void;
}) {
  const selectable = Boolean(onRowSelect);

  return (
    <div className="overflow-hidden border border-white/10 bg-[#15171b]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-[#1b1d22] text-[10px] uppercase tracking-[0.18em] text-[#8f9498]">
            <tr>
              {columns.map((column) => (
                <th key={column} className="border-b border-white/10 px-3 py-2">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const key = rowKey?.(row, index) ?? `${row[columns[0]]}-${index}`;
              const selected = Boolean(selectedRowKey && selectedRowKey === key);
              return (
                <tr
                  key={key}
                  className={cn(
                    "border-b border-white/10 text-[#d7d9dc] last:border-b-0 hover:bg-white/[0.04]",
                    selectable &&
                      "cursor-pointer focus:outline-none focus-visible:bg-white/[0.07]",
                    selected && "bg-[#b8d47a]/8 text-white",
                  )}
                  tabIndex={selectable ? 0 : undefined}
                  aria-selected={selectable ? selected : undefined}
                  onClick={selectable ? () => onRowSelect?.(row, index) : undefined}
                  onKeyDown={
                    selectable
                      ? (event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          onRowSelect?.(row, index);
                        }
                      : undefined
                  }
                >
                  {columns.map((column, columnIndex) => (
                    <td
                      key={column}
                      className={cn(
                        "px-3 py-3 align-middle",
                        columnIndex === 0 && "font-medium text-white",
                      )}
                    >
                      {column === "state" || column === "policy" ? (
                        <PlainStatus
                          value={row[column]}
                          tone={statusTone(row[column])}
                        />
                      ) : (
                        row[column]
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ContextSection({
  title,
  rows,
}: {
  title: string;
  rows: [string, string][];
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8f9498]">
        {title}
      </h3>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-[#8f9498]">{label}</dt>
            <dd className="min-w-0 truncate text-right text-[#ebe9df]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function StatusLine({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "good" | "info";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2">
        <Icon className="size-3.5" />
        {label}
      </span>
      <PlainStatus value={value} tone={tone} />
    </div>
  );
}

export function PlainStatus({
  value,
  tone,
}: {
  value: string;
  tone: "good" | "warn" | "info" | "muted";
}) {
  const toneClass = {
    good: "text-[#b8d47a]",
    warn: "text-[#c9a86a]",
    info: "text-[#8fd2ef]",
    muted: "text-[#aeb3b7]",
  }[tone];

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", toneClass)}>
      <Circle className="size-2 fill-current" />
      {value}
    </span>
  );
}

function statusTone(value: string): "good" | "warn" | "info" | "muted" {
  const normalized = value.toLowerCase();
  if (
    normalized.includes("live") ||
    normalized.includes("ready") ||
    normalized.includes("allow") ||
    normalized.includes("complete") ||
    normalized.includes("healthy") ||
    normalized.includes("shared")
  ) {
    return "good";
  }
  if (
    normalized.includes("review") ||
    normalized.includes("mapping") ||
    normalized.includes("planned") ||
    normalized.includes("queued")
  ) {
    return "warn";
  }
  if (normalized.includes("connected") || normalized.includes("indexed")) {
    return "info";
  }
  return "muted";
}

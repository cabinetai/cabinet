/**
 * Parse CSV text into a 2D array of strings.
 * Handles quoted fields, escaped quotes, and CR/LF line endings.
 */
export function parseCsv(text: string): string[][] {
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

/**
 * Serialize a 2D array back to CSV text.
 */
export function rowsToCsv(rows: string[][]): string {
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

/**
 * Convert a 2D array of CSV cells into a GitHub-flavoured markdown table.
 * The first row is treated as the header.
 */
export function csvToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const header = rows[0];
  const body = rows.slice(1);
  const colCount = header.length;

  const escapePipe = (s: string) => s.replace(/\|/g, "\\|");

  const lines: string[] = [];
  lines.push(`| ${header.map(escapePipe).join(" | ")} |`);
  lines.push(`| ${Array(colCount).fill("---").join(" | ")} |`);
  for (const row of body) {
    const cells = Array.from({ length: colCount }, (_, i) => escapePipe(row[i] ?? ""));
    lines.push(`| ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}

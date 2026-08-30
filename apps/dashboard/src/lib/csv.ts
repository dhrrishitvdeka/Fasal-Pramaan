function escapeCell(value: unknown): string {
  if (value == null) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  // Prefix formula-injection prefixes, but keep genuine negative numbers intact.
  if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) {
    s = `'${s}`;
  }
  if (/[",\r\n]/.test(s)) {
    s = `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols =
    columns && columns.length
      ? columns
      : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [cols.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(cols.map((col) => escapeCell(row?.[col])).join(","));
  }
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

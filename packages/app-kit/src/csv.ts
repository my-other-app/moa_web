/**
 * CSV export for list pages (and, through `table-export.ts`, the same rows
 * as an Excel workbook).
 *
 * Only event registrations had an export, and that one is server-side. The
 * rest of the dashboard had no way to get data out at all, which is the first
 * thing anyone asks for when they want to do something the UI does not do.
 */

/**
 * Quotes a single field.
 *
 * A value is wrapped whenever it contains a delimiter, a quote or a newline,
 * and inner quotes are doubled -- a club called `O'Brien "The" Society` or an
 * address with a comma would otherwise shift every later column on that row.
 *
 * Values beginning with =, +, - or @ are prefixed with a quote. Spreadsheets
 * evaluate those as formulas on open, so a user-supplied name can otherwise
 * run code on whoever opens the export.
 */
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One column of an export: its heading and how to read it off a row. The CSV and the Excel workbook are both written from these. */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

/** The same thing under the name it has now that it writes Excel too. */
export type ExportColumn<T> = CsvColumn<T>;

/**
 * The export as a table: the headings and every row's values, raw. The one
 * place rows become cells, so the CSV and the Excel file of an export can
 * never disagree on a column.
 */
export function tableOf<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): { headers: string[]; body: unknown[][] } {
  return { headers: columns.map((c) => c.header), body: rows.map((row) => columns.map((c) => c.value(row))) };
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const { headers, body } = tableOf(rows, columns);
  const lines = [headers.map(escapeField).join(",")];
  for (const cells of body) lines.push(cells.map(escapeField).join(","));
  // CRLF: Excel on Windows treats a bare LF as one long line.
  return lines.join("\r\n");
}

/** Triggers a download without a round trip to the server. */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM makes Excel read it as UTF-8; without it, names with accents or
  // emoji arrive mangled.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** `clubs-2026-10-04.csv`, or `.xlsx` for the Excel file of the same export. */
export function timestampedName(prefix: string, extension: "csv" | "xlsx" = "csv"): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

/**
 * Pulls every page of a paginated endpoint so an export covers the whole
 * filtered result, not just the page on screen.
 *
 * Capped, because this is a browser loop against a shared API: an admin who
 * exports an unfiltered list of a hundred thousand users should get a clear
 * limit rather than a hung tab. The caller is told when the cap was hit so it
 * can say so rather than hand over a silently truncated file.
 */
export const EXPORT_PAGE_SIZE = 100;
export const EXPORT_MAX_ROWS = 5000;

export async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ items: T[]; total?: number | null }>,
  { maxRows = EXPORT_MAX_ROWS }: { maxRows?: number } = {}
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let offset = 0;

  for (;;) {
    const page = await fetchPage(offset, EXPORT_PAGE_SIZE);
    // The API over-fetches by one to detect a next page; trim it or the
    // export gains a duplicate row at every page boundary.
    const items = page.items.slice(0, EXPORT_PAGE_SIZE);
    rows.push(...items);

    if (rows.length >= maxRows) return { rows: rows.slice(0, maxRows), truncated: true };
    if (items.length < EXPORT_PAGE_SIZE) return { rows, truncated: false };

    offset += EXPORT_PAGE_SIZE;
  }
}

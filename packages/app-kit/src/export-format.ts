import { toApiError } from "@moa/api";

/**
 * The server's exports, as Excel or CSV.
 *
 * Every export route answers CSV by default and an Excel workbook with
 * `?format=xlsx` (same path, same columns, a `.xlsx` filename). Both the
 * clubs dashboard and the main portal build their export URLs through
 * `withFormat`, so the choice is made in one place rather than glued onto
 * eight URLs by hand. A server from before the workbooks ignores the
 * parameter and sends its CSV, named `.csv` by its own Content-Disposition.
 */
export type ExportFormat = "xlsx" | "csv";

/** In the order they are offered: Excel first, the default. */
export const EXPORT_FORMATS: readonly ExportFormat[] = ["xlsx", "csv"];

export const EXPORT_MIME: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

/** What each choice says in an export menu. */
export const EXPORT_CHOICE_LABEL: Record<ExportFormat, string> = {
  xlsx: "Download Excel (.xlsx)",
  csv: "Download CSV",
};

/**
 * The export URL for a format: `format=xlsx` added to whatever query it
 * already has (or replacing a `format` it carries); for CSV, the URL with no
 * `format` at all, since CSV is what every route sends by default. Every
 * other parameter is kept exactly as it was written, and so is a #fragment.
 */
export function withFormat(url: string, format: ExportFormat): string {
  const hashAt = url.indexOf("#");
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  const beforeHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = beforeHash.indexOf("?");
  const path = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  const parts = (queryAt >= 0 ? beforeHash.slice(queryAt + 1) : "").split("&").filter((p) => p !== "" && p !== "format" && !p.startsWith("format="));
  if (format !== "csv") parts.push(`format=${format}`);
  return `${path}${parts.length ? `?${parts.join("&")}` : ""}${hash}`;
}

/** The filename a Content-Disposition header gives, preferring the RFC 5987 `filename*` form; null when it gives none. */
export function dispositionFilename(header: string | null | undefined): string | null {
  if (!header) return null;
  const extended = /filename\*\s*=\s*(?:[\w-]+)?'[^']*'([^;]+)/i.exec(header)?.[1]?.trim();
  if (extended) {
    try {
      return decodeURIComponent(extended.replace(/^"|"$/g, ""));
    } catch {
      // A malformed escape: fall back to the plain filename, if there is one.
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
  const name = (plain?.[1] ?? plain?.[2])?.trim();
  return name ? name : null;
}

/** The format a response is actually in, read from its Content-Type; null when it doesn't say. */
export function responseFormat(response: Response): ExportFormat | null {
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (type.includes("spreadsheetml")) return "xlsx";
  if (type.includes("text/csv")) return "csv";
  return null;
}

/**
 * What to save a fetched export as: the server's own name when it gives one,
 * else `<stem>.<ext>` -- the extension of what actually came back (an older
 * server answers CSV whatever was asked), else of what was asked for.
 */
export function exportFilename(response: Response, stem: string, requested: ExportFormat): string {
  return dispositionFilename(response.headers.get("content-disposition")) ?? `${stem}.${responseFormat(response) ?? requested}`;
}

/**
 * Fetches an export through the gateway (the session cookie goes with it)
 * in the chosen format. A refusal is thrown as the API's error, so it is a
 * toast rather than a file of JSON saved to the downloads folder.
 */
export async function fetchExport(url: string, format: ExportFormat, stem: string): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(withFormat(url, format), { credentials: "include", headers: { Accept: EXPORT_MIME[format] } });
  if (!response.ok) throw await toApiError(response);
  return { blob: await response.blob(), filename: exportFilename(response, stem, format) };
}

/** Hands a fetched file to the browser's downloads. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoked after the click has been handled, or the Blob stays pinned in memory for the life of the page.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

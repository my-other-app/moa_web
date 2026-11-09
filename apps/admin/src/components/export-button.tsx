"use client";

import * as React from "react";
import {
  ExportMenu,
  downloadCsv,
  downloadXlsx,
  fetchAllPages,
  timestampedName,
  toCsv,
  type CsvColumn,
  type ExportFormat,
} from "@moa/app-kit";
import { cn, toast } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

/**
 * Exports the whole filtered result set, not the page on screen, as an
 * Excel workbook or a CSV (the export menu's two choices, Excel first).
 *
 * The filters currently applied are passed in by the caller, so what
 * downloads matches what the admin is looking at -- an export that silently
 * ignored the filters would be worse than none. Both files are written from
 * the same rows and `columns`, so they can't disagree.
 */
export function ExportButton<T>({
  filename,
  columns,
  fetchPage,
  disabled,
  label = "Export",
  sheet,
}: {
  filename: string;
  columns: readonly CsvColumn<T>[];
  fetchPage: (offset: number, limit: number) => Promise<{ items: T[]; total?: number | null }>;
  disabled?: boolean;
  label?: string;
  /** The Excel tab's name; the filename's prefix, capitalised, by default ("Payments"). */
  sheet?: string;
}) {
  const [busy, setBusy] = React.useState(false);

  async function onExport(format: ExportFormat) {
    setBusy(true);
    try {
      const { rows, truncated } = await fetchAllPages(fetchPage);
      if (rows.length === 0) {
        toast.info("Nothing to export with the current filters");
        return;
      }
      if (format === "xlsx") await downloadXlsx(timestampedName(filename, "xlsx"), rows, columns, { sheet: sheet ?? filename.charAt(0).toUpperCase() + filename.slice(1) });
      else downloadCsv(timestampedName(filename), toCsv(rows, columns));
      if (truncated) {
        // Say so rather than hand over a quietly incomplete file.
        toast.warning(
          `Exported the first ${rows.length.toLocaleString("en-IN")} rows. Narrow the filters to get the rest.`
        );
      } else {
        toast.success(`Exported ${rows.length.toLocaleString("en-IN")} rows`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ExportMenu
      size="sm"
      variant="outline"
      className={cn(pressable)}
      disabled={disabled}
      busy={busy}
      label={label}
      onExport={(format) => void onExport(format)}
    />
  );
}

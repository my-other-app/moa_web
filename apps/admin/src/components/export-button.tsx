"use client";

import * as React from "react";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import {
  downloadCsv,
  fetchAllPages,
  timestampedName,
  toCsv,
  type CsvColumn,
} from "@moa/app-kit";
import { Button, cn, toast } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

/**
 * Exports the whole filtered result set, not the page on screen.
 *
 * The filters currently applied are passed in by the caller, so what
 * downloads matches what the admin is looking at -- an export that silently
 * ignored the filters would be worse than none.
 */
export function ExportButton<T>({
  filename,
  columns,
  fetchPage,
  disabled,
  label = "Export",
}: {
  filename: string;
  columns: readonly CsvColumn<T>[];
  fetchPage: (offset: number, limit: number) => Promise<{ items: T[]; total?: number | null }>;
  disabled?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = React.useState(false);

  async function onExport() {
    setBusy(true);
    try {
      const { rows, truncated } = await fetchAllPages(fetchPage);
      if (rows.length === 0) {
        toast.info("Nothing to export with the current filters");
        return;
      }
      downloadCsv(timestampedName(filename), toCsv(rows, columns));
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
    <Button
      size="sm"
      variant="outline"
      className={cn(pressable)}
      disabled={disabled || busy}
      onClick={onExport}
    >
      {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
      {busy ? "Exporting…" : label}
    </Button>
  );
}

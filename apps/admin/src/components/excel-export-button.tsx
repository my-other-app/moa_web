"use client";

import * as React from "react";
import { FileSpreadsheetIcon, Loader2Icon } from "lucide-react";
import { fetchExport, saveBlob } from "@moa/app-kit";
import { Button, cn, toast } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

/**
 * An export the server writes as a workbook only: the list's own URL with
 * `format=xlsx` (support cases, leads, the team reports, speakers). Fetched
 * rather than linked, so a refusal is a toast and never a file of JSON in
 * the downloads folder. The filters on screen are in `href`, so the file is
 * what the admin is looking at.
 */
export function ExcelExportButton({
  href,
  stem,
  label = "Export to Excel",
  disabled,
  className,
}: {
  /** The list's URL through the gateway, with its filters (no `format`). */
  href: string;
  /** The file's name when the server gives none: `<stem>.xlsx`. */
  stem: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  async function onClick() {
    setBusy(true);
    try {
      const file = await fetchExport(href, "xlsx", stem);
      saveBlob(file.blob, file.filename);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" className={cn(pressable, className)} disabled={disabled || busy} onClick={() => void onClick()}>
      {busy ? <Loader2Icon className="animate-spin" /> : <FileSpreadsheetIcon />}
      {busy ? "Exporting…" : label}
    </Button>
  );
}

/** A gateway URL with the filters that are set: empty and absent ones left out. */
export function gatewayUrl(path: string, query: Record<string, string | number | boolean | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return `/api/gateway${path}${qs ? `?${qs}` : ""}`;
}

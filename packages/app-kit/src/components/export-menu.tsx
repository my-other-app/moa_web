"use client";

import * as React from "react";
import { ChevronDownIcon, DownloadIcon, FileSpreadsheetIcon, FileTextIcon, Loader2Icon } from "lucide-react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, cn } from "@moa/ui";

import { EXPORT_CHOICE_LABEL, EXPORT_FORMATS, withFormat, type ExportFormat } from "../export-format";

const ICON: Record<ExportFormat, React.ComponentType<{ className?: string }>> = {
  xlsx: FileSpreadsheetIcon,
  csv: FileTextIcon,
};

export interface ExportMenuProps {
  /**
   * The export's URL as the server takes it (CSV, its default). Each choice
   * is that URL in its format, downloaded by the browser itself: the cookie
   * goes with it because the gateway is same-origin.
   */
  href?: string;
  /** Or, for an export fetched first (a refusal is a toast, not a file): called with the format picked. */
  onExport?: (format: ExportFormat) => void;
  /** The button's words: what is exported ("Export", "Export all", "Export statement"). */
  label?: React.ReactNode;
  /** While a fetched export is on its way: the button spins and can't be pressed again. */
  busy?: boolean;
  disabled?: boolean;
  size?: "xs" | "sm" | "md";
  variant?: "secondary" | "outline" | "ghost";
  /** A longer word on what the file holds, as the button's tooltip. */
  title?: string;
  className?: string;
}

/**
 * An export, as Excel or CSV: one button that opens the two choices,
 * "Download Excel (.xlsx)" first, then "Download CSV". Every server export
 * in the clubs dashboard and the main portal is offered through this, so
 * the words, the order and the URLs (`withFormat`) are the same everywhere.
 */
export function ExportMenu({ href, onExport, label = "Export", busy = false, disabled = false, size = "md", variant = "secondary", title, className }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || busy}>
        <Button variant={variant} size={size} disabled={disabled || busy} title={title} className={cn(className)}>
          {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
          {busy ? "Exporting…" : label}
          <ChevronDownIcon aria-hidden="true" className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {EXPORT_FORMATS.map((format) => {
          const Icon = ICON[format];
          const body = (
            <>
              <Icon className="size-4" /> {EXPORT_CHOICE_LABEL[format]}
            </>
          );
          return href ? (
            <DropdownMenuItem key={format} asChild>
              <a href={withFormat(href, format)} download data-format={format}>
                {body}
              </a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={format} onSelect={() => onExport?.(format)} data-format={format}>
              {body}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

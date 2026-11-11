"use client";

import * as React from "react";
import Link from "next/link";
import { DownloadIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@moa/ui";

import { leadTypeLabel } from "@/features/teamwork";

import { IMPORT_TEMPLATE_URL } from "../api";
import { useImportLeads } from "../queries";
import { importSummary, type ImportResult } from "../schemas";

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "destructive" }> = {
  new: { label: "New", tone: "success" },
  duplicate: { label: "Already here", tone: "warning" },
  error: { label: "Can't read", tone: "destructive" },
};

function ImportBody({ onDone }: { onDone: () => void }) {
  const run = useImportLeads();
  const [file, setFile] = React.useState<File | null>(null);
  const [check, setCheck] = React.useState<ImportResult | null>(null);
  const [created, setCreated] = React.useState<number | null>(null);
  const summary = check ? importSummary(check.rows) : null;

  if (created !== null) {
    return (
      <>
        <p className="m-0 text-[13.5px]">{formatNumber(created)} leads imported. Duplicates and rows that couldn&apos;t be read were left out.</p>
        <DialogFooter>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={IMPORT_TEMPLATE_URL} download>
            <DownloadIcon /> The template
          </a>
        </Button>
        <label className="btn btn-secondary btn-sm cursor-pointer">
          <UploadIcon className="size-4" aria-hidden="true" />
          {file ? file.name : "Pick a sheet"}
          <input
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            aria-label="Sheet to import"
            onChange={(e) => {
              setFile(e.currentTarget.files?.[0] ?? null);
              setCheck(null);
            }}
          />
        </label>
        <Button size="sm" disabled={!file || run.isPending} onClick={() => file && run.mutate({ file, dryRun: true }, { onSuccess: setCheck })}>
          {run.isPending && !check ? <Loader2Icon className="animate-spin" /> : null}
          Check the sheet
        </Button>
      </div>
      <p className="text-ink-3 m-0 text-[12px]">Checking reads every row and creates nothing. Each row is matched on name and city and on the email domain, so a lead already here is not added twice.</p>
      {check && summary ? (
        <>
          <p className="m-0 text-[13px]" role="status">
            {formatNumber(summary.new)} new · {formatNumber(summary.duplicate)} already here · {formatNumber(summary.error)} can&apos;t be read
          </p>
          <div className="max-h-[320px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>What happens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {check.rows.map((r) => {
                  const s = STATUS[r.status] ?? STATUS.error!;
                  return (
                    <TableRow key={r.row}>
                      <TableCell className="tabular-nums">{r.row}</TableCell>
                      <TableCell>{r.name ?? "—"}</TableCell>
                      <TableCell>{r.type ? leadTypeLabel(r.type) : "—"}</TableCell>
                      <TableCell>{r.city ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge tone={s.tone} label={s.label} />
                        {r.status === "duplicate" && r.match_id ? (
                          <Link href={`/teamwork/leads/${r.match_id}`} className="text-brand ml-2 text-[12px]" target="_blank">
                            the lead
                          </Link>
                        ) : null}
                        {r.error ? <span className="text-ink-3 ml-2 text-[12px]">{r.error}</span> : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={!file || !summary || summary.new === 0 || run.isPending} onClick={() => file && run.mutate({ file, dryRun: false }, { onSuccess: (r) => setCreated(r.created ?? 0) })}>
          {run.isPending && check ? <Loader2Icon className="animate-spin" /> : null}
          {summary ? `Import ${formatNumber(summary.new)} new leads` : "Import"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** An Excel or CSV sheet of leads: checked first (a dry run that creates nothing), then imported. */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import leads</DialogTitle>
          <DialogDescription>Fill the template, or any sheet with the same columns, and check it before anything is added.</DialogDescription>
        </DialogHeader>
        {open ? <ImportBody onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

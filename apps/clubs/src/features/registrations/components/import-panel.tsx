"use client";

import * as React from "react";
import { DownloadIcon, Loader2Icon, UploadIcon, UserPlusIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import { Button, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useImportRegistrations, useImports } from "../queries";
import type { EventField, ImportLog } from "../schemas";

const summaryOf = (log: ImportLog) => {
  if (log.status === "FAILED") return `Failed — ${log.issues[0] ?? "the file could not be read"}`;
  if (log.status === "STARTED") return "Processing…";
  return `${log.imported} imported, ${log.failed} ${log.failed === 1 ? "row" : "rows"} not used`;
};

/** A CSV with the columns an import reads, built from the event's own fields, with an example row. */
const templateCsv = (fields: EventField[]) => {
  const extra = fields.map((f) => f.label ?? f.key);
  const header = ["full_name", "email", "phone", "role", ...(extra.length ? ["additional_details_fields", ...extra] : [])];
  const example = ["Ananya Iyer", "ananya@example.com", "9876543210", "attendee", ...(extra.length ? [extra.join(","), ...extra.map(() => "")] : [])];
  return [header, example].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
};

/**
 * Upload zone, processing state, and the permanent per-row record of every
 * import. Rows that could not be used are listed with their row numbers --
 * on record, not in a toast that disappears.
 */
export function ImportPanel({
  eventId,
  eventSlug,
  fields,
  onAddManually,
}: {
  eventId: number;
  eventSlug: string;
  fields: EventField[];
  onAddManually: () => void;
}) {
  const imports = useImports(eventId);
  const upload = useImportRegistrations(eventId);
  const [drag, setDrag] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const running = imports.data?.find((j) => j.status === "STARTED");

  const send = (file: File) => {
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      upload.reset();
      return;
    }
    upload.mutate(file, { onSuccess: (job) => setOpen(job.id) });
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([templateCsv(fields)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${eventSlug || "guest-list"}-import-template.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl bg-card ring-1 ring-border/70 shadow-sm p-4">
        <p className="mb-3 text-[15px] font-medium text-foreground">Import a guest list</p>
        {running ? (
          <div className="rounded-md border border-primary bg-primary/10 px-4 py-6 text-center">
            <Loader2Icon className="text-primary mx-auto size-5 animate-spin" />
            <p className="text-primary mt-3 text-sm font-medium">Processing {running.task_name.replace(/^Import /, "").replace(/ into .*$/, "")}</p>
            <p className="text-muted-foreground mt-1 text-xs">Rows are validated one by one. You can keep working.</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => (e.preventDefault(), setDrag(true))}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) send(f);
            }}
            className={cn(
              "w-full rounded-md border border-dashed px-4 py-6 text-center transition-colors",
              drag ? "border-primary bg-primary/10" : "hover:border-primary hover:bg-primary/5"
            )}
          >
            <UploadIcon className="text-muted-foreground mx-auto mb-2 size-6" />
            <span className="block text-sm font-medium">{upload.isPending ? "Uploading…" : "Drop a CSV or Excel file, or choose one"}</span>
            <span className="text-muted-foreground mt-1.5 block font-mono text-[11px] leading-relaxed">
              full_name · email · phone · role
              {fields.length ? ` · ${fields.map((f) => f.label ?? f.key).join(" · ")}` : ""}
              <br />
              nobody is emailed by an import — Send tickets does that, and records it
            </span>
          </button>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" className={pressable} onClick={downloadTemplate}>
            <DownloadIcon /> Download the template
          </Button>
          <Button type="button" size="sm" variant="outline" className={pressable} onClick={onAddManually}>
            <UserPlusIcon /> Add one guest by hand
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) send(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/70 shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-[15px] font-medium text-foreground">Import record</p>
          <span className="text-muted-foreground font-mono text-[10px]">PERMANENT</span>
        </div>
        {imports.data?.length === 0 ? <p className="text-muted-foreground px-4 py-7 text-center text-sm">Nothing has been imported yet.</p> : null}
        {imports.data?.map((j) => {
          const isOpen = open === j.id;
          const dot = j.status === "FAILED" ? "bg-destructive" : j.status === "STARTED" ? "bg-primary animate-pulse" : j.failed ? "bg-amber-500" : "bg-emerald-500";
          return (
            <div key={j.id} className="border-t first:border-t-0">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : j.id)}
                aria-expanded={isOpen}
                className="hover:bg-muted flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors"
              >
                <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", dot)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs">{j.task_name}</span>
                  <span className="text-muted-foreground block text-xs">{summaryOf(j)}</span>
                </span>
                <span className="text-muted-foreground shrink-0 font-mono text-[11px]">{formatDateTime(j.created_at)}</span>
              </button>
              {isOpen ? (
                <div className="px-4 pb-3">
                  <div className="bg-muted rounded-md p-3">
                    <p className="text-muted-foreground mb-2 font-mono text-[10px] uppercase tracking-[0.08em]">
                      {j.issues.length ? "Rows not imported" : "Every row is on the list"}
                    </p>
                    {j.issues.map((issue, i) => (
                      <p key={i} className="border-t py-1.5 text-xs first:border-t-0">
                        {issue}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

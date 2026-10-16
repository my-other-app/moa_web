"use client";

import * as React from "react";
import { ChevronDownIcon, DownloadIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import {
  Button,
  CardLabel,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FigurePanel,
  cn,
} from "@moa/ui";

import { useImportRegistrations } from "../queries";
import type { EventField, ImportLog } from "../schemas";

const summaryOf = (log: ImportLog) => {
  if (log.status === "FAILED") return `Failed — ${log.issues[0] ?? "the file could not be read"}`;
  if (log.status === "STARTED") return "Processing…";
  return `${log.imported} imported, ${log.failed} ${log.failed === 1 ? "row" : "rows"} not used`;
};

/** "guests.csv" out of "Import guests.csv into …", for a sentence. */
export const importFileName = (log: ImportLog) => log.task_name.replace(/^Import /, "").replace(/ into .*$/, "");

/** A CSV with the columns an import reads, built from the event's own fields, with an example row. */
const templateCsv = (fields: EventField[]) => {
  const extra = fields.map((f) => f.label ?? f.key);
  const header = ["full_name", "email", "phone", "role", ...(extra.length ? ["additional_details_fields", ...extra] : [])];
  const example = ["Ananya Iyer", "ananya@example.com", "9876543210", "attendee", ...(extra.length ? [extra.join(","), ...extra.map(() => "")] : [])];
  return [header, example].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
};

/**
 * Bringing a list in: the file, the columns it is read by, and the template
 * that has them. An import is never the top of the page — the list is — so
 * it opens from the page's Import button, closes once the file is accepted,
 * and the page says while it runs.
 */
export function ImportDialog({
  eventId,
  eventSlug,
  fields,
  open,
  onOpenChange,
  onStarted,
}: {
  eventId: number;
  eventSlug: string;
  fields: EventField[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The import's record, once the file is accepted. */
  onStarted: (jobId: string) => void;
}) {
  const upload = useImportRegistrations(eventId);
  const [drag, setDrag] = React.useState(false);
  const [refused, setRefused] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const send = (file: File) => {
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      setRefused(file.name);
      return;
    }
    setRefused(null);
    upload.mutate(file, {
      onSuccess: (job) => {
        onStarted(job.id);
        onOpenChange(false);
      },
    });
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setRefused(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Import a guest list</DialogTitle>
          <DialogDescription>A CSV or Excel file, one guest a row. Nobody is emailed by an import — Send tickets does that, and records it.</DialogDescription>
        </DialogHeader>

        <button
          type="button"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) send(f);
          }}
          className={cn(
            "w-full rounded-xl border border-dashed px-4 py-8 text-center transition-colors disabled:cursor-wait",
            drag ? "border-brand bg-brand-soft" : "border-line hover:border-brand-line hover:bg-sunken",
          )}
        >
          {upload.isPending ? <Loader2Icon aria-hidden="true" className="text-brand mx-auto mb-2 size-6 animate-spin" /> : <UploadIcon aria-hidden="true" className="text-ink-3 mx-auto mb-2 size-6" />}
          <span className="text-ink block text-[13.5px] font-medium">{upload.isPending ? "Uploading…" : "Drop a CSV or Excel file here, or choose one"}</span>
          <span className="text-ink-3 mt-1 block text-[12px]">.csv, .xlsx or .xls</span>
        </button>
        {refused ? <p className="text-refuse -mt-2 text-[12px]">“{refused}” is not a CSV or Excel file. Save it as one and try again.</p> : null}

        <div className="bg-sunken rounded-xl px-3.5 py-3">
          <p className="eyebrow mb-1.5">Columns it reads</p>
          <p className="text-ink-2 font-mono text-[11.5px] leading-relaxed break-words">
            full_name · email · phone · role
            {fields.length ? ` · ${fields.map((f) => f.label ?? f.key).join(" · ")}` : ""}
          </p>
          <p className="text-ink-3 mt-1.5 text-[11.5px]">The template has these columns, this event&apos;s own questions among them, and an example row.</p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="secondary" size="sm" onClick={downloadTemplate}>
            <DownloadIcon /> Download the template
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>

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
      </DialogContent>
    </Dialog>
  );
}

/**
 * The permanent per-row record of every import. Rows that could not be used
 * are listed with their row numbers — on record, not in a toast that
 * disappears.
 */
export function ImportRecord({ imports, openId, onToggle }: { imports: ImportLog[]; openId: string | null; onToggle: (id: string) => void }) {
  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="border-line-soft flex items-center justify-between gap-2 border-b px-4 py-3">
        <CardLabel>Imports</CardLabel>
        <span className="text-ink-3 text-[11.5px]">kept for good, row by row</span>
      </div>
      <ul>
        {imports.map((j) => {
          const isOpen = openId === j.id;
          const dot = j.status === "FAILED" ? "bg-refuse" : j.status === "STARTED" ? "bg-brand animate-pulse" : j.failed ? "bg-caution" : "bg-admit";
          return (
            <li key={j.id} className="border-line-soft border-t first:border-t-0">
              <button
                type="button"
                onClick={() => onToggle(j.id)}
                aria-expanded={isOpen}
                className={cn("flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors", isOpen ? "bg-sunken/60" : "hover:bg-sunken/40")}
              >
                <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", dot)} />
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate font-mono text-[12px]">{j.task_name}</span>
                  <span className={cn("block text-[12px]", j.status === "FAILED" ? "text-refuse" : "text-ink-3")}>{summaryOf(j)}</span>
                </span>
                <span className="text-ink-3 hidden shrink-0 font-mono text-[11px] sm:block">{formatDateTime(j.created_at)}</span>
                <ChevronDownIcon aria-hidden="true" className={cn("text-ink-3 size-3.5 shrink-0 transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen ? (
                <div className="px-4 pb-3">
                  <div className="bg-sunken rounded-xl px-3.5 py-3">
                    <p className="eyebrow mb-1.5">{j.issues.length ? "Rows not imported" : "Every row is on the list"}</p>
                    {j.issues.map((issue, i) => (
                      <p key={i} className="border-line-soft text-ink-2 border-t py-1.5 text-[12px] first:border-t-0">
                        {issue}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </FigurePanel>
  );
}

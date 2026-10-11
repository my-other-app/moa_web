"use client";

import * as React from "react";
import Link from "next/link";
import { DownloadIcon, FileTextIcon } from "lucide-react";
import { PageHeader, formatDateTime } from "@moa/app-kit";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, EmptyState, InlineAlert, Skeleton, StatusBadge, Switch, cn, toast } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useEventDetail } from "@/features/events";
import { openPdf } from "@/features/idcards";

import { reportPdfUrl } from "../api";
import { useCloseoutSettings, useFigures, useGenerateReport, useReports, useRetention, useRunRetention, useUpdateCloseoutSettings } from "../queries";
import { PREVIEW_LABEL, type CloseoutSettings, type LifecycleStatus, type RetentionStatus } from "../schemas";

const panel = "rounded-2xl bg-card ring-1 ring-border/70 shadow-sm";
const heading = "font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const note = "text-[12px] leading-[1.5] text-muted-foreground";
const control = "h-9 rounded-md border bg-muted/40 px-2.5 text-[13px]";

const STATUS_TONE: Record<LifecycleStatus, "default" | "success" | "warning" | "destructive" | "info"> = { draft: "warning", published: "info", live: "success", closed: "default", archived: "default" };
const STATE_LABEL: Record<RetentionStatus["state"], string> = { pending: "Pending", report_sent: "Report kept", deleted: "Scrubbed", failed: "Failed" };

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className={cn(panel, "p-4")}>
      <p className={heading}>{label}</p>
      <p className="mt-1 text-2xl font-medium tabular-nums">{value}</p>
      <p className={note}>{sub}</p>
    </div>
  );
}

function StatusCard({ eventId, s }: { eventId: number; s: CloseoutSettings }) {
  const update = useUpdateCloseoutSettings(eventId);
  return (
    <section className={cn(panel, "space-y-3 p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={heading}>Status</p>
          <p className={note}>The clock moves an event on its own: published → live at the start, closed after the end, archived once retention has run. Moving it by hand takes it off the clock.</p>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <Switch checked={s.status_clock} onCheckedChange={(on) => update.mutate({ status_clock: on })} aria-label="Status clock" /> On the clock
        </label>
      </div>
      <div className="grid gap-2 md:grid-cols-5" role="radiogroup" aria-label="Status">
        {s.statuses.map((o) => (
          <button key={o.key} type="button" role="radio" aria-checked={s.status === o.key} onClick={() => update.mutate({ status: o.key })} className={cn("rounded-md border px-3 py-2.5 text-left", s.status === o.key ? "border-primary bg-primary/10" : "hover:bg-muted")}>
            <span className={cn("block text-sm font-medium", s.status === o.key && "text-primary")}>{o.label}</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{o.note}</span>
          </button>
        ))}
      </div>
      {s.status === "closed" || s.status === "archived" ? <InlineAlert tone="info" title="Settings are locked">The event&apos;s details, fields and designs are read-only while it is {s.status}. Move it back to Live to change them.</InlineAlert> : null}
      {s.status === "draft" ? <InlineAlert tone="warning" title="A draft refuses check-ins">Nobody can be admitted and no timed email goes out until it is published.</InlineAlert> : null}
    </section>
  );
}

function ReportsCard({ eventId }: { eventId: number }) {
  const reports = useReports(eventId);
  const generate = useGenerateReport(eventId);
  return (
    <section className={cn(panel, "overflow-hidden")}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <div>
          <p className={heading}>Closeout reports</p>
          <p className={note}>Attendance, roles, ways in, merchandise, messages, certificates and ratings, as of the moment it is generated. Kept here; retention emails the latest one to the recipients.</p>
        </div>
        <Button size="sm" variant="outline" disabled={generate.isPending} onClick={() => generate.mutate()} className={pressable}>
          <FileTextIcon /> Generate now
        </Button>
      </div>
      {reports.isPending ? (
        <Skeleton className="m-4 h-16" />
      ) : reports.data?.length ? (
        <ul className="mt-3 divide-y">
          {reports.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[12px]">{r.filename}</div>
                <div className={note}>
                  {formatDateTime(r.generated_at)} · {r.generated_by_name ?? "Retention"}
                  {r.delivered_to.length ? ` · sent to ${r.delivered_to.join(", ")}` : ""}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => openPdf(reportPdfUrl(eventId, r.id))}>
                <DownloadIcon /> PDF
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-[12.5px] text-muted-foreground">No report yet. Generate one any time; the figures are read live from the same tables as the door.</p>
      )}
    </section>
  );
}

function RetentionDialog({ eventId, slug, status, onClose }: { eventId: number; slug: string; status: RetentionStatus; onClose: () => void }) {
  const run = useRunRetention(eventId);
  const [typed, setTyped] = React.useState("");
  const matches = typed.trim() === slug;
  const go = () =>
    run.mutate(typed.trim(), {
      onSuccess: (r) => {
        if (r.state === "deleted") toast.success("Guest data scrubbed", { description: "The report is kept; the registrations stay with the guests' accounts." });
        else toast.warning(r.error ?? r.refusal ?? "Retention did not finish");
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{status.mode === "keep" ? "Scrub the guest data now?" : "Run retention now?"}</DialogTitle>
          <DialogDescription>
            The report is generated first{status.recipients.length ? ` and emailed to ${status.recipients.join(", ")}` : ""}. Only once it is kept does the scrub run. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-[13px]">
          {Object.entries(status.preview).map(([k, n]) => (
            <li key={k} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{PREVIEW_LABEL[k] ?? k}</span>
              <span className="font-mono tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
        <label className="block space-y-1 text-[12px]">
          Type the event slug to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={slug} className={cn(control, "w-full font-mono")} autoComplete="off" />
        </label>
        <div className="flex gap-2">
          <Button variant="destructive" disabled={!matches || run.isPending} onClick={go} className="flex-1">
            {run.isPending ? "Running…" : "Scrub guest data"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RetentionCard({ eventId, slug, s }: { eventId: number; slug: string; s: CloseoutSettings }) {
  const retention = useRetention(eventId);
  const update = useUpdateCloseoutSettings(eventId);
  const [hours, setHours] = React.useState(String(s.retention_hours));
  const [recipients, setRecipients] = React.useState(s.report_recipients.join(", "));
  const [confirm, setConfirm] = React.useState(false);
  const r = retention.data;
  const deleted = r?.state === "deleted";
  const steps: RetentionStatus["state"][] = ["pending", "report_sent", "deleted"];
  const reached = (i: number) => (r ? (r.state === "deleted" ? true : r.state === "report_sent" ? i < 2 : i === 0) : false);
  return (
    <section className={cn(panel, "space-y-4 p-4")}>
      <div>
        <p className={heading}>Guest data</p>
        <p className={note}>Registrations belong to the guests&apos; own accounts and stay, so tickets and certificates keep working in the app. Retention scrubs what the event gathered beyond that: phones captured at the door, answers to its own fields, delivery logs, phone check-in sessions, and walk-up records made at the gate. Contacts can be kept for the club first.</p>
      </div>
      {r ? (
        <ol className="flex flex-wrap items-center gap-2 text-[12.5px]">
          {steps.map((st, i) => (
            <li key={st} className="flex items-center gap-2">
              <span className={cn("rounded-full border px-2.5 py-0.5", reached(i) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}>{STATE_LABEL[st]}</span>
              {i < steps.length - 1 ? <span className="text-muted-foreground">→</span> : null}
            </li>
          ))}
          {r.state === "failed" ? <StatusBadge tone="destructive" label="Failed" /> : null}
        </ol>
      ) : null}
      {r?.state === "failed" && r.last_error ? <InlineAlert tone="destructive" title="The last run failed">{r.last_error} Nothing was scrubbed. Fix the recipients and run again.</InlineAlert> : null}
      {r?.refusal === "NOT_ENDED" && !deleted ? <InlineAlert tone="info" title="Waiting for the event to end">The scheduled run looked and found the event still on. It tries again each minute after {formatDateTime(r.ends_at)}.</InlineAlert> : null}
      {deleted && r?.deleted ? (
        <InlineAlert tone="info" title={`Scrubbed ${r.completed_at ? formatDateTime(r.completed_at) : ""}`}>
          {Object.entries(r.deleted).map(([k, n]) => `${n} ${PREVIEW_LABEL[k] ?? k}`).join(" · ")}
        </InlineAlert>
      ) : null}
      {!deleted ? (
        <>
          <div className="grid gap-2 md:grid-cols-2" role="radiogroup" aria-label="Retention mode">
            {(
              [
                ["keep", "Keep the guest data", "Nothing is scrubbed unless you run it by hand. Closed events are archived a month after they end."],
                ["delete", "Scrub after the event", `The report is generated and emailed, then the data is scrubbed, ${s.retention_hours} hours after the end.`],
              ] as const
            ).map(([key, label, hint]) => (
              <button key={key} type="button" role="radio" aria-checked={s.retention_mode === key} onClick={() => update.mutate({ retention_mode: key })} className={cn("rounded-md border px-3 py-2.5 text-left", s.retention_mode === key ? "border-primary bg-primary/10" : "hover:bg-muted")}>
                <span className={cn("block text-sm font-medium", s.retention_mode === key && "text-primary")}>{label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-[160px_1fr]">
            <label className="space-y-1 text-[12px]">
              Hours after the end
              <input value={hours} inputMode="numeric" onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} onBlur={() => Number(hours) >= 1 && Number(hours) !== s.retention_hours && update.mutate({ retention_hours: Number(hours) })} className={cn(control, "w-full font-mono")} />
            </label>
            <label className="space-y-1 text-[12px]">
              Report recipients <span className="text-muted-foreground">(optional, comma-separated)</span>
              <input value={recipients} onChange={(e) => setRecipients(e.target.value)} onBlur={() => update.mutate({ report_recipients: recipients.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="ops@example.com, chair@example.com" className={cn(control, "w-full")} />
            </label>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={s.keep_contacts} onChange={(e) => update.mutate({ keep_contacts: e.target.checked })} className="mt-0.5 size-4 accent-primary" />
            <span>
              <span className="block text-[13px]">Keep contacts for the club</span>
              <span className={note}>Name, email, phone, role and whether they attended are copied out as the list is scrubbed{r ? ` (${r.contacts_kept} kept so far)` : ""}.</span>
            </span>
          </label>
          {r ? (
            <p className={note}>
              {s.retention_mode === "delete" ? `Scheduled for ${formatDateTime(r.run_at)}` : "Not scheduled"}
              {r.attempts ? ` · ${r.attempts} ${r.attempts === 1 ? "attempt" : "attempts"}` : ""}
            </p>
          ) : null}
          <Button variant="destructive" className="w-full" onClick={() => setConfirm(true)} disabled={!r}>
            {s.retention_mode === "keep" ? "Scrub the guest data now" : "Run retention now"}
          </Button>
        </>
      ) : null}
      {confirm && r ? <RetentionDialog eventId={eventId} slug={slug} status={r} onClose={() => setConfirm(false)} /> : null}
    </section>
  );
}

/** Closing the event: its status, the report that sums it up, and what happens to the guest data. */
export function CloseoutPage({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const settings = useCloseoutSettings(eventId);
  const figures = useFigures(eventId);
  const f = figures.data;
  return (
    <div className="space-y-6">
      <PageHeader title="Closeout" description="Where the event stands, the report that sums it up, and what happens to the guest data afterwards." action={settings.data ? <StatusBadge tone={STATUS_TONE[settings.data.status]} label={settings.data.statuses.find((o) => o.key === settings.data?.status)?.label ?? settings.data.status} /> : null} />
      {f ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile label="Registered" value={f.registered} sub={`${f.walk_ins} registered at the door`} />
          <Tile label="Checked in" value={f.checked_in} sub={`${f.turnout_pct}% turnout · ${f.no_shows} no-shows`} />
          <Tile label="Afterwards" value={f.certificates_issued} sub={`certificates issued · ${f.cards_printed} cards printed`} />
          <Tile label="Rating" value={f.rating_count ? f.rating_avg.toFixed(1) : "—"} sub={f.rating_count ? `from ${f.rating_count}` : "none yet"} />
        </div>
      ) : null}
      {settings.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : settings.isError ? (
        <EmptyState tone="muted" title="Could not load the closeout" description={settings.error.message} />
      ) : (
        <>
          <StatusCard eventId={eventId} s={settings.data} />
          <ReportsCard eventId={eventId} />
          <RetentionCard eventId={eventId} slug={event.data?.slug ?? ""} s={settings.data} />
        </>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, MailIcon, SendIcon } from "lucide-react";
import { PageHeader, formatDateTime } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Pagination,
  Skeleton,
  StatusBadge,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useEventDetail } from "@/features/events";

import { useAudienceCount, useEmailContext, useMessage, useMessages, useSendMessage } from "../queries";
import { AUDIENCE_WHO, emailAttachmentsSchema, emailAudienceSchema, type EmailAttachments, type EmailAudience, type Message } from "../schemas";
import { Busy, TemplateField, Toggle, ui, useDebounced } from "./kit";
import { AudienceFields } from "./panels";

const CELL = "px-4 py-3 text-left align-middle";

const statusOf = (m: Message) => {
  if (m.status === "SENDING") return <StatusBadge tone="info" label="Sending…" />;
  if (m.failedCount && !m.sentCount) return <StatusBadge tone="destructive" label="Failed" />;
  if (m.failedCount) return <StatusBadge tone="warning" label="Partly sent" />;
  return <StatusBadge tone="success" label="Sent" />;
};

const whoLabel = (m: Message) => `${AUDIENCE_WHO.find((w) => w.value === m.audience)?.label ?? m.audience}${m.roles.length ? ` · ${m.roles.join(", ")}` : ""}`;

function Composer({ eventId }: { eventId: number }) {
  const ctx = useEmailContext({ kind: "event", eventId });
  const send = useSendMessage(eventId);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [audience, setAudience] = React.useState<EmailAudience>(() => emailAudienceSchema.parse({}));
  const [attachments, setAttachments] = React.useState<EmailAttachments>(() => emailAttachmentsSchema.parse({}));
  const [clientRef, setClientRef] = React.useState<string>(() => crypto.randomUUID());
  const [confirm, setConfirm] = React.useState(false);
  const count = useAudienceCount(eventId, audience, confirm);
  const tokens = ctx.data?.tokens ?? [];
  const samples = ctx.data?.sampleValues ?? {};
  const ready = subject.trim().length > 0 && body.trim().length > 0;
  const n = count.data?.recipients;

  return (
    <section className={cn(ui.panel, "space-y-3 p-4")}>
      <div>
        <p className="text-xl font-medium text-[var(--swatch-ink)]">Write to the guests</p>
        <p className={ui.note}>A plain email in the event&apos;s design. Tokens fill in per guest; **bold**, _italic_ and [links](https://…) work. A blank line starts a new paragraph.</p>
      </div>
      <TemplateField id="m-subject" label="Subject" value={subject} single onChange={setSubject} tokens={tokens} samples={samples} placeholder="A change to {{event_name}}" />
      <TemplateField id="m-body" label="Message" value={body} rows={8} onChange={setBody} tokens={tokens} samples={samples} placeholder="Hi {{first_name}}, …" />
      <div className="grid gap-3 md:grid-cols-2">
        <AudienceFields audience={audience} onChange={setAudience} eventId={eventId} />
        <div className="space-y-2">
          <span className={ui.label}>Attach</span>
          <Toggle id="m-ticket" label="The guest's ticket PDF" checked={attachments.ticketPdf} onChange={(ticketPdf) => setAttachments((a) => ({ ...a, ticketPdf }))} />
          <Toggle id="m-cert" label="The guest's certificate PDF" checked={attachments.certificatePdf} onChange={(certificatePdf) => setAttachments((a) => ({ ...a, certificatePdf }))} note="Only guests who hold one get it." />
        </div>
      </div>
      <div className="flex justify-end">
        <Button className={pressable} disabled={!ready || send.isPending} onClick={() => setConfirm(true)}>
          <SendIcon /> Send
        </Button>
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send “{subject.trim()}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {n === undefined ? "Counting who this reaches…" : `${n} ${n === 1 ? "guest" : "guests"} with an email address get it`}
              {count.data?.withoutEmail ? `; ${count.data.withoutEmail} have no address and are skipped` : ""}. It cannot be recalled once it leaves.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              disabled={send.isPending || n === 0}
              onClick={(e) => {
                e.preventDefault();
                send.mutate(
                  { subject: subject.trim(), body, audience, attachments, clientRef },
                  {
                    onSuccess: () => {
                      setConfirm(false);
                      setSubject("");
                      setBody("");
                      setClientRef(crypto.randomUUID());
                    },
                  }
                );
              }}
            >
              <Busy on={send.isPending} /> {n ? `Send to ${n}` : "Send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function MessageDialog({ eventId, message, onClose }: { eventId: number; message: Message | null; onClose: () => void }) {
  const [problem, setProblem] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const settled = useDebounced(search.trim(), 300);
  const detail = useMessage(eventId, message?.id ?? null, { problem, search: settled || undefined, page: 1, pageSize: 200 });
  const m = detail.data?.message ?? message;
  return (
    <Dialog open={message !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m?.subject}</DialogTitle>
          <DialogDescription>
            {m ? `${whoLabel(m)} · ${formatDateTime(m.createdAt)} · ${m.sentCount} sent, ${m.failedCount} failed, ${m.skippedCount} skipped of ${m.recipients}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="Search guests" placeholder="Search a guest" value={search} onChange={(e) => setSearch(e.target.value)} className={cn(ui.control, "h-8 max-w-xs text-[12.5px]")} />
          <button type="button" aria-pressed={problem} onClick={() => setProblem((p) => !p)} className={cn("rounded-full border px-2.5 py-1 text-[12px]", problem ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
            Problems only
          </button>
        </div>
        {detail.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : detail.data?.deliveries.length ? (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              <tr>
                <th className="py-1.5 text-left font-medium">Guest</th>
                <th className="py-1.5 text-left font-medium">Address</th>
                <th className="py-1.5 text-left font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {detail.data.deliveries.map((d) => (
                <tr key={d.registrationId} className="border-t">
                  <td className="py-1.5 pr-2">{d.name}</td>
                  <td className="py-1.5 pr-2 font-mono text-[11.5px] text-muted-foreground">{d.email ?? "—"}</td>
                  <td className="py-1.5">
                    <StatusBadge tone={d.status === "sent" ? "success" : d.status === "failed" ? "destructive" : d.status === "skipped" ? "warning" : "info"} label={d.status} />
                    {d.error ? <span className={cn(ui.note, "ml-1.5")}>{d.error}</span> : null}
                    {d.sentAt ? <span className={cn(ui.note, "ml-1.5")}>{formatDateTime(d.sentAt)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={ui.note}>{problem ? "No problems." : "Nobody matched."}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Write to the guests now, and see every message that went before. */
export function MessagesPage({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const list = useMessages(eventId, page, pageSize);
  const [open, setOpen] = React.useState<Message | null>(null);
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={`/events/${eventId}`}>
          <ArrowLeftIcon /> {event.data?.name ?? "Back to event"}
        </Link>
      </Button>
      <PageHeader
        title="Messages"
        description="A one-off email to the guests, and the record of every email that went out: journey emails, timers and notes like this one."
        action={
          <Button variant="outline" asChild className={pressable}>
            <Link href={`/events/${eventId}/emails`}>
              <MailIcon /> Designed emails
            </Link>
          </Button>
        }
      />
      <Composer eventId={eventId} />
      <section className="space-y-3">
        <p className={ui.heading}>Sent</p>
        {list.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : list.isError ? (
          <EmptyState tone="muted" title="Could not load the messages" description={list.error.message} />
        ) : !list.data.items.length ? (
          <EmptyState tone="muted" title="Nothing sent yet" description="Journey emails, timers and notes you write here all show up once they go out." />
        ) : (
          <div className="overflow-hidden rounded-lg border-[0.5px] border-[var(--swatch-grey)]">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  <th className={cn(CELL, "font-medium")}>When</th>
                  <th className={cn(CELL, "font-medium")}>Subject</th>
                  <th className={cn(CELL, "font-medium")}>To</th>
                  <th className={cn(CELL, "font-medium")}>Reached</th>
                  <th className={cn(CELL, "font-medium")}>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((m) => (
                  <tr key={m.id} className="cursor-pointer border-t-[0.5px] border-[var(--swatch-grey)] hover:bg-muted/40" onClick={() => setOpen(m)}>
                    <td className={cn(CELL, "whitespace-nowrap text-muted-foreground")}>{formatDateTime(m.createdAt)}</td>
                    <td className={CELL}>
                      <span className="font-medium">{m.subject}</span>
                      <span className={cn(ui.note, "block")}>
                        {m.kind === "TEMPLATE" ? (m.scheduled ? "Journey email, by the timer" : "Journey email") : "Written here"}
                        {m.createdByName ? ` · ${m.createdByName}` : ""}
                      </span>
                    </td>
                    <td className={CELL}>{whoLabel(m)}</td>
                    <td className={cn(CELL, "tabular-nums")}>
                      {m.sentCount} of {m.recipients}
                      {m.failedCount ? <span className="text-destructive"> · {m.failedCount} failed</span> : null}
                      {m.skippedCount ? <span className="text-muted-foreground"> · {m.skippedCount} skipped</span> : null}
                    </td>
                    <td className={CELL}>{statusOf(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pages > 1 || total > pageSize ? (
              <div className="border-t-[0.5px] border-[var(--swatch-grey)] px-4 py-2">
                <Pagination page={page} pageCount={pages} onPageChange={setPage} pageSize={pageSize} onPageSizeChange={(n) => (setPageSize(n), setPage(1))} />
              </div>
            ) : null}
          </div>
        )}
      </section>
      <MessageDialog eventId={eventId} message={open} onClose={() => setOpen(null)} />
    </div>
  );
}

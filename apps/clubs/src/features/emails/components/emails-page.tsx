"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CopyIcon, MailIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton,
  StatusBadge,
  Switch,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useEventDetail } from "@/features/events";

import { useCreateTemplate, useDeleteTemplate, useDuplicateTemplate, useSaveTemplate, useTemplates } from "../queries";
import { STAGE_META, audienceSummary, blankTemplate, fieldsOf, triggerSummary, type EmailTemplate, type JourneyStage, type Message } from "../schemas";
import { Busy, ui } from "./kit";
import { SendTemplateDialog } from "./send-dialog";

const outcome = (m: Message | null | undefined) => {
  if (!m) return null;
  if (m.status === "SENDING") return <StatusBadge tone="info" label="Sending…" />;
  if (m.failedCount && !m.sentCount) return <StatusBadge tone="destructive" label={`${m.failedCount} failed`} />;
  if (m.failedCount) return <StatusBadge tone="warning" label={`${m.sentCount} sent · ${m.failedCount} failed`} />;
  return <StatusBadge tone="success" label={`${m.sentCount} sent`} />;
};

function LastLine({ m }: { m: Message | null | undefined }) {
  if (!m) return <p className={ui.note}>Not sent yet.</p>;
  return (
    <p className={cn(ui.note, "flex flex-wrap items-center gap-1.5")}>
      {outcome(m)}
      <span>
        {m.scheduled ? "by the timer" : "by hand"} · {formatDateTime(m.createdAt)}
      </span>
    </p>
  );
}

function StageCard({
  eventId,
  stage,
  onSend,
}: {
  eventId: number;
  stage: JourneyStage;
  onSend: (t: EmailTemplate) => void;
}) {
  const t = stage.template;
  const save = useSaveTemplate({ kind: "event", eventId });
  const meta = STAGE_META[t.stage];
  return (
    <div className={cn(ui.panel, "flex flex-col gap-2 p-4", !t.enabled && "opacity-70")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={ui.heading}>{meta.label}</p>
          <p className="truncate text-[15px] font-medium text-[var(--swatch-ink)]">{t.name}</p>
          <p className={cn(ui.note, "truncate")}>{t.subject}</p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {save.isPending ? <Busy on /> : t.enabled ? "On" : "Off"}
          <Switch checked={t.enabled} aria-label={`${meta.label} switched ${t.enabled ? "on" : "off"}`} onCheckedChange={(enabled) => save.mutate({ templateId: t.id, fields: { ...fieldsOf(t), enabled } })} />
        </label>
      </div>
      <p className={ui.note}>{meta.note}</p>
      <p className="text-[12px]">
        <span className="text-muted-foreground">Goes out:</span> {triggerSummary(t.trigger)}
        {stage.dueAt ? <span className="text-muted-foreground"> · due {formatDateTime(stage.dueAt)}</span> : null}
      </p>
      <p className="text-[12px]">
        <span className="text-muted-foreground">To:</span> {audienceSummary(t.audience)}
        {t.attachments.ticketPdf ? " · with the ticket" : ""}
        {t.attachments.certificatePdf ? " · with the certificate" : ""}
      </p>
      <LastLine m={stage.lastMessage} />
      <div className="mt-auto flex gap-2 pt-1">
        <Button variant="outline" size="sm" asChild className={pressable}>
          <Link href={`/events/${eventId}/emails/${t.id}`}>
            <PencilIcon /> Edit
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => onSend(t)} className={pressable}>
          <SendIcon /> Send now
        </Button>
      </div>
    </div>
  );
}

/**
 * The event's emails: the four every guest journey has, then any others
 * the club writes. Each is sent from the event's design and remembers
 * who it reached.
 */
export function EmailsPage({ eventId }: { eventId: number }) {
  const router = useRouter();
  const event = useEventDetail(eventId);
  const list = useTemplates(eventId);
  const scope = { kind: "event" as const, eventId };
  const create = useCreateTemplate(scope);
  const duplicate = useDuplicateTemplate(scope);
  const remove = useDeleteTemplate(scope);
  const [sending, setSending] = React.useState<EmailTemplate | null>(null);
  const [deleting, setDeleting] = React.useState<EmailTemplate | null>(null);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={`/events/${eventId}`}>
          <ArrowLeftIcon /> {event.data?.name ?? "Back to event"}
        </Link>
      </Button>
      <PageHeader
        title="Emails"
        description="The four emails every guest journey has, and any others you write. Each is designed once, sent to its audience, and remembers who it reached."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild className={pressable}>
              <Link href={`/events/${eventId}/messages`}>
                <MailIcon /> Messages
              </Link>
            </Button>
            <Button
              className={pressable}
              disabled={create.isPending}
              onClick={() => create.mutate({ fields: blankTemplate() }, { onSuccess: (t) => router.push(`/events/${eventId}/emails/${t.id}`) })}
            >
              <Busy on={create.isPending} />
              {create.isPending ? null : <PlusIcon />} New email
            </Button>
          </div>
        }
      />

      {list.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : list.isError ? (
        <EmptyState tone="muted" title="Could not load the emails" description={list.error.message} />
      ) : (
        <>
          <section className="space-y-3">
            <p className={ui.heading}>The journey</p>
            <div className="grid gap-3 md:grid-cols-2">
              {list.data.journey.map((s) => (
                <StageCard key={s.stage} eventId={eventId} stage={s} onSend={setSending} />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className={ui.heading}>Other emails</p>
            {list.data.custom.length ? (
              <div className="overflow-hidden rounded-lg border-[0.5px] border-[var(--swatch-grey)]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Email</th>
                      <th className="px-4 py-2.5 text-left font-medium">To</th>
                      <th className="px-4 py-2.5 text-left font-medium">Goes out</th>
                      <th className="px-4 py-2.5 text-left font-medium">Last sent</th>
                      <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.custom.map((t) => (
                      <tr key={t.id} className="border-t-[0.5px] border-[var(--swatch-grey)]">
                        <td className="px-4 py-3">
                          <Link href={`/events/${eventId}/emails/${t.id}`} className="font-medium hover:underline">
                            {t.name}
                          </Link>
                          <p className={cn(ui.note, "truncate")}>{t.subject}</p>
                        </td>
                        <td className="px-4 py-3">{audienceSummary(t.audience)}</td>
                        <td className="px-4 py-3">
                          {triggerSummary(t.trigger)}
                          {!t.enabled ? <StatusBadge tone="default" label="Off" /> : null}
                        </td>
                        <td className="px-4 py-3">
                          <LastLine m={null} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${t.name}`}>
                                <MoreHorizontalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => router.push(`/events/${eventId}/emails/${t.id}`)}>
                                <PencilIcon /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setSending(t)}>
                                <SendIcon /> Send now…
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => duplicate.mutate(t.id)}>
                                <CopyIcon /> Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(t)}>
                                <Trash2Icon /> Delete…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={ui.note}>Nothing beyond the journey yet. A sponsor&apos;s note, a schedule change, a thank-you: write one with New email.</p>
            )}
          </section>
        </>
      )}

      <SendTemplateDialog eventId={eventId} template={sending} open={sending !== null} onOpenChange={(o) => !o && setSending(null)} />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Messages already sent from it stay in the history. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

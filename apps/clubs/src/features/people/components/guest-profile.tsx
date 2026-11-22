"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, Loader2Icon, MailIcon, MessageSquareIcon, PencilIcon, PrinterIcon, RotateCcwIcon, Trash2Icon, Undo2Icon, XIcon } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Skeleton,
  StatusBadge,
  cn,
} from "@moa/ui";
import { formatDateTime } from "@moa/app-kit";

import { AskPanel, registrationRef, requestRef } from "@/features/answers";
import { useUndoCheckIn } from "@/features/doors/queries";
import { useSendOneTicket } from "@/features/deliveries/queries";
import { useEventDetail } from "@/features/events";
import { cardPdfUrl, openPdf } from "@/features/idcards";
import { PrintChoice, createPrintRequest } from "@/features/printing";
import { useRetryPrintRequest } from "@/features/printing/queries";
import { AttendeeFormDialog, RemoveAttendeeDialog, eventFieldSchema, useMarkAttendance, useRegistration, type EventField } from "@/features/registrations";
import { DeclineDialog, RequestEditDialog, useBulkDecision, useConfirmRequest, type RegistrationRequest } from "@/features/requests";

import { cardInFlight, profileKey, useGuestProfile } from "../queries";
import type { GuestProfileData, ProfilePrint } from "../schemas";
import { PRINT_TONE, PRINT_WORDS, STAGE_TONE, STAGE_WORDS } from "../words";
import { AnswersSection, CertificateSection, ContactSection, Copyable, EventSection, PaymentSection, PrintLine, TicketSection } from "./sections";
import { Timeline } from "./timeline";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** The event's questions, to correct a person's answers against. */
function useEventFields(eventId: number): EventField[] {
  const event = useEventDetail(eventId);
  return React.useMemo(() => {
    const raw = (event.data as { additional_details?: unknown } | undefined)?.additional_details;
    return Array.isArray(raw) ? raw.flatMap((f) => (eventFieldSchema.safeParse(f).success ? [eventFieldSchema.parse(f)] : [])) : [];
  }, [event.data]);
}

/** The Review row this person is, as the dialogs that confirm, decline and correct a request take it. */
function asRequest(p: GuestProfileData): RegistrationRequest {
  const stage = p.status.stage;
  const first = [...p.timeline].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())[0];
  return {
    id: p.request_id ?? "",
    status: stage === "confirmed" ? "approved" : stage === "declined" ? "declined" : stage === "cancelled" ? "withdrawn" : "pending",
    full_name: p.person.full_name,
    email: p.person.email,
    phone: p.person.phone,
    ticket_type: null,
    answers: Object.fromEntries(p.answers.filter((a) => !a.missing).map((a) => [a.key, a.value])),
    submitted_at: first?.at ?? "",
    decided_at: null,
    decided_by: null,
    decline_note: null,
    registration_id: p.registration_id,
    pay_by: null,
    discount_code: null,
    amount: null,
    whatsapp_opt_in: false,
    missing_answers: p.answers.filter((a) => a.missing).map((a) => a.key),
  };
}

/** The card that matters now: one still on its way, else the newest. */
export function latestPrint(prints: readonly ProfilePrint[]): ProfilePrint | null {
  const byTime = [...prints].sort((a, b) => (new Date(b.at ?? 0).getTime() || 0) - (new Date(a.at ?? 0).getTime() || 0));
  return byTime.find((x) => x.status === "queued" || x.status === "printing") ?? byTime[0] ?? null;
}

type Dialog = "print" | "edit" | "decline" | "ask" | "remove" | null;

function Chips({ p }: { p: GuestProfileData }) {
  const s = p.status;
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0" aria-label="Status">
      <li>
        <StatusBadge tone={STAGE_TONE[s.stage]} label={STAGE_WORDS[s.stage]} />
      </li>
      <li>{s.checked_in ? <StatusBadge tone="success" label="Checked in" /> : <StatusBadge tone="default" label="Not yet in" />}</li>
      {s.card_printed ? (
        <li>
          <StatusBadge tone="success" label="Card printed" />
        </li>
      ) : null}
      {s.certificate === "issued" ? (
        <li>
          <StatusBadge tone="success" label="Certificate issued" />
        </li>
      ) : s.certificate === "revoked" ? (
        <li>
          <StatusBadge tone="destructive" label="Certificate revoked" />
        </li>
      ) : null}
      {s.paid === true ? (
        <li>
          <StatusBadge tone="success" label="Paid" />
        </li>
      ) : s.paid === false ? (
        <li>
          <StatusBadge tone="warning" label="Unpaid" />
        </li>
      ) : null}
      {s.ticket_revoked ? (
        <li>
          <StatusBadge tone="destructive" label="Ticket revoked" />
        </li>
      ) : null}
      {s.email_bounced ? (
        <li>
          <StatusBadge tone="destructive" label="Email bounced" />
        </li>
      ) : null}
    </ul>
  );
}

/** Where the newest card is, live: queued, printing, printed or failed, with a retry. */
function CardStatus({ pr, onRetry, retrying }: { pr: ProfilePrint; onRetry: (() => void) | null; retrying: boolean }) {
  return (
    <div role="status" aria-live="polite" className="border-line-soft flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2">
      <span className="eyebrow">ID card</span>
      <StatusBadge tone={PRINT_TONE[pr.status]} label={PRINT_WORDS[pr.status]} />
      <span className="text-ink-3 min-w-0 flex-1 text-[12px]">
        {[pr.printer ? `on ${pr.printer}` : null, pr.at ? formatDateTime(pr.at) : null].filter(Boolean).join(" · ")}
        {pr.error ? <span className="text-refuse block">{pr.error}</span> : null}
      </span>
      {onRetry && (pr.status === "failed" || pr.status === "cancelled") ? (
        <Button type="button" size="sm" variant="secondary" disabled={retrying} onClick={onRetry}>
          {retrying ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />} Retry
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One person in full: who they are, where they stand, everything on their
 * record, and everything that happened to them — with what can be done about
 * it in one bar. Shown in a side sheet from the lists, or as a page.
 */
export function GuestProfile({
  eventId,
  personRef,
  variant = "page",
  onGone,
}: {
  eventId: number;
  /** A registration's id, or a registration request's id. */
  personRef: string;
  variant?: "sheet" | "page";
  /** Called after they were taken off the list. */
  onGone?: () => void;
}) {
  const query = useGuestProfile(eventId, personRef);
  const p = query.data;
  const qc = useQueryClient();
  const refresh = React.useCallback(() => void qc.invalidateQueries({ queryKey: profileKey(eventId, personRef) }), [qc, eventId, personRef]);
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const closeDialog = (open: boolean) => {
    if (!open) {
      setDialog(null);
      refresh();
    }
  };

  const event = useEventDetail(eventId);
  const fields = useEventFields(eventId);
  const checkIn = useMarkAttendance(eventId);
  const undo = useUndoCheckIn(eventId);
  const resend = useSendOneTicket(eventId);
  const confirm = useConfirmRequest(eventId);
  const decide = useBulkDecision(eventId);
  const retry = useRetryPrintRequest(eventId);
  // A registration is corrected against its own record; fetched only when Edit is pressed.
  const editingRegistration = dialog === "edit" && p?.kind === "registration";
  const registration = useRegistration(eventId, editingRegistration ? (p?.registration_id ?? null) : null);

  const Heading = variant === "sheet" ? SheetTitle : "h1";

  if (query.isPending) {
    return (
      <div className="grid gap-3 p-5" aria-busy="true">
        <Heading className="sr-only">Guest</Heading>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-10" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    );
  }
  if (query.isError || !p) {
    return (
      <div className="grid gap-3 p-5">
        <Heading className="m-0 text-[17px] font-semibold">Guest</Heading>
        <p className="text-ink-2 m-0 text-[13px]" role="alert">
          This guest could not be loaded. They may have been taken off the list a moment ago.
        </p>
        <div>
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const a = p.actions;
  const name = p.person.full_name;
  const regId = p.registration_id;
  const latest = latestPrint(p.prints);
  const stationReady = a.can_send_to_station && a.printers_online > 0;
  const printHere = () => {
    if (!regId) return;
    openPdf(cardPdfUrl(eventId, regId, { source: "manual", record: true }));
    window.setTimeout(refresh, 1500);
  };
  const printAction = () => (stationReady ? setDialog("print") : printHere());
  const anyAction = Object.entries(a).some(([k, v]) => k.startsWith("can_") && v === true);
  const busy = checkIn.isPending || undo.isPending || resend.isPending || confirm.isPending || decide.running;
  const askRef = p.kind === "request" && p.request_id ? requestRef(p.request_id) : regId ? registrationRef(regId) : null;
  const missingKeys = p.answers.filter((x) => x.missing).map((x) => x.key);
  const subtitle = [p.ticket?.type_name, p.person.institution].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-line-soft grid gap-3 border-b px-5 pt-5 pr-12 pb-4">
        <div className="flex items-start gap-3">
          <Avatar size="lg">
            {p.person.photo_url ? <AvatarImage src={p.person.photo_url} alt="" /> : null}
            <AvatarFallback aria-hidden="true">{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <Heading className="m-0 text-[18px] leading-[1.25] font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">{name}</Heading>
            {variant === "sheet" ? (
              <SheetDescription className="text-ink-3 m-0 mt-0.5 text-[12.5px]">{subtitle || "Everything about this person, and what happened to them."}</SheetDescription>
            ) : (
              <p className="text-ink-3 m-0 mt-0.5 text-[12.5px]">{subtitle || "Everything about this person, and what happened to them."}</p>
            )}
            <div className="text-ink-2 mt-1.5 grid gap-0.5 text-[12.5px]">
              {p.person.email ? <Copyable value={p.person.email} mono label="email" /> : null}
              {p.person.phone ? <Copyable value={p.person.phone} mono label="phone" /> : null}
            </div>
          </div>
        </div>
        <Chips p={p} />
        {anyAction ? (
          <div role="group" aria-label={`Actions for ${name}`} className="flex flex-wrap items-center gap-2">
            {a.can_print ? (
              <Button type="button" size="sm" onClick={printAction}>
                <PrinterIcon /> {p.prints.length || p.status.card_printed ? "Print another card" : "Print ID card"}
              </Button>
            ) : null}
            {a.can_resend_ticket && regId ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => resend.mutate(regId, { onSuccess: refresh })}>
                <MailIcon /> Send ticket again
              </Button>
            ) : null}
            {a.can_check_in && regId ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => checkIn.mutate(regId, { onSuccess: refresh })}>
                <CheckIcon /> Check in
              </Button>
            ) : null}
            {a.can_undo_check_in && regId ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => undo.mutate(regId, { onSuccess: refresh })}>
                <Undo2Icon /> Undo check-in
              </Button>
            ) : null}
            {a.can_confirm && p.request_id ? (
              <Button type="button" size="sm" disabled={busy} onClick={() => confirm.mutate(asRequest(p), { onSuccess: refresh })}>
                {confirm.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Confirm
              </Button>
            ) : null}
            {a.can_decline && p.request_id ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setDialog("decline")}>
                <XIcon /> Decline
              </Button>
            ) : null}
            {a.can_edit ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setDialog("edit")}>
                <PencilIcon /> Edit
              </Button>
            ) : null}
            {a.can_ask_missing && askRef ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setDialog("ask")}>
                <MessageSquareIcon /> Ask for missing answers
              </Button>
            ) : null}
            {a.can_remove && regId ? (
              <>
                <span className="flex-1" />
                <Button type="button" size="sm" variant="ghost" danger onClick={() => setDialog("remove")}>
                  <Trash2Icon /> Remove
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        {latest ? <CardStatus pr={latest} retrying={retry.isPending} onRetry={latest.id ? () => retry.mutate(latest.id!, { onSuccess: refresh }) : a.can_print ? printAction : null} /> : null}
      </header>

      <div className={cn("grid min-h-0 flex-1 content-start gap-3 px-5 py-4", variant === "sheet" && "overflow-y-auto")}>
        <ContactSection p={p} />
        <AnswersSection p={p} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TicketSection p={p} />
          <PaymentSection p={p} />
          <EventSection p={p} />
          <CertificateSection p={p} />
        </div>
        <section aria-labelledby={`timeline-${personRef}`} className="border-line-soft rounded-xl border px-3.5 py-3">
          <h2 id={`timeline-${personRef}`} className="eyebrow m-0 mb-3">
            Timeline
          </h2>
          <Timeline rows={p.timeline} truncated={p.timeline_truncated} />
        </section>
        {cardInFlight(p) ? <p className="text-ink-3 m-0 text-[11.5px]">This page updates every few seconds while a card is on its way to the printer.</p> : null}
      </div>

      {dialog === "print" && regId ? (
        <PrintChoice
          name={name}
          open
          onClose={() => closeDialog(false)}
          send={(override) => createPrintRequest(eventId, { registration_id: regId, override })}
          onLocal={printHere}
        />
      ) : null}
      {editingRegistration && registration.data ? (
        <AttendeeFormDialog key={registration.data.id} eventId={eventId} fields={fields} existing={registration.data} open onOpenChange={closeDialog} />
      ) : null}
      {dialog === "edit" && p.kind === "request" ? <RequestEditDialog eventId={eventId} fields={fields} request={asRequest(p)} open onOpenChange={closeDialog} /> : null}
      {dialog === "decline" && p.request_id ? (
        <DeclineDialog
          count={1}
          name={name}
          running={decide.running}
          progress={decide.progress}
          onClose={() => closeDialog(false)}
          onDecline={({ notify, note }) => {
            void decide.run({ kind: "decline", ids: [p.request_id!], notify, note }, name).finally(() => closeDialog(false));
          }}
        />
      ) : null}
      {a.can_ask_missing && askRef ? (
        <AskPanel
          eventId={eventId}
          target={dialog === "ask" ? { refs: [askRef], preselect: missingKeys, who: name } : null}
          onOpenChange={closeDialog}
        />
      ) : null}
      {a.can_remove && regId ? (
        <RemoveAttendeeDialog
          eventId={eventId}
          eventSlug={event.data?.slug ?? ""}
          attendee={{ id: regId, name }}
          open={dialog === "remove"}
          onOpenChange={(o) => {
            closeDialog(o);
            if (!o) onGone?.();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The profile in a side sheet over whichever list it was opened from: wide on
 * a desktop, the whole screen on a phone. Open while `personRef` is set.
 */
export function GuestProfileSheet({ eventId, personRef, onOpenChange }: { eventId: number; personRef: string | null; onOpenChange: (ref: string | null) => void }) {
  return (
    <Sheet open={personRef !== null} onOpenChange={(o) => !o && onOpenChange(null)}>
      <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[780px]">
        {personRef ? <GuestProfile eventId={eventId} personRef={personRef} variant="sheet" /> : null}
      </SheetContent>
    </Sheet>
  );
}

/** The same view as a page, at `/events/{eventId}/people/{ref}`. */
export function GuestProfilePage({ eventId, personRef }: { eventId: number; personRef: string }) {
  return (
    <div className="border-line-soft mx-auto flex w-full max-w-[860px] flex-col rounded-2xl border">
      <GuestProfile eventId={eventId} personRef={personRef} variant="page" />
    </div>
  );
}

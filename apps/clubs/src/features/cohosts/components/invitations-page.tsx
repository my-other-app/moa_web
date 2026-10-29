"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDaysIcon, CheckIcon, HandshakeIcon, Loader2Icon, MapPinIcon, XIcon } from "lucide-react";
import { PosterFrame, formatDateTime, pickImage, posterSizes, relativeTime } from "@moa/app-kit";
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
  Chip,
  EmptyState,
  FigurePanel,
  Notice,
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
} from "@moa/ui";

import { useAccess } from "@/features/access";

import { useAnswerInvitation, useInvitations } from "../queries";
import { COHOST_STATUS_LABEL, COHOST_STATUS_TONE, canAnswerInvites, expiresText, splitInvitations, type Invitation } from "../schemas";
import { ClubLogo, HostedBy } from "./club-marks";

type View = "pending" | "all";

/**
 * The club's co-host invitations (contract §4, §11): other clubs asking it
 * to run one of their events with them. Waiting ones first, each with
 * Accept and Decline for the owner and admins; the rest of the team reads
 * them. "Show past" adds the answered, cancelled and expired ones.
 */
export function InvitationsPage() {
  const [view, setView] = React.useState<View>("pending");
  const q = useInvitations(view);
  const access = useAccess();
  const may = canAnswerInvites(access.role);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Invitations</h1>
          <p className="text-ink-3 mt-1 max-w-[70ch] text-[12.5px]">
            Clubs that asked yours to co-host one of their events. Once you accept, your team manages the event with theirs and it shows on your club&apos;s page.
          </p>
        </div>
        <Chip active={view === "all"} onClick={() => setView(view === "all" ? "pending" : "all")}>
          Show past
        </Chip>
      </div>

      {!may && access.known ? (
        <Notice tone="neutral">Only your club&apos;s owner or an admin can accept or decline invitations. You&apos;re signed in as {access.roleLabel.toLowerCase()}.</Notice>
      ) : null}

      {q.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-[140px]" />
          <Skeleton className="h-[140px]" />
        </div>
      ) : q.isError ? (
        <Notice tone="refuse">{q.error instanceof Error && q.error.message ? q.error.message : "Your invitations could not be read."}</Notice>
      ) : q.data === null ? (
        <Notice tone="neutral">Co-hosting isn&apos;t available here yet.</Notice>
      ) : (
        <InvitationList items={q.data.items} view={view} may={may} />
      )}
    </div>
  );
}

function InvitationList({ items, view, may }: { items: Invitation[]; view: View; may: boolean }) {
  const { pending, past } = splitInvitations(items);
  if (items.length === 0) {
    return (
      <FigurePanel className="p-8">
        <EmptyState
          tone="muted"
          icon={<HandshakeIcon className="size-6" />}
          title={view === "pending" ? "No invitations waiting" : "No invitations yet"}
          description="When another club invites yours to co-host one of its events, it shows here, and your owner and admins get an email."
        />
      </FigurePanel>
    );
  }
  return (
    <div className="grid gap-5">
      {pending.length ? (
        <section aria-label="Waiting for an answer" className="grid gap-3">
          <h2 className="eyebrow">Waiting for an answer · {pending.length}</h2>
          <ul className="grid gap-3">
            {pending.map((i) => (
              <InvitationCard key={i.id} invitation={i} may={may} />
            ))}
          </ul>
        </section>
      ) : view === "pending" ? null : (
        <p className="text-ink-3 m-0 text-[12.5px]">Nothing is waiting for an answer.</p>
      )}
      {past.length ? (
        <section aria-label="Past invitations" className="grid gap-3">
          <h2 className="eyebrow">Past</h2>
          <ul className="grid gap-3">
            {past.map((i) => (
              <InvitationCard key={i.id} invitation={i} may={false} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function InvitationCard({ invitation: i, may }: { invitation: Invitation; may: boolean }) {
  const answer = useAnswerInvitation();
  const [asking, setAsking] = React.useState<"accept" | "decline" | null>(null);
  const [now] = React.useState(() => new Date());
  const e = i.event;
  const pending = i.status === "invited";
  const where = e.is_online ? "Online" : e.location_name;
  const busy = answer.isPending;
  return (
    <li className="bg-surface border-line-soft shadow-card flex flex-wrap gap-4 rounded-[var(--radius-card)] border p-4" data-testid={`invitation-${i.id}`}>
      <PosterFrame
        src={pickImage(e.poster, posterSizes(64))}
        width={64}
        className="border-line-soft grid w-16 place-items-center rounded-xl border"
        fallback={<CalendarDaysIcon aria-hidden="true" className="text-ink-3 size-5" />}
      />
      <div className="min-w-0 flex-1 basis-[260px]">
        <div className="text-ink-2 flex flex-wrap items-center gap-2 text-[12.5px]">
          <ClubLogo club={i.host} size={20} />
          <span>
            <span className="text-ink font-medium">{i.host.name}</span> invited you to co-host
          </span>
          {!pending ? <StatusBadge tone={COHOST_STATUS_TONE[i.status]} label={COHOST_STATUS_LABEL[i.status]} /> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {i.status === "accepted" ? (
            <Link href={`/events/${e.id}`} className="text-ink text-[16px] font-semibold tracking-[-0.01em] hover:underline">
              {e.name}
            </Link>
          ) : (
            <span className="text-ink text-[16px] font-semibold tracking-[-0.01em]">{e.name}</span>
          )}
        </div>
        <div className="text-ink-2 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]">
          {e.event_datetime ? (
            <span className="flex items-center gap-1">
              <CalendarDaysIcon className="size-3.5" />
              {formatDateTime(e.event_datetime)}
            </span>
          ) : null}
          {where ? (
            <span className="flex min-w-0 items-center gap-1">
              <MapPinIcon className="size-3.5 shrink-0" />
              <span className="truncate">{where}</span>
            </span>
          ) : null}
          {e.cohosts.length ? <HostedBy host={i.host} cohosts={e.cohosts} className="text-ink-3 text-[12px]" /> : null}
        </div>
        {i.note ? <p className="text-ink-2 border-line mt-2 mb-0 border-l-2 pl-2.5 text-[13px] leading-[1.5] italic">“{i.note}”</p> : null}
        <div className="text-ink-3 mt-2 text-[11.5px]">
          {i.invited_at ? `Sent ${relativeTime(i.invited_at, now)}` : "Sent"}
          {i.invited_by ? ` by ${i.invited_by}` : ""}
          {pending && i.expires_at ? ` · ${expiresText(i.expires_at, now)}` : ""}
          {!pending && (i.responded_at ?? i.ended_at) ? ` · ${COHOST_STATUS_LABEL[i.status].toLowerCase()} ${relativeTime((i.responded_at ?? i.ended_at)!, now)}` : ""}
        </div>
      </div>
      {pending ? (
        <div className="flex shrink-0 flex-wrap items-start gap-2 self-center">
          {may ? (
            <>
              <Button variant="secondary" onClick={() => setAsking("decline")} disabled={busy}>
                <XIcon /> Decline
              </Button>
              <Button onClick={() => setAsking("accept")} disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Accept
              </Button>
            </>
          ) : (
            <span className="text-ink-3 max-w-[200px] text-[12px]">Your owner or an admin answers this.</span>
          )}
        </div>
      ) : i.status === "accepted" ? (
        <div className="shrink-0 self-center">
          <Link href={`/events/${e.id}`} className="btn btn-secondary btn-sm">
            Open the event
          </Link>
        </div>
      ) : null}
      <AlertDialog open={asking !== null} onOpenChange={(open) => (!open ? setAsking(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{asking === "accept" ? `Co-host ${e.name}?` : `Decline ${i.host.name}'s invitation?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {asking === "accept"
                ? `Your team can then manage ${e.name} with ${i.host.name}'s, each member with their own role. It shows on your club's page, and your followers hear about it once it's published. Refunds, cancelling and deleting stay with ${i.host.name}.`
                : `${i.host.name} is told. They can invite you again later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: asking === "decline" ? "destructive" : "primary" }))}
              onClick={() => asking && answer.mutate({ id: i.id, answer: asking })}
            >
              {asking === "accept" ? "Accept and co-host" : "Decline"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HandshakeIcon, Loader2Icon, LogOutIcon, SendIcon, UserMinusIcon, XIcon } from "lucide-react";
import { relativeTime } from "@moa/app-kit";
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
  CardLabel,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  Notice,
  SearchField,
  Skeleton,
  StatusBadge,
  Textarea,
  buttonVariants,
  cn,
} from "@moa/ui";

import { useAccess } from "@/features/access";
import { useEventDetail } from "@/features/events/queries";

import { useCohostSearch, useCohosts, useEndCohost, useInviteCohost, useLeaveEvent } from "../queries";
import {
  COHOST_STATUS_LABEL,
  COHOST_STATUS_TONE,
  NOTE_MAX,
  PICK_LABEL,
  SEARCH_MIN,
  canLeaveEvent,
  inviteHistory,
  orderInvites,
  searchTerm,
  slotsText,
  type ClubPick,
  type CohostInvite,
  type CohostListing,
} from "../schemas";
import { ClubLogo } from "./club-marks";

/**
 * An event's Co-hosts tab (contract §3, §11).
 *
 * The host's owner and admins invite clubs here (up to five live at once),
 * cancel an invite nobody has answered and remove a co-host. Everybody else
 * who can open the event reads the same list: the host's editors and door
 * staff, and each co-host's team. A co-host's owner and admins can leave.
 */
export function CohostsPanel({ eventId }: { eventId: number }) {
  const q = useCohosts(eventId);
  const event = useEventDetail(eventId);
  const eventName = event.data?.name ?? "this event";

  if (q.isPending) return <Skeleton className="h-[320px]" />;
  if (q.isError) {
    return <Notice tone="refuse">{q.error instanceof Error && q.error.message ? q.error.message : "The co-hosts could not be read. Try again in a moment."}</Notice>;
  }
  if (q.data === null) {
    return <Notice tone="neutral">Co-hosting isn&apos;t available here yet.</Notice>;
  }

  const l = q.data;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
      <CohostList eventId={eventId} listing={l} />
      <div className="grid gap-4">
        {l.viewer_role === "cohost" ? (
          <CohostSide eventId={eventId} eventName={eventName} listing={l} />
        ) : l.can_manage ? (
          <InviteBox eventId={eventId} eventName={eventName} listing={l} />
        ) : (
          <FigurePanel className="p-4">
            <CardLabel className="mb-2">Invite a club</CardLabel>
            <p className="text-ink-2 m-0 text-[13px] leading-[1.55]">Only your club&apos;s owner or an admin can invite or remove co-hosts. You can see who co-hosts and who is invited.</p>
          </FigurePanel>
        )}
        <HowItWorks cohost={l.viewer_role === "cohost"} hostName={l.host.name} />
      </div>
    </div>
  );
}

// ─── The list ───────────────────────────────────────────────────────────

function CohostList({ eventId, listing }: { eventId: number; listing: CohostListing }) {
  const { live, past } = orderInvites(listing.items);
  return (
    <FigurePanel className="p-0">
      <div className="border-line-soft flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <CardLabel>Host and co-hosts</CardLabel>
        <span className={cn("text-[12px] tabular-nums", listing.slots_left === 0 ? "text-caution font-medium" : "text-ink-3")} data-testid="cohost-slots">
          {slotsText(listing.slots_left, listing.limit)}
        </span>
      </div>
      <ul aria-label="Host and co-hosts" className="divide-line-soft divide-y">
        <li className="flex items-center gap-3 px-4 py-3">
          <ClubLogo club={listing.host} size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-ink truncate text-[13.5px] font-semibold">{listing.host.name}</div>
            {listing.host.slug ? <div className="text-ink-3 truncate text-[12px]">@{listing.host.slug}</div> : null}
          </div>
          <span className="tag tag-accent">Host</span>
        </li>
        {live.map((i) => (
          <InviteRow key={i.id} eventId={eventId} invite={i} canManage={listing.can_manage} />
        ))}
      </ul>
      {live.length === 0 ? (
        <div className="border-line-soft border-t px-4 py-6">
          <EmptyState
            tone="muted"
            icon={<HandshakeIcon className="size-5" />}
            title="No co-hosts yet"
            description={listing.can_manage ? "Invite a club to run this event with you. It shows on both clubs' pages once they accept." : "Nobody co-hosts this event yet."}
          />
        </div>
      ) : null}
      {past.length ? (
        <>
          <div className="border-line-soft text-ink-3 border-t px-4 pt-3 pb-1 font-mono text-[10px] tracking-[0.09em] uppercase">Earlier</div>
          <ul aria-label="Earlier invites" className="divide-line-soft divide-y">
            {past.map((i) => (
              <InviteRow key={i.id} eventId={eventId} invite={i} canManage={false} />
            ))}
          </ul>
        </>
      ) : null}
    </FigurePanel>
  );
}

function InviteRow({ eventId, invite, canManage }: { eventId: number; invite: CohostInvite; canManage: boolean }) {
  const end = useEndCohost(eventId);
  const [confirm, setConfirm] = React.useState(false);
  const [now] = React.useState(() => new Date());
  const history = inviteHistory(invite, now, (iso) => relativeTime(iso, now));
  const pending = invite.status === "invited";
  const action = canManage && (pending || invite.status === "accepted");
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3" data-testid={`cohost-${invite.id}`}>
      <ClubLogo club={invite.club} size={36} />
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink truncate text-[13.5px] font-semibold">{invite.club.name}</span>
          <StatusBadge tone={COHOST_STATUS_TONE[invite.status]} label={COHOST_STATUS_LABEL[invite.status]} />
        </div>
        <div className="text-ink-3 mt-0.5 text-[12px]">
          {invite.club.slug ? `@${invite.club.slug}` : null}
          {invite.club.slug && history ? " · " : null}
          {history}
        </div>
        {invite.note ? <p className="text-ink-2 border-line mt-1.5 mb-0 border-l-2 pl-2.5 text-[12.5px] leading-[1.5] italic">“{invite.note}”</p> : null}
      </div>
      {action ? (
        <>
          <Button variant="secondary" size="sm" danger onClick={() => setConfirm(true)} disabled={end.isPending}>
            {pending ? <XIcon /> : <UserMinusIcon />}
            {pending ? "Cancel invite" : "Remove"}
          </Button>
          <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{pending ? `Cancel the invite to ${invite.club.name}?` : `Remove ${invite.club.name} as a co-host?`}</AlertDialogTitle>
                <AlertDialogDescription>
                  {pending
                    ? "They can no longer accept it. You can invite them again later."
                    : "Their team loses this event straight away, and they are told. You can invite them again later."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{pending ? "Keep the invite" : "Keep them"}</AlertDialogCancel>
                <AlertDialogAction className={cn(buttonVariants({ variant: "destructive" }))} onClick={() => end.mutate(invite.id)}>
                  {pending ? "Cancel invite" : "Remove co-host"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </li>
  );
}

// ─── Inviting ───────────────────────────────────────────────────────────

function InviteBox({ eventId, eventName, listing }: { eventId: number; eventName: string; listing: CohostListing }) {
  const [raw, setRaw] = React.useState("");
  const [picked, setPicked] = React.useState<ClubPick | null>(null);
  const full = listing.slots_left <= 0;
  const term = searchTerm(raw);
  const search = useCohostSearch(eventId, raw, !full);
  const results = search.data ?? [];

  return (
    <FigurePanel className="p-4">
      <CardLabel className="mb-3">Invite a club</CardLabel>
      {full ? (
        <Notice tone="caution" tag="Full">
          All {listing.limit} places are taken. Cancel an invite or remove a co-host to invite another club.
        </Notice>
      ) : (
        <>
          <SearchField value={raw} onChange={setRaw} label="Search clubs by name or handle" placeholder="Club name or @handle" />
          <div className="mt-3" aria-live="polite">
            {term.length < SEARCH_MIN ? (
              <p className="text-ink-3 m-0 text-[12px]">Type two letters or more of a club&apos;s name or handle. Only verified clubs show.</p>
            ) : search.isPending ? (
              <div className="grid gap-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : search.isError ? (
              <p className="text-refuse m-0 text-[12.5px]">{search.error instanceof Error ? search.error.message : "The search didn't go through."}</p>
            ) : results.length === 0 ? (
              <p className="text-ink-3 m-0 text-[12.5px]">No verified club matches “{term}”.</p>
            ) : (
              <ul aria-label="Clubs found" className="border-line-soft divide-line-soft divide-y rounded-xl border">
                {results.map((c) => (
                  <li key={c.club_id} className="flex items-center gap-2.5 px-3 py-2">
                    <ClubLogo club={c} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="text-ink truncate text-[13px] font-medium">{c.name}</div>
                      {c.slug ? <div className="text-ink-3 truncate text-[11.5px]">@{c.slug}</div> : null}
                    </div>
                    {c.state === "invitable" ? (
                      <Button size="sm" variant="secondary" aria-label={`Invite ${c.name}`} onClick={() => setPicked(c)}>
                        Invite
                      </Button>
                    ) : (
                      <span className="text-ink-3 text-[12px]">{PICK_LABEL[c.state]}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      {picked ? <InviteDialog eventId={eventId} eventName={eventName} club={picked} onClose={(sent) => { setPicked(null); if (sent) setRaw(""); }} /> : null}
    </FigurePanel>
  );
}

function InviteDialog({ eventId, eventName, club, onClose }: { eventId: number; eventName: string; club: ClubPick; onClose: (sent: boolean) => void }) {
  const invite = useInviteCohost(eventId);
  const [note, setNote] = React.useState("");
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    invite.mutate({ club_id: club.club_id, name: club.name, ...(note.trim() ? { note: note.trim() } : {}) }, { onSuccess: () => onClose(true) });
  };
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose(false) : undefined)}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={send} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Invite {club.name} to co-host</DialogTitle>
            <DialogDescription>
              Their owner and admins are told on their dashboard and by email. If they accept, their team manages {eventName} with yours, and it shows on
              both clubs&apos; pages. The invite expires in 14 days, or when the event ends.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2.5">
            <ClubLogo club={club} size={36} />
            <div className="min-w-0">
              <div className="text-ink truncate text-[13.5px] font-semibold">{club.name}</div>
              {club.slug ? <div className="text-ink-3 truncate text-[12px]">@{club.slug}</div> : null}
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="cohost-note" className="text-ink text-[12.5px] font-medium">
              A note with the invite <span className="text-ink-3 font-normal">· optional</span>
            </label>
            <Textarea id="cohost-note" rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Want to run this together?" />
            <span className="text-ink-3 justify-self-end text-[11px] tabular-nums">
              {note.length}/{NOTE_MAX}
            </span>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── A co-host's side ───────────────────────────────────────────────────

function CohostSide({ eventId, eventName, listing }: { eventId: number; eventName: string; listing: CohostListing }) {
  const router = useRouter();
  const access = useAccess();
  const leave = useLeaveEvent(eventId);
  const [confirm, setConfirm] = React.useState(false);
  const host = listing.host.name;
  const may = canLeaveEvent(access.role);
  return (
    <FigurePanel className="p-4">
      <CardLabel className="mb-2">You co-host this event</CardLabel>
      <p className="text-ink-2 m-0 text-[13px] leading-[1.55]">
        {host} hosts it and chooses its co-hosts. Your team manages it with theirs; refunds, cancelling and deleting stay with {host}.
      </p>
      <div className="border-line-soft mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        {may ? (
          <>
            <span className="text-ink-3 text-[12px]">Your team loses this event when you leave.</span>
            <Button variant="secondary" size="sm" danger onClick={() => setConfirm(true)} disabled={leave.isPending}>
              <LogOutIcon /> Leave this event
            </Button>
          </>
        ) : (
          <span className="text-ink-3 text-[12px]">Only your club&apos;s owner or an admin can leave this event.</span>
        )}
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {eventName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your team loses this event straight away, and it comes off your club&apos;s page. {host} is told, and can invite you again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() =>
                void leave.mutateAsync().then(
                  () => router.replace("/events"),
                  () => undefined,
                )
              }
            >
              Leave event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FigurePanel>
  );
}

/** What co-hosting means, in four lines, beside the list. */
function HowItWorks({ cohost, hostName }: { cohost: boolean; hostName: string }) {
  return (
    <FigurePanel className="p-4">
      <CardLabel className="mb-2">How co-hosting works</CardLabel>
      <ul className="text-ink-2 m-0 grid list-disc gap-1.5 pl-4 text-[12.5px] leading-[1.5]">
        <li>A co-host&apos;s team manages the event like the host&apos;s own: each member with their own role.</li>
        <li>The event shows on every co-host&apos;s club page, and their followers hear about it.</li>
        <li>
          Paid tickets go through {cohost ? `${hostName}'s` : "your"} payments. Refunds, cancelling, deleting and duplicating stay with {cohost ? hostName : "you"}.
        </li>
        <li>Up to five clubs at once, invited or co-hosting. An invite nobody answers expires after 14 days.</li>
      </ul>
    </FigurePanel>
  );
}
